using System.Text.Json.Nodes;

namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument
{
    private readonly Dictionary<string, JsonObject> _reportMetadata = new(StringComparer.Ordinal);
    private readonly DataGridView _metadataGrid = new() { Dock = DockStyle.Fill, Name = "ReportMetadata", AllowUserToAddRows = false, RowHeadersVisible = false };
    private readonly Button _returnAnalysis = new() { Name = "ReturnToAnalysis", Text = "분석 위치로 돌아가기", AutoSize = true, Visible = false };
    private (string Sha, string Row, int FirstRow, Point RightScroll)? _sourceReturn;
    private bool _bindingMetadata;
    private static readonly (string Key, string Label)[] MetadataFields = [("title", "관리 제목"), ("reportType", "종류(unclassified/comprehensive/discipline/proposal/other)"), ("facility", "시설명"), ("templateGroup", "서식 그룹"), ("notes", "관리 메모"), ("includeInPatterns", "서식 학습목록 포함(true/false)"), ("componentKind", "구성 분류(자유 메모)"), ("chapterNumber", "장 번호(관리용)"), ("relativePath", "등록 폴더 상대경로")];
    private string CurrentDisplayTitle => _current != null && _reportMetadata.TryGetValue(_current.Sha256, out var metadata) && !string.IsNullOrWhiteSpace(metadata["title"]?.ToString()) ? metadata["title"]!.ToString() : _current?.Filename ?? _projectDisplayName;
    private void BuildLibraryTab()
    {
        var tab = new TabPage("보고서 목록 관리") { Name = "ReportLibraryTab" }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true }; foreach (var (name, label, action) in new (string, string, Func<Task>)[] { ("MetadataSave", "관리 정보 저장", SaveMetadataAsync), ("ImportReportFolder", "로컬 폴더 등록", PickReportFolder), ("DownloadSource", "선택 원본 사본", DownloadSource), ("RemoveMaterialLink", "선택 자료 연결 제거", RemoveMaterialLinkAsync) }) AddButton(bar, name, label, () => Run(action));
        _metadataGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "key", HeaderText = "관리 항목", ReadOnly = true, Width = 140 }); _metadataGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "label", HeaderText = "설명", ReadOnly = true, Width = 370 }); _metadataGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "value", HeaderText = "설정값", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill }); _metadataGrid.CellValueChanged += (_, _) => { if (!_bindingMetadata) _dirty = true; }; tab.Controls.Add(_metadataGrid); tab.Controls.Add(bar); tab.Controls.Add(new Label { Dock = DockStyle.Bottom, Height = 40, Text = "관리 정보는 원본 파일을 바꾸지 않습니다. 목록 연결 제거도 원본·자산·이력을 삭제하지 않습니다. Drive 쓰기는 이 로컬 기능에 포함되지 않습니다." }); _tabs.TabPages.Add(tab);
        AddButton(_actions, "SourceLocation", "선택 항목 원문 위치", () => Run(LocateSelectedAsync)); _returnAnalysis.Click += (_, _) => ReturnToAnalysis(); var preview = _tabs.TabPages["PreviewTab"]!; preview.Controls.Add(_returnAnalysis); preview.Resize += (_, _) => { _returnAnalysis.Location = new Point(Math.Max(10, preview.Width - _returnAnalysis.Width - 25), 55); }; _returnAnalysis.Location = new Point(20, 55); _returnAnalysis.BringToFront();
    }
    private void ResetLibrary() { _reportMetadata.Clear(); _metadataGrid.Rows.Clear(); _sourceReturn = null; _returnAnalysis.Visible = false; }
    private void LoadLibraryState(JsonNode value) { foreach (var (key, item) in value["reportMetadata"]?.AsObject() ?? new JsonObject()) if (item is JsonObject metadata) _reportMetadata[key] = (JsonObject)metadata.DeepClone(); }
    private void SaveLibraryState(JsonObject value) { if (_current != null && _metadataGrid.Rows.Count > 0) ReadMetadataEditor(); value["reportMetadata"] = System.Text.Json.JsonSerializer.SerializeToNode(_reportMetadata); }
    private void SelectLibrarySource()
    {
        _sourceReturn = null; _returnAnalysis.Visible = false; _bindingMetadata = true; _metadataGrid.Rows.Clear(); if (_current != null) { var metadata = (JsonObject)(_reportMetadata.GetValueOrDefault(_current.Sha256)?.DeepClone() ?? new JsonObject()); metadata["title"] ??= _current.Filename; metadata["reportType"] ??= "unclassified"; metadata["includeInPatterns"] ??= true; foreach (var (key, label) in MetadataFields) { var index = _metadataGrid.Rows.Add(key, label, metadata[key]?.ToString() ?? ""); if (key == "relativePath") _metadataGrid.Rows[index].Cells["value"].ReadOnly = true; } }
        _bindingMetadata = false;
    }
    private void ReadMetadataEditor()
    {
        if (_current == null) return; _metadataGrid.EndEdit(); var metadata = new JsonObject(); foreach (DataGridViewRow row in _metadataGrid.Rows) { var key = Convert.ToString(row.Cells["key"].Value)!; var value = Convert.ToString(row.Cells["value"].Value) ?? ""; if (value.Length > (key == "notes" ? 10000 : 300)) throw new InvalidDataException(); if (key == "reportType" && value is not ("unclassified" or "comprehensive" or "discipline" or "proposal" or "other")) throw new InvalidDataException(); if (key == "includeInPatterns") metadata[key] = bool.Parse(value); else metadata[key] = value; }
        metadata["updatedAt"] = DateTimeOffset.UtcNow.ToString("O"); _reportMetadata[_current.Sha256] = metadata;
    }
    public async Task SaveMetadataAsync() { ReadMetadataEditor(); await SaveAsync(Token); TitleChanged?.Invoke(this, EventArgs.Empty); Status("원본 SHA에 연결한 목록 관리 정보를 저장했습니다. 원문 내용·서식은 변경하지 않았습니다."); }
    private async Task PickReportFolder() { using var dialog = new FolderBrowserDialog { Description = "기존 보고서 폴더(최대 50개)" }; if (dialog.ShowDialog(this) == DialogResult.OK) await ImportReportFolderAsync(dialog.SelectedPath); }
    public async Task ImportReportFolderAsync(string root)
    {
        var directory = Path.GetFullPath(root); if (!Directory.Exists(directory) || File.GetAttributes(directory).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidDataException(); var files = Directory.EnumerateFiles(directory, "*", new EnumerationOptions { RecurseSubdirectories = true, AttributesToSkip = FileAttributes.ReparsePoint, IgnoreInaccessible = false }).Where(path => Path.GetExtension(path).ToLowerInvariant() is ".pdf" or ".hwpx" or ".hwp").Take(51).ToArray(); if (files.Length > 50) throw new InvalidDataException();
        foreach (var file in files) { var relative = Path.GetRelativePath(directory, file); if (relative.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(relative) || new FileInfo(file).Length > 160L * 1024 * 1024) throw new InvalidDataException(); await ImportSourceAsync(file); var metadata = _reportMetadata.GetValueOrDefault(_current!.Sha256) ?? new JsonObject { ["title"] = _current.Filename, ["reportType"] = "unclassified", ["includeInPatterns"] = true }; metadata["relativePath"] = relative; _reportMetadata[_current.Sha256] = metadata; SelectLibrarySource(); }
        await SaveAsync(Token);
    }
    private async Task DownloadSource() { if (_current == null) throw new InvalidOperationException(); using var dialog = new SaveFileDialog { FileName = _current.Filename }; if (dialog.ShowDialog(this) == DialogResult.OK) await ExportSourceToAsync(dialog.FileName); }
    public async Task ExportSourceToAsync(string destination) { ExportDestination(destination); if (_current == null) throw new InvalidOperationException(); var source = await ResolveScopedAsset(_current.Id, _current.Path, _current.Sha256, Token); RequireLocal(new FileInfo(source.StoredPath).Length is > 0 and <= 160L * 1024 * 1024, "EXPORT_SOURCE_CHANGED"); var bytes = await File.ReadAllBytesAsync(source.StoredPath, Token); RequireLocal(Hash(bytes) == source.Sha256, "EXPORT_SOURCE_CHANGED"); await ExportNewBytes(destination, bytes, Token); }
    private async Task RemoveMaterialLinkAsync()
    {
        if (_evidence.SelectedItem is not EvidenceItem material) throw new InvalidOperationException(); var state = new JsonObject { ["decisions"] = System.Text.Json.JsonSerializer.SerializeToNode(_decisions), ["formatSpecs"] = System.Text.Json.JsonSerializer.SerializeToNode(_formatSpecs) }; SaveSpecializedState(state); if (state.ToJsonString().Contains(System.Text.Json.JsonSerializer.Serialize(material.Id), StringComparison.Ordinal)) throw new InvalidOperationException(); _materials.Remove(material); _reviewPath = null; _dirty = true; RefreshEvidence(); await SaveAsync(Token); Status("사용 중이 아닌 자료의 목록 연결만 제거했습니다. 원본 자산·이력은 보존됩니다.");
    }
    public async Task LocateSelectedAsync()
    {
        if (_current == null || _bundle == null || _rows.SelectedRows.Count == 0 || _rows.SelectedRows[0].Tag is not JsonNode row) throw new InvalidOperationException(); var id = row["id"]!.GetValue<string>(); var result = await Execute(Command("locate") with { Parameters = new() { ["filename"] = _current.Filename, ["rowId"] = id } }); if (result["sourceSha256"]?.ToString() != _current.Sha256) throw new InvalidDataException(); var pages = result["pages"]!.AsArray().Select(item => item!.GetValue<int>()).ToArray(); if (pages.Length == 0 || pages[0] < 1) throw new InvalidDataException(); _sourceReturn = (_current.Sha256, id, _rows.FirstDisplayedScrollingRowIndex, new Point(Math.Abs(_propertyPanel.AutoScrollPosition.X), Math.Abs(_propertyPanel.AutoScrollPosition.Y))); _pageNumber.Maximum = Math.Max(_pageNumber.Maximum, pages[0]); _pageNumber.Value = pages[0]; await PreviewAsync(); _returnAnalysis.Visible = true; _returnAnalysis.BringToFront(); Status("원문 위치 근거: " + result["method"] + " · 쪽 후보 " + string.Join(", ", pages) + (pages.Length > 1 ? " · 동일 문구가 여러 쪽에 있어 첫 후보를 표시합니다." : "") + " · 독립 렌더러이며 실제 한글 배치 승인이 아닙니다.");
    }
    public void ReturnToAnalysis() { if (_sourceReturn is not { } position || _current?.Sha256 != position.Sha) return; _tabs.SelectedTab = _tabs.TabPages["AnalysisTab"]; _rows.ClearSelection(); foreach (DataGridViewRow row in _rows.Rows) if ((row.Tag as JsonNode)?["id"]?.ToString() == position.Row) { row.Selected = true; _rows.CurrentCell = row.Cells[0]; break; } if (position.FirstRow >= 0 && position.FirstRow < _rows.Rows.Count) _rows.FirstDisplayedScrollingRowIndex = position.FirstRow; _propertyPanel.AutoScrollPosition = position.RightScroll; _returnAnalysis.Visible = false; _sourceReturn = null; }
    private void UpdateReportActions()
    {
        var format = _bundle?["material"]?["format"]?.ToString(); void Enable(string name, bool enabled) { var button = _actions.Controls.Find(name, true).OfType<Button>().FirstOrDefault(); if (button != null) button.Enabled = enabled; }
        Enable("AnalyzeReport", _current != null); Enable("ShowPreview", _current != null); Enable("ImportReport", _profileWritable); Enable("PairReference", _profileWritable && format == "pdf"); Enable("SelectChapterRestore", _profileWritable && format == "pdf" && _chapters.SelectedItem is ChapterItem); Enable("PrepareDraft", _profileWritable && _bundle != null); Enable("SaveReview", _profileWritable && _bundle != null); Enable("SaveReportState", _profileWritable); Enable("SourceLocation", _bundle != null && _rows.SelectedRows.Count > 0); foreach (var name in new[] { "BlankDraft", "CurrentDraft", "ExportCollection", "ImportCollection" }) Enable(name, _profileWritable && format == "hwpx" && _reviewPath != null); Enable("ExportArtifact", _artifacts.Count > 0); foreach (var control in new Control[] { _role, _decision, _retention, _clear }) control.Enabled = _profileWritable; _reviewText.ReadOnly = !_profileWritable; _retentionNote.ReadOnly = !_profileWritable;
    }
}
