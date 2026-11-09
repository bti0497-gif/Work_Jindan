using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jindan.Contracts.ProjectFiles;

namespace Jindan.Startup;

// Local paths belong to this PC/account, not to portable project files or Firestore.
public sealed class ProjectFileCatalog(string path)
{
    public sealed record Entry(string ProjectId, string FilePath, string Fingerprint);
    public static string Location(string preferencesPath, string serverId, string memberId)
    {
        var scope = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new[] { serverId, memberId }))));
        return Path.Combine(Path.GetDirectoryName(Path.GetFullPath(preferencesPath))!, "project-files", scope + ".json");
    }
    Entry[] Read()
    {
        if (!File.Exists(path)) return [];
        var entries = JsonSerializer.Deserialize<Entry[]>(File.ReadAllText(path)) ?? throw new InvalidDataException();
        if (entries.Any(e => e is null || string.IsNullOrEmpty(e.ProjectId) || string.IsNullOrEmpty(e.FilePath) || !Path.IsPathFullyQualified(e.FilePath) || e.Fingerprint is not { Length: 64 })) throw new InvalidDataException();
        return entries;
    }
    public string FilePathFor(string projectId) => Read().LastOrDefault(e => e.ProjectId == projectId)?.FilePath ?? "";
    public void Remember(string projectId, string filePath, ProjectFile77 file)
    {
        var fullPath = Path.GetFullPath(filePath);
        var entries = Read().Where(e => !string.Equals(e.FilePath, fullPath, StringComparison.OrdinalIgnoreCase)).ToList();
        entries.Add(new(projectId, fullPath, ProjectFileCodec.Fingerprint(file)));
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try { File.WriteAllText(temporary, JsonSerializer.Serialize(entries)); File.Move(temporary, path, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public ProjectChoice? FindExisting(ProjectFile77 file, string currentServer, IReadOnlyList<ProjectChoice> accessible)
    {
        // A copied/renamed file remains the same project. A matching name or path
        // alone is never evidence: check identity/content and current server access.
        var hash = ProjectFileCodec.Fingerprint(file);
        foreach (var entry in Read().Reverse().Where(e => e.Fingerprint == hash))
        {
            var match = accessible.FirstOrDefault(p => p.Id == entry.ProjectId);
            if (match is not null) return match;
        }
        return file.Server.ProjectId == currentServer ? accessible.FirstOrDefault(p => p.Id == file.Project.Id) : null;
    }
}
