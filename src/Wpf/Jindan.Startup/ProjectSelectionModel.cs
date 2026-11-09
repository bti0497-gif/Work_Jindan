using System.Collections.ObjectModel;
using System.Text;

namespace Jindan.Startup;

public sealed class ProjectSelectionModel(IStartupServer server, Func<ProjectChoice, ProjectChoice>? decorate = null) : ObservableState
{
    bool busy, loaded, requiresLogin;
    string notice = "프로젝트 목록을 불러오는 중입니다…";
    ProjectChoice? selected;
    (string Id, NewProject Input)? pending;
    public ObservableCollection<ProjectChoice> Projects { get; } = [];
    public bool IsBusy { get => busy; private set { busy = value; NotifyActions(); } }
    public bool CanAct => !busy && !requiresLogin;
    public bool CanOpen => CanAct && loaded && Selected is not null;
    public bool CanEdit => CanAct && pending is null;
    public bool RequiresLogin { get => requiresLogin; private set { requiresLogin = value; Changed(); NotifyActions(); } }
    public string CreateLabel => pending is null ? "만들기" : "생성 확인 / 재시도";
    public string Notice { get => notice; private set { notice = value; Changed(); } }
    public string Count => $"{Projects.Count}개";
    public ProjectChoice? Selected { get => selected; set { selected = value; Changed(); Changed(nameof(CanOpen)); } }
    void NotifyActions() { Changed(nameof(IsBusy)); Changed(nameof(CanAct)); Changed(nameof(CanOpen)); Changed(nameof(CanEdit)); Changed(nameof(CreateLabel)); }
    void Replace(IReadOnlyList<ProjectChoice> rows, string? selectedId)
    {
        Projects.Clear(); foreach (var row in rows.OrderBy(p => p.Name).ThenBy(p => p.Id)) Projects.Add(decorate?.Invoke(row) ?? row);
        Selected = Projects.FirstOrDefault(p => p.Id == selectedId); loaded = true; Changed(nameof(Count));
    }
    public void RefreshFileLocations() => Replace(Projects.ToArray(), Selected?.Id);
    void Failure(Exception error)
    {
        if (StartupMessages.RequiresLogin(error) || !server.IsAuthenticated) RequiresLogin = true;
        Notice = StartupMessages.For(error);
    }
    public async Task RefreshAsync(CancellationToken ct)
    {
        if (!CanAct) return;
        var previous = Selected?.Id; IsBusy = true; loaded = false; Notice = "프로젝트 목록을 불러오는 중입니다…";
        try
        {
            var rows = await server.ListProjectsAsync(ct); ct.ThrowIfCancellationRequested();
            var created = pending is { } p && rows.Any(r => r.Id == p.Id);
            Replace(rows, created ? pending!.Value.Id : previous);
            if (created) pending = null;
            Notice = created ? "프로젝트가 생성되었습니다. ‘열기’를 눌러 주세요." : rows.Count == 0 ? "프로젝트가 없습니다. 왼쪽에서 새 프로젝트를 만들어 주세요." : "프로젝트를 선택하고 ‘열기’를 눌러 주세요.";
        }
        catch (Exception error) { Projects.Clear(); Selected = null; Changed(nameof(Count)); Failure(error); }
        finally { IsBusy = false; }
    }
    public async Task CreateAsync(NewProject input, CancellationToken ct)
    {
        if (!CanAct) return;
        if (pending is null && (string.IsNullOrWhiteSpace(input.Name) || Encoding.UTF8.GetByteCount(input.Name.Trim()) > 300 || input.Start > input.End || Encoding.UTF8.GetByteCount(input.Description) > 600000))
        { Notice = "프로젝트명과 시작·종료일을 확인해 주세요."; return; }
        // Retain both ID and input across timeouts. A retry cannot create a second project.
        pending ??= (Guid.NewGuid().ToString("N"), input with { Name = input.Name.Trim() });
        IsBusy = true; Notice = "프로젝트를 만드는 중입니다…";
        try
        {
            var created = await server.CreateProjectAsync(pending.Value.Id, pending.Value.Input, ct); ct.ThrowIfCancellationRequested();
            created = decorate?.Invoke(created) ?? created;
            if (!Projects.Any(p => p.Id == created.Id)) Projects.Insert(0, created);
            Selected = created; loaded = true; pending = null; Changed(nameof(Count));
            Notice = "프로젝트를 만들었습니다. ‘열기’를 눌러 주세요.";
        }
        catch (Exception error)
        {
            Failure(error);
            if (!RequiresLogin) Notice += " 생성 결과가 불확실하면 ‘생성 확인 / 재시도’를 누르세요. 같은 요청으로 확인합니다.";
        }
        finally { IsBusy = false; }
    }
    public async Task<ProjectChoice?> OpenAsync(CancellationToken ct)
    {
        if (!CanOpen) return null;
        var id = Selected!.Id; IsBusy = true; Notice = "프로젝트를 확인하는 중입니다…";
        try
        {
            var rows = await server.ListProjectsAsync(ct); ct.ThrowIfCancellationRequested(); Replace(rows, id);
            if (Selected is null) Notice = "프로젝트가 삭제되었거나 접근할 수 없습니다. 다른 프로젝트를 선택해 주세요.";
            return Selected;
        }
        catch (Exception error) { loaded = false; Selected = null; Failure(error); return null; }
        finally { IsBusy = false; }
    }
}
