using System.Text;
using System.Text.Json.Nodes;

namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument
{
    private readonly RichTextBox _preservation70 = new() { Name = "NativeSaveAudit70", Dock = DockStyle.Fill, ReadOnly = true };
    private readonly RichTextBox _proposal70 = new() { Name = "ProposalReview70", Dock = DockStyle.Fill, ReadOnly = true };
    private readonly ComboBox _proposalMode70 = new() { Name = "ProposalMode70", DropDownStyle = ComboBoxStyle.DropDownList, Width = 170 };
    private JsonObject? _proposalEnvelope70;
    private string? _inspectedMaterial70;
    private void BuildRemainingReport70()
    {
        var audit = new TabPage("저장본 보존 검사") { Name = "PreservationTab70" };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
        AddButton(bar, "CompareSavedCopy70", "별도 저장 HWPX 비교", () => Run(async () => { using var pick = new OpenFileDialog { Filter = "별도 저장본|*.hwpx" }; if (pick.ShowDialog(this) == DialogResult.OK) await AuditSavedCopyAsync(pick.FileName); }));
        AddButton(bar, "ReloadAudit70", "이 원본의 최근 검사", () => Run(LoadPreservationAudit70));
        AddButton(bar, "ExportAudit70", "검사 JSON 내려받기", () => Run(async () => { using var pick = new SaveFileDialog { Filter = "보존 검사|*.json", FileName = "보존검사.json" }; if (pick.ShowDialog(this) == DialogResult.OK) await ExportPreservationAudit70(pick.FileName); }));
        audit.Controls.Add(_preservation70); audit.Controls.Add(bar); audit.Controls.Add(new Label { Dock = DockStyle.Bottom, Height = 55, Text = "그림 바이트·치수, 글꼴 정의·파일, 탭, 출처 JSON의 차이를 기록합니다. 실제 한글 배치·글꼴 선택·픽셀·편집성 승인이 아닙니다. 저장본을 원본 대신 자동 채택하지 않습니다." }); _tabs.TabPages.Add(audit);
        var proposal = new TabPage("제안 검토 · 오프라인") { Name = "ProposalTab70" };
        var actions = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
        _proposalMode70.Items.AddRange(["analysis", "interpretation"]); _proposalMode70.SelectedIndex = 0;
        _proposalMode70.SelectedIndexChanged += (_, _) => { _proposalEnvelope70 = null; _proposal70.Clear(); }; actions.Controls.Add(_proposalMode70);
        AddButton(actions, "ExportProposalRequest70", "원본 결합 요청 JSON", () => Run(async () => { using var pick = new SaveFileDialog { Filter = "검토 요청|*.json", FileName = "제안요청.json" }; if (pick.ShowDialog(this) == DialogResult.OK) await ExportProposalRequest70(pick.FileName, _proposalMode70.Text); }));
        AddButton(actions, "InspectProposal70", "응답 JSON 검증·미리보기", () => Run(async () => { using var pick = new OpenFileDialog { Filter = "검토 응답|*.json" }; if (pick.ShowDialog(this) == DialogResult.OK) await InspectProposalFile70(pick.FileName, _proposalMode70.Text); }));
        AddButton(actions, "ApplyProposal70", "검토한 제안 명시 적용", () => Run(async () => { if (MessageBox.Show(this, "미리본 제안을 현재 선택 양식에 적용합니까? 현재 값·근거는 생성하지 않으며 새 양식 검토가 필요합니다.", "제안 적용", MessageBoxButtons.YesNo) == DialogResult.Yes) await ApplyProposal70(); }));
        proposal.Controls.Add(_proposal70); proposal.Controls.Add(actions); proposal.Controls.Add(new Label { Dock = DockStyle.Bottom, Height = 55, Text = "공급자 NotConfigured · 외부 전송·AI 호출 없음. 분석 항목·소견 제안 JSON만 검증합니다. 미리보기는 적용이 아니며 원본/양식/입력이 바뀌면 응답을 거부합니다." }); _tabs.TabPages.Add(proposal);
    }
    private void ResetRemainingReport70() { _preservation70.Clear(); _proposal70.Clear(); _proposalEnvelope70 = null; }
    public async Task<JsonNode> AuditSavedCopyAsync(string path)
    {
        await AuthorizeProfile(true, Token); RequireLocal(_current != null && _bundle != null, "REANALYSIS_REQUIRED");
        RequireLocal(Path.GetExtension(path).Equals(".hwpx", StringComparison.OrdinalIgnoreCase), "UNSUPPORTED_FORMAT");
        var generation = _generation; var current = _current!;
        var saved = await _services.Assets.ImportAsync(_services.Actor, Context.ProjectId!, path, Token);
        RequireLocal(generation == _generation && _current == current, "REPORT_CONTEXT_CHANGED");
        await ResolveScopedAsset(saved.Id, saved.StoredPath, saved.Sha256, Token);
        var value = await Execute(Command("nativeSaveAudit", filled: saved.StoredPath) with { Evidence = [] });
        RequireLocal(value["before"]?["sha256"]?.ToString() == current.Sha256 && value["after"]?["sha256"]?.ToString() == saved.Sha256, "BINDING_MISMATCH");
        var receipt = Encoding.UTF8.GetBytes(value.ToJsonString()); var destination = Path.Combine(_projectRoot, "native-audit70-" + Guid.NewGuid().ToString("N") + ".json");
        await AtomicBytes(destination, receipt, Token); _artifacts.Add(new ArtifactItem("nativeSaveAudit", destination, Hash(receipt), receipt.Length, current.Sha256));
        if (_recoveredCopies.All(c => c.Role != "native-saved" || c.Sha256 != saved.Sha256 || c.SourceSha256 != current.Sha256))
            _recoveredCopies.Add(new RecoveredCopy("native-return70:" + Guid.NewGuid().ToString("N"), "native-saved", Path.GetFileName(path), saved.Id, saved.StoredPath, saved.Sha256, current.Sha256, ["source"]));
        RefreshRecoveredFiles();
        _preservation70.Text = value.ToJsonString(DisplayJson); await SaveAsync(Token); Status("정확한 두 SHA의 보존 차이를 저장했습니다. 실제 한글·원본 글꼴 사용·조판 승인은 별도입니다."); return value;
    }
    private async Task LoadPreservationAudit70()
    {
        var generation = _generation; await AuthorizeProfile(false, Token); var audit = _artifacts.LastOrDefault(a => a.Operation == "nativeSaveAudit" && a.SourceSha256 == _current?.Sha256) ?? throw new InvalidOperationException();
        RequireLocal(new FileInfo(audit.Path).Length <= 32L * 1024 * 1024, "AUDIT_LIMIT"); CheckNoLinks(audit.Path);
        RequireLocal(Under(_projectRoot, audit.Path), "REPORT_INTERNAL_PATH"); var bytes = await File.ReadAllBytesAsync(audit.Path, Token);
        RequireLocal(generation == _generation && Hash(bytes) == audit.Sha256 && bytes.Length == audit.Size, "AUDIT_CHANGED"); _preservation70.Text = JsonNode.Parse(bytes)!.ToJsonString(DisplayJson);
    }
    public async Task ExportPreservationAudit70(string destination) { await LoadPreservationAudit70(); await ExportNewBytes(destination, Encoding.UTF8.GetBytes(_preservation70.Text), Token); }
    public async Task<JsonNode> ExportProposalRequest70(string destination, string mode)
    {
        if (_disciplineEditorDirty) await SaveDisciplineEditorAsync();
        var result = await DisciplineAction("proposalRequest", new JsonObject { ["mode"] = mode }); var request = result["proposalRequest"]!;
        await ExportNewBytes(destination, Encoding.UTF8.GetBytes(request.ToJsonString()), Token); _proposalEnvelope70 = null; _proposal70.Text = request.ToJsonString(DisplayJson); return request.DeepClone();
    }
    public async Task<JsonNode> InspectProposalFile70(string path, string mode)
    {
        await AuthorizeProfile(true, Token); if (_disciplineEditorDirty) await SaveDisciplineEditorAsync();
        var full = AbsoluteLocalPath(path); CheckNoLinks(full); RequireLocal(Path.GetExtension(full).Equals(".json", StringComparison.OrdinalIgnoreCase), "INVALID_PROPOSAL");
        using var stream = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read); RequireLocal(stream.Length is > 0 and <= 2 * 1024 * 1024, "PROPOSAL_LIMIT");
        var bytes = new byte[(int)stream.Length]; await stream.ReadExactlyAsync(bytes, Token); var envelope = JsonNode.Parse(bytes)!.AsObject();
        var result = await DisciplineAction("proposalInspect", new JsonObject { ["mode"] = mode, ["envelope"] = envelope.DeepClone() });
        _proposalEnvelope70 = (JsonObject)envelope.DeepClone(); _proposal70.Text = result["proposalReview"]!.ToJsonString(DisplayJson); return result["proposalReview"]!.DeepClone();
    }
    public async Task ApplyProposal70()
    {
        RequireLocal(_proposalEnvelope70 != null, "PROPOSAL_REVIEW_REQUIRED"); if (_disciplineEditorDirty) await SaveDisciplineEditorAsync();
        var response = _proposalEnvelope70!; await DisciplineAction("proposalApply", new JsonObject { ["mode"] = response["mode"]!.DeepClone(), ["envelope"] = response.DeepClone(), ["explicitApply"] = true });
        _proposalEnvelope70 = null; await SaveAsync(Token); Status("검토 제안을 선택 양식에만 적용했습니다. 새 검토·원본 근거·금회 입력·실물 승인은 별도입니다.");
    }
    private async Task MapInspectedCell70()
    {
        RequireLocal(_inspectedMaterial70 != null && _materialRows.CurrentCell?.ColumnIndex > 0 && _fieldsGrid.CurrentRow != null, "MATERIAL_TARGET_SELECTION_REQUIRED");
        var cell = _materialRows.CurrentCell!; var row = _materialRows.Rows[cell.RowIndex]; RequireLocal(row.Tag is JsonObject, "STRUCTURED_TABLE_REQUIRED");
        var target = (JsonObject)row.Tag!; var field = _fieldsGrid.CurrentRow!; var fieldId = Convert.ToString(field.Cells["id"].Value)!;
        if (MessageBox.Show(this, $"자료 원시셀 '{cell.Value}'을 선택 입력칸 '{field.Cells["label"].Value}'에 연결합니까? 설비·기간·단위가 금회 자료와 맞는지 확인하세요. 기존 값이 있으면 교체됩니다.", "자료 셀 확인", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        await MapMaterialCell70(_inspectedMaterial70!, fieldId, target["table"]!.GetValue<int>(), target["row"]!.GetValue<int>(), cell.ColumnIndex - 1, true, true);
    }
    public async Task<JsonNode> MapMaterialCell70(string materialId, string fieldId, int table, int row, int column, bool confirmedContext, bool overwrite = false)
    {
        await AuthorizeProfile(true, Token); var material = _materials.Single(m => m.Id == materialId); RequireLocal(material.Role == "current", "HISTORICAL_EVIDENCE_DENIED");
        await ResolveScopedAsset(material.Id, material.Path, material.Sha256, Token); if (_disciplineEditorDirty) await SaveDisciplineEditorAsync();
        var result = await DisciplineAction("mapInputCell70", new JsonObject { ["materialId"] = material.Id, ["filename"] = material.Filename, ["sha256"] = material.Sha256, ["role"] = material.Role, ["fieldId"] = fieldId, ["table"] = table, ["row"] = row, ["column"] = column, ["confirmedContext"] = confirmedContext, ["overwrite"] = overwrite });
        await SaveAsync(Token); Status("선택 실제 자료 셀을 값·좌표·SHA와 결합했습니다. 설비·기간·단위·공학적 검토 승인은 별도입니다."); return result;
    }
}
