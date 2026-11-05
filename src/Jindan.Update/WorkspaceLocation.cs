using System.Text.Json;

using Jindan.ModuleHost;

namespace Jindan.Update;

public sealed record WorkspaceRegistration(int Schema, string InstallationRoot, string DataRoot, bool IsManaged);

/// <summary>Records the actual local workspace selected by the host. Never writes to or migrates external workspace data.</summary>
public static class WorkspaceLocation
{
    public const string DescriptorName = "workspace-location.json";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow, WriteIndented = true };
    private static string Canonical(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 4096 || !Path.IsPathFullyQualified(path)) throw new PackageException("WORKSPACE_DESCRIPTOR_INVALID", "Workspace location must be a bounded absolute path.");
        return Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
    }
    private static void NoLinks(string path)
    {
        for (var cursor = Path.GetFullPath(path); cursor is not null; cursor = Path.GetDirectoryName(cursor)) if (Directory.Exists(cursor) || File.Exists(cursor)) if ((File.GetAttributes(cursor) & FileAttributes.ReparsePoint) != 0) throw new PackageException("WORKSPACE_DESCRIPTOR_INVALID", "Linked workspace locations are not supported by this update policy.");
    }
    public static WorkspaceRegistration Register(string installationRoot, string dataRoot)
    {
        var root = Canonical(installationRoot); var data = Canonical(dataRoot); NoLinks(root); NoLinks(data);
        if (!Directory.Exists(root) || !Directory.Exists(data)) throw new PackageException("WORKSPACE_DESCRIPTOR_INVALID", "Register an existing application and workspace after local store creation.");
        var value = new WorkspaceRegistration(1, root, data, data.Equals(Canonical(Path.Combine(root, "data")), StringComparison.OrdinalIgnoreCase));
        var descriptor = Path.Combine(root, DescriptorName); if (File.Exists(descriptor)) NoLinks(descriptor);
        var temporary = descriptor + ".tmp-" + Guid.NewGuid().ToString("N");
        try { using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { JsonSerializer.Serialize(stream, value, Json); stream.Flush(true); } File.Move(temporary, descriptor, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return value;
    }
    public static WorkspaceRegistration ReadForUpdate(string installationRoot, bool schemaChanges)
    {
        var root = Canonical(installationRoot); NoLinks(root); var managed = Canonical(Path.Combine(root, "data")); var descriptor = Path.Combine(root, DescriptorName);
        if (!File.Exists(descriptor)) { NoLinks(managed); return new(1, root, managed, IsManaged: true); }
        NoLinks(descriptor); if (new FileInfo(descriptor).Length > 16384) throw new PackageException("WORKSPACE_DESCRIPTOR_INVALID", "Workspace descriptor exceeds its limit.");
        WorkspaceRegistration registration;
        try
        {
            var bytes = File.ReadAllBytes(descriptor); using var parsed = JsonDocument.Parse(bytes); if (parsed.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException();
            var names = new HashSet<string>(StringComparer.Ordinal); foreach (var property in parsed.RootElement.EnumerateObject()) if (!names.Add(property.Name)) throw new JsonException();
            if (!names.SetEquals(["schema", "installationRoot", "dataRoot", "isManaged"])) throw new JsonException();
            registration = JsonSerializer.Deserialize<WorkspaceRegistration>(bytes, Json) ?? throw new JsonException();
        }
        catch (JsonException) { throw new PackageException("WORKSPACE_DESCRIPTOR_INVALID", "Workspace descriptor is malformed; automatic update is blocked."); }
        var data = Canonical(registration.DataRoot); var registeredRoot = Canonical(registration.InstallationRoot); NoLinks(data);
        var isManaged = data.Equals(managed, StringComparison.OrdinalIgnoreCase);
        if (registration.Schema != 1 || !registeredRoot.Equals(root, StringComparison.OrdinalIgnoreCase) || registration.IsManaged != isManaged) throw new PackageException("WORKSPACE_DESCRIPTOR_INVALID", "Workspace descriptor does not match this installation and location policy.");
        if (schemaChanges && !isManaged) throw new PackageException("CUSTOM_WORKSPACE_MIGRATION_REQUIRED", "This custom workspace needs a separately reviewed migration; the updater will not migrate an empty managed directory instead.");
        return registration;
    }
}
