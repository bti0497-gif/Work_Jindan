using Jindan.Desktop.Contracts;
using Jindan.Contracts;

namespace Jindan.Modules.Files;

public sealed partial class FileDocument
{
    public async Task<(WorkRecord Record, AssetInfo Asset)> ResolveExistingSourceAsync(string path, CancellationToken ct = default)
    {
        if (IsDirty) throw new InvalidOperationException("변경 내용을 먼저 저장하세요.");
        var context = Context;
        if (context.ProjectId is null || !Path.IsPathFullyQualified(path) || path.StartsWith("\\\\", StringComparison.Ordinal)) throw new InvalidOperationException("선택 프로젝트의 등록 자료 경로가 필요합니다.");
        var fullPath = Path.GetFullPath(path);
        var records = await Services.Data.ListAsync(Services.Actor, new("files", context.ProjectId), ct);
        if (records.Count > 10000) throw new InvalidOperationException("자료 목록 한도를 확인하세요.");
        AssetInfo? resolved = null;
        if (Services is IReportWorkspaceAccess existing) resolved = await existing.ResolveExistingReportAssetAsync(context, fullPath, ct);
        else
        {
            // Optional providers still have to re-authorize each candidate; never import an arbitrary path.
            foreach (var record in records)
            {
                ct.ThrowIfCancellationRequested(); var id = record.Fields.GetValueOrDefault("assetId"); if (string.IsNullOrWhiteSpace(id)) continue;
                var asset = await Services.Assets.GetAsync(Services.Actor, id, ct);
                if (string.Equals(Path.GetFullPath(asset.StoredPath), fullPath, StringComparison.OrdinalIgnoreCase)) { resolved = asset; break; }
            }
        }
        if (resolved is null) throw new InvalidOperationException("선택 프로젝트에 등록된 원본 자료가 아닙니다.");
        var current = records.FirstOrDefault(r => !r.Deleted && r.ProjectId == context.ProjectId && r.Fields.GetValueOrDefault("assetId") == resolved.Id);
        if (current is null || current.Fields.GetValueOrDefault("sha256", resolved.Sha256) != resolved.Sha256) throw new InvalidOperationException("등록 자료와 원본 버전이 다릅니다.");
        if (IsDisposed || Context != context || IsDirty) throw new InvalidOperationException("자료를 여는 동안 문서 문맥이 바뀌었습니다.");
        return (current, resolved);
    }
    public async Task OpenSourceAsync(string path)
    {
        await Ready.WaitAsync(TimeSpan.FromSeconds(15));
        var context = Context;
        var resolved = await ResolveExistingSourceAsync(path, folderLifetime.Token);
        var extension = Path.GetExtension(resolved.Asset.OriginalName).ToLowerInvariant();
        if (extension is not (".dwg" or ".dxf")) throw new InvalidOperationException("직접 도면 미리보기는 등록된 DWG/DXF 자료에서 지원합니다.");
        await NavigateFolderAsync(resolved.Record.Fields.GetValueOrDefault("folderId", ""), folderLifetime.Token);
        if (Context != context || IsDisposed || IsDirty) throw new InvalidOperationException("자료를 여는 동안 문서 문맥이 바뀌었습니다.");
        await SelectExistingAsync(resolved.Record.Id, resolved.Record.Revision, folderLifetime.Token);
        var current = await ResolveExistingSourceAsync(path, folderLifetime.Token);
        if (current.Record.Revision != resolved.Record.Revision || Context != context || IsDisposed || IsDirty) throw new InvalidOperationException("도면 자료가 변경됐습니다. 다시 선택하세요.");
        await CadPreviewWindow.ShowAsync(Services, Context, current.Asset);
    }
}
