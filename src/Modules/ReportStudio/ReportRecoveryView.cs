using System.Text.Json.Nodes;
using System.Text.Json;

namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument
{
    private sealed record RecoveredCopy(string Id, string Role, string Filename, string AssetId, string Path, string Sha256, string? SourceSha256, string[] ParentIds) { public string Label => Role + " · " + Filename; }
    private readonly List<RecoveredCopy> _recoveredCopies = [];
    private readonly List<JsonObject> _recoveryContexts = [];
    private readonly ListBox _recoveredFiles = new() { Name = "RecoveredFiles", Dock = DockStyle.Left, Width = 300, DisplayMember = "Label", BindingContext = new BindingContext() };
    private readonly RichTextBox _recoveredContext = new() { Name = "RecoveredHistoricalContext", Dock = DockStyle.Fill, ReadOnly = true };
    public string RecoveryContextJson => System.Text.Json.JsonSerializer.Serialize(_recoveryContexts);
    public string RecoveredCopiesJson => System.Text.Json.JsonSerializer.Serialize(_recoveredCopies);
    private void BuildRecoveryTab()
    {
        var tab = new TabPage("회수 파일·역사 문맥") { Name = "RecoveryFilesTab" }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true }; AddButton(bar, "RecoveredFileExport", "선택 회수 파일 새 사본", () => Run(ExportRecoveredSelected)); AddButton(bar, "RecoveredAsSource", "선택 후보 원본목록 등록·재검토", () => Run(AddRecoveredSelected)); tab.Controls.Add(_recoveredContext); tab.Controls.Add(_recoveredFiles); tab.Controls.Add(bar); tab.Controls.Add(new Label { Dock = DockStyle.Bottom, Height = 45, Text = "회수된 이전 양식·전기 준비·서식·검토는 읽기 전용 역사 문맥입니다. 옛 입력값·승인을 현재값으로 적용하지 않으며 선택 후보는 새 원본으로 분석·검토해야 합니다." }); _tabs.TabPages.Add(tab); _recoveredFiles.SelectedIndexChanged += (_, _) => { if (_recoveredFiles.SelectedItem is RecoveredCopy copy) _recoveredContext.Text = System.Text.Json.JsonSerializer.Serialize(copy, DisplayJson) + "\n\n역사 문맥(자동 적용 안 함)\n" + RecoveryContextJson; };
    }
    private void ResetRecovery() { _recoveredCopies.Clear(); _recoveryContexts.Clear(); _recoveredFiles.DataSource = null; _recoveredContext.Clear(); }
    private void LoadRecoveryState(JsonNode value) { foreach (var item in value["recoveredCopies"]?.AsArray() ?? []) if (item != null) _recoveredCopies.Add(item.Deserialize<RecoveredCopy>()!); foreach (var item in value["recoveryContexts"]?.AsArray() ?? []) if (item is JsonObject context) _recoveryContexts.Add((JsonObject)context.DeepClone()); RefreshRecoveredFiles(); }
    private void SaveRecoveryState(JsonObject value) { value["recoveredCopies"] = System.Text.Json.JsonSerializer.SerializeToNode(_recoveredCopies); value["recoveryContexts"] = System.Text.Json.JsonSerializer.SerializeToNode(_recoveryContexts); }
    private void RefreshRecoveredFiles() { _recoveredFiles.DataSource = null; _recoveredFiles.DataSource = _recoveredCopies.ToList(); _recoveredFiles.DisplayMember = nameof(RecoveredCopy.Label); _recoveredContext.Text = RecoveryContextJson; }
    private async Task ExportRecoveredSelected() { if (_recoveredFiles.SelectedItem is not RecoveredCopy copy) throw new InvalidOperationException(); using var dialog = new SaveFileDialog { FileName = copy.Filename }; if (dialog.ShowDialog(this) == DialogResult.OK) await ExportRecoveredCopyToAsync(copy.Id, dialog.FileName); }
    public async Task ExportRecoveredCopyToAsync(string id, string destination) { ExportDestination(destination); var copy = _recoveredCopies.Single(item => item.Id == id); var asset = await ResolveScopedAsset(copy.AssetId, copy.Path, copy.Sha256, Token); RequireLocal(new FileInfo(asset.StoredPath).Length <= 160L * 1024 * 1024, "EXPORT_LIMIT"); var bytes = await File.ReadAllBytesAsync(asset.StoredPath, Token); RequireLocal(Hash(bytes) == copy.Sha256, "RECOVERY_COPY_CHANGED"); await ExportNewBytes(destination, bytes, Token); }
    private async Task AddRecoveredSelected() { if (_recoveredFiles.SelectedItem is not RecoveredCopy copy) throw new InvalidOperationException(); await AddRecoveredCopyAsSourceAsync(copy.Id); }
    public async Task AddRecoveredCopyAsSourceAsync(string id)
    {
        await AuthorizeProfile(true, Token); var copy = _recoveredCopies.Single(item => item.Id == id); RequireLocal(copy.Role is "candidate" or "native-saved" or "draft", "RECOVERY_NOT_CANDIDATE"); var extension = Path.GetExtension(copy.Filename).ToLowerInvariant(); RequireLocal(extension is ".pdf" or ".hwp" or ".hwpx", "RECOVERY_SOURCE_FORMAT"); await ResolveScopedAsset(copy.AssetId, copy.Path, copy.Sha256, Token); if (_items.All(item => item.Sha256 != copy.Sha256)) _items.Add(new ReportItem(copy.AssetId, copy.Filename, copy.Path, copy.Sha256)); RefreshLists(); _binding = true; _reports.SelectedIndex = _items.FindIndex(item => item.Sha256 == copy.Sha256); _binding = false; SelectReport(false); _dirty = true; await SaveAsync(Token); Status("회수 후보를 별도 원본으로 연결했습니다. 과거 분석·승인은 적용하지 않았으며 새 분석·검토가 필요합니다.");
    }
    private async Task RegisterRecoveryFiles(JsonNode value)
    {
        var files = value["files"]!.AsArray(); var byId = files.ToDictionary(item => item!["id"]!.ToString(), item => item!); var mappings = new JsonArray(); JsonNode? historical = null; var receiptId = value["manifest"]?["state"]?["historicalWorkspaceFileId"]?.ToString();
        string? RootSource(JsonNode file, HashSet<string>? seen = null) { seen ??= []; var id = file["id"]!.ToString(); if (!seen.Add(id)) return null; if (file["role"]?.ToString() == "source") return file["sha256"]!.ToString(); foreach (var parent in file["parentIds"]?.AsArray() ?? []) if (byId.TryGetValue(parent!.ToString(), out var item)) { var found = RootSource(item, seen); if (found != null) return found; } return null; }
        foreach (var (file, index) in files.Select((item, index) => (item!, index)))
        {
            var descriptor = file["bytes"]!["$workerFile"]!; var source = descriptor["path"]!.ToString(); RequireLocal(new FileInfo(source).Length is > 0 and <= 160L * 1024 * 1024 && new FileInfo(source).Length == file["size"]!.GetValue<long>(), "RECOVERY_COPY_CHANGED"); var bytes = await File.ReadAllBytesAsync(source, Token); RequireLocal(Hash(bytes) == file["sha256"]!.ToString() && Hash(bytes) == descriptor["sha256"]!.ToString(), "RECOVERY_COPY_CHANGED"); var extension = Path.GetExtension(file["filename"]!.ToString()).ToLowerInvariant(); if (!System.Text.RegularExpressions.Regex.IsMatch(extension, @"^\.[a-z0-9]{1,12}$")) extension = ".bin"; var copyPath = Path.Combine(_projectRoot, "recovered-" + Guid.NewGuid().ToString("N") + extension); await AtomicBytes(copyPath, bytes, Token); var asset = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId!, copyPath, Token); var role = file["role"]!.ToString();
            if (role == "source") { if (_items.All(item => item.Sha256 != asset.Sha256)) _items.Add(new ReportItem(asset.Id, file["filename"]!.ToString(), asset.StoredPath, asset.Sha256)); }
            else if (role is "candidate" or "native-saved" or "draft") { var id = "recovered:" + Guid.NewGuid().ToString("N"); _recoveredCopies.Add(new RecoveredCopy(id, role, file["filename"]!.ToString(), asset.Id, asset.StoredPath, asset.Sha256, RootSource(file), file["parentIds"]!.AsArray().Select(item => item!.ToString()).ToArray())); }
            else if (_materials.All(item => item.Sha256 != asset.Sha256)) _materials.Add(new EvidenceItem(asset.Id, file["filename"]!.ToString(), asset.StoredPath, asset.Sha256, "historical"));
            mappings.Add(new JsonObject { ["archiveId"] = file["id"]!.DeepClone(), ["role"] = role, ["localAssetId"] = asset.Id, ["sha256"] = asset.Sha256, ["parentIds"] = file["parentIds"]!.DeepClone() }); if (file["id"]!.ToString() == receiptId) { RequireLocal(bytes.Length <= ProfileLimit + 65536, "REPORT_PROFILE_LIMIT"); historical = JsonNode.Parse(bytes); }
        }
        _recoveryContexts.Add(new JsonObject { ["schema"] = "jindan-recovered-history/1", ["projectId"] = Context.ProjectId, ["readOnlyHistoricalContext"] = true, ["requiresFreshReview"] = true, ["manifest"] = value["manifest"]!.DeepClone(), ["historicalWorkspace"] = historical, ["localCopies"] = mappings, ["reportReady"] = false }); RefreshRecoveredFiles(); RefreshLists(); _bundle = null; _reviewPath = null; _decisions.Clear(); _dirty = true; await SaveAsync(Token);
    }
}
