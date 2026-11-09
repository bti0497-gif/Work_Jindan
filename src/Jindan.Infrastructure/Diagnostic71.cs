using System.Text.Json;
namespace Jindan.Infrastructure;

// Fixed event names and numeric metadata only. Never exception messages or payloads.
public sealed class Diagnostic71
{
    readonly string path; readonly object gate = new(); int count;
    static readonly HashSet<string> Events = new(["project.file.export", "project.file.import", "project.window", "project.list", "project.create", "project.selected", "app.start", "app.failure", "login.window", "login.submit", "login.success", "modules.loaded", "module.load", "module.open", "drive.connect", "drive.list", "drive.download", "board.connect", "board.list", "board.comments", "cloud.disconnect"]);
    public Diagnostic71(string directory) { path = Path.Combine(directory, $"session-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.jsonl"); }
    public void Write(string operation, string phase, long elapsedMs = 0, int items = 0, string? code = null, string? component = null)
    {
        if (!Events.Contains(operation) || !new[] { "start", "success", "failure", "cancelled" }.Contains(phase)) return;
        var safeCode = new[] { "CLOUD_SIGN_IN_REQUIRED", "CLOUD_ACCESS_DENIED", "CLOUD_RETRY_LATER", "CLOUD_REQUEST_REJECTED", "CLOUD_SIZE_LIMIT", "CLOUD_LIST_LIMIT", "CLOUD_PAGE_INVALID", "CLOUD_REQUEST_FAILED", "FIREBASE_SIGN_IN_REQUIRED", "FIREBASE_MEMBER_DISABLED", "FIREBASE_PROJECT_REQUIRED", "FIREBASE_LOGIN_REQUIRED", "FIREBASE_RESPONSE_INVALID", "BOARD_MENU_INVALID", "BOARD_SCHEMA_INVALID", "BOARD_SELECTION_REQUIRED", "GOOGLE_DESKTOP_CLIENT_REQUIRED", "GOOGLE_AUTH_CANCELLED", "GOOGLE_SIGN_IN_REQUIRED", "CLOUD_TOKEN_INVALID", "DRIVE_ROOT_INVALID", "DRIVE_FOLDER_SCOPE", "DRIVE_INCOMPLETE_SEARCH", "DRIVE_SELECTION_REQUIRED", "DRIVE_EXPORT_NOT_SUPPORTED", "DRIVE_DOWNLOAD_DENIED" }.Contains(code) ? code : null;
        var safeComponent = new[] { "projects", "processes", "photos", "files", "tasks", "board", "members", "dashboard", "report-studio" }.Contains(component) ? component : null;
        try { lock (gate) { if (count++ >= 10000) return; Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.AppendAllText(path, JsonSerializer.Serialize(new { time = DateTimeOffset.UtcNow, operation, phase, elapsedMs, items, code = safeCode, component = safeComponent }) + Environment.NewLine); } } catch { }
    }
}
