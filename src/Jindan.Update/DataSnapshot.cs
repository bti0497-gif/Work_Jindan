using System.Security.Cryptography;
using System.Text.Json;
using Jindan.ModuleHost;

namespace Jindan.Update;

internal sealed record SnapshotBinding(string PatchId, string ModuleId, string BeforeManifestSha256, string DataRoot);
internal sealed record SnapshotEntry(string Path, string Kind, long Size, string? Sha256);
internal sealed record SnapshotManifest(int Schema, SnapshotBinding Binding, SnapshotEntry[] Entries);

// A snapshot is one atomically published directory containing content/ and its
// complete manifest. The manifest hash is separately pinned in the update journal.
internal static class DataSnapshot
{
    private const int ManifestLimit = 16 * 1024 * 1024;
    private const int EntryLimit = 100000;
    private static bool Sha(string? value) => value is { Length: 64 } && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    private static SnapshotEntry[] Inventory(string root)
    {
        if (!Directory.Exists(root)) throw new PackageException("DATA_BACKUP_MISSING", "A required data tree is absent.");
        var entries = new List<SnapshotEntry>();
        void Walk(string directory)
        {
            ModuleCatalog.RejectReparse(directory);
            foreach (var p in Directory.EnumerateFileSystemEntries(directory))
            {
                ModuleCatalog.RejectReparse(p);
                if (entries.Count >= EntryLimit) throw new PackageException("DATA_SNAPSHOT_LIMIT", "Snapshot entry count exceeds its limit.");
                var relative = Path.GetRelativePath(root, p).Replace('\\', '/');
                _ = ModuleCatalog.SafePath(root, relative);
                if (Directory.Exists(p)) { entries.Add(new(relative, "directory", 0, null)); Walk(p); }
                else
                {
                    using var input = new FileStream(p, FileMode.Open, FileAccess.Read, FileShare.Read);
                    var size = input.Length; var sha = Convert.ToHexStringLower(SHA256.HashData(input));
                    if (input.Length != size) throw new PackageException("DATA_SNAPSHOT_CHANGED", "Data changed while being read.");
                    entries.Add(new(relative, "file", size, sha));
                }
            }
        }
        Walk(root);
        return entries.OrderBy(e => e.Path, StringComparer.Ordinal).ToArray();
    }
    private static void Equal(SnapshotEntry[] expected, SnapshotEntry[] actual)
    {
        if (!expected.SequenceEqual(actual)) throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot inventory, sizes or hashes do not match.");
    }
    private static void CopyContent(string from, string to, SnapshotEntry[] entries, CancellationToken ct)
    {
        Directory.CreateDirectory(to); ModuleCatalog.RejectReparse(to);
        foreach (var entry in entries.Where(e => e.Kind == "directory").OrderBy(e => e.Path.Length))
        { ct.ThrowIfCancellationRequested(); Directory.CreateDirectory(ModuleCatalog.SafePath(to, entry.Path)); }
        foreach (var entry in entries.Where(e => e.Kind == "file"))
        {
            ct.ThrowIfCancellationRequested(); var source = ModuleCatalog.SafePath(from, entry.Path); var target = ModuleCatalog.SafePath(to, entry.Path);
            using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.WriteThrough);
            input.CopyTo(output); output.Flush(true);
        }
    }
    public static string Publish(string data, string destination, SnapshotBinding binding, CancellationToken ct, Action<string>? observer = null)
    {
        if (Directory.Exists(destination) || File.Exists(destination)) throw new PackageException("DATA_BACKUP_EXISTS", "Snapshot publication target already exists.");
        var expected = Inventory(data); ct.ThrowIfCancellationRequested();
        var staging = destination + ".staging-" + Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(staging);
        CopyContent(data, Path.Combine(staging, "content"), expected, ct);
        Equal(expected, Inventory(Path.Combine(staging, "content"))); Equal(expected, Inventory(data));
        observer?.Invoke("snapshot-content-staged");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new SnapshotManifest(1, binding, expected), ModuleCatalog.JsonOptions);
        if (bytes.Length > ManifestLimit) throw new PackageException("DATA_SNAPSHOT_LIMIT", "Snapshot manifest exceeds its limit.");
        var manifest = Path.Combine(staging, "manifest.json");
        using (var output = new FileStream(manifest, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { output.Write(bytes); output.Flush(true); }
        var hash = Convert.ToHexStringLower(SHA256.HashData(bytes));
        _ = Validate(staging, hash, binding); ct.ThrowIfCancellationRequested();
        observer?.Invoke("snapshot-ready");
        Directory.Move(staging, destination); // Same-volume publication; never delete the original data.
        _ = Validate(destination, hash, binding);
        observer?.Invoke("snapshot-published");
        return hash;
    }
    private static void UniqueProperties(JsonElement e)
    {
        if (e.ValueKind == JsonValueKind.Object) { var names = new HashSet<string>(StringComparer.Ordinal); foreach (var p in e.EnumerateObject()) { if (!names.Add(p.Name)) throw new JsonException(); UniqueProperties(p.Value); } }
        else if (e.ValueKind == JsonValueKind.Array) foreach (var item in e.EnumerateArray()) UniqueProperties(item);
    }
    public static SnapshotManifest Validate(string snapshot, string? expectedHash, SnapshotBinding binding)
    {
        if (!Directory.Exists(snapshot)) throw new PackageException("DATA_BACKUP_MISSING", "Schema rollback snapshot is absent.");
        if (!Sha(expectedHash)) throw new PackageException("DATA_BACKUP_UNVERIFIABLE", "Snapshot has no journal-bound complete manifest; manual recovery is required.");
        ModuleCatalog.RejectReparse(snapshot); var manifestPath = ModuleCatalog.SafePath(snapshot, "manifest.json");
        if (!File.Exists(manifestPath)) throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot manifest is absent.");
        if (new FileInfo(manifestPath).Length > ManifestLimit) throw new PackageException("DATA_SNAPSHOT_LIMIT", "Snapshot manifest exceeds its limit.");
        var bytes = File.ReadAllBytes(manifestPath);
        if (Convert.ToHexStringLower(SHA256.HashData(bytes)) != expectedHash) throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot manifest no longer matches its journal.");
        SnapshotManifest value;
        try { using var doc = JsonDocument.Parse(bytes); UniqueProperties(doc.RootElement); value = JsonSerializer.Deserialize<SnapshotManifest>(bytes, ModuleCatalog.JsonOptions) ?? throw new JsonException(); }
        catch (JsonException) { throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot manifest is invalid."); }
        var actual = value.Binding;
        if (value.Schema != 1 || actual is null || actual.PatchId != binding.PatchId || actual.ModuleId != binding.ModuleId || actual.BeforeManifestSha256 != binding.BeforeManifestSha256 || !string.Equals(actual.DataRoot, binding.DataRoot, StringComparison.OrdinalIgnoreCase) || value.Entries is null || value.Entries.Length > EntryLimit) throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot binding or inventory is invalid.");
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in value.Entries)
        {
            if (entry is null || !paths.Add(entry.Path) || entry.Kind is not ("file" or "directory") || entry.Size < 0 || (entry.Kind == "file" ? !Sha(entry.Sha256) : entry.Size != 0 || entry.Sha256 is not null)) throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot entries are invalid or duplicated.");
            _ = ModuleCatalog.SafePath(Path.Combine(snapshot, "content"), entry.Path);
        }
        var top = Directory.EnumerateFileSystemEntries(snapshot).Select(Path.GetFileName).ToHashSet(StringComparer.Ordinal);
        if (!top.SetEquals(["manifest.json", "content"])) throw new PackageException("DATA_BACKUP_INTEGRITY", "Snapshot contains undeclared entries.");
        VerifyContent(Path.Combine(snapshot, "content"), value);
        return value;
    }
    public static void VerifyContent(string directory, SnapshotManifest manifest) => Equal(manifest.Entries, Inventory(directory));
    public static void StageRestore(string snapshot, string destination, SnapshotManifest manifest)
    {
        if (Directory.Exists(destination) || File.Exists(destination)) throw new PackageException("DATA_RESTORE_CONFLICT", "Restore staging target already exists.");
        CopyContent(Path.Combine(snapshot, "content"), destination, manifest.Entries, CancellationToken.None);
        VerifyContent(destination, manifest);
    }
}
