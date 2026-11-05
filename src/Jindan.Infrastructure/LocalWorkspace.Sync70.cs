using Jindan.Contracts;
using Jindan.Core.Sync;
using System.Text.Json.Nodes;
using static Jindan.Core.DomainRules;

namespace Jindan.Infrastructure;

public sealed partial class LocalWorkspace
{
    static bool SyncKind(string kind) => kind is "projects" or "processes" or "tasks";
    static string? SyncProject(WorkRecord record) => record.Kind == "projects" ? record.Id : record.ProjectId ?? (record.Fields.GetValueOrDefault("relatedProjectId") is { Length: > 0 } related ? related : null);
    static void EnqueueSync(State next, StoredUser user, WorkRecord record)
    {
        if (!SyncKind(record.Kind)) return;
        // The local row and its exact current revision are committed in one file.
        // Previously persisted/imported rows are never inferred to be upload work.
        next.SyncOutbox.RemoveAll(e => e.Kind == record.Kind && e.Id == record.Id);
        Require(next.SyncOutbox.Count < 10000, "SYNC_LIMIT", "The local sync outbox is full.");
        next.SyncOutbox.Add(new(Guid.NewGuid().ToString("N"), record.Kind, record.Id, user.Id, SyncProject(record), record.Deleted ? "delete" : "upsert", record.Revision, DateTimeOffset.UtcNow));
    }
    static void ValidateSyncState(State value)
    {
        Require(value.SyncOutbox is not null && value.SyncOutbox.Count <= 10000 && value.SyncOutbox.All(e => e is not null && Guid.TryParseExact(e.Revision, "N", out _) && SyncKind(e.Kind) && !string.IsNullOrWhiteSpace(e.Id) && !string.IsNullOrWhiteSpace(e.UserId) && e.Operation is "upsert" or "delete" && e.RecordRevision > 0) && value.SyncOutbox.Select(e => (e.Kind, e.Id)).Distinct().Count() == value.SyncOutbox.Count, "SYNC_STATE_INVALID", "The local sync outbox requires independent recovery.");
    }
    bool SyncReadable(StoredUser user, WorkspaceSyncEntry entry)
    {
        // Even an administrator cannot silently upload another session user's queue.
        if (entry.UserId != user.Id) return false;
        var row = _state.Records.SingleOrDefault(r => r.Id == entry.Id && r.Kind == entry.Kind);
        if (row is null || !Readable(user, row)) return false;
        if (entry.ProjectId is not null && user.Role != "admin" && !user.ProjectIds.Contains(entry.ProjectId)) return false;
        return true;
    }
    void SyncActor(StoredUser user, string? projectId, bool write)
    {
        if (write) Require(user.Role is "admin" or "editor", "FORBIDDEN", "The local role cannot push records.");
        if (projectId is null) return;
        var project = _state.Records.SingleOrDefault(r => r.Kind == "projects" && r.Id == projectId);
        Require(project is not null && Readable(user, project), "FORBIDDEN", "The sync project is unavailable.");
    }
    internal Task<(WorkspaceSyncEntry[] Entries, DateTimeOffset? Last)> ReadSyncOutboxAsync(Identity actor, string? projectId, bool write, CancellationToken ct) => Locked(() =>
    {
        var user = Actor(actor); SyncActor(user, projectId, write);
        return (_state.SyncOutbox.Where(e => (projectId is null || e.ProjectId == projectId) && SyncReadable(user, e)).ToArray(), _state.LastSyncAcknowledgedAt);
    }, ct);
    internal Task<SyncEnvelope?> ReadSyncEnvelopeAsync(Identity actor, WorkspaceSyncEntry expected, CancellationToken ct) => Locked<SyncEnvelope?>(() =>
    {
        var user = Actor(actor); SyncActor(user, expected.ProjectId, true);
        var current = _state.SyncOutbox.SingleOrDefault(e => e.Kind == expected.Kind && e.Id == expected.Id);
        if (current?.Revision != expected.Revision) return null;
        Require(SyncReadable(user, current), "FORBIDDEN", "The queued record no longer belongs to this session.");
        var row = _state.Records.SingleOrDefault(r => r.Kind == expected.Kind && r.Id == expected.Id);
        Require(row is not null && row.Revision == expected.RecordRevision && row.Deleted == (expected.Operation == "delete") && SyncProject(row) == expected.ProjectId, "SYNC_RECORD_MISMATCH", "The queued record binding is stale.");
        var scope = new SyncScope(user.Id, expected.ProjectId ?? "personal:" + user.Id);
        var table = expected.Kind switch { "projects" => SyncTable.Projects, "processes" => SyncTable.Processes, _ => SyncTable.Tasks };
        var fields = new JsonObject { ["format"] = "jindan-native-work-record/1", ["kind"] = row.Kind, ["projectId"] = row.ProjectId, ["revision"] = row.Revision, ["fields"] = new JsonObject(row.Fields.Select(p => new KeyValuePair<string, JsonNode?>(p.Key, JsonValue.Create(p.Value)))) };
        Require(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(fields).Length <= 600000, "SYNC_LIMIT", "The queued payload exceeds the transport bound.");
        return new(scope, new(table, row.Id, row.Deleted ? SyncOperation.Delete : SyncOperation.Upsert, expected.Revision, expected.CreatedAt), new(row.Id, row.OwnerId, fields, row.Deleted));
    }, ct);
    internal Task<bool> AcknowledgeWorkspaceSyncAsync(Identity actor, WorkspaceSyncEntry expected, SyncEnvelope sent, SyncAcknowledgement ack, CancellationToken ct) => Locked(() =>
    {
        var user = Actor(actor); SyncActor(user, expected.ProjectId, true);
        Require(ack.Accepted && ack.Scope == sent.Scope && ack.Table == sent.Pending.Table && ack.Id == sent.Pending.Id && ack.Revision == sent.Pending.Revision, "ACK_MISMATCH", "The sync acknowledgement does not identify the sent revision.");
        var current = _state.SyncOutbox.SingleOrDefault(e => e.Kind == expected.Kind && e.Id == expected.Id);
        if (current?.Revision != expected.Revision) return false;
        Require(SyncReadable(user, current), "FORBIDDEN", "The queued record no longer belongs to this session.");
        var next = Clone(); next.SyncOutbox.RemoveAll(e => e.Revision == expected.Revision); next.LastSyncAcknowledgedAt = DateTimeOffset.UtcNow; Commit(next, ct); return true;
    }, ct);
}

/// <summary>Feature-integrated durable push boundary. The default never contacts a service.</summary>
public sealed class WorkspaceSyncService(LocalWorkspace store, Identity actor, ISyncRemoteAdapter? adapter = null, bool explicitlyEnableSyntheticTransport = false) : IWorkspaceSyncService, IDisposable
{
    readonly ISyncRemoteAdapter remote = adapter ?? new NotConfiguredSyncAdapter();
    readonly SemaphoreSlim gate = new(1, 1);
    readonly CancellationTokenSource lifetime = new();
    bool disposed;
    public async Task<WorkspaceSyncStatus> StatusAsync(string? projectId = null, CancellationToken ct = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        var state = await store.ReadSyncOutboxAsync(actor, projectId, false, linked.Token);
        return new(remote.AdapterId, remote.IsConfigured && (!remote.IsSynthetic || explicitlyEnableSyntheticTransport), remote.IsSynthetic, state.Entries, state.Last);
    }
    public async Task<WorkspaceSyncResult> PushPendingAsync(string? projectId, bool explicitlyConfirmed, CancellationToken ct = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        await gate.WaitAsync(linked.Token);
        try
        {
            var snapshot = await store.ReadSyncOutboxAsync(actor, projectId, true, linked.Token);
            Require(explicitlyConfirmed, "CONFIRMATION", "Explicit pending-upload confirmation is required.");
            Require(remote.IsConfigured, "PRODUCTION_NOT_CONFIGURED", "A production sync adapter is not configured.");
            Require(!remote.IsSynthetic || explicitlyEnableSyntheticTransport, "TEST_FIXTURE_NOT_ENABLED", "Synthetic transport requires explicit test activation.");
            var attempted = 0; var acknowledged = 0; var issues = new List<WorkspaceSyncIssue>();
            foreach (var entry in snapshot.Entries)
            {
                linked.Token.ThrowIfCancellationRequested();
                try
                {
                    var sent = await store.ReadSyncEnvelopeAsync(actor, entry, linked.Token);
                    if (sent is null) { issues.Add(new(entry.Kind, entry.Id, "LOCAL_REVISION_CHANGED")); continue; }
                    attempted++;
                    var ack = await remote.PushAsync(sent, linked.Token);
                    linked.Token.ThrowIfCancellationRequested();
                    if (await store.AcknowledgeWorkspaceSyncAsync(actor, entry, sent, ack, linked.Token)) acknowledged++;
                    else issues.Add(new(entry.Kind, entry.Id, "LOCAL_REVISION_CHANGED"));
                }
                catch (OperationCanceledException) when (linked.IsCancellationRequested) { throw; }
                catch (Exception error) { issues.Add(new(entry.Kind, entry.Id, SafeCode(error))); }
            }
            return new(attempted, acknowledged, issues, remote.IsSynthetic);
        }
        finally { gate.Release(); }
    }
    static string SafeCode(Exception error)
    {
        var code = error switch { Jindan.Core.WorkspaceException e => e.Code, SyncException e => e.Code, _ => "SYNC_REMOTE_ERROR" };
        return code.Length is > 0 and <= 64 && code.All(c => char.IsAsciiLetterUpper(c) || char.IsAsciiDigit(c) || c == '_') ? code : "SYNC_REMOTE_ERROR";
    }
    public void Dispose() { if (disposed) return; disposed = true; lifetime.Cancel(); /* Owned cooperative tasks finish; no process or service is terminated. */ }
}
