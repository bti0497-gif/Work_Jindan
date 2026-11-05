using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Jindan.ModuleHost;

public sealed record PackageFile(string Path, long Size, string Sha256);
public sealed record PackageDependency(string ModuleId, string MinimumVersion);
public sealed record ModuleManifest
{
    public int SchemaVersion { get; init; } = 1;
    public string ModuleId { get; init; } = "";
    public string Version { get; init; } = "";
    public string EntryAssembly { get; init; } = "";
    public string EntryType { get; init; } = "";
    public int MinimumHostContractMajor { get; init; } = 1;
    public int MaximumHostContractMajor { get; init; } = 1;
    public int DataSchemaVersion { get; init; } = 1;
    public PackageDependency[] Dependencies { get; init; } = [];
    public PackageFile[] Files { get; init; } = [];
}
public sealed record VerifiedModule(ModuleManifest Manifest, string Directory, string ManifestSha256, string EntryAssemblyPath);
public sealed record CatalogError(string PackageDirectory, string Code, string Message);
public sealed record CatalogResult(IReadOnlyList<VerifiedModule> Modules, IReadOnlyList<CatalogError> Errors);
public sealed class PackageException(string code, string message) : Exception(message) { public string Code { get; } = code; }
public sealed class ModuleTrustPolicy(IEnumerable<string> approvedManifestSha256)
{
    private readonly HashSet<string> approved = new(approvedManifestSha256.Select(x => x.ToLowerInvariant()), StringComparer.Ordinal);
    public bool IsApproved(string sha256) => approved.Contains(sha256.ToLowerInvariant());
}
public static partial class ModuleCatalog
{
    public const string ManifestName = "module.json";
    public static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = false, WriteIndented = true, UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow };
    [GeneratedRegex("^[a-z][a-z0-9.-]{0,79}$")] private static partial Regex Identifier();
    public static string Hash(string path) { using var input = File.OpenRead(path); return Convert.ToHexStringLower(SHA256.HashData(input)); }
    public static string SafePath(string root, string relative)
    {
        if (string.IsNullOrWhiteSpace(relative) || relative.Contains('\\') || relative.Contains(':') || relative.StartsWith('/') || relative.Split('/').Any(s => s is "" or "." or ".." || s.EndsWith('.') || s.EndsWith(' ') || s.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)) throw new PackageException("PATH_INVALID", "Package path is not a strict relative path.");
        var full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new PackageException("PATH_INVALID", "Package path escapes its directory.");
        var cursor = Path.GetFullPath(root);
        if (System.IO.Directory.Exists(cursor)) RejectReparse(cursor);
        foreach (var segment in relative.Split('/')) { cursor = Path.Combine(cursor, segment); if (File.Exists(cursor) || System.IO.Directory.Exists(cursor)) RejectReparse(cursor); }
        return full;
    }
    public static void RejectReparse(string path)
    {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new PackageException("REPARSE_POINT", "Reparse points are not package files.");
    }
    public static VerifiedModule Verify(string packageDirectory, ModuleTrustPolicy trust, int hostContractMajor = 1)
    {
        var root = Path.GetFullPath(packageDirectory);
        if (!System.IO.Directory.Exists(root)) throw new PackageException("PACKAGE_MISSING", "Module package directory is absent.");
        RejectReparse(root);
        var manifestPath = Path.Combine(root, ManifestName);
        if (!File.Exists(manifestPath)) throw new PackageException("MANIFEST_MISSING", "Explicit module manifest is absent.");
        RejectReparse(manifestPath);
        if (new FileInfo(manifestPath).Length > 8 * 1024 * 1024) throw new PackageException("LIMIT", "Module manifest exceeds its limit.");
        var manifestBytes = File.ReadAllBytes(manifestPath);
        var manifestHash = Convert.ToHexStringLower(SHA256.HashData(manifestBytes));
        if (!trust.IsApproved(manifestHash)) throw new PackageException("UNTRUSTED", "Manifest is not enrolled in the trusted local policy.");
        ModuleManifest manifest;
        try { using var parsed = JsonDocument.Parse(manifestBytes); CheckDuplicateProperties(parsed.RootElement); manifest = JsonSerializer.Deserialize<ModuleManifest>(manifestBytes, JsonOptions) ?? throw new JsonException(); }
        catch (JsonException) { throw new PackageException("MANIFEST_INVALID", "Module manifest JSON is invalid."); }
        if (manifest.SchemaVersion != 1 || string.IsNullOrEmpty(manifest.ModuleId) || !Identifier().IsMatch(manifest.ModuleId) || !System.Version.TryParse(manifest.Version, out _) || string.IsNullOrWhiteSpace(manifest.EntryType) || manifest.DataSchemaVersion < 1 || manifest.Files is null || manifest.Dependencies is null) throw new PackageException("MANIFEST_INVALID", "Module identity or schema is invalid.");
        if (manifest.MinimumHostContractMajor < 1 || manifest.MaximumHostContractMajor < manifest.MinimumHostContractMajor || hostContractMajor < manifest.MinimumHostContractMajor || hostContractMajor > manifest.MaximumHostContractMajor) throw new PackageException("INCOMPATIBLE", "Module host contract is incompatible.");
        if (manifest.Files.Length is 0 or > 10000 || manifest.Files.Any(f => f is null)) throw new PackageException("LIMIT", "Module payload count is invalid.");
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase); long total = 0;
        foreach (var file in manifest.Files)
        {
            var full = SafePath(root, file.Path);
            if (!paths.Add(file.Path) || file.Path.Equals(ManifestName, StringComparison.OrdinalIgnoreCase)) throw new PackageException("DUPLICATE", "Package paths are duplicated.");
            if (file.Size < 0 || file.Size > 256L * 1024 * 1024 || total > 512L * 1024 * 1024 - file.Size) throw new PackageException("LIMIT", "Package size exceeds its limit.");
            total += file.Size;
            if (!File.Exists(full)) throw new PackageException("PAYLOAD_MISSING", "A declared module file is absent.");
            RejectAncestors(root, full);
            if (new FileInfo(full).Length != file.Size || !string.Equals(Hash(full), file.Sha256, StringComparison.OrdinalIgnoreCase)) throw new PackageException("HASH_MISMATCH", "Module file integrity check failed.");
        }
        foreach (var path in EnumerateSafeFiles(root))
        {
            var relative = Path.GetRelativePath(root, path).Replace('\\', '/');
            if (!relative.Equals(ManifestName, StringComparison.Ordinal) && !paths.Contains(relative)) throw new PackageException("UNDECLARED_FILE", "Package contains an undeclared file.");
        }
        var entry = SafePath(root, manifest.EntryAssembly);
        if (!manifest.EntryAssembly.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) || !paths.Contains(manifest.EntryAssembly)) throw new PackageException("ENTRY_MISSING", "Entry assembly is not a declared DLL.");
        var dependencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (manifest.Dependencies.Any(d => d is null || string.IsNullOrEmpty(d.ModuleId) || !Identifier().IsMatch(d.ModuleId) || !Version.TryParse(d.MinimumVersion, out _) || !dependencies.Add(d.ModuleId) || d.ModuleId == manifest.ModuleId)) throw new PackageException("DEPENDENCY_INVALID", "Module dependency declaration is invalid.");
        return new(manifest, root, manifestHash, entry);
    }
    private static void CheckDuplicateProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object) { var names = new HashSet<string>(StringComparer.Ordinal); foreach (var property in element.EnumerateObject()) { if (!names.Add(property.Name)) throw new JsonException(); CheckDuplicateProperties(property.Value); } }
        else if (element.ValueKind == JsonValueKind.Array) foreach (var item in element.EnumerateArray()) CheckDuplicateProperties(item);
    }
    public static IEnumerable<string> EnumerateSafeFiles(string directory)
    {
        RejectReparse(directory);
        foreach (var item in System.IO.Directory.EnumerateFileSystemEntries(directory)) { RejectReparse(item); if (System.IO.Directory.Exists(item)) { foreach (var child in EnumerateSafeFiles(item)) yield return child; } else yield return item; }
    }
    private static void RejectAncestors(string root, string path) { for (var cursor = path; !cursor.Equals(root, StringComparison.OrdinalIgnoreCase); cursor = Path.GetDirectoryName(cursor)!) RejectReparse(cursor); }
    public static CatalogResult VerifyInventory(IEnumerable<string> packageDirectories, ModuleTrustPolicy trust, int hostContractMajor = 1)
    {
        var modules = new List<VerifiedModule>(); var errors = new List<CatalogError>(); var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var directory in packageDirectories) try { var module = Verify(directory, trust, hostContractMajor); if (!ids.Add(module.Manifest.ModuleId)) { modules.RemoveAll(m => m.Manifest.ModuleId == module.Manifest.ModuleId); throw new PackageException("DUPLICATE_MODULE", "Module identity appears twice."); } modules.Add(module); } catch (Exception ex) when (ex is PackageException or IOException or UnauthorizedAccessException) { errors.Add(new(directory, ex is PackageException p ? p.Code : "IO_ERROR", ex is PackageException ? ex.Message : "Module files could not be read.")); }
        bool removed;
        do { removed = false; foreach (var module in modules.ToArray()) if (module.Manifest.Dependencies.Any(d => !modules.Any(m => m.Manifest.ModuleId == d.ModuleId && Version.Parse(m.Manifest.Version) >= Version.Parse(d.MinimumVersion)))) { modules.Remove(module); removed = true; errors.Add(new(module.Directory, "DEPENDENCY_MISSING", "A compatible explicit module dependency is absent.")); } } while (removed);
        return new(modules, errors);
    }
}
public sealed class ModuleAssemblyScope : AssemblyLoadContext, IDisposable
{
    private readonly VerifiedModule module;
    public ModuleAssemblyScope(VerifiedModule module) : base($"jindan:{module.Manifest.ModuleId}:{Guid.NewGuid():N}", isCollectible: true) { this.module = ModuleCatalog.Verify(module.Directory, new ModuleTrustPolicy([module.ManifestSha256]), module.Manifest.MinimumHostContractMajor); }
    protected override Assembly? Load(AssemblyName name)
    {
        if (name.Name is "Jindan.Contracts" or "Jindan.Desktop.Contracts") return Default.Assemblies.FirstOrDefault(a => a.GetName().Name == name.Name) ?? Default.LoadFromAssemblyName(name);
        var relative = name.Name + ".dll";
        var file = module.Manifest.Files.SingleOrDefault(f => f.Path.Equals(relative, StringComparison.OrdinalIgnoreCase));
        if (file is null)
        {
            if (name.Name is "netstandard" or "mscorlib" || name.Name?.StartsWith("System", StringComparison.Ordinal) == true || name.Name?.StartsWith("Microsoft.Win32", StringComparison.Ordinal) == true) return null;
            throw new PackageException("DEPENDENCY_NOT_DECLARED", "Managed module dependency is neither a shared contract nor declared payload.");
        }
        var path = ModuleCatalog.SafePath(module.Directory, file.Path);
        if (ModuleCatalog.Hash(path) != file.Sha256.ToLowerInvariant()) throw new PackageException("HASH_MISMATCH", "Module dependency changed since verification.");
        return LoadFromAssemblyPath(path);
    }
    protected override nint LoadUnmanagedDll(string unmanagedDllName) => throw new PackageException("NATIVE_DEPENDENCY_BLOCKED", "Module native dependencies require a separate explicit policy.");
    public object CreateEntry()
    {
        var checkedPackage = ModuleCatalog.Verify(module.Directory, new ModuleTrustPolicy([module.ManifestSha256]), module.Manifest.MinimumHostContractMajor);
        if (checkedPackage.Manifest.EntryType != module.Manifest.EntryType) throw new PackageException("ENTRY_INVALID", "Module entry changed since verification.");
        var assembly = LoadFromAssemblyPath(module.EntryAssemblyPath);
        return Activator.CreateInstance(assembly.GetType(module.Manifest.EntryType, throwOnError: true)!) ?? throw new PackageException("ENTRY_INVALID", "Module entry could not be instantiated.");
    }
    public void Dispose() => Unload();
}
