using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Modules.Files;

public sealed class Module : RecordModule
{
    public override NavigationGroup73 NavigationGroup => new("files", "파일관리", "files", 20, false);
    public override IReadOnlyList<NavigationRoute73> SidebarRoutes => [new("files", "파일 목록")];
    public override string ModuleId => "files";
    public override string Version => "1.0.1";
    public override string DisplayName => "파일·자료 관리";
    public override RecordSchema Schema => new("files", DisplayName, [new("title", "자료명", Required: true), new("assetId", "원본 자산 식별자", "readonly", true), new("sha256", "원본 SHA256", "readonly"), new("size", "바이트", "readonly"), new("category", "분류", Choices: ["일반", "보고서", "계측", "설계", "사진", "CAD"]), new("folderId", "로컬 폴더 식별자"), new("content", "설명", "multiline")]);
    public override void Initialize(IWorkspaceServices services) { base.Initialize(services); services.Data.RegisterSchema(new("file-folders", "로컬 자료 폴더", [new("title", "폴더명", Required: true), new("parentId", "상위 폴더")], true)); }
    public override IWorkspaceDocument CreateDocument(DocumentContext context) => new FileDocument(Services, Schema, context);
}
public sealed partial class FileDocument : RecordDocument, ISourceDocument
{
    public FileDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context) : base(services, schema, context) { AddAction("로컬 파일 가져오기", ImportAsync); AddAction("원본 내보내기", ExportAsync); AddAction("로컬 내용 보기", PreviewAsync); AddAction("Drive 목록 캐시 · 로컬 시험", OpenDriveCacheAsync); InitializeFolders(); InitializeCloud71(); }
    async Task OpenDriveCacheAsync() { if (Context.ProjectId is null) throw new InvalidOperationException("프로젝트를 선택하세요."); await Services.Data.ListAsync(Services.Actor, new("files", Context.ProjectId)); using var view = new DriveCacheWindow(Services, Context); view.ShowDialog(this); }
    void InitializeCloud71() { if (Services is Jindan.Contracts.Cloud.ICloudWorkspaceAccess access) AddAction("공유 Drive · 서버 조회", () => { using var window = new CloudDriveWindow71(access.Cloud); window.ShowDialog(this); return Task.CompletedTask; }); }
    public Task<WorkRecord> ImportPathAsync(string file, CancellationToken ct = default) => ImportPathAsync(file, LocalFileDuplicatePolicy.Reject, ct);
    public async Task<WorkRecord> ImportPathAsync(string file, LocalFileDuplicatePolicy policy, CancellationToken ct = default)
    {
        if (IsDirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요."); if (Context.ProjectId is null) throw new InvalidOperationException("프로젝트를 선택하세요."); if (!Enum.IsDefined(policy)) throw new InvalidOperationException("중복 처리 방법을 확인하세요.");
        var project = Context.ProjectId; var folder = currentFolder; var contextId = Context.ContextId; var title = Path.GetFileName(file); var current = await Services.Data.ListAsync(Services.Actor, new("files", project), ct); var names = current.Where(r => r.Fields.GetValueOrDefault("folderId", "") == folder).ToArray(); var duplicate = names.FirstOrDefault(r => string.Equals(r.Fields.GetValueOrDefault("title"), title, StringComparison.OrdinalIgnoreCase));
        if (duplicate is not null && policy == LocalFileDuplicatePolicy.Skip) return duplicate;
        var asset = await Services.Assets.ImportAsync(Services.Actor, project, file, ct);
        if (duplicate is not null)
        {
            if (duplicate.Fields.GetValueOrDefault("assetId") == asset.Id || policy == LocalFileDuplicatePolicy.Skip) return duplicate;
            if (policy != LocalFileDuplicatePolicy.RenameCopy) throw new InvalidOperationException("같은 이름의 다른 자료가 있습니다. 별도 이름의 사본으로 가져오세요.");
            var stem = Path.GetFileNameWithoutExtension(title); var extension = Path.GetExtension(title); var counter = 1; do { title = stem + " (" + counter++ + ")" + extension; if (counter > 10000) throw new InvalidOperationException("중복 이름이 너무 많습니다."); } while (names.Any(r => string.Equals(r.Fields.GetValueOrDefault("title"), title, StringComparison.OrdinalIgnoreCase)));
        }
        if (Context.ProjectId != project || Context.ContextId != contextId || currentFolder != folder) throw new InvalidOperationException("가져오기 중 문맥이 바뀌었습니다. 다시 선택하세요.");
        return await Services.Data.SaveAsync(Services.Actor, new(null, Schema.Kind, project, 0, new() { { "title", title }, { "assetId", asset.Id }, { "sha256", asset.Sha256 }, { "size", asset.Size.ToString() }, { "category", "일반" }, { "folderId", folder } }), ct);
    }
    private async Task ImportAsync() { using var dialog = new OpenFileDialog() { Multiselect = true, Title = "원본은 보존하고 새 저장소로 복사" }; if (dialog.ShowDialog(this) != DialogResult.OK) return; foreach (var file in dialog.FileNames) await ImportWithDuplicateChoiceAsync(file); await RefreshAsync(); }
    public async Task ImportWithDuplicateChoiceAsync(string file)
    {
        if (Context.ProjectId is null) throw new InvalidOperationException("프로젝트를 선택하세요."); var current = await Services.Data.ListAsync(Services.Actor, new("files", Context.ProjectId)); var duplicate = current.Any(r => r.Fields.GetValueOrDefault("folderId", "") == currentFolder && string.Equals(r.Fields.GetValueOrDefault("title"), Path.GetFileName(file), StringComparison.OrdinalIgnoreCase));
        if (!duplicate) { await ImportPathAsync(file); return; }
        using var choice = new Form { Name = "DuplicateFileDecision", Text = "중복 자료", Width = 520, Height = 190, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false };
        var message = new Label { Dock = DockStyle.Fill, Text = "같은 이름의 자료가 있습니다. 원본은 유지됩니다.\n이름을 바꾼 사본으로 가져오거나 건너뛰세요.", Padding = new Padding(12), AutoSize = false };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft }; var cancel = new Button { Name = "DuplicateCancel", Text = "중단", AutoSize = true, DialogResult = DialogResult.Cancel }; var skip = new Button { Name = "DuplicateSkip", Text = "건너뛰기", AutoSize = true, DialogResult = DialogResult.No }; var rename = new Button { Name = "DuplicateRename", Text = "이름 변경 사본", AutoSize = true, DialogResult = DialogResult.Yes }; buttons.Controls.AddRange([cancel, skip, rename]); choice.Controls.Add(message); choice.Controls.Add(buttons); choice.AcceptButton = rename; choice.CancelButton = cancel;
        var answer = choice.ShowDialog(this); if (answer == DialogResult.Cancel) throw new OperationCanceledException(); if (answer == DialogResult.No) return; await ImportPathAsync(file, LocalFileDuplicatePolicy.RenameCopy);
    }
    private async Task ExportAsync() { var id = Values.GetValueOrDefault("assetId"); if (string.IsNullOrWhiteSpace(id)) return; var asset = await Services.Assets.GetAsync(Services.Actor, id); using var d = new SaveFileDialog() { FileName = asset.OriginalName, InitialDirectory = Path.Combine(Services.DataRoot, "exports"), OverwritePrompt = true }; if (d.ShowDialog(this) == DialogResult.OK) await Services.Assets.ExportAsync(Services.Actor, id, d.FileName); }
    private async Task PreviewAsync() { var id = Values.GetValueOrDefault("assetId"); if (string.IsNullOrWhiteSpace(id)) return; var asset = await Services.Assets.GetAsync(Services.Actor, id); var extension = Path.GetExtension(asset.OriginalName).ToLowerInvariant(); if (extension is ".dwg" or ".dxf") { await CadPreviewWindow.ShowAsync(Services, Context, asset); return; } if (extension is ".pdf" or ".hwpx" or ".hwp") { if (!Services.TryOpenDocument("report-studio", Context.ProjectId, asset.StoredPath)) Notice.Text = "보고서 스튜디오 모듈을 확인하세요."; return; } if (asset.Size > 1024 * 1024 || extension is not (".txt" or ".csv" or ".json" or ".xml")) { Notice.Text = "본문 미리보기는 1MB 이하 텍스트·CSV·JSON·XML에서 지원합니다."; return; } var text = await File.ReadAllTextAsync(asset.StoredPath); var view = new Form() { Text = asset.OriginalName, Width = 900, Height = 700 }; view.Controls.Add(new RichTextBox() { Dock = DockStyle.Fill, ReadOnly = true, Text = text, WordWrap = false }); view.Show(this); }
}
public enum LocalFileDuplicatePolicy { Reject, Skip, RenameCopy }
