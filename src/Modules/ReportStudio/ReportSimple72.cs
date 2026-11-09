namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument
{
    private readonly List<TabPage> deferredPages72 = [];
    private void SimplifyCommands72()
    {
        var commands = _actions.Controls.OfType<Button>().ToDictionary(b => b.Name);
        foreach (Control control in _actions.Controls) control.Visible = false;
        var bar = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, AutoSize = true, Name = "ReportMainCommands" };
        void Command(ToolStripItemCollection items, string name, string label)
        {
            if (!commands.TryGetValue(name, out var button) || button.Tag is not Action run) return;
            var item = new ToolStripMenuItem(label) { Enabled = button.Enabled };
            button.EnabledChanged += (_, _) => item.Enabled = button.Enabled;
            item.Click += (_, _) => { if (button.Enabled) run(); }; items.Add(item);
        }
        var report = new ToolStripDropDownButton("보고서");
        Command(report.DropDownItems, "ImportReport", "전회 보고서 등록"); Command(report.DropDownItems, "AnalyzeReport", "분석");
        Command(report.DropDownItems, "SelectChapterRestore", "선택 장 한글화"); Command(report.DropDownItems, "ExportArtifact", "내려받기");
        var materials = new ToolStripDropDownButton("자료");
        Command(materials.DropDownItems, "ImportEvidence", "금회 자료 등록"); Command(materials.DropDownItems, "InspectMaterial", "선택 자료 확인");
        var write = new ToolStripDropDownButton("보고서 작성");
        Command(write.DropDownItems, "SaveReview", "검토 저장"); Command(write.DropDownItems, "PrepareDraft", "작성 준비 확인");
        Command(write.DropDownItems, "BlankDraft", "빈 초안 만들기"); Command(write.DropDownItems, "CurrentDraft", "검토 자료로 작성");
        bar.Items.AddRange([report, materials, write]);
        Command(bar.Items, "SaveReportState", "저장"); Command(bar.Items, "CancelReport", "취소");
        _actions.Controls.Add(bar); _actions.WrapContents = true;
        foreach (var page in _tabs.TabPages.Cast<TabPage>().ToArray())
        {
            if (page.Name is "PreviewTab" or "AnalysisTab" or "DisciplineTab" or "FormattingTab" or "MaterialsTab" or "ElectricalPreparationTab") continue;
            _tabs.TabPages.Remove(page); deferredPages72.Add(page);
        }
        Disposed += (_, _) => { foreach (var page in deferredPages72) page.Dispose(); };
    }
}
