using Jindan.Contracts;
using static Jindan.Core.DomainRules;
namespace Jindan.Infrastructure;

public sealed partial class LocalWorkspace
{
    void ValidateAssetFields(Dictionary<string, string> fields) { if (fields.GetValueOrDefault("assetId", "") is not { Length: > 0 } id) return; var asset = _state.Assets.SingleOrDefault(a => a.Id == id); Require(asset is not null, "ASSET_NOT_FOUND", "The linked immutable asset is unavailable."); if (fields.TryGetValue("sha256", out var sha) && sha.Length > 0) Require(sha == asset.Sha256, "ASSET_BINDING", "The displayed source hash must match the linked asset."); if (fields.TryGetValue("size", out var size) && size.Length > 0) Require(size == asset.Size.ToString(System.Globalization.CultureInfo.InvariantCulture), "ASSET_BINDING", "The displayed byte size must match the linked asset."); }
    static void ValidateRelations(RecordDraft draft, Dictionary<string, string> fields, WorkRecord? old, IEnumerable<WorkRecord> rows, bool allowHistoricalParents = false)
    {
        var active = rows.Where(r => !r.Deleted).ToArray(); var all = allowHistoricalParents ? rows.ToArray() : active;
        if (draft.Kind == "file-folders")
        {
            var title = fields.GetValueOrDefault("title", ""); Require(title.Length is > 0 and <= 200 && !title.Any(c => char.IsControl(c) || "<>:\"/\\|?*".Contains(c)) && title is not ("." or ".."), "FOLDER_NAME", "Use a bounded local folder name without path characters.");
            var parent = fields.GetValueOrDefault("parentId", ""); var visited = new HashSet<string>(); while (parent.Length > 0) { Require(visited.Add(parent) && visited.Count <= 64 && parent != old?.Id, "FOLDER_CYCLE", "Folder ancestry must be acyclic and at most64 levels."); var ancestor = all.SingleOrDefault(r => r.Id == parent && r.Kind == "file-folders" && r.ProjectId == draft.ProjectId); Require(ancestor is not null, "PROJECT_SCOPE", "The parent folder is outside this project."); parent = ancestor!.Fields.GetValueOrDefault("parentId", ""); }
            Require(!active.Any(r => r.Kind == draft.Kind && r.Id != old?.Id && r.ProjectId == draft.ProjectId && r.Fields.GetValueOrDefault("parentId", "") == fields.GetValueOrDefault("parentId", "") && string.Equals(r.Fields.GetValueOrDefault("title"), title, StringComparison.OrdinalIgnoreCase)), "DUPLICATE_FOLDER", "A folder with this name already exists here.");
        }
        if (draft.Kind == "files")
        {
            var folder = fields.GetValueOrDefault("folderId", ""); Require(folder.Length == 0 || all.Any(r => r.Id == folder && r.Kind == "file-folders" && r.ProjectId == draft.ProjectId), "PROJECT_SCOPE", "The file folder is outside this project.");
            Require(!active.Any(r => r.Kind == "files" && r.Id != old?.Id && r.ProjectId == draft.ProjectId && r.Fields.GetValueOrDefault("folderId", "") == folder && string.Equals(r.Fields.GetValueOrDefault("title"), fields.GetValueOrDefault("title"), StringComparison.OrdinalIgnoreCase)), "DUPLICATE_FILE", "A different file already has this name in the folder.");
        }
        if (draft.Kind == "board" && fields.GetValueOrDefault("parentId", "") is { Length: > 0 } post) { var parent = all.SingleOrDefault(r => r.Id == post && r.Kind == "board"); Require(parent is not null && parent.Id != old?.Id && parent.Fields.GetValueOrDefault("parentId", "").Length == 0, "PARENT_SCOPE", "A reply must refer to an existing undeleted original post."); }
    }
    static string[] AttachmentIds(Dictionary<string, string> fields) => fields.GetValueOrDefault("attachmentIds", "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Concat(fields.GetValueOrDefault("attachmentId", "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)).Distinct().ToArray();
    static void ValidateImportLinks(ExportData data) { foreach (var row in data.Records.Where(r => !r.Deleted)) { ValidateRelations(new(row.Id, row.Kind, row.ProjectId, row.Revision, row.Fields), row.Fields, row, data.Records, allowHistoricalParents: true); foreach (var pair in row.Fields.Where(p => p.Key == "assetId" || p.Key.EndsWith("AssetId", StringComparison.Ordinal))) if (pair.Value.Length > 0) Require(data.Assets.Any(a => a.Id == pair.Value && a.ProjectId == row.ProjectId), "IMPORT_ASSET", "An imported asset link has no matching project asset."); if (row.Kind == "board") { var ids = AttachmentIds(row.Fields); Require(ids.Length <= 10 && ids.All(id => data.Assets.Any(a => a.Id == id)), "IMPORT_ASSET", "An imported board attachment is missing or exceeds10 files."); } } }
}
