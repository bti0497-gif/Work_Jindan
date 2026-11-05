using System.Text.Json;
using Jindan.Contracts;
using Jindan.Contracts.Drive;
using Jindan.Infrastructure.Drive;
namespace Jindan.Modules.Files;

// This is an explicit offline test surface, not a live Drive authorization screen.
public sealed class DriveCacheWindow : Form
{
    readonly IWorkspaceServices services; readonly DocumentContext context;
    readonly Label notice = new() { Name = "DriveCacheStatus", Dock = DockStyle.Top, Height = 64, AutoEllipsis = true, Padding = new Padding(8) };
    readonly TreeView tree = new() { Name = "DriveCacheFolders", Dock = DockStyle.Left, Width = 230 };
    readonly DataGridView list = new() { Name = "DriveCachedEntries", Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, RowHeadersVisible = false };
    readonly FlowLayoutPanel actions = new() { Dock = DockStyle.Top, AutoSize = true, WrapContents = true };
    readonly CancellationTokenSource lifetime = new(); CancellationTokenSource? operation; DriveListingCache? cache; DriveScope? scope; bool rebuilding;
    readonly System.Windows.Forms.Timer refreshTimer = new() { Interval = 10 * 60 * 1000 };
    public DriveCacheWindow(IWorkspaceServices services, DocumentContext context)
    {
        this.services = services; this.context = context; Text = "Drive 목록 캐시 · 독립 로컬 시험"; Width = 1050; Height = 700; StartPosition = FormStartPosition.CenterParent;
        list.Columns.Add("name", "자료명"); list.Columns.Add("type", "형식"); list.Columns.Add("bytes", "바이트");
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(8) }; layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.AutoSize)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var body = new Panel { Dock = DockStyle.Fill }; body.Controls.Add(list); body.Controls.Add(tree); actions.Dock = DockStyle.Fill; notice.Dock = DockStyle.Fill; layout.Controls.Add(actions, 0, 0); layout.Controls.Add(notice, 0, 1); layout.Controls.Add(body, 0, 2); Controls.Add(layout);
        Add("합성 목록 예제 저장", SaveFixtureDialogAsync); Add("로컬 시험 목록 열기", OpenFixtureDialogAsync); Add("저장 캐시 다시 열기", ReopenAsync); Add("전체 목록 갱신", RefreshAllAsync); Add("선택 폴더 갱신", () => RunOperationAsync(ct => cache!.RefreshAsync(SelectedFolder(), true, ct))); Add("취소", () => { operation?.Cancel(); return Task.CompletedTask; });
        var offline = new CheckBox { Text = "연결 실패 모의", Name = "DriveOfflineSimulation", AutoSize = true }; offline.CheckedChanged += (_, _) => SimulateOffline(offline.Checked); actions.Controls.Add(offline);
        var delayed = new CheckBox { Text = "응답 지연 모의", Name = "DriveDelaySimulation", AutoSize = true }; delayed.CheckedChanged += (_, _) => { delaySimulation = delayed.Checked; ConfigureSimulation(); }; actions.Controls.Add(delayed);
        refreshTimer.Tick += async (_, _) => { if (operation is not null || cache is null) return; try { await RefreshAllAsync(); } catch (OperationCanceledException) { } catch (Exception e) { notice.Text = DriveBoundary.ErrorCode(e, "DRIVE_LOCAL_FAILURE"); } };
        tree.AfterSelect += (_, _) => { if (!rebuilding) RenderEntries(); }; notice.Text = "실제 Drive 미연결 · 계정/토큰을 사용하지 않음. 합성 목록을 명시적으로 열어 캐시·오프라인·재시작을 시험하세요.";
    }
    void Add(string text, Func<Task> action) { var button = new Button { Text = text, AutoSize = true }; button.Click += async (_, _) => { try { await action(); } catch (OperationCanceledException) { notice.Text = "목록 갱신 취소 · 마지막 저장 캐시는 유지됩니다."; } catch (Exception e) { notice.Text = "로컬 시험 오류: " + (e is DriveBoundaryException b ? b.Code : "DRIVE_LOCAL_FAILURE"); } }; actions.Controls.Add(button); }
    async Task AuthorizeAsync() { if (context.UserId != services.Actor.Id || context.ProjectId is null) throw new DriveBoundaryException("DRIVE_SCOPE_DENIED"); await services.Data.ListAsync(services.Actor, new("files", context.ProjectId), lifetime.Token); }
    public async Task<OfflineDriveFixture> CreateExampleAsync()
    {
        await AuthorizeAsync(); var selected = new DriveScope(context.UserId, context.ProjectId!, "offline-root");
        return new(1, selected, [new(selected, selected.RootId, [new("offline-folder", "합성 자료 폴더", DriveEntry.FolderMime), new("offline-text", "합성 메모.txt", "text/plain", 12), new("offline-system", ".system", DriveEntry.FolderMime)]), new(selected, "offline-folder", [new("offline-report", "합성 보고서.pdf", "application/pdf", 40)]), new(selected, "offline-system", [])]);
    }
    async Task SaveFixtureDialogAsync() { var fixture = await CreateExampleAsync(); using var dialog = new SaveFileDialog { FileName = "offline-drive-listing.json", Filter = "JSON|*.json", OverwritePrompt = true }; if (dialog.ShowDialog(this) != DialogResult.OK) return; DriveBoundary.LocalPath(dialog.FileName); if (File.Exists(dialog.FileName)) throw new DriveBoundaryException("DRIVE_DESTINATION_EXISTS"); await File.WriteAllTextAsync(dialog.FileName, JsonSerializer.Serialize(fixture, new JsonSerializerOptions { WriteIndented = true }), lifetime.Token); notice.Text = "합성 목록 예제를 저장했습니다. 실제 회사 파일이나 계정이 포함되지 않습니다."; }
    async Task OpenFixtureDialogAsync() { using var dialog = new OpenFileDialog { Filter = "JSON|*.json", Title = "현재 로컬 사용자·프로젝트의 합성 Drive 목록" }; if (dialog.ShowDialog(this) == DialogResult.OK) await OpenFixtureAsync(dialog.FileName); }
    public async Task OpenFixtureAsync(string path)
    {
        if (operation is not null) throw new DriveBoundaryException("DRIVE_OPERATION_ACTIVE"); await AuthorizeAsync(); var fixture = await OfflineDriveTransport.ReadFixtureAsync(path, lifetime.Token);
        if (fixture.Scope.UserId != context.UserId || fixture.Scope.ProjectId != context.ProjectId) throw new DriveBoundaryException("DRIVE_SCOPE_DENIED");
        var provider = new OfflineDriveTransport(fixture, true); var next = new DriveListingCache(Path.Combine(services.DataRoot, "drive-cache70"), fixture.Scope, provider); cache?.Dispose(); cache = next; scope = fixture.Scope; activeProvider = provider; ConfigureSimulation(); refreshTimer.Start(); Render();
        await RunOperationAsync(ct => cache.WarmAsync(false, ct));
    }
    OfflineDriveTransport? activeProvider;
    bool offlineSimulation, delaySimulation;
    public void SimulateOffline(bool value) { offlineSimulation = value; ConfigureSimulation(); }
    void ConfigureSimulation() { if (activeProvider is not null) activeProvider.BeforeList = async (_, ct) => { if (delaySimulation) await Task.Delay(500, ct); if (offlineSimulation) throw new DriveBoundaryException("DRIVE_OFFLINE"); }; }
    public Task RefreshAllAsync() => RunOperationAsync(ct => cache!.WarmAsync(true, ct));
    public async Task ReopenAsync()
    {
        if (operation is not null) throw new DriveBoundaryException("DRIVE_OPERATION_ACTIVE"); await AuthorizeAsync(); if (scope is null || activeProvider is null) throw new DriveBoundaryException("DRIVE_FIXTURE_REQUIRED");
        cache?.Dispose(); cache = new DriveListingCache(Path.Combine(services.DataRoot, "drive-cache70"), scope, activeProvider); Render();
    }
    async Task RunOperationAsync(Func<CancellationToken, Task> action)
    {
        if (cache is null) throw new DriveBoundaryException("DRIVE_FIXTURE_REQUIRED"); if (operation is not null) throw new DriveBoundaryException("DRIVE_OPERATION_ACTIVE"); await AuthorizeAsync();
        operation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); notice.Text = "합성 목록 갱신 중 · 취소 가능 · 본문 다운로드 없음";
        try { await action(operation.Token); } finally { operation.Dispose(); operation = null; if (!IsDisposed) Render(); }
    }
    string SelectedFolder() => tree.SelectedNode?.Tag as string ?? scope?.RootId ?? throw new DriveBoundaryException("DRIVE_FIXTURE_REQUIRED");
    void Render()
    {
        if (cache is null || scope is null) return; var selected = SelectedFolder(); var snapshot = cache.ReadSnapshot(); rebuilding = true;
        try { tree.Nodes.Clear(); var nodes = new Dictionary<string, TreeNode> { [scope.RootId] = new TreeNode("합성 Drive 루트") { Tag = scope.RootId } }; tree.Nodes.Add(nodes[scope.RootId]); var queue = new Queue<string>(); queue.Enqueue(scope.RootId); while (queue.TryDequeue(out var parent)) { var folder = snapshot.SingleOrDefault(x => x.FolderId == parent); if (folder is null) continue; foreach (var entry in folder.Entries.Where(x => x.IsFolder)) { if (nodes.ContainsKey(entry.Id)) continue; var node = new TreeNode(entry.Name) { Tag = entry.Id }; nodes.Add(entry.Id, node); nodes[parent].Nodes.Add(node); queue.Enqueue(entry.Id); } } tree.ExpandAll(); tree.SelectedNode = nodes.GetValueOrDefault(selected) ?? nodes[scope.RootId]; }
        finally { rebuilding = false; }
        RenderEntries(); var status = cache.Status; notice.Text = $"실제 Drive 미연결 · 합성 로컬 캐시 {status.CachedFolders}폴더 · 갱신 {status.Completed}/{status.Total} · " + (status.ErrorCode ?? "준비됨") + (status.Persistent ? " · 저장됨" : " · 메모리만 유지");
    }
    void RenderEntries() { list.Rows.Clear(); var folder = cache?.ReadSnapshot().SingleOrDefault(x => x.FolderId == SelectedFolder()); if (folder is null) return; foreach (var entry in folder.Entries) list.Rows.Add(entry.Name, entry.IsFolder ? "폴더" : entry.MimeType, entry.Size); }
    protected override void Dispose(bool disposing) { if (disposing) { refreshTimer.Stop(); refreshTimer.Dispose(); lifetime.Cancel(); operation?.Cancel(); cache?.Dispose(); } base.Dispose(disposing); }
}
