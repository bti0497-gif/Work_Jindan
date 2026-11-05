namespace Jindan.Contracts.Drive;

// IDs are opaque identifiers, never paths, URLs, credentials, or bearer tokens.
public sealed record DriveScope(string UserId, string ProjectId, string RootId);
public sealed record DriveEntry(string Id, string Name, string MimeType, long Size = 0, DateTimeOffset? ModifiedTime = null)
{
    public const string FolderMime = "application/vnd.google-apps.folder";
    public bool IsFolder => MimeType == FolderMime;
}
public sealed record DriveListing(DriveScope Scope, string FolderId, IReadOnlyList<DriveEntry> Entries);
public sealed record DriveCachedFolder(string FolderId, DateTimeOffset UpdatedAt, IReadOnlyList<DriveEntry> Entries);
public sealed record DriveCacheStatus(int CachedFolders, bool Syncing, int Completed, int Total, DateTimeOffset? LastSynced, string? ErrorCode, bool Persistent, bool IsSynthetic);
public interface IDriveListingProvider
{
    bool IsSynthetic { get; }
    Task<DriveListing> ListAsync(DriveScope scope, string folderId, CancellationToken ct);
}
// This contract is intentionally separate from work/Firebase synchronization.
public interface IDriveListingCache : IDisposable
{
    DriveScope Scope { get; }
    DriveCacheStatus Status { get; }
    IReadOnlyList<DriveCachedFolder> ReadSnapshot();
    Task<DriveCachedFolder> RefreshAsync(string folderId, bool force = false, CancellationToken ct = default);
    Task WarmAsync(bool force = false, CancellationToken ct = default);
    void Invalidate(string folderId);
}
public sealed record DriveSystemFolders(string SystemId, string JsonId, string ResourcesId);
public sealed record DriveRetentionPlan(DriveScope Scope, string JsonFolderId, DateTimeOffset Cutoff, IReadOnlyList<DriveEntry> Entries);
public interface IOfflineDriveSystemTransport : IDriveListingProvider
{
    Task<DriveEntry> CreateFolderAsync(DriveScope scope, string parentId, string name, CancellationToken ct);
    Task<DriveEntry> UploadAsync(DriveScope scope, string folderId, string name, byte[] bytes, string mimeType, CancellationToken ct);
    Task TrashAsync(DriveScope scope, string id, CancellationToken ct);
}
public sealed class DriveBoundaryException(string code) : Exception(code) { public string Code { get; } = code; }
