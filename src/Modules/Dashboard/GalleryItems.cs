using System.Drawing.Drawing2D;
using System.Security.Cryptography;
using Jindan.Contracts;

namespace Jindan.Modules.Dashboard;

public sealed record GalleryItem(WorkRecord Record, string AssetId, bool IsCad);

// Local registration order is intentionally distinct from unavailable Drive modifiedTime.
// Callers provide an authorized query result; opening rechecks the record and asset again.
public static class GalleryItems
{
    public const int Capacity = 8;
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".avif" };

    public static IReadOnlyList<GalleryItem> Select(IEnumerable<WorkRecord> authorizedRecords, string? projectId)
    {
        return authorizedRecords.Reverse()
            .Where(r => !r.Deleted && r.ProjectId is not null && (projectId is null || r.ProjectId == projectId))
            .Where(r => r.Kind is "photos" or "files" && !string.IsNullOrWhiteSpace(r.Fields.GetValueOrDefault("assetId")))
            .Select(r => new GalleryItem(r with { Fields = new(r.Fields) }, r.Fields["assetId"], IsCad(r)))
            .Where(item => item.Record.Kind == "photos" || item.IsCad || ImageExtensions.Contains(Path.GetExtension(item.Record.Fields.GetValueOrDefault("title", ""))))
            .DistinctBy(item => (item.Record.ProjectId, item.AssetId))
            .Take(Capacity).ToArray();
    }

    private static bool IsCad(WorkRecord record) => Path.GetExtension(record.Fields.GetValueOrDefault("title", "")).ToLowerInvariant() is ".dwg" or ".dxf";

    public static async Task<AssetInfo> ReauthorizeAsync(IWorkspaceServices services, GalleryItem item, CancellationToken ct)
    {
        var current = (await services.Data.ListAsync(services.Actor, new(item.Record.Kind, item.Record.ProjectId), ct))
            .SingleOrDefault(r => r.Id == item.Record.Id);
        if (current is null || current.Deleted || current.ProjectId != item.Record.ProjectId || current.Revision != item.Record.Revision || current.Fields.GetValueOrDefault("assetId") != item.AssetId)
            throw new InvalidOperationException("사진·도면 목록이 바뀌었습니다. 대시보드를 새로고침하세요.");
        var asset = await services.Assets.GetAsync(services.Actor, item.AssetId, ct);
        var expected = current.Fields.GetValueOrDefault("sha256");
        if (!string.IsNullOrEmpty(expected) && !string.Equals(expected, asset.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("사진·도면 원본 해시를 확인하세요.");
        return asset;
    }

    public static Bitmap Decode(AssetInfo asset, int edge, CancellationToken ct)
    {
        if (edge is < 1 or > 1200) throw new ArgumentOutOfRangeException(nameof(edge));
        ct.ThrowIfCancellationRequested();
        using var stream = new FileStream(asset.StoredPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length > 32 * 1024 * 1024 || stream.Length != asset.Size) throw new InvalidDataException("미리보기 파일 크기를 확인하세요.");
        if (!string.Equals(Convert.ToHexStringLower(SHA256.HashData(stream)), asset.Sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("미리보기 원본 해시가 변경됐습니다.");
        stream.Position = 0; ct.ThrowIfCancellationRequested();
        using var image = Image.FromStream(stream, true, true);
        if ((long)image.Width * image.Height > 20_000_000) throw new InvalidDataException("미리보기 픽셀 제한을 초과했습니다.");
        var scale = Math.Min(1, edge / (double)Math.Max(image.Width, image.Height));
        var bitmap = new Bitmap(Math.Max(1, (int)Math.Round(image.Width * scale)), Math.Max(1, (int)Math.Round(image.Height * scale)));
        try
        {
            using var graphics = Graphics.FromImage(bitmap);
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.DrawImage(image, new Rectangle(Point.Empty, bitmap.Size));
            ct.ThrowIfCancellationRequested();
            return bitmap;
        }
        catch { bitmap.Dispose(); throw; }
    }
}
