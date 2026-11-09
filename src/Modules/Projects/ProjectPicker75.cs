using Jindan.Contracts;
using Jindan.Desktop.Contracts;

namespace Jindan.Modules.Projects;

public sealed class ProjectPicker75 : Form, IProjectSelectionDialog75
{
    readonly IWorkspaceServices services;
    readonly TextBox title = new() { Name = "ProjectTitle", Dock = DockStyle.Top, MaxLength = 300 };
    readonly TextBox content = new() { Name = "ProjectContent", Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Vertical };
    readonly DateTimePicker start = new() { Name = "ProjectStart", Format = DateTimePickerFormat.Short, Dock = DockStyle.Top };
    readonly DateTimePicker end = new() { Name = "ProjectEnd", Format = DateTimePickerFormat.Short, Dock = DockStyle.Top };
    readonly DataGridView list = new() { Name = "ExistingProjects", Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, MultiSelect = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill };
    readonly Button create = new() { Name = "CreateProject", Text = "만들기", AutoSize = true };
    readonly Button open = new() { Name = "OpenProject", Text = "열기", AutoSize = true, Enabled = false };
    readonly Button exit = new() { Name = "ExitApplication", Text = "취소 (나가기)", AutoSize = true };
    readonly Button refresh = new() { Name = "RefreshProjects", Text = "목록 새로고침", AutoSize = true };
    readonly Label notice = new() { Name = "ProjectNotice", Dock = DockStyle.Bottom, Height = 56, Padding = new(12), ForeColor = Color.SlateGray };
    readonly CancellationTokenSource lifetime = new();
    bool busy, exitConfirmed, loaded;
    public string? SelectedProjectId { get; private set; }
    public Task Ready => ready.Task;
    readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Func<IWin32Window, DialogResult> ConfirmExit { get; set; } = owner => MessageBox.Show(owner, "종료하시겠습니까?", "앱 종료", MessageBoxButtons.OKCancel, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
    public ProjectPicker75(IWorkspaceServices value)
    {
        services = value; Text = "프로젝트 선택 · 더죤환경기술"; Name = "ProjectSelection";
        Font = new Font("맑은 고딕", 10); AutoScaleMode = AutoScaleMode.Dpi; ClientSize = new(960, 570); MinimumSize = new(780, 500);
        StartPosition = FormStartPosition.CenterParent; MaximizeBox = MinimizeBox = false; FormBorderStyle = FormBorderStyle.FixedDialog; BackColor = Color.White;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new(20), ColumnCount = 2, RowCount = 1 };
        layout.ColumnStyles.Add(new(SizeType.Percent, 40)); layout.ColumnStyles.Add(new(SizeType.Percent, 60));
        var editor = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 10, Padding = new(0, 0, 20, 0) };
        for (var i = 0; i < 10; i++) editor.RowStyles.Add(new(i == 8 ? SizeType.Percent : SizeType.AutoSize, i == 8 ? 100 : 0));
        editor.Controls.Add(new Label { Text = "새 프로젝트 만들기", AutoSize = true, Font = new Font(Font, FontStyle.Bold), Margin = new(0, 0, 0, 18) });
        editor.Controls.Add(new Label { Text = "프로젝트명 *", AutoSize = true }); editor.Controls.Add(title);
        editor.Controls.Add(new Label { Text = "시작일", AutoSize = true }); editor.Controls.Add(start);
        editor.Controls.Add(new Label { Text = "종료일", AutoSize = true }); editor.Controls.Add(end);
        editor.Controls.Add(new Label { Text = "프로젝트 내용", AutoSize = true }); editor.Controls.Add(content);
        var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Padding = new(0, 12, 0, 0) }; buttons.Controls.AddRange([create, open, exit]); editor.Controls.Add(buttons);
        var existing = new Panel { Dock = DockStyle.Fill, Padding = new(12, 0, 0, 0) }; var heading = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
        heading.Controls.Add(new Label { Text = "기존 프로젝트", AutoSize = true, Font = new Font(Font, FontStyle.Bold), Margin = new(0, 8, 12, 12) }); heading.Controls.Add(refresh);
        WorkspaceUi74.Grid(list); list.Columns.Add("title", "프로젝트명"); list.Columns.Add("startDate", "시작일"); list.Columns.Add("endDate", "종료일");
        existing.Controls.Add(list); existing.Controls.Add(heading); layout.Controls.Add(editor, 0, 0); layout.Controls.Add(existing, 1, 0);
        Controls.Add(layout); Controls.Add(notice); AcceptButton = open; CancelButton = exit;
        list.SelectionChanged += (_, _) => open.Enabled = !busy && loaded && SelectedRow() is not null;
        list.CellDoubleClick += async (_, e) => { if (e.RowIndex >= 0) await OpenSelectedAsync(); };
        refresh.Click += async (_, _) => await LoadProjectsAsync(); create.Click += async (_, _) => await CreateAsync(); open.Click += async (_, _) => await OpenSelectedAsync(); exit.Click += (_, _) => Close();
        Shown += async (_, _) => { await LoadProjectsAsync(); ready.TrySetResult(); };
    }
    WorkRecord? SelectedRow() => list.CurrentRow?.Tag as WorkRecord;
    void Busy(bool value) { busy = value; create.Enabled = refresh.Enabled = exit.Enabled = !value; open.Enabled = !value && loaded && SelectedRow() is not null; }
    public async Task LoadProjectsAsync(string? selectedId = null)
    {
        if (busy) return; Busy(true); loaded = false; notice.Text = "프로젝트 목록을 불러오는 중입니다…";
        try
        {
            var rows = await services.Data.ListAsync(services.Actor, new("projects"), lifetime.Token); if (IsDisposed) return;
            list.Rows.Clear(); foreach (var row in rows.OrderByDescending(r => r.Fields.GetValueOrDefault("startDate"))) { var n = list.Rows.Add(row.Fields.GetValueOrDefault("title", ""), row.Fields.GetValueOrDefault("startDate", ""), row.Fields.GetValueOrDefault("endDate", "")); list.Rows[n].Tag = row; }
            list.ClearSelection(); list.CurrentCell = null;
            if (selectedId is not null) foreach (DataGridViewRow row in list.Rows) if (((WorkRecord)row.Tag!).Id == selectedId) { list.CurrentCell = row.Cells[0]; row.Selected = true; }
            loaded = true; notice.Text = rows.Count == 0 ? "프로젝트가 없습니다. 왼쪽에서 새 프로젝트를 만들어 주세요." : "오른쪽에서 프로젝트를 선택하고 ‘열기’를 눌러 주세요.";
        }
        catch (OperationCanceledException) { }
        catch { if (!IsDisposed) notice.Text = "목록을 불러오지 못했습니다. 서버 연결을 확인하고 다시 시도해 주세요."; }
        finally { if (!IsDisposed) Busy(false); }
    }
    async Task CreateAsync()
    {
        if (busy) return;
        if (string.IsNullOrWhiteSpace(title.Text) || start.Value.Date > end.Value.Date) { notice.Text = "프로젝트명과 시작·종료일을 확인해 주세요."; return; }
        Busy(true); WorkRecord? created = null;
        try { created = await services.Data.SaveAsync(services.Actor, new(null, "projects", null, 0, new() { ["title"] = title.Text.Trim(), ["startDate"] = start.Value.ToString("yyyy-MM-dd"), ["endDate"] = end.Value.ToString("yyyy-MM-dd"), ["content"] = content.Text }), lifetime.Token); }
        catch (OperationCanceledException) { }
        catch { if (!IsDisposed) notice.Text = "생성 결과를 확인하지 못했습니다. 중복 생성 전에 목록을 새로고침해 주세요."; }
        finally { if (!IsDisposed) Busy(false); }
        if (created is not null && !IsDisposed) { title.Clear(); content.Clear(); await LoadProjectsAsync(created.Id); if (loaded) notice.Text = "프로젝트를 만들었습니다. ‘열기’를 눌러 시작하세요."; }
    }
    public async Task OpenSelectedAsync()
    {
        if (busy || !loaded || SelectedRow() is not WorkRecord selected) return;
        Busy(true);
        try
        {
            var rows = await services.Data.ListAsync(services.Actor, new("projects"), lifetime.Token);
            if (!rows.Any(r => r.Id == selected.Id)) { loaded = false; notice.Text = "선택한 프로젝트를 사용할 수 없습니다. 목록을 새로고침해 주세요."; return; }
            if (IsDisposed) return; SelectedProjectId = selected.Id; DialogResult = DialogResult.OK; Close();
        }
        catch { if (!IsDisposed) notice.Text = "프로젝트를 열 수 없습니다. 서버 연결과 접근 권한을 확인해 주세요."; }
        finally { if (!IsDisposed) Busy(false); }
    }
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (DialogResult != DialogResult.OK && !exitConfirmed)
        {
            if (busy || ConfirmExit(this) != DialogResult.OK) { e.Cancel = true; DialogResult = DialogResult.None; }
            else { exitConfirmed = true; lifetime.Cancel(); }
        }
        base.OnFormClosing(e);
    }
    protected override void Dispose(bool disposing) { if (disposing && !IsDisposed) { lifetime.Cancel(); lifetime.Dispose(); } base.Dispose(disposing); }
}
