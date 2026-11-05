using System.Drawing.Imaging;
using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Modules.Photos;

public sealed class Module : RecordModule
{
    public override string ModuleId => "photos";
    public override string DisplayName => "사진·앨범 관리";
    public override RecordSchema Schema => new("photos", DisplayName, [new("title", "사진 제목", Required: true), new("album", "앨범"), new("site", "현장·시설"), new("category", "분류", Choices: ["현장", "시설", "결함", "계측", "기타"]), new("caption", "설명", "multiline"), new("capturedAt", "촬영 일시"), new("camera", "촬영 기기"), new("assetId", "원본 자산 식별자", "readonly", Required: true), new("sha256", "원본 SHA256", "readonly")]);
    public override IWorkspaceDocument CreateDocument(DocumentContext context) => new PhotoDocument(Services, Schema, context);
}
public sealed partial class PhotoDocument : RecordDocument
{
    private readonly PictureBox preview = new() { SizeMode = PictureBoxSizeMode.StretchImage, BackColor = Color.FromArgb(235, 238, 243), TabStop = true };
    private readonly Panel viewport = new() { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.FromArgb(235, 238, 243) };
    private bool fit = true, drag, photoDisposed; private double zoom = 1; private Point dragOrigin, scrollOrigin;
    private bool importing;
    private readonly CancellationTokenSource photoOperations = new();
    private CancellationTokenSource previewCancellation = new();
    private readonly Dictionary<string, Bitmap> cache = new();
    private long previewGeneration;
    public PhotoDocument(IWorkspaceServices services, RecordSchema schema, DocumentContext context) : base(services, schema, context)
    {
        Controls.Remove(Grid); var split = new SplitContainer() { Size = new Size(800, 600), Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 180 }; split.Panel1.Controls.Add(Grid); viewport.Controls.Add(preview); split.Panel2.Controls.Add(viewport); Controls.Add(split); split.BringToFront(); // Keep Fill before the docked bars so their space is reserved.
        AddAction("사진 가져오기", ImportDialogAsync); AddAction("보기 회전", () => { if (preview.Image is not null) preview.Image.RotateFlip(RotateFlipType.Rotate90FlipNone); preview.Invalidate(); return Task.CompletedTask; }); AddAction("편집본 PNG 저장", ExportEditedAsync); AddAction("원본 내보내기", ExportOriginalAsync);
        SelectionChanged += SelectionUpdated;
        AddAction("이전 사진", () => { MoveSelection(-1); return Task.CompletedTask; }); AddAction("다음 사진", () => { MoveSelection(1); return Task.CompletedTask; }); AddAction("맞춤", () => { fit = true; ResizePreview(); return Task.CompletedTask; }); AddAction("100%", () => { fit = false; zoom = 1; ResizePreview(); return Task.CompletedTask; }); AddAction("확대 +", () => { fit = false; zoom *= 1.25; ResizePreview(); return Task.CompletedTask; }); AddAction("축소 −", () => { fit = false; zoom /= 1.25; ResizePreview(); return Task.CompletedTask; });
        viewport.Resize += (_, _) => { if (fit) ResizePreview(); }; preview.MouseEnter += (_, _) => preview.Focus(); preview.MouseWheel += (_, e) => { fit = false; zoom *= e.Delta > 0 ? 1.2 : 1 / 1.2; ResizePreview(); }; preview.MouseDown += (_, e) => { if (e.Button != MouseButtons.Left) return; drag = true; dragOrigin = Cursor.Position; scrollOrigin = new(-viewport.AutoScrollPosition.X, -viewport.AutoScrollPosition.Y); preview.Capture = true; }; preview.MouseMove += (_, _) => { if (drag) { var p = Cursor.Position; viewport.AutoScrollPosition = new(Math.Max(0, scrollOrigin.X + dragOrigin.X - p.X), Math.Max(0, scrollOrigin.Y + dragOrigin.Y - p.Y)); } }; preview.MouseUp += (_, _) => { drag = false; preview.Capture = false; }; InitializeThumbnails();
    }
    private void MoveSelection(int direction) { if (IsDirty || Grid.Rows.Count == 0) return; var index = Math.Clamp((Grid.CurrentRow?.Index ?? 0) + direction, 0, Grid.Rows.Count - 1); if (Grid.Rows[index].Tag is WorkRecord record) SelectVisibleRecord(record.Id); }
    private void ResizePreview() { if (preview.Image is null) return; if (fit) zoom = Math.Min(Math.Max(1, viewport.ClientSize.Width - 20) / (double)preview.Image.Width, Math.Max(1, viewport.ClientSize.Height - 20) / (double)preview.Image.Height); zoom = Math.Clamp(zoom, .05, 8); preview.Size = new(Math.Max(1, (int)(preview.Image.Width * zoom)), Math.Max(1, (int)(preview.Image.Height * zoom))); viewport.AutoScrollMinSize = preview.Size; }
    public async Task<WorkRecord?> ImportPathAsync(string sourcePath, string album = "", CancellationToken ct = default)
    {
        if (Context.ProjectId is null) throw new InvalidOperationException("프로젝트를 선택하세요.");
        if (IsDirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요.");
        if (importing) throw new InvalidOperationException("사진 가져오기가 진행 중입니다.");
        importing = true;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, photoOperations.Token);
        var token = linked.Token; var context = Context;
        try
        {
            var meta = await Task.Run(() => ReadImageInfo(sourcePath), token); token.ThrowIfCancellationRequested();
            var asset = await Services.Assets.ImportAsync(Services.Actor, context.ProjectId!, sourcePath, token);
            var rows = await Services.Data.ListAsync(Services.Actor, new("photos", context.ProjectId), token);
            var existing = rows.FirstOrDefault(r => r.Fields.GetValueOrDefault("assetId") == asset.Id);
            var saved = existing ?? await Services.Data.SaveAsync(Services.Actor, new(null, "photos", context.ProjectId, 0, new() { { "title", asset.OriginalName }, { "album", album }, { "assetId", asset.Id }, { "sha256", asset.Sha256 }, { "capturedAt", meta.Date }, { "camera", meta.Camera }, { "category", "현장" } }), token);
            if (!IsDisposed && Context == context && !IsDirty) { await RefreshAsync(); SelectVisibleRecord(saved.Id); }
            if (existing is not null) { Notice.Text = "이미 등록된 원본 사진입니다."; return null; }
            return saved;
        }
        finally { importing = false; }
    }

    private static (string Date, string Camera) ReadImageInfo(string source)
    {
        using var stream = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read); using var image = Image.FromStream(stream, true, true);
        if ((long)image.Width * image.Height > 20_000_000) throw new InvalidOperationException("사진은 2천만 화소 이하의 사본으로 가져오세요. 원본은 변경되지 않습니다.");
        string Read(int id) { try { return image.PropertyIdList.Contains(id) ? System.Text.Encoding.ASCII.GetString(image.GetPropertyItem(id)!.Value ?? []).TrimEnd('\0') : ""; } catch { return ""; } }
        return (Read(0x9003), Read(0x0110));
    }
    private async Task ImportDialogAsync() { if (IsDirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요."); using var dialog = new OpenFileDialog() { Multiselect = true, Filter = "사진|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.tif;*.tiff", Title = "원본 보존 · 로컬 사진 가져오기" }; if (dialog.ShowDialog(this) != DialogResult.OK) return; foreach (var file in dialog.FileNames) await ImportPathAsync(file); await RefreshAsync(); }
    private async void SelectionUpdated(object? sender, EventArgs e) { await RunAsync(async () => { try { await ShowSelectedAsync(); } catch (OperationCanceledException) { /* A newer selection owns the preview and notice. */ } }); }
    private async Task ShowSelectedAsync()
    {
        if (photoDisposed || IsDisposed) return;
        previewCancellation.Cancel(); previewCancellation.Dispose(); previewCancellation = new(); var ct = previewCancellation.Token; var generation = ++previewGeneration;
        var oldPreview = preview.Image; preview.Image = null; oldPreview?.Dispose(); var id = Values.GetValueOrDefault("assetId"); if (string.IsNullOrWhiteSpace(id)) return; var asset = await Services.Assets.GetAsync(Services.Actor, id, ct);
        Bitmap thumbnail;
        if (cache.TryGetValue(asset.Sha256, out var cached)) thumbnail = new(cached);
        else
        {
            thumbnail = await Task.Run(() => { using var stream = File.OpenRead(asset.StoredPath); using var image = Image.FromStream(stream, true, true); var scale = Math.Min(1, 1200.0 / Math.Max(image.Width, image.Height)); return new Bitmap(image, new Size(Math.Max(1, (int)(image.Width * scale)), Math.Max(1, (int)(image.Height * scale)))); }, ct);
            if (generation != previewGeneration || ct.IsCancellationRequested || IsDisposed) { thumbnail.Dispose(); return; }
            if (cache.Count >= 24) { var first = cache.Keys.First(); cache[first].Dispose(); cache.Remove(first); }
            cache[asset.Sha256] = new(thumbnail);
        }
        if (generation != previewGeneration || ct.IsCancellationRequested || IsDisposed) { thumbnail.Dispose(); return; }
        var old = preview.Image; preview.Image = thumbnail; old?.Dispose(); fit = true; ResizePreview();
    }
    private async Task ExportOriginalAsync() { var id = Values.GetValueOrDefault("assetId"); if (id is null) return; var asset = await Services.Assets.GetAsync(Services.Actor, id); using var dialog = new SaveFileDialog() { FileName = asset.OriginalName, OverwritePrompt = true, InitialDirectory = Path.Combine(Services.DataRoot, "exports") }; if (dialog.ShowDialog(this) == DialogResult.OK) await Services.Assets.ExportAsync(Services.Actor, id, dialog.FileName); }
    private Task ExportEditedAsync() { if (preview.Image is null) return Task.CompletedTask; var dir = Path.Combine(Services.DataRoot, "exports"); Directory.CreateDirectory(dir); var path = Path.Combine(dir, "edited-" + Guid.NewGuid().ToString("N") + ".png"); using var copy = new Bitmap(preview.Image); copy.Save(path, ImageFormat.Png); Notice.Text = "별도 편집본 저장: " + path; return Task.CompletedTask; }
    protected override void Dispose(bool disposing) { if (disposing && !photoDisposed) { DisposeThumbnails(); photoDisposed = true; photoOperations.Cancel(); photoOperations.Dispose(); SelectionChanged -= SelectionUpdated; previewGeneration++; previewCancellation.Cancel(); previewCancellation.Dispose(); preview.Image?.Dispose(); preview.Image = null; foreach (var image in cache.Values) image.Dispose(); cache.Clear(); } base.Dispose(disposing); }
}
