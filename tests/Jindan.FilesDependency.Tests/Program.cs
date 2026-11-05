using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;
using Jindan.Contracts;
using Jindan.Desktop.Contracts;
using Jindan.ModuleHost;

static class Program
{
    static string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
    static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    static object[] Chain(Exception exception) { var entries = new List<object>(); for (var error = exception; error is not null; error = error.InnerException) entries.Add(new { type = error.GetType().FullName, code = error is PackageException package ? package.Code : null, error.Message }); return entries.ToArray(); }
    [STAThread] static int Main(string[] args)
    {
        var app = Path.GetFullPath(args[0]); var output = Path.GetFullPath(args[1]); bool old = args.Contains("--expect-old"); if (File.Exists(output)) throw new Exception("Fresh result required"); Directory.CreateDirectory(Path.GetDirectoryName(output)!); var checks = new List<object>(); int pass = 0, fail = 0;
        var shared = new[] { typeof(WorkRecord).Assembly, typeof(IDesktopModule).Assembly, typeof(ModuleCatalog).Assembly }; foreach (var assembly in shared) Assert(Hash(assembly.Location) == Hash(Path.Combine(app, assembly.GetName().Name + ".dll")), "Exact host/shared assembly differs: " + assembly.GetName().Name);
        try
        {
            var directory = Path.Combine(app, "modules", "files"); var approved = JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(app, "trusted-manifests.json")))!; var module = ModuleCatalog.Verify(directory, new ModuleTrustPolicy(approved)); pass++; checks.Add(new { name = "Exact Files catalog and manifest hashes validate under existing trust", pass = true, module.ManifestSha256 });
            using var scope = new ModuleAssemblyScope(module); var entry = (IDesktopModule)scope.CreateEntry(); Assert(entry.ModuleId == "files", "Actual entry did not load"); pass++; checks.Add(new { name = "Actual Files module entry loads in its isolated ModuleAssemblyScope", pass = true });
            Exception? dependencyError = null; Assembly? infrastructure = null;
            try { var window = entry.GetType().Assembly.GetType("Jindan.Modules.Files.DriveCacheWindow", true)!; var field = window.GetField("cache", BindingFlags.NonPublic | BindingFlags.Instance)!; infrastructure = field.FieldType.Assembly; }
            catch (Exception error) { dependencyError = error; }
            if (old)
            {
                Assert(dependencyError is not null, "Expected undeclared runtime dependency did not fail"); var text = dependencyError!.ToString(); Assert(text.Contains("DEPENDENCY_NOT_DECLARED", StringComparison.Ordinal) || text.Contains("neither a shared contract nor declared payload", StringComparison.Ordinal), "Failure was not actual undeclared dependency policy"); pass++; checks.Add(new { name = "Pre-fix actual DriveCacheWindow field dependency fails existing explicit loader policy", expectedFinding = true, productionPass = false, error = Chain(dependencyError) });
            }
            else
            {
                if (dependencyError is not null) throw dependencyError; Assert(infrastructure is not null && AssemblyLoadContext.GetLoadContext(infrastructure) == scope, "Infrastructure did not load from declared module scope");
                foreach (var name in new[] { "Jindan.Infrastructure", "Jindan.Core" }) { var declared = module.Manifest.Files.Single(f => f.Path == name + ".dll"); var assembly = scope.LoadFromAssemblyName(new AssemblyName(name)); Assert(AssemblyLoadContext.GetLoadContext(assembly) == scope && Hash(assembly.Location) == declared.Sha256 && Hash(assembly.Location) == Hash(Path.Combine(app, name + ".dll")), "Dependency payload/host source SHA differs: " + name); pass++; checks.Add(new { name = "Declared exact module dependency loads with expected SHA: " + name, pass = true, relative = declared.Path, sha256 = declared.Sha256 }); }
                Assert(shared.All(a => AssemblyLoadContext.GetLoadContext(a) == AssemblyLoadContext.Default), "Shared contract context changed"); pass++; checks.Add(new { name = "Host loader policy and shared contract identities remain unchanged", pass = true });
            }
            entry.Dispose();
        }
        catch (Exception error) { fail++; checks.Add(new { name = "dependency-probe", pass = false, error = Chain(error) }); }
        File.WriteAllText(output, JsonSerializer.Serialize(new { pass, fail, mode = old ? "Expected pre-fix actual loader failure" : "Fixed explicit payload regression", app, checks, noGui = true, reportReady = false, supervisorAccepted = false }, new JsonSerializerOptions { WriteIndented = true })); Console.WriteLine($"FILES_DEPENDENCY70 pass={pass} fail={fail} output={output}"); return fail == 0 ? 0 : 1;
    }
}
