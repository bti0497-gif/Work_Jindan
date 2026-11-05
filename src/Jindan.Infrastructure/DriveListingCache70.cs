using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jindan.Contracts.Drive;
namespace Jindan.Infrastructure.Drive;

public static class DriveBoundary
{
    static readonly HashSet<string> PublicCodes = new(["DRIVE_NOT_CONFIGURED", "DRIVE_SCOPE_DENIED", "DRIVE_FOLDER_SCOPE", "DRIVE_SCOPE_MISMATCH", "DRIVE_DUPLICATE", "DRIVE_ENTRY", "DRIVE_LIST_LIMIT", "DRIVE_TREE_LIMIT", "DRIVE_STALE_LISTING", "DRIVE_CACHE_LIMIT", "DRIVE_PATH", "DRIVE_ID"], StringComparer.Ordinal);
    public static string ErrorCode(Exception error, string fallback) => error is DriveBoundaryException boundary && PublicCodes.Contains(boundary.Code) ? boundary.Code : fallback;
    public static void Require(bool value, string code) { if (!value) throw new DriveBoundaryException(code); }
    public static void Id(string? id) => Require(id is { Length: > 0 and <= 160 } && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'), "DRIVE_ID");
    public static void Scope(DriveScope scope) { Id(scope.UserId); Id(scope.ProjectId); Id(scope.RootId); }
    public static bool Visible(DriveEntry entry) => !new[] { ".system", "resources", "resouces" }.Contains(entry.Name, StringComparer.OrdinalIgnoreCase);
    public static void Entries(IReadOnlyList<DriveEntry> entries)
    {
        Require(entries is not null && entries.Count <= 10000, "DRIVE_LIST_LIMIT");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in entries!) { Require(entry is not null, "DRIVE_ENTRY"); Id(entry!.Id); Require(ids.Add(entry.Id), "DRIVE_DUPLICATE"); Require(entry.Name is { Length: > 0 and <= 500 } && !entry.Name.Any(char.IsControl) && entry.MimeType is { Length: > 0 and <= 200 } && entry.Size >= 0, "DRIVE_ENTRY"); }
    }
    public static void LocalPath(string path)
    {
        Require(Path.IsPathFullyQualified(path) && !path.StartsWith("\\\\", StringComparison.Ordinal), "DRIVE_PATH");
        var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        foreach (var protectedRoot in new[] { "F:/jindan", "F:/jindan-maintenance" }) { var root = Path.GetFullPath(protectedRoot).TrimEnd(Path.DirectorySeparatorChar); Require(!full.Equals(root, StringComparison.OrdinalIgnoreCase) && !full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "DRIVE_PROTECTED_PATH"); }
        for (var current = new DirectoryInfo(full); current is not null; current = current.Parent) if (current.Exists) Require((current.Attributes & FileAttributes.ReparsePoint) == 0, "DRIVE_PATH");
        if (File.Exists(full)) Require((File.GetAttributes(full) & FileAttributes.ReparsePoint) == 0, "DRIVE_PATH");
    }
}

public sealed class NotConfiguredDriveProvider : IDriveListingProvider
{
    public bool IsSynthetic => false;
    public Task<DriveListing> ListAsync(DriveScope scope, string folderId, CancellationToken ct) => Task.FromException<DriveListing>(new DriveBoundaryException("DRIVE_NOT_CONFIGURED"));
}

/// <summary>Scoped metadata cache. No content download, credential handling, background startup, or cloud mutation.</summary>
public sealed class DriveListingCache : IDriveListingCache
{
    readonly IDriveListingProvider provider; readonly Func<DateTimeOffset> clock; readonly object gate = new();
    readonly Dictionary<string, DriveCachedFolder> folders = new(StringComparer.Ordinal);
    readonly Dictionary<string, long> revisions = new(StringComparer.Ordinal);
    readonly Dictionary<string, Task<DriveCachedFolder>> pending = new(StringComparer.Ordinal);
    readonly CancellationTokenSource lifetime = new(); Task? warming; bool disposed;
    public DriveScope Scope { get; }
    public string CacheFile { get; }
    public DriveCacheStatus Status { get { lock (gate) return status with { CachedFolders = folders.Count, Syncing = pending.Count != 0 || warming is not null }; } }
    DriveCacheStatus status;
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNameCaseInsensitive = false };
    sealed record CacheFileData(int Schema, DriveScope Scope, bool Synthetic, IReadOnlyList<DriveCachedFolder> Folders);
    public DriveListingCache(string cacheDirectory, DriveScope scope, IDriveListingProvider provider, Func<DateTimeOffset>? clock = null)
    {
        DriveBoundary.Scope(scope); DriveBoundary.LocalPath(cacheDirectory); Scope = scope; this.provider = provider; this.clock = clock ?? (() => DateTimeOffset.UtcNow);
        var key = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(scope))));
        Directory.CreateDirectory(cacheDirectory); CacheFile = Path.Combine(cacheDirectory, key + ".json"); status = new(0, false, 0, 0, null, null, true, provider.IsSynthetic);
        Hydrate();
    }
    void Hydrate()
    {
        if (!File.Exists(CacheFile)) return;
        DriveBoundary.LocalPath(CacheFile); DriveBoundary.Require(new FileInfo(CacheFile).Length <= 16 * 1024 * 1024, "DRIVE_CACHE_LIMIT");
        try
        {
            var data = JsonSerializer.Deserialize<CacheFileData>(File.ReadAllBytes(CacheFile), Json) ?? throw new DriveBoundaryException("DRIVE_CACHE_INVALID");
            DriveBoundary.Require(data.Schema == 1, "DRIVE_CACHE_SCHEMA"); DriveBoundary.Require(data.Scope == Scope && data.Synthetic == provider.IsSynthetic, "DRIVE_SCOPE_MISMATCH");
            DriveBoundary.Require(data.Folders is not null && data.Folders.Count <= 1000, "DRIVE_CACHE_LIMIT");
            foreach (var entry in data.Folders!) { DriveBoundary.Id(entry.FolderId); DriveBoundary.Entries(entry.Entries); DriveBoundary.Require(!folders.ContainsKey(entry.FolderId) && entry.UpdatedAt <= clock().AddMinutes(5), "DRIVE_CACHE_INVALID"); folders.Add(entry.FolderId, entry with { Entries = entry.Entries.Where(DriveBoundary.Visible).ToArray() }); }
            // A persisted folder is permitted only if reached from the selected root.
            var reachable = Reachable(); DriveBoundary.Require(folders.Keys.All(reachable.Contains), "DRIVE_CACHE_SCOPE");
            status = status with { LastSynced = folders.Values.Select(x => (DateTimeOffset?)x.UpdatedAt).Max() };
        }
        catch (JsonException) { throw new DriveBoundaryException("DRIVE_CACHE_INVALID"); }
    }
    HashSet<string> Reachable()
    {
        var reached = new HashSet<string>(StringComparer.Ordinal) { Scope.RootId }; var queue = new Queue<string>(); queue.Enqueue(Scope.RootId);
        while (queue.TryDequeue(out var id)) if (folders.TryGetValue(id, out var folder)) foreach (var child in folder.Entries.Where(x => x.IsFolder)) if (reached.Add(child.Id)) queue.Enqueue(child.Id);
        return reached;
    }
    public IReadOnlyList<DriveCachedFolder> ReadSnapshot() { lock (gate) { ObjectDisposedException.ThrowIf(disposed, this); return folders.Values.Select(f => f with { Entries = f.Entries.ToArray() }).OrderBy(f => f.FolderId, StringComparer.Ordinal).ToArray(); } }
    public void Invalidate(string folderId) { lock (gate) { ObjectDisposedException.ThrowIf(disposed, this); DriveBoundary.Id(folderId); DriveBoundary.Require(Reachable().Contains(folderId), "DRIVE_FOLDER_SCOPE"); revisions[folderId] = revisions.GetValueOrDefault(folderId) + 1; if (folders.TryGetValue(folderId, out var f)) folders[folderId] = f with { UpdatedAt = DateTimeOffset.MinValue }; Persist(); } }
    public Task<DriveCachedFolder> RefreshAsync(string folderId, bool force = false, CancellationToken ct = default)
    {
        lock (gate)
        {
            ObjectDisposedException.ThrowIf(disposed, this); ct.ThrowIfCancellationRequested(); DriveBoundary.Id(folderId); DriveBoundary.Require(Reachable().Contains(folderId), "DRIVE_FOLDER_SCOPE");
            if (pending.TryGetValue(folderId, out var existing)) return ct.CanBeCanceled ? existing.WaitAsync(ct) : existing;
            if (!force && folders.TryGetValue(folderId, out var cached) && clock() - cached.UpdatedAt < TimeSpan.FromMinutes(2)) return Task.FromResult(cached with { Entries = cached.Entries.ToArray() });
            var completion = new TaskCompletionSource<DriveCachedFolder>(TaskCreationOptions.RunContinuationsAsynchronously); pending.Add(folderId, completion.Task);
            _ = FetchAsync(folderId, revisions.GetValueOrDefault(folderId), completion, ct); return completion.Task;
        }
    }
    async Task FetchAsync(string folderId, long revision, TaskCompletionSource<DriveCachedFolder> completion, CancellationToken ct)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        try
        {
            // Yield ensures pending is published before a synchronous fixture completes.
            await Task.Yield(); var result = await provider.ListAsync(Scope, folderId, linked.Token).WaitAsync(linked.Token).ConfigureAwait(false); linked.Token.ThrowIfCancellationRequested();
            DriveBoundary.Require(result.Scope == Scope && result.FolderId == folderId, "DRIVE_SCOPE_MISMATCH"); DriveBoundary.Entries(result.Entries);
            DriveCachedFolder updated;
            lock (gate)
            {
                ObjectDisposedException.ThrowIf(disposed, this); DriveBoundary.Require(revisions.GetValueOrDefault(folderId) == revision && Reachable().Contains(folderId), "DRIVE_STALE_LISTING");
                updated = new(folderId, clock(), result.Entries.Where(DriveBoundary.Visible).ToArray()); folders[folderId] = updated;
                var reachable = Reachable(); foreach (var orphan in folders.Keys.Where(x => !reachable.Contains(x)).ToArray()) { folders.Remove(orphan); revisions[orphan] = revisions.GetValueOrDefault(orphan) + 1; }
                DriveBoundary.Require(folders.Count <= 1000, "DRIVE_CACHE_LIMIT"); Persist(); status = status with { ErrorCode = null, LastSynced = clock() };
            }
            completion.TrySetResult(updated with { Entries = updated.Entries.ToArray() });
        }
        catch (OperationCanceledException) { completion.TrySetCanceled(linked.Token); }
        catch (Exception error) { var code = DriveBoundary.ErrorCode(error, "DRIVE_LISTING_FAILED"); lock (gate) status = status with { ErrorCode = code }; completion.TrySetException(new DriveBoundaryException(code)); }
        finally { lock (gate) pending.Remove(folderId); }
    }
    void Persist()
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new CacheFileData(1, Scope, provider.IsSynthetic, folders.Values.ToArray()), Json); DriveBoundary.Require(bytes.Length <= 16 * 1024 * 1024, "DRIVE_CACHE_LIMIT");
        var temp = CacheFile + ".tmp-" + Guid.NewGuid().ToString("N");
        try { DriveBoundary.LocalPath(CacheFile); using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { output.Write(bytes); output.Flush(true); } File.Move(temp, CacheFile, true); status = status with { Persistent = true }; }
        catch (IOException) { status = status with { Persistent = false }; }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public Task WarmAsync(bool force = false, CancellationToken ct = default)
    {
        lock (gate) { ObjectDisposedException.ThrowIf(disposed, this); if (warming is not null) return ct.CanBeCanceled ? warming.WaitAsync(ct) : warming; var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); warming = completion.Task; _ = WarmCoreAsync(force, completion, ct); return completion.Task; }
    }
    async Task WarmCoreAsync(bool force, TaskCompletionSource completion, CancellationToken ct)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        try
        {
            await Task.Yield(); var queue = new Queue<(string Id, int Depth)>(); queue.Enqueue((Scope.RootId, 0)); var visited = new HashSet<string>(StringComparer.Ordinal); string? error = null;
            while (queue.TryDequeue(out var current))
            {
                linked.Token.ThrowIfCancellationRequested(); if (!visited.Add(current.Id)) continue; DriveBoundary.Require(visited.Count <= 1000 && current.Depth <= 10, "DRIVE_TREE_LIMIT");
                DriveCachedFolder? folder = null;
                try { folder = await RefreshAsync(current.Id, force, linked.Token).ConfigureAwait(false); }
                catch (DriveBoundaryException e) { error = e.Code; lock (gate) folders.TryGetValue(current.Id, out folder); }
                if (folder is not null) foreach (var child in folder.Entries.Where(x => x.IsFolder && !visited.Contains(x.Id))) queue.Enqueue((child.Id, current.Depth + 1));
                lock (gate) status = status with { Completed = visited.Count, Total = visited.Count + queue.Count };
            }
            lock (gate) status = status with { ErrorCode = error }; completion.TrySetResult();
        }
        catch (OperationCanceledException) { completion.TrySetCanceled(linked.Token); }
        catch (Exception error) { var code = DriveBoundary.ErrorCode(error, "DRIVE_WARM_FAILED"); lock (gate) status = status with { ErrorCode = code }; completion.TrySetException(new DriveBoundaryException(code)); }
        finally { lock (gate) warming = null; }
    }
    public void Dispose() { lock (gate) { if (disposed) return; disposed = true; lifetime.Cancel(); } /* provider calls may still unwind; the CTS is retained until this cache is collectible. */ }
}
