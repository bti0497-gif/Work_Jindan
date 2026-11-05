using Jindan.ModuleHost;

namespace Jindan.Update;

public sealed record RestorePlan(string ModuleStaging, string ModuleDisplaced, string ModuleOriginalIdentity,
    string? DataStaging, string? DataDisplaced, string? DataOriginalIdentity, string? DataDesiredIdentity);

public sealed partial class UpdateCoordinator
{
    private static SnapshotBinding SnapshotBinding(string root, UpdateJournal journal) => new(journal.PatchId, journal.ModuleId, journal.BeforeManifestSha256, Path.GetFullPath(Path.Combine(root, "data")));
    private string ModuleIdentity(string path)
    {
        if (!Directory.Exists(path)) { if (File.Exists(path)) throw new PackageException("RESTORE_CONFLICT", "A file blocks the restore directory."); return "absent"; }
        return ModuleCatalog.Verify(path, rollbackTrust, rollbackHost).ManifestSha256;
    }
    private static void CanRename(string directory)
    {
        if (!Directory.Exists(directory)) return;
        foreach (var file in ModuleCatalog.EnumerateSafeFiles(directory)) using (new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None)) { }
    }
    private void VerifyRestoreGenerations(string root, UpdateJournal journal)
    {
        var paths = new List<string> { PackagePath(root, journal.ModuleId), Slot(root, journal, "previous"), Slot(root, journal, "staged") };
        if (journal.Restore is { } plan) { paths.Add(Slot(root, journal, plan.ModuleStaging)); paths.Add(Slot(root, journal, plan.ModuleDisplaced)); }
        var generations = new Dictionary<string, ModuleManifest>(StringComparer.Ordinal);
        foreach (var p in paths)
        {
            if (File.Exists(p)) throw new PackageException("RESTORE_CONFLICT", "A file blocks a restore generation.");
            if (!Directory.Exists(p)) continue;
            var package = ModuleCatalog.Verify(p, rollbackTrust, rollbackHost);
            if (package.Manifest.ModuleId != journal.ModuleId || package.ManifestSha256 != journal.BeforeManifestSha256 && package.ManifestSha256 != journal.AfterManifestSha256) throw new PackageException("ROLLBACK_HASH", "Restore tree is not an expected package generation.");
            generations[package.ManifestSha256] = package.Manifest;
        }
        if (!generations.TryGetValue(journal.BeforeManifestSha256, out var before) || !generations.TryGetValue(journal.AfterManifestSha256, out var after)) throw new PackageException("ROLLBACK_MISSING", "A verified journal generation is missing; automatic restore is blocked.");
        if (before.Version != journal.BeforeVersion || after.Version != journal.AfterVersion || journal.DataSnapshot != (before.DataSchemaVersion != after.DataSchemaVersion)) throw new PackageException("JOURNAL_INVALID", "Snapshot policy does not match the verified package schemas.");
    }
    private void Restore(string root, UpdateJournal original, Action<string>? observer = null)
    {
        _ = WorkspaceLocation.ReadForUpdate(root, original.DataSnapshot);
        var journal = original; var current = PackagePath(root, journal.ModuleId); var backup = Slot(root, journal, "previous");
        var data = Path.Combine(root, "data"); var snapshot = Slot(root, journal, "data-before");
        // Complete snapshot validation MUST precede any live package/data mutation.
        var manifest = journal.DataSnapshot ? DataSnapshot.Validate(snapshot, journal.DataSnapshotManifestSha256, SnapshotBinding(root, journal)) : null;
        VerifyRestoreGenerations(root, journal);
        void Record(string stage) { journal = journal with { Stage = stage }; AtomicJson(JournalPath(root), journal); observer?.Invoke(stage); }
        if (journal.Restore is null)
        {
            var old = Directory.Exists(backup) ? backup : current;
            if (ModuleIdentity(old) != journal.BeforeManifestSha256) throw new PackageException("ROLLBACK_HASH", "Rollback package no longer matches its journal.");
            var identity = ModuleIdentity(current);
            if (identity != "absent" && identity != journal.AfterManifestSha256 && identity != journal.BeforeManifestSha256) throw new PackageException("ROLLBACK_HASH", "Installed package is not a journal generation.");
            CanRename(current); if (manifest is not null) CanRename(data);
            var suffix = Guid.NewGuid().ToString("N");
            var moduleStage = "restore-module-" + suffix; var dataStage = manifest is null ? null : "restore-data-" + suffix;
            CopyTree(old, Slot(root, journal, moduleStage));
            if (ModuleIdentity(Slot(root, journal, moduleStage)) != journal.BeforeManifestSha256) throw new PackageException("ROLLBACK_HASH", "Staged rollback package differs.");
            string? dataIdentity = null, desiredData = null;
            if (manifest is not null)
            {
                dataIdentity = TreeFingerprint(data);
                DataSnapshot.StageRestore(snapshot, Slot(root, journal, dataStage!), manifest);
                desiredData = TreeFingerprint(Slot(root, journal, dataStage!));
                if (TreeFingerprint(data) != dataIdentity) throw new PackageException("DATA_CHANGED", "Current data changed during restore preparation.");
            }
            journal = journal with { Restore = new(moduleStage, "restore-module-displaced-" + suffix, identity, dataStage, manifest is null ? null : "restore-data-displaced-" + suffix, dataIdentity, desiredData) };
            Record("restore-prepared"); // Durable intent BEFORE the first directory rename, including committed rollback.
        }
        var plan = journal.Restore!;
        foreach (var name in new[] { plan.ModuleStaging, plan.ModuleDisplaced, plan.DataStaging, plan.DataDisplaced }.Where(n => n is not null)) Identifier(name!);
        // Resumed attempts also preflight BOTH kinds of generation before any
        // new data rename. A valid snapshot alone cannot authorize module downgrade.
        VerifyRestoreGenerations(root, journal);
        if (manifest is not null && Directory.Exists(Slot(root, journal, plan.DataStaging!))) DataSnapshot.VerifyContent(Slot(root, journal, plan.DataStaging!), manifest);
        if (manifest is not null)
        {
            if (plan.DataStaging is null || plan.DataDisplaced is null || plan.DataOriginalIdentity is null || plan.DataDesiredIdentity is null) throw new PackageException("DATA_RESTORE_CONFLICT", "Restore plan is incomplete.");
            void VerifyData(string p) => DataSnapshot.VerifyContent(p, manifest);
            Swap(data, Slot(root, journal, plan.DataStaging), Slot(root, journal, plan.DataDisplaced), plan.DataOriginalIdentity, plan.DataDesiredIdentity, TreeFingerprint, VerifyData, "restore-data", Record);
        }
        void VerifyModule(string p) { if (ModuleIdentity(p) != journal.BeforeManifestSha256) throw new PackageException("ROLLBACK_HASH", "Restored package differs from the journal."); }
        Swap(current, Slot(root, journal, plan.ModuleStaging), Slot(root, journal, plan.ModuleDisplaced), plan.ModuleOriginalIdentity, journal.BeforeManifestSha256, ModuleIdentity, VerifyModule, "restore-module", Record);
        if (manifest is not null) DataSnapshot.VerifyContent(data, manifest);
        VerifyModule(current); Record("restore-before-commit");
        AtomicJson(JournalPath(root), journal with { Stage = "rolled-back" });
        // Keep the original snapshot AND displaced live trees. No delete-then-copy,
        // no destructive cleanup while a restore is incomplete or after success.
    }
    private static void Swap(string current, string staged, string displaced, string originalIdentity, string desiredIdentity,
        Func<string, string> identity, Action<string> verifyDesired, string prefix, Action<string> record)
    {
        bool Exists(string p) => Directory.Exists(p) || File.Exists(p);
        if (File.Exists(current) || File.Exists(staged) || File.Exists(displaced)) throw new PackageException("RESTORE_CONFLICT", "A file blocks a directory restore.");
        if (Directory.Exists(displaced))
        {
            if (originalIdentity == "absent" || identity(displaced) != originalIdentity) throw new PackageException("RESTORE_CONFLICT", "Preserved live tree no longer matches the restore intent.");
            if (Directory.Exists(current))
            {
                verifyDesired(current);
                if (identity(current) != desiredIdentity || Exists(staged)) throw new PackageException("RESTORE_CONFLICT", "Restore generations are inconsistent.");
                return; // Promotion completed before a previous process stopped.
            }
        }
        else
        {
            if (originalIdentity == "absent")
            {
                if (Directory.Exists(current)) { verifyDesired(current); if (identity(current) != desiredIdentity || Exists(staged)) throw new PackageException("RESTORE_CONFLICT", "Unexpected restore generation."); return; }
            }
            else if (!Directory.Exists(current) || identity(current) != originalIdentity) throw new PackageException("RESTORE_CONFLICT", "Live tree differs from the restore intent.");
        }
        verifyDesired(staged);
        if (identity(staged) != desiredIdentity) throw new PackageException("RESTORE_CONFLICT", "Staged restore differs from its intent.");
        CanRename(staged); CanRename(current);
        var movedOriginal = Directory.Exists(displaced);
        try
        {
            if (!movedOriginal && originalIdentity != "absent")
            {
                record(prefix + "-displace-intent"); Directory.Move(current, displaced); movedOriginal = true; record(prefix + "-displaced");
            }
            record(prefix + "-promote-intent"); Directory.Move(staged, current); verifyDesired(current);
            record(prefix + "-promoted");
        }
        catch
        {
            // A failed second rename must not strand or delete the old live tree.
            // If another entry blocks compensation, preserve displaced and leave the
            // nonterminal journal so startup/recovery cannot claim success.
            if (movedOriginal && !Exists(current))
            {
                try { Directory.Move(displaced, current); }
                catch { throw new PackageException("RESTORE_CLEANUP_PENDING", "Preserved live data requires recovery; no tree was deleted."); }
            }
            throw;
        }
    }
}
