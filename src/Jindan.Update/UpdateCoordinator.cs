using System.Text.Json;
using Jindan.ModuleHost;

namespace Jindan.Update;

public sealed class ApplicationLease : IDisposable
{
    private readonly FileStream stream;
    private ApplicationLease(FileStream stream) { this.stream = stream; }
    public static ApplicationLease Acquire(string installationRoot, bool allowPendingUpdate = false)
    {
        Directory.CreateDirectory(installationRoot);
        ModuleCatalog.RejectReparse(installationRoot);
        var path = Path.Combine(installationRoot, ".jindan.application.lock");
        if (File.Exists(path)) ModuleCatalog.RejectReparse(path);
        try
        {
            var stream = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            try
            {
                var journal = ModuleCatalog.SafePath(installationRoot, ".updates/journal.json");
                if (!allowPendingUpdate && File.Exists(journal))
                {
                    if (new FileInfo(journal).Length > 1024 * 1024) throw new PackageException("RECOVERY_REQUIRED", "Update journal requires recovery before application start.");
                    using var parsed = JsonDocument.Parse(File.ReadAllBytes(journal));
                    if (!parsed.RootElement.TryGetProperty("stage", out var stage) || stage.GetString() is not ("committed" or "rolled-back")) throw new PackageException("RECOVERY_REQUIRED", "Update journal requires recovery before application start.");
                }
                return new(stream);
            }
            catch { stream.Dispose(); throw; }
        }
        catch (IOException) { throw new PackageException("APP_RUNNING_OR_UPDATING", "Application or another update owns this installation lease."); }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException) { throw new PackageException("RECOVERY_REQUIRED", "Update journal requires recovery before application start."); }
    }
    public void Dispose() => stream.Dispose();
}
public interface IDataSchemaMigration
{
    int FromSchema { get; }
    int ToSchema { get; }
    Task ApplyAsync(string userDataDirectory, CancellationToken cancellationToken);
}
public sealed record PatchRequest(string InstallationRoot, string ModuleId, string CandidateDirectory, string ExpectedVersion, string PatchId);
public sealed record PatchResult(string PatchId, string ModuleId, string BeforeVersion, string AfterVersion, string Status, string BeforeManifestSha256, string AfterManifestSha256);
public sealed record UpdateJournal
{
    public string PatchId { get; init; } = "";
    public string ModuleId { get; init; } = "";
    public string Stage { get; init; } = "";
    public string BeforeVersion { get; init; } = "";
    public string AfterVersion { get; init; } = "";
    public string BeforeManifestSha256 { get; init; } = "";
    public string AfterManifestSha256 { get; init; } = "";
    public bool DataSnapshot { get; init; }
    public string? DataAfterFingerprint { get; init; }
    public string? DataSnapshotManifestSha256 { get; init; }
    public RestorePlan? Restore { get; init; }
}
public sealed partial class UpdateCoordinator(ModuleTrustPolicy trust, int hostContractMajor = 1)
{
    private readonly ModuleTrustPolicy rollbackTrust = trust;
    private readonly int rollbackHost = hostContractMajor;
    private static string StateRoot(string root) => Path.Combine(root, ".updates");
    private static string JournalPath(string root) => Path.Combine(StateRoot(root), "journal.json");
    private static string PackagePath(string root, string moduleId) => ModuleCatalog.SafePath(root, "modules/" + moduleId);
    private static void Identifier(string input) { if (string.IsNullOrEmpty(input) || input.Length > 80 || !char.IsAsciiLetterLower(input[0]) || input.Any(c => !char.IsAsciiLetterLower(c) && !char.IsAsciiDigit(c) && c != '-' && c != '.')) throw new PackageException("IDENTIFIER_INVALID", "Update identity is invalid."); }
    private static void AtomicJson<T>(string path, T value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try { using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { JsonSerializer.Serialize(output, value, ModuleCatalog.JsonOptions); output.Flush(true); } File.Move(temp, path, true); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    private static UpdateJournal? ReadJournal(string root)
    {
        if (Directory.Exists(StateRoot(root))) ModuleCatalog.RejectReparse(StateRoot(root));
        var path = JournalPath(root);
        if (!File.Exists(path)) return null;
        ModuleCatalog.RejectReparse(path);
        if (new FileInfo(path).Length > 1024 * 1024) throw new PackageException("JOURNAL_INVALID", "Update journal exceeds its limit.");
        try
        {
            var bytes = File.ReadAllBytes(path); using var parsed = JsonDocument.Parse(bytes); UniqueJournalProperties(parsed.RootElement);
            var journal = JsonSerializer.Deserialize<UpdateJournal>(bytes, ModuleCatalog.JsonOptions) ?? throw new JsonException();
            Identifier(journal.ModuleId); Identifier(journal.PatchId);
            static bool Sha(string? v) => v is { Length: 64 } && v.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
            if (!Sha(journal.BeforeManifestSha256) || !Sha(journal.AfterManifestSha256) || !Version.TryParse(journal.BeforeVersion, out _) || !Version.TryParse(journal.AfterVersion, out _)) throw new JsonException();
            var stages = new[] { "prepared", "old-renamed", "candidate-promoted", "health-passed", "committed", "rolled-back", "health-cleanup-pending", "restore-prepared", "restore-data-displace-intent", "restore-data-displaced", "restore-data-promote-intent", "restore-data-promoted", "restore-module-displace-intent", "restore-module-displaced", "restore-module-promote-intent", "restore-module-promoted", "restore-before-commit" };
            if (!stages.Contains(journal.Stage, StringComparer.Ordinal) || journal.Stage.StartsWith("restore-", StringComparison.Ordinal) && journal.Restore is null) throw new JsonException();
            if (!journal.DataSnapshot && (journal.DataAfterFingerprint is not null || journal.DataSnapshotManifestSha256 is not null)) throw new JsonException();
            if (journal.DataSnapshotManifestSha256 is not null && !Sha(journal.DataSnapshotManifestSha256) || journal.DataAfterFingerprint is not null && !Sha(journal.DataAfterFingerprint)) throw new JsonException();
            if (journal.Restore is { } plan)
            {
                if (journal.Stage != "rolled-back" && !journal.Stage.StartsWith("restore-", StringComparison.Ordinal)) throw new JsonException();
                if (plan.ModuleStaging is null || plan.ModuleDisplaced is null || !plan.ModuleStaging.StartsWith("restore-module-", StringComparison.Ordinal) || !plan.ModuleDisplaced.StartsWith("restore-module-displaced-", StringComparison.Ordinal)) throw new JsonException();
                if (plan.ModuleOriginalIdentity != "absent" && plan.ModuleOriginalIdentity != journal.BeforeManifestSha256 && plan.ModuleOriginalIdentity != journal.AfterManifestSha256) throw new JsonException();
                if (journal.DataSnapshot)
                {
                    if (plan.DataStaging is null || plan.DataDisplaced is null || !plan.DataStaging.StartsWith("restore-data-", StringComparison.Ordinal) || !plan.DataDisplaced.StartsWith("restore-data-displaced-", StringComparison.Ordinal) || plan.DataOriginalIdentity != "absent" && !Sha(plan.DataOriginalIdentity) || !Sha(plan.DataDesiredIdentity)) throw new JsonException();
                }
                else if (plan.DataStaging is not null || plan.DataDisplaced is not null || plan.DataOriginalIdentity is not null || plan.DataDesiredIdentity is not null) throw new JsonException();
                var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var name in new[] { plan.ModuleStaging, plan.ModuleDisplaced, plan.DataStaging, plan.DataDisplaced }.Where(n => n is not null)) { Identifier(name!); if (!names.Add(name!)) throw new JsonException(); }
            }
            return journal;
        }
        catch (Exception ex) when (ex is JsonException or PackageException) { throw new PackageException("JOURNAL_INVALID", "Update journal cannot be recovered automatically."); }
    }
    private static void UniqueJournalProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object) { var names = new HashSet<string>(StringComparer.Ordinal); foreach (var p in element.EnumerateObject()) { if (!names.Add(p.Name)) throw new JsonException(); UniqueJournalProperties(p.Value); } }
        else if (element.ValueKind == JsonValueKind.Array) foreach (var item in element.EnumerateArray()) UniqueJournalProperties(item);
    }
    private static void CopyTree(string from, string to)
    {
        Directory.CreateDirectory(to); ModuleCatalog.RejectReparse(from); ModuleCatalog.RejectReparse(to);
        foreach (var source in Directory.EnumerateFileSystemEntries(from)) { ModuleCatalog.RejectReparse(source); var target = ModuleCatalog.SafePath(to, Path.GetFileName(source)); if (Directory.Exists(source)) CopyTree(source, target); else File.Copy(source, target, false); }
    }
    private static string Slot(string root, UpdateJournal journal, string name) => ModuleCatalog.SafePath(root, ".updates/" + journal.PatchId + "/" + name);
    private static void CheckWritablePackage(string directory)
    {
        foreach (var file in ModuleCatalog.EnumerateSafeFiles(directory)) using (new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
    }
    private static string TreeFingerprint(string directory)
    {
        if (!Directory.Exists(directory)) return "absent";
        var entries = new List<string>();
        void Collect(string folder) { ModuleCatalog.RejectReparse(folder); foreach (var path in Directory.EnumerateFileSystemEntries(folder)) { ModuleCatalog.RejectReparse(path); var relative = Path.GetRelativePath(directory, path).Replace('\\', '/'); if (Directory.Exists(path)) { entries.Add("directory:" + relative); Collect(path); } else entries.Add("file:" + relative + ":" + ModuleCatalog.Hash(path)); } }
        Collect(directory); entries.Sort(StringComparer.Ordinal);
        return Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(string.Join('\n', entries))));
    }
    public Task RecoverInterruptedAsync(string installationRoot, CancellationToken cancellationToken = default, Action<string>? durableStageObserver = null)
    {
        cancellationToken.ThrowIfCancellationRequested(); var root = Path.GetFullPath(installationRoot);
        using var lease = ApplicationLease.Acquire(root, allowPendingUpdate: true); var journal = ReadJournal(root);
        if (journal is not null && journal.Stage is not ("committed" or "rolled-back")) Restore(root, journal, durableStageObserver);
        return Task.CompletedTask;
    }
    public Task RollbackLastAsync(string installationRoot, CancellationToken cancellationToken = default, Action<string>? durableStageObserver = null)
    {
        cancellationToken.ThrowIfCancellationRequested(); var root = Path.GetFullPath(installationRoot);
        using var lease = ApplicationLease.Acquire(root, allowPendingUpdate: true); var journal = ReadJournal(root) ?? throw new PackageException("ROLLBACK_MISSING", "No applied transaction exists.");
        if (journal.Stage != "committed") throw new PackageException("ROLLBACK_STATE", "Only the latest committed package can be rolled back explicitly.");
        if (journal.DataSnapshot && TreeFingerprint(Path.Combine(root, "data")) != journal.DataAfterFingerprint) throw new PackageException("DATA_CHANGED", "User data changed after migration; automatic schema downgrade is blocked.");
        Restore(root, journal, durableStageObserver); return Task.CompletedTask;
    }
    public async Task<PatchResult> ApplyAsync(PatchRequest request, Func<string, CancellationToken, Task<bool>> healthCheck, IDataSchemaMigration? migration = null, TimeSpan? healthTimeout = null, Action<string>? durableStageObserver = null, CancellationToken cancellationToken = default, IReadOnlyList<string>? dependencyDirectories = null)
    {
        ArgumentNullException.ThrowIfNull(healthCheck); Identifier(request.ModuleId); Identifier(request.PatchId);
        if (healthTimeout is { } configuredTimeout && (configuredTimeout <= TimeSpan.Zero || configuredTimeout > TimeSpan.FromMinutes(10))) throw new PackageException("TIMEOUT_INVALID", "Health timeout must be positive and at most ten minutes.");
        var root = Path.GetFullPath(request.InstallationRoot); using var lease = ApplicationLease.Acquire(root, allowPendingUpdate: true);
        Directory.CreateDirectory(StateRoot(root)); ModuleCatalog.RejectReparse(StateRoot(root));
        var prior = ReadJournal(root);
        if (prior is not null && prior.Stage is not ("committed" or "rolled-back")) throw new PackageException("RECOVERY_REQUIRED", "An interrupted transaction requires recovery before applying another patch.");
        var ledgerPath = Path.Combine(StateRoot(root), "applied.json");
        if (File.Exists(ledgerPath)) { ModuleCatalog.RejectReparse(ledgerPath); if (new FileInfo(ledgerPath).Length > 1024 * 1024) throw new PackageException("LEDGER_INVALID", "Patch ledger exceeds its limit."); }
        var applied = File.Exists(ledgerPath) ? JsonSerializer.Deserialize<string[]>(File.ReadAllBytes(ledgerPath)) ?? throw new PackageException("LEDGER_INVALID", "Patch ledger is invalid.") : [];
        if (applied.Length > 10000 || applied.Distinct(StringComparer.Ordinal).Count() != applied.Length) throw new PackageException("LEDGER_INVALID", "Patch ledger identities are invalid.");
        foreach (var id in applied) Identifier(id);
        if (applied.Contains(request.PatchId, StringComparer.Ordinal)) throw new PackageException("PATCH_ALREADY_APPLIED", "Patch identity was already committed.");
        var current = ModuleCatalog.Verify(PackagePath(root, request.ModuleId), rollbackTrust, rollbackHost);
        var candidate = ModuleCatalog.Verify(request.CandidateDirectory, rollbackTrust, rollbackHost);
        if (candidate.Manifest.ModuleId != request.ModuleId || current.Manifest.ModuleId != request.ModuleId) throw new PackageException("MODULE_MISMATCH", "Patch targets another module identity.");
        if (candidate.Manifest.Dependencies.Length > 0)
        {
            if (dependencyDirectories is null) throw new PackageException("DEPENDENCY_MISSING", "Patch dependencies require an explicit trusted inventory.");
            var dependencies = ModuleCatalog.VerifyInventory(dependencyDirectories.Prepend(candidate.Directory), rollbackTrust, rollbackHost);
            if (dependencies.Errors.Count > 0 || !dependencies.Modules.Any(m => m.Manifest.ModuleId == candidate.Manifest.ModuleId)) throw new PackageException("DEPENDENCY_MISSING", "Patch dependencies are missing or invalid.");
        }
        if (current.Manifest.Version != request.ExpectedVersion) throw new PackageException("STALE_VERSION", "Installed module changed since patch selection.");
        if (Version.Parse(candidate.Manifest.Version) <= Version.Parse(current.Manifest.Version)) throw new PackageException("VERSION_INVALID", "Patch must advance its module version.");
        var changesSchema = current.Manifest.DataSchemaVersion != candidate.Manifest.DataSchemaVersion;
        var workspaceLocation = WorkspaceLocation.ReadForUpdate(root, changesSchema);
        if (changesSchema && File.Exists(Path.Combine(root, WorkspaceLocation.DescriptorName)) && !Directory.Exists(workspaceLocation.DataRoot)) throw new PackageException("WORKSPACE_DATA_MISSING", "Registered workspace data is absent; restore or review its location before schema migration.");
        if (changesSchema && (migration is null || migration.FromSchema != current.Manifest.DataSchemaVersion || migration.ToSchema != candidate.Manifest.DataSchemaVersion)) throw new PackageException("MIGRATION_REQUIRED", "An explicit schema migration and snapshot restoration are required.");
        CheckWritablePackage(current.Directory); cancellationToken.ThrowIfCancellationRequested();
        var journal = new UpdateJournal { PatchId = request.PatchId, ModuleId = request.ModuleId, Stage = "prepared", BeforeVersion = current.Manifest.Version, AfterVersion = candidate.Manifest.Version, BeforeManifestSha256 = current.ManifestSha256, AfterManifestSha256 = candidate.ManifestSha256, DataSnapshot = changesSchema };
        var transactionDirectory = Path.GetDirectoryName(Slot(root, journal, "staged"))!;
        if (Directory.Exists(transactionDirectory)) throw new PackageException("PATCH_DIRECTORY_EXISTS", "Patch staging directory already exists.");
        var staged = Slot(root, journal, "staged"); CopyTree(candidate.Directory, staged);
        var stagedChecked = ModuleCatalog.Verify(staged, rollbackTrust, rollbackHost);
        if (stagedChecked.ManifestSha256 != candidate.ManifestSha256) throw new PackageException("STAGING_CHANGED", "Staged package differs from the approved candidate.");
        if (changesSchema)
        {
            var data = Path.Combine(root, "data"); Directory.CreateDirectory(data);
            journal = journal with { DataSnapshotManifestSha256 = DataSnapshot.Publish(data, Slot(root, journal, "data-before"), SnapshotBinding(root, journal), cancellationToken, durableStageObserver) };
        }
        AtomicJson(JournalPath(root), journal); durableStageObserver?.Invoke(journal.Stage);
        try
        {
            Directory.Move(current.Directory, Slot(root, journal, "previous"));
            journal = journal with { Stage = "old-renamed" }; AtomicJson(JournalPath(root), journal); durableStageObserver?.Invoke(journal.Stage);
            Directory.Move(staged, current.Directory);
            journal = journal with { Stage = "candidate-promoted" }; AtomicJson(JournalPath(root), journal); durableStageObserver?.Invoke(journal.Stage);
            if (changesSchema) await migration!.ApplyAsync(Path.Combine(root, "data"), cancellationToken);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(healthTimeout ?? TimeSpan.FromSeconds(20));
            // Cancellation bounds the wait; also await the owner's cleanup before any rollback touches DLLs.
            var healthTask = healthCheck(current.Directory, timeout.Token);
            bool healthy;
            try { healthy = await healthTask.WaitAsync(timeout.Token); }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested)
            {
                try { await healthTask.WaitAsync(TimeSpan.FromSeconds(5)); }
                catch (TimeoutException) when (!healthTask.IsCompleted) { throw new PackageException("HEALTH_CLEANUP_PENDING", "Health owner did not confirm process cleanup; application remains stopped pending explicit recovery."); }
                catch { /* Completed cancellation/fault confirms that the health owner's cleanup returned. */ }
                throw;
            }
            if (!healthy) throw new PackageException("HEALTH_FAILED", "New package failed its health check.");
            journal = journal with { Stage = "health-passed", DataAfterFingerprint = changesSchema ? TreeFingerprint(Path.Combine(root, "data")) : null }; AtomicJson(JournalPath(root), journal); durableStageObserver?.Invoke(journal.Stage);
            AtomicJson(ledgerPath, applied.Append(request.PatchId).ToArray());
            journal = journal with { Stage = "committed" }; AtomicJson(JournalPath(root), journal); durableStageObserver?.Invoke(journal.Stage);
            return new(request.PatchId, request.ModuleId, current.Manifest.Version, candidate.Manifest.Version, "committed", current.ManifestSha256, candidate.ManifestSha256);
        }
        catch (PackageException ex) when (ex.Code == "HEALTH_CLEANUP_PENDING") { AtomicJson(JournalPath(root), journal with { Stage = "health-cleanup-pending" }); throw; }
        catch { Restore(root, journal, durableStageObserver); throw; }
    }

}

