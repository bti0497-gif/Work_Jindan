using System.Text.Json.Nodes;

namespace Jindan.Modules.ReportStudio;

public sealed partial class ReportDocument
{
    private readonly ComboBox _materialRecord = new() { Name = "MaterialRecord", Width = 220, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _materialInstrument = new() { Name = "MaterialInstrument", Width = 180, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _materialSite = new() { Name = "MaterialSite", Width = 180, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _channelSearch = new() { Name = "MaterialChannelSearch", Width = 180, PlaceholderText = "채널/단위 검색" };
    private readonly DataGridView _materialRows = new() { Name = "MaterialDataRows", Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, RowHeadersVisible = false };
    private readonly RichTextBox _materialMetadata = new() { Name = "MaterialMetadata", Dock = DockStyle.Fill, ReadOnly = true };
    private readonly FlowLayoutPanel _thermalImages = new() { Name = "ThermalOriginalImages", Dock = DockStyle.Fill, AutoScroll = true };
    private JsonNode? _materialInspection;
    private bool _bindingMaterial;
    private sealed record MaterialChoice(string Id, string Label) { public override string ToString() => Label; }
    private void BuildMaterialsTab()
    {
        var tab = new TabPage("금회 자료 검사") { Name = "MaterialsTab" }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true }; AddButton(bar, "MaterialInspect", "선택 자료 원시 검사", () => Run(InspectEvidenceAsync)); bar.Controls.AddRange([_materialInstrument, _materialSite, _materialRecord, _channelSearch]); var pages = new TabControl { Dock = DockStyle.Fill }; foreach (var (label, control) in new (string, Control)[] { ("기록·채널·입력 표", _materialRows), ("출처·환경·점·제한", _materialMetadata), ("BMT 원본 이미지", _thermalImages) }) { var page = new TabPage(label); page.Controls.Add(control); pages.TabPages.Add(page); }
        tab.Controls.Add(pages); tab.Controls.Add(bar); tab.Controls.Add(new Label { Dock = DockStyle.Bottom, Height = 38, Text = "원시 검사입니다. BMT 원시배열은 온도가 아니며 PWV 단위·CT/PT·기간은 담당자가 확인해야 합니다. 자동 진단/현재값 생성은 하지 않습니다." }); _tabs.TabPages.Add(tab);
        foreach (var combo in new[] { _materialInstrument, _materialSite, _materialRecord }) combo.SelectedIndexChanged += (_, _) => { if (!_bindingMaterial) FillMaterialRows(); }; _channelSearch.TextChanged += (_, _) => { if (!_bindingMaterial) FillMaterialRows(); }; _materialRows.CellDoubleClick += (_, args) => { if (args.RowIndex >= 0 && _materialRows.Rows[args.RowIndex].Tag is JsonNode value) _materialMetadata.Text = value.ToJsonString(DisplayJson); };
    }
    public async Task InspectMaterialAsync(string materialId)
    {
        var material = _materials.First(item => item.Id == materialId); var value = await Execute(new Jindan.Contracts.ReportCommand("inspectMaterial", Context.ProjectId!, material.Path, material.Sha256, Parameters: new() { ["filename"] = material.Filename, ["includeImages"] = "true" })); _materialInspection = value; _materialMetadata.Text = "실제 자료 · " + material.Filename + "\nSHA " + material.Sha256 + "\n" + value.ToJsonString(DisplayJson);
        _bindingMaterial = true; foreach (var combo in new[] { _materialInstrument, _materialSite, _materialRecord }) { combo.Items.Clear(); combo.Items.Add(new MaterialChoice("", "전체")); }
        var power = value["powerView"]; foreach (var item in power?["instruments"]?.AsArray() ?? []) _materialInstrument.Items.Add(new MaterialChoice(item?["ID"]?.ToString() ?? "", item?.ToJsonString() ?? "")); foreach (var item in power?["sites"]?.AsArray() ?? []) _materialSite.Items.Add(new MaterialChoice(item?["ID"]?.ToString() ?? "", item?.ToJsonString() ?? "")); foreach (var item in power?["records"]?.AsArray() ?? []) _materialRecord.Items.Add(new MaterialChoice(item!["id"]!.ToString(), item["name"] + " · " + item["start"])); foreach (var combo in new[] { _materialInstrument, _materialSite, _materialRecord }) combo.SelectedIndex = 0; _bindingMaterial = false; FillMaterialRows();
        ClearThermalImages(); foreach (var (key, item) in value["thermal"]?["images"]?.AsObject() ?? new JsonObject()) if (item?["$workerFile"] is JsonObject descriptor) { var bytes = await File.ReadAllBytesAsync(descriptor["path"]!.GetValue<string>(), Token); if (Hash(bytes) != descriptor["sha256"]!.ToString()) throw new InvalidDataException(); try { using var stream = new MemoryStream(bytes); using var image = Image.FromStream(stream); if (image.Width * 1L * image.Height > 16000000) throw new InvalidDataException(); var panel = new Panel { Width = 500, Height = 380 }; panel.Controls.Add(new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, Image = new Bitmap(image), Name = "ThermalImage_" + key }); panel.Controls.Add(new Label { Dock = DockStyle.Top, Height = 26, Text = key == "real" ? "BMT 내 실제 사진 · 원본 이미지" : "BMT 내 표시 미리보기 · 측정온도 판정 아님" }); _thermalImages.Controls.Add(panel); } catch (ArgumentException) { _thermalImages.Controls.Add(new Label { Text = "내장 이미지 형식은 직접 미리보기를 지원하지 않습니다. 원본·메타데이터는 보존됩니다.", Width = 500, Height = 60 }); } }
        _tabs.SelectedTab = _tabs.TabPages["MaterialsTab"]; Status("선택 실제 자료의 기록·채널·환경·제한을 표시했습니다. 자동 측정·공학 판정·회사 보고서 승인이 아닙니다.");
    }
    private void FillMaterialRows()
    {
        _materialRows.Rows.Clear(); _materialRows.Columns.Clear(); if (_materialInspection == null) return;
        void Columns(params string[] names) { foreach (var name in names) _materialRows.Columns.Add(name, name); }
        var power = _materialInspection["powerView"]; if (power != null) { Columns("기록", "채널", "수량/단위", "개수", "유효", "누락", "최소", "최대", "표현"); var record = (_materialRecord.SelectedItem as MaterialChoice)?.Id ?? ""; var instrument = (_materialInstrument.SelectedItem as MaterialChoice)?.Id ?? ""; var site = (_materialSite.SelectedItem as MaterialChoice)?.Id ?? ""; var search = _channelSearch.Text.Trim(); foreach (var r in power["records"]!.AsArray().Where(r => (record == "" || r?["id"]?.ToString() == record) && (instrument == "" || r?["instrumentId"]?.ToString() == instrument) && (site == "" || r?["siteId"]?.ToString() == site))) foreach (var channel in r!["channels"]!.AsArray()) { if (search != "" && !channel!.ToJsonString().Contains(search, StringComparison.OrdinalIgnoreCase)) continue; foreach (var measurement in channel!["measurements"]!.AsArray()) { var raw = measurement?["raw"]; var index = AddMaterialRow(r["name"]?.ToString(), channel["id"]?.ToString(), channel["quantity"]?.ToJsonString() + " / " + measurement?["unit"]?.ToJsonString(), raw?["count"]?.ToString(), raw?["finiteCount"]?.ToString(), raw?["missingCount"]?.ToString(), raw?["min"]?.ToString(), raw?["max"]?.ToString(), raw?["dataType"]?.ToString()); _materialRows.Rows[index].Tag = measurement!.DeepClone(); } } }
        else if (_materialInspection["tables"]?["tables"] is JsonArray tables) { var max = tables.SelectMany(table => table!["rows"]!.AsArray()).Select(row => row!.AsArray().Count).DefaultIfEmpty(0).Max(); Columns(["표", .. Enumerable.Range(1, max).Select(i => "열 " + i)]); foreach (var table in tables) foreach (var row in table!["rows"]!.AsArray()) { var values = new List<object?> { table["name"]?.ToString() ?? table["id"]?.ToString() }; values.AddRange(row!.AsArray().Select(cell => (object?)(cell?["value"]?.ToString() ?? ""))); AddMaterialRow(values.ToArray()); } }
        else if (_materialInspection["thermal"] is JsonNode thermal) { Columns("측정점 이름", "카메라 원시 메타데이터"); foreach (var point in thermal["points"]?.AsArray() ?? []) { var index = AddMaterialRow(point?["name"]?.ToString() ?? point?["id"]?.ToString(), point?.ToJsonString()); _materialRows.Rows[index].Tag = point?.DeepClone(); } }
    }
    private int AddMaterialRow(params object?[] values) => _materialRows.Rows.Add(values.Select(value => value ?? "").ToArray());
    private void ResetMaterials() { _materialInspection = null; _materialRows.Rows.Clear(); _materialMetadata.Clear(); ClearThermalImages(); }
    private void ClearThermalImages() { foreach (var panel in _thermalImages.Controls.Cast<Control>().ToArray()) { foreach (var image in panel.Controls.OfType<PictureBox>()) image.Image?.Dispose(); panel.Dispose(); } _thermalImages.Controls.Clear(); }
}
