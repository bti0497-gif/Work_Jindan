using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace Jindan.Core.Sync;

// Provider-issued external identity. Local account IDs/roles are never substituted
// for Firebase uid/person_id. The provider must authenticate and authorize these.
public sealed record SourceWorkAuthorization(string LocalUserId, string ScopeProjectId, string Uid, string PersonId, string DisplayName, string Role, DateTimeOffset ExpiresAt);
public sealed record SourceWorkTransactionReceipt(string Collection, string Id, string Revision, bool Committed);
public sealed record SourceWorkFetch(IReadOnlyList<JsonObject> Records, bool CompleteSnapshot);
public interface ISourceWorkTransport70
{
    string ProviderId { get; }
    bool IsConfigured { get; }
    bool IsSynthetic { get; }
    Task<SourceWorkAuthorization> AuthorizeAsync(SyncScope localScope, SyncTable table, string? recordId, bool write, CancellationToken ct);
    // The implementation must invoke transform within one server transaction;
    // caller revision is an idempotency key, not an authorization credential.
    Task<SourceWorkTransactionReceipt> TransactAsync(string collection, string id, string revision, SourceWorkAuthorization authorization, Func<JsonObject?, JsonObject?> transform, CancellationToken ct);
    // Projects/processes: server collection query. Tasks: union of public=true
    // and authorId=authorization.PersonId, exactly as the preserved JS contract.
    Task<SourceWorkFetch> FetchAsync(string collection, bool publicOrOwnTasks, SourceWorkAuthorization authorization, CancellationToken ct);
}

/// <summary>Source-contract mapper with an injected transactional provider; no network/auth provider is supplied.</summary>
public sealed class SourceWorkAdapter70(ISourceWorkTransport70 transport, Func<DateTimeOffset>? clock = null) : ISyncRemoteAdapter
{
    public string AdapterId => "source-work70:" + transport.ProviderId;
    public bool IsConfigured => transport.IsConfigured;
    public bool IsSynthetic => transport.IsSynthetic;
    DateTimeOffset Now => (clock ?? (() => DateTimeOffset.UtcNow))();
    static string Collection(SyncTable table) => table switch { SyncTable.Projects => "jindan_projects", SyncTable.Processes => "jindan_processes", SyncTable.Tasks => "jindan_tasks", _ => throw new SyncException("TABLE_INVALID") };
    void Authorize(SourceWorkAuthorization a, SyncScope scope)
    {
        SyncValidation.Require(a is not null && a.LocalUserId == scope.UserId && a.ScopeProjectId == scope.ProjectId && a.ExpiresAt > Now && !string.IsNullOrWhiteSpace(a.Uid) && !string.IsNullOrWhiteSpace(a.PersonId) && a.Role is "admin" or "user", "EXTERNAL_IDENTITY_REQUIRED");
        SyncValidation.Require(a.Uid.Length <= 200 && a.PersonId.Length <= 128 && Encoding.UTF8.GetByteCount(a.DisplayName) <= 300, "EXTERNAL_IDENTITY_REQUIRED");
    }
    public async Task<SyncAcknowledgement> PushAsync(SyncEnvelope envelope, CancellationToken ct)
    {
        SyncValidation.Scope(envelope.Scope); SyncValidation.Table(envelope.Pending.Table); SyncValidation.Id(envelope.Pending.Id);
        SyncValidation.Require(IsConfigured, "PRODUCTION_NOT_CONFIGURED");
        SyncValidation.Require(Guid.TryParseExact(envelope.Pending.Revision, "N", out _) && Enum.IsDefined(envelope.Pending.Operation), "REVISION_INVALID");
        if (envelope.Record is not null) SyncValidation.Record(envelope.Record);
        var frozen = envelope.Record is null ? null : SyncValidation.Clone(envelope.Record);
        SyncValidation.Require(envelope.Pending.Id.Length <= 128, "ID_INVALID");
        var authorization = await transport.AuthorizeAsync(envelope.Scope, envelope.Pending.Table, envelope.Pending.Id, true, ct); ct.ThrowIfCancellationRequested(); Authorize(authorization, envelope.Scope);
        // Freeze caller input before transport-owned callbacks and await boundaries.
        SyncValidation.Require(frozen is not null && frozen.Id == envelope.Pending.Id && frozen.Deleted == (envelope.Pending.Operation == SyncOperation.Delete), "RECORD_INVALID");
        var input = envelope.Pending.Operation == SyncOperation.Upsert ? ProjectNative(envelope.Pending.Table, frozen!) : null;
        if (envelope.Pending.Table == SyncTable.Projects) SyncValidation.Require(envelope.Scope.ProjectId == envelope.Pending.Id, "SOURCE_PROJECT_MISMATCH");
        if (envelope.Pending.Table == SyncTable.Processes && input is not null) SyncValidation.Require(input["projectId"]?.GetValue<string>() == envelope.Scope.ProjectId, "SOURCE_PROJECT_MISMATCH");
        var collection = Collection(envelope.Pending.Table); var now = Now.ToString("O", CultureInfo.InvariantCulture);
        var receipt = await transport.TransactAsync(collection, envelope.Pending.Id, envelope.Pending.Revision, authorization, existing =>
        {
            Authorize(authorization, envelope.Scope);
            if (existing is not null) { SyncValidation.Require(existing["id"]?.GetValue<string>() == envelope.Pending.Id, "SOURCE_RECORD_MISMATCH"); if (envelope.Pending.Table == SyncTable.Projects) SyncValidation.Require(existing["ownerUid"]?.GetValue<string>() == authorization.Uid || existing["authorId"]?.GetValue<string>() == authorization.PersonId || authorization.Role == "admin", "EXTERNAL_OWNER_MISMATCH"); if (envelope.Pending.Table == SyncTable.Tasks) SyncValidation.Require(existing["authorId"]?.GetValue<string>() == authorization.PersonId, "EXTERNAL_AUTHOR_MISMATCH"); }
            if (envelope.Pending.Operation == SyncOperation.Delete)
            {
                // A missing server row is an idempotent no-op under the provider
                // transaction; no upsert containing guessed author data is made.
                if (existing is null || existing["deleted"]?.GetValue<bool>() == true) return null;
                var deleted = (JsonObject)existing.DeepClone(); deleted["deleted"] = true; deleted["updatedAt"] = now; return deleted;
            }
            SyncValidation.Require(existing?["deleted"]?.GetValue<bool>() != true, "SOURCE_DELETED");
            var authorId = existing?["authorId"]?.GetValue<string>() ?? authorization.PersonId;
            if (envelope.Pending.Table == SyncTable.Tasks) SyncValidation.Require(authorId == authorization.PersonId, "EXTERNAL_AUTHOR_MISMATCH");
            if (envelope.Pending.Table == SyncTable.Processes && existing is not null) SyncValidation.Require(existing["projectId"]?.GetValue<string>() == input!["projectId"]?.GetValue<string>(), "SOURCE_PROJECT_MISMATCH");
            var result = (JsonObject)input!.DeepClone(); result["id"] = envelope.Pending.Id; result["author"] = existing?["author"]?.DeepClone() ?? JsonValue.Create(authorization.DisplayName); result["authorId"] = authorId; result["ownerUid"] = existing?["ownerUid"]?.DeepClone() ?? JsonValue.Create(authorization.Uid); result["createdAt"] = existing?["createdAt"]?.DeepClone() ?? JsonValue.Create(now); result["updatedAt"] = now; result["deleted"] = false; return result;
        }, ct);
        ct.ThrowIfCancellationRequested(); Authorize(authorization, envelope.Scope);
        SyncValidation.Require(receipt.Committed && receipt.Collection == collection && receipt.Id == envelope.Pending.Id && receipt.Revision == envelope.Pending.Revision, "ACK_MISMATCH");
        return new(envelope.Scope, envelope.Pending.Table, envelope.Pending.Id, envelope.Pending.Revision, true);
    }
    public async Task<SyncPull> FetchAsync(SyncScope scope, SyncTable table, CancellationToken ct)
    {
        SyncValidation.Scope(scope); SyncValidation.Table(table); SyncValidation.Require(IsConfigured, "PRODUCTION_NOT_CONFIGURED");
        var a = await transport.AuthorizeAsync(scope, table, null, false, ct); Authorize(a, scope);
        var response = await transport.FetchAsync(Collection(table), table == SyncTable.Tasks, a, ct); ct.ThrowIfCancellationRequested(); Authorize(a, scope);
        SyncValidation.Require(response.Records is not null && response.Records.Count <= 10000, "REMOTE_LIMIT");
        SyncValidation.Require(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(response.Records).Length <= 32 * 1024 * 1024, "REMOTE_LIMIT");
        var rows = response.Records.Select(source =>
        {
            var id = source["id"]?.GetValue<string>(); SyncValidation.Id(id);
            if (table == SyncTable.Tasks) SyncValidation.Require(source["isPublic"]?.GetValue<bool>() == true || source["authorId"]?.GetValue<string>() == a.PersonId, "EXTERNAL_AUTHOR_MISMATCH");
            return new SyncRecord(id!, source["ownerUid"]?.GetValue<string>(), (JsonObject)source.DeepClone(), source["deleted"]?.GetValue<bool>() == true);
        }).ToArray();
        SyncValidation.Require(rows.Select(r => r.Id).Distinct().Count() == rows.Length, "REMOTE_DUPLICATE"); foreach (var row in rows) SyncValidation.Record(row);
        return new(scope, table, rows, response.CompleteSnapshot);
    }
    public static JsonObject ProjectNative(SyncTable table, SyncRecord row)
    {
        SyncValidation.Require(row.Fields["format"]?.GetValue<string>() == "jindan-native-work-record/1", "SOURCE_MAPPING_REQUIRED");
        var kind = table switch { SyncTable.Projects => "projects", SyncTable.Processes => "processes", SyncTable.Tasks => "tasks", _ => throw new SyncException("TABLE_INVALID") };
        SyncValidation.Require(row.Fields["kind"]?.GetValue<string>() == kind && row.Fields["fields"] is JsonObject, "SOURCE_RECORD_MISMATCH");
        SyncValidation.Require(row.Fields.All(p => p.Key is "format" or "kind" or "projectId" or "revision" or "fields"), "SOURCE_MAPPING_REQUIRED");
        SyncValidation.Require(row.Fields["revision"] is JsonValue revision && (revision.TryGetValue<long>(out var number) && number > 0 || revision.TryGetValue<int>(out var small) && small > 0), "SOURCE_RECORD_MISMATCH");
        if (table is SyncTable.Projects or SyncTable.Tasks) SyncValidation.Require(row.Fields["projectId"] is null, "SOURCE_PROJECT_MISMATCH");
        var fields = row.Fields["fields"]!.AsObject();
        var allowed = table == SyncTable.Tasks ? new HashSet<string>(["title", "content", "startDate", "endDate", "isPublic"]) : new HashSet<string>(["title", "content", "startDate", "endDate", "isCompleted"]);
        foreach (var pair in fields) SyncValidation.Require(pair.Value is JsonValue value && value.TryGetValue<string>(out var text) && (allowed.Contains(pair.Key) || text.Length == 0), "SOURCE_MAPPING_REQUIRED");
        string Text(string key, int limit, bool required = false) { var value = fields[key]?.GetValue<string>() ?? ""; SyncValidation.Require((!required || !string.IsNullOrWhiteSpace(value)) && Encoding.UTF8.GetByteCount(value) <= limit, "SOURCE_FIELD_INVALID"); return value; }
        string Date(string key) { var value = Text(key, 10, true); SyncValidation.Require(DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "SOURCE_DATE_INVALID"); return value; }
        var start = Date("startDate"); var end = Date("endDate"); SyncValidation.Require(string.CompareOrdinal(start, end) <= 0, "SOURCE_DATE_INVALID");
        if (table == SyncTable.Tasks)
        {
            SyncValidation.Require(start == end, "SOURCE_MAPPING_REQUIRED");
            var content = Text("content", 20000, true); var title = Text("title", 300); var firstLine = content.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(line => !string.IsNullOrWhiteSpace(line))?.Trim() ?? content.Trim();
            SyncValidation.Require(title.Length == 0 || title == firstLine, "SOURCE_MAPPING_REQUIRED");
            var visibility = Text("isPublic", 5); SyncValidation.Require(visibility is "" or "true" or "false", "SOURCE_FIELD_INVALID");
            return new() { ["date"] = start, ["content"] = content, ["isPublic"] = visibility == "true" };
        }
        var result = new JsonObject { ["title"] = Text("title", 300, true), ["content"] = Text("content", 600000), ["startDate"] = start, ["endDate"] = end };
        if (table == SyncTable.Processes) { SyncValidation.Require(Text("content", 600000).Length == 0, "SOURCE_MAPPING_REQUIRED"); result.Remove("content"); var project = row.Fields["projectId"]?.GetValue<string>(); SyncValidation.Id(project); result["projectId"] = project; var complete = Text("isCompleted", 5); SyncValidation.Require(complete is "" or "true" or "false", "SOURCE_FIELD_INVALID"); result["isCompleted"] = complete == "true"; }
        else SyncValidation.Require(Text("isCompleted", 5).Length == 0, "SOURCE_MAPPING_REQUIRED");
        return result;
    }
}
