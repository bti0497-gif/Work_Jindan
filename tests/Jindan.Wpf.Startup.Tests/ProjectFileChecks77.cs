using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Jindan.Contracts.Cloud;
using Jindan.Contracts.ProjectFiles;
using Jindan.Infrastructure.Cloud;
using Jindan.Startup;
using Jindan.Startup.Server;

internal static class ProjectFileChecks77
{
    internal static ProjectFile77 Sample() => new()
    {
        Project = new("origin-project", "공유 기술진단 프로젝트", "2026-10-01", "2027-01-30", "연결 설정 예시", "2026-11-09T00:00:00Z", "작성자 예시"),
        Server = new("firebase", "source-company", "jindan_projects", "jindan_processes", "origin-project"),
        Drive = new("google-drive", "drive-folder", [new("drive-document", "현장 자료")]),
        Reports = new("report-folder", [new("report-document", "진단 보고서", "공정")]),
        Settings = new() { ["selectedDiscipline"] = "공정" }
    };
    public static async Task Run(Action<bool, string> check, string output)
    {
        var file = Sample(); var path = Path.Combine(output, "fixture.tzprj");
        await ProjectFileCodec.SaveAsync(path, file, default); var loaded = await ProjectFileCodec.ReadAsync(path, default);
        check(ProjectFileCodec.Fingerprint(file) == ProjectFileCodec.Fingerprint(loaded), "tzprj round trip retains project, server query scope, Drive and report references");
        check(new FileInfo(path).Length < 4096, "connection-only project example is smaller than 4KB");
        var json = Encoding.UTF8.GetString(ProjectFileCodec.Serialize(loaded));
        check(!json.Contains("\"tasks\"") && !json.Contains("\"processes\"") && !json.Contains("password") && !json.Contains("token"), "project file contains neither task/process data nor credentials");
        void Reject(ProjectFile77 value, string label)
        {
            try { ProjectFileCodec.Serialize(value); throw new Exception("accepted invalid file"); } catch (InvalidDataException) { check(true, label); }
        }
        Reject(file with { Version = 99 }, "unsupported project format is refused");
        Reject(file with { Settings = new() { ["accessToken"] = "not-a-real-token" } }, "secret-bearing settings are refused");
        Reject(file with { Server = file.Server with { ProcessesCollection = "jindan_members" } }, "project connection cannot redirect queries into account collections");
        Reject(file with { Reports = new("../escape", []) }, "invalid report folder references are refused");
        try { ProjectFileCodec.Deserialize(Encoding.UTF8.GetBytes(json.Replace("\"version\":1", "\"version\":1,\"version\":1"))); throw new Exception("duplicate key accepted"); }
        catch (InvalidDataException) { check(true, "duplicate JSON properties are refused"); }
        var malformed = Path.Combine(output, "unexpected-entry.tzprj");
        using (var outputStream = File.Create(malformed)) using (var archive = new ZipArchive(outputStream, ZipArchiveMode.Create))
        { using var writer = new StreamWriter(archive.CreateEntry("../project.json").Open()); writer.Write(json); }
        try { await ProjectFileCodec.ReadAsync(malformed, default); throw new Exception("path accepted"); }
        catch (InvalidDataException) { check(true, "archive traversal entries are refused without extraction"); }
        var original = await File.ReadAllBytesAsync(path); using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        try { await ProjectFileCodec.SaveAsync(path, file, cancelled.Token); throw new Exception("cancel ignored"); } catch (OperationCanceledException) { }
        var afterCancel = await File.ReadAllBytesAsync(path);
        check(original.SequenceEqual(afterCancel), "cancelled save preserves the existing project file");

        var fixture = new FileServerFixture();
        using var server = new FirebaseStartupServer(new CloudReadService71(handler: fixture), new("current-company", "public-key"));
        await server.SignInAsync("sample", "synthetic", default);
        var exported = await server.ExportProjectFileAsync("existing", default);
        check(exported.Server.ScopeProjectId == "existing" && exported.Project.CreatedBy == "기존 작성자", "server export preserves attribution and project query scope");
        var requestId = Guid.NewGuid().ToString("N"); fixture.LoseReply = true;
        try { await server.ImportProjectFileAsync(requestId, file, default); throw new Exception("expected lost response"); } catch (CloudConnectionException) { }
        var imported = await server.ImportProjectFileAsync(requestId, file, default);
        check(imported.Id == requestId && imported.Id != file.Project.Id && fixture.CommitCount == 1, "file import creates a new project once despite a lost response");
        check(fixture.Writes is { Length: 2 } && fixture.Writes.All(w => w.GetProperty("currentDocument").GetProperty("exists").GetBoolean() == false), "project and connections use one atomic create-only commit");
        check(fixture.Paths.All(p => !p.Contains("jindan_tasks") && !p.Contains("jindan_processes") && !p.Contains("googleapis.com/drive")), "file open/save never reads or writes task/process/Drive content");
        var resaved = await server.ExportProjectFileAsync(requestId, default);
        check(resaved.Server == file.Server && resaved.Drive.RootFolderId == file.Drive.RootFolderId && resaved.Reports.Documents[0] == file.Reports.Documents[0], "registered file retains original Firebase scope and shared Drive/report links");
        check(resaved.Project.CreatedBy == "현재 사용자", "new registration uses authenticated current-user attribution");
        fixture.DenyMetadata = true;
        try { await server.ImportProjectFileAsync(Guid.NewGuid().ToString("N"), file, default); throw new Exception("missing rules accepted"); }
        catch (CloudConnectionException e) { check(e.Message == "PROJECT_FILE_ACCESS_DENIED" && fixture.CommitCount == 1, "missing server rules fail before any partial project registration"); }
    }
    sealed class FileServerFixture : HttpMessageHandler
    {
        public bool LoseReply, DenyMetadata;
        public int CommitCount;
        public JsonElement[]? Writes;
        public List<string> Paths = [];
        readonly Dictionary<string, JsonElement> records = [];
        static object S(string value) => new { stringValue = value };
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath; Paths.Add(path); object response;
            if (path.Contains("signInWithPassword")) response = new { idToken = "fixture-file-token", localId = "current-user", expiresIn = "3600" };
            else
            {
                if (request.Headers.Authorization?.Parameter != "fixture-file-token") throw new Exception("no user bearer");
                if (path.EndsWith("/jindan_members/current-user")) response = new { fields = new { isActive = new { booleanValue = true }, person_id = S("sample"), name = S("현재 사용자"), userLevel = new { integerValue = "1" } } };
                else if (path.Contains("/jindan_project_files/") && DenyMetadata) return new(HttpStatusCode.Forbidden);
                else if (records.TryGetValue(path, out var record)) response = record;
                else if (path.EndsWith("/jindan_projects/existing")) response = new { fields = new { title = S("기존 프로젝트"), startDate = S("2026-10-01"), endDate = S("2027-01-30"), content = S(""), createdAt = S("2026-11-01T00:00:00Z"), author = S("기존 작성자") } };
                else if (path.EndsWith("/documents:commit"))
                {
                    using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)); Writes = json.RootElement.GetProperty("writes").EnumerateArray().Select(w => w.Clone()).ToArray();
                    foreach (var write in Writes) { var update = write.GetProperty("update"); records["/v1/" + update.GetProperty("name").GetString()] = update.Clone(); }
                    CommitCount++;
                    if (LoseReply) { LoseReply = false; throw new HttpRequestException("synthetic lost response"); }
                    response = new { commitTime = "2026-11-09T00:00:00Z" };
                }
                else return new(HttpStatusCode.NotFound);
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json") };
        }
    }
}
