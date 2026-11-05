using System.Drawing.Drawing2D;
using System.Security.Cryptography;
using Jindan.Contracts;
namespace Jindan.Modules.Photos;

public sealed partial class PhotoDocument
{
    const string ThumbnailColumn = "photoThumbnail"; const int ThumbnailEdge = 120, ThumbnailCacheLimit = 96, VisibleLoadLimit = 24;
    readonly Dictionary<string, Bitmap> thumbnails = new(StringComparer.Ordinal); readonly LinkedList<string> thumbnailLru = new();
    readonly SemaphoreSlim thumbnailSlots = new(2, 2); readonly System.Windows.Forms.Timer thumbnailDebounce = new() { Interval = 70 };
    CancellationTokenSource thumbnailCancellation = new(); long thumbnailGeneration; volatile bool thumbnailsDisposed; int thumbnailActiveBatches, thumbnailSlotsDisposed;
    public int ThumbnailCacheCount => thumbnails.Count;
    public int ThumbnailActiveBatchCount => Volatile.Read(ref thumbnailActiveBatches);
    public int ThumbnailCacheCapacity => ThumbnailCacheLimit;
    public int VisibleThumbnailCount => Grid.Rows.Cast<DataGridViewRow>().Count(r => r.Cells[ThumbnailColumn].Value is Image);
    void InitializeThumbnails() { var column = new DataGridViewImageColumn() { Name = ThumbnailColumn, HeaderText = "사진", ImageLayout = DataGridViewImageCellLayout.Zoom, Width = 130, MinimumWidth = 80, AutoSizeMode = DataGridViewAutoSizeColumnMode.None }; column.DefaultCellStyle.NullValue = null; Grid.Columns.Add(column); column.DisplayIndex = 0; Grid.RowTemplate.Height = 128; Grid.Scroll += ThumbnailViewChanged; Grid.Resize += ThumbnailViewChanged; VisibleChanged += ThumbnailViewChanged; thumbnailDebounce.Tick += ThumbnailTick; }
    void ThumbnailViewChanged(object? sender, EventArgs e) => QueueThumbnails();
    void QueueThumbnails() { if (thumbnailsDisposed || IsDisposed) return; thumbnailGeneration++; thumbnailCancellation.Cancel(); thumbnailCancellation.Dispose(); thumbnailCancellation = new(); thumbnailDebounce.Stop(); thumbnailDebounce.Start(); }
    async void ThumbnailTick(object? sender, EventArgs e) { thumbnailDebounce.Stop(); if (thumbnailsDisposed || IsDisposed) return; var generation = thumbnailGeneration; var ct = thumbnailCancellation.Token; Interlocked.Increment(ref thumbnailActiveBatches); var batch = LoadVisibleThumbnailsAsync(generation, ct); _ = batch.ContinueWith(_ => { if (Interlocked.Decrement(ref thumbnailActiveBatches) == 0 && thumbnailsDisposed) DisposeThumbnailSlots(); }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default); try { await batch; } catch (OperationCanceledException) { } catch { if (!thumbnailsDisposed && !IsDisposed) Notice.Text = "일부 사진 썸네일을 읽을 수 없습니다. 원본은 보존됩니다."; } }
    void ClearRowThumbnails(bool onlyHidden = false) { if (!Grid.Columns.Contains(ThumbnailColumn)) return; foreach (DataGridViewRow row in Grid.Rows) { if (onlyHidden && row.Visible && row.Displayed) continue; var image = row.Cells[ThumbnailColumn].Value as Image; row.Cells[ThumbnailColumn].Value = null; image?.Dispose(); } }
    async Task LoadVisibleThumbnailsAsync(long generation, CancellationToken ct)
    {
        if (thumbnailsDisposed || IsDisposed) return; ClearRowThumbnails(true); var project = Context.ProjectId; var visible = Grid.Rows.Cast<DataGridViewRow>().Where(r => r.Visible && r.Displayed && r.Tag is WorkRecord && r.Cells[ThumbnailColumn].Value is null).Take(VisibleLoadLimit).ToArray(); await Task.WhenAll(visible.Select(async row =>
        {
            await thumbnailSlots.WaitAsync(ct); Bitmap? bitmap = null; try
            {
                ct.ThrowIfCancellationRequested(); if (thumbnailsDisposed || IsDisposed || generation != thumbnailGeneration) return; var record = (WorkRecord)row.Tag!; var assetId = record.Fields.GetValueOrDefault("assetId"); if (string.IsNullOrWhiteSpace(assetId)) return; var asset = await Task.Run(() => Services.Assets.GetAsync(Services.Actor, assetId, ct), ct); if (thumbnailsDisposed || IsDisposed || generation != thumbnailGeneration || Context.ProjectId != project) return;
                if (thumbnails.TryGetValue(asset.Sha256, out var cached)) { bitmap = new Bitmap(cached); thumbnailLru.Remove(asset.Sha256); thumbnailLru.AddLast(asset.Sha256); } else { bitmap = await Task.Run(() => DecodeThumbnail(asset.StoredPath, asset.Sha256, ct), ct); if (thumbnailsDisposed || IsDisposed || generation != thumbnailGeneration || Context.ProjectId != project || ct.IsCancellationRequested) return; thumbnails[asset.Sha256] = new Bitmap(bitmap); thumbnailLru.AddLast(asset.Sha256); while (thumbnails.Count > ThumbnailCacheLimit) { var key = thumbnailLru.First!.Value; thumbnailLru.RemoveFirst(); thumbnails[key].Dispose(); thumbnails.Remove(key); } }
                if (thumbnailsDisposed || IsDisposed || generation != thumbnailGeneration || Context.ProjectId != project || ct.IsCancellationRequested || row.DataGridView != Grid || !row.Visible || !row.Displayed || row.Tag is not WorkRecord current || current.Id != record.Id) return; var old = row.Cells[ThumbnailColumn].Value as Image; row.Cells[ThumbnailColumn].Value = bitmap; bitmap = null; old?.Dispose(); row.ErrorText = "";
            }
            catch (OperationCanceledException) { }
            catch { if (!thumbnailsDisposed && !IsDisposed && generation == thumbnailGeneration && row.DataGridView == Grid) row.ErrorText = "사진 파일을 읽을 수 없습니다. 잠금·손상·원본 해시를 확인하세요."; }
            finally { bitmap?.Dispose(); thumbnailSlots.Release(); }
        }));
    }
    static Bitmap DecodeThumbnail(string path, string expectedSha, CancellationToken ct) { ct.ThrowIfCancellationRequested(); using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read); if (Convert.ToHexStringLower(SHA256.HashData(stream)) != expectedSha) throw new InvalidDataException("Asset hash changed before thumbnail decode."); stream.Position = 0; ct.ThrowIfCancellationRequested(); using var image = Image.FromStream(stream, true, true); if ((long)image.Width * image.Height > 20_000_000) throw new InvalidDataException("사진 픽셀 제한을 초과했습니다."); var scale = Math.Min(1, ThumbnailEdge / (double)Math.Max(image.Width, image.Height)); var output = new Bitmap(Math.Max(1, (int)Math.Round(image.Width * scale)), Math.Max(1, (int)Math.Round(image.Height * scale))); try { using var g = Graphics.FromImage(output); g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(image, new Rectangle(Point.Empty, output.Size)); ct.ThrowIfCancellationRequested(); return output; } catch { output.Dispose(); throw; } }
    public override async Task RefreshAsync(string search = "") { if (IsDirty) { await base.RefreshAsync(search); return; } thumbnailGeneration++; thumbnailCancellation.Cancel(); ClearRowThumbnails(); await base.RefreshAsync(search); if (!thumbnailsDisposed && !IsDisposed) QueueThumbnails(); }
    public override void SetContext(DocumentContext context) { if (importing) throw new InvalidOperationException("사진 가져오기가 끝난 뒤 프로젝트를 바꾸세요."); if (IsDirty) { base.SetContext(context); return; } thumbnailGeneration++; thumbnailCancellation.Cancel(); ClearRowThumbnails(); ClearThumbnailCache(); base.SetContext(context); }
    void ClearThumbnailCache() { foreach (var image in thumbnails.Values) image.Dispose(); thumbnails.Clear(); thumbnailLru.Clear(); }
    void DisposeThumbnailSlots() { if (Interlocked.Exchange(ref thumbnailSlotsDisposed, 1) == 0) thumbnailSlots.Dispose(); }
    void DisposeThumbnails() { if (thumbnailsDisposed) return; thumbnailsDisposed = true; thumbnailGeneration++; thumbnailDebounce.Stop(); thumbnailDebounce.Tick -= ThumbnailTick; thumbnailDebounce.Dispose(); thumbnailCancellation.Cancel(); thumbnailCancellation.Dispose(); Grid.Scroll -= ThumbnailViewChanged; Grid.Resize -= ThumbnailViewChanged; VisibleChanged -= ThumbnailViewChanged; ClearRowThumbnails(); ClearThumbnailCache();/* Pending decoders own their bitmap until generation checks discard it. */if (Volatile.Read(ref thumbnailActiveBatches) == 0) DisposeThumbnailSlots(); }
}
