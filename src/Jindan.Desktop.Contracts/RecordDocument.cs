using Jindan.Contracts;
namespace Jindan.Desktop.Contracts;

// Shared native editor infrastructure; field definitions belong to each DLL and
// all authorization, validation and persistence are injected service operations.
public class RecordDocument : UserControl, IWorkspaceDocument
{
    protected readonly IWorkspaceServices Services;
    protected readonly RecordSchema Schema;
    protected readonly DataGridView Grid = new() { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false, RowHeadersVisible = false };
    protected readonly ToolStrip Toolbar = new() { GripStyle = ToolStripGripStyle.Hidden, Dock = DockStyle.Top };
    protected readonly Label Notice = new() { Dock = DockStyle.Bottom, Height = 42, ForeColor = Color.DarkSlateBlue, AutoEllipsis = true };
    protected Dictionary<string, string> Values = new();
    protected WorkRecord? Selected;
    private readonly Dictionary<string, Control> editors = new();
    private CancellationTokenSource lifetime = new();
    private bool refreshing, dirty, selectionRestoreQueued;
    private bool ownedDisposed;
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task Ready => ready.Task;
    private long generation;
    private int page;
    private const int PageSize = 200;
    private string currentSearch = "";
    private readonly Label scope = new() { AutoSize = true, MaximumSize = new Size(230, 0) };
    public Control NavigationPanel { get; } = new Panel() { Dock = DockStyle.Fill };
    public Control PropertiesPanel { get; } = new Panel() { Dock = DockStyle.Fill, AutoScroll = true };
    public DocumentContext Context { get; private set; }
    public Control View => this;
    public bool IsDirty => dirty;
    public virtual string Title => Schema.Label + (dirty ? " *" : "");
    public event EventHandler? TitleChanged;
    public event EventHandler? SelectionChanged;
    public event EventHandler? RecordsChanged;
    public string? SelectedId => Selected?.Id;
    public RecordDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context)
    {
        Services = services; Schema = schema; Context = context; Dock = DockStyle.Fill;
        Controls.Add(Grid); Controls.Add(Notice); Controls.Add(Toolbar);
        AddAction("새 항목", () => { NewRecord(); return Task.CompletedTask; }); AddAction("저장", () => SaveAsync()); AddAction("선택 삭제", DeleteSelectedAsync); AddAction("다시 읽기", () => RefreshAsync());
        AddAction("이전 목록", async () => { if (page > 0) { page--; await RefreshAsync(currentSearch); } }); AddAction("다음 목록", async () => { page++; await RefreshAsync(currentSearch); });
        foreach (var f in schema.Fields) { Grid.Columns.Add(f.Key, f.Label); if (f.Type == "richtext-data") Grid.Columns[f.Key]!.Visible = false; }
        Grid.SelectionChanged += OnGridSelection;
        Grid.CurrentCellChanged += OnGridSelection;
        var nav = new FlowLayoutPanel() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
        var caption = new Label() { Text = schema.Label + " 검색", AutoSize = true, Margin = new Padding(8) };
        var search = new TextBox() { Width = 220, PlaceholderText = "현재 프로젝트에서 검색", Name = "Search" };
        UpdateScope();
        nav.Controls.AddRange([caption, search, scope]); NavigationPanel.Controls.Add(nav);
        search.TextChanged += async (_, _) => { if (!refreshing) await RunAsync(() => RefreshAsync(search.Text)); };
        var props = new TableLayoutPanel() { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Padding = new Padding(10) };
        foreach (var field in schema.Fields)
        {
            if (field.Type == "richtext-data") continue;
            props.Controls.Add(new Label() { Text = field.Label + (field.Required ? " *" : ""), AutoSize = true, Margin = new Padding(0, 7, 0, 2) });
            Control input;
            if (field.Type == "richtext") { var rich = new RichTextEditor70() { Name = field.Key }; rich.FormattingChanged += (_, _) => { if (refreshing) return; try { var value = rich.CaptureFormatting(); ChangeField(field.Key, value.Text); Values[field.Key + "Rtf"] = value.Rtf; } catch { Notice.Text = "지원하지 않는 서식입니다. 개체·그림·필드 없이 일반 텍스트로 붙여넣으세요."; SetDirty(true); } }; input = rich; }
            else if (field.Choices is { Length: > 0 }) { var combo = new ComboBox() { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Name = field.Key }; combo.Items.AddRange(field.Choices); combo.SelectedIndexChanged += (_, _) => ChangeField(field.Key, combo.Text); input = combo; }
            else { var text = new TextBox() { Dock = DockStyle.Top, Name = field.Key, ReadOnly = field.Type == "readonly", Multiline = field.Type == "multiline", Height = field.Type == "multiline" ? 90 : 28 }; text.TextChanged += (_, _) => ChangeField(field.Key, text.Text); input = text; }
            editors[field.Key] = input; props.Controls.Add(input);
        }
        PropertiesPanel.Controls.Add(props);
        Load += async (_, _) => { await RunAsync(() => RefreshAsync()); ready.TrySetResult(); };
    }
    protected void AddAction(string caption, Func<Task> action) { var item = new ToolStripButton(caption); item.Click += async (_, _) => await RunAsync(action); Toolbar.Items.Add(item); }
    protected async Task RunAsync(Func<Task> action) { try { await action(); } catch (OperationCanceledException) { Notice.Text = "작업 취소됨"; } catch (Exception error) { Notice.Text = error.Message.Length > 240 ? "작업을 완료하지 못했습니다." : error.Message; } }
    protected void SetDirty(bool value) { dirty = value; TitleChanged?.Invoke(this, EventArgs.Empty); }
    public void SetField(string key, string value) { if (!editors.ContainsKey(key)) throw new ArgumentException("Unknown field"); if (editors[key] is RichTextEditor70 rich) { rich.Fill(value, ""); Values.Remove(key + "Rtf"); } else editors[key].Text = value; ChangeField(key, value); }
    protected void ChangeField(string key, string value) { if (refreshing) return; Values[key] = value; SetDirty(true); }
    public void NewRecord() { if (dirty) { Notice.Text = "현재 변경을 저장하거나 창을 닫은 뒤 새 항목을 만드세요."; return; } ApplySelection(null); SetDirty(false); }
    private void ApplySelection(DataGridViewRow? visual)
    {
        refreshing = true;
        try
        {
            Grid.CurrentCell = null; Grid.ClearSelection();
            Selected = visual?.Tag as WorkRecord;
            Values = Selected is null ? new() : new(Selected.Fields);
            if (Selected is not null) { Grid.CurrentCell = visual!.Cells[0]; visual.Selected = true; }
            FillEditors();
        }
        finally { refreshing = false; }
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }
    protected void SelectVisibleRecord(string id)
    {
        if (dirty) return;
        var row = Grid.Rows.Cast<DataGridViewRow>().FirstOrDefault(r => r.Visible && r.Tag is WorkRecord record && record.Id == id);
        if (row is not null) ApplySelection(row);
    }
    private void RestoreVisualSelection()
    {
        // DataGridView cannot change CurrentCell inside its own selection notification.
        if (selectionRestoreQueued || !IsHandleCreated || IsDisposed) return;
        selectionRestoreQueued = true;
        BeginInvoke((Action)(() =>
        {
            selectionRestoreQueued = false;
            if (IsDisposed || !dirty) return;
            RestoreVisualSelectionNow();
        }));
    }
    private void RestoreVisualSelectionNow()
    {
        refreshing = true;
        try
        {
            Grid.CurrentCell = null; Grid.ClearSelection();
            var row = Grid.Rows.Cast<DataGridViewRow>().FirstOrDefault(r => r.Tag is WorkRecord record && record.Id == Selected?.Id);
            if (row is not null) { Grid.CurrentCell = row.Cells[0]; row.Selected = true; }
        }
        finally { refreshing = false; }
    }
    protected void FillEditors() { var wasRefreshing = refreshing; refreshing = true; try { foreach (var (key, control) in editors) { var value = Values.GetValueOrDefault(key, ""); if (control is RichTextEditor70 rich) rich.Fill(value, Values.GetValueOrDefault(key + "Rtf", "")); else if (control is ComboBox combo) combo.SelectedItem = value; else control.Text = value; } } finally { refreshing = wasRefreshing; } }
    private void OnGridSelection(object? sender, EventArgs e)
    {
        if (refreshing) return;
        if (dirty) { Notice.Text = "변경 내용을 먼저 저장하세요."; RestoreVisualSelection(); return; }
        if (Grid.CurrentRow?.Tag is WorkRecord row) { Selected = row; Values = new(row.Fields); FillEditors(); SelectionChanged?.Invoke(this, EventArgs.Empty); }
        else if (Selected is not null) { Selected = null; Values = new(); FillEditors(); SelectionChanged?.Invoke(this, EventArgs.Empty); }
    }
    public virtual async Task RefreshAsync(string search = "")
    {
        if (dirty) { Notice.Text = "변경 내용을 먼저 저장하세요."; return; }
        if (search != currentSearch) { page = 0; currentSearch = search; }
        var g = ++generation; var rows = FilterRows(await Services.Data.ListAsync(Services.Actor, new(Schema.Kind, Schema.ProjectScoped ? Context.ProjectId : null, search), lifetime.Token));
        if (g != generation || IsDisposed || dirty) return;
        RenderRows(rows, Selected?.Id);
    }
    private void RenderRows(IReadOnlyList<WorkRecord> rows, string? selectedId)
    {
        page = Math.Min(page, Math.Max(0, (rows.Count - 1) / PageSize));
        refreshing = true; try { Grid.Rows.Clear(); foreach (var row in rows.Skip(page * PageSize).Take(PageSize)) { var i = Grid.Rows.Add(Schema.Fields.Select(f => (object)row.Fields.GetValueOrDefault(f.Key, "")).ToArray()); Grid.Rows[i].Tag = row; } } finally { refreshing = false; }
        var selectedRow = Grid.Rows.Cast<DataGridViewRow>().FirstOrDefault(r => r.Tag is WorkRecord record && record.Id == selectedId) ?? Grid.Rows.Cast<DataGridViewRow>().FirstOrDefault();
        ApplySelection(selectedRow);
        Notice.Text = $"{rows.Count}개 항목 · 목록 {page + 1}/{Math.Max(1, (rows.Count + PageSize - 1) / PageSize)} · 독립 로컬 저장소";
    }
    public async Task SelectExistingAsync(string id, long expectedRevision, CancellationToken ct = default)
    {
        if (dirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요.");
        var context = Context; var g = ++generation;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        var rows = FilterRows(await Services.Data.ListAsync(Services.Actor, new(Schema.Kind, Schema.ProjectScoped ? context.ProjectId : null), linked.Token));
        linked.Token.ThrowIfCancellationRequested();
        if (IsDisposed || dirty || g != generation || Context != context) throw new InvalidOperationException("선택할 문서 문맥이 바뀌었습니다.");
        var index = rows.ToList().FindIndex(r => r.Id == id && r.Revision == expectedRevision);
        if (index < 0) throw new InvalidOperationException("자료가 변경되었거나 현재 폴더에 없습니다. 목록을 다시 읽으세요.");
        currentSearch = ""; page = index / PageSize;
        refreshing = true; try { NavigationPanel.Controls.Find("Search", true).OfType<TextBox>().Single().Text = ""; } finally { refreshing = false; }
        RenderRows(rows, id); // The same guarded logical/editor/event path as a normal refresh.
    }
    protected virtual IReadOnlyList<WorkRecord> FilterRows(IReadOnlyList<WorkRecord> rows) => rows;
    public virtual async Task SaveAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        foreach (var (key, control) in editors) if (control is RichTextEditor70 rich && rich.IsEdited) { var formatted = rich.CaptureFormatting(); Values[key] = formatted.Text; Values[key + "Rtf"] = formatted.Rtf; }
        var saved = await Services.Data.SaveAsync(Services.Actor, new(Selected?.Id, Schema.Kind, Schema.ProjectScoped ? Context.ProjectId : null, Selected?.Revision ?? 0, new(Values)), ct);
        Selected = saved; Values = new(saved.Fields); SetDirty(false); await RefreshAsync(); Notice.Text = "저장됨"; RecordsChanged?.Invoke(this, EventArgs.Empty);
    }
    private async Task DeleteSelectedAsync() { if (Selected is null) return; if (MessageBox.Show(this, "선택 항목을 휴지통 처리할까요?", "삭제 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return; await Services.Data.DeleteAsync(Services.Actor, Schema.Kind, Selected.Id, Selected.Revision, true, lifetime.Token); SetDirty(false); NewRecord(); await RefreshAsync(); RecordsChanged?.Invoke(this, EventArgs.Empty); }
    private void UpdateScope()
    {
        scope.Tag = Context;
        scope.Text = Schema.ProjectScoped
            ? Context.ProjectId is null ? "프로젝트를 선택해 자료를 확인하세요." : "선택한 프로젝트의 자료입니다."
            : "접근 권한이 있는 자료입니다.";
    }
    public virtual void SetContext(DocumentContext context) { if (context.ContextId != Context.ContextId) throw new InvalidOperationException("Document context identity mismatch"); if (dirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요."); generation++; Context = context; page = 0; refreshing = true; try { Grid.Rows.Clear(); } finally { refreshing = false; } ApplySelection(null); UpdateScope(); _ = RunAsync(() => RefreshAsync()); }
    protected override void Dispose(bool disposing) { if (disposing && !ownedDisposed) { ownedDisposed = true; generation++; lifetime.Cancel(); lifetime.Dispose(); ready.TrySetCanceled(); Grid.SelectionChanged -= OnGridSelection; Grid.CurrentCellChanged -= OnGridSelection; NavigationPanel.Dispose(); PropertiesPanel.Dispose(); } base.Dispose(disposing); }
}
