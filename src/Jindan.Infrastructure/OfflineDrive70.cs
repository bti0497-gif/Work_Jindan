using System.Security.Cryptography;
using System.Text.Json;
using Jindan.Contracts.Drive;
namespace Jindan.Infrastructure.Drive;

public sealed record OfflineDriveFixture(int Schema, DriveScope Scope, IReadOnlyList<DriveListing> Folders);

/// <summary>Explicit opt-in isolated metadata/content fixture. It has no HTTP, auth, or token dependency.</summary>
public sealed class OfflineDriveTransport : IOfflineDriveSystemTransport
{
    readonly object gate = new(); readonly DriveScope scope;
    readonly Dictionary<string, List<DriveEntry>> folders = new(StringComparer.Ordinal); readonly Dictionary<string, byte[]> content = new(StringComparer.Ordinal);
    public bool IsSynthetic => true;
    public int ReadCalls { get; private set; }
    public int Mutations { get; private set; }
    public Func<string, CancellationToken, Task>? BeforeList { get; set; }
    public OfflineDriveTransport(OfflineDriveFixture fixture, bool explicitOfflineFixture)
    {
        DriveBoundary.Require(explicitOfflineFixture, "DRIVE_FIXTURE_OPT_IN"); DriveBoundary.Scope(fixture.Scope); DriveBoundary.Require(fixture.Schema == 1 && fixture.Folders is not null && fixture.Folders.Count <= 1000, "DRIVE_FIXTURE_SCHEMA"); scope = fixture.Scope;
        foreach (var folder in fixture.Folders!) { DriveBoundary.Require(folder.Scope == scope, "DRIVE_SCOPE_MISMATCH"); DriveBoundary.Id(folder.FolderId); DriveBoundary.Entries(folder.Entries); DriveBoundary.Require(folders.TryAdd(folder.FolderId, folder.Entries.ToList()), "DRIVE_DUPLICATE"); }
        DriveBoundary.Require(folders.ContainsKey(scope.RootId), "DRIVE_FIXTURE_ROOT");
        var ids = new HashSet<string>(StringComparer.Ordinal); foreach (var entries in folders.Values) foreach (var entry in entries) DriveBoundary.Require(entry.Id != scope.RootId && ids.Add(entry.Id), "DRIVE_DUPLICATE");
        var reached = new HashSet<string>(StringComparer.Ordinal) { scope.RootId }; var queue = new Queue<string>(); queue.Enqueue(scope.RootId);
        while (queue.TryDequeue(out var id)) { DriveBoundary.Require(folders.TryGetValue(id, out var entries), "DRIVE_FIXTURE_FOLDER"); foreach (var child in entries!.Where(e => e.IsFolder)) { DriveBoundary.Require(reached.Add(child.Id), "DRIVE_FIXTURE_CYCLE"); queue.Enqueue(child.Id); } }
        DriveBoundary.Require(folders.Keys.All(reached.Contains), "DRIVE_FIXTURE_SCOPE");
    }
    public static async Task<OfflineDriveFixture> ReadFixtureAsync(string path, CancellationToken ct = default)
    {
        DriveBoundary.LocalPath(path); DriveBoundary.Require(File.Exists(path) && new FileInfo(path).Length <= 16 * 1024 * 1024, "DRIVE_FIXTURE_LIMIT");
        try { return JsonSerializer.Deserialize<OfflineDriveFixture>(await File.ReadAllBytesAsync(path, ct)) ?? throw new DriveBoundaryException("DRIVE_FIXTURE_INVALID"); }
        catch (JsonException) { throw new DriveBoundaryException("DRIVE_FIXTURE_INVALID"); }
    }
    void Scope(DriveScope requested) => DriveBoundary.Require(scope == requested, "DRIVE_SCOPE_DENIED");
    public async Task<DriveListing> ListAsync(DriveScope requested, string folderId, CancellationToken ct)
    {
        Scope(requested); DriveBoundary.Id(folderId); ct.ThrowIfCancellationRequested(); if (BeforeList is not null) await BeforeList(folderId, ct); ct.ThrowIfCancellationRequested();
        lock (gate) { ReadCalls++; DriveBoundary.Require(folders.TryGetValue(folderId, out var entries), "DRIVE_FOLDER_SCOPE"); return new(scope, folderId, entries!.ToArray()); }
    }
    public Task<DriveEntry> CreateFolderAsync(DriveScope requested, string parentId, string name, CancellationToken ct) => AddAsync(requested, parentId, name, [], DriveEntry.FolderMime, ct);
    public Task<DriveEntry> UploadAsync(DriveScope requested, string folderId, string name, byte[] bytes, string mimeType, CancellationToken ct) => AddAsync(requested, folderId, name, bytes, mimeType, ct);
    Task<DriveEntry> AddAsync(DriveScope requested, string parentId, string name, byte[] bytes, string mimeType, CancellationToken ct)
    {
        Scope(requested); DriveBoundary.Id(parentId); ct.ThrowIfCancellationRequested(); DriveBoundary.Require(bytes.Length <= 16 * 1024 * 1024, "DRIVE_RESOURCE_LIMIT"); var entry = new DriveEntry(Guid.NewGuid().ToString("N"), name, mimeType, bytes.Length, DateTimeOffset.UtcNow); DriveBoundary.Entries([entry]);
        lock (gate) { DriveBoundary.Require(folders.TryGetValue(parentId, out var entries), "DRIVE_FOLDER_SCOPE"); DriveBoundary.Require(!entries!.Any(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase)), "DRIVE_NAME_CONFLICT"); entries!.Add(entry); if (entry.IsFolder) folders.Add(entry.Id, []); else content.Add(entry.Id, bytes.ToArray()); Mutations++; return Task.FromResult(entry); }
    }
    public Task TrashAsync(DriveScope requested, string id, CancellationToken ct)
    {
        Scope(requested); ct.ThrowIfCancellationRequested(); DriveBoundary.Id(id);
        lock (gate) { DriveBoundary.Require(id != scope.RootId, "DRIVE_ROOT_PROTECTED"); DriveBoundary.Require(!folders.TryGetValue(id, out var children) || children.Count == 0, "DRIVE_FOLDER_NOT_EMPTY"); var parent = folders.Values.SingleOrDefault(entries => entries.Any(x => x.Id == id)); DriveBoundary.Require(parent is not null, "DRIVE_NOT_FOUND"); parent!.RemoveAll(x => x.Id == id); folders.Remove(id); content.Remove(id); Mutations++; return Task.CompletedTask; }
    }
    public byte[] ReadContent(DriveScope requested, string id) { Scope(requested); lock (gate) { DriveBoundary.Require(content.ContainsKey(id), "DRIVE_NOT_FOUND"); return content[id].ToArray(); } }
}

/// <summary>Legacy .system/json/resources semantics, restricted to an explicit offline transport.
/// Initialize and retention are explicit commands, never app startup actions.</summary>
public sealed class OfflineDriveSystem
{
    readonly IOfflineDriveSystemTransport transport; readonly DriveScope scope; readonly SemaphoreSlim gate = new(1, 1); DriveSystemFolders? initialized;
    public OfflineDriveSystem(DriveScope scope, IOfflineDriveSystemTransport transport, bool explicitOfflineFixture)
    { DriveBoundary.Scope(scope); DriveBoundary.Require(explicitOfflineFixture && transport.IsSynthetic, "DRIVE_SYSTEM_OFFLINE_ONLY"); this.scope = scope; this.transport = transport; }
    async Task<IReadOnlyList<DriveEntry>> List(string id, CancellationToken ct) { var listing = await transport.ListAsync(scope, id, ct); DriveBoundary.Require(listing.Scope == scope && listing.FolderId == id, "DRIVE_SCOPE_MISMATCH"); DriveBoundary.Entries(listing.Entries); return listing.Entries; }
    async Task<DriveEntry> Folder(string parent, string[] aliases, CancellationToken ct)
    {
        var matches = (await List(parent, ct)).Where(x => aliases.Contains(x.Name, StringComparer.OrdinalIgnoreCase)).ToArray(); DriveBoundary.Require(matches.Length <= 1 && matches.All(x => x.IsFolder), "DRIVE_SYSTEM_AMBIGUOUS");
        var folder = matches.SingleOrDefault() ?? await transport.CreateFolderAsync(scope, parent, aliases[0], ct); DriveBoundary.Require(folder.IsFolder && aliases.Contains(folder.Name, StringComparer.OrdinalIgnoreCase), "DRIVE_SYSTEM_FOLDER"); DriveBoundary.Id(folder.Id); return folder;
    }
    public async Task<DriveSystemFolders> InitializeAsync(CancellationToken ct = default)
    {
        await gate.WaitAsync(ct); try { if (initialized is not null) return initialized; var system = await Folder(scope.RootId, [".system"], ct); var json = await Folder(system.Id, ["json"], ct); var resources = await Folder(system.Id, ["resources", "resouces"], ct); return initialized = new(system.Id, json.Id, resources.Id); } finally { gate.Release(); }
    }
    DriveSystemFolders Ready() => initialized ?? throw new DriveBoundaryException("DRIVE_SYSTEM_NOT_INITIALIZED");
    static void Label(string label) => DriveBoundary.Require(label is { Length: > 0 and <= 80 } && label.All(c => char.IsLetterOrDigit(c) || c is '-' or '_'), "DRIVE_LOG_LABEL");
    public Task<DriveEntry> SaveJsonLogAsync(string tableName, JsonElement value, CancellationToken ct = default)
    { Label(tableName); var folders = Ready(); var bytes = JsonSerializer.SerializeToUtf8Bytes(value); DriveBoundary.Require(bytes.Length <= 1024 * 1024, "DRIVE_LOG_LIMIT"); return transport.UploadAsync(scope, folders.JsonId, tableName + "_" + Guid.NewGuid().ToString("N") + ".json", bytes, "application/json", ct); }
    public Task<DriveEntry> SaveActionLogAsync(string op, string tableName, string id, CancellationToken ct = default)
    { DriveBoundary.Require(op is "CREATE" or "UPDATE" or "DELETE", "DRIVE_ACTION"); Label(tableName); DriveBoundary.Id(id); return SaveJsonLogAsync("ACTION", JsonSerializer.SerializeToElement(new { op, tableName, id, timestamp = DateTimeOffset.UtcNow }), ct); }
    public async Task<DriveEntry> UploadResourceWithCommitAsync(string name, byte[] bytes, string mimeType, Func<DriveEntry, CancellationToken, Task> commit, CancellationToken ct = default)
    {
        var folder = Ready(); DriveBoundary.Require(name == Path.GetFileName(name) && !name.Contains('\\') && !name.Contains('/'), "DRIVE_RESOURCE_NAME");
        var created = await transport.UploadAsync(scope, folder.ResourcesId, name, bytes.ToArray(), mimeType, ct); DriveBoundary.Id(created.Id);
        try { ct.ThrowIfCancellationRequested(); await commit(created, ct); return created; }
        catch { // Compensate only the ID created by this operation; never delete an existing resource.
            try { await transport.TrashAsync(scope, created.Id, CancellationToken.None); } catch { throw new DriveBoundaryException("DRIVE_RESOURCE_COMPENSATION_REQUIRED"); } throw;
        }
    }
    public async Task<DriveRetentionPlan> PreviewRetentionAsync(DateTimeOffset now, CancellationToken ct = default)
    {
        var folder = Ready(); var cutoff = now.AddDays(-7); var entries = (await List(folder.JsonId, ct)).Where(x => !x.IsFolder && x.MimeType == "application/json" && x.Name.EndsWith(".json", StringComparison.OrdinalIgnoreCase) && !x.Name.StartsWith("회원관리_", StringComparison.Ordinal) && x.ModifiedTime.HasValue && x.ModifiedTime < cutoff).ToArray(); return new(scope, folder.JsonId, cutoff, entries);
    }
    public async Task<int> ApplyRetentionAsync(DriveRetentionPlan plan, bool confirmed, CancellationToken ct = default)
    {
        DriveBoundary.Require(confirmed, "DRIVE_RETENTION_CONFIRM"); var folder = Ready(); DriveBoundary.Require(plan.Scope == scope && plan.JsonFolderId == folder.JsonId, "DRIVE_SCOPE_MISMATCH"); DriveBoundary.Entries(plan.Entries);
        var current = await List(folder.JsonId, ct); foreach (var expected in plan.Entries) { var actual = current.SingleOrDefault(x => x.Id == expected.Id); DriveBoundary.Require(actual == expected && !expected.IsFolder && expected.MimeType == "application/json" && expected.Name.EndsWith(".json", StringComparison.OrdinalIgnoreCase) && !expected.Name.StartsWith("회원관리_", StringComparison.Ordinal) && expected.ModifiedTime < plan.Cutoff && plan.Cutoff <= DateTimeOffset.UtcNow.AddDays(-7), "DRIVE_RETENTION_STALE"); }
        var removed = 0; foreach (var entry in plan.Entries) { ct.ThrowIfCancellationRequested(); await transport.TrashAsync(scope, entry.Id, ct); removed++; } return removed;
    }
}
