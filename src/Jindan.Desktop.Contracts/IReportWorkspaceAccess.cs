using Jindan.Contracts;

namespace Jindan.Desktop.Contracts;

/// <summary>Host-backed persisted actor/project authorization for local report
/// workspace state. This does not acknowledge analysis or approve a report.</summary>
public interface IReportWorkspaceAccess
{
    Task AuthorizeReportWorkspaceAsync(DocumentContext context, bool write, CancellationToken ct = default);
    Task<AssetInfo?> ResolveExistingReportAssetAsync(DocumentContext context, string storedPath, CancellationToken ct = default);
    Task<bool> CanWriteReportWorkspaceAsync(DocumentContext context, CancellationToken ct = default) => Task.FromResult(false);
}
