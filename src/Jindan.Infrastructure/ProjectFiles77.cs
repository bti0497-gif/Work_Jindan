using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Jindan.Contracts.Cloud;
using Jindan.Contracts.ProjectFiles;

namespace Jindan.Infrastructure.Cloud;

public sealed partial class CloudReadService71
{
    public Task<ProjectFile77> ExportProjectFile77Async(string projectId, CancellationToken ct) => Run("project.file.export", async token =>
    {
        await CheckMember(token); RequireProjectId77(projectId);
        var doc = await OptionalDocument77("jindan_projects", projectId, token);
        Require(doc is not null, "PROJECT_NOT_AVAILABLE");
        var f = doc!.Value.GetProperty("fields"); Require(!Boolean77(f, "deleted"), "PROJECT_NOT_AVAILABLE");
        var metadata = await OptionalDocument77("jindan_project_files", projectId, token);
        var settings = metadata is null ? null : JsonSerializer.Deserialize<ProjectFile77>(Field(metadata.Value.GetProperty("fields"), "metadataJson"));
        return new ProjectFile77
        {
            Project = new(projectId, Field(f, "title"), Field(f, "startDate"), Field(f, "endDate"), Field(f, "content"), Field(f, "createdAt"), Field(f, "author")),
            Server = settings?.Server ?? new("firebase", boardProject, "jindan_projects", "jindan_processes", projectId),
            Drive = settings?.Drive ?? new("google-drive", "", []), Reports = settings?.Reports ?? new("", []), Settings = settings?.Settings ?? []
        };
    }, ct);

    public Task<string> ImportProjectFile77Async(string requestId, string sourceHash, ProjectFile77 file, CancellationToken ct) => Run("project.file.import", async token =>
    {
        await CheckMember(token);
        Require(Guid.TryParseExact(requestId, "N", out _) && sourceHash.Length == 64 && sourceHash.All(Uri.IsHexDigit), "PROJECT_INPUT_INVALID");
        var previous = await OptionalDocument77("jindan_project_files", requestId, token);
        if (previous is not null)
        {
            var fields = previous.Value.GetProperty("fields");
            Require(Field(fields, "sourceSha256") == sourceHash && Field(fields, "ownerUid") == Member75.Uid, "PROJECT_REQUEST_CONFLICT");
            var existing = await OptionalDocument77("jindan_projects", requestId, token);
            Require(existing is not null && !Boolean77(existing.Value.GetProperty("fields"), "deleted"), "PROJECT_NOT_AVAILABLE"); return requestId;
        }
        var member = Member75; var now = DateTimeOffset.UtcNow.ToString("O");
        var writes = new List<object>();
        Dictionary<string, object> BaseFields(string id) => new()
        {
            ["id"] = String77(id), ["ownerUid"] = String77(member.Uid), ["author"] = String77(member.Name), ["authorId"] = String77(member.PersonId),
            ["createdAt"] = String77(now), ["updatedAt"] = String77(now), ["deleted"] = new { booleanValue = false }
        };
        void Add(string collection, string id, Dictionary<string, object> fields) => writes.Add(new
        {
            update = new { name = $"projects/{boardProject}/databases/(default)/documents/{collection}/{id}", fields }, currentDocument = new { exists = false }
        });
        var project = BaseFields(requestId);
        project["title"] = String77(file.Project.Name); project["content"] = String77(file.Project.Description);
        project["startDate"] = String77(file.Project.StartDate); project["endDate"] = String77(file.Project.EndDate); Add("jindan_projects", requestId, project);
        // Keep metadata in a dedicated document, never in the user's description or a fake work record.
        // Preserve source query scope and Drive/report references; never duplicate process/task/file data.
        var metadataJson = JsonSerializer.Serialize(file);
        Require(Encoding.UTF8.GetByteCount(metadataJson) <= 300000, "CLOUD_SIZE_LIMIT");
        Add("jindan_project_files", requestId, new()
        {
            ["projectId"] = String77(requestId), ["ownerUid"] = String77(member.Uid), ["sourceSha256"] = String77(sourceHash),
            ["schemaVersion"] = new { integerValue = "1" }, ["metadataJson"] = String77(metadataJson), ["createdAt"] = String77(now), ["updatedAt"] = String77(now)
        });
        await JsonAsync(Firestore(boardProject) + ":commit", boardToken, new { writes }, token);
        return requestId;
    }, ct);
    static object String77(string value) => new { stringValue = value };
    static bool Boolean77(JsonElement fields, string name) => fields.TryGetProperty(name, out var value) && value.TryGetProperty("booleanValue", out var flag) && flag.ValueKind == JsonValueKind.True;
    static void RequireProjectId77(string id) => Require(id.Length is > 0 and <= 128 && !id.Contains('/') && !id.Contains('\\') && id is not "." and not "..", "PROJECT_INPUT_INVALID");
    async Task<JsonElement?> OptionalDocument77(string collection, string id, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Firestore(boardProject) + "/" + collection + "/" + Uri.EscapeDataString(id));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", boardToken);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        Require(response.IsSuccessStatusCode, response.StatusCode == HttpStatusCode.Forbidden ? "PROJECT_FILE_ACCESS_DENIED" : "CLOUD_REQUEST_FAILED");
        using var input = await response.Content.ReadAsStreamAsync(ct); using var output = new MemoryStream(); await CopyBounded(input, output, 2 * 1024 * 1024, ct);
        using var document = JsonDocument.Parse(output.ToArray()); return document.RootElement.Clone();
    }
}
