using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Jindan.ModuleHost;
using Jindan.Update;

internal static partial class Program
{
    private static string repo = "";
    private static string workspace = "";
    private static string v1 = "";
    private static string v2 = "";
    private static string? packagedRoot;
    private static readonly List<object> packagedAssemblies = [];
    private static readonly List<string> trusted = [];
    private static readonly List<object> results = [];
    private static readonly List<string> ownedNtfsReparseRoots = [];
    private static int pass, fail;
    private static ModuleTrustPolicy Trust => new(trusted);
    private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static string NewDir(string name) { var directory = Path.Combine(workspace, name + "-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory); return directory; }
    private static string Package(string name, string fixture, string version = "1.0.0", int schema = 1, int minHost = 1, PackageDependency[]? dependencies = null)
    {
        var root = NewDir(name); var dll = Path.Combine(root, "Jindan.Package.Fixture.dll"); File.Copy(fixture, dll);
        var manifest = new ModuleManifest { ModuleId = name, Version = version, EntryAssembly = Path.GetFileName(dll), EntryType = "Jindan.Package.Fixture.Module", DataSchemaVersion = schema, MinimumHostContractMajor = minHost, MaximumHostContractMajor = minHost, Dependencies = dependencies ?? [], Files = [new(Path.GetFileName(dll), new FileInfo(dll).Length, ModuleCatalog.Hash(dll))] };
        WriteManifest(root, manifest); return root;
    }
    private static void WriteManifest(string directory, ModuleManifest manifest) { File.WriteAllText(Path.Combine(directory, ModuleCatalog.ManifestName), JsonSerializer.Serialize(manifest, ModuleCatalog.JsonOptions)); trusted.Add(ModuleCatalog.Hash(Path.Combine(directory, ModuleCatalog.ManifestName))); }
    private static ModuleManifest ReadManifest(string path) => JsonSerializer.Deserialize<ModuleManifest>(File.ReadAllBytes(Path.Combine(path, ModuleCatalog.ManifestName)), ModuleCatalog.JsonOptions)!;
    private static void Copy(string from, string to) { Directory.CreateDirectory(to); foreach (var path in Directory.GetFiles(from)) File.Copy(path, Path.Combine(to, Path.GetFileName(path))); }
    private static string Installation(string package)
    {
        var root = NewDir("installation"); Copy(package, Path.Combine(root, "modules", ReadManifest(package).ModuleId)); Directory.CreateDirectory(Path.Combine(root, "data")); File.WriteAllText(Path.Combine(root, "data", "user.json"), "{\"companyData\":\"synthetic-only\",\"schema\":1}"); File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(root, "host.dll")); return root;
    }
    private static string Installed(string root, string id = "projects") => Path.Combine(root, "modules", id);
    private static PatchRequest Request(string root, string candidate, string id = "patch-v2") => new(root, "projects", candidate, "1.0.0", id);
    private static async Task Expect(string code, Func<Task> action)
    {
        try { await action(); } catch (PackageException ex) { Assert(ex.Code == code, $"Expected {code}, got {ex.Code}"); return; } throw new Exception("Expected rejection " + code);
    }
    private static Task ExpectSync(string code, Action action) => Expect(code, () => { action(); return Task.CompletedTask; });
    private static async Task Run(string name, Func<Task> test)
    {
        try { await test(); pass++; Console.WriteLine("PASS " + name); results.Add(new { name, passed = true }); }
        catch (Exception ex) { fail++; Console.WriteLine("FAIL " + name + ": " + ex.GetType().Name + ": " + ex.Message); results.Add(new { name, passed = false, error = ex.GetType().Name, message = ex.Message }); }
    }
    private static async Task<(int Code, string Output)> Child(params string[] args)
    {
        var sdk = packagedRoot is null ? Path.Combine(repo, ".tools", "dotnet", "dotnet.exe") : Path.Combine(packagedRoot, ".runtime", "dotnet.exe"); var info = new ProcessStartInfo(sdk) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        info.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        if (packagedRoot is not null) { info.ArgumentList.Add("--packaged-root"); info.ArgumentList.Add(packagedRoot); }
        foreach (var arg in args) info.ArgumentList.Add(arg);
        info.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1"; info.Environment["DOTNET_GENERATE_ASPNET_CERTIFICATE"] = "false";
        using var process = Process.Start(info)!; var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync(); using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); } catch { if (!process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(); } throw; }
        return (process.ExitCode, (await output) + (await error));
    }
    public static async Task<int> Main(string[] args)
    {
        repo = AppContext.BaseDirectory; while (!File.Exists(Path.Combine(repo, "Directory.Build.props"))) repo = Path.GetDirectoryName(repo) ?? throw new Exception("Repository root missing");
        if (args.FirstOrDefault() == "--packaged-root")
        {
            packagedRoot = Path.GetFullPath(args[1]); args = args[2..];
            foreach (var pair in new[] { (typeof(ModuleCatalog).Assembly, "Jindan.ModuleHost.dll"), (typeof(UpdateCoordinator).Assembly, "update-tool/Jindan.Update.dll"), (typeof(Jindan.Update.Tool.Program).Assembly, "update-tool/Jindan.Update.Tool.dll") })
            {
                var actual = Path.Combine(packagedRoot, pair.Item2); var loaded = pair.Item1.Location;
                Assert(ModuleCatalog.Hash(actual) == ModuleCatalog.Hash(loaded), "Exact packaged assembly differs: " + pair.Item2);
                packagedAssemblies.Add(new { name = pair.Item2, loaded, packaged = actual, sha256 = ModuleCatalog.Hash(actual) });
            }
        }
        if (args.FirstOrDefault() == "--healthcheck")
        {
            var root = args[2]; File.WriteAllText(Path.Combine(root, "health.pid"), Environment.ProcessId.ToString());
            if (File.Exists(Path.Combine(root, "health-hang"))) await Task.Delay(Timeout.Infinite);
            if (File.Exists(Path.Combine(root, "health-fail"))) return 11;
            var trust = new ModuleTrustPolicy(Jindan.Update.Tool.Program.ReadTrustedHashes(Path.Combine(root, "trusted-manifests.json")));
            using var scope = new ModuleAssemblyScope(ModuleCatalog.Verify(Installed(root), trust)); scope.CreateEntry(); return 0;
        }
        if (args.FirstOrDefault() == "probe")
        {
            using var scope = new ModuleAssemblyScope(ModuleCatalog.Verify(args[1], new([args[2]]))); var entry = scope.CreateEntry(); Console.WriteLine(entry.GetType().GetMethod("Describe")!.Invoke(entry, null)); return 0;
        }
        if (args.FirstOrDefault() == "interrupt")
        {
            await new UpdateCoordinator(new([args[3], args[4]])).ApplyAsync(Request(args[1], args[2], "interrupted-patch"), (_, _) => Task.FromResult(true), durableStageObserver: stage => { if (stage == (args.Length > 5 ? args[5] : "old-renamed")) Environment.Exit(73); }); return 99;
        }
        if (args.FirstOrDefault() == "restore-interrupt69")
        {
            await new UpdateCoordinator(new([args[2], args[3]])).RollbackLastAsync(args[1], durableStageObserver: stage => { if (stage == args[4]) Environment.Exit(73); }); return 99;
        }
        if (args.FirstOrDefault() == "snapshot-interrupt69")
        {
            await new UpdateCoordinator(new([args[3], args[4]])).ApplyAsync(Request(args[1], args[2]), (_, _) => Task.FromResult(true), new Migration(), durableStageObserver: stage => { if (stage == args[5]) Environment.Exit(73); }); return 99;
        }
        workspace = NewWorkspace();
        string Fixture(string name)
        {
            var config = new DirectoryInfo(AppContext.BaseDirectory);
            var isolated = Path.Combine(config.Parent?.Parent?.FullName ?? "", name, config.Name, "Jindan.Package.Fixture.dll");
            return File.Exists(isolated) ? isolated : Path.Combine(repo, "tests", "Fixtures", name, "bin", config.Parent?.Name == "Debug" ? "Debug" : "Release", "net10.0", "Jindan.Package.Fixture.dll");
        }
        v1 = Fixture("ModuleV1"); v2 = Fixture("ModuleV2");
        if (!File.Exists(v1) || !File.Exists(v2)) throw new Exception("Build fixture projects first.");
        if (packagedRoot is not null) await Run("69 three update libraries match exact review bytes and owned children use bundled runtime", () => { Assert(packagedAssemblies.Count == 3 && File.Exists(Path.Combine(packagedRoot, ".runtime", "dotnet.exe")), "Exact package binding incomplete"); return Task.CompletedTask; });
        if (packagedRoot is not null) await Run("70 every managed module dependency is shared-contract or exact declared private payload", CheckModuleClosure70);
        await Run("actual DLL v1-to-v2 health and explicit rollback preserve host/other module/data", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var other = Package("photos", v1); var root = Installation(one); Copy(other, Installed(root, "photos"));
            var original = ModuleCatalog.Hash(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll")); var host = ModuleCatalog.Hash(Path.Combine(root, "host.dll")); var photo = ModuleCatalog.Hash(Path.Combine(Installed(root, "photos"), "Jindan.Package.Fixture.dll")); var data = ModuleCatalog.Hash(Path.Combine(root, "data", "user.json"));
            var first = await Child("probe", Installed(root), ModuleCatalog.Hash(Path.Combine(one, "module.json"))); Assert(first.Code == 0 && first.Output.Contains("fixture:v1:"), "Fresh process did not load v1");
            var update = new UpdateCoordinator(Trust); var result = await update.ApplyAsync(Request(root, two), async (directory, ct) => { ct.ThrowIfCancellationRequested(); var next = await Child("probe", directory, ModuleCatalog.Hash(Path.Combine(two, "module.json"))); return next.Code == 0 && next.Output.Contains("fixture:v2:"); });
            Assert(result.Status == "committed" && ModuleCatalog.Hash(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll")) != original, "Module bytes did not change");
            Assert(ModuleCatalog.Hash(Path.Combine(root, "host.dll")) == host && ModuleCatalog.Hash(Path.Combine(Installed(root, "photos"), "Jindan.Package.Fixture.dll")) == photo && ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")) == data, "Unrelated binary/user data changed");
            File.WriteAllText(Path.Combine(root, "proof.json"), JsonSerializer.Serialize(new { beforeModule = original, afterModule = ModuleCatalog.Hash(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll")), host, photo, data, result }, ModuleCatalog.JsonOptions));
            await update.RollbackLastAsync(root); var rolled = await Child("probe", Installed(root), ModuleCatalog.Hash(Path.Combine(one, "module.json"))); Assert(rolled.Code == 0 && rolled.Output.Contains("fixture:v1:") && ModuleCatalog.Hash(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll")) == original, "Rollback failed");
        });
        await Run("trust is distinct from file integrity", () => { var one = Package("projects", v1); return ExpectSync("UNTRUSTED", () => ModuleCatalog.Verify(one, new([]))); });
        await Run("missing DLL rejected", () => { var one = Package("projects", v1); File.Delete(Path.Combine(one, "Jindan.Package.Fixture.dll")); return ExpectSync("PAYLOAD_MISSING", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("tampered DLL rejected", () => { var one = Package("projects", v1); File.AppendAllText(Path.Combine(one, "Jindan.Package.Fixture.dll"), "changed"); return ExpectSync("HASH_MISMATCH", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("incompatible contract rejected", () => { var one = Package("projects", v1, minHost: 2); return ExpectSync("INCOMPATIBLE", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("path traversal rejected", () => { var one = Package("projects", v1); var manifest = ReadManifest(one); WriteManifest(one, manifest with { Files = [manifest.Files[0] with { Path = "../escape.dll" }] }); return ExpectSync("PATH_INVALID", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("case duplicate payload rejected", () => { var one = Package("projects", v1); var manifest = ReadManifest(one); WriteManifest(one, manifest with { Files = [manifest.Files[0], manifest.Files[0] with { Path = "JINDAN.PACKAGE.FIXTURE.dll" }] }); return ExpectSync("DUPLICATE", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("duplicate JSON property rejected", () => { var one = Package("projects", v1); var path = Path.Combine(one, "module.json"); File.WriteAllText(path, File.ReadAllText(path).Replace("\"schemaVersion\": 1,", "\"schemaVersion\": 1, \"schemaVersion\": 1,")); trusted.Add(ModuleCatalog.Hash(path)); return ExpectSync("MANIFEST_INVALID", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("undeclared payload rejected", () => { var one = Package("projects", v1); File.WriteAllText(Path.Combine(one, "surprise.dll"), "no"); return ExpectSync("UNDECLARED_FILE", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("null required manifest value fails as package validation", () => { var one = Package("projects", v1); WriteManifest(one, ReadManifest(one) with { ModuleId = null! }); return ExpectSync("MANIFEST_INVALID", () => ModuleCatalog.Verify(one, Trust)); });
        await Run("directory junction payload rejected", async () =>
        {
            // F: is exFAT and cannot hold reparse points. Coordinator explicitly authorized this owned NTFS temp-only fixture.
            var ownerRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "jindan66-reparse-" + Guid.NewGuid().ToString("N")));
            Assert(ownerRoot.StartsWith(Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "NTFS fixture escaped temp");
            Directory.CreateDirectory(ownerRoot); ownedNtfsReparseRoots.Add(ownerRoot);
            var one = Path.Combine(ownerRoot, "package"); Copy(Package("projects", v1), one); var target = Path.Combine(ownerRoot, "target"); Directory.CreateDirectory(target); var link = Path.Combine(one, "link");
            var info = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true }; info.ArgumentList.Add("-NoProfile"); info.ArgumentList.Add("-NonInteractive"); info.ArgumentList.Add("-Command"); info.ArgumentList.Add($"New-Item -ItemType Junction -Path '{link.Replace("'", "''")}' -Target '{target.Replace("'", "''")}' -ErrorAction Stop | Out-Null");
            using var process = Process.Start(info)!; await process.WaitForExitAsync(); Assert(process.ExitCode == 0, "Owned test junction could not be created");
            await ExpectSync("REPARSE_POINT", () => ModuleCatalog.Verify(one, Trust));
        });
        await Run("duplicate module removed while other module survives", () => { var one = Package("projects", v1); var duplicate = Package("projects", v2); var other = Package("photos", v1); var catalog = ModuleCatalog.VerifyInventory([one, duplicate, other, Path.Combine(workspace, "absent")], Trust); Assert(catalog.Modules.Count == 1 && catalog.Modules[0].Manifest.ModuleId == "photos" && catalog.Errors.Count == 2, "Catalog did not isolate bad packages"); return Task.CompletedTask; });
        await Run("missing dependency and transitive dependent rejected", () => { var one = Package("projects", v1, dependencies: [new("absent", "1.0.0")]); var other = Package("photos", v1, dependencies: [new("projects", "1.0.0")]); var catalog = ModuleCatalog.VerifyInventory([other, one], Trust); Assert(catalog.Modules.Count == 0 && catalog.Errors.Count == 2, "Transitive missing dependency accepted"); return Task.CompletedTask; });
        await Run("verified descriptor cannot hide later file mutation", () => { var one = Package("projects", v1); var verified = ModuleCatalog.Verify(one, Trust); File.AppendAllText(Path.Combine(one, "Jindan.Package.Fixture.dll"), "changed"); return ExpectSync("HASH_MISMATCH", () => { using var scope = new ModuleAssemblyScope(verified); scope.CreateEntry(); }); });
        await Run("running app lease blocks patch", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); using var running = ApplicationLease.Acquire(root); await Expect("APP_RUNNING_OR_UPDATING", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true))); });
        await Run("locked package file blocks before transaction", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); using var locked = new FileStream(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll"), FileMode.Open, FileAccess.Read, FileShare.Read); try { await new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true)); throw new Exception("Locked file accepted"); } catch (IOException) { Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Locked patch changed current package"); } });
        await Run("failed health restores entire previous package", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); await Expect("HEALTH_FAILED", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(false))); Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Bad health not rolled back"); });
        await Run("throwing health restores previous package", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); try { await new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => throw new InvalidOperationException("owned fixture health fault")); throw new Exception("Throwing health accepted"); } catch (InvalidOperationException) { Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Health exception not rolled back"); } });
        await Run("cooperative health timeout rolls back", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); try { await new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), async (_, ct) => { await Task.Delay(Timeout.Infinite, ct); return true; }, healthTimeout: TimeSpan.FromMilliseconds(100)); throw new Exception("Timeout accepted"); } catch (OperationCanceledException) { Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Timeout not rolled back"); } });
        await Run("unconfirmed health cleanup blocks restart until explicit recovery", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var pending = new TaskCompletionSource<bool>(); var coordinator = new UpdateCoordinator(Trust);
            await Expect("HEALTH_CLEANUP_PENDING", () => coordinator.ApplyAsync(Request(root, two), (_, _) => pending.Task, healthTimeout: TimeSpan.FromMilliseconds(50)));
            await ExpectSync("RECOVERY_REQUIRED", () => { using var lease = ApplicationLease.Acquire(root); });
            Assert(ReadManifest(Installed(root)).Version == "2.0.0", "Unconfirmed health cleanup overwrote a potentially loaded package"); pending.SetResult(false); await coordinator.RecoverInterruptedAsync(root);
            Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Explicit recovery after health owner cleanup failed");
        });
        await Run("concurrent patch rejected and repeated committed patch rejected", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var entered = new TaskCompletionSource(); var release = new TaskCompletionSource(); var coordinator = new UpdateCoordinator(Trust); var first = coordinator.ApplyAsync(Request(root, two), async (_, _) => { entered.SetResult(); await release.Task; return true; }); await entered.Task; await Expect("APP_RUNNING_OR_UPDATING", () => coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true))); release.SetResult(); await first; await Expect("PATCH_ALREADY_APPLIED", () => coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true))); });
        await Run("actual owned process interruption is recovered from journal", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var crash = await Child("interrupt", root, two, ModuleCatalog.Hash(Path.Combine(one, "module.json")), ModuleCatalog.Hash(Path.Combine(two, "module.json"))); Assert(crash.Code == 73 && !Directory.Exists(Installed(root)), "Crash did not occur after durable rename"); await new UpdateCoordinator(Trust).RecoverInterruptedAsync(root); Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Interrupted update not restored"); });
        await Run("interruption after promotion restores previous package", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var crash = await Child("interrupt", root, two, ModuleCatalog.Hash(Path.Combine(one, "module.json")), ModuleCatalog.Hash(Path.Combine(two, "module.json")), "candidate-promoted"); Assert(crash.Code == 73 && ReadManifest(Installed(root)).Version == "2.0.0", "Crash did not occur after promotion"); var coordinator = new UpdateCoordinator(Trust); await Expect("RECOVERY_REQUIRED", () => coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true))); await coordinator.RecoverInterruptedAsync(root); Assert(ReadManifest(Installed(root)).Version == "1.0.0", "Promoted interrupted update not restored"); });
        await Run("stale patch selection rejected", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); await Expect("STALE_VERSION", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two) with { ExpectedVersion = "0.9.0" }, (_, _) => Task.FromResult(true))); });
        await Run("patch dependency requires explicit compatible inventory", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", dependencies: [new("photos", "1.0.0")]); var root = Installation(one); await Expect("DEPENDENCY_MISSING", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true))); });
        await Run("schema change requires migration", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); await Expect("MIGRATION_REQUIRED", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true))); });
        await Run("schema migration health failure restores data snapshot", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var before = ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")); await Expect("HEALTH_FAILED", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(false), new Migration())); Assert(ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")) == before && !File.Exists(Path.Combine(root, "data", "migrated.json")), "Data snapshot not restored"); });
        await Run("successful schema migration can rollback unchanged data", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var before = ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")); var coordinator = new UpdateCoordinator(Trust); await coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration()); await coordinator.RollbackLastAsync(root); Assert(ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")) == before && ReadManifest(Installed(root)).DataSchemaVersion == 1, "Schema rollback mismatch"); });
        await Run("schema snapshots preserve empty folders and later folder changes block downgrade", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); Directory.CreateDirectory(Path.Combine(root, "data", "empty-before")); var coordinator = new UpdateCoordinator(Trust); await coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration()); Directory.CreateDirectory(Path.Combine(root, "data", "new-user-folder")); await Expect("DATA_CHANGED", () => coordinator.RollbackLastAsync(root)); Assert(Directory.Exists(Path.Combine(root, "data", "empty-before")), "Pre-existing empty folder vanished"); });
        await Run("changed user data blocks automatic schema downgrade", async () => { var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var coordinator = new UpdateCoordinator(Trust); await coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration()); File.AppendAllText(Path.Combine(root, "data", "user.json"), "user-change"); await Expect("DATA_CHANGED", () => coordinator.RollbackLastAsync(root)); Assert(ReadManifest(Installed(root)).Version == "2.0.0", "Blocked downgrade changed module"); });
        await Run("registered managed workspace is the actual schema snapshot target", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var data = Path.Combine(root, "data"); var before = ModuleCatalog.Hash(Path.Combine(data, "user.json"));
            var registration = WorkspaceLocation.Register(root, data); Assert(registration.IsManaged && WorkspaceLocation.ReadForUpdate(root, true).DataRoot == data, "Managed location descriptor did not resolve real data");
            var coordinator = new UpdateCoordinator(Trust); await coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration()); await coordinator.RollbackLastAsync(root); Assert(ModuleCatalog.Hash(Path.Combine(data, "user.json")) == before, "Managed user data did not round-trip");
            var disconnected = Path.Combine(root, "data-disconnected"); Assert(Path.GetFullPath(data).StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) && Path.GetFullPath(disconnected).StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "Synthetic move escaped owned installation");
            Directory.Move(data, disconnected); await Expect("WORKSPACE_DATA_MISSING", () => coordinator.ApplyAsync(Request(root, two, "after-data-missing"), (_, _) => Task.FromResult(true), new Migration())); Directory.Move(disconnected, data); Assert(ModuleCatalog.Hash(Path.Combine(data, "user.json")) == before, "Missing workspace migration changed source data");
        });
        await Run("custom workspace schema update is rejected before any data or package change", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0", schema: 2); var root = Installation(one); var custom = NewDir("custom-workspace"); var externalData = Path.Combine(custom, "actual-user-data.json"); File.WriteAllText(externalData, "untouched-custom-synthetic-data");
            WorkspaceLocation.Register(root, custom); var customBefore = ModuleCatalog.Hash(externalData); var managedBefore = ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")); var moduleBefore = ModuleCatalog.Hash(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll"));
            await Expect("CUSTOM_WORKSPACE_MIGRATION_REQUIRED", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true), new Migration()));
            Assert(ModuleCatalog.Hash(externalData) == customBefore && ModuleCatalog.Hash(Path.Combine(root, "data", "user.json")) == managedBefore && ModuleCatalog.Hash(Path.Combine(Installed(root), "Jindan.Package.Fixture.dll")) == moduleBefore && !File.Exists(Path.Combine(root, ".updates", "journal.json")), "Rejected custom migration changed data or installed bytes");
        });
        await Run("same-schema patch preserves custom workspace without relocating it", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var custom = NewDir("custom-same-schema"); var user = Path.Combine(custom, "user.json"); File.WriteAllText(user, "custom-synthetic"); var before = ModuleCatalog.Hash(user); WorkspaceLocation.Register(root, custom);
            var coordinator = new UpdateCoordinator(Trust); await coordinator.ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true)); await coordinator.RollbackLastAsync(root); Assert(ModuleCatalog.Hash(user) == before && WorkspaceLocation.ReadForUpdate(root, false).DataRoot == custom, "Same-schema patch moved custom data");
        });
        await Run("malformed workspace descriptor blocks update without changing selected source", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var candidateBefore = ModuleCatalog.Hash(Path.Combine(two, "Jindan.Package.Fixture.dll"));
            File.WriteAllText(Path.Combine(root, WorkspaceLocation.DescriptorName), "{\"schema\":1,\"schema\":1,\"installationRoot\":\"relative\",\"dataRoot\":\"../outside\",\"isManaged\":true}");
            await Expect("WORKSPACE_DESCRIPTOR_INVALID", () => new UpdateCoordinator(Trust).ApplyAsync(Request(root, two), (_, _) => Task.FromResult(true)));
            Assert(ModuleCatalog.Hash(Path.Combine(two, "Jindan.Package.Fixture.dll")) == candidateBefore && ReadManifest(Installed(root)).Version == "1.0.0", "Malformed descriptor changed candidate or installed package");
        });
        await Run("CLI packs exact DLL then explicitly enrolls and verifies local trust", async () =>
        {
            var output = Path.Combine(NewDir("cli-pack-parent"), "package"); var trust = Path.Combine(NewDir("cli-trust"), "trusted.json");
            var resourceRoot = NewDir("cli-resources"); var resource = Path.Combine(resourceRoot, "protocol.mjs"); File.WriteAllText(resource, "export const protocol = 'synthetic/1';"); var resourceList = Path.Combine(resourceRoot, "explicit-resources.json"); File.WriteAllText(resourceList, JsonSerializer.Serialize(new[] { new Jindan.Update.Tool.Program.ExplicitResource(resource, "worker/protocol.mjs") }, ModuleCatalog.JsonOptions));
            Assert(await Jindan.Update.Tool.Program.Main(["pack", "--entry", v1, "--entry-type", "Jindan.Package.Fixture.Module", "--module-id", "projects", "--version", "1.0.0", "--out", output, "--files-json", resourceList]) == 0 && ReadManifest(output).Files.Length == 2 && ModuleCatalog.Hash(Path.Combine(output, "worker", "protocol.mjs")) == ModuleCatalog.Hash(resource), "CLI explicit resource package failed");
            Assert(!File.Exists(trust), "Pack implicitly trusted its own package");
            Assert(await Jindan.Update.Tool.Program.Main(["trust-add", "--package", output, "--trust", trust]) == 2 && !File.Exists(trust), "Trust enrolled without explicit approval flag");
            Assert(await Jindan.Update.Tool.Program.Main(["trust-add", "--package", output, "--trust", trust, "--approve-local-manifest"]) == 0, "Explicit local trust failed");
            Assert(await Jindan.Update.Tool.Program.Main(["verify", "--package", output, "--trust", trust]) == 0, "CLI verify failed");
        });
        await Run("CLI apply runs owned health process and rollback restores package", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var trust = Path.Combine(root, "trusted-manifests.json"); File.WriteAllText(trust, JsonSerializer.Serialize(trusted));
            var health = Path.Combine(AppContext.BaseDirectory, "Jindan.Package.Tests.exe");
            Assert(await Jindan.Update.Tool.Program.Main(["apply", "--root", root, "--module-id", "projects", "--candidate", two, "--expected", "1.0.0", "--patch-id", "cli-v2", "--trust", trust, "--health-exe", health]) == 0 && ReadManifest(Installed(root)).Version == "2.0.0", "CLI apply/health failed");
            Assert(await Jindan.Update.Tool.Program.Main(["rollback", "--root", root, "--trust", trust]) == 0 && ReadManifest(Installed(root)).Version == "1.0.0", "CLI rollback failed");
            Assert(await Jindan.Update.Tool.Program.Main(["recover", "--root", root, "--trust", trust]) == 0, "CLI recover failed");
        });
        await Run("CLI health timeout exits owned process before rollback", async () =>
        {
            var one = Package("projects", v1); var two = Package("projects", v2, "2.0.0"); var root = Installation(one); var trust = Path.Combine(root, "trusted-manifests.json"); File.WriteAllText(trust, JsonSerializer.Serialize(trusted)); File.WriteAllText(Path.Combine(root, "health-hang"), "owned synthetic hang");
            var health = Path.Combine(AppContext.BaseDirectory, "Jindan.Package.Tests.exe");
            Assert(await Jindan.Update.Tool.Program.Main(["apply", "--root", root, "--module-id", "projects", "--candidate", two, "--expected", "1.0.0", "--patch-id", "cli-timeout", "--trust", trust, "--health-exe", health, "--health-timeout", "2"]) == 2 && ReadManifest(Installed(root)).Version == "1.0.0", "Timed-out CLI did not roll back");
            var pid = int.Parse(File.ReadAllText(Path.Combine(root, "health.pid"))); try { using var process = Process.GetProcessById(pid); Assert(process.HasExited, "Owned timed-out health process remains alive"); } catch (ArgumentException) { }
        });
        await RunSnapshot69Tests();
        var report = new { roadmap = "66", review = "69", pass, fail, packagedRoot, packagedAssemblies, fixtureV1Sha256 = ModuleCatalog.Hash(v1), fixtureV2Sha256 = ModuleCatalog.Hash(v2), workspace, workspaceFileSystem = new DriveInfo(Path.GetPathRoot(repo)!).DriveFormat, ownedNtfsReparseRoots, ntfsFixtureRetainedForInspection = true, reportReady = false, supervisorAccepted = false, tests = results }; File.WriteAllText(Path.Combine(workspace, "RESULT.json"), JsonSerializer.Serialize(report, ModuleCatalog.JsonOptions)); Console.WriteLine($"PACKAGE_TESTS pass={pass} fail={fail} evidence={workspace}"); return fail == 0 ? 0 : 1;
    }
    private static string NewWorkspace() { var path = Path.Combine(repo, "artifacts", "package-tests", DateTime.UtcNow.ToString("yyyyMMddTHHmmss") + "-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(path); return path; }
    private sealed class Migration : IDataSchemaMigration
    {
        public int FromSchema => 1; public int ToSchema => 2;
        public Task ApplyAsync(string userDataDirectory, CancellationToken cancellationToken) { cancellationToken.ThrowIfCancellationRequested(); File.WriteAllText(Path.Combine(userDataDirectory, "migrated.json"), "{\"schema\":2,\"synthetic\":true}"); File.WriteAllText(Path.Combine(userDataDirectory, "user.json"), "{\"schema\":2}"); return Task.CompletedTask; }
    }
}
