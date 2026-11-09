using System.Globalization;
using System.Text;
using System.Text.Json;
using Jindan.Contracts;
using Jindan.Contracts.Cloud;

namespace Jindan.Infrastructure.Cloud;

public sealed record ServerMember75(string Uid, string PersonId, string Name, string Role);
public sealed record ServerSettings75(string ProjectId, string ApiKey)
{
    public static ServerSettings75 Read(string path) => JsonSerializer.Deserialize<ServerSettings75>(File.ReadAllText(path)) ?? throw new InvalidDataException();
}

public sealed partial class CloudReadService71
{
    ServerMember75? member75;
    internal ServerMember75 Member75 => Status.BoardConnected && member75 is not null ? member75 : throw new CloudConnectionException("FIREBASE_SIGN_IN_REQUIRED");
    static ServerMember75 ReadMember75(JsonElement fields, string uid, string personId)
    {
        var level = fields.TryGetProperty("userLevel", out var value) ? Text(value, "integerValue") : "";
        if (level.Length == 0 && fields.TryGetProperty("userLevel", out value)) level = Text(value, "stringValue");
        return new(uid, personId, Field(fields, "name") is { Length: > 0 } name ? name : personId, level == "0" ? "admin" : "editor");
    }
    public Task<ServerMember75> Authenticate75Async(ServerSettings75 settings, string id, string password, CancellationToken ct = default) => AuthenticateCore75(settings, id, password, ct);
    async Task<ServerMember75> AuthenticateCore75(ServerSettings75 settings, string id, string password, CancellationToken ct)
    {
        await ConnectBoardAsync(settings.ProjectId, settings.ApiKey, id, password, ct); return Member75;
    }
    public Task<IReadOnlyList<WorkRecord>> ListProjects75Async(CancellationToken ct = default) => Run<IReadOnlyList<WorkRecord>>("project.list", async token =>
    {
        await CheckMember(token);
        var result = new List<WorkRecord>();
        foreach (var row in await Documents("jindan_projects", token))
        {
            var fields = row.GetProperty("fields");
            if (fields.TryGetProperty("deleted", out var deleted) && deleted.TryGetProperty("booleanValue", out var flag) && flag.GetBoolean()) continue;
            var id = Text(row, "name").Split('/').Last();
            Require(id.Length is > 0 and <= 128 && id is not "." and not "..", "PROJECT_RESPONSE_INVALID");
            result.Add(new(id, "projects", null, Field(fields, "ownerUid"), 1, false, new() { ["title"] = Field(fields, "title"), ["startDate"] = Field(fields, "startDate"), ["endDate"] = Field(fields, "endDate"), ["content"] = Field(fields, "content") }));
        }
        Require(result.Select(r => r.Id).Distinct().Count() == result.Count, "PROJECT_RESPONSE_INVALID");
        return result;
    }, ct);
    public Task<WorkRecord> CreateProject75Async(string id, Dictionary<string, string> input, CancellationToken ct = default) => Run("project.create", async token =>
    {
        await CheckMember(token);
        Require(Guid.TryParseExact(id, "N", out _), "PROJECT_INPUT_INVALID");
        var title = input.GetValueOrDefault("title", "").Trim(); var content = input.GetValueOrDefault("content", "");
        var start = input.GetValueOrDefault("startDate", ""); var end = input.GetValueOrDefault("endDate", "");
        Require(title.Length > 0 && Encoding.UTF8.GetByteCount(title) <= 300 && Encoding.UTF8.GetByteCount(content) <= 600000, "PROJECT_INPUT_INVALID");
        Require(DateOnly.TryParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first) && DateOnly.TryParseExact(end, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var last) && first <= last, "PROJECT_INPUT_INVALID");
        var member = Member75; var now = DateTimeOffset.UtcNow.ToString("O");
        var fields = new Dictionary<string, object>();
        foreach (var (key, value) in new Dictionary<string, string> { ["id"] = id, ["title"] = title, ["content"] = content, ["startDate"] = start, ["endDate"] = end, ["author"] = member.Name, ["authorId"] = member.PersonId, ["ownerUid"] = member.Uid, ["createdAt"] = now, ["updatedAt"] = now }) fields[key] = new { stringValue = value };
        fields["deleted"] = new { booleanValue = false };
        // Create-only precondition: retrying the same ID can never overwrite a project.
        await JsonAsync(Firestore(boardProject) + ":commit", boardToken, new { writes = new[] { new { update = new { name = $"projects/{boardProject}/databases/(default)/documents/jindan_projects/{id}", fields }, currentDocument = new { exists = false } } } }, token);
        return new WorkRecord(id, "projects", null, member.Uid, 1, false, new() { ["title"] = title, ["startDate"] = start, ["endDate"] = end, ["content"] = content });
    }, ct);
}
