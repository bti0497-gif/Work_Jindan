using System.IO;
using Jindan.Startup;

internal static class ProjectCatalogChecks78
{
    public static void Run(Action<bool, string> check, string output)
    {
        var folder = Path.Combine(output, "catalog78-" + Guid.NewGuid().ToString("N"));
        var path = ProjectFileCatalog.Location(Path.Combine(folder, "login-id.json"), "company", "member");
        var catalog = new ProjectFileCatalog(path);
        var file = ProjectFileChecks77.Sample();
        ProjectChoice Row(string id) => new(id, file.Project.Name, file.Project.StartDate, file.Project.EndDate, file.Project.Description);
        var original = Row(file.Project.Id); var imported = Row("registered-project");
        check(catalog.FilePathFor(original.Id) == "", "untracked server project has no invented local path");
        check(catalog.FindExisting(file, "source-company", [original]) == original, "same-server project file resolves existing ID instead of registering a duplicate");
        check(catalog.FindExisting(file, "company", [original]) is null, "foreign server ID collision does not identify an existing project");
        var firstPath = Path.Combine(folder, "chosen-folder", "project.tzprj");
        catalog.Remember(imported.Id, firstPath, file);
        var restored = new ProjectFileCatalog(path);
        check(restored.FilePathFor(imported.Id) == Path.GetFullPath(firstPath), "chosen file path survives catalog reload");
        check(restored.FindExisting(file, "company", [imported]) == imported, "reopening imported file after restart resolves previous registration");
        check(restored.FindExisting(file, "company", []) is null, "local catalog cannot bypass current server membership or deleted project checks");
        var moved = Path.Combine(folder, "other-folder", "renamed.tzprj");
        restored.Remember(imported.Id, moved, file);
        check(restored.FilePathFor(imported.Id) == moved && restored.FindExisting(file, "company", [imported]) == imported, "renamed/copied file keeps project identity and updates displayed path");
        var unrelated = file with { Project = file.Project with { Id = "different-project" } };
        check(restored.FindExisting(unrelated, "company", [imported]) is null, "equal project name alone cannot merge unrelated projects");
        restored.Remember("different-project", moved, unrelated);
        check(restored.FilePathFor(imported.Id) == firstPath && restored.FilePathFor("different-project") == moved, "reused filename is not attributed to two projects");
        check(ProjectFileCatalog.Location(Path.Combine(folder, "login-id.json"), "company", "other") != path
            && ProjectFileCatalog.Location(Path.Combine(folder, "login-id.json"), "other-company", "member") != path,
            "local file history is separated by account and company server");
        var brokenPath = Path.Combine(folder, "broken.json"); File.WriteAllText(brokenPath, "broken catalog");
        try { new ProjectFileCatalog(brokenPath).Remember(imported.Id, firstPath, file); throw new Exception("corrupt catalog silently replaced"); }
        catch (System.Text.Json.JsonException) { check(File.ReadAllText(brokenPath) == "broken catalog", "damaged file history is preserved rather than silently overwritten"); }
    }
}
