using Jindan.Contracts;
using Jindan.Desktop.Contracts;
using Jindan.Core;
namespace Jindan.Modules.Processes;

public sealed class Module : RecordModule
{
    public override string ModuleId => "processes";
    public override string DisplayName => "공정·일정 관리";
    public override RecordSchema Schema => new("processes", DisplayName, [new("title", "공정·업무명", Required: true), new("startDate", "시작일 (YYYY-MM-DD)", "date"), new("endDate", "종료일 (YYYY-MM-DD)", "date"), new("isCompleted", "완료 여부", Choices: ["false", "true"]), new("progress", "진행률 (%)", "number"), new("relatedTask", "관련 업무 식별자"), new("content", "내용", "multiline")]);
    public override IWorkspaceDocument CreateDocument(DocumentContext context) => new ProcessDocument(Services, Schema, context);
}
public sealed class ProcessDocument : RecordDocument
{
    public ProcessDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context) : base(services, schema, context) { Grid.MultiSelect = true; Grid.Columns.Add("scheduleStatus", "기간 판정"); Grid.Columns.Add("periodProgress", "기간 경과율"); AddAction("선택 공정 완료", CompleteSelectedAsync); AddAction("선택 공정 일괄 삭제", DeleteManyAsync); }
    public override async Task RefreshAsync(string search = "") { await base.RefreshAsync(search); var today = DateOnly.FromDateTime(DateTime.Today); foreach (DataGridViewRow row in Grid.Rows) if (row.Tag is WorkRecord record) { var state = Schedule.Get(record.Fields, today); row.Cells["scheduleStatus"].Value = state.Status; row.Cells["periodProgress"].Value = state.Progress + "%"; } }
    public async Task CompleteSelectedAsync() { if (IsDirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요."); foreach (var record in Grid.SelectedRows.Cast<DataGridViewRow>().Select(r => r.Tag).OfType<WorkRecord>().ToArray()) { var fields = new Dictionary<string, string>(record.Fields) { ["isCompleted"] = "true" }; await Services.Data.SaveAsync(Services.Actor, new(record.Id, record.Kind, record.ProjectId, record.Revision, fields)); } await RefreshAsync(); }
    private async Task DeleteManyAsync() { if (IsDirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요."); var rows = Grid.SelectedRows.Cast<DataGridViewRow>().Select(r => r.Tag).OfType<WorkRecord>().ToArray(); if (rows.Length == 0 || MessageBox.Show(this, $"선택 공정 {rows.Length}개를 휴지통 처리할까요?", "일괄 삭제 확인", MessageBoxButtons.YesNo) != DialogResult.Yes) return; foreach (var r in rows) await Services.Data.DeleteAsync(Services.Actor, r.Kind, r.Id, r.Revision, true); NewRecord(); await RefreshAsync(); }
}
