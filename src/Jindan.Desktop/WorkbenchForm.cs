using System.Text.Json;
using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Desktop;

public sealed partial class WorkbenchForm : Form
{
    private readonly string? startupProject75;
    private readonly DesktopModules modules;
    private readonly IWorkspaceServices services;
    private readonly string installationRoot;
    private readonly MenuStrip menu = new();
    private long projectRefreshGeneration;
    private readonly List<ProjectChoice73> projectChoices = [new(null, "프로젝트를 선택하세요")];
    private string? selectedProjectId;
    private readonly Dictionary<DocumentForm, WorkspaceSidebar73> sidebars = new();
    private readonly StatusStrip status = new();
    private readonly ToolStripStatusLabel state = new() { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    private readonly Panel left = new() { Dock = DockStyle.Left, Width = 260, Padding = new Padding(5) }, right = new() { Dock = DockStyle.Right, Width = 280, Padding = new Padding(5) };
    private readonly Splitter leftSplitter = new() { Dock = DockStyle.Left, Width = 4 }, rightSplitter = new() { Dock = DockStyle.Right, Width = 4 };
    private readonly Dictionary<string, Form> floating = new();
    private readonly Dictionary<string, int[]> floatingPlacement = new();
    private int preferredLeftWidth = 260, preferredRightWidth = 280;
    private bool leftVisible = true, rightVisible = true;
    private DocumentForm? previous;
    private bool closing, closeRequestPending, dpiClampPending;
    private string arrangement = "tabs";
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task Ready => ready.Task;
    public bool LogoutRequested { get; private set; }
    public IReadOnlyList<DocumentForm> Documents => MdiChildren.OfType<DocumentForm>().Concat(studio is { IsDisposed: false } ? new[] { studio } : Array.Empty<DocumentForm>()).ToArray();
    public string? SelectedProjectId => selectedProjectId;
    public int ModuleCount => modules.Entries.Count;
    public int LeftPanelWidth => left.Width; public int RightPanelWidth => right.Width;
    public string? ActivePanelContextId => previous?.Document.Context.ContextId;
    public WorkbenchForm(string root, DesktopModules catalog, IWorkspaceServices value, string? initialProjectId = null)
    {
        startupProject75 = initialProjectId; installationRoot = root; modules = catalog; services = value; Text = "기술진단팀 · 모듈형 작업대"; Name = "JindanWorkbench"; IsMdiContainer = true; Width = 1450; Height = 940; MinimumSize = new Size(900, 620); StartPosition = FormStartPosition.CenterScreen; AutoScaleMode = AutoScaleMode.Dpi;
        WindowState = FormWindowState.Maximized; MaximizeBox = false; MinimizeBox = true; FormBorderStyle = FormBorderStyle.FixedSingle; Icon = ApplicationBrand75.LoadIcon();
        Font = new Font("맑은 고딕", 10F); menu.Font = Font; status.Font = Font;
        menu.Padding = new Padding(8, 5, 8, 5); menu.BackColor = Color.White;
        left.BackColor = Color.FromArgb(242, 246, 252); right.BackColor = Color.FromArgb(247, 249, 253);
        foreach (var entry in modules.Entries) entry.Module.Initialize(services);
        if (services is WorkspaceServices owned) owned.OpenRequested = (module, project, source) => { try { if (project is not null) SelectProject(project); var opened = OpenDocument(module); if (source is not null) { if (opened.Document is not ISourceDocument target) { opened.Close(); return false; } _ = RunAsync(() => target.OpenSourceAsync(source)); } return true; } catch { state.Text = "요청한 문서·프로젝트 모듈을 열 수 없습니다."; return false; } };
        var file = new ToolStripMenuItem("설정");
        if (services is Jindan.Contracts.Cloud.ICloudWorkspaceAccess cloud) file.DropDownItems.Add("서버 연결", null, (_, _) => { using var window = new CloudConnectionsWindow71(cloud.Cloud); window.ShowDialog(this); });
        if (services is not WorkspaceServices { ServerSession: true }) file.DropDownItems.Add("비밀번호 변경", null, (_, _) => ChangePassword());
        file.DropDownItems.Add("로그아웃", null, (_, _) => { LogoutRequested = true; Close(); });
        file.DropDownItems.Add("종료", null, (_, _) => Close());
        foreach (var group in modules.Entries.Select(e => (e.Module as IModuleNavigation73)?.NavigationGroup).OfType<NavigationGroup73>().Where(g => !g.AdminOnly || services.Actor.Role == "admin").GroupBy(g => g.Id).Select(g => g.First()).OrderBy(g => g.Order))
        {
            var captured = modules.Entries.Any(e => e.Module.ModuleId == group.DefaultModule) ? group.DefaultModule : modules.Entries.First(e => (e.Module as IModuleNavigation73)?.NavigationGroup?.Id == group.Id).Module.ModuleId;
            var item = new ToolStripMenuItem(group.Label) { Name = "Menu_" + group.Id, Tag = group.Id };
            item.Click += (_, _) => NavigateToModule73(captured); menu.Items.Add(item);
        }
        menu.Name = "MainNavigation"; menu.Items.Add(file); MainMenuStrip = menu;
        status.Items.Add(state); state.Text = modules.Errors.Count > 0 ? "일부 모듈 차단: " + string.Join(", ", modules.Errors) : services is WorkspaceServices { ServerSession: true } ? "서버 로그인 · 프로젝트 연결됨 · 기타 업무는 로컬 저장" : "독립 로컬 작업공간 · 보고서 실무 미승인";
        Controls.Add(left); Controls.Add(leftSplitter); Controls.Add(right); Controls.Add(rightSplitter); Controls.Add(menu); Controls.Add(status);
        InitializeStudioWorkspace();
        MdiChildActivate += ActiveChanged;
        Controls.OfType<MdiClient>().Single().SizeChanged += (_, _) => FitBusinessWorkspace74();
        Resize += (_, _) => ApplyPanelLayout(); leftSplitter.SplitterMoved += (_, _) => { preferredLeftWidth = Math.Clamp(left.Width, 140, 600); ApplyPanelLayout(); }; rightSplitter.SplitterMoved += (_, _) => { preferredRightWidth = Math.Clamp(right.Width, 140, 600); ApplyPanelLayout(); };
        DpiChanged += (_, _) => QueueOwnerBoundsClamp();
        Shown += async (_, _) => { QueueOwnerBoundsClamp(); await RunAsync(async () => { await RestoreLayoutAsync(); await RefreshProjectsAsync(); if (startupProject75 is not null) SelectProject(startupProject75); if (modules.Entries.Any(e => e.Module.ModuleId == "projects")) OpenDocument("projects"); }); ready.TrySetResult(); };
        KeyPreview = true; KeyDown += async (_, e) => { if (e.Control && e.KeyCode == Keys.S) { e.SuppressKeyPress = true; if (CurrentDocument is DocumentForm doc) await RunAsync(() => doc.Document.SaveAsync()); } if (e.Control && e.KeyCode == Keys.W) { e.SuppressKeyPress = true; CurrentDocument?.Close(); } };
    }
    public async Task RefreshProjectsAsync()
    {
        var generation = ++projectRefreshGeneration;
        var rows = await services.Data.ListAsync(services.Actor, new("projects"));
        if (generation != projectRefreshGeneration || IsDisposed) return;
        projectChoices.Clear(); projectChoices.Add(new(null, "프로젝트를 선택하세요"));
        projectChoices.AddRange(rows.Select(p => new ProjectChoice73(p.Id, p.Fields.GetValueOrDefault("title", p.Id))));
        foreach (var (document, sidebar) in sidebars) sidebar.SetProjects(projectChoices, document.Document.Context.ProjectId);
    }
    public void SelectProject(string id)
    {
        if (!projectChoices.Any(p => p.Id == id)) throw new InvalidOperationException("프로젝트 목록에서 찾을 수 없습니다.");
        ChangeProject73(id);
    }
    private void ChangeProject73(string? id)
    {
        if (id is null && startupProject75 is not null) { if (CurrentDocument is DocumentForm current && sidebars.TryGetValue(current, out var selectedSidebar)) selectedSidebar.SetProjects(projectChoices, current.Document.Context.ProjectId); return; }
        if (CurrentDocument is not DocumentForm document) { selectedProjectId = id; return; }
        try { document.Document.SetContext(document.Document.Context with { ProjectId = id }); selectedProjectId = id; BindPanels(document); }
        catch { state.Text = "미저장 변경이 있어 프로젝트를 유지합니다."; selectedProjectId = document.Document.Context.ProjectId; if (sidebars.TryGetValue(document, out var sidebar)) sidebar.SetProjects(projectChoices, selectedProjectId); }
    }
    public DocumentForm NavigateToModule73(string moduleId)
    {
        if (moduleId == "report-studio") return OpenStudio();
        if (studioActive) ReturnToWork();
        var existing = MdiChildren.OfType<DocumentForm>().FirstOrDefault(d => d.Module.ModuleId == moduleId && d.Document.Context.ProjectId == SelectedProjectId);
        if (existing is not null) { existing.Activate(); return existing; }
        return OpenDocument(moduleId);
    }
    public DocumentForm OpenDocument(string moduleId)
    {
        if (moduleId == "report-studio") return OpenStudio();
        if (studioActive) ReturnToWork();
        var module = modules.Entries.Single(e => e.Module.ModuleId == moduleId).Module;
        var context = new DocumentContext(Guid.NewGuid().ToString("N"), moduleId, SelectedProjectId, services.Actor.Id); var document = module.CreateDocument(context); if (services is WorkspaceServices diagnosticServices) diagnosticServices.RecordModuleOpen(moduleId); var form = new DocumentForm(module, document) { MdiParent = this, Font = Font, ControlBox = false, ShowIcon = false, FormBorderStyle = FormBorderStyle.None };
        EventHandler? recordsChanged = null;
        if (moduleId == "projects" && document is RecordDocument records)
        {
            recordsChanged = async (_, _) => await RunAsync(RefreshProjectsAsync);
            records.RecordsChanged += recordsChanged;
        }
        form.FormClosed += (_, _) => { if (recordsChanged is not null && document is RecordDocument records) records.RecordsChanged -= recordsChanged; if (previous == form) { UnbindPanels(); previous = null; } ReleaseSidebar73(form); services.Reports.Invalidate(context.ContextId); };
        form.Show(); FitBusinessWorkspace74(); return form;
    }
    private void ActiveChanged(object? sender, EventArgs e)
    {
        if (studioActive) return;
        if (previous is not null && !previous.IsDisposed) previous.Module.Deactivate(previous.Document);
        if (ActiveMdiChild is not DocumentForm active) { UnbindPanels(); previous = null; return; }
        previous = active; selectedProjectId = active.Document.Context.ProjectId;
        active.Module.Activate(active.Document); BindPanels(active); FitBusinessWorkspace74();
    }
    // Contributions belong to the document. Hide them while their old native
    // parent is still valid, before a switch/close detaches them. A live nested
    // SplitContainer otherwise paints during the parentless visibility cascade.
    private static void DetachPanels(Control host) { foreach (Control control in host.Controls) control.Visible = false; host.Controls.Clear(); }
    private void UnbindPanels() { DetachPanels(left); DetachPanels(right); foreach (var window in floating.Values) DetachPanels(window); }
    private void BindPanels(DocumentForm document) { UnbindPanels(); Control l = Sidebar73(document), r = document.Module.CreateRightPanel(document.Document); l.Dock = DockStyle.Fill; r.Dock = DockStyle.Fill; (floating.GetValueOrDefault("left")?.Controls ?? left.Controls).Add(l); (floating.GetValueOrDefault("right")?.Controls ?? right.Controls).Add(r); l.Visible = true; r.Visible = true; left.AccessibleDescription = document.Document.Context.ContextId; right.AccessibleDescription = document.Document.Context.ContextId; }
    public void Arrange(string mode) { arrangement = mode; foreach (var doc in Documents) doc.WindowState = FormWindowState.Normal; if (mode == "tabs") { FitBusinessWorkspace74(); } else LayoutMdi(mode == "vertical" ? MdiLayout.TileVertical : mode == "horizontal" ? MdiLayout.TileHorizontal : MdiLayout.Cascade); }
    public void TogglePanel(string side) { if (side == "left") leftVisible = !leftVisible; else rightVisible = !rightVisible; ApplyPanelLayout(); }
    public void SetPanelWidths(int leftWidth, int rightWidth) { preferredLeftWidth = Math.Clamp(leftWidth, 140, 600); preferredRightWidth = Math.Clamp(rightWidth, 140, 600); ApplyPanelLayout(); }
    private void QueueOwnerBoundsClamp()
    {
        if (IsDisposed || !IsHandleCreated || dpiClampPending) return;
        dpiClampPending = true;
        // WinForms applies the new DPI's suggested rectangle after the event.
        // Clamp afterwards; clamping the test window would hide a real overflow.
        BeginInvoke((Action)(() =>
        {
            dpiClampPending = false;
            if (IsDisposed || WindowState != FormWindowState.Normal) return;
            var area = Screen.FromControl(this).WorkingArea;
            var scale = DeviceDpi / 96d;
            MinimumSize = new(Math.Min(area.Width, (int)Math.Ceiling(900 * scale)), Math.Min(area.Height, (int)Math.Ceiling(620 * scale)));
            var width = Math.Min(Width, area.Width);
            var height = Math.Min(Height, area.Height);
            Bounds = new(Math.Clamp(Left, area.Left, area.Right - width), Math.Clamp(Top, area.Top, area.Bottom - height), width, height);
            ApplyPanelLayout();
        }));
    }
    private void ApplyPanelLayout() { if (IsDisposed) return; left.Visible = leftSplitter.Visible = leftVisible && !floatingPlacement.ContainsKey("left"); right.Visible = rightSplitter.Visible = rightVisible && !floatingPlacement.ContainsKey("right"); var l = preferredLeftWidth; var r = preferredRightWidth; var visibleTotal = (left.Visible ? l : 0) + (right.Visible ? r : 0); var budget = Math.Max(280, ClientSize.Width - 328); if (visibleTotal > budget) { if (left.Visible && right.Visible) { l = Math.Clamp((int)(budget * l / (double)(l + r)), 140, budget - 140); r = budget - l; } else if (left.Visible) l = budget; else r = budget; } left.Width = l; right.Width = r; foreach (var (side, window) in floating) { if (window.IsDisposed) continue; var visible = side == "left" ? leftVisible : rightVisible; if (window.Visible != visible) { if (visible) window.Show(this); else window.Hide(); } } }
    public void SwapPanels() { left.Dock = left.Dock == DockStyle.Left ? DockStyle.Right : DockStyle.Left; right.Dock = right.Dock == DockStyle.Right ? DockStyle.Left : DockStyle.Right; leftSplitter.Dock = left.Dock; rightSplitter.Dock = right.Dock; }
    public void ToggleFloating(string side)
    {
        if (floating.Remove(side, out var existing)) { floatingPlacement.Remove(side); DetachPanels(existing); existing.Close(); existing.Dispose(); ApplyPanelLayout(); if (previous is not null && !previous.IsDisposed) BindPanels(previous); return; }
        var window = new Form() { Text = (side == "left" ? "목록" : "속성") + " 패널 · 닫으면 작업대로 복귀", Width = 320, Height = 600, StartPosition = FormStartPosition.Manual, AutoScaleMode = AutoScaleMode.Dpi }; window.Bounds = ClampFloating(new Rectangle(Left + 60, Top + 90, 320, 600)); floating[side] = window;
        void Remember() { if (!window.IsDisposed) floatingPlacement[side] = [window.Left, window.Top, window.Width, window.Height]; }
        window.DpiChanged += (_, _) => window.BeginInvoke((Action)(() => { if (!window.IsDisposed && window.WindowState == FormWindowState.Normal) { window.Bounds = ClampFloating(window.Bounds); Remember(); } }));
        window.Move += (_, _) => Remember(); window.Resize += (_, _) => Remember(); window.FormClosing += (_, e) => { Remember(); floating.Remove(side); DetachPanels(window); if (e.CloseReason == CloseReason.FormOwnerClosing) return; floatingPlacement.Remove(side); ApplyPanelLayout(); if (previous is not null && !previous.IsDisposed) BindPanels(previous); }; window.Show(this); Remember(); ApplyPanelLayout(); if (previous is not null) BindPanels(previous);
    }
    private Rectangle ClampFloating(Rectangle requested) { var area = Screen.FromRectangle(requested).WorkingArea; var width = Math.Min(Math.Max(200, requested.Width), area.Width); var height = Math.Min(Math.Max(160, requested.Height), area.Height); return new(Math.Clamp(requested.X, area.Left, area.Right - width), Math.Clamp(requested.Y, area.Top, area.Bottom - height), width, height); }
    private void ReopenIntendedFloats() { foreach (var (side, rect) in floatingPlacement.ToArray()) { if (floating.ContainsKey(side)) continue; ToggleFloating(side); floating[side].Bounds = new(rect[0], rect[1], rect[2], rect[3]); } if (previous is not null && !previous.IsDisposed) BindPanels(previous); }
    public async Task SaveLayoutAsync() { var bounds = floatingPlacement.ToDictionary(k => k.Key, v => v.Value.ToArray()); await services.Layout.SaveAsync(new(preferredLeftWidth, preferredRightWidth, leftVisible, rightVisible, left.Dock == DockStyle.Left ? "left" : "right", right.Dock == DockStyle.Right ? "right" : "left", bounds, arrangement)); state.Text = "창·패널 배치 저장됨"; }
    private async Task RestoreLayoutAsync() { var layout = await services.Layout.LoadAsync(); SetPanelWidths(layout.LeftWidth, layout.RightWidth); leftVisible = layout.LeftVisible; rightVisible = layout.RightVisible; ApplyPanelLayout(); if (layout.LeftSide == "right") SwapPanels(); arrangement = layout.Arrangement; foreach (var (side, rect) in layout.FloatingBounds ?? new()) { if (rect.Length != 4) continue; ToggleFloating(side); if (floating.TryGetValue(side, out var window)) { var requested = new Rectangle(rect[0], rect[1], Math.Clamp(rect[2], 200, 900), Math.Clamp(rect[3], 160, 1000)); window.Bounds = ClampFloating(requested); window.BeginInvoke((Action)(() => { if (!window.IsDisposed) window.Bounds = ClampFloating(requested); })); } } }
    private async Task ExportWorkspaceAsync() { using var d = new SaveFileDialog() { Filter = "업무·파일 저장소 사본|*.zip", InitialDirectory = services.DataRoot, FileName = "workspace-export.zip" }; if (d.ShowDialog(this) == DialogResult.OK) await RunAsync(async () => { await services.Data.ExportAsync(services.Actor, d.FileName); state.Text = "새 사본 내보내기 완료"; }); }
    private async Task ImportWorkspaceAsync() { using var d = new OpenFileDialog() { Filter = "업무·파일 저장소 사본|*.zip" }; if (d.ShowDialog(this) != DialogResult.OK) return; await RunAsync(async () => { var preview = await services.Data.PreviewImportAsync(services.Actor, d.FileName); if (MessageBox.Show(this, $"{preview.Records}개 항목을 새 사본으로 가져올까요?\n" + string.Join('\n', preview.Warnings), "가져오기 미리보기", MessageBoxButtons.YesNo) == DialogResult.Yes) { await services.Data.ImportAsync(services.Actor, preview, true); await RefreshProjectsAsync(); } }); }
    private async Task ImportLegacyWorkAsync() { using var dialog = new OpenFileDialog() { Filter = "이전 업무 JSON|*.json", Title = "프로젝트·공정·할일만 새 사본으로 가져오기" }; if (dialog.ShowDialog(this) != DialogResult.OK) return; await RunAsync(async () => { var preview = await services.Data.PreviewLegacyImportAsync(services.Actor, dialog.FileName); var text = $"이전 업무 {preview.Records}개 · 원본 SHA256\n{preview.OriginalSourceSha256}\n\n계정·권한은 가져오지 않으며 새 식별자를 부여합니다.\n" + string.Join('\n', preview.Warnings) + "\n\n검토한 새 사본을 가져올까요?"; if (MessageBox.Show(this, text, "이전 업무 가져오기 미리보기", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return; await services.Data.ImportAsync(services.Actor, preview, true); await RefreshProjectsAsync(); state.Text = "이전 업무 새 사본 가져오기 완료 · 추가 수정 전 되돌리기 가능"; }); }
    private void ChangePassword() { using var form = new Form() { Text = "로컬 암호 변경", Width = 360, Height = 230 }; var old = new TextBox() { UseSystemPasswordChar = true, Width = 270 }; var next = new TextBox() { UseSystemPasswordChar = true, Width = 270 }; var panel = new FlowLayoutPanel() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(12) }; var save = new Button() { Text = "변경" }; panel.Controls.AddRange([new Label() { Text = "현재 암호", AutoSize = true }, old, new Label() { Text = "새 암호", AutoSize = true }, next, save]); form.Controls.Add(panel); save.Click += async (_, _) => { try { await services.Identities.ChangePasswordAsync(services.Actor, old.Text, next.Text); form.Close(); } catch { MessageBox.Show(form, "암호를 확인하세요."); } finally { old.Clear(); next.Clear(); } }; form.ShowDialog(this); }
    private async Task RunAsync(Func<Task> run) { try { await run(); } catch (OperationCanceledException) { state.Text = "작업 취소됨"; } catch { state.Text = "작업 실패 · 입력·권한·로컬 저장소 상태를 확인하세요."; } }
    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if (closing) { base.OnFormClosing(e); return; }
        e.Cancel = true; base.OnFormClosing(e); if (closeRequestPending) return;
        closeRequestPending = true;
        try
        {
            foreach (var doc in Documents.ToArray())
            {
                if (!await doc.ConfirmCloseAsync()) { LogoutRequested = false; ReopenIntendedFloats(); return; }
                doc.Close(); if (!doc.IsDisposed) { LogoutRequested = false; ReopenIntendedFloats(); return; }
            }
            await RunAsync(SaveLayoutAsync); closing = true; Close();
        }
        finally { closeRequestPending = false; }
    }
    protected override void Dispose(bool disposing) { if (disposing) { if (services is WorkspaceServices owned) owned.OpenRequested = null; MdiChildActivate -= ActiveChanged; foreach (var f in floating.Values.ToArray()) { DetachPanels(f); f.Dispose(); } floating.Clear(); UnbindPanels(); foreach (var sidebar in sidebars.Values) sidebar.Dispose(); sidebars.Clear(); } base.Dispose(disposing); }
}
