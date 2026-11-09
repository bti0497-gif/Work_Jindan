using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jindan.Contracts.Cloud;
using Jindan.Infrastructure;
using Jindan.Infrastructure.Cloud;
using Jindan.ModuleHost;

var passed = 0;
void Check(bool value, string name) { if (!value) throw new Exception(name); passed++; Console.WriteLine("PASS " + name); }
async Task Reject(Func<Task> action, string code) { try { await action(); throw new Exception("Expected rejection " + code); } catch (CloudConnectionException error) { Check(error.Message == code, code); } }
var folder = Path.Combine(Path.GetFullPath("artifacts"), "cloud71-tests-" + Guid.NewGuid().ToString("N"));
var handler = new Fixture(); var log = new Diagnostic71(folder);
async Task Browser(Uri uri)
{
    Check(uri.Host == "accounts.google.com", "OAuth uses external Google endpoint");
    var query = ParseQuery(uri.Query); Check(query["scope"] == "https://www.googleapis.com/auth/drive.readonly", "OAuth requests read-only access");
    Check(query["code_challenge_method"] == "S256" && query["code_challenge"].Length == 43, "PKCE challenge supplied"); handler.Challenge = query["code_challenge"];
    var callback = new Uri(query["redirect_uri"]); Check(callback.Host == "127.0.0.1" && callback.Scheme == "http", "Callback limited to loopback");
    // Complete asynchronously so AuthorizeGoogle can receive the callback.
    handler.Callback = Task.Run(async () => {
        using var bad = await localCallback(callback + "?state=wrong&code=bad"); Check(bad.StatusCode == HttpStatusCode.BadRequest, "Wrong OAuth state refused");
        using var good = await localCallback(callback + "?state=" + Uri.EscapeDataString(query["state"]) + "&code=fixture-code"); Check(good.StatusCode == HttpStatusCode.OK, "Matching OAuth response accepted");
    });
    await Task.CompletedTask;
}
static async Task<HttpResponseMessage> localCallback(string uri) { using var client = new HttpClient(); return await client.GetAsync(uri); }
using var service = new CloudReadService71(log, handler, Browser);
Check(!service.Status.BoardConnected && !service.Status.DriveConnected, "No automatic connection");
await Reject(() => service.ListBoardAsync("전체게시판", default), "FIREBASE_SIGN_IN_REQUIRED");
await service.ConnectBoardAsync("fixture-project", "fixture-key", "fixture-id", "fixture-password", default);
Check(service.Status.BoardConnected, "Firebase active member connection");
Check(handler.CorrectLogin, "Legacy ID and password transformation preserved");
var posts = await service.ListBoardAsync("전체게시판", default);
Check(posts.Count == 1 && posts[0].Attachments.Count == 1 && posts[0].Content == "<b>Fixture</b>", "Board fields and attachments preserved; deleted rows omitted");
var comments = await service.ListCommentsAsync(posts[0].Id, default);
Check(comments.Count == 1 && comments[0].Content == "comment", "Comments bound to selected post");
await Reject(() => service.ListCommentsAsync("unknown", default), "BOARD_SELECTION_REQUIRED");
handler.MemberActive = false;
await Reject(() => service.ListBoardAsync("전체게시판", default), "FIREBASE_MEMBER_DISABLED");
handler.MemberActive = true; await service.ConnectBoardAsync("fixture-project", "fixture-key", "fixture-id", "fixture-password", default); handler.Deny = true;
await Reject(() => service.ListBoardAsync("전체게시판", default), "CLOUD_ACCESS_DENIED"); handler.Deny = false;
await service.ConnectDriveAsync("fixture.apps.googleusercontent.com", "fixture-secret", "fixture-root", default); await handler.Callback;
Check(service.Status.DriveConnected && handler.CorrectVerifier, "Drive OAuth verifier and root verification");
var files = await service.ListDriveAsync(null, default);
Check(files.Count == 2 && files.All(x => x.Name != ".system"), "Drive pagination and system-folder filtering");
await Reject(() => service.ListDriveAsync("foreign-folder", default), "DRIVE_FOLDER_SCOPE");
using var destination = new MemoryStream(); await service.DownloadDriveAsync("file-1", destination, default);
Check(Encoding.UTF8.GetString(destination.ToArray()) == "fixture-file", "Selected Drive bytes downloaded");
await Reject(() => service.DownloadDriveAsync("unknown", destination, default), "DRIVE_SELECTION_REQUIRED");
handler.Cycle = true;
await Reject(() => service.ListDriveAsync(null, default), "CLOUD_PAGE_INVALID"); handler.Cycle = false;
service.Disconnect(); Check(!service.Status.DriveConnected && !service.Status.BoardConnected, "Disconnect clears both sessions");
await Reject(() => service.ListDriveAsync(null, default), "GOOGLE_SIGN_IN_REQUIRED");
await service.ConnectBoardAsync("fixture-project", "fixture-key", "fixture-id", "fixture-password", default);
handler.BlockMember = new(TaskCreationOptions.RunContinuationsAsynchronously);
var pending = service.ListBoardAsync("전체게시판", default);
await handler.MemberStarted.Task.WaitAsync(TimeSpan.FromSeconds(5)); service.Disconnect(); handler.BlockMember.SetResult(true);
try { await pending; throw new Exception("Cancelled response escaped"); } catch (OperationCanceledException) { Check(!service.Status.BoardConnected, "Disconnect invalidates an in-flight response"); }
handler.BlockMember = null;
Check(handler.Requests.All(x => x.Method == "GET" || x.Path.Contains("signInWithPassword") || x.Path == "/token"), "No cloud write endpoint invoked");
var records = string.Join("", Directory.GetFiles(folder, "*.jsonl").Select(File.ReadAllText));
Check(!new[] { "fixture-secret", "fixture-password", "fixture-token", "fixture-id", "Fixture</b>", "fixture-file" }.Any(records.Contains), "Diagnostic logs exclude credentials and contents");
var package = Path.Combine(folder, "package"); Directory.CreateDirectory(package);
var payload = Path.Combine(package, "test.dll"); File.Copy(typeof(CloudStatus).Assembly.Location, payload);
var manifest = new ModuleManifest { ModuleId = "cloud-test", Version = "1.0.1", EntryAssembly = "test.dll", EntryType = "Fixture.Module", RequiredHostCapabilities = ["unsupported/99"], Files = [new("test.dll", new FileInfo(payload).Length, ModuleCatalog.Hash(payload))] };
var manifestPath = Path.Combine(package, "module.json");
File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, ModuleCatalog.JsonOptions));
try { ModuleCatalog.Verify(package, new ModuleTrustPolicy([ModuleCatalog.Hash(manifestPath)])); throw new Exception("Unknown host capability accepted"); } catch (PackageException error) { Check(error.Code == "INCOMPATIBLE", "Required host capability mismatch rejected"); }
File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest with { RequiredHostCapabilities = ["cloud-read/71"] }, ModuleCatalog.JsonOptions));
Check(ModuleCatalog.Verify(package, new ModuleTrustPolicy([ModuleCatalog.Hash(manifestPath)])).Manifest.Version == "1.0.1", "Cloud module capability accepted by new host");
await StartupChecks75.Run(Check);
Console.WriteLine(JsonSerializer.Serialize(new { passed, failed = 0, realCloudRequests = 0 }));

static Dictionary<string, string> ParseQuery(string query) => query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries).Select(p => p.Split('=', 2)).ToDictionary(p => WebUtility.UrlDecode(p[0]), p => WebUtility.UrlDecode(p.ElementAtOrDefault(1) ?? ""));
sealed class Fixture : HttpMessageHandler
{
    public bool MemberActive = true, Deny, Cycle, CorrectLogin, CorrectVerifier; public string Challenge = ""; public Task Callback = Task.CompletedTask;
    public TaskCompletionSource<bool>? BlockMember; public TaskCompletionSource<bool> MemberStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public List<(string Method, string Path)> Requests = [];
    static object S(string text) => new { stringValue = text };
    static object Post(string id, bool deleted) => new { name = "projects/fixture-project/databases/(default)/documents/jindan_board_posts/" + id, fields = new { id = S(id), menu = S("전체게시판"), title = S("Title"), content = S("<b>Fixture</b>"), author = S("Writer"), updatedAt = S("2026-11-09"), deleted = new { booleanValue = deleted }, attachments = new { arrayValue = new { values = new[] { new { mapValue = new { fields = new { id = S("file-1"), name = S("file.txt"), size = new { integerValue = "12" }, mimeType = S("text/plain") } } } } } } } };
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var path = request.RequestUri!.AbsolutePath; Requests.Add((request.Method.Method, path));
        if (path.EndsWith("/jindan_members/fixture-uid") && BlockMember is not null) { MemberStarted.TrySetResult(true); await BlockMember.Task; }
        if (Deny) return new(HttpStatusCode.Forbidden) { Content = new StringContent("secret provider message") };
        object result;
        if (path.Contains("signInWithPassword")) { using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)); string Hash(string s) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(s))); CorrectLogin = body.RootElement.GetProperty("email").GetString() == "id-" + Hash("work-jindan:id:v1:fixture-id") + "@work-jindan.internal" && body.RootElement.GetProperty("password").GetString() == Hash("work-jindan:password:v1:fixture-id:fixture-password"); result = new { idToken = "fixture-token", localId = "fixture-uid", expiresIn = "3600" }; }
        else if (path == "/token") { var parameters = (await request.Content!.ReadAsStringAsync(ct)).Split('&').Select(p => p.Split('=', 2)).ToDictionary(p => WebUtility.UrlDecode(p[0]), p => WebUtility.UrlDecode(p[1])); var challenge = Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(parameters["code_verifier"]))).TrimEnd('=').Replace('+', '-').Replace('/', '_'); CorrectVerifier = challenge == Challenge; result = new { access_token = "fixture-token", expires_in = 3600 }; }
        else {
            if (request.Headers.Authorization?.Parameter != "fixture-token") throw new Exception("Missing bearer");
            if (path.EndsWith("/jindan_members/fixture-uid")) result = new { fields = new { isActive = new { booleanValue = MemberActive }, person_id = S("fixture-id") } };
            else if (path.EndsWith("/jindan_board_posts")) result = new { documents = new[] { Post("post-1", false), Post("removed", true) } };
            else if (path.EndsWith("/jindan_board_comments")) result = new { documents = new[] { new { fields = new { id = S("c1"), postId = S("post-1"), author = S("Commenter"), content = S("comment"), createdAt = S("2026-11-09") } } } };
            else if (path.EndsWith("/fixture-root")) result = new { id = "fixture-root", name = "Root", mimeType = "application/vnd.google-apps.folder", trashed = false };
            else if (path.EndsWith("/file-1")) return new(HttpStatusCode.OK) { Content = new StringContent("fixture-file") };
            else if (path == "/drive/v3/files") { var page2 = request.RequestUri.Query.Contains("pageToken="); result = page2 ? new { files = new[] { new { id = Cycle ? "other" : "folder-1", name = "Folder", mimeType = "application/vnd.google-apps.folder" } }, nextPageToken = Cycle ? "page2" : "" } : (object)new { files = new[] { new { id = "file-1", name = "file.txt", mimeType = "text/plain", size = "12" }, new { id = "hidden", name = ".system", mimeType = "application/vnd.google-apps.folder", size = "0" } }, nextPageToken = "page2" }; }
            else throw new Exception("Unexpected fixture route");
        }
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(result), Encoding.UTF8, "application/json") };
    }
}
