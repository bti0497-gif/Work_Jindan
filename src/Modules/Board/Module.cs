using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Modules.Board;

public sealed class Module : RecordModule
{
    public override NavigationGroup73 NavigationGroup => new("board", "전체게시판", "board", 50, false);
    public override IReadOnlyList<NavigationRoute73> SidebarRoutes => [new("board", "전체게시판")];
    public override string ModuleId => "board";
    public override string Version => "1.0.1";
    public override string DisplayName => "게시판";
    public override RecordSchema Schema => new("board", DisplayName, [new("title", "제목", Required: true), new("category", "분류", Choices: ["일반", "공지", "자료", "답글"]), new("parentId", "원글 식별자 (답글·댓글)"), new("content", "내용", "richtext", true), new("contentRtf", "로컬 문자 서식", "richtext-data"), new("attachmentId", "단일 첨부 자료 (기존)"), new("attachmentIds", "첨부 자료 식별자 (최대10개)", "multiline")], false);
    public override IWorkspaceDocument CreateDocument(DocumentContext context) => new BoardDocument(Services, Schema, context);
}
public sealed partial class BoardDocument : RecordDocument
{
    private readonly RichTextBox thread = new() { Dock = DockStyle.Fill, ReadOnly = true }; private long generation;
    public BoardDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context) : base(services, schema, context) { Controls.Remove(Grid); var split = new SplitContainer() { Size = new(800, 600), Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 220 }; split.Panel1.Controls.Add(Grid); split.Panel2.Controls.Add(thread); Controls.Add(split); split.BringToFront(); AddAction("답글·댓글 작성", () => { var parent = Selected; if (parent is null || IsDirty) return Task.CompletedTask; NewRecord(); SetField("title", "Re: " + parent.Fields.GetValueOrDefault("title", "")); SetField("category", "답글"); SetField("parentId", parent.Fields.GetValueOrDefault("parentId", "") is { Length: > 0 } p ? p : parent.Id); return Task.CompletedTask; }); AddAction("로컬 첨부 추가", AttachDialogAsync); AddAction("보관 자료 연결", SelectExistingAttachmentAsync); AddAction("첨부 해제", () => { SetField("attachmentId", ""); SetField("attachmentIds", ""); return Task.CompletedTask; }); AddAction("첨부 원본 내보내기", DownloadAttachmentsAsync); SelectionChanged += UpdateThread; if (Services is Jindan.Contracts.Cloud.ICloudWorkspaceAccess access) AddAction("Firebase 게시판 · 서버 조회", () => { using var window = new CloudBoardWindow71(access.Cloud); window.ShowDialog(this); return Task.CompletedTask; }); }
    private async void UpdateThread(object? sender, EventArgs e) { var g = ++generation; var selected = Selected; if (selected is null) { thread.Clear(); return; } await RunAsync(async () => { var rows = await Services.Data.ListAsync(Services.Actor, new("board")); if (IsDisposed || g != generation) return; var root = selected.Fields.GetValueOrDefault("parentId", ""); if (root.Length == 0) root = selected.Id; RenderThread(rows.Where(r => r.Id == root || r.Fields.GetValueOrDefault("parentId") == root)); }); }
    private async Task ExportAttachmentAsync() { var id = Values.GetValueOrDefault("attachmentId"); if (string.IsNullOrWhiteSpace(id)) return; var asset = await Services.Assets.GetAsync(Services.Actor, id); using var dialog = new SaveFileDialog() { FileName = asset.OriginalName, InitialDirectory = Path.Combine(Services.DataRoot, "exports") }; if (dialog.ShowDialog(this) == DialogResult.OK) await Services.Assets.ExportAsync(Services.Actor, id, dialog.FileName); }
    protected override void Dispose(bool disposing) { if (disposing) { generation++; SelectionChanged -= UpdateThread; } base.Dispose(disposing); }
}
