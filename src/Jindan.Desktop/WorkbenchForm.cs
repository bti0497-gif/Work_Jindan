using System.Text.Json;
using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Desktop;

public sealed partial class WorkbenchForm : Form
{
    private readonly DesktopModules modules;
    private readonly IWorkspaceServices services;
    private readonly string installationRoot;
    private readonly MenuStrip menu = new();
    private readonly TabControl tabs = new() { Dock = DockStyle.Top, Height = 32 };
    private readonly ToolStrip projectTools = new() { Dock = DockStyle.Top, GripStyle = ToolStripGripStyle.Hidden, CanOverflow = false };
    private long projectRefreshGeneration;
    private readonly ToolStrip tools = new() { Dock = DockStyle.Top, GripStyle = ToolStripGripStyle.Hidden };
    private readonly ToolStripComboBox projects = new() { AutoSize = false, Width = 290, DropDownWidth = 420, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly StatusStrip status = new();
    private readonly ToolStripStatusLabel state = new() { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    private readonly Panel left = new() { Dock = DockStyle.Left, Width = 260, Padding = new Padding(5) }, right = new() { Dock = DockStyle.Right, Width = 280, Padding = new Padding(5) };
    private readonly Splitter leftSplitter = new() { Dock = DockStyle.Left, Width = 4 }, rightSplitter = new() { Dock = DockStyle.Right, Width = 4 };
    private readonly Dictionary<string, Form> floating = new();
    private readonly Dictionary<string, int[]> floatingPlacement = new();
    private int preferredLeftWidth = 260, preferredRightWidth = 280;
    private bool leftVisible = true, rightVisible = true;
    private DocumentForm? previous;
    private bool syncing, closing, closeRequestPending, dpiClampPending;
    private string arrangement = "tabs";
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task Ready => ready.Task;
    public bool LogoutRequested { get; private set; }
    public IReadOnlyList<DocumentForm> Documents => MdiChildren.OfType<DocumentForm>().ToArray();
    public string? SelectedProjectId => projects.SelectedItem is ProjectItem project ? project.Id : null;
    public int ModuleCount => modules.Entries.Count;
    public int LeftPanelWidth => left.Width; public int RightPanelWidth => right.Width;
    public string? ActivePanelContextId => previous?.Document.Context.ContextId;
    public WorkbenchForm(string root, DesktopModules catalog, IWorkspaceServices value)
    {
        installationRoot = root; modules = catalog; services = value; Text = "기술진단팀 · 모듈형 작업대"; Name = "JindanWorkbench"; IsMdiContainer = true; Width = 1450; Height = 940; MinimumSize = new Size(900, 620); StartPosition = FormStartPosition.CenterScreen; AutoScaleMode = AutoScaleMode.Dpi;
        foreach (var entry in modules.Entries) entry.Module.Initialize(services);
        if (services is WorkspaceServices owned) owned.OpenRequested = (module, project, source) => { try { if (project is not null) SelectProject(project); var opened = OpenDocument(module); if (source is not null) { if (opened.Document is not ISourceDocument target) { opened.Close(); return false; } _ = RunAsync(() => target.OpenSourceAsync(source)); } return true; } catch { state.Text = "요청한 문서·프로젝트 모듈을 열 수 없습니다."; return false; } };
        var file = new ToolStripMenuItem("파일"); file.DropDownItems.Add("자료 새로 읽기", null, async (_, _) => await RefreshProjectsAsync()); file.DropDownItems.Add("업무·파일 저장소 사본 내보내기", null, async (_, _) => await ExportWorkspaceAsync()); file.DropDownItems.Add("가져오기 미리보기", null, async (_, _) => await ImportWorkspaceAsync()); file.DropDownItems.Add("마지막 가져오기 되돌리기", null, async (_, _) => await RunAsync(() => services.Data.RollbackLastImportAsync(services.Actor, MessageBox.Show(this, "마지막 가져오기를 되돌릴까요?", "되돌리기", MessageBoxButtons.YesNo) == DialogResult.Yes))); file.DropDownItems.Add("암호 변경", null, (_, _) => ChangePassword()); file.DropDownItems.Add("종료", null, (_, _) => Close());
        var feature = new ToolStripMenuItem("업무"); foreach (var (module, _) in modules.Entries) { var captured = module; feature.DropDownItems.Add(module.DisplayName, null, (_, _) => OpenDocument(captured.ModuleId)); tools.Items.Add(new ToolStripButton(module.DisplayName, null, (_, _) => OpenDocument(captured.ModuleId))); }
        file.DropDownItems.Add("이전 업무 JSON 가져오기", null, async (_, _) => await ImportLegacyWorkAsync());
        file.DropDownItems.Add("로그아웃", null, (_, _) => { LogoutRequested = true; Close(); });
        var windows = new ToolStripMenuItem("창"); windows.DropDownItems.Add("탭 보기", null, (_, _) => Arrange("tabs")); windows.DropDownItems.Add("좌우 비교", null, (_, _) => Arrange("vertical")); windows.DropDownItems.Add("상하 비교", null, (_, _) => Arrange("horizontal")); windows.DropDownItems.Add("계단식", null, (_, _) => Arrange("cascade")); windows.DropDownItems.Add("왼쪽 패널 표시", null, (_, _) => TogglePanel("left")); windows.DropDownItems.Add("오른쪽 패널 표시", null, (_, _) => TogglePanel("right")); windows.DropDownItems.Add("왼쪽 패널 분리/복귀", null, (_, _) => ToggleFloating("left")); windows.DropDownItems.Add("오른쪽 패널 분리/복귀", null, (_, _) => ToggleFloating("right")); windows.DropDownItems.Add("패널 위치 맞바꾸기", null, (_, _) => SwapPanels()); windows.DropDownItems.Add("배치 저장", null, async (_, _) => await SaveLayoutAsync()); menu.Items.AddRange([file, feature, windows]); AddSync70Menu(); MainMenuStrip = menu;
        projectTools.Items.Add(new ToolStripLabel("현재 프로젝트")); projectTools.Items.Add(projects); var refresh = new ToolStripButton("목록 갱신"); refresh.Click += async (_, _) => await RunAsync(RefreshProjectsAsync); projectTools.Items.Add(refresh);
        status.Items.Add(state); state.Text = modules.Errors.Count > 0 ? "일부 모듈 차단: " + string.Join(", ", modules.Errors) : "독립 로컬 작업공간 · 보고서 실무 미승인";
        Controls.Add(left); Controls.Add(leftSplitter); Controls.Add(right); Controls.Add(rightSplitter); Controls.Add(tabs); Controls.Add(tools); Controls.Add(projectTools); Controls.Add(menu); Controls.Add(status);
        MdiChildActivate += ActiveChanged; tabs.SelectedIndexChanged += (_, _) => { if (!syncing && tabs.SelectedTab?.Tag is DocumentForm doc) doc.Activate(); }; projects.SelectedIndexChanged += ProjectChanged;
        Resize += (_, _) => ApplyPanelLayout(); leftSplitter.SplitterMoved += (_, _) => { preferredLeftWidth = Math.Clamp(left.Width, 140, 600); ApplyPanelLayout(); }; rightSplitter.SplitterMoved += (_, _) => { preferredRightWidth = Math.Clamp(right.Width, 140, 600); ApplyPanelLayout(); };
        DpiChanged += (_, _) => QueueOwnerBoundsClamp();
        Shown += async (_, _) => { QueueOwnerBoundsClamp(); await RunAsync(async () => { await RestoreLayoutAsync(); await RefreshProjectsAsync(); if (modules.Entries.Any(e => e.Module.ModuleId == "projects")) OpenDocument("projects"); }); ready.TrySetResult(); };
        KeyPreview = true; KeyDown += async (_, e) => { if (e.Control && e.KeyCode == Keys.S) { e.SuppressKeyPress = true; if (ActiveMdiChild is DocumentForm doc) await RunAsync(() => doc.Document.SaveAsync()); } if (e.Control && e.KeyCode == Keys.W) { e.SuppressKeyPress = true; ActiveMdiChild?.Close(); } };
    }
    private sealed record ProjectItem(string? Id, string Title) { public override string ToString() => Title; }
    public async Task RefreshProjectsAsync()
    {
        var g = ++projectRefreshGeneration; var rows = await services.Data.ListAsync(services.Actor, new("projects")); if (g != projectRefreshGeneration || IsDisposed) return; var selected = SelectedProjectId; syncing = true; try { projects.Items.Clear(); projects.Items.Add(new ProjectItem(null, "프로젝트를 선택하세요")); foreach (var p in rows) projects.Items.Add(new ProjectItem(p.Id, p.Fields.GetValueOrDefault("title", p.Id))); projects.SelectedIndex = Enumerable.Range(0, projects.Items.Count).FirstOrDefault(i => ((ProjectItem)projects.Items[i]!).Id == selected); } finally { syncing = false; }
    }
    public void SelectProject(string id) { for (var i = 0; i < projects.Items.Count; i++) if (projects.Items[i] is ProjectItem p && p.Id == id) { projects.SelectedIndex = i; return; } throw new InvalidOperationException("프로젝트 목록에서 찾을 수 없습니다."); }
    private void ProjectChanged(object? sender, EventArgs e) { if (syncing || ActiveMdiChild is not DocumentForm doc) return; try { doc.Document.SetContext(doc.Document.Context with { ProjectId = SelectedProjectId }); BindPanels(doc); } catch { state.Text = "미저장 변경이 있어 프로젝트 문맥을 유지합니다."; syncing = true; try { for (var i = 0; i < projects.Items.Count; i++) if (projects.Items[i] is ProjectItem p && p.Id == doc.Document.Context.ProjectId) projects.SelectedIndex = i; } finally { syncing = false; } } }
    public DocumentForm OpenDocument(string moduleId)
    {
        var module = modules.Entries.Single(e => e.Module.ModuleId == moduleId).Module;
        var context = new DocumentContext(Guid.NewGuid().ToString("N"), moduleId, SelectedProjectId, services.Actor.Id); var document = module.CreateDocument(context); var form = new DocumentForm(module, document) { MdiParent = this };
        EventHandler? recordsChanged = null;
        if (moduleId == "projects" && document is RecordDocument records)
        {
            recordsChanged = async (_, _) => await RunAsync(RefreshProjectsAsync);
            records.RecordsChanged += recordsChanged;
        }
        var tab = new TabPage(document.Title) { Tag = form }; tabs.TabPages.Add(tab); form.FormClosed += (_, _) => { if (recordsChanged is not null && document is RecordDocument records) records.RecordsChanged -= recordsChanged; if (previous == form) { UnbindPanels(); previous = null; } tabs.TabPages.Remove(tab); tab.Dispose(); services.Reports.Invalidate(context.ContextId); }; form.TextChanged += (_, _) => tab.Text = form.Text; form.Show(); if (arrangement == "tabs") form.WindowState = FormWindowState.Maximized; tabs.SelectedTab = tab; return form;
    }
    private void ActiveChanged(object? sender, EventArgs e) { if (previous is not null && !previous.IsDisposed) previous.Module.Deactivate(previous.Document); if (ActiveMdiChild is not DocumentForm active) { UnbindPanels(); previous = null; return; } previous = active; active.Module.Activate(active.Document); BindPanels(active); syncing = true; try { foreach (TabPage tab in tabs.TabPages) if (tab.Tag == active) tabs.SelectedTab = tab; var id = active.Document.Context.ProjectId; for (var i = 0; i < projects.Items.Count; i++) if (projects.Items[i] is ProjectItem p && p.Id == id) projects.SelectedIndex = i; } finally { syncing = false; } }
    // Contributions belong to the document. Hide them while their old native
    // parent is still valid, before a switch/close detaches them. A live nested
    // SplitContainer otherwise paints during the parentless visibility cascade.
    private static void DetachPanels(Control host) { foreach (Control control in host.Controls) control.Visible = false; host.Controls.Clear(); }
    private void UnbindPanels() { DetachPanels(left); DetachPanels(right); foreach (var window in floating.Values) DetachPanels(window); }
    private void BindPanels(DocumentForm document) { UnbindPanels(); Control l = document.Module.CreateLeftPanel(document.Document), r = document.Module.CreateRightPanel(document.Document); l.Dock = DockStyle.Fill; r.Dock = DockStyle.Fill; (floating.GetValueOrDefault("left")?.Controls ?? left.Controls).Add(l); (floating.GetValueOrDefault("right")?.Controls ?? right.Controls).Add(r); l.Visible = true; r.Visible = true; left.AccessibleDescription = document.Document.Context.ContextId; right.AccessibleDescription = document.Document.Context.ContextId; }
    public void Arrange(string mode) { arrangement = mode; foreach (var doc in Documents) doc.WindowState = FormWindowState.Normal; if (mode == "tabs") { if (ActiveMdiChild is not null) ActiveMdiChild.WindowState = FormWindowState.Maximized; } else LayoutMdi(mode == "vertical" ? MdiLayout.TileVertical : mode == "horizontal" ? MdiLayout.TileHorizontal : MdiLayout.Cascade); }
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
    protected override void Dispose(bool disposing) { if (disposing) { if (services is WorkspaceServices owned) owned.OpenRequested = null; MdiChildActivate -= ActiveChanged; foreach (var f in floating.Values.ToArray()) { DetachPanels(f); f.Dispose(); } floating.Clear(); UnbindPanels(); } base.Dispose(disposing); }
}
