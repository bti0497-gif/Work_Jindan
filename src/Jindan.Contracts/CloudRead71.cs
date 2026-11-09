using Jindan.Contracts.Drive;
namespace Jindan.Contracts.Cloud;

// Additive opt-in contract; local CRUD and work synchronization remain separate.
public interface ICloudWorkspaceAccess { ICloudReadService Cloud { get; } }
public sealed record CloudStatus(bool DriveConnected, bool BoardConnected);
public sealed record CloudAttachment(string Id, string Name, long Size, string MimeType);
public sealed record CloudPost(string Id, string Title, string Content, string Author, string UpdatedAt, IReadOnlyList<CloudAttachment> Attachments);
public sealed record CloudComment(string Id, string Content, string Author, string CreatedAt);
public interface ICloudReadService : IDisposable
{
    CloudStatus Status { get; }
    Task ConnectDriveAsync(string clientId, string clientSecret, string rootId, CancellationToken ct);
    Task ConnectBoardAsync(string projectId, string apiKey, string personId, string password, CancellationToken ct);
    Task<IReadOnlyList<DriveEntry>> ListDriveAsync(string? folderId, CancellationToken ct);
    Task DownloadDriveAsync(string fileId, Stream destination, CancellationToken ct);
    Task<IReadOnlyList<CloudPost>> ListBoardAsync(string menu, CancellationToken ct);
    Task<IReadOnlyList<CloudComment>> ListCommentsAsync(string postId, CancellationToken ct);
    void Disconnect();
}
public sealed class CloudConnectionException(string code) : Exception(code);
