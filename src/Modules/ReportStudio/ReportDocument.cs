using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Encodings.Web;
using Jindan.Contracts;
using Jindan.Desktop.Contracts;

namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument : UserControl, IWorkspaceDocument, ISourceDocument
{
    private static readonly JsonSerializerOptions DisplayJson = new() { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static readonly Dictionary<string, string> Labels = new() { ["label"] = "고정 문구", ["measurement"] = "측정 자료", ["diagnosis"] = "진단 내용", ["improvement"] = "개선 대책", ["management"] = "관리 요점", ["context"] = "현황 설명", ["heading"] = "제목·캡션", ["pending"] = "검토 전", ["keep"] = "유지", ["replace"] = "교체", ["rewrite"] = "재작성", ["exclude"] = "제외", ["static-label"] = "고정 라벨", ["fixed-asset"] = "고정 그림", ["historical-comparison"] = "명시적 전회 비교", ["current-reverified"] = "금회 근거로 재확인", ["blank"] = "금회 빈칸", ["current"] = "금회 근거", ["all"] = "전체", ["tables"] = "표", ["pictures"] = "그림", ["data"] = "교체 자료" };
    private readonly IWorkspaceServices _services;
    private readonly ListBox _reports = new() { Dock = DockStyle.Fill, Name = "ReportList", DisplayMember = "Filename", BindingContext = new BindingContext() };
    private readonly ListBox _chapters = new() { Dock = DockStyle.Fill, Name = "ChapterList", DisplayMember = "Title" };
    private readonly DataGridView _rows = new() { Dock = DockStyle.Fill, Name = "ReviewRows", AutoGenerateColumns = false, AllowUserToAddRows = false, RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = true };
    private readonly RichTextBox _summary = new() { Dock = DockStyle.Fill, ReadOnly = true, Name = "AnalysisSummary", WordWrap = true };
    private readonly RichTextBox _properties = new() { Dock = DockStyle.Fill, ReadOnly = true, Name = "SourceProperties", WordWrap = true };
    private readonly TextBox _status = new() { Dock = DockStyle.Bottom, ReadOnly = true, Name = "ReportStatus", Multiline = true, Height = 58 };
    private readonly TextBox _reviewText = new() { Multiline = true, Height = 90, Dock = DockStyle.Top, Name = "DraftText" };
    private readonly ComboBox _role = new() { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Name = "ContentRole" };
    private readonly ComboBox _decision = new() { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Name = "ReviewDecision" };
    private readonly ComboBox _retention = new() { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Name = "RetentionPurpose" };
    private readonly CheckBox _clear = new() { Text = "입력값을 명시적으로 비우기", Dock = DockStyle.Top, Name = "ClearValue", AutoSize = true };
    private readonly TextBox _retentionNote = new() { Dock = DockStyle.Top, Multiline = true, Height = 55, Name = "RetentionNote", PlaceholderText = "과거 비교 시점·유지 목적·재확인 근거" };
    private readonly ComboBox _mode = new() { DropDownStyle = ComboBoxStyle.DropDownList, Name = "DraftMode", Width = 110 };
    private readonly ComboBox _viewFilter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Name = "InventoryFilter", Width = 110 };
    private readonly CheckedListBox _evidence = new() { Dock = DockStyle.Top, Height = 110, Name = "EvidenceList", DisplayMember = "DisplayLabel" };
    private readonly FlowLayoutPanel _actions = new() { Dock = DockStyle.Top, AutoSize = true, WrapContents = true, Name = "ReportCommands" };
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill, Name = "DocumentTabs" };
    private readonly PictureBox _pageImage = new() { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, Name = "NativeDocumentPage", BackColor = Color.White };
    private readonly NumericUpDown _pageNumber = new() { Minimum = 1, Maximum = 1000, Value = 1, Width = 75, Name = "PreviewPageNumber" };
    private readonly Label _previewLabel = new() { AutoSize = true, Name = "PreviewSourceLabel" };
    private int _previewPageCount = 1;
    private readonly Panel _navigation = new() { Dock = DockStyle.Fill, Name = "ReportNavigation" };
    private readonly Panel _propertyPanel = new() { Dock = DockStyle.Fill, Name = "ReportInspector", AutoScroll = true };
    private readonly List<ReportItem> _items = [];
    private readonly List<EvidenceItem> _materials = [];
    private readonly List<ArtifactItem> _artifacts = [];
    private readonly Dictionary<string, JsonObject> _decisions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, JsonObject> _savedReviews = new(StringComparer.Ordinal);
    private JsonNode? _bundle;
    private JsonNode? _returned;
    private string? _reviewPath;
    private string? _returnedFile;
    private string? _returnedReviewSha;
    private string _projectRoot = "";
    private CancellationTokenSource? _running;
    private bool _loading, _dirty, _binding;
    private bool _contextInitialized;
    private Task _ready = Task.CompletedTask;
    private long _generation;
    private long _loadVersion;
    private ReportItem? _current;
    private string _projectDisplayName = "프로젝트 선택";
    public string Title => "보고서 스튜디오 · " + CurrentDisplayTitle;
    public DocumentContext Context { get; private set; }
    public Control View => this;
    public Control NavigationPanel => _navigation;
    public Control PropertiesPanel => _propertyPanel;
    public bool IsDirty => _dirty;
    public Task Ready => _ready;
    public string? AnalysisJson => _bundle?.ToJsonString();
    public int ReportCount => _items.Count;
    public string MaterialSnapshotJson => JsonSerializer.Serialize(_materials);
    public event EventHandler? TitleChanged;
    public event EventHandler? SelectionChanged;
    private sealed record ReportItem(string Id, string Filename, string Path, string Sha256);
    private sealed record EvidenceItem(string Id, string Filename, string Path, string Sha256, string Role = "current") { public string DisplayLabel => (Role == "historical" ? "[전회 역사자료] " : "") + Filename; }
    private sealed record ArtifactItem(string Operation, string Path, string Sha256, long Size, string SourceSha256);
    private sealed record ChapterItem(string Id, string Title);
    private static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

    public ReportDocument(IWorkspaceServices services, DocumentContext context)
    {
        _services = services; Context = context; Dock = DockStyle.Fill; Name = "ReportStudioDocument"; Font = new Font("Malgun Gothic", 9);
        var split = new SplitContainer { Size = new Size(800, 600), Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 160, Name = "AnalysisSplit" }; split.Panel1.Controls.Add(_summary); split.Panel2.Controls.Add(_rows);
        var previewTab = new TabPage("미리보기") { Name = "PreviewTab" }; var analysisTab = new TabPage("분석보기") { Name = "AnalysisTab" }; analysisTab.Controls.Add(split); previewTab.Controls.Add(_pageImage);
        var pageBar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Name = "PreviewNavigation" }; AddButton(pageBar, "PreviewPrevious", "이전 쪽", () => { if (_pageNumber.Value > 1) { _pageNumber.Value--; Run(PreviewAsync); } }); pageBar.Controls.Add(_pageNumber); AddButton(pageBar, "PreviewGo", "쪽 보기", () => Run(PreviewAsync)); AddButton(pageBar, "PreviewNext", "다음 쪽", () => { if (_pageNumber.Value < _previewPageCount) { _pageNumber.Value++; Run(PreviewAsync); } }); pageBar.Controls.Add(_previewLabel); previewTab.Controls.Add(pageBar);
        _tabs.TabPages.AddRange([previewTab, analysisTab]); Controls.Add(_tabs); Controls.Add(_actions); Controls.Add(_status);
        foreach (var (name, label, action) in new (string, string, Func<Task>)[]{
            ("ImportReport","전회 보고서 등록",PickReport),("ShowPreview","미리보기",PreviewAsync),("AnalyzeReport","분석",AnalyzeAsync),("PairReference","원본 HWPX 서식 대조",PickReference),("SelectChapterRestore","선택 장 한글화",RestoreAsync),
            ("RestoreReview","이전 결정 재검토 불러오기",RestoreSavedReview),("SaveReview","검토 저장·새 문맥 확인",AcknowledgeAsync),("PrepareDraft","초안 준비 검사",PrepareAsync),("BlankDraft","금회 빈 초안",()=>WriteDraftAsync("blank")),("CurrentDraft","근거 기반 초안",()=>WriteDraftAsync("current")),
            ("ExportCollection","빈 조사양식",ExportCollectionAsync),("ImportCollection","작성양식 반환",ImportCollectionAsync),("ApplyCollection","반환값 검토에 연결",ApplyReturnedAsync),
            ("ImportEvidence","금회 자료 등록",PickEvidence),("InspectMaterial","선택 자료 검사",InspectEvidenceAsync),("ExportRecovery","회수 아카이브",ExportRecoveryAsync),("ImportRecovery","아카이브 회수",RecoverAsync),
            ("ExportArtifact","산출물 내려받기",ExportArtifactAsync),("SaveReportState","작업 저장",()=>SaveAsync())}) AddButton(_actions, name, label, () => Run(action));
        AddButton(_actions, "CancelReport", "작업 취소", () => _running?.Cancel());
        _mode.Items.AddRange(["blank", "current"]); _mode.SelectedIndex = 0; _mode.SelectedIndexChanged += (_, _) => _reviewPath = null; _actions.Controls.Add(_mode);
        _viewFilter.Items.AddRange(["all", "tables", "pictures", "data"]); _viewFilter.SelectedIndex = 0; _viewFilter.SelectedIndexChanged += (_, _) => FillRows(); _actions.Controls.Add(_viewFilter);
        foreach (var combo in new[] { _role, _decision, _retention, _mode, _viewFilter }) { combo.FormattingEnabled = true; combo.Format += (_, eventArgs) => { if (eventArgs.ListItem is string key && Labels.TryGetValue(key, out var label)) eventArgs.Value = label; }; }
        _rows.Columns.Add(new DataGridViewTextBoxColumn { Name = "id", HeaderText = "원문 위치", Width = 150, ReadOnly = true });
        _rows.Columns.Add(new DataGridViewTextBoxColumn { Name = "chapter", HeaderText = "장", Width = 140, ReadOnly = true });
        _rows.Columns.Add(new DataGridViewTextBoxColumn { Name = "text", HeaderText = "원문 내용", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, ReadOnly = true });
        _rows.Columns.Add(new DataGridViewTextBoxColumn { Name = "role", HeaderText = "내용 역할", Width = 100, ReadOnly = true });
        _rows.Columns.Add(new DataGridViewTextBoxColumn { Name = "decision", HeaderText = "검토 결정", Width = 100, ReadOnly = true });
        _rows.SelectionChanged += (_, _) => ShowSelection();
        _rows.CellFormatting += (_, eventArgs) => { if (eventArgs.ColumnIndex >= 3 && eventArgs.Value is string key && Labels.TryGetValue(key, out var label)) eventArgs.Value = label; };
        var leftSplit = new SplitContainer { Size = new Size(250, 600), Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 240 }; leftSplit.Panel1.Controls.Add(_reports); leftSplit.Panel2.Controls.Add(_chapters); _navigation.Controls.Add(leftSplit);
        var leftHeading = new Label { Text = "현재 프로젝트 전회 보고서 / 장", Dock = DockStyle.Top, Height = 30 }; _navigation.Controls.Add(leftHeading);
        var leftButtons = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true }; AddButton(leftButtons, "RemoveReportLink", "선택 보고서 연결 제거", RemoveReport); _navigation.Controls.Add(leftButtons);
        _reports.SelectedIndexChanged += (_, _) => SelectReport(); _chapters.SelectedIndexChanged += (_, _) => { FillRows(); SelectionChanged?.Invoke(this, EventArgs.Empty); };
        _role.Items.AddRange(["label", "measurement", "diagnosis", "improvement", "management", "context", "heading"]); _decision.Items.AddRange(["pending", "keep", "replace", "rewrite", "exclude"]); _retention.Items.AddRange(["", "static-label", "fixed-asset", "historical-comparison", "current-reverified"]);
        var rightButtons = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true }; AddButton(rightButtons, "ApplyReviewRow", "선택 항목 결정 적용", ApplySelectedDecision);
        _propertyPanel.Controls.Add(_properties); _propertyPanel.Controls.Add(rightButtons); _propertyPanel.Controls.Add(_reviewText); _propertyPanel.Controls.Add(_retentionNote); _propertyPanel.Controls.Add(_clear); _propertyPanel.Controls.Add(_retention); _propertyPanel.Controls.Add(_decision); _propertyPanel.Controls.Add(_role); _propertyPanel.Controls.Add(_evidence);
        _propertyPanel.Controls.Add(new Label { Text = "자료 근거 / 역할 / 결정 / 유지 목적 / 새 문구", Dock = DockStyle.Top, Height = 42 });
        BuildSpecializedTabs(); BuildFormattingTab(); BuildLibraryTab(); BuildMaterialsTab(); BuildLegacyArchiveTab(); BuildRecoveryTab(); SetContext(context);
    }
    private static void AddButton(FlowLayoutPanel panel, string name, string label, Action action) { var button = new Button { Name = name, Text = label, AutoSize = true, Margin = new Padding(3) }; button.Click += (_, _) => action(); panel.Controls.Add(button); }
    public void SetContext(DocumentContext context)
    {
        if (_contextInitialized) { RequireLocal(context.ContextId == Context.ContextId, "REPORT_CONTEXT_ID_CHANGED"); RequireLocal(!_dirty && !_disciplineEditorDirty, "REPORT_UNSAVED_CONTEXT"); }
        _contextInitialized = true;
        _projectDisplayName = context.ProjectId is null ? "프로젝트 선택" : "선택한 프로젝트";
        _running?.Cancel(); _services.Reports.Invalidate(Context.ContextId); Context = context; _generation++; _bundle = null; _returned = null; _reviewPath = null; _decisions.Clear(); _savedReviews.Clear(); _items.Clear(); _materials.Clear(); _artifacts.Clear(); _current = null; ResetSpecialized(); ResetFormatting(); ResetLibrary(); ResetMaterials(); ResetLegacy(); ResetRecovery();
        _profileExpectedSha = null; _profileLoaded = false; _profileWritable = false; _lastSavedProfileBytes = null; var scope = Hash(Encoding.UTF8.GetBytes(context.UserId + "\0" + context.ProjectId)); _projectRoot = Path.Combine(_services.DataRoot, "report-workspaces", scope); CheckStoreRoot();
        _ready = LoadAsync(_generation, ++_loadVersion); TitleChanged?.Invoke(this, EventArgs.Empty);
    }
    private async Task LoadAsync(long generation, long loadVersion)
    {
        _loading = true; try
        {
            await AuthorizeProfile(false, CancellationToken.None);
            var projectRows = await _services.Data.ListAsync(_services.Actor, new("projects"));
            if (generation != _generation || loadVersion != _loadVersion) return;
            _projectDisplayName = projectRows.FirstOrDefault(project => project.Id == Context.ProjectId)?.Fields.GetValueOrDefault("title", "선택한 프로젝트") ?? "프로젝트 선택";
            var writable = await CanWriteProfile(CancellationToken.None); if (generation != _generation || loadVersion != _loadVersion) return; _profileWritable = writable; CheckStoreRoot(); if (writable) Directory.CreateDirectory(_projectRoot); var path = Path.Combine(_projectRoot, "workspace.json"); var bytes = ReadProfileBytes(path); if (bytes != null)
            {
                var value = JsonNode.Parse(bytes)!; if (generation != _generation) return;
                if (value["schema"]?.GetValue<int>() != 1 || value["userId"]?.GetValue<string>() != Context.UserId || value["projectId"]?.GetValue<string>() != Context.ProjectId) throw new InvalidDataException();
                foreach (var item in value["reports"]?.AsArray() ?? []) _items.Add(item!.Deserialize<ReportItem>()!);
                foreach (var item in value["materials"]?.AsArray() ?? []) _materials.Add(item!.Deserialize<EvidenceItem>()!);
                foreach (var item in value["artifacts"]?.AsArray() ?? []) _artifacts.Add(item!.Deserialize<ArtifactItem>()!);
                foreach (var item in value["savedReviews"]?.AsObject() ?? new JsonObject()) if (item.Value is JsonObject review) _savedReviews[item.Key] = (JsonObject)review.DeepClone();
                LoadSpecializedState(value);
                LoadFormattingState(value); LoadLibraryState(value); LoadLegacyState(value); LoadRecoveryState(value);
            }
            RefreshLists(); _profileExpectedSha = bytes == null ? null : Hash(bytes); _lastSavedProfileBytes = bytes?.ToArray(); _profileLoaded = true; _metadataGrid.ReadOnly = !writable; _dirty = false; Status("저장된 목록을 회수했습니다. 초안 생성 전 정확한 원본을 새로 분석·검토하세요. reportReady=false");
        }
        catch { if (loadVersion == _loadVersion) Status("작업 목록을 읽지 못했습니다. 기존 파일은 보존했습니다."); }
        finally { if (loadVersion == _loadVersion) _loading = false; }
    }
    private void RefreshLists() { _binding = true; _reports.DataSource = null; _reports.DataSource = _items.ToList(); _reports.DisplayMember = nameof(ReportItem.Filename); _evidence.Items.Clear(); foreach (var item in _materials) _evidence.Items.Add(item); if (_reports.Items.Count > 0) _reports.SelectedIndex = 0; _binding = false; SelectReport(false); }
    private void SelectReport(bool cancelCurrent = true)
    {
        if (_binding) return; if (cancelCurrent) _running?.Cancel(); _services.Reports.Invalidate(Context.ContextId); _generation++; _current = _reports.SelectedItem as ReportItem; _bundle = null; _returned = null; _reviewPath = null; _decisions.Clear(); _chapters.Items.Clear(); _rows.Rows.Clear(); _pageNumber.Value = 1; _previewPageCount = 1; _pageImage.Image?.Dispose(); _pageImage.Image = null; _previewLabel.Text = "선택 원본 직접 미리보기 · 독립 렌더러 / 한글 실물 미승인"; _summary.Text = _current == null ? "프로젝트의 전회 보고서를 등록하세요." : $"{_current.Filename}\nSHA-256: {_current.Sha256}\n분석 전입니다. 실물 한글 승인은 별도 검증입니다."; SelectSpecializedSource(); SelectFormattingSource(); SelectLibrarySource(); UpdateReportActions(); TitleChanged?.Invoke(this, EventArgs.Empty); SelectionChanged?.Invoke(this, EventArgs.Empty);
    }
    private void Status(string text) => _status.Text = text;
    private async void Run(Func<Task> action)
    {
        if (_loading) { Status("작업 목록을 읽는 중입니다."); return; }
        if (_running != null) { Status("진행 중인 작업을 취소하거나 완료 후 다시 실행하세요."); return; }
        using var cancellation = new CancellationTokenSource(); _running = cancellation; var generation = _generation;
        try { await action(); } catch (OperationCanceledException) { if (generation == _generation) Status("작업을 취소했습니다. 취소된 산출물은 게시하지 않습니다."); } catch (ReportWorkspaceException error) { if (generation == _generation) Status("작업 보류: " + error.Code + " · 기존 파일과 현재 작업은 보존됩니다. 저장 충돌이면 새 문서에서 최신 상태를 열어 재검토하세요."); } catch { if (generation == _generation && !_status.Text.StartsWith("작업 보류", StringComparison.Ordinal)) Status("작업을 완료하지 못했습니다. 원본·검토·근거 연결을 확인하세요."); } finally { if (ReferenceEquals(_running, cancellation)) _running = null; }
    }
    private CancellationToken Token => _running?.Token ?? CancellationToken.None;
    private async Task PickReport() { using var dialog = new OpenFileDialog { Filter = "기존 보고서|*.hwpx;*.hwp;*.pdf", Multiselect = true }; if (dialog.ShowDialog(this) != DialogResult.OK) return; foreach (var file in dialog.FileNames) await ImportSourceAsync(file); }
    public async Task ImportSourceAsync(string path)
    {
        if (Context.ProjectId == null) throw new InvalidOperationException(); await AuthorizeProfile(false, Token); RequireLocal(_services is IReportWorkspaceAccess, "REPORT_AUTHORIZATION_UNAVAILABLE"); var asset = await ((IReportWorkspaceAccess)_services).ResolveExistingReportAssetAsync(Context, path, Token); var canWrite = await CanWriteProfile(Token); var filename = asset?.OriginalName ?? Path.GetFileName(path); var extension = Path.GetExtension(filename).ToLowerInvariant(); if (extension is not (".hwpx" or ".hwp" or ".pdf")) throw new InvalidDataException(); if (asset == null) { RequireLocal(canWrite, "VIEWER_NEW_ASSET_IMPORT_DENIED"); asset = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId, path, Token); }
        if (_items.All(item => item.Sha256 != asset.Sha256)) _items.Add(new ReportItem(asset.Id, filename, asset.StoredPath, asset.Sha256)); _dirty = canWrite; RefreshLists(); _binding = true; _reports.SelectedIndex = _items.FindIndex(item => item.Sha256 == asset.Sha256); _binding = false; SelectReport(false); if (canWrite) await SaveAsync(Token);
    }
    public Task OpenSourceAsync(string path) => ImportSourceAsync(path);
    public async Task PreviewAsync()
    {
        var page = (int)_pageNumber.Value; var value = await Execute(Command("preview") with { Parameters = new() { ["filename"] = _current!.Filename, ["page"] = page.ToString(), ["scale"] = "1.5" } }); if (value["sourceSha256"]?.GetValue<string>() != _current.Sha256) throw new InvalidDataException();
        var descriptor = value["pngBytes"]!["$workerFile"]!; var bytes = await File.ReadAllBytesAsync(descriptor["path"]!.GetValue<string>(), Token); if (Hash(bytes) != descriptor["sha256"]!.GetValue<string>()) throw new InvalidDataException(); using var stream = new MemoryStream(bytes); using var image = Image.FromStream(stream); var bitmap = new Bitmap(image); _pageImage.Image?.Dispose(); _pageImage.Image = bitmap; _previewPageCount = value["pageCount"]!.GetValue<int>(); _pageNumber.Maximum = _previewPageCount; _previewLabel.Text = $"{page} / {_previewPageCount} · {value["engine"]} · SHA {_current.Sha256[..12]} · 한글 실물 미승인"; _tabs.SelectedIndex = 0; Status("선택 원본 파일 바이트를 직접 표시합니다. PDF 연결본으로 대체하지 않습니다. 독립 렌더러이며 실제 한글 조판 승인은 별도입니다.");
    }
    private ReportCommand Command(string operation, string? reviewPath = null, string? filled = null) => _current != null ? new(operation, Context.ProjectId!, _current.Path, _current.Sha256, ContextPath: reviewPath, FilledPath: filled, Parameters: new() { ["filename"] = _current.Filename }, Evidence: _materials.Select(item => new ReportEvidence(item.Id, item.Path, item.Sha256)).ToArray()) : throw new InvalidOperationException();
    private async Task<JsonNode> Execute(ReportCommand command)
    {
        if (command.Operation != "recover")
        {
            var selected = _items.Select(item => (item.Id, item.Path, item.Sha256)).Concat(_materials.Select(item => (item.Id, item.Path, item.Sha256))).FirstOrDefault(item => item.Path == command.SourcePath && item.Sha256 == command.SourceSha256);
            if (selected.Id == null) throw new InvalidDataException(); await ResolveScopedAsset(selected.Id, command.SourcePath, command.SourceSha256, Token);
            foreach (var material in _materials) await ResolveScopedAsset(material.Id, material.Path, material.Sha256, Token);
            if (command.Operation == "createRecovery") foreach (var report in _items) await ResolveScopedAsset(report.Id, report.Path, report.Sha256, Token);
        }
        var generation = _generation; var reply = await _services.Reports.ExecuteAsync(Context, command, new Progress<ReportProgress>(p => { if (generation == _generation && !IsDisposed) Status($"{p.Stage} {p.Current}/{p.Total}"); }), Token); Token.ThrowIfCancellationRequested(); if (generation != _generation) throw new OperationCanceledException();
        if (!reply.Ok) { Status("작업 보류: " + reply.ErrorCode + " · reportReady=false"); throw new InvalidDataException(); }
        var value = JsonNode.Parse(await File.ReadAllTextAsync(reply.ResultJsonPath!, Token))!;
        foreach (var artifact in reply.Artifacts.Where(a => a.MediaType == "application/octet-stream" && command.Operation is "writeDraft" or "restore" or "exportCollection" or "createRecovery" or "exportArtifact" or "specification")) _artifacts.Add(new ArtifactItem(command.Operation, artifact.Path, artifact.Sha256, artifact.Size, command.SourceSha256));
        if (command.Operation is not ("preview" or "inspectMaterial" or "locate")) _dirty = _profileWritable; return value["value"]!;
    }
    public async Task AnalyzeAsync()
    {
        _decisions.Clear(); _reviewPath = null; _bundle = await Execute(Command("analyze")); PopulateAnalysis();
        _summary.Text = Summary(_bundle); FillRows(); _tabs.SelectedIndex = 1; Status("분석 후보입니다. 원문 위치·내용 역할·보존/교체·근거를 검토하세요. 분석은 사람 승인이나 실물 재현 승인이 아닙니다."); await SaveReadStateIfWritable();
    }
    private void PopulateAnalysis() { _chapters.Items.Clear(); foreach (var chapter in _bundle!["analysis"]!["chapters"]!.AsArray()) _chapters.Items.Add(new ChapterItem(chapter!["id"]!.GetValue<string>(), chapter["title"]!.GetValue<string>())); }
    private async Task PickReference() { using var dialog = new OpenFileDialog { Filter = "같은 보고서의 원본 HWPX|*.hwpx" }; if (dialog.ShowDialog(this) == DialogResult.OK) await PairReferenceAsync(dialog.FileName); }
    public async Task PairReferenceAsync(string path)
    {
        if (_current == null || _bundle == null || _bundle["material"]?["format"]?.GetValue<string>() != "pdf" || Path.GetExtension(path).ToLowerInvariant() != ".hwpx") throw new InvalidOperationException();
        var current = _current; var generation = _generation; var reference = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId!, path, Token); var owned = await _services.Assets.GetAsync(_services.Actor, reference.Id, Token); if (owned.StoredPath != reference.StoredPath || owned.Sha256 != reference.Sha256) throw new InvalidDataException();
        var referenceContext = Context with { ContextId = "pair-reference-" + Guid.NewGuid().ToString("N") };
        try
        {
            var analyzed = await _services.Reports.ExecuteAsync(referenceContext, new ReportCommand("analyze", Context.ProjectId!, reference.StoredPath, reference.Sha256, Parameters: new() { ["filename"] = Path.GetFileName(path) }), ct: Token); if (!analyzed.Ok) throw new InvalidDataException();
            var referenceBundle = JsonNode.Parse(await File.ReadAllTextAsync(analyzed.ResultJsonPath!, Token))!["value"]!; if (referenceBundle["material"]?["sha256"]?.GetValue<string>() != reference.Sha256) throw new InvalidDataException();
            var bundlePath = Path.Combine(_projectRoot, "reference-bundle-" + Guid.NewGuid().ToString("N") + ".json"); await Atomic(bundlePath, referenceBundle.ToJsonString(), Token); if (generation != _generation || _current != current) throw new OperationCanceledException();
            var paired = await Execute(Command("pairReference") with { Parameters = new() { ["filename"] = current.Filename, ["referenceSourcePath"] = reference.StoredPath, ["referenceBundlePath"] = bundlePath } }); if (paired["material"]?["sha256"]?.GetValue<string>() != current.Sha256) throw new InvalidDataException();
            _bundle = paired; _decisions.Clear(); _reviewPath = null; PopulateAnalysis(); FillRows(); _summary.Text = "원본 HWPX 결합의 서식 학습 후보 · 원본 대응/정적 참조는 실물 글꼴·배치 승인과 다름\n" + Summary(paired) + "\n" + paired["pdf"]?["pairedLearning"]?.ToJsonString(DisplayJson); _tabs.SelectedIndex = 1;
            if (_items.All(item => item.Sha256 != reference.Sha256)) _items.Add(new ReportItem(reference.Id, Path.GetFileName(path), reference.StoredPath, reference.Sha256)); _binding = true; _reports.DataSource = null; _reports.DataSource = _items.ToList(); _reports.DisplayMember = nameof(ReportItem.Filename); _reports.SelectedIndex = _items.FindIndex(item => item.Sha256 == current.Sha256); _binding = false; await SaveAsync(Token); Status("실제 PDF와 원본 HWPX를 결합한 분석 후보입니다. 검토는 초기화했으며 복원 후보의 실제 배치·글꼴은 별도 검증해야 합니다.");
        }
        finally { _services.Reports.Invalidate(referenceContext.ContextId); }
    }
    private static string Summary(JsonNode bundle)
    {
        var analysis = bundle["analysis"]!; var text = new StringBuilder("분석 요약 · 원본 조판 미리보기가 아님\n"); text.AppendLine($"SHA {bundle["material"]?["sha256"]}\n프로젝트 {bundle["projectId"]}\n분석 목적 {analysis["purpose"]}");
        var countLabels = new Dictionary<string, string> { { "chapterTitles", "장 제목" }, { "bodyPages", "본문 쪽" }, { "bodyParagraphs", "본문 문단" }, { "tables", "표" }, { "pictures", "그림" }, { "headers", "머리말" }, { "footers", "꼬리말" }, { "subheadings", "소제목" }, { "tableCaptions", "표 캡션" }, { "blankPages", "빈 쪽" }, { "dividerPages", "구분 쪽" }, { "imageTextRegions", "그림 본문" }, { "totalPages", "전체 쪽" } };
        foreach (var chapter in analysis["chapters"]!.AsArray()) { text.AppendLine($"{chapter!["title"]} · 쪽 {string.Join(", ", chapter["pages"]?.AsArray().Select(p => p?.ToString()) ?? [])}"); if (chapter["counts"] is JsonObject counts) text.AppendLine(string.Join(" · ", counts.Select(item => (countLabels.GetValueOrDefault(item.Key) ?? item.Key) + " " + (item.Value?.ToString() ?? "미확인")))); text.AppendLine("글꼴: " + string.Join(", ", chapter["fonts"]?.AsArray().Select(item => item?.ToString()) ?? [])); }
        text.AppendLine("머리말/꼬리말: " + analysis["furniture"]?.AsArray().Count + " · 표: " + analysis["tables"]?.AsArray().Count + " · 그림: " + analysis["pictures"]?.AsArray().Count); return text.ToString();
    }
    private void FillRows()
    {
        if (_bundle == null) return; _rows.Rows.Clear(); var chapter = (_chapters.SelectedItem as ChapterItem)?.Id;
        var filter = _viewFilter.SelectedItem?.ToString() ?? "all";
        foreach (var row in AnalysisRows().Where(r => (chapter == null || r["chapterId"]?.GetValue<string>() == chapter) && (filter == "all" || filter == "tables" && r["target"]?["cellId"] != null || filter == "pictures" && r["formatRole"]?.GetValue<string>() == "picture" || filter == "data" && r["contentRole"]?.GetValue<string>() is "measurement" or "diagnosis" or "improvement")))
        { var id = row!["id"]!.GetValue<string>(); _decisions.TryGetValue(id, out var decision); var index = _rows.Rows.Add(id, row["chapter"]?.GetValue<string>() ?? "", row["text"]?.GetValue<string>() ?? "", decision?["contentRole"]?.GetValue<string>() ?? row["contentRole"]?.GetValue<string>() ?? "context", decision?["decision"]?.GetValue<string>() ?? "pending"); _rows.Rows[index].Tag = row; }
        UpdateReportActions();
    }
    private IEnumerable<JsonNode> AnalysisRows()
    {
        if (_bundle == null) yield break;
        foreach (var row in _bundle["analysis"]!["sections"]!.AsArray()) yield return row!;
        foreach (var key in new[] { "pictures", "imageTextRegions" }) foreach (var picture in _bundle["analysis"]![key]?.AsArray() ?? []) yield return new JsonObject { ["id"] = picture!["id"]!.DeepClone(), ["chapterId"] = picture["chapterId"]?.DeepClone(), ["chapter"] = picture["chapter"]?.DeepClone(), ["text"] = key == "imageTextRegions" ? "이미지 본문 · 글자 편집 불가" : "그림 개체", ["contentRole"] = "measurement", ["formatRole"] = "picture", ["target"] = new JsonObject { ["objectId"] = picture["id"]!.DeepClone() } };
    }
    private void ShowSelection()
    {
        UpdateReportActions();
        if (_rows.SelectedRows.Count == 0) return; var row = _rows.SelectedRows[0].Tag as JsonNode; if (row == null) return; var id = row["id"]!.GetValue<string>(); _decisions.TryGetValue(id, out var decision); _properties.Text = "원문 위치·서식 근거 (검토용)\n" + row.ToJsonString(DisplayJson);
        _role.SelectedItem = decision?["contentRole"]?.GetValue<string>() ?? row["contentRole"]?.GetValue<string>() ?? "context"; _decision.SelectedItem = decision?["decision"]?.GetValue<string>() ?? "pending"; _retention.SelectedItem = decision?["retentionPurpose"]?.GetValue<string>() ?? ""; _reviewText.Text = decision?["draftText"]?.GetValue<string>() ?? ""; _retentionNote.Text = decision?["note"]?.GetValue<string>() ?? ""; _clear.Checked = decision?["clearValue"]?.GetValue<bool>() ?? false;
        var bound = decision?["materialIds"]?.AsArray().Select(id => id!.GetValue<string>()).ToHashSet() ?? []; for (var i = 0; i < _evidence.Items.Count; i++) _evidence.SetItemChecked(i, bound.Contains(((EvidenceItem)_evidence.Items[i]).Id)); SelectionChanged?.Invoke(this, EventArgs.Empty);
    }
    private void ApplySelectedDecision()
    {
        foreach (DataGridViewRow selected in _rows.SelectedRows) { var row = (JsonNode)selected.Tag!; var id = row["id"]!.GetValue<string>(); var value = new JsonObject { ["decision"] = _decision.SelectedItem?.ToString() ?? "pending", ["contentRole"] = _role.SelectedItem?.ToString() ?? "context", ["draftText"] = _reviewText.Text, ["clearValue"] = _clear.Checked, ["note"] = _retentionNote.Text, ["retentionPurpose"] = _retention.SelectedItem?.ToString() ?? "", ["materialIds"] = new JsonArray(_evidence.CheckedItems.Cast<EvidenceItem>().Select(item => JsonValue.Create(item.Id)).ToArray<JsonNode?>()) }; _decisions[id] = value; }
        _reviewPath = null; _dirty = true; FillRows(); Status("선택 항목 결정을 적용했습니다. 검토 저장·새 문맥 확인 후 초안 검사로 진행하세요.");
    }
    public void SetReviewDecision(string rowId, JsonObject decision) { if (!AnalysisRows().Any(row => row["id"]?.GetValue<string>() == rowId)) throw new InvalidDataException(); _decisions[rowId] = (JsonObject)decision.DeepClone(); _reviewPath = null; _dirty = true; FillRows(); }
    private async Task<string> WriteContext(string draftMode = "blank")
    {
        await AuthorizeProfile(true, Token);
        if (_bundle == null || _current == null) throw new InvalidOperationException(); var items = new JsonObject(); foreach (var (id, decision) in _decisions) items[id] = decision.DeepClone();
        var materials = new JsonArray(_materials.Where(item => item.Role == "current").Select(item => (JsonNode)new JsonObject { ["id"] = item.Id, ["sha256"] = item.Sha256, ["filename"] = item.Filename, ["format"] = Path.GetExtension(item.Filename).TrimStart('.').ToLowerInvariant() }).ToArray());
        var value = new JsonObject { ["review"] = new JsonObject { ["sourceSha256"] = _current.Sha256, ["items"] = items }, ["draftMode"] = draftMode, ["materials"] = materials }; var destination = Path.Combine(_projectRoot, "review-" + Guid.NewGuid().ToString("N") + ".json"); await Atomic(destination, value.ToJsonString(), Token); return destination;
    }
    public async Task AcknowledgeAsync() { _reviewPath = await WriteContext(_mode.SelectedItem?.ToString() ?? "blank"); await _services.Reports.AcknowledgeReviewAsync(Context, _current!.Sha256, _bundle!["fingerprint"]!.GetValue<string>(), _reviewPath, Token); await SaveAsync(Token); Status("현재 원본·분석·검토 문맥을 결합했습니다. 사람·한글 실물 승인으로 기록하지 않습니다."); }
    private async Task PrepareAsync() { var context = await WriteContext(_mode.SelectedItem?.ToString() ?? "blank"); var plan = await Execute(Command("prepareDraft", context)); _summary.Text = "초안 준비 검사\n" + plan.ToJsonString(new JsonSerializerOptions { WriteIndented = true }); Status("검사 결과의 pending/경고를 해소해야 합니다. reportReady=false"); }
    public async Task WriteDraftAsync(string mode = "blank")
    {
        if (_reviewPath == null || _mode.SelectedItem?.ToString() != mode) { Status("작업 보류: 작성 목적(blank/current)을 선택하고 검토 저장·새 문맥 확인을 먼저 실행하세요."); throw new InvalidOperationException(); }
        var draft = await Execute(Command("writeDraft", _reviewPath)); _summary.Text = "생성 후보 검토\n" + draft["review"]?.ToJsonString(); await SaveAsync(Token); Status("새 HWPX 사본 후보를 생성했습니다. 금회 실자료·실물 검토 없이 회사 완료로 표시하지 않습니다.");
    }
    private async Task ExportCollectionAsync() { await CreateCollectionAsync(); await ExportArtifactAsync(); }
    private async Task CreateCollectionAsync() { if (_reviewPath == null) throw new InvalidOperationException(); await Execute(Command("exportCollection", _reviewPath)); await SaveAsync(Token); }
    public async Task ExportCollectionToAsync(string destination) { ExportDestination(destination); await CreateCollectionAsync(); await ExportLatestArtifactAsync(destination); }
    private async Task ImportCollectionAsync() { using var dialog = new OpenFileDialog { Filter = "작성 조사양식|*.hwpx" }; if (dialog.ShowDialog(this) != DialogResult.OK) return; await ImportCollectionFromAsync(dialog.FileName); }
    public async Task ImportCollectionFromAsync(string path) { if (_reviewPath == null) throw new InvalidOperationException(); _returned = await Execute(Command("importCollection", _reviewPath, path)); _returnedFile = path; _returnedReviewSha = Hash(await File.ReadAllBytesAsync(_reviewPath, Token)); _summary.Text = "반환 후보 · 적용 전\n" + _returned.ToJsonString(new JsonSerializerOptions { WriteIndented = true }); }
    private async Task ApplyReturnedAsync()
    {
        if (_returned == null) throw new InvalidOperationException(); var empty = _returned["rows"]!.AsArray().All(row => string.IsNullOrWhiteSpace(row!["value"]!.GetValue<string>())); var clear = empty && MessageBox.Show(this, "반환한 모든 입력 칸이 비어 있습니다. 선택 칸을 입력 대기용 빈값으로 명시 연결할까요?", "빈 입력칸 확인", MessageBoxButtons.YesNo) == DialogResult.Yes; await ApplyCollectionReturnAsync(clear);
    }
    public async Task ApplyCollectionReturnAsync(bool emptyAsBlank = false)
    {
        if (_returned == null || _current == null || _returnedFile == null || _reviewPath == null || _returned["sourceSha256"]?.GetValue<string>() != _current.Sha256 || Hash(await File.ReadAllBytesAsync(_reviewPath, Token)) != _returnedReviewSha) throw new InvalidOperationException();
        if (_returned["warnings"]?.AsArray().Count > 0) { Status("작업 보류: 반환 양식 경고를 해소하고 다시 가져오세요."); throw new InvalidOperationException(); }
        var empty = _returned["rows"]!.AsArray().All(row => string.IsNullOrWhiteSpace(row!["value"]!.GetValue<string>()));
        if (emptyAsBlank && !empty) throw new InvalidDataException(); var clearEmpty = emptyAsBlank;
        var receipt = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId!, _returnedFile, Token); if (_materials.All(item => item.Sha256 != receipt.Sha256)) _materials.Add(new EvidenceItem(receipt.Id, Path.GetFileName(_returnedFile), receipt.StoredPath, receipt.Sha256));
        var targets = _returned["rows"]!.AsArray().Select(row => row!["id"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
        foreach (var item in _returned["review"]?["items"]?.AsObject() ?? new JsonObject()) if (item.Value is JsonObject value) { var next = (JsonObject)value.DeepClone(); if (targets.Contains(item.Key) && next["decision"]?.GetValue<string>() != "exclude") { if (clearEmpty) next["clearValue"] = true; var ids = next["materialIds"]?.AsArray().Select(id => id!.GetValue<string>()).ToHashSet() ?? []; ids.Add(receipt.Id); next["materialIds"] = new JsonArray(ids.Select(id => JsonValue.Create(id)).ToArray<JsonNode?>()); } _decisions[item.Key] = next; }
        _returned = null; _returnedFile = null; _returnedReviewSha = null; _reviewPath = null; _dirty = true; RefreshEvidence(); FillRows(); await SaveAsync(Token); Status("반환값을 검토 후보에 연결했습니다. 빈값은 현재 측정값으로 생성하지 않습니다. 새 문맥 확인이 필요합니다.");
    }
    private async Task RestoreAsync()
    {
        if (_bundle == null || _chapters.SelectedItem is not ChapterItem chapter) throw new InvalidOperationException(); var command = Command("restore") with { Parameters = new() { ["filename"] = _current!.Filename, ["chapterId"] = chapter.Id } }; await Execute(command); var artifact = _artifacts.Last(); var destination = Path.Combine(_projectRoot, "restored-" + Guid.NewGuid().ToString("N") + ".hwpx"); File.Copy(artifact.Path, destination); await ImportSourceAsync(destination); Status("선택 장 HWPX 후보를 목록에 추가했습니다. 원본은 보존되며 후보를 새로 분석할 수 있습니다.");
    }
    private void RefreshEvidence() { _evidence.Items.Clear(); foreach (var item in _materials) _evidence.Items.Add(item); }
    private async Task PickEvidence() { using var dialog = new OpenFileDialog { Filter = "금회 자료|*.bmt;*.pwv;*.csv;*.xlsx;*.pdf;*.hwpx;*.hwp;*.png;*.jpg;*.jpeg;*.webp", Multiselect = true }; if (dialog.ShowDialog(this) != DialogResult.OK) return; foreach (var file in dialog.FileNames) await ImportEvidenceAsync(file); }
    public async Task ImportEvidenceAsync(string file) { if (Path.GetExtension(file).ToLowerInvariant() is not (".bmt" or ".pwv" or ".csv" or ".xlsx" or ".pdf" or ".hwpx" or ".hwp" or ".png" or ".jpg" or ".jpeg" or ".webp")) throw new InvalidDataException(); var asset = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId!, file, Token); if (_materials.All(item => item.Sha256 != asset.Sha256)) _materials.Add(new EvidenceItem(asset.Id, Path.GetFileName(file), asset.StoredPath, asset.Sha256)); _reviewPath = null; _dirty = true; RefreshEvidence(); await SaveAsync(Token); }
    private async Task InspectEvidenceAsync() { if (_evidence.SelectedItem is not EvidenceItem item) throw new InvalidOperationException(); await InspectMaterialAsync(item.Id); }

    private async Task ExportRecoveryAsync() { await CreateRecoveryAsync(); await ExportArtifactAsync(); }
    public async Task ExportRecoveryToAsync(string destination) { ExportDestination(destination); await CreateRecoveryAsync(); await ExportLatestArtifactAsync(destination); }
    private async Task CreateRecoveryAsync()
    {
        if (_current == null) throw new InvalidOperationException(); await SaveAsync(Token); var files = new JsonArray(new JsonObject { ["id"] = "source", ["role"] = "source", ["filename"] = _current.Filename, ["parentIds"] = new JsonArray(), ["fileKey"] = "source" }); var evidence = new List<ReportEvidence>();
        foreach (var report in _items.Where(item => item.Id != _current.Id)) { var id = "report:" + report.Id; evidence.Add(new ReportEvidence(id, report.Path, report.Sha256)); files.Add(new JsonObject { ["id"] = id, ["role"] = "source", ["filename"] = report.Filename, ["parentIds"] = new JsonArray(), ["fileKey"] = "evidence:" + id }); }
        foreach (var material in _materials) { var id = "material:" + material.Id; evidence.Add(new ReportEvidence(id, material.Path, material.Sha256)); files.Add(new JsonObject { ["id"] = id, ["role"] = "evidence", ["filename"] = material.Filename, ["parentIds"] = new JsonArray(), ["fileKey"] = "evidence:" + id }); }
        if (_reviewPath != null) { const string id = "review-context"; var bytes = await File.ReadAllBytesAsync(_reviewPath, Token); evidence.Add(new ReportEvidence(id, _reviewPath, Hash(bytes))); files.Add(new JsonObject { ["id"] = id, ["role"] = "evidence", ["filename"] = "review-context.json", ["parentIds"] = new JsonArray(), ["fileKey"] = "evidence:" + id }); }
        var parents = new Dictionary<string, string> { { _current.Sha256, "source" } }; foreach (var report in _items.Where(item => item.Id != _current.Id)) parents[report.Sha256] = "report:" + report.Id;
        foreach (var (artifact, index) in _artifacts.Where(item => item.Operation is "writeDraft" or "restore" or "specification").Select((item, index) => (item, index))) { if (!parents.TryGetValue(artifact.SourceSha256, out var parent)) continue; var id = "candidate:" + index; evidence.Add(new ReportEvidence(id, artifact.Path, artifact.Sha256)); files.Add(new JsonObject { ["id"] = id, ["role"] = "candidate", ["filename"] = $"candidate-{index}.hwpx", ["parentIds"] = new JsonArray(parent), ["fileKey"] = "evidence:" + id }); }
        foreach (var copy in _recoveredCopies) { if (copy.SourceSha256 == null || !parents.TryGetValue(copy.SourceSha256, out var parent)) continue; await ResolveScopedAsset(copy.AssetId, copy.Path, copy.Sha256, Token); var id = "copy:" + copy.Id; evidence.Add(new ReportEvidence(id, copy.Path, copy.Sha256)); files.Add(new JsonObject { ["id"] = id, ["role"] = copy.Role, ["filename"] = copy.Filename, ["parentIds"] = new JsonArray(parent), ["fileKey"] = "evidence:" + id }); }
        const string historyId = "workspace-historical-state"; var history = new JsonObject { ["schema"] = "jindan-report-workspace-history/1", ["readOnlyHistoricalContext"] = true, ["requiresFreshReview"] = true, ["workspace"] = JsonNode.Parse(_lastSavedProfileBytes ?? throw new InvalidOperationException()), ["reportReady"] = false }; var historyBytes = Encoding.UTF8.GetBytes(history.ToJsonString()); var historyPath = Path.Combine(_projectRoot, "workspace-history-" + Guid.NewGuid().ToString("N") + ".json"); await AtomicBytes(historyPath, historyBytes, Token); evidence.Add(new ReportEvidence(historyId, historyPath, Hash(historyBytes))); files.Add(new JsonObject { ["id"] = historyId, ["role"] = "evidence", ["filename"] = "report-workspace-history.json", ["parentIds"] = new JsonArray(), ["fileKey"] = "evidence:" + historyId });
        var value = new JsonObject { ["files"] = files, ["state"] = new JsonObject { ["projectId"] = Context.ProjectId, ["requiresFreshReview"] = true, ["readOnlyHistoricalContext"] = true, ["historicalWorkspaceFileId"] = historyId } }; var file = Path.Combine(_projectRoot, "recovery-" + Guid.NewGuid().ToString("N") + ".json"); await Atomic(file, value.ToJsonString(), Token); await Execute(Command("createRecovery", file) with { Evidence = evidence }); await SaveAsync(Token);
    }
    private async Task RecoverAsync()
    {
        using var dialog = new OpenFileDialog { Filter = "회수 ZIP|*.zip" }; if (dialog.ShowDialog(this) != DialogResult.OK) return; await RecoverFromAsync(dialog.FileName);
    }
    public async Task RecoverFromAsync(string file)
    {
        await AuthorizeProfile(true, Token); if (new FileInfo(file).Length is <= 0 or > 160L * 1024 * 1024) throw new InvalidDataException(); var bytes = await File.ReadAllBytesAsync(file, Token); var value = await Execute(new ReportCommand("recover", Context.ProjectId!, file, Hash(bytes))); _bundle = null; _reviewPath = null; _decisions.Clear(); await RegisterRecoveryFiles(value);
        Status("원본·역사자료·후보 사본과 서식/양식/전기 준비의 읽기 전용 역사 문맥을 회수했습니다. 후보는 회수 파일 탭에서 내려받거나 별도 원본으로 재분석할 수 있습니다. 과거 값·검토·승인은 자동 적용하지 않습니다.");
    }
    private async Task ExportArtifactAsync()
    {
        var artifact = _artifacts.LastOrDefault(); if (artifact == null) throw new InvalidOperationException(); using var dialog = new SaveFileDialog { Filter = "HWPX/ZIP 원본 바이트|*.*", FileName = artifact.Operation == "createRecovery" ? "report-recovery.zip" : "report-candidate.hwpx" }; if (dialog.ShowDialog(this) != DialogResult.OK) return;
        await ExportLatestArtifactAsync(dialog.FileName);
    }
    public async Task ExportLatestArtifactAsync(string destination) { ExportDestination(destination); var artifact = _artifacts.LastOrDefault() ?? throw new InvalidOperationException(); RequireLocal(new FileInfo(artifact.Path).Length is > 0 and <= 160L * 1024 * 1024, "EXPORT_LIMIT"); var bytes = await File.ReadAllBytesAsync(artifact.Path, Token); if (Hash(bytes) != artifact.Sha256) throw new InvalidDataException(); await ExportNewBytes(destination, bytes, Token); Status($"산출물 사본 저장 · SHA {artifact.Sha256} · reportReady=false"); }
    private void RemoveReport() { if (_current == null || MessageBox.Show(this, "보고서 목록의 연결만 제거합니다. 원본·생성 이력은 보존합니다.", "연결 제거", MessageBoxButtons.YesNo) != DialogResult.Yes) return; _items.Remove(_current); _dirty = true; RefreshLists(); }
    public async Task SaveAsync(CancellationToken ct = default)
    {
        await _saveGate.WaitAsync(ct); try
        {
            var generation = _generation; var context = Context; var scopeRoot = _projectRoot; await AuthorizeProfile(true, ct); RequireLocal(_profileLoaded, "REPORT_PROFILE_NOT_LOADED");
            if (_disciplineEditorDirty && _disciplineWorkspace != null && _bundle != null) await UpdateDisciplineEditorAsync();
            if (_current != null && _bundle != null && _decisions.Count > 0) { var expected = new JsonObject(); foreach (var row in AnalysisRows()) expected[row["id"]!.GetValue<string>()] = row["text"]?.GetValue<string>() ?? ""; _savedReviews[_current.Sha256] = new JsonObject { ["sourceSha256"] = _current.Sha256, ["fingerprint"] = _bundle["fingerprint"]!.DeepClone(), ["expected"] = expected, ["items"] = JsonSerializer.SerializeToNode(_decisions) }; }
            var value = new JsonObject { ["schema"] = 1, ["userId"] = Context.UserId, ["projectId"] = Context.ProjectId, ["reports"] = JsonSerializer.SerializeToNode(_items), ["materials"] = JsonSerializer.SerializeToNode(_materials), ["artifacts"] = JsonSerializer.SerializeToNode(_artifacts), ["savedReviews"] = JsonSerializer.SerializeToNode(_savedReviews), ["reportReady"] = false, ["supervisorAccepted"] = false }; SaveSpecializedState(value); SaveFormattingState(value); SaveLibraryState(value); SaveLegacyState(value); SaveRecoveryState(value); await WriteProfileSnapshot(Encoding.UTF8.GetBytes(value.ToJsonString()), generation, context, scopeRoot, ct); _dirty = false; UpdateReportActions();
        }
        finally { _saveGate.Release(); }
    }
    private Task RestoreSavedReview()
    {
        if (_current == null || _bundle == null || !_savedReviews.TryGetValue(_current.Sha256, out var saved)) throw new InvalidOperationException(); var rows = AnalysisRows().ToDictionary(row => row["id"]!.GetValue<string>(), row => row["text"]?.GetValue<string>() ?? "");
        foreach (var (id, text) in saved["expected"]!.AsObject()) if (!rows.TryGetValue(id, out var actual) || actual != text!.GetValue<string>()) throw new InvalidDataException();
        _decisions.Clear(); foreach (var (id, value) in saved["items"]!.AsObject()) if (rows.ContainsKey(id) && value is JsonObject decision) _decisions[id] = (JsonObject)decision.DeepClone(); _reviewPath = null; _dirty = true; FillRows(); Status("같은 원본·실제 슬롯을 대조해 이전 결정을 검토 후보로 불러왔습니다. 새 검토 확인 전 작성은 차단됩니다."); return Task.CompletedTask;
    }
    protected override void Dispose(bool disposing) { if (disposing) { _generation++; _running?.Cancel(); _services.Reports.Invalidate(Context.ContextId); _pageImage.Image?.Dispose(); _pageImage.Image = null; ClearThermalImages(); _navigation.Dispose(); _propertyPanel.Dispose(); } base.Dispose(disposing); }
}
