using Jindan.Contracts;
using Jindan.Contracts.Cloud;
using Jindan.Contracts.ProjectFiles;
using Jindan.Infrastructure.Cloud;

namespace Jindan.Startup.Server;

public sealed class FirebaseStartupServer(CloudReadService71 cloud, ServerSettings75 settings) : IStartupServer, IProjectFileServer
{
    public bool IsAuthenticated => cloud.Status.BoardConnected && Member is not null;
    public string CurrentServerId => settings.ProjectId;
    public StartupMember? Member { get; private set; }
    public async Task SignInAsync(string id, string password, CancellationToken ct)
    {
        Disconnect();
        try { var member = await cloud.Authenticate75Async(settings, id, password, ct); ct.ThrowIfCancellationRequested(); Member = new(member.Uid, member.Name); }
        catch { Disconnect(); throw; }
    }
    static ProjectChoice Choice(WorkRecord record) => new(record.Id, record.Fields.GetValueOrDefault("title", ""), record.Fields.GetValueOrDefault("startDate", ""), record.Fields.GetValueOrDefault("endDate", ""), record.Fields.GetValueOrDefault("content", ""));
    public async Task<IReadOnlyList<ProjectChoice>> ListProjectsAsync(CancellationToken ct) => (await cloud.ListProjects75Async(ct)).Select(Choice).ToArray();
    public async Task<ProjectChoice> CreateProjectAsync(string requestId, NewProject input, CancellationToken ct)
    {
        // A failed response may follow a successful commit. Resolve the same document before retrying.
        var existing = (await ListProjectsAsync(ct)).FirstOrDefault(p => p.Id == requestId);
        if (existing is not null) return Match(existing, input);
        try
        {
            var record = await cloud.CreateProject75Async(requestId, new()
            {
                ["title"] = input.Name.Trim(), ["startDate"] = input.Start.ToString("yyyy-MM-dd"),
                ["endDate"] = input.End.ToString("yyyy-MM-dd"), ["content"] = input.Description
            }, ct);
            return Choice(record);
        }
        catch (CloudConnectionException error) when (error.Message == "CLOUD_REQUEST_REJECTED")
        {
            var committed = (await ListProjectsAsync(ct)).FirstOrDefault(p => p.Id == requestId);
            if (committed is null) throw;
            return Match(committed, input);
        }
    }
    static ProjectChoice Match(ProjectChoice existing, NewProject input)
    {
        if (existing.Name != input.Name.Trim() || existing.StartDate != input.Start.ToString("yyyy-MM-dd") || existing.EndDate != input.End.ToString("yyyy-MM-dd") || existing.Description != input.Description)
            throw new CloudConnectionException("PROJECT_REQUEST_CONFLICT");
        return existing;
    }
    public void Disconnect() { Member = null; cloud.Disconnect(); }
    public async Task<ProjectFile77> ExportProjectFileAsync(string projectId, CancellationToken ct)
    {
        var file = await cloud.ExportProjectFile77Async(projectId, ct); ProjectFileCodec.Serialize(file); return file;
    }
    public async Task<ProjectChoice> ImportProjectFileAsync(string requestId, ProjectFile77 document, CancellationToken ct)
    {
        var hash = ProjectFileCodec.Fingerprint(document);
        var id = await cloud.ImportProjectFile77Async(requestId, hash, document, ct);
        return new(id, document.Project.Name, document.Project.StartDate, document.Project.EndDate, document.Project.Description);
    }
    public void Dispose() { Member = null; cloud.Dispose(); }
}
