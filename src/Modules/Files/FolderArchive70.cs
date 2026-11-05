using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Jindan.Contracts;
namespace Jindan.Modules.Files;

public sealed partial class FileDocument
{
    long archiveContextGeneration;
    void EnsureArchiveContext(DocumentContext captured, long generation)
    {
        if (IsDisposed || Context != captured || archiveContextGeneration != generation || Services.Actor.Id != captured.UserId) throw new InvalidOperationException("내보내기 중 프로젝트 문맥이 바뀌었습니다. 다시 선택하세요.");
    }
    static void EnsureArchivePath(string path) => Jindan.Infrastructure.Drive.DriveBoundary.LocalPath(path);
    static string ArchiveRows(IReadOnlyList<WorkRecord> rows) => JsonSerializer.Serialize(rows.OrderBy(r => r.Id, StringComparer.Ordinal).Select(r => new { r.Id, r.Kind, r.ProjectId, r.OwnerId, r.Revision, r.Deleted, fields = r.Fields.OrderBy(p => p.Key, StringComparer.Ordinal).ToArray() }));
    static string ArchiveSegment(string name)
    {
        var chars = name.Select(c => c < 32 || "\\/:*?\"<>|".Contains(c) ? '_' : c).ToArray(); var clean = new string(chars).TrimEnd(' ', '.');
        return clean.Length == 0 || clean is "." or ".." ? "unnamed" : clean[..Math.Min(180, clean.Length)];
    }
    public Task<string> ExportFolderZipAsync(string folderId, CancellationToken ct = default) => ExportArchiveCoreAsync(folderId, null, ct);
    Task<string> ExportSelectedZipCoreAsync(IEnumerable<string> ids, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested(); var bounded = ids.Take(1001).ToArray(); if (bounded.Length > 1000 || bounded.Any(string.IsNullOrWhiteSpace)) throw new InvalidOperationException("선택 식별자 수량을 확인하세요."); var selected = bounded.ToHashSet(StringComparer.Ordinal); if (selected.Count is < 1 or > 500) throw new InvalidOperationException("1~500개 자료를 선택하세요."); return ExportArchiveCoreAsync(null, selected, ct);
    }
    async Task<string> ExportArchiveCoreAsync(string? folderId, HashSet<string>? exactSelection, CancellationToken ct)
    {
        var captured = Context; var generation = archiveContextGeneration; if (captured.ProjectId is null) throw new InvalidOperationException("프로젝트를 선택하세요.");
        var folderRows = await Services.Data.ListAsync(Services.Actor, new("file-folders", captured.ProjectId), ct); EnsureArchiveContext(captured, generation); var fileRows = await Services.Data.ListAsync(Services.Actor, new("files", captured.ProjectId), ct); EnsureArchiveContext(captured, generation);
        bool MetadataMatches(IReadOnlyList<WorkRecord> nextFolders, IReadOnlyList<WorkRecord> nextFiles) => (exactSelection is not null || ArchiveRows(folderRows) == ArchiveRows(nextFolders)) && ArchiveRows(fileRows.Where(r => exactSelection is null || exactSelection.Contains(r.Id)).ToArray()) == ArchiveRows(nextFiles.Where(r => exactSelection is null || exactSelection.Contains(r.Id)).ToArray());
        var selected = new List<(string Path, WorkRecord Row)>(); var directories = new List<string>();
        if (exactSelection is not null)
        {
            var rows = fileRows.Where(r => exactSelection.Contains(r.Id)).OrderBy(r => r.Id, StringComparer.Ordinal).ToArray(); if (rows.Length != exactSelection.Count) throw new InvalidOperationException("권한·자료 목록을 다시 확인하세요."); int ordinal = 0; foreach (var row in rows) selected.Add(($"files/{++ordinal:D4}-" + ArchiveSegment(row.Fields["title"]), row));
        }
        else
        {
            if (folderId is null || folderId.Length > 0 && !folderRows.Any(r => r.Id == folderId)) throw new InvalidOperationException("프로젝트 소속 폴더를 선택하세요.");
            var queue = new Queue<(string Id, string Path, int Depth)>(); queue.Enqueue((folderId, "files/", 0)); var visited = new HashSet<string>();
            while (queue.TryDequeue(out var folder))
            {
                ct.ThrowIfCancellationRequested(); if (!visited.Add(folder.Id) || folder.Depth > 20 || visited.Count > 1000) throw new InvalidOperationException("폴더 순환·깊이·수량 제한을 확인하세요."); directories.Add(folder.Path);
                var ordinal = 0; foreach (var row in fileRows.Where(r => r.Fields.GetValueOrDefault("folderId", "") == folder.Id).OrderBy(r => r.Id, StringComparer.Ordinal)) { selected.Add((folder.Path + (++ordinal).ToString("D4") + "-" + ArchiveSegment(row.Fields["title"]), row)); if (selected.Count > 500) throw new InvalidOperationException("폴더 자료는 500개 이하로 나누세요."); }
                // Files and folders share the ordinal namespace to avoid A vs A/
                // collisions when an extractor normalizes directory markers.
                foreach (var child in folderRows.Where(r => r.Fields.GetValueOrDefault("parentId", "") == folder.Id).OrderBy(r => r.Id, StringComparer.Ordinal)) queue.Enqueue((child.Id, folder.Path + (++ordinal).ToString("D4") + "-" + ArchiveSegment(child.Fields["title"]) + "/", folder.Depth + 1));
            }
        }
        var assets = new List<(string Path, AssetInfo Asset, string Title, string RecordId)>(); long total = 0;
        foreach (var selection in selected) { var asset = await Services.Assets.GetAsync(Services.Actor, selection.Row.Fields["assetId"], ct); EnsureArchiveContext(captured, generation); if (asset.Id != selection.Row.Fields["assetId"] || asset.Sha256 != selection.Row.Fields.GetValueOrDefault("sha256") || !long.TryParse(selection.Row.Fields.GetValueOrDefault("size"), out var declaredSize) || declaredSize != asset.Size) throw new InvalidDataException("선택 자료와 원본 자산의 결합이 다릅니다."); checked { total += asset.Size; } if (total > 256L * 1024 * 1024) throw new InvalidOperationException("자료는 256MB 이하로 나누세요."); assets.Add((selection.Path, asset, selection.Row.Fields["title"], selection.Row.Id)); }
        EnsureArchivePath(Services.DataRoot); var directory = Path.Combine(Services.DataRoot, "exports"); EnsureArchivePath(directory); Directory.CreateDirectory(directory); EnsureArchivePath(directory);
        var token = Guid.NewGuid().ToString("N"); var output = Path.Combine(directory, (exactSelection is null ? "folder-" : "selected-") + token + ".zip"); var stage = Path.Combine(directory, ".folder-stage-" + token + ".tmp"); var ownsStage = false;
        try
        {
            EnsureArchivePath(stage); using (var file = new FileStream(stage, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None))
            {
                ownsStage = true; using (var zip = new ZipArchive(file, ZipArchiveMode.Create, leaveOpen: true))
                {
                    foreach (var path in directories) zip.CreateEntry(path);
                    foreach (var asset in assets)
                    {
                        ct.ThrowIfCancellationRequested(); EnsureArchiveContext(captured, generation); EnsureArchivePath(asset.Asset.StoredPath); using var input = new FileStream(asset.Asset.StoredPath, FileMode.Open, FileAccess.Read, FileShare.Read); var actual = Convert.ToHexStringLower(await SHA256.HashDataAsync(input, ct)); if (actual != asset.Asset.Sha256 || input.Length != asset.Asset.Size) throw new InvalidDataException("원본 자산 해시가 달라 ZIP을 만들지 않았습니다."); input.Position = 0; using var entry = zip.CreateEntry(asset.Path, CompressionLevel.Fastest).Open(); await input.CopyToAsync(entry, ct);
                    }
                    using var info = zip.CreateEntry("manifest.json").Open(); await JsonSerializer.SerializeAsync(info, new { schema = exactSelection is null ? "jindan-local-folder-archive/70" : "jindan-local-selection-archive/70", projectId = captured.ProjectId, folderId, files = assets.Select(a => new { path = a.Path, title = a.Title, recordId = a.RecordId, assetId = a.Asset.Id, a.Asset.OriginalName, a.Asset.Sha256, a.Asset.Size }) }, cancellationToken: ct);
                }
                ct.ThrowIfCancellationRequested(); file.Flush(true);
            }
            // Re-read persisted authorization, folder membership, names/revisions and
            // immutable-asset bindings after all I/O; only a complete stage may publish.
            var freshFolders = await Services.Data.ListAsync(Services.Actor, new("file-folders", captured.ProjectId), ct); EnsureArchiveContext(captured, generation);
            var freshFiles = await Services.Data.ListAsync(Services.Actor, new("files", captured.ProjectId), ct); EnsureArchiveContext(captured, generation);
            if (!MetadataMatches(freshFolders, freshFiles)) throw new InvalidOperationException("내보내기 중 자료가 변경되었습니다. 다시 선택하세요.");
            foreach (var asset in assets) { var fresh = await Services.Assets.GetAsync(Services.Actor, asset.Asset.Id, ct); EnsureArchiveContext(captured, generation); if (fresh != asset.Asset) throw new InvalidDataException("자료 자산의 결합이 바뀌었습니다."); }
            freshFolders = await Services.Data.ListAsync(Services.Actor, new("file-folders", captured.ProjectId), ct); EnsureArchiveContext(captured, generation); freshFiles = await Services.Data.ListAsync(Services.Actor, new("files", captured.ProjectId), ct); EnsureArchiveContext(captured, generation);
            if (!MetadataMatches(freshFolders, freshFiles)) throw new InvalidOperationException("게시 직전 자료의 결합이 바뀌었습니다. 다시 선택하세요.");
            ct.ThrowIfCancellationRequested(); EnsureArchivePath(Services.DataRoot); EnsureArchivePath(directory); EnsureArchivePath(stage); EnsureArchivePath(output);
            File.Move(stage, output, false); ownsStage = false; return output;
        }
        finally { if (ownsStage && File.Exists(stage)) { EnsureArchivePath(stage); File.Delete(stage); } }
    }
    async Task ExportCurrentFolderZipAsync() => Notice.Text = "새 폴더 사본 저장: " + await ExportFolderZipAsync(currentFolder);
}
