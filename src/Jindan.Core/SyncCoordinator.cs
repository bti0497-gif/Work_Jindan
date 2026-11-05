namespace Jindan.Core.Sync;

/// <summary>Push-first merge semantics. No live adapter is constructed automatically and no production authorization is inferred.</summary>
public sealed class SyncCoordinator(SyncStore store, ISyncRemoteAdapter remote)
{
    private readonly object sync = new(); private Task<SyncPushResult>? pushing; private Task<SyncRunResult>? syncing;
    public Task<SyncPushResult> PushAsync(CancellationToken cancellationToken = default)
    {
        Task<SyncPushResult> task; bool owner; lock (sync) { if (pushing is { IsCompleted: false }) { task = pushing; owner = false; } else { pushing = task = PushCoreAsync(cancellationToken); owner = true; } }
        // A later waiter's cancellation does not cancel the shared first owner's transport.
        return !owner && cancellationToken.CanBeCanceled ? task.WaitAsync(cancellationToken) : task;
    }
    public Task<SyncRunResult> SyncAllAsync(CancellationToken cancellationToken = default)
    {
        Task<SyncRunResult> task; bool owner; lock (sync) { if (syncing is { IsCompleted: false }) { task = syncing; owner = false; } else { syncing = task = SyncCoreAsync(cancellationToken); owner = true; } }
        return !owner && cancellationToken.CanBeCanceled ? task.WaitAsync(cancellationToken) : task;
    }
    private static string ErrorCode(Exception exception) => exception is SyncException sync && sync.Code.Length is > 0 and <= 64 && sync.Code.All(c => char.IsAsciiLetterUpper(c) || char.IsAsciiDigit(c) || c == '_') ? sync.Code : "REMOTE_ERROR";
    private async Task<SyncPushResult> PushCoreAsync(CancellationToken cancellationToken)
    {
        SyncValidation.Require(remote.IsConfigured, "PRODUCTION_NOT_CONFIGURED");
        var snapshot = await store.SnapshotAsync(cancellationToken); var issues = new List<SyncIssue>(); var attempted = 0; var acknowledged = 0; var missing = 0;
        foreach (var pending in snapshot.Pending)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var row = snapshot.Tables[pending.Table].SingleOrDefault(r => r.Id == pending.Id);
            if (pending.Operation == SyncOperation.Upsert && row is null) { missing++; issues.Add(new(pending.Table, pending.Id, "MISSING_LOCAL_RECORD")); continue; }
            var envelope = new SyncEnvelope(snapshot.Scope, pending, row is null ? null : SyncValidation.Clone(row));
            try { attempted++; var ack = await remote.PushAsync(envelope, cancellationToken); cancellationToken.ThrowIfCancellationRequested(); if (await store.AcknowledgeAsync(envelope, ack, cancellationToken)) acknowledged++; }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception exception) { issues.Add(new(pending.Table, pending.Id, ErrorCode(exception))); }
        }
        return new(attempted, acknowledged, missing, issues, remote.IsSynthetic);
    }
    private async Task<SyncRunResult> SyncCoreAsync(CancellationToken cancellationToken)
    {
        SyncValidation.Require(remote.IsConfigured, "PRODUCTION_NOT_CONFIGURED");
        var push = await PushAsync(cancellationToken); var issues = push.Issues.ToList(); var pulled = 0;
        foreach (var table in Enum.GetValues<SyncTable>())
        {
            cancellationToken.ThrowIfCancellationRequested();
            try { var response = await remote.FetchAsync(store.Scope, table, cancellationToken); await store.MergePullAsync(response, cancellationToken); pulled++; }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception exception) { issues.Add(new(table, "", ErrorCode(exception))); }
        }
        var advanced = issues.Count == 0 && await store.MarkSuccessfulAsync(cancellationToken);
        return new(push, pulled, issues, advanced, remote.IsSynthetic, ProductionVerified: false);
    }
}

/// <summary>Explicit isolated test-only server simulation. Does not authenticate real users or contact a cloud service.</summary>
public sealed class IsolatedLoopbackSyncAdapter : ISyncRemoteAdapter
{
    private readonly object gate = new(); private readonly HashSet<SyncScope> scopes;
    private readonly Dictionary<(SyncScope Scope, SyncTable Table, string Id), SyncRecord> records = [];
    private readonly HashSet<(SyncScope Scope, SyncTable Table, string Id, string Revision)> committed = [];
    private int attempts, mutations;
    public string AdapterId => "explicit-isolated-loopback-test-only"; public bool IsConfigured => true; public bool IsSynthetic => true;
    public bool RealServerAuthorizationVerified => false;
    public int DeliveryAttempts => Volatile.Read(ref attempts); public int AppliedMutations => Volatile.Read(ref mutations);
    public Func<SyncEnvelope, CancellationToken, Task>? BeforePush { get; set; }
    public Func<SyncEnvelope, CancellationToken, Task>? AfterCommitBeforeAck { get; set; }
    public Func<SyncAcknowledgement, SyncAcknowledgement>? RewriteAcknowledgement { get; set; }
    public Func<SyncScope, SyncTable, CancellationToken, Task>? BeforeFetch { get; set; }
    public IsolatedLoopbackSyncAdapter(IEnumerable<SyncScope> allowedScopes, bool explicitlyEnableTestFixture)
    {
        SyncValidation.Require(explicitlyEnableTestFixture, "TEST_FIXTURE_NOT_ENABLED"); scopes = new(allowedScopes); SyncValidation.Require(scopes.Count is > 0 and <= 100, "SCOPE_INVALID"); foreach (var scope in scopes) SyncValidation.Scope(scope);
    }
    private void AuthorizeFixture(SyncScope scope) { SyncValidation.Scope(scope); SyncValidation.Require(scopes.Contains(scope), "LOOPBACK_SCOPE_DENIED"); }
    public void Seed(SyncScope scope, SyncTable table, IEnumerable<SyncRecord> rows)
    {
        AuthorizeFixture(scope); SyncValidation.Table(table); var copies = rows.Select(r => { SyncValidation.Record(r); return SyncValidation.Clone(r); }).ToArray(); SyncValidation.Require(copies.Length <= 10000 && copies.Select(r => r.Id).Distinct().Count() == copies.Length, "REMOTE_DUPLICATE");
        lock (gate) { var prospective = records.ToDictionary(p => p.Key, p => p.Value); foreach (var row in copies) prospective[(scope, table, row.Id)] = row; CheckServerLimit(prospective); foreach (var row in copies) records[(scope, table, row.Id)] = row; }
    }
    private static void CheckServerLimit(Dictionary<(SyncScope Scope, SyncTable Table, string Id), SyncRecord> prospective)
    {
        SyncValidation.Require(prospective.Count <= 10000, "LOOPBACK_LIMIT");
        SyncValidation.Require(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(prospective.Values.ToArray()).Length <= 32 * 1024 * 1024, "LOOPBACK_LIMIT");
    }
    public async Task<SyncAcknowledgement> PushAsync(SyncEnvelope envelope, CancellationToken cancellationToken)
    {
        AuthorizeFixture(envelope.Scope); SyncValidation.Table(envelope.Pending.Table); SyncValidation.Id(envelope.Pending.Id);
        SyncValidation.Require(Guid.TryParseExact(envelope.Pending.Revision, "N", out _) && Enum.IsDefined(envelope.Pending.Operation), "REVISION_INVALID");
        if (envelope.Pending.Operation == SyncOperation.Upsert) { SyncValidation.Require(envelope.Record is not null && envelope.Record.Id == envelope.Pending.Id && !envelope.Record.Deleted, "RECORD_INVALID"); SyncValidation.Record(envelope.Record); }
        Interlocked.Increment(ref attempts); if (BeforePush is not null) await BeforePush(envelope, cancellationToken); cancellationToken.ThrowIfCancellationRequested();
        lock (gate)
        {
            var receipt = (envelope.Scope, envelope.Pending.Table, envelope.Pending.Id, envelope.Pending.Revision);
            if (!committed.Contains(receipt))
            {
                SyncValidation.Require(committed.Count < 20000, "LOOPBACK_LIMIT");
                var key = (envelope.Scope, envelope.Pending.Table, envelope.Pending.Id); var next = envelope.Pending.Operation == SyncOperation.Delete ? new SyncRecord(envelope.Pending.Id, envelope.Record?.OwnerUid, [], Deleted: true) : SyncValidation.Clone(envelope.Record!);
                var prospective = records.ToDictionary(p => p.Key, p => p.Value); prospective[key] = next; CheckServerLimit(prospective);
                committed.Add(receipt); records[key] = next; Interlocked.Increment(ref mutations);
            }
        }
        if (AfterCommitBeforeAck is not null) await AfterCommitBeforeAck(envelope, cancellationToken); cancellationToken.ThrowIfCancellationRequested();
        var ack = new SyncAcknowledgement(envelope.Scope, envelope.Pending.Table, envelope.Pending.Id, envelope.Pending.Revision, Accepted: true); return RewriteAcknowledgement?.Invoke(ack) ?? ack;
    }
    public async Task<SyncPull> FetchAsync(SyncScope scope, SyncTable table, CancellationToken cancellationToken)
    {
        AuthorizeFixture(scope); SyncValidation.Table(table); if (BeforeFetch is not null) await BeforeFetch(scope, table, cancellationToken); cancellationToken.ThrowIfCancellationRequested();
        lock (gate) return new(scope, table, records.Where(p => p.Key.Scope == scope && p.Key.Table == table).Select(p => SyncValidation.Clone(p.Value)).ToArray(), CompleteSnapshot: true);
    }
}
