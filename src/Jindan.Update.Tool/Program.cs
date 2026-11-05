using System.Diagnostics;
using System.Text.Json;
using Jindan.ModuleHost;
using Jindan.Update;

namespace Jindan.Update.Tool;

public static class Program
{
    private static readonly HashSet<string> AllowedOptions = new(StringComparer.Ordinal) { "--entry", "--entry-type", "--module-id", "--version", "--out", "--schema", "--host-major", "--file", "--files-json", "--trust", "--package", "--approve-local-manifest", "--root", "--candidate", "--expected", "--patch-id", "--health-exe", "--health-timeout" };
    public sealed record ExplicitResource(string Source, string Path);
    private sealed class Options
    {
        public string Command { get; }
        private readonly Dictionary<string, List<string>> values = new(StringComparer.Ordinal);
        public Options(string[] args)
        {
            if (args.Length == 0) throw new PackageException("USAGE", "Specify pack, trust-add, verify, apply, rollback or recover.");
            Command = args[0];
            for (var index = 1; index < args.Length; index++)
            {
                var key = args[index]; if (!AllowedOptions.Contains(key)) throw new PackageException("USAGE", "Unknown command option.");
                var value = key == "--approve-local-manifest" ? "true" : ++index < args.Length ? args[index] : throw new PackageException("USAGE", "An option value is absent.");
                if (!values.TryGetValue(key, out var list)) values[key] = list = [];
                if (list.Count > 0 && key != "--file") throw new PackageException("USAGE", "An option is duplicated."); list.Add(value);
            }
        }
        public string Required(string name) => values.TryGetValue(name, out var list) ? list[0] : throw new PackageException("USAGE", "A required option is absent.");
        public string? Get(string name) => values.TryGetValue(name, out var list) ? list[0] : null;
        public IEnumerable<string> Files => values.TryGetValue("--file", out var list) ? list : [];
        public int Number(string name, int fallback) => Get(name) is string text && int.TryParse(text, out var value) && value > 0 ? value : Get(name) is null ? fallback : throw new PackageException("USAGE", "An option requires a positive integer.");
    }
    public static string[] ReadTrustedHashes(string path)
    {
        if (!File.Exists(path)) throw new PackageException("TRUST_MISSING", "An explicit local trust file is required.");
        ModuleCatalog.RejectReparse(path);
        if (new FileInfo(path).Length > 1024 * 1024) throw new PackageException("TRUST_INVALID", "Local trust file exceeds its limit.");
        string[] hashes;
        try { hashes = JsonSerializer.Deserialize<string[]>(File.ReadAllBytes(path)) ?? throw new JsonException(); } catch (JsonException) { throw new PackageException("TRUST_INVALID", "Local trust file is invalid."); }
        if (hashes.Length > 10000 || hashes.Any(x => x is null || x.Length != 64 || x.Any(c => !char.IsAsciiHexDigit(c)))) throw new PackageException("TRUST_INVALID", "Local trust file contains an invalid manifest hash.");
        return hashes.Distinct(StringComparer.OrdinalIgnoreCase).Select(x => x.ToLowerInvariant()).ToArray();
    }
    private static void AtomicTrust(string path, IEnumerable<string> hashes)
    {
        var full = Path.GetFullPath(path); Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        if (File.Exists(full)) ModuleCatalog.RejectReparse(full);
        using var lease = new FileStream(full + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var previous = File.Exists(full) ? ReadTrustedHashes(full) : [];
        var temporary = full + ".tmp-" + Guid.NewGuid().ToString("N");
        try { File.WriteAllText(temporary, JsonSerializer.Serialize(previous.Concat(hashes).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(), ModuleCatalog.JsonOptions)); File.Move(temporary, full, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static object Pack(Options options)
    {
        var entry = Path.GetFullPath(options.Required("--entry")); var root = Path.GetFullPath(options.Required("--out"));
        if (!File.Exists(entry) || !entry.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) throw new PackageException("ENTRY_MISSING", "Explicit module entry DLL is absent."); ModuleCatalog.RejectReparse(entry);
        if (Directory.Exists(root) && Directory.EnumerateFileSystemEntries(root).Any()) throw new PackageException("OUTPUT_EXISTS", "Package output must be a fresh empty directory.");
        Directory.CreateDirectory(root); ModuleCatalog.RejectReparse(root);
        var sources = new List<(string Source, string Relative)> { (entry, Path.GetFileName(entry)) };
        foreach (var resource in options.Files) { var split = resource.IndexOf("::", StringComparison.Ordinal); if (split < 1) throw new PackageException("USAGE", "Explicit resource syntax is absolute-source::relative-target."); sources.Add((Path.GetFullPath(resource[..split]), resource[(split + 2)..])); }
        if (options.Get("--files-json") is string resourcesPath)
        {
            if (new FileInfo(resourcesPath).Length > 8 * 1024 * 1024) throw new PackageException("LIMIT", "Explicit resource list exceeds its limit.");
            var resources = JsonSerializer.Deserialize<ExplicitResource[]>(File.ReadAllBytes(resourcesPath), ModuleCatalog.JsonOptions) ?? throw new PackageException("USAGE", "Explicit resource list is invalid.");
            if (resources.Length > 9999 || resources.Any(r => r is null || string.IsNullOrWhiteSpace(r.Source) || string.IsNullOrWhiteSpace(r.Path))) throw new PackageException("LIMIT", "Explicit resource list is invalid.");
            sources.AddRange(resources.Select(r => (System.IO.Path.GetFullPath(r.Source), r.Path)));
        }
        if (sources.Count > 10000) throw new PackageException("LIMIT", "Explicit module payload count exceeds its limit.");
        long total = 0;
        foreach (var source in sources) { ModuleCatalog.RejectReparse(source.Source); var length = new FileInfo(source.Source).Length; if (length > 256L * 1024 * 1024 || total > 512L * 1024 * 1024 - length) throw new PackageException("LIMIT", "Explicit module payload size exceeds its limit."); total += length; }
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var files = new List<PackageFile>();
        foreach (var (source, relative) in sources)
        {
            var target = ModuleCatalog.SafePath(root, relative); if (!paths.Add(relative)) throw new PackageException("DUPLICATE", "Package resource path is duplicated."); ModuleCatalog.RejectReparse(source);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.Copy(source, target, false); files.Add(new(relative, new FileInfo(target).Length, ModuleCatalog.Hash(target)));
        }
        var major = options.Number("--host-major", 1); var manifest = new ModuleManifest { ModuleId = options.Required("--module-id"), Version = options.Required("--version"), EntryAssembly = Path.GetFileName(entry), EntryType = options.Required("--entry-type"), MinimumHostContractMajor = major, MaximumHostContractMajor = major, DataSchemaVersion = options.Number("--schema", 1), Files = files.ToArray() };
        var manifestPath = Path.Combine(root, ModuleCatalog.ManifestName); File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, ModuleCatalog.JsonOptions)); var sha = ModuleCatalog.Hash(manifestPath);
        var verified = ModuleCatalog.Verify(root, new([sha]), major);
        return new { status = "packaged-not-trusted", verified.Manifest.ModuleId, verified.Manifest.Version, verified.ManifestSha256, packageDirectory = root, signing = "not-configured", reportReady = false, supervisorAccepted = false };
    }
    public static async Task<bool> RunOwnedHealthAsync(string executable, string installationRoot, CancellationToken cancellationToken)
    {
        var info = new ProcessStartInfo(Path.GetFullPath(executable)) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true, WorkingDirectory = Path.GetFullPath(installationRoot) };
        info.ArgumentList.Add("--healthcheck"); info.ArgumentList.Add("--installation-root"); info.ArgumentList.Add(Path.GetFullPath(installationRoot));
        info.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1"; info.Environment["DOTNET_GENERATE_ASPNET_CERTIFICATE"] = "false";
        using var process = Process.Start(info) ?? throw new PackageException("HEALTH_START_FAILED", "Owned health process could not start.");
        var stdout = DrainAsync(process.StandardOutput); var stderr = DrainAsync(process.StandardError);
        try { await process.WaitForExitAsync(cancellationToken); await Task.WhenAll(stdout, stderr); return process.ExitCode == 0; }
        catch { if (!process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(); } await Task.WhenAll(stdout, stderr); throw; }
    }
    private static async Task DrainAsync(StreamReader reader) { var buffer = new char[4096]; while (await reader.ReadAsync(buffer) > 0) { } }
    public static async Task<int> Main(string[] args)
    {
        try
        {
            var options = new Options(args); object result;
            if (options.Command == "pack") result = Pack(options);
            else if (options.Command == "trust-add")
            {
                if (options.Get("--approve-local-manifest") != "true") throw new PackageException("APPROVAL_REQUIRED", "Trust enrollment requires explicit --approve-local-manifest; hashes are not publisher authentication.");
                var directory = Path.GetFullPath(options.Required("--package")); var hash = ModuleCatalog.Hash(Path.Combine(directory, ModuleCatalog.ManifestName)); var verified = ModuleCatalog.Verify(directory, new([hash]), options.Number("--host-major", 1));
                AtomicTrust(options.Required("--trust"), [hash]); result = new { status = "explicit-local-trust-enrolled", verified.Manifest.ModuleId, verified.ManifestSha256, signing = "not-configured" };
            }
            else
            {
                var trust = new ModuleTrustPolicy(ReadTrustedHashes(options.Required("--trust"))); var hostMajor = options.Number("--host-major", 1); var coordinator = new UpdateCoordinator(trust, hostMajor);
                switch (options.Command)
                {
                    case "verify": var verified = ModuleCatalog.Verify(options.Required("--package"), trust, hostMajor); result = new { status = "verified", verified.Manifest.ModuleId, verified.Manifest.Version, verified.ManifestSha256 }; break;
                    case "apply":
                        var root = options.Required("--root"); var healthExe = options.Required("--health-exe"); var timeout = TimeSpan.FromSeconds(options.Number("--health-timeout", 20));
                        result = await coordinator.ApplyAsync(new(root, options.Required("--module-id"), options.Required("--candidate"), options.Required("--expected"), options.Required("--patch-id")), (_, ct) => RunOwnedHealthAsync(healthExe, root, ct), healthTimeout: timeout); break;
                    case "rollback": await coordinator.RollbackLastAsync(options.Required("--root")); result = new { status = "rolled-back", restartAndHealthRequired = true }; break;
                    case "recover": await coordinator.RecoverInterruptedAsync(options.Required("--root")); result = new { status = "recovery-checked", restartAndHealthRequired = true }; break;
                    default: throw new PackageException("USAGE", "Unknown command.");
                }
            }
            Console.WriteLine(JsonSerializer.Serialize(new { ok = true, value = result, reportReady = false, supervisorAccepted = false }, ModuleCatalog.JsonOptions)); return 0;
        }
        catch (Exception ex) when (ex is PackageException or IOException or UnauthorizedAccessException or OperationCanceledException or JsonException or System.ComponentModel.Win32Exception)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { ok = false, code = ex is PackageException package ? package.Code : ex is OperationCanceledException ? "CANCELLED_OR_TIMEOUT" : "LOCAL_OPERATION_FAILED", message = ex is PackageException ? ex.Message : "Local operation failed; inspect the owned installation without exposing document or credential content.", reportReady = false, supervisorAccepted = false }, ModuleCatalog.JsonOptions)); return 2;
        }
    }
}
