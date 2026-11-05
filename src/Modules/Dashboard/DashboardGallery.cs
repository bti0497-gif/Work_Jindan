using Jindan.Contracts;

namespace Jindan.Modules.Dashboard;

public sealed partial class DashboardDocument
{
    private readonly Panel galleryPanel = new() { Dock = DockStyle.Bottom, Height = 210, Padding = new Padding(4), Name = "DashboardGallery" };
    private readonly Label galleryStatus = new() { Dock = DockStyle.Top, Height = 34, Name = "DashboardGalleryStatus" };
    private readonly FlowLayoutPanel gallery = new() { Dock = DockStyle.Fill, AutoScroll = true, WrapContents = false, Name = "DashboardGalleryItems" };
    private readonly HashSet<Form> galleryPreviews = [];

    private void InitializeGallery()
    {
        galleryPanel.Controls.Add(gallery); galleryPanel.Controls.Add(galleryStatus); Controls.Add(galleryPanel);
        galleryStatus.Text = "사진·도면 미리보기 · 최대 8개 · 로컬 등록 목록 순서";
    }

    private void ClearGallery()
    {
        foreach (Control control in gallery.Controls.Cast<Control>().ToArray())
        {
            if (control is Button button) { var image = button.Image; button.Image = null; image?.Dispose(); }
            control.Dispose();
        }
        gallery.Controls.Clear();
    }

    private async Task RefreshGalleryAsync(IReadOnlyList<WorkRecord> records, long expectedGeneration, CancellationToken ct)
    {
        var context = Context;
        var items = GalleryItems.Select(records, context.ProjectId);
        galleryStatus.Text = "사진·도면 미리보기 · " + items.Count + "/최대 8개 · 로컬 등록 목록 역순 (종류별)" + (context.ProjectId is null ? " · 접근 가능한 전체 프로젝트" : " · 선택 프로젝트");
        foreach (var item in items)
        {
            ct.ThrowIfCancellationRequested();
            if (IsDisposed || expectedGeneration != generation || context != Context) return;
            var tile = new Button() { Width = 160, Height = 150, Text = item.Record.Fields.GetValueOrDefault("title", "사진"), TextAlign = ContentAlignment.BottomCenter, TextImageRelation = TextImageRelation.ImageAboveText, ImageAlign = ContentAlignment.MiddleCenter, Tag = item, AutoEllipsis = true, Name = "GalleryItem-" + item.Record.Id, AccessibleDescription = "선택한 원본 자산의 로컬 미리보기" };
            tile.Click += async (_, _) => await OpenGalleryItemAsync(item);
            gallery.Controls.Add(tile);
            if (item.IsCad) { tile.Text = "도면 · " + tile.Text + "\n직접 미리보기"; continue; }
            Bitmap? bitmap = null;
            try
            {
                var asset = await GalleryItems.ReauthorizeAsync(services, item, ct);
                bitmap = await Task.Run(() => GalleryItems.Decode(asset, 112, ct), ct);
                if (IsDisposed || ct.IsCancellationRequested || expectedGeneration != generation || context != Context || tile.IsDisposed) continue;
                tile.Image = bitmap; bitmap = null;
            }
            catch (OperationCanceledException) { throw; }
            catch { if (!tile.IsDisposed && expectedGeneration == generation) { tile.Text = "미리보기 불가\n" + tile.Text; tile.AccessibleDescription = "파일 손상·잠금·지원 형식·접근 권한을 확인하세요. 원본은 변경되지 않습니다."; } }
            finally { bitmap?.Dispose(); }
        }
    }

    public async Task OpenGalleryItemAsync(GalleryItem item)
    {
        if (IsDisposed || Disposing) return;
        var context = Context; var expectedGeneration = generation; var ct = pending.Token;
        Bitmap? image = null;
        try
        {
            var asset = await GalleryItems.ReauthorizeAsync(services, item, ct);
            if (context != Context || expectedGeneration != generation || ct.IsCancellationRequested || IsDisposed) return;
            if (item.IsCad)
            {
                if (!services.TryOpenDocument("files", item.Record.ProjectId, asset.StoredPath)) galleryStatus.Text = "파일 관리 모듈을 확인하세요.";
                else galleryStatus.Text = "선택 도면 「" + asset.OriginalName + "」의 원본 보존 미리보기를 엽니다.";
                return;
            }
            image = await Task.Run(() => GalleryItems.Decode(asset, 1200, ct), ct);
            if (context != Context || expectedGeneration != generation || ct.IsCancellationRequested || IsDisposed) return;
            var preview = new Form() { Text = asset.OriginalName + " · 원본 보존 미리보기", Width = 1000, Height = 760, Name = "DashboardAssetPreview", StartPosition = FormStartPosition.CenterParent };
            var picture = new PictureBox() { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, Image = image, BackColor = Color.FromArgb(235, 238, 243) }; image = null;
            preview.Controls.Add(picture);
            galleryPreviews.Add(preview);
            preview.FormClosed += (_, _) => { galleryPreviews.Remove(preview); var displayed = picture.Image; picture.Image = null; displayed?.Dispose(); };
            preview.Show(this);
        }
        catch (OperationCanceledException) { }
        catch { if (!IsDisposed && context == Context && expectedGeneration == generation) galleryStatus.Text = "미리보기를 열 수 없습니다. 새로고침 후 접근 권한·파일·형식을 확인하세요."; }
        finally { image?.Dispose(); }
    }

    private void CloseGalleryPreviews() { foreach (var preview in galleryPreviews.ToArray()) { preview.Close(); preview.Dispose(); } galleryPreviews.Clear(); }
}
