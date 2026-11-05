namespace Jindan.Contracts;

// This contract describes the local outbox, not a server authentication result.
public sealed record WorkspaceSyncEntry(string Revision, string Kind, string Id, string UserId, string? ProjectId, string Operation, long RecordRevision, DateTimeOffset CreatedAt);
public sealed record WorkspaceSyncStatus(string AdapterId, bool Configured, bool IsSynthetic, IReadOnlyList<WorkspaceSyncEntry> Pending, DateTimeOffset? LastAcknowledgedAt, bool ProductionVerified = false);
public sealed record WorkspaceSyncIssue(string Kind, string Id, string Code);
public sealed record WorkspaceSyncResult(int Attempted, int Acknowledged, IReadOnlyList<WorkspaceSyncIssue> Issues, bool IsSynthetic, bool ProductionVerified = false);
public interface IWorkspaceSyncService
{
    Task<WorkspaceSyncStatus> StatusAsync(string? projectId = null, CancellationToken ct = default);
    Task<WorkspaceSyncResult> PushPendingAsync(string? projectId, bool explicitlyConfirmed, CancellationToken ct = default);
}
public interface IWorkspaceSyncAccess { IWorkspaceSyncService Sync { get; } }
