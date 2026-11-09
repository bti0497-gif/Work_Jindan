using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Jindan.Contracts.ProjectFiles;

namespace Jindan.Startup;

public interface IProjectFileServer
{
    string CurrentServerId { get; }
    Task<ProjectFile77> ExportProjectFileAsync(string projectId, CancellationToken ct);
    Task<ProjectChoice> ImportProjectFileAsync(string requestId, ProjectFile77 document, CancellationToken ct);
}

public static class ProjectFileCodec
{
    // Metadata and Drive references only. Large document bytes remain in Drive.
    public const int MaxJsonBytes = 256 * 1024;
    static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow, MaxDepth = 16 };
    static void Require(bool condition) { if (!condition) throw new InvalidDataException("프로젝트 파일의 형식이나 연결 정보를 확인해 주세요."); }
    static bool Id(string? value) => value is { Length: > 0 and <= 128 } && value is not "." and not ".." && !value.Any(c => char.IsControl(c) || c is '/' or '\\');
    static bool Text(string? value, int max, bool required = false) => value is not null && (!required || !string.IsNullOrWhiteSpace(value)) && Encoding.UTF8.GetByteCount(value) <= max;
    static bool Date(string? value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    static bool Range(string? start, string? end) => Date(start) && Date(end) && string.CompareOrdinal(start, end) <= 0;
    public static void Validate(ProjectFile77 value)
    {
        Require(value.Format == "deojon.project" && value.Version == 1 && value.Project is not null && value.Server is not null && value.Drive is not null && value.Reports is not null && value.Settings is not null);
        var p = value.Project!;
        Require(Id(p.Id) && Text(p.Name, 300, true) && Range(p.StartDate, p.EndDate) && Text(p.Description, 100000) && Text(p.CreatedBy, 300));
        Require(p.CreatedAt is not null && (p.CreatedAt.Length == 0 || DateTimeOffset.TryParse(p.CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.None, out _)));
        Require(value.Server!.Provider == "firebase" && Id(value.Server.ProjectId) && Id(value.Server.ScopeProjectId) && value.Server.ProjectsCollection == "jindan_projects" && value.Server.ProcessesCollection == "jindan_processes");
        Require(value.Drive!.Provider == "google-drive" && value.Drive.RootFolderId is not null && (value.Drive.RootFolderId.Length == 0 || Id(value.Drive.RootFolderId)) && value.Drive.Files is { Length: <= 2000 });
        Require(value.Drive.Files!.All(f => f is not null && Id(f.Id) && Text(f.Name, 1000, true)) && value.Drive.Files.Select(f => f.Id).Distinct().Count() == value.Drive.Files.Length);
        Require(value.Reports!.FolderId is not null && (value.Reports.FolderId.Length == 0 || Id(value.Reports.FolderId)) && value.Reports.Documents is { Length: <= 1000 });
        Require(value.Reports.Documents!.All(r => r is not null && Id(r.FileId) && Text(r.Name, 1000, true) && Text(r.Kind, 128)) && value.Reports.Documents.Select(r => r.FileId).Distinct().Count() == value.Reports.Documents.Length);
        Require(value.Settings!.Count <= 256 && value.Settings.All(x => Text(x.Key, 128, true) && Text(x.Value, 8000) && !new[] { "password", "token", "secret", "credential", "cookie", "apikey" }.Any(s => x.Key.Contains(s, StringComparison.OrdinalIgnoreCase))));
    }
    public static byte[] Serialize(ProjectFile77 document)
    {
        Validate(document); var bytes = JsonSerializer.SerializeToUtf8Bytes(document, Options); Require(bytes.Length <= MaxJsonBytes); return bytes;
    }
    public static string Fingerprint(ProjectFile77 document) => Convert.ToHexStringLower(SHA256.HashData(Serialize(document)));
    public static ProjectFile77 Deserialize(ReadOnlySpan<byte> bytes)
    {
        Require(bytes.Length <= MaxJsonBytes);
        using var json = JsonDocument.Parse(bytes.ToArray()); RejectDuplicates(json.RootElement);
        var document = JsonSerializer.Deserialize<ProjectFile77>(bytes, Options) ?? throw new InvalidDataException(); Validate(document); return document;
    }
    static void RejectDuplicates(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject()) { Require(names.Add(property.Name)); RejectDuplicates(property.Value); }
        }
        else if (element.ValueKind == JsonValueKind.Array) foreach (var child in element.EnumerateArray()) RejectDuplicates(child);
    }
    public static async Task<ProjectFile77> ReadAsync(string path, CancellationToken ct)
    {
        Require(Path.GetExtension(path).Equals(".tzprj", StringComparison.OrdinalIgnoreCase));
        using var input = File.OpenRead(path); Require(input.Length <= MaxJsonBytes + 65536);
        using var archive = new ZipArchive(input, ZipArchiveMode.Read);
        Require(archive.Entries.Count == 1 && archive.Entries[0].FullName == "project.json" && archive.Entries[0].Length <= MaxJsonBytes);
        using var stream = archive.Entries[0].Open(); using var memory = new MemoryStream(); var buffer = new byte[16384]; int count;
        while ((count = await stream.ReadAsync(buffer, ct)) > 0) { Require(memory.Length + count <= MaxJsonBytes); await memory.WriteAsync(buffer.AsMemory(0, count), ct); }
        return Deserialize(memory.ToArray());
    }
    public static async Task SaveAsync(string path, ProjectFile77 document, CancellationToken ct)
    {
        Require(Path.GetExtension(path).Equals(".tzprj", StringComparison.OrdinalIgnoreCase));
        var bytes = Serialize(document); var full = Path.GetFullPath(path); var temporary = full + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                using var archive = new ZipArchive(output, ZipArchiveMode.Create);
                using var entry = archive.CreateEntry("project.json", CompressionLevel.Optimal).Open(); await entry.WriteAsync(bytes, ct);
            }
            ct.ThrowIfCancellationRequested(); File.Move(temporary, full, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
