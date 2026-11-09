using System.Net;
using System.Text;
using System.Text.Json;
using Jindan.Contracts;
using Jindan.Contracts.Cloud;
using Jindan.Infrastructure;
using Jindan.Infrastructure.Cloud;

static class StartupChecks75
{
    public static async Task Run(Action<bool, string> check)
    {
        using var handler = new ServerFixture75(); using var cloud = new CloudReadService71(handler: handler);
        using var local = new LocalWorkspace(Path.GetFullPath("artifacts/startup75-server-tests-" + Guid.NewGuid().ToString("N")));
        try { await local.OpenServerSession75Async(cloud); throw new Exception("Unverified session accepted"); } catch (CloudConnectionException) { check(true, "local server session requires successful remote authentication"); }
        var settings = new ServerSettings75("fixture-project", "fixture-key");
        handler.RejectLogin = true;
        try { await cloud.Authenticate75Async(settings, "sample-id", "sample-password"); throw new Exception("Bad login accepted"); } catch (CloudConnectionException) { check(!cloud.Status.BoardConnected, "server authentication failure never falls back to local login"); }
        handler.RejectLogin = false;
        var member = await cloud.Authenticate75Async(settings, "sample-id", "sample-password");
        check(member.Role == "editor" && member.Uid == "sample-uid", "server member identity and least privileged work role used");
        var actor = await local.OpenServerSession75Async(cloud); var data = new ServerProjectData75(local, cloud, actor);
        var rows = await data.ListAsync(actor, new("projects"));
        check(rows.Count == 1 && rows[0].Id == "server-project", "server projects retain IDs and omit deleted projects");
        check((await local.ListAsync(actor, new RecordQuery("projects"))).Single().Id == "server-project", "verified projects authorize isolated local report workspace");
        try { await data.ListAsync(actor with { Role = "admin" }, new("projects")); throw new Exception("Forged actor accepted"); } catch (UnauthorizedAccessException) { check(true, "copied or forged identity cannot use server data adapter"); }
        local.RegisterSchema(new("processes", "공정", [new("title", "제목", Required: true)]));
        await local.SaveAsync(actor, new(null, "processes", "server-project", 0, new() { ["title"] = "Scoped work" }));
        check((await local.ListAsync(actor, new RecordQuery("processes", "server-project"))).Count == 1, "selected server project supports authorized local module work");
        try { await cloud.CreateProject75Async(Guid.NewGuid().ToString("N"), new() { ["title"] = "Invalid date", ["startDate"] = "2026-12-01", ["endDate"] = "2026-01-01" }); throw new Exception("Invalid range accepted"); } catch (CloudConnectionException) { check(handler.Commits == 0, "invalid date range never sends project write"); }
        var created = await data.SaveAsync(actor, new(null, "projects", null, 0, new() { ["title"] = "New project", ["startDate"] = "2026-11-09", ["endDate"] = "2026-11-10", ["content"] = "Synthetic only" }));
        check(created.Fields["title"] == "New project" && handler.Commits == 1 && handler.ValidWrite, "project creation uses legacy schema and create-only server precondition");
        check((await data.ListAsync(actor, new("projects"))).Any(r => r.Id == created.Id), "created server project becomes selectable after refresh");
        handler.Active = false;
        try { await cloud.ListProjects75Async(); throw new Exception("Disabled member accepted"); } catch (CloudConnectionException) { check(!cloud.Status.BoardConnected, "disabled member invalidates server session"); }
        try { await local.ListAsync(actor, new RecordQuery("projects")); throw new Exception("Expired local session accepted"); } catch (Jindan.Core.WorkspaceException) { check(true, "revoked server session cannot use cached workspace"); }
        check(!File.ReadAllText(Path.Combine(local.DataRoot, "workspace.json")).Contains("sample-password"), "server password is absent from local cache");
    }
    sealed class ServerFixture75 : HttpMessageHandler
    {
        public bool RejectLogin, Active = true, ValidWrite; public int Commits;
        readonly List<JsonElement> created = [];
        static object S(string value) => new { stringValue = value };
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            object response; var path = request.RequestUri!.AbsolutePath;
            if (path.Contains("signInWithPassword"))
            { if (RejectLogin) return new(HttpStatusCode.Unauthorized); response = new { idToken = "synthetic-token", localId = "sample-uid", expiresIn = "3600" }; }
            else
            {
                if (request.Headers.Authorization?.Parameter != "synthetic-token") throw new Exception("No server bearer");
                if (path.EndsWith("jindan_members/sample-uid")) response = new { fields = new { isActive = new { booleanValue = Active }, person_id = S("sample-id"), name = S("Synthetic user"), userLevel = new { integerValue = "1" } } };
                else if (path.EndsWith("/jindan_projects"))
                {
                    var rows = new List<object> { new { name = "projects/fixture-project/databases/(default)/documents/jindan_projects/server-project", fields = new { title = S("Existing"), startDate = S("2026-11-01"), endDate = S("2026-11-30"), content = S(""), ownerUid = S("sample-uid"), deleted = new { booleanValue = false } } }, new { name = "projects/fixture-project/databases/(default)/documents/jindan_projects/deleted", fields = new { deleted = new { booleanValue = true } } } }; rows.AddRange(created.Cast<object>()); response = new { documents = rows };
                }
                else if (path.EndsWith("/documents:commit"))
                {
                    using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)); var write = json.RootElement.GetProperty("writes")[0]; var update = write.GetProperty("update");
                    ValidWrite = !write.GetProperty("currentDocument").GetProperty("exists").GetBoolean() && update.GetProperty("fields").GetProperty("ownerUid").GetProperty("stringValue").GetString() == "sample-uid" && update.GetProperty("fields").EnumerateObject().Select(f => f.Name).ToHashSet().SetEquals(new[] { "id", "author", "authorId", "ownerUid", "createdAt", "updatedAt", "deleted", "title", "content", "startDate", "endDate" });
                    created.Add(update.Clone()); Commits++; response = new { commitTime = "2026-11-09T00:00:00Z" };
                }
                else throw new Exception("Unexpected synthetic endpoint " + path);
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json") };
        }
    }
}
