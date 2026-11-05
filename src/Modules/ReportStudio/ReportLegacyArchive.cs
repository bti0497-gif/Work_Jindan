using System.Text.Json.Nodes;
using Jindan.Contracts;

namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument
{
    private JsonNode? _legacyPreview;
    private string? _legacyArchivePath;
    private readonly List<JsonObject> _legacyImports = [];
    private readonly RichTextBox _legacyContext = new() { Name = "LegacyProjectContext", Dock = DockStyle.Fill, ReadOnly = true };
    public string LegacyImportsJson => System.Text.Json.JsonSerializer.Serialize(_legacyImports);
    private void BuildLegacyArchiveTab()
    {
        var tab = new TabPage("이전 프로젝트 가져오기") { Name = "LegacyArchiveTab" }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true }; AddButton(bar, "LegacyProjectPreview", "이전 .jindanproj 검사", () => Run(PickLegacyArchive)); AddButton(bar, "LegacyProjectImport", "검사한 원본 사본 가져오기", () => Run(ConfirmLegacyArchive)); tab.Controls.Add(_legacyContext); tab.Controls.Add(bar); tab.Controls.Add(new Label { Dock = DockStyle.Bottom, Height = 46, Text = "검증된 파일을 현재 권한의 프로젝트에 새 자산 사본으로 등록합니다. 이전 계정·권한·분석·검토·승인은 적용하지 않으며, 옛 목차와 문구는 읽기 전용 역사 문맥입니다." }); _tabs.TabPages.Add(tab);
    }
    private void ResetLegacy() { _legacyPreview = null; _legacyArchivePath = null; _legacyImports.Clear(); _legacyContext.Clear(); }
    private void LoadLegacyState(JsonNode value) { foreach (var item in value["legacyImports"]?.AsArray() ?? []) if (item is JsonObject receipt) _legacyImports.Add((JsonObject)receipt.DeepClone()); if (_legacyImports.Count > 0) _legacyContext.Text = _legacyImports[^1].ToJsonString(DisplayJson); }
    private void SaveLegacyState(JsonObject value) { value["legacyImports"] = System.Text.Json.JsonSerializer.SerializeToNode(_legacyImports); }
    private async Task PickLegacyArchive() { using var dialog = new OpenFileDialog { Filter = "이전 보고서 프로젝트|*.jindanproj;*.zip" }; if (dialog.ShowDialog(this) == DialogResult.OK) await PreviewLegacyProjectAsync(dialog.FileName); }
    public async Task<JsonNode> PreviewLegacyProjectAsync(string path)
    {
        _legacyPreview = null; _legacyArchivePath = null; if (new FileInfo(path).Length is <= 0 or > 160L * 1024 * 1024) throw new InvalidDataException(); var bytes = await File.ReadAllBytesAsync(path, Token); var reply = await _services.Reports.ExecuteAsync(Context, new ReportCommand("inspectLegacyProject", Context.ProjectId!, path, Hash(bytes)), ct: Token); if (!reply.Ok) throw new InvalidDataException(); var value = JsonNode.Parse(await File.ReadAllTextAsync(reply.ResultJsonPath!, Token))!["value"]!; if (value["archiveSha256"]?.ToString() != Hash(bytes)) throw new InvalidDataException(); _legacyPreview = value.DeepClone(); _legacyArchivePath = path; _legacyContext.Text = "현재 가져오기 대상 프로젝트: " + Context.ProjectId + "\nSHA: " + value["archiveSha256"] + "\n검사 요약\n" + value["summary"]?.ToJsonString(DisplayJson) + "\n읽기 전용 이전 문맥(현재값/승인으로 사용하지 않음)\n" + value["receipt"]?.ToJsonString(DisplayJson); _tabs.SelectedTab = _tabs.TabPages["LegacyArchiveTab"]; return value;
    }
    private async Task ConfirmLegacyArchive() { if (_legacyPreview == null) throw new InvalidOperationException(); var confirmed = MessageBox.Show(this, $"현재 프로젝트 {Context.ProjectId}에 검증된 파일 {_legacyPreview["summary"]?["files"]}개를 새 사본으로 등록할까요?\n이전 계정·권한·분석·검토·현재값은 적용하지 않습니다.", "이전 프로젝트 사본 가져오기", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes; await ImportLegacyProjectAsync(confirmed); }
    public async Task ImportLegacyProjectAsync(bool confirmed)
    {
        if (confirmed) await AuthorizeProfile(true, Token);
        if (!confirmed || _legacyPreview == null || _legacyArchivePath == null || new FileInfo(_legacyArchivePath).Length != _legacyPreview["archiveSize"]!.GetValue<long>() || Hash(await File.ReadAllBytesAsync(_legacyArchivePath, Token)) != _legacyPreview["archiveSha256"]?.ToString()) throw new InvalidOperationException(); var preview = _legacyPreview; var directory = Path.Combine(_projectRoot, "legacy-import-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory); var mappings = new JsonArray();
        // Verify every output before importing any asset. Descriptors were already
        // bound/checked by ReportService; recheck against accidental later edits.
        foreach (var file in preview["files"]!.AsArray()) { var descriptor = file!["bytes"]!["$workerFile"]!; if (new FileInfo(descriptor["path"]!.ToString()).Length != file["size"]!.GetValue<long>()) throw new InvalidDataException(); var bytes = await File.ReadAllBytesAsync(descriptor["path"]!.ToString(), Token); if (Hash(bytes) != file["sha256"]?.ToString() || Hash(bytes) != descriptor["sha256"]?.ToString() || bytes.LongLength != file["size"]!.GetValue<long>()) throw new InvalidDataException(); }
        foreach (var (file, index) in preview["files"]!.AsArray().Select((file, index) => (file!, index))) { var descriptor = file["bytes"]!["$workerFile"]!; var extension = "." + file["format"]!.ToString(); var destination = Path.Combine(directory, index.ToString("D4") + extension); File.Copy(descriptor["path"]!.ToString(), destination, false); var asset = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId!, destination, Token); if (asset.Sha256 != file["sha256"]!.ToString()) throw new InvalidDataException(); var isReport = file["role"]?.ToString() == "reference" && extension is ".pdf" or ".hwp" or ".hwpx"; if (isReport) { if (_items.All(item => item.Sha256 != asset.Sha256)) _items.Add(new ReportItem(asset.Id, file["filename"]!.ToString(), asset.StoredPath, asset.Sha256)); if (!_reportMetadata.ContainsKey(asset.Sha256) && file["metadata"] is JsonObject metadata) _reportMetadata[asset.Sha256] = (JsonObject)metadata.DeepClone(); } else if (_materials.All(item => item.Sha256 != asset.Sha256)) _materials.Add(new EvidenceItem(asset.Id, file["filename"]!.ToString(), asset.StoredPath, asset.Sha256, "historical")); mappings.Add(new JsonObject { ["legacyId"] = file["legacyId"]!.DeepClone(), ["localAssetId"] = asset.Id, ["sha256"] = asset.Sha256, ["role"] = isReport ? "reference" : "historical-material" }); }
        var receipt = new JsonObject { ["archiveSha256"] = preview["archiveSha256"]!.DeepClone(), ["targetProjectId"] = Context.ProjectId, ["mappings"] = mappings, ["historicalContext"] = preview["receipt"]!.DeepClone(), ["importedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["requiresFreshReview"] = true, ["reportReady"] = false }; _legacyImports.Add(receipt); await Atomic(Path.Combine(directory, "historical-context.json"), receipt.ToJsonString(), Token); _legacyContext.Text = receipt.ToJsonString(DisplayJson); _legacyPreview = null; _legacyArchivePath = null; _services.Reports.Invalidate(Context.ContextId); RefreshLists(); _dirty = true; await SaveAsync(Token); Status("이전 파일 사본을 현재 프로젝트에 등록했습니다. 원래 목차·문구는 역사 문맥이며 새 분석·현재 근거·검토 전에는 초안 작성이 차단됩니다.");
    }
}
