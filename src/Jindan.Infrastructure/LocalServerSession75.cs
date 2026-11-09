using Jindan.Contracts;
using Jindan.Infrastructure.Cloud;
using static Jindan.Core.DomainRules;

namespace Jindan.Infrastructure;

public sealed partial class LocalWorkspace
{
    readonly Dictionary<Identity, (StoredUser User, CloudReadService71 Cloud)> serverSessions75 = new(ReferenceEqualityComparer.Instance);
    public Task<Identity> OpenServerSession75Async(CloudReadService71 cloud, CancellationToken ct = default) => Locked(() =>
    {
        var member = cloud.Member75; // Only a successful server login can populate this.
        var user = new StoredUser { Id = member.Uid, DisplayName = member.Name, Role = member.Role };
        var actor = new Identity(user.Id, user.DisplayName, user.Role, Array.Empty<string>());
        serverSessions75.Add(actor, (user, cloud)); return actor;
    }, ct);
    internal Task CacheServerProjects75Async(Identity actor, IReadOnlyList<WorkRecord> rows, CancellationToken ct) => Locked(() =>
    {
        Require(serverSessions75.ContainsKey(actor), "UNAUTHENTICATED", "Server session required.");
        var user = Actor(actor); var next = Clone();
        // This cache lives in a separate server/account directory. Original local work stays untouched.
        next.Records.RemoveAll(r => r.Kind == "projects"); next.Records.AddRange(rows.Select(Copy));
        Commit(next, ct); user.ProjectIds = rows.Select(r => r.Id).ToArray(); return true;
    }, ct);
}

public sealed class ServerProjectData75(LocalWorkspace local, CloudReadService71 cloud, Identity session) : IWorkspaceData
{
    void Verify(Identity actor) { if (!ReferenceEquals(actor, session) || !cloud.Status.BoardConnected || cloud.Member75.Uid != session.Id) throw new UnauthorizedAccessException(); }
    public async Task<IReadOnlyList<WorkRecord>> ListAsync(Identity actor, RecordQuery query, CancellationToken ct = default)
    {
        Verify(actor);
        if (query.Kind != "projects") return await local.ListAsync(actor, query, ct);
        var rows = await cloud.ListProjects75Async(ct); await local.CacheServerProjects75Async(actor, rows, ct);
        return rows.Where(r => query.Search.Length == 0 || r.Fields.Values.Any(v => v.Contains(query.Search, StringComparison.OrdinalIgnoreCase))).ToArray();
    }
    public async Task<WorkRecord> SaveAsync(Identity actor, RecordDraft draft, CancellationToken ct = default)
    {
        Verify(actor);
        if (draft.Kind != "projects") return await local.SaveAsync(actor, draft, ct);
        if (draft.Id is not null) throw new InvalidOperationException("기존 서버 프로젝트 수정은 아직 연결되지 않았습니다.");
        return await cloud.CreateProject75Async(Guid.NewGuid().ToString("N"), draft.Fields, ct);
    }
    public Task DeleteAsync(Identity actor, string kind, string id, long expectedRevision, bool confirmed, CancellationToken ct = default)
    { Verify(actor); return kind == "projects" ? Task.FromException(new InvalidOperationException("서버 프로젝트 삭제는 아직 연결되지 않았습니다.")) : local.DeleteAsync(actor, kind, id, expectedRevision, confirmed, ct); }
    public void RegisterSchema(RecordSchema schema) => local.RegisterSchema(schema);
    public Task<string> ExportAsync(Identity actor, string destination, CancellationToken ct = default) { Verify(actor); return local.ExportAsync(actor, destination, ct); }
    public Task<ImportPreview> PreviewImportAsync(Identity actor, string path, CancellationToken ct = default) => Task.FromException<ImportPreview>(new NotSupportedException());
    public Task ImportAsync(Identity actor, ImportPreview preview, bool confirmed, CancellationToken ct = default) => Task.FromException(new NotSupportedException());
    public Task RollbackLastImportAsync(Identity actor, bool confirmed, CancellationToken ct = default) => Task.FromException(new NotSupportedException());
}
