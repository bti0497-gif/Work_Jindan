using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Modules.Tasks;

public sealed class Module : RecordModule
{
    public override NavigationGroup73 NavigationGroup => new("tasks", "할일관리", "tasks", 30, false);
    public override IReadOnlyList<NavigationRoute73> SidebarRoutes => [new("tasks", "할일 목록")];
    public override string ModuleId => "tasks";
    public override string DisplayName => "할 일 관리";
    public override RecordSchema Schema => new("tasks", DisplayName, [new("title", "할 일", Required: true), new("startDate", "시작일 (YYYY-MM-DD)", "date"), new("endDate", "마감일 (YYYY-MM-DD)", "date"), new("status", "상태", Choices: ["할 일", "진행중", "완료"]), new("priority", "우선순위", Choices: ["보통", "높음", "낮음"]), new("isPublic", "공개 일정", Choices: ["false", "true"]), new("assignee", "담당자"), new("relatedProjectId", "관련 프로젝트 식별자"), new("content", "상세 내용", "multiline")], false);
    public override IWorkspaceDocument CreateDocument(DocumentContext context) => new TaskDocument(Services, Schema, context);
}
public sealed class TaskDocument : RecordDocument
{
    private readonly MonthCalendar calendar = new() { Dock = DockStyle.None, Anchor = AnchorStyles.Top | AnchorStyles.Left, CalendarDimensions = new Size(1, 1), MaxSelectionCount = 1 };
    private readonly FlowLayoutPanel calendarPanel = new() { Dock = DockStyle.Left, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = false };
    private bool calendarFitQueued, calendarFitting;
    private Form? calendarOwner;
    private readonly CheckBox selectedDateOnly = new() { Text = "선택 날짜만 보기", AutoSize = true };
    public TaskDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context) : base(services, schema, context)
    {
        calendarPanel.Controls.Add(calendar); selectedDateOnly.Dock = DockStyle.None; calendarPanel.Controls.Add(selectedDateOnly); Controls.Add(calendarPanel); calendarPanel.BringToFront(); Grid.BringToFront(); calendar.DateSelected += async (_, _) => { if (!IsDirty && SelectedId is null) { SetField("startDate", calendar.SelectionStart.ToString("yyyy-MM-dd")); SetField("endDate", calendar.SelectionStart.ToString("yyyy-MM-dd")); } if (selectedDateOnly.Checked) ApplyDay(); await Task.CompletedTask; }; selectedDateOnly.CheckedChanged += async (_, _) => { if (selectedDateOnly.Checked) ApplyDay(); else await RefreshAsync(); };
        calendar.HandleCreated += QueueCalendarFit; calendar.FontChanged += QueueCalendarFit; calendar.SizeChanged += QueueCalendarFit; calendar.DpiChangedAfterParent += QueueCalendarFit;
        calendarPanel.SizeChanged += QueueCalendarFit; DpiChangedAfterParent += QueueCalendarFit; VisibleChanged += QueueCalendarFit; Load += QueueCalendarFit;
    }
    protected override void OnLayout(LayoutEventArgs e)
    {
        base.OnLayout(e);
        if (calendar is not null)
        {
            var owner = FindForm();
            while (owner?.MdiParent is Form mdiParent) owner = mdiParent;
            if (!ReferenceEquals(owner, calendarOwner))
            {
                if (calendarOwner is not null) calendarOwner.DpiChanged -= CalendarOwnerDpiChanged;
                calendarOwner = owner;
                if (calendarOwner is not null) calendarOwner.DpiChanged += CalendarOwnerDpiChanged;
            }
            QueueCalendarFit(this, EventArgs.Empty);
        }
    }
    private void CalendarOwnerDpiChanged(object? sender, DpiChangedEventArgs e) => QueueCalendarFit(this, EventArgs.Empty);
    private void QueueCalendarFit(object? sender, EventArgs e)
    {
        if (calendarFitting || calendarFitQueued || IsDisposed || Disposing || !IsHandleCreated || !calendar.IsHandleCreated) return;
        calendarFitQueued = true;
        BeginInvoke((Action)(() =>
        {
            calendarFitQueued = false;
            if (IsDisposed || Disposing || !calendar.IsHandleCreated) return;
            FitSingleMonth();
        }));
    }
    private void FitSingleMonth()
    {
        if (calendarFitting) return;
        calendarFitting = true;
        try
        {
            // Native SingleMonthSize reflects the current handle/font/DPI; a docked height can create extra months.
            calendar.CalendarDimensions = new Size(1, 1);
            calendar.Size = calendar.SingleMonthSize;
            var gap = Math.Max(4, (int)Math.Round(DeviceDpi * 4d / 96));
            calendarPanel.Padding = new Padding(gap);
            calendar.Margin = Padding.Empty;
            selectedDateOnly.Margin = new Padding(0, gap, 0, 0);
            calendarPanel.AutoScrollPosition = Point.Empty;
            calendarPanel.PerformLayout();
        }
        finally { calendarFitting = false; }
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (calendarOwner is not null) calendarOwner.DpiChanged -= CalendarOwnerDpiChanged;
            calendarOwner = null;
            calendar.HandleCreated -= QueueCalendarFit; calendar.FontChanged -= QueueCalendarFit; calendar.SizeChanged -= QueueCalendarFit; calendar.DpiChangedAfterParent -= QueueCalendarFit;
            calendarPanel.SizeChanged -= QueueCalendarFit; DpiChangedAfterParent -= QueueCalendarFit; VisibleChanged -= QueueCalendarFit; Load -= QueueCalendarFit;
        }
        base.Dispose(disposing);
    }
    private void ApplyDay() { Grid.CurrentCell = null; var day = calendar.SelectionStart.ToString("yyyy-MM-dd"); foreach (DataGridViewRow row in Grid.Rows) if (row.Tag is WorkRecord record) { var start = record.Fields.GetValueOrDefault("startDate", ""); var end = record.Fields.GetValueOrDefault("endDate", start); row.Visible = string.CompareOrdinal(start, day) <= 0 && string.CompareOrdinal(end, day) >= 0; } }
    public override async Task RefreshAsync(string search = "") { await base.RefreshAsync(search); calendar.BoldedDates = Grid.Rows.Cast<DataGridViewRow>().Select(r => r.Tag).OfType<WorkRecord>().Select(r => r.Fields.GetValueOrDefault("startDate")).Where(v => DateTime.TryParse(v, out _)).Select(v => DateTime.Parse(v!)).ToArray(); if (selectedDateOnly.Checked) ApplyDay(); }
}
