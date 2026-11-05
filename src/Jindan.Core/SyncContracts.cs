using System.Text;
using System.Text.Json.Nodes;
using System.Diagnostics.CodeAnalysis;

namespace Jindan.Core.Sync;

public enum SyncTable { Projects, Processes, Tasks }
public enum SyncOperation { Upsert, Delete }
public sealed record SyncScope(string UserId, string ProjectId);
public sealed record SyncRecord(string Id, string? OwnerUid, JsonObject Fields, bool Deleted = false);
public sealed record SyncPending(SyncTable Table, string Id, SyncOperation Operation, string Revision, DateTimeOffset CreatedAt);
public sealed record SyncEnvelope(SyncScope Scope, SyncPending Pending, SyncRecord? Record);
public sealed record SyncAcknowledgement(SyncScope Scope, SyncTable Table, string Id, string Revision, bool Accepted);
public sealed record SyncPull(SyncScope Scope, SyncTable Table, IReadOnlyList<SyncRecord> Records, bool CompleteSnapshot);
public sealed record SyncSnapshot(SyncScope Scope, long Generation, IReadOnlyDictionary<SyncTable, IReadOnlyList<SyncRecord>> Tables, IReadOnlyList<SyncPending> Pending, DateTimeOffset? LastSuccessfulSync);
public sealed record SyncIssue(SyncTable Table, string Id, string Code);
public sealed record SyncPushResult(int Attempted, int Acknowledged, int SkippedMissing, IReadOnlyList<SyncIssue> Issues, bool IsSynthetic);
public sealed record SyncRunResult(SyncPushResult Push, int PulledTables, IReadOnlyList<SyncIssue> Issues, bool LastSyncAdvanced, bool IsSynthetic, bool ProductionVerified = false);
public sealed class SyncException(string code) : Exception("The bounded local sync boundary rejected the operation.") { public string Code { get; } = code; }
public interface ISyncRemoteAdapter
{
    string AdapterId { get; }
    bool IsConfigured { get; }
    bool IsSynthetic { get; }
    Task<SyncAcknowledgement> PushAsync(SyncEnvelope envelope, CancellationToken cancellationToken);
    Task<SyncPull> FetchAsync(SyncScope scope, SyncTable table, CancellationToken cancellationToken);
}
public sealed class NotConfiguredSyncAdapter : ISyncRemoteAdapter
{
    public string AdapterId => "production-not-configured"; public bool IsConfigured => false; public bool IsSynthetic => false;
    public Task<SyncAcknowledgement> PushAsync(SyncEnvelope envelope, CancellationToken cancellationToken) => Task.FromException<SyncAcknowledgement>(new SyncException("PRODUCTION_NOT_CONFIGURED"));
    public Task<SyncPull> FetchAsync(SyncScope scope, SyncTable table, CancellationToken cancellationToken) => Task.FromException<SyncPull>(new SyncException("PRODUCTION_NOT_CONFIGURED"));
}
internal static class SyncValidation
{
    public static void Require([DoesNotReturnIf(false)] bool condition, string code) { if (!condition) throw new SyncException(code); }
    public static void Scope(SyncScope scope) { Require(scope is not null, "SCOPE_INVALID"); Id(scope.UserId); Id(scope.ProjectId); }
    public static void Id(string? id) => Require(!string.IsNullOrWhiteSpace(id) && id.Length <= 200 && !id.Contains('/') && !id.Contains('\\') && id is not "." and not "..", "ID_INVALID");
    public static void Table(SyncTable table) => Require(Enum.IsDefined(table), "TABLE_INVALID");
    public static SyncRecord Clone(SyncRecord row) => row with { Fields = (JsonObject)row.Fields.DeepClone() };
    public static void Record(SyncRecord row)
    {
        Require(row is not null && row.Fields is not null, "RECORD_INVALID"); Id(row.Id);
        Require(row.OwnerUid is null || row.OwnerUid.Length <= 200, "RECORD_INVALID");
        Walk(row.Fields, 0);
        var text = row.Fields.ToJsonString(); Require(Encoding.UTF8.GetByteCount(text) <= 600_000, "RECORD_LIMIT");
    }
    private static void Walk(JsonNode? node, int depth)
    {
        Require(depth <= 32, "RECORD_LIMIT");
        if (node is JsonObject obj) foreach (var pair in obj) { Require(pair.Key.Length <= 200 && pair.Key is not "__proto__" and not "constructor" and not "prototype", "RECORD_INVALID"); Walk(pair.Value, depth + 1); }
        else if (node is JsonArray array) foreach (var child in array) Walk(child, depth + 1);
    }
}
