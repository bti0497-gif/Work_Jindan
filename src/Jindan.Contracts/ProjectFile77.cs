namespace Jindan.Contracts.ProjectFiles;

public sealed record ProjectHeader77(string Id, string Name, string StartDate, string EndDate, string Description, string CreatedAt, string CreatedBy);
public sealed record ProjectServer77(string Provider, string ProjectId, string ProjectsCollection, string ProcessesCollection, string ScopeProjectId);
public sealed record ProjectDriveFile77(string Id, string Name);
public sealed record ProjectDrive77(string Provider, string RootFolderId, ProjectDriveFile77[] Files);
public sealed record ProjectReport77(string FileId, string Name, string Kind);
public sealed record ProjectReports77(string FolderId, ProjectReport77[] Documents);
public sealed record ProjectFile77
{
    public string Format { get; init; } = "deojon.project";
    public int Version { get; init; } = 1;
    public required ProjectHeader77 Project { get; init; }
    public ProjectDrive77 Drive { get; init; } = new("google-drive", "", []);
    public ProjectReports77 Reports { get; init; } = new("", []);
    public required ProjectServer77 Server { get; init; }
    public Dictionary<string, string> Settings { get; init; } = [];
}
