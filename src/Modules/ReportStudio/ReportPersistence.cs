using System.Collections.Concurrent;
using System.Text;
using Jindan.Contracts;
using Jindan.Desktop.Contracts;

namespace Jindan.Modules.ReportStudio;

public sealed class ReportWorkspaceException(string code) : IOException("The local report workspace rejected this operation.")
{
    public string Code { get; } = code;
}

public sealed partial class ReportDocument
{
    private const int ProfileLimit = 16 * 1024 * 1024;
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> ProfileGates = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _saveGate = new(1, 1);
    private string? _profileExpectedSha;
    private bool _profileLoaded;
    private bool _profileWritable;
    private byte[]? _lastSavedProfileBytes;
    private static void RequireLocal(bool condition, string code) { if (!condition) throw new ReportWorkspaceException(code); }
    private static bool Under(string root, string path) => path.Equals(root.TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase) || path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    private static string AbsoluteLocalPath(string path)
    {
        RequireLocal(Path.IsPathFullyQualified(path) && !path.StartsWith("\\\\", StringComparison.Ordinal) && !path.StartsWith("//", StringComparison.Ordinal), "EXPORT_LOCAL_PATH_REQUIRED"); var full = Path.GetFullPath(path); var tail = full[Path.GetPathRoot(full)!.Length..];
        RequireLocal(!tail.Contains(':') && tail.Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar], StringSplitOptions.None).All(part => !part.EndsWith(' ') && !part.EndsWith('.') && !part.Any(c => c < 32 || "<>\"|?*".Contains(c)) && !System.Text.RegularExpressions.Regex.IsMatch(part, @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)), "EXPORT_INVALID_PATH"); return full;
    }
    private static void CheckProtectedPath(string full)
    {
        foreach (var root in new[] { "F:/jindan", "E:/jindan", "F:/jindan-maintenance" }) RequireLocal(!Under(Path.GetFullPath(root), full), "PROTECTED_ROOT");
    }
    private static void CheckNoLinks(string path)
    {
        for (string? current = Path.GetFullPath(path); current != null; current = Path.GetDirectoryName(current))
        {
            try { RequireLocal(!File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint), "REPARSE_PATH"); }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
    }
    private Task AuthorizeProfile(bool write, CancellationToken ct) => _services is IReportWorkspaceAccess access ? access.AuthorizeReportWorkspaceAsync(Context, write, ct) : Task.FromException(new ReportWorkspaceException("REPORT_AUTHORIZATION_UNAVAILABLE"));
    private Task<bool> CanWriteProfile(CancellationToken ct) => _services is IReportWorkspaceAccess access ? access.CanWriteReportWorkspaceAsync(Context, ct) : Task.FromResult(false);
    private async Task<Jindan.Contracts.AssetInfo> ResolveScopedAsset(string id, string path, string sha, CancellationToken ct)
    {
        RequireLocal(_services is IReportWorkspaceAccess, "REPORT_AUTHORIZATION_UNAVAILABLE"); var asset = await ((IReportWorkspaceAccess)_services).ResolveExistingReportAssetAsync(Context, path, ct); RequireLocal(asset != null && asset.Id == id && asset.StoredPath == path && asset.Sha256 == sha, "REPORT_ASSET_PROJECT_MISMATCH"); return asset!;
    }
    private async Task SaveReadStateIfWritable() { if (await CanWriteProfile(Token)) await SaveAsync(Token); else { _dirty = false; UpdateReportActions(); } }
    private void CheckStoreRoot() { RequireLocal(Path.IsPathFullyQualified(_services.DataRoot), "REPORT_STORE_PATH"); var full = AbsoluteLocalPath(_projectRoot); CheckProtectedPath(full); CheckNoLinks(full); }
    private string ExportDestination(string path)
    {
        var full = AbsoluteLocalPath(path); CheckProtectedPath(full); foreach (var folder in new[] { "assets", "report-workspaces", "report-sessions" }) RequireLocal(!Under(Path.GetFullPath(Path.Combine(_services.DataRoot, folder)), full), "PROTECTED_STORE");
        RequireLocal(!File.Exists(full) && !Directory.Exists(full), "EXPORT_EXISTS"); RequireLocal(Directory.Exists(Path.GetDirectoryName(full)), "EXPORT_PARENT_REQUIRED"); CheckNoLinks(full); return full;
    }
    private async Task ExportNewBytes(string path, byte[] bytes, CancellationToken ct)
    {
        var generation = _generation; var context = Context; await AuthorizeProfile(false, ct); var full = ExportDestination(path); var temporary = full + ".export-" + Guid.NewGuid().ToString("N"); var created = false;
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true)) { created = true; await stream.WriteAsync(bytes, ct); await stream.FlushAsync(ct); stream.Flush(true); }
            ct.ThrowIfCancellationRequested(); RequireLocal(_generation == generation && Context == context, "REPORT_CONTEXT_CHANGED"); ExportDestination(full); File.Move(temporary, full, false); created = false;
        }
        finally { if (created && File.Exists(temporary)) File.Delete(temporary); }
    }
    private static byte[]? ReadProfileBytes(string path)
    {
        CheckNoLinks(path); if (!File.Exists(path)) return null; using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read); RequireLocal(stream.Length is > 0 and <= ProfileLimit, "REPORT_PROFILE_LIMIT"); var bytes = new byte[(int)stream.Length]; stream.ReadExactly(bytes); RequireLocal(stream.Position == stream.Length, "REPORT_PROFILE_CHANGED"); return bytes;
    }
    private async Task WriteProfileSnapshot(byte[] bytes, long generation, DocumentContext context, string scopeRoot, CancellationToken ct)
    {
        RequireLocal(bytes.Length is > 0 and <= ProfileLimit, "REPORT_PROFILE_LIMIT"); var path = Path.Combine(scopeRoot, "workspace.json"); var gate = ProfileGates.GetOrAdd(path, _ => new SemaphoreSlim(1, 1)); await gate.WaitAsync(ct);
        try
        {
            CheckStoreRoot(); var leasePath = path + ".lease"; CheckNoLinks(leasePath); await using var lease = new FileStream(leasePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            RequireLocal(_profileLoaded && Context == context && _projectRoot == scopeRoot && _generation == generation, "REPORT_CONTEXT_CHANGED"); var previous = ReadProfileBytes(path); RequireLocal((previous == null ? null : Hash(previous)) == _profileExpectedSha, "REPORT_PROFILE_STALE");
            var temporary = path + ".save-" + Guid.NewGuid().ToString("N"); var created = false;
            try
            {
                await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true)) { created = true; await stream.WriteAsync(bytes, ct); await stream.FlushAsync(ct); stream.Flush(true); }
                ct.ThrowIfCancellationRequested(); RequireLocal(Context == context && _projectRoot == scopeRoot && _generation == generation, "REPORT_CONTEXT_CHANGED"); CheckNoLinks(path); CheckNoLinks(path + ".bak"); var now = ReadProfileBytes(path); RequireLocal((now == null ? null : Hash(now)) == _profileExpectedSha, "REPORT_PROFILE_STALE");
                if (previous == null) File.Move(temporary, path, false); else File.Replace(temporary, path, path + ".bak", true); created = false; _profileExpectedSha = Hash(bytes); _lastSavedProfileBytes = bytes.ToArray();
            }
            finally { if (created && File.Exists(temporary)) File.Delete(temporary); }
        }
        finally { gate.Release(); }
    }
    private Task Atomic(string destination, string text, CancellationToken ct) => AtomicBytes(destination, Encoding.UTF8.GetBytes(text), ct);
    private async Task AtomicBytes(string destination, byte[] bytes, CancellationToken ct)
    {
        var full = AbsoluteLocalPath(destination); CheckStoreRoot(); RequireLocal(Under(_projectRoot, full) && !full.Equals(Path.Combine(_projectRoot, "workspace.json"), StringComparison.OrdinalIgnoreCase), "REPORT_INTERNAL_PATH"); CheckNoLinks(full); RequireLocal(!File.Exists(full) && !Directory.Exists(full), "REPORT_INTERNAL_EXISTS"); var temporary = full + ".write-" + Guid.NewGuid().ToString("N"); var created = false;
        try { await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true)) { created = true; await stream.WriteAsync(bytes, ct); await stream.FlushAsync(ct); stream.Flush(true); } ct.ThrowIfCancellationRequested(); CheckNoLinks(full); File.Move(temporary, full, false); created = false; }
        finally { if (created && File.Exists(temporary)) File.Delete(temporary); }
    }
}
