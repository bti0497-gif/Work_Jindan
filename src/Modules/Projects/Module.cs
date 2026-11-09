using Jindan.Contracts;
using Jindan.Desktop.Contracts;
using Jindan.Core;
namespace Jindan.Modules.Projects;

public sealed class Module : RecordModule, IProjectSelectionModule75
{
    public Form CreateProjectSelectionDialog() => new ProjectPicker75(Services);
    public override NavigationGroup73 NavigationGroup => new("projects", "프로젝트", "projects", 10, false);
    public override IReadOnlyList<NavigationRoute73> SidebarRoutes => [new("projects", "프로젝트관리"), new("processes", "공정관리")];
    public override string ModuleId => "projects";
    public override string DisplayName => "프로젝트 관리";
#if PATCH_V2
 public override string Version=>"1.1.0";
 public string FeatureRevision=>"active-project-filter-v2";
#else
    public string FeatureRevision => "project-crud-v1";
#endif
    public override RecordSchema Schema => new("projects", DisplayName, [new("title", "프로젝트명", Required: true), new("facility", "시설·발주처"), new("startDate", "시작일 (YYYY-MM-DD)", "date"), new("endDate", "종료일 (YYYY-MM-DD)", "date"), new("status", "상태", Choices: ["계획", "진행중", "완료", "중지"]), new("content", "업무·범위", "richtext"), new("contentRtf", "로컬 문자 서식", "richtext-data"), new("relatedFiles", "관련 자료 식별자")], false);
    public override IWorkspaceDocument CreateDocument(DocumentContext context) => new ProjectDocument(Services, Schema, context);
}
public sealed class ProjectDocument : RecordDocument
{
    public override async Task RefreshAsync(string search = "") { await base.RefreshAsync(search); if (IsDirty) return; var processes = await Services.Data.ListAsync(Services.Actor, new("processes")); var today = DateOnly.FromDateTime(DateTime.Today); foreach (DataGridViewRow row in Grid.Rows) if (row.Tag is WorkRecord project) { var schedule = Schedule.Get(project.Fields, today); row.Cells["scheduleStatus"].Value = schedule.Status; row.Cells["periodProgress"].Value = Schedule.ProjectProgress(project, processes, today) + "%"; row.Cells["completionRatio"].Value = Schedule.CompletionRatio(processes.Where(r => r.ProjectId == project.Id)) + "%"; } }
    public ProjectDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context) : base(services, schema, context)
    {
        Grid.Columns["status"]!.HeaderText = "관리 상태 (별도)"; Grid.Columns.Add("scheduleStatus", "기간 판정"); Grid.Columns.Add("periodProgress", "기간 경과율"); Grid.Columns.Add("completionRatio", "공정 완료 비율");
#if PATCH_V2
  AddAction("진행중만 보기",()=>{Grid.CurrentCell=null;foreach(DataGridViewRow row in Grid.Rows)row.Visible=row.Tag is WorkRecord record&&record.Fields.GetValueOrDefault("status")=="진행중";Notice.Text="v2 진행중 프로젝트 필터 적용";return Task.CompletedTask;});
#endif
    }
}
