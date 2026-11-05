using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jindan.Contracts;
using Jindan.Core;
using static Jindan.Core.DomainRules;

namespace Jindan.Infrastructure;

public sealed partial class LocalWorkspace
{
    const int LegacyJsonLimit = 32 * 1024 * 1024;
    static readonly Dictionary<string, string> LegacyTableKeys = new(StringComparer.Ordinal) { ["프로젝트관리"] = "projects", ["공정관리"] = "processes", ["할일관리"] = "tasks", ["jindan_db_프로젝트관리"] = "projects", ["jindan_db_공정관리"] = "processes", ["jindan_db_할일관리"] = "tasks" };
    static readonly HashSet<string> LegacyOmittedFields = new(["author", "authorId", "ownerUid", "createdAt", "updatedAt", "password", "passwordHash", "salt", "iterations", "role", "roles", "permissions", "token", "accessToken", "refreshToken", "apiKey", "auth", "users", "user", "email", "uid", "person_id", "projectIds", "disabled"], StringComparer.OrdinalIgnoreCase);
    static void ValidateOriginalImport(ImportPreview preview)
    {
        if (preview.OriginalSourcePath is null && preview.OriginalSourceSha256 is null) return;
        Require(preview.OriginalSourcePath is not null && Path.IsPathFullyQualified(preview.OriginalSourcePath) && preview.OriginalSourceSha256 is { Length: 64 }, "STALE_PREVIEW", "The legacy original binding is incomplete.");
        Require(File.Exists(preview.OriginalSourcePath) && new FileInfo(preview.OriginalSourcePath).Length <= LegacyJsonLimit, "STALE_PREVIEW", "The reviewed legacy source is absent or changed.");
        CheckNoLinks(Path.GetDirectoryName(preview.OriginalSourcePath)!); Require((File.GetAttributes(preview.OriginalSourcePath) & FileAttributes.ReparsePoint) == 0, "IMPORT_PATH", "Linked legacy source files are forbidden.");
        Require(FileHash(preview.OriginalSourcePath) == preview.OriginalSourceSha256, "STALE_PREVIEW", "The original legacy JSON differs from its preview; review it again.");
    }
    public Task<ImportPreview> PreviewLegacyImportAsync(Identity actor, string path, CancellationToken ct = default) => Locked(() =>
    {
        Admin(Actor(actor)); Require(Path.IsPathFullyQualified(path) && File.Exists(path), "IMPORT_PATH", "Select an existing local legacy JSON file.");
        CheckNoLinks(Path.GetDirectoryName(path)!); Require((File.GetAttributes(path) & FileAttributes.ReparsePoint) == 0, "IMPORT_PATH", "Linked legacy source files are forbidden."); Require(new FileInfo(path).Length is > 0 and <= LegacyJsonLimit, "IMPORT_LIMIT", "Legacy JSON must fit32MiB.");
        var bytes = File.ReadAllBytes(path); ct.ThrowIfCancellationRequested(); var originalHash = Convert.ToHexStringLower(SHA256.HashData(bytes)); var data = new ExportData(); var warnings = new List<string> { "Legacy identity/authentication/roles/permissions and sync queues are omitted; imported copies belong to the current local administrator.", "Original work text/dates/deleted flags are preserved. Tasks receive a derived first-line display title; their full content stays unchanged.", "This preview creates a separate canonical package only; confirmation remaps record/project IDs and supports rollback before later mutations." };
        try
        {
            using var document = JsonDocument.Parse(bytes.AsMemory(bytes.AsSpan().StartsWith(new byte[] { 0xef, 0xbb, 0xbf }) ? 3 : 0), new JsonDocumentOptions { MaxDepth = 48 }); RejectLegacyDuplicates(document.RootElement);
            Require(document.RootElement.ValueKind == JsonValueKind.Object, "LEGACY_FORMAT", "Legacy JSON must be an explicit work-table object.");
            var input = document.RootElement; bool formal = input.TryGetProperty("format", out var format);
            if (formal) { Require(format.ValueKind == JsonValueKind.String && format.GetString() == "jindan-legacy-work/1" && input.TryGetProperty("tables", out var tableObject) && tableObject.ValueKind == JsonValueKind.Object, "LEGACY_FORMAT", "Unsupported legacy envelope."); input = input.GetProperty("tables"); }
            var seen = new HashSet<string>(StringComparer.Ordinal); var ids = new HashSet<string>(StringComparer.Ordinal); int ignored = 0;
            foreach (var bucket in input.EnumerateObject())
            {
                ct.ThrowIfCancellationRequested(); string? kind = null; if (formal) { if (bucket.Name is "projects" or "processes" or "tasks") kind = bucket.Name; } else LegacyTableKeys.TryGetValue(bucket.Name, out kind);
                if (kind is null) { ignored++; continue; }
                Require(seen.Add(kind), "IMPORT_DUPLICATE", "The same legacy table appears under multiple aliases.");
                JsonDocument? stored = null; var rows = bucket.Value;
                try
                {
                    if (!formal && rows.ValueKind == JsonValueKind.String) { var text = rows.GetString()!; Require(Encoding.UTF8.GetByteCount(text) <= LegacyJsonLimit, "IMPORT_LIMIT", "Serialized legacy table exceeds its limit."); stored = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 48 }); rows = stored.RootElement; RejectLegacyDuplicates(rows); }
                    Require(rows.ValueKind == JsonValueKind.Array, "LEGACY_FORMAT", "Each named legacy work table must contain an array, or an exact localStorage serialized array.");
                    foreach (var row in rows.EnumerateArray())
                    {
                        ct.ThrowIfCancellationRequested(); Require(row.ValueKind == JsonValueKind.Object && data.Records.Count < 10000, "IMPORT_LIMIT", "Legacy rows must be bounded objects."); var id = LegacyText(row, "id", 128, true); LegacyId(id); Require(ids.Add(id), "IMPORT_DUPLICATE", "Legacy record identities must be unique across the selected tables.");
                        var mapped = kind == "tasks" ? new HashSet<string>(["id", "content", "date", "isPublic", "deleted"], StringComparer.Ordinal) : kind == "projects" ? new HashSet<string>(["id", "title", "content", "startDate", "endDate", "deleted"], StringComparer.Ordinal) : new HashSet<string>(["id", "title", "content", "startDate", "endDate", "projectId", "isCompleted", "deleted"], StringComparer.Ordinal);
                        foreach (var field in row.EnumerateObject()) Require(mapped.Contains(field.Name) || LegacyOmittedFields.Contains(field.Name), "LEGACY_UNMAPPED_FIELD", "An undocumented work field requires explicit mapping before migration; no text is silently discarded.");
                        var deleted = LegacyBool(row, "deleted"); var fields = new Dictionary<string, string>(StringComparer.Ordinal); string? project = null;
                        if (kind == "tasks")
                        {
                            var content = LegacyText(row, "content", 20000, true); var date = LegacyDate(row, "date"); fields["title"] = LegacyTaskTitle(content); fields["content"] = content; fields["startDate"] = date; fields["endDate"] = date; fields["isPublic"] = LegacyBool(row, "isPublic") ? "true" : "false";
                        }
                        else
                        {
                            fields["title"] = LegacyText(row, "title", 300, true); fields["startDate"] = LegacyDate(row, "startDate"); fields["endDate"] = LegacyDate(row, "endDate"); Require(string.CompareOrdinal(fields["startDate"], fields["endDate"]) <= 0, "DATE", "Legacy end date precedes start date.");
                            fields["content"] = LegacyText(row, "content", 600000, false);
                            if (kind == "processes") { project = LegacyText(row, "projectId", 128, true); LegacyId(project); fields["isCompleted"] = LegacyBool(row, "isCompleted") ? "true" : "false"; }
                        }
                        fields = ValidateFields(Schema(kind), fields); data.Records.Add(new(id, kind, project, "legacy-import-unassigned", 1, deleted, fields));
                    }
                }
                finally { stored?.Dispose(); }
            }
            Require(seen.Count > 0, "LEGACY_FORMAT", "No explicit supported legacy work table was found.");
            foreach (var row in data.Records.Where(r => r.ProjectId is not null)) Require(data.Records.Any(p => IsProject(p.Kind) && p.Id == row.ProjectId), "PROJECT_SCOPE", "A legacy process references a project absent from this import.");
            if (ignored > 0) warnings.Add($"Ignored {ignored} non-work top-level section(s); no identity/security values were copied."); var deletedCount = data.Records.Count(r => r.Deleted); if (deletedCount > 0) warnings.Add($"Preserved {deletedCount} historical deleted record(s); they are not revived as active work.");
        }
        catch (WorkspaceException) { throw; }
        catch (Exception error) when (error is JsonException or InvalidOperationException or DecoderFallbackException) { throw new WorkspaceException("LEGACY_FORMAT", "The legacy JSON does not match the documented bounded table format."); }
        var previewRoot = Path.Combine(_root, "previews"); Directory.CreateDirectory(previewRoot); CheckNoLinks(previewRoot); var directory = Path.Combine(previewRoot, Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory); var canonical = Path.Combine(directory, "legacy-work-import.zip"); var temporary = canonical + ".tmp";
        try
        {
            var manifest = JsonSerializer.SerializeToUtf8Bytes(data, Json); Require(manifest.Length <= 16 * 1024 * 1024, "IMPORT_LIMIT", "Converted legacy manifest exceeds16MiB."); using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None)) { using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true)) { using var entry = zip.CreateEntry("data.json", CompressionLevel.Fastest).Open(); entry.Write(manifest); } output.Flush(true); }
            ct.ThrowIfCancellationRequested(); File.Move(temporary, canonical);
            var (verified, hash) = ReadPackage(canonical, ct); var preview = new ImportPreview(canonical, hash, verified.Records.Count, verified.SchemaVersion, warnings) { OriginalSourcePath = Path.GetFullPath(path), OriginalSourceSha256 = originalHash }; ValidateOriginalImport(preview); return preview;
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }, ct);
    static string LegacyText(JsonElement row, string key, int utf8Limit, bool required)
    {
        if (!row.TryGetProperty(key, out var value)) { Require(!required, "LEGACY_FIELD", "A required legacy work field is absent."); return ""; }
        Require(value.ValueKind == JsonValueKind.String, "LEGACY_FIELD", "Legacy work text fields must be strings."); var text = value.GetString()!; Require((!required || !string.IsNullOrWhiteSpace(text)) && Encoding.UTF8.GetByteCount(text) <= utf8Limit, "LEGACY_FIELD", "Legacy work text is empty or exceeds its documented byte limit."); return text;
    }
    static bool LegacyBool(JsonElement row, string key) { if (!row.TryGetProperty(key, out var value)) return false; Require(value.ValueKind is JsonValueKind.True or JsonValueKind.False, "LEGACY_FIELD", "Legacy boolean flags must be JSON booleans."); return value.GetBoolean(); }
    static string LegacyDate(JsonElement row, string key) { var value = LegacyText(row, key, 10, true); Require(DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "DATE", "Legacy dates must be real yyyy-MM-dd dates."); return value; }
    static void LegacyId(string id) => Require(id.Length <= 128 && id is not "." and not ".." && !id.Any(c => char.IsControl(c) || c is '/' or '\\'), "IMPORT_ID", "Legacy work IDs contain unsafe path/control characters.");
    static string LegacyTaskTitle(string content) { var first = content.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(line => !string.IsNullOrWhiteSpace(line))?.Trim() ?? content.Trim(); var result = new StringBuilder(); var bytes = 0; foreach (var rune in first.EnumerateRunes()) { if (bytes + rune.Utf8SequenceLength > 300) break; result.Append(rune.ToString()); bytes += rune.Utf8SequenceLength; } return result.ToString(); }
    static void RejectLegacyDuplicates(JsonElement element) { if (element.ValueKind == JsonValueKind.Object) { var keys = new HashSet<string>(StringComparer.Ordinal); foreach (var item in element.EnumerateObject()) { Require(keys.Add(item.Name), "IMPORT_DUPLICATE", "Duplicate JSON properties are forbidden in legacy input."); RejectLegacyDuplicates(item.Value); } } else if (element.ValueKind == JsonValueKind.Array) foreach (var item in element.EnumerateArray()) RejectLegacyDuplicates(item); }
}

