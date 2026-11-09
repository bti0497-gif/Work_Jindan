using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jindan.Contracts.Cloud;
using Jindan.Contracts.Drive;
using Jindan.Infrastructure.Drive;

namespace Jindan.Infrastructure.Cloud;

/// <summary>Explicit, session-only read connections. No inherited settings, cloud mutations or local CRUD impersonation.</summary>
public sealed partial class CloudReadService71 : ICloudReadService
{
    readonly HttpClient http; readonly Func<Uri, Task> openBrowser; readonly Diagnostic71? log;
    readonly SemaphoreSlim gate = new(1); readonly CancellationTokenSource lifetime = new();
    CancellationTokenSource session = new(); long generation;
    string driveToken = "", driveRoot = "", boardToken = "", boardProject = "", boardUid = "";
    DateTimeOffset driveExpiry, boardExpiry;
    readonly Dictionary<string, DriveEntry> known = new(StringComparer.Ordinal);
    readonly Dictionary<string, HashSet<string>> children = new(StringComparer.Ordinal);
    readonly HashSet<string> posts = new(StringComparer.Ordinal);
    public CloudStatus Status => new(driveToken.Length > 0 && driveExpiry > DateTimeOffset.UtcNow, boardToken.Length > 0 && boardExpiry > DateTimeOffset.UtcNow);
    public CloudReadService71(Diagnostic71? diagnostic = null, HttpMessageHandler? handler = null, Func<Uri, Task>? browser = null)
    {
        log = diagnostic;
        http = new(handler ?? new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };
        openBrowser = browser ?? (uri => { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); return Task.CompletedTask; });
    }
    public void Disconnect() { Interlocked.Increment(ref generation); session.Cancel(); driveToken = boardToken = ""; log?.Write("cloud.disconnect", "success"); }
    public void Dispose() { Disconnect(); lifetime.Cancel(); http.Dispose(); lifetime.Dispose(); }
    async Task<T> Run<T>(string operation, Func<CancellationToken, Task<T>> action, CancellationToken ct)
    {
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        var stamp = Interlocked.Read(ref generation);
        await gate.WaitAsync(wait.Token).ConfigureAwait(false);
        if (stamp != Interlocked.Read(ref generation)) { gate.Release(); throw new OperationCanceledException(); }
        if (session.IsCancellationRequested) { session.Dispose(); session = new(); }
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(wait.Token, session.Token);
        var timer = Stopwatch.StartNew(); log?.Write(operation, "start");
        try { var result = await action(linked.Token).ConfigureAwait(false); linked.Token.ThrowIfCancellationRequested(); if (stamp != Interlocked.Read(ref generation)) throw new OperationCanceledException(); log?.Write(operation, "success", timer.ElapsedMilliseconds); return result; }
        catch (OperationCanceledException) { if (stamp != Interlocked.Read(ref generation)) driveToken = boardToken = ""; log?.Write(operation, "cancelled", timer.ElapsedMilliseconds); throw; }
        catch (CloudConnectionException error) { log?.Write(operation, "failure", timer.ElapsedMilliseconds, code: error.Message); throw; }
        catch { log?.Write(operation, "failure", timer.ElapsedMilliseconds); throw new CloudConnectionException("CLOUD_REQUEST_FAILED"); }
        finally { gate.Release(); }
    }
    static void Require(bool condition, string code) { if (!condition) throw new CloudConnectionException(code); }
    static string Text(JsonElement value, string key) => value.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString()! : "";
    static string Field(JsonElement value, string key) => value.TryGetProperty(key, out var field) ? Text(field, "stringValue") : "";
    static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static string Base64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    static string Query(IEnumerable<KeyValuePair<string, string>> values) => string.Join("&", values.Select(p => Uri.EscapeDataString(p.Key) + "=" + Uri.EscapeDataString(p.Value)));
    async Task<JsonElement> JsonAsync(string url, string? token, object? body, CancellationToken ct, bool form = false)
    {
        using var request = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, url);
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = form ? new FormUrlEncodedContent((Dictionary<string, string>)body) : new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        Require(response.IsSuccessStatusCode, response.StatusCode switch { HttpStatusCode.Unauthorized => "CLOUD_SIGN_IN_REQUIRED", HttpStatusCode.Forbidden => "CLOUD_ACCESS_DENIED", HttpStatusCode.TooManyRequests => "CLOUD_RETRY_LATER", _ => "CLOUD_REQUEST_REJECTED" });
        using var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false); using var memory = new MemoryStream();
        await CopyBounded(stream, memory, 8 * 1024 * 1024, ct).ConfigureAwait(false);
        using var json = JsonDocument.Parse(memory.ToArray()); return json.RootElement.Clone();
    }
    static async Task CopyBounded(Stream source, Stream target, long limit, CancellationToken ct)
    {
        var buffer = new byte[65536]; long total = 0; int read;
        while ((read = await source.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0) { total += read; Require(total <= limit, "CLOUD_SIZE_LIMIT"); await target.WriteAsync(buffer.AsMemory(0, read), ct).ConfigureAwait(false); }
    }
    public Task ConnectBoardAsync(string projectId, string apiKey, string personId, string password, CancellationToken ct) => Run("board.connect", async token =>
    {
        boardToken = ""; posts.Clear();
        Require(projectId.Length is > 0 and <= 100 && projectId.All(c => char.IsAsciiLetterOrDigit(c) || c == '-'), "FIREBASE_PROJECT_REQUIRED");
        Require(apiKey.Length is > 0 and <= 256 && personId.Trim().Length is > 0 and <= 128 && password.Length is > 0 and <= 1024, "FIREBASE_LOGIN_REQUIRED");
        var identity = personId.Trim();
        var result = await JsonAsync("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + Uri.EscapeDataString(apiKey), null,
            new { email = "id-" + Hash("work-jindan:id:v1:" + identity) + "@work-jindan.internal", password = Hash("work-jindan:password:v1:" + identity + ":" + password), returnSecureToken = true }, token);
        var access = Text(result, "idToken"); var uid = Text(result, "localId");
        Require(access.Length > 0 && uid.Length > 0 && !uid.Contains('/'), "FIREBASE_RESPONSE_INVALID");
        var profile = await JsonAsync(Firestore(projectId) + "/jindan_members/" + Uri.EscapeDataString(uid), access, null, token);
        var fields = profile.GetProperty("fields");
        Require(fields.TryGetProperty("isActive", out var active) && active.GetProperty("booleanValue").GetBoolean() && Field(fields, "person_id") == identity, "FIREBASE_MEMBER_DISABLED");
        token.ThrowIfCancellationRequested(); boardProject = projectId; boardUid = uid; boardExpiry = Expiry(result); boardToken = access;
        member75 = ReadMember75(fields, uid, identity); return true;
    }, ct);
    static DateTimeOffset Expiry(JsonElement result) { var text = Text(result, "expiresIn"); var seconds = int.TryParse(text, out var n) ? n : result.TryGetProperty("expires_in", out var expiry) && expiry.TryGetInt32(out n) ? n : 0; Require(seconds > 0, "CLOUD_TOKEN_INVALID"); return DateTimeOffset.UtcNow.AddSeconds(Math.Min(seconds, 3600) - 30); }
    static string Firestore(string project) => "https://firestore.googleapis.com/v1/projects/" + Uri.EscapeDataString(project) + "/databases/(default)/documents";
    async Task CheckMember(CancellationToken ct)
    {
        Require(Status.BoardConnected, "FIREBASE_SIGN_IN_REQUIRED");
        var profile = await JsonAsync(Firestore(boardProject) + "/jindan_members/" + Uri.EscapeDataString(boardUid), boardToken, null, ct);
        var fields = profile.GetProperty("fields");
        if (!fields.GetProperty("isActive").GetProperty("booleanValue").GetBoolean() || member75 is null || Field(fields, "person_id") != member75.PersonId)
        { boardToken = ""; member75 = null; throw new CloudConnectionException("FIREBASE_MEMBER_DISABLED"); }
        member75 = ReadMember75(fields, boardUid, member75.PersonId);
    }
    async Task<List<JsonElement>> Documents(string collection, CancellationToken ct)
    {
        var all = new List<JsonElement>(); var pages = new HashSet<string>(); var next = "";
        do { var page = await JsonAsync(Firestore(boardProject) + "/" + collection + "?pageSize=200" + (next.Length > 0 ? "&pageToken=" + Uri.EscapeDataString(next) : ""), boardToken, null, ct);
            if (page.TryGetProperty("documents", out var rows)) all.AddRange(rows.EnumerateArray().Select(x => x.Clone()));
            Require(all.Count <= 2000 && pages.Count < 30, "CLOUD_LIST_LIMIT"); next = Text(page, "nextPageToken"); Require(next.Length == 0 || pages.Add(next), "CLOUD_PAGE_INVALID");
        } while (next.Length > 0); return all;
    }
    public Task<IReadOnlyList<CloudPost>> ListBoardAsync(string menu, CancellationToken ct) => Run<IReadOnlyList<CloudPost>>("board.list", async token =>
    {
        Require(menu is "전체게시판" or "본사공지", "BOARD_MENU_INVALID"); await CheckMember(token); var result = new List<CloudPost>();
        foreach (var doc in await Documents("jindan_board_posts", token)) {
            var f = doc.GetProperty("fields"); if (Field(f, "menu") != menu || f.GetProperty("deleted").GetProperty("booleanValue").GetBoolean()) continue;
            var id = Field(f, "id"); Require(Text(doc, "name").EndsWith("/jindan_board_posts/" + id, StringComparison.Ordinal) && id.Length > 0 && !id.Contains('/'), "BOARD_SCHEMA_INVALID");
            var attachments = new List<CloudAttachment>();
            if (f.TryGetProperty("attachments", out var a) && a.GetProperty("arrayValue").TryGetProperty("values", out var values)) foreach (var value in values.EnumerateArray()) { var v = value.GetProperty("mapValue").GetProperty("fields"); attachments.Add(new(Field(v, "id"), Field(v, "name"), v.TryGetProperty("size", out var size) && long.TryParse(Text(size, "integerValue"), out var length) ? length : 0, Field(v, "mimeType"))); }
            Require(attachments.Count <= 10, "BOARD_SCHEMA_INVALID"); result.Add(new(id, Field(f, "title"), Field(f, "content"), Field(f, "author"), Field(f, "updatedAt"), attachments));
        }
        posts.Clear(); foreach (var post in result) posts.Add(post.Id); return result.OrderByDescending(p => p.UpdatedAt, StringComparer.Ordinal).ToArray();
    }, ct);
    public Task<IReadOnlyList<CloudComment>> ListCommentsAsync(string postId, CancellationToken ct) => Run<IReadOnlyList<CloudComment>>("board.comments", async token =>
    {
        Require(posts.Contains(postId), "BOARD_SELECTION_REQUIRED"); await CheckMember(token);
        var rows = await Documents("jindan_board_comments", token);
        return rows.Select(x => x.GetProperty("fields")).Where(f => Field(f, "postId") == postId).Select(f => new CloudComment(Field(f, "id"), Field(f, "content"), Field(f, "author"), Field(f, "createdAt"))).OrderBy(x => x.CreatedAt, StringComparer.Ordinal).ToArray();
    }, ct);
    public Task ConnectDriveAsync(string clientId, string clientSecret, string rootId, CancellationToken ct) => Run("drive.connect", async token =>
    {
        driveToken = ""; known.Clear(); children.Clear(); DriveBoundary.Id(rootId);
        Require(clientId.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal) && clientId.Length <= 256 && clientSecret.Length <= 512, "GOOGLE_DESKTOP_CLIENT_REQUIRED");
        var access = await AuthorizeGoogle(clientId, clientSecret, token); var bearer = Text(access, "access_token"); Require(bearer.Length > 0, "CLOUD_TOKEN_INVALID");
        var root = await JsonAsync("https://www.googleapis.com/drive/v3/files/" + Uri.EscapeDataString(rootId) + "?supportsAllDrives=true&fields=id,name,mimeType,trashed", bearer, null, token);
        Require(Text(root, "id") == rootId && Text(root, "mimeType") == DriveEntry.FolderMime && !root.GetProperty("trashed").GetBoolean(), "DRIVE_ROOT_INVALID");
        token.ThrowIfCancellationRequested(); driveRoot = rootId; driveExpiry = Expiry(access); driveToken = bearer; known[rootId] = new(rootId, Text(root, "name"), DriveEntry.FolderMime); return true;
    }, ct);
    async Task<JsonElement> AuthorizeGoogle(string clientId, string clientSecret, CancellationToken ct)
    {
        var reservation = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0); reservation.Start(); var port = ((IPEndPoint)reservation.LocalEndpoint).Port; reservation.Stop();
        using var listener = new HttpListener(); var redirect = $"http://127.0.0.1:{port}/callback/"; listener.Prefixes.Add(redirect); listener.Start();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromMinutes(3));
        var verifier = Base64(RandomNumberGenerator.GetBytes(32)); var state = Base64(RandomNumberGenerator.GetBytes(32));
        var parameters = new Dictionary<string, string> { ["client_id"] = clientId, ["redirect_uri"] = redirect, ["response_type"] = "code", ["scope"] = "https://www.googleapis.com/auth/drive.readonly", ["code_challenge_method"] = "S256", ["code_challenge"] = Base64(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))), ["state"] = state };
        await openBrowser(new Uri("https://accounts.google.com/o/oauth2/v2/auth?" + Query(parameters)));
        while (true) {
            var callback = await listener.GetContextAsync().WaitAsync(timeout.Token); var query = callback.Request.QueryString;
            var valid = callback.Request.HttpMethod == "GET" && callback.Request.Url?.AbsolutePath == "/callback/" && query.GetValues("state") is { Length: 1 } states && states[0] == state;
            callback.Response.StatusCode = valid ? 200 : 400; callback.Response.ContentType = "text/plain; charset=utf-8";
            var bytes = Encoding.UTF8.GetBytes(valid ? "인증 응답을 받았습니다. 진단 작업대로 돌아가세요." : "인증 요청이 일치하지 않습니다.");
            await callback.Response.OutputStream.WriteAsync(bytes, timeout.Token); callback.Response.Close();
            if (!valid) continue; Require(query.GetValues("code") is { Length: 1 } && !string.IsNullOrEmpty(query["code"]), "GOOGLE_AUTH_CANCELLED");
            return await JsonAsync("https://oauth2.googleapis.com/token", null, new Dictionary<string, string> { ["client_id"] = clientId, ["client_secret"] = clientSecret, ["code"] = query["code"]!, ["code_verifier"] = verifier, ["redirect_uri"] = redirect, ["grant_type"] = "authorization_code" }, timeout.Token, true);
        }
    }
    public Task<IReadOnlyList<DriveEntry>> ListDriveAsync(string? folderId, CancellationToken ct) => Run<IReadOnlyList<DriveEntry>>("drive.list", async token =>
    {
        Require(Status.DriveConnected, "GOOGLE_SIGN_IN_REQUIRED"); folderId ??= driveRoot;
        Require(known.TryGetValue(folderId, out var parent) && parent.IsFolder, "DRIVE_FOLDER_SCOPE"); DriveBoundary.Id(folderId);
        var entries = new List<DriveEntry>(); var pages = new HashSet<string>(); var next = "";
        do { var query = new Dictionary<string, string> { ["q"] = $"'{folderId}' in parents and trashed=false", ["fields"] = "nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime)", ["pageSize"] = "1000", ["supportsAllDrives"] = "true", ["includeItemsFromAllDrives"] = "true" }; if (next.Length > 0) query["pageToken"] = next;
            var data = await JsonAsync("https://www.googleapis.com/drive/v3/files?" + Query(query), driveToken, null, token);
            Require(!data.TryGetProperty("incompleteSearch", out var incomplete) || !incomplete.GetBoolean(), "DRIVE_INCOMPLETE_SEARCH");
            foreach (var file in data.GetProperty("files").EnumerateArray()) entries.Add(new(Text(file, "id"), Text(file, "name"), Text(file, "mimeType"), long.TryParse(Text(file, "size"), out var length) ? length : 0, DateTimeOffset.TryParse(Text(file, "modifiedTime"), out var time) ? time : null));
            Require(entries.Count <= 10000 && pages.Count < 30, "CLOUD_LIST_LIMIT"); next = Text(data, "nextPageToken"); Require(next.Length == 0 || pages.Add(next), "CLOUD_PAGE_INVALID");
        } while (next.Length > 0);
        DriveBoundary.Entries(entries); children[folderId] = entries.Where(DriveBoundary.Visible).Select(e => e.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var entry in entries.Where(DriveBoundary.Visible)) known[entry.Id] = entry;
        var reachable = new HashSet<string>(StringComparer.Ordinal) { driveRoot }; var queue = new Queue<string>(); queue.Enqueue(driveRoot);
        while (queue.TryDequeue(out var current)) if (children.TryGetValue(current, out var descendants)) foreach (var id in descendants) if (reachable.Add(id)) queue.Enqueue(id);
        foreach (var stale in known.Keys.Where(id => !reachable.Contains(id)).ToArray()) { known.Remove(stale); children.Remove(stale); }
        Require(known.Count <= 20000, "CLOUD_LIST_LIMIT");
        return entries.Where(DriveBoundary.Visible).OrderByDescending(x => x.IsFolder).ThenBy(x => x.Name).ToArray();
    }, ct);
    public Task DownloadDriveAsync(string fileId, Stream destination, CancellationToken ct) => Run("drive.download", async token =>
    {
        Require(Status.DriveConnected, "GOOGLE_SIGN_IN_REQUIRED"); Require(known.TryGetValue(fileId, out var entry) && !entry.IsFolder, "DRIVE_SELECTION_REQUIRED");
        Require(!entry!.MimeType.StartsWith("application/vnd.google-apps.", StringComparison.Ordinal), "DRIVE_EXPORT_NOT_SUPPORTED");
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/drive/v3/files/" + Uri.EscapeDataString(fileId) + "?alt=media&supportsAllDrives=true"); request.Headers.Authorization = new("Bearer", driveToken);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token); Require(response.IsSuccessStatusCode, "DRIVE_DOWNLOAD_DENIED");
        using var stream = await response.Content.ReadAsStreamAsync(token); await CopyBounded(stream, destination, 256L * 1024 * 1024, token); return true;
    }, ct);
}
