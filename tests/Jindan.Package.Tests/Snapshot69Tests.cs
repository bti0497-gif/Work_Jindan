using System.Text.Json;
using System.Text.Json.Nodes;
using Jindan.ModuleHost;
using Jindan.Update;

internal static partial class Program
{
    private sealed record Schema69(string Root, string Candidate, string BeforeSha, string AfterSha, string BeforeData)
    {
        public string Transaction => Path.Combine(Root, ".updates", "patch-v2");
        public string Snapshot => Path.Combine(Transaction, "data-before");
        public string Content => Path.Combine(Snapshot, "content");
        public string Data => Path.Combine(Root, "data");
        public string Journal => Path.Combine(Root, ".updates", "journal.json");
    }
    private static string Tree69(string directory)
    {
        if (!Directory.Exists(directory)) return "absent";
        var entries = Directory.EnumerateFileSystemEntries(directory, "*", SearchOption.AllDirectories)
            .Select(p => Path.GetRelativePath(directory, p).Replace('\\', '/') + (Directory.Exists(p) ? "/" : ":" + new FileInfo(p).Length + ":" + ModuleCatalog.Hash(p))).Order(StringComparer.Ordinal);
        return string.Join('\n', entries);
    }
    private static UpdateJournal Journal69(Schema69 fixture) => JsonSerializer.Deserialize<UpdateJournal>(File.ReadAllBytes(fixture.Journal), ModuleCatalog.JsonOptions)!;
    private static void WriteJournal69(Schema69 fixture, UpdateJournal journal) => File.WriteAllText(fixture.Journal, JsonSerializer.Serialize(journal, ModuleCatalog.JsonOptions));
    private static async Task<Schema69> Create69()
    {
        var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one);
        File.WriteAllText(Path.Combine(root, "data", "second.txt"), "second-original-synthetic"); Directory.CreateDirectory(Path.Combine(root, "data", "empty-kept"));
        var fixture = new Schema69(root, two, ModuleCatalog.Hash(Path.Combine(one, "module.json")), ModuleCatalog.Hash(Path.Combine(two, "module.json")), Tree69(Path.Combine(root, "data")));
        await new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration());
        Assert(Journal69(fixture).DataSnapshotManifestSha256 == ModuleCatalog.Hash(Path.Combine(fixture.Snapshot, "manifest.json")), "Snapshot manifest not pinned in actual Apply journal");
        return fixture;
    }
    private static async Task Reject69(Schema69 fixture, string? expected = null, Action<string>? observer = null)
    {
        var data = Tree69(fixture.Data); var module = ModuleCatalog.Hash(Path.Combine(Installed(fixture.Root), "module.json"));
        try { await new UpdateCoordinator(Trust).RollbackLastAsync(fixture.Root, durableStageObserver: observer); throw new Exception("Unsafe rollback accepted"); }
        catch (Exception ex) when (ex is PackageException or IOException or UnauthorizedAccessException)
        { if (expected is not null) Assert(ex is PackageException p && p.Code == expected, "Unexpected snapshot rejection: " + ex.Message); }
        Assert(Tree69(fixture.Data) == data, "Rejected restore changed current user data");
        Assert(ModuleCatalog.Hash(Path.Combine(Installed(fixture.Root), "module.json")) == module, "Rejected snapshot changed installed package");
    }
    private static async Task Recovered69(Schema69 fixture)
    {
        await new UpdateCoordinator(Trust).RecoverInterruptedAsync(fixture.Root);
        Assert(Tree69(fixture.Data) == fixture.BeforeData, "Recovered data differs from complete original snapshot");
        Assert(ModuleCatalog.Hash(Path.Combine(Installed(fixture.Root), "module.json")) == fixture.BeforeSha, "Recovered wrong package generation");
        Assert(Journal69(fixture).Stage == "rolled-back", "Recovery did not reach terminal state");
        var proof = Tree69(fixture.Data); await new UpdateCoordinator(Trust).RecoverInterruptedAsync(fixture.Root); Assert(Tree69(fixture.Data) == proof, "Repeated recovery changed data");
        using var lease = ApplicationLease.Acquire(fixture.Root);
    }
    private static async Task RunSnapshot69Tests()
    {
        await Run("69 actual schema Apply publishes complete path/size/hash manifest and preserves snapshot on rollback", async () =>
        {
            var f = await Create69(); var snapshot = Tree69(f.Snapshot); await new UpdateCoordinator(Trust).RollbackLastAsync(f.Root);
            Assert(Tree69(f.Data) == f.BeforeData && Tree69(f.Snapshot) == snapshot, "Snapshot or restored data changed");
            var plan = Journal69(f).Restore!; Assert(File.Exists(Path.Combine(f.Transaction, plan.DataDisplaced!, "migrated.json")), "Migrated live tree was not retained");
            Assert(ModuleCatalog.Hash(Path.Combine(Installed(f.Root), "module.json")) == f.BeforeSha, "Old module not restored");
        });
        await Run("69 canonical Windows root casing preserves valid snapshot binding", async () =>
        {
            var f = await Create69(); var alternate = char.ToLowerInvariant(f.Root[0]) + f.Root[1..];
            await new UpdateCoordinator(Trust).RollbackLastAsync(alternate); Assert(Tree69(f.Data) == f.BeforeData, "Equivalent Windows path casing rejected or changed restored data");
        });
        foreach (var kind in new[] { "missing-file", "size-change", "same-size-hash", "undeclared-file", "missing-empty-directory", "missing-manifest", "manifest-bytes" })
            await Run("69 corrupt snapshot " + kind + " rejects before live data or module mutation", async () =>
            {
                var f = await Create69(); var second = Path.Combine(f.Content, "second.txt");
                switch (kind)
                {
                    case "missing-file": File.Delete(second); break;
                    case "size-change": File.AppendAllText(second, "corrupt"); break;
                    case "same-size-hash": var b = File.ReadAllBytes(second); b[0] ^= 1; File.WriteAllBytes(second, b); break;
                    case "undeclared-file": File.WriteAllText(Path.Combine(f.Content, "extra.txt"), "not-declared"); break;
                    case "missing-empty-directory": Directory.Delete(Path.Combine(f.Content, "empty-kept")); break;
                    case "missing-manifest": File.Delete(Path.Combine(f.Snapshot, "manifest.json")); break;
                    default: File.AppendAllText(Path.Combine(f.Snapshot, "manifest.json"), " "); break;
                }
                await Reject69(f, "DATA_BACKUP_INTEGRITY");
            });
        await Run("69 missing snapshot and legacy unbound snapshot preserve live generation", async () =>
        {
            var f = await Create69(); Directory.Move(f.Snapshot, f.Snapshot + ".preserved"); await Reject69(f, "DATA_BACKUP_MISSING");
            Directory.Move(f.Snapshot + ".preserved", f.Snapshot); WriteJournal69(f, Journal69(f) with { DataSnapshotManifestSha256 = null }); await Reject69(f, "DATA_BACKUP_UNVERIFIABLE");
        });
        await Run("69 locked snapshot read preserves current data and module", async () =>
        {
            var f = await Create69(); using var locked = new FileStream(Path.Combine(f.Content, "second.txt"), FileMode.Open, FileAccess.Read, FileShare.None); await Reject69(f);
        });
        foreach (var kind in new[] { "snapshot-flag", "snapshot-policy-with-pins-removed", "duplicate-property", "unknown-stage" })
            await Run("69 corrupt committed journal " + kind + " cannot downgrade package or data", async () =>
            {
                var f = await Create69(); var j = Journal69(f);
                switch (kind)
                {
                    case "snapshot-flag": WriteJournal69(f, j with { DataSnapshot = false }); break;
                    case "snapshot-policy-with-pins-removed": WriteJournal69(f, j with { DataSnapshot = false, DataSnapshotManifestSha256 = null, DataAfterFingerprint = null }); break;
                    case "duplicate-property": File.WriteAllText(f.Journal, File.ReadAllText(f.Journal).Insert(1, "\"stage\":\"committed\",")); break;
                    default: WriteJournal69(f, j with { Stage = "unknown-restore-stage" }); break;
                }
                await Reject69(f, "JOURNAL_INVALID");
            });
        foreach (var kind in new[] { "duplicate", "case-collision", "traversal", "binding", "unknown-property" })
            await Run("69 strict journal-pinned manifest rejects " + kind, async () =>
            {
                var f = await Create69(); var manifest = Path.Combine(f.Snapshot, "manifest.json"); var node = JsonNode.Parse(File.ReadAllText(manifest))!;
                switch (kind)
                {
                    case "duplicate": node["entries"]!.AsArray().Add(node["entries"]![0]!.DeepClone()); break;
                    case "case-collision": var clone = node["entries"]![0]!.DeepClone(); clone["path"] = clone["path"]!.GetValue<string>().ToUpperInvariant(); node["entries"]!.AsArray().Add(clone); break;
                    case "traversal": node["entries"]![0]!["path"] = "../outside"; break;
                    case "binding": node["binding"]!["patchId"] = "another-patch"; break;
                    default: node["invented"] = true; break;
                }
                File.WriteAllText(manifest, node.ToJsonString()); WriteJournal69(f, Journal69(f) with { DataSnapshotManifestSha256 = ModuleCatalog.Hash(manifest) }); await Reject69(f);
            });
        foreach (var failAt in new[] { "snapshot-content-staged", "snapshot-ready" })
            await Run("69 snapshot write/publication failure at " + failAt + " leaves live data and no prepared journal", async () =>
            {
                var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var before = Tree69(Path.Combine(root, "data"));
                var transaction = Path.Combine(root, ".updates", "patch-v2");
                try
                {
                    await new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration(), durableStageObserver: stage =>
                    {
                        if (stage != failAt) return;
                        var target = stage == "snapshot-ready" ? Path.Combine(transaction, "data-before") : Path.Combine(Directory.GetDirectories(transaction, "data-before.staging-*").Single(), "manifest.json");
                        File.WriteAllText(target, "owned synthetic publication blocker");
                    }); throw new Exception("Publication failure accepted");
                }
                catch (IOException) { }
                Assert(Tree69(Path.Combine(root, "data")) == before && ReadManifest(Installed(root)).Version == "1.0.0" && !File.Exists(Path.Combine(root, ".updates", "journal.json")), "Failed publication changed a live tree or published prepared intent");
            });
        await Run("69 postcopy staging corruption blocks swaps and can recover after exact repair", async () =>
        {
            var f = await Create69(); string? staged = null;
            await Reject69(f, "DATA_BACKUP_INTEGRITY", stage => { if (stage == "restore-prepared") { staged = Path.Combine(f.Transaction, Journal69(f).Restore!.DataStaging!, "second.txt"); File.Delete(staged); } });
            await ExpectSync("RECOVERY_REQUIRED", () => { using var lease = ApplicationLease.Acquire(f.Root); });
            File.Copy(Path.Combine(f.Content, "second.txt"), staged!); await Recovered69(f);
        });
        await Run("69 exception after data displacement compensates without deleting live tree", async () =>
        {
            var f = await Create69(); await Reject69(f, observer: stage => { if (stage == "restore-data-displaced") throw new IOException("owned synthetic observer failure"); });
            await ExpectSync("RECOVERY_REQUIRED", () => { using var lease = ApplicationLease.Acquire(f.Root); }); await Recovered69(f);
        });
        await Run("69 resumed module staging corruption rejects before any new data mutation", async () =>
        {
            var f = await Create69(); string? staged = null;
            await Reject69(f, "HASH_MISMATCH", stage => { if (stage == "restore-prepared") { staged = Path.Combine(f.Transaction, Journal69(f).Restore!.ModuleStaging, "Jindan.Package.Fixture.dll"); File.AppendAllText(staged, "synthetic corruption"); } });
            var data = Tree69(f.Data); var module = ModuleCatalog.Hash(Path.Combine(Installed(f.Root), "module.json"));
            await Expect("HASH_MISMATCH", () => new UpdateCoordinator(Trust).RecoverInterruptedAsync(f.Root));
            Assert(Tree69(f.Data) == data && ModuleCatalog.Hash(Path.Combine(Installed(f.Root), "module.json")) == module, "Resumed validation changed live state before verifying package staging");
            File.Copy(Path.Combine(f.Transaction, "previous", "Jindan.Package.Fixture.dll"), staged!, true); await Recovered69(f);
        });
        foreach (var kind in new[] { "aliased-slots", "duplicate-property", "snapshot-policy" })
            await Run("69 corrupt persisted restore plan " + kind + " preserves both live trees", async () =>
            {
                var f = await Create69(); await Reject69(f, observer: stage => { if (stage == "restore-prepared") throw new IOException("owned pause before swaps"); });
                var j = Journal69(f); var valid = File.ReadAllText(f.Journal); var live = Tree69(f.Data); var module = ModuleCatalog.Hash(Path.Combine(Installed(f.Root), "module.json"));
                switch (kind)
                {
                    case "aliased-slots": WriteJournal69(f, j with { Restore = j.Restore! with { ModuleDisplaced = j.Restore!.ModuleStaging } }); break;
                    case "duplicate-property": File.WriteAllText(f.Journal, valid.Replace("\"moduleStaging\":", "\"moduleStaging\":\"restore-module-duplicate\",\"moduleStaging\":")); break;
                    default: WriteJournal69(f, j with { Restore = j.Restore! with { DataStaging = null } }); break;
                }
                await Expect("JOURNAL_INVALID", () => new UpdateCoordinator(Trust).RecoverInterruptedAsync(f.Root));
                Assert(Tree69(f.Data) == live && ModuleCatalog.Hash(Path.Combine(Installed(f.Root), "module.json")) == module, "Invalid restore plan changed a live tree");
                File.WriteAllText(f.Journal, valid); await Recovered69(f);
            });
        foreach (var part in new[] { "data", "module" })
            await Run("69 blocked second " + part + " rename retains original and requires recovery", async () =>
            {
                var f = await Create69(); var beforeLive = Tree69(f.Data); var target = part == "data" ? f.Data : Installed(f.Root);
                try { await new UpdateCoordinator(Trust).RollbackLastAsync(f.Root, durableStageObserver: stage => { if (stage == "restore-" + part + "-promote-intent") File.WriteAllText(target, "owned synthetic rename blocker"); }); throw new Exception("Blocked promotion accepted"); }
                catch (IOException) { }
                var plan = Journal69(f).Restore!; Assert(Tree69(Path.Combine(f.Transaction, plan.DataDisplaced!)) == beforeLive, "Original current data was lost on blocked promotion");
                Assert(Journal69(f).Stage != "rolled-back", "Incomplete swap was called successful"); await ExpectSync("RECOVERY_REQUIRED", () => { using var lease = ApplicationLease.Acquire(f.Root); });
                File.Delete(target); await Recovered69(f);
            });
        foreach (var stage in new[] { "restore-prepared", "restore-data-displace-intent", "restore-data-displaced", "restore-data-promote-intent", "restore-data-promoted", "restore-module-displace-intent", "restore-module-displaced", "restore-module-promote-intent", "restore-module-promoted", "restore-before-commit" })
            await Run("69 fresh-process recovery after " + stage, async () =>
            {
                var f = await Create69(); var exited = await Child("restore-interrupt69", f.Root, f.BeforeSha, f.AfterSha, stage); Assert(exited.Code == 73, "Owned interruption did not reach requested durable stage: " + exited.Output);
                await ExpectSync("RECOVERY_REQUIRED", () => { using var lease = ApplicationLease.Acquire(f.Root); }); await Recovered69(f);
            });
        foreach (var stage in new[] { "snapshot-published", "prepared", "candidate-promoted", "health-passed" })
            await Run("69 actual schema apply interruption at " + stage + " preserves or recovers complete original", async () =>
            {
                var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var dataBefore = Tree69(Path.Combine(root, "data"));
                var f = new Schema69(root, two, ModuleCatalog.Hash(Path.Combine(one, "module.json")), ModuleCatalog.Hash(Path.Combine(two, "module.json")), dataBefore);
                var exited = await Child("snapshot-interrupt69", root, two, f.BeforeSha, f.AfterSha, stage); Assert(exited.Code == 73, "Snapshot apply interruption failed: " + exited.Output);
                if (stage == "snapshot-published") { Assert(!File.Exists(f.Journal) && Tree69(f.Data) == dataBefore && ReadManifest(Installed(root)).Version == "1.0.0", "Unpublished transaction touched live state"); using var lease = ApplicationLease.Acquire(root); }
                else await Recovered69(f);
            });
    }
}
