using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Jindan.Contracts.Cloud;

namespace Jindan.Startup;

public sealed record StartupMember(string Id, string Name);
public sealed record ProjectChoice(string Id, string Name, string StartDate, string EndDate, string Description)
{
    public string LocalFilePath { get; init; } = "";
    public string FileLocation => LocalFilePath.Length == 0 ? "서버 · 파일 경로 미등록" : LocalFilePath;
}
public sealed record NewProject(string Name, DateOnly Start, DateOnly End, string Description);

// Only the host owns the connection. Feature DLLs receive this shared interface.
public interface IStartupServer : IDisposable
{
    bool IsAuthenticated { get; }
    StartupMember? Member { get; }
    Task SignInAsync(string id, string password, CancellationToken ct);
    Task<IReadOnlyList<ProjectChoice>> ListProjectsAsync(CancellationToken ct);
    Task<ProjectChoice> CreateProjectAsync(string requestId, NewProject input, CancellationToken ct);
    void Disconnect();
}

public static class StartupMessages
{
    public static bool RequiresLogin(Exception error) => error is CloudConnectionException &&
        error.Message is "FIREBASE_SIGN_IN_REQUIRED" or "FIREBASE_MEMBER_DISABLED" or "CLOUD_SIGN_IN_REQUIRED";
    public static string For(Exception error) => error is OperationCanceledException
        ? "요청 시간이 초과되었습니다. 연결을 확인하고 다시 시도해 주세요."
        : error.Message switch
        {
            "FIREBASE_MEMBER_DISABLED" => "사용할 수 없는 계정입니다. 관리자에게 활성 상태를 확인해 주세요.",
            "FIREBASE_SIGN_IN_REQUIRED" or "CLOUD_SIGN_IN_REQUIRED" => "로그인이 만료되었습니다. 다시 로그인해 주세요.",
            "CLOUD_ACCESS_DENIED" => "접근 권한이 없습니다. 관리자에게 확인해 주세요.",
            "CLOUD_RETRY_LATER" => "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
            "PROJECT_INPUT_INVALID" => "프로젝트명과 시작·종료일을 확인해 주세요.",
            "PROJECT_FILE_ACCESS_DENIED" => "서버의 프로젝트 파일 저장 권한을 확인해야 합니다. 서버 저장 규칙 적용 상태를 확인해 주세요.",
            "PROJECT_NOT_AVAILABLE" => "프로젝트가 삭제되었거나 현재 사용할 수 없습니다.",
            "PROJECT_REQUEST_CONFLICT" => "파일 등록 요청이 기존 자료와 다릅니다. 목록을 새로고침해 주세요.",
            _ => "서버 요청을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요."
        };
}

public abstract class ObservableState : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;
    protected void Changed([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new(name));
}

// Passwords and tokens never enter preferences; only the explicitly remembered ID is stored.
public static class RememberedId
{
    public static string Read(string path)
    {
        try { if (!File.Exists(path) || new FileInfo(path).Length > 4096) return ""; return JsonSerializer.Deserialize<string>(File.ReadAllText(path)) is { Length: <= 128 } id ? id : ""; }
        catch { return ""; }
    }
    public static void Save(string path, string id)
    {
        if (id.Length > 128) return;
        var temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            File.WriteAllText(temporary, JsonSerializer.Serialize(id)); File.Move(temporary, path, true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        finally { try { if (File.Exists(temporary)) File.Delete(temporary); } catch (IOException) { } }
    }
}
