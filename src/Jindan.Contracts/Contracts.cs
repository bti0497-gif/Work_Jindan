namespace Jindan.Contracts;

public static class Contract { public const int Major = 1; public const string Worker = "jindan-worker/1"; public const int DataSchema = 1; }
public sealed record Identity(string Id, string DisplayName, string Role, IReadOnlyList<string> ProjectIds, bool IsSynthetic = false);
public sealed record DocumentContext(string ContextId, string ModuleId, string? ProjectId, string UserId);
public sealed record WorkRecord(string Id, string Kind, string? ProjectId, string OwnerId, long Revision, bool Deleted, Dictionary<string, string> Fields);
public sealed record RecordDraft(string? Id, string Kind, string? ProjectId, long ExpectedRevision, Dictionary<string, string> Fields);
public sealed record RecordQuery(string Kind, string? ProjectId = null, string Search = "", bool IncludeDeleted = false);
public sealed record FieldSpec(string Key, string Label, string Type = "text", bool Required = false, string[]? Choices = null);
public sealed record RecordSchema(string Kind, string Label, IReadOnlyList<FieldSpec> Fields, bool ProjectScoped = true);
public sealed record AssetInfo(string Id, string Sha256, string OriginalName, long Size, string MediaType, string StoredPath);
public sealed record UserInfo(string Id, string DisplayName, string Role, string[] ProjectIds, bool Disabled) { public string Position { get; init; } = ""; }
public sealed record AppLayout(int LeftWidth = 260, int RightWidth = 280, bool LeftVisible = true, bool RightVisible = true, string LeftSide = "left", string RightSide = "right", Dictionary<string, int[]>? FloatingBounds = null, string Arrangement = "tabs");
public sealed record ServiceResult<T>(bool Ok, T? Value, string? ErrorCode = null, string? Message = null) { public static ServiceResult<T> Success(T value) => new(true, value); public static ServiceResult<T> Failure(string code, string message) => new(false, default, code, message); }
public interface IWorkspaceData
{
    Task<IReadOnlyList<WorkRecord>> ListAsync(Identity actor, RecordQuery query, CancellationToken ct = default);
    Task<WorkRecord> SaveAsync(Identity actor, RecordDraft draft, CancellationToken ct = default);
    Task DeleteAsync(Identity actor, string kind, string id, long expectedRevision, bool confirmed, CancellationToken ct = default);
    void RegisterSchema(RecordSchema schema);
    Task<string> ExportAsync(Identity actor, string destination, CancellationToken ct = default);
    Task<ImportPreview> PreviewImportAsync(Identity actor, string path, CancellationToken ct = default);
    Task<ImportPreview> PreviewLegacyImportAsync(Identity actor, string path, CancellationToken ct = default) => Task.FromException<ImportPreview>(new NotSupportedException("LEGACY_IMPORT_NOT_SUPPORTED"));
    Task ImportAsync(Identity actor, ImportPreview preview, bool confirmed, CancellationToken ct = default);
    Task RollbackLastImportAsync(Identity actor, bool confirmed, CancellationToken ct = default);
}
public sealed record ImportPreview(string SourcePath, string Sha256, int Records, int SchemaVersion, IReadOnlyList<string> Warnings) { public string? OriginalSourcePath { get; init; } public string? OriginalSourceSha256 { get; init; } }
public interface IIdentityService
{
    bool IsInitialized { get; }
    Task<Identity> BootstrapAsync(string displayName, string password, bool explicitLocalWorkspace, CancellationToken ct = default);
    Task<Identity> LoginAsync(string displayName, string password, CancellationToken ct = default);
    Task<IReadOnlyList<UserInfo>> ListAsync(Identity actor, CancellationToken ct = default);
    Task<UserInfo> SaveUserAsync(Identity actor, string? id, string name, string role, string[] projects, bool disabled, string? newPassword, CancellationToken ct = default);
    Task<UserInfo> SaveUserProfileAsync(Identity actor, string? id, string name, string position, string role, string[] projects, bool disabled, string? newPassword, CancellationToken ct = default) => throw new NotSupportedException("LOCAL_PROFILE_NOT_SUPPORTED");
    Task ChangePasswordAsync(Identity actor, string oldPassword, string newPassword, CancellationToken ct = default);
}
public interface IAssetService
{
    Task<AssetInfo> ImportAsync(Identity actor, string projectId, string sourcePath, CancellationToken ct = default);
    Task<AssetInfo> GetAsync(Identity actor, string id, CancellationToken ct = default);
    Task ExportAsync(Identity actor, string id, string destination, CancellationToken ct = default);
}
public interface ILayoutStore { Task<AppLayout> LoadAsync(CancellationToken ct = default); Task SaveAsync(AppLayout layout, CancellationToken ct = default); }
public sealed record ReportProgress(string RequestId, string Stage, int? Current = null, int? Total = null);
public sealed record ReportCommand(string Operation, string ProjectId, string SourcePath, string SourceSha256, string? BundlePath = null, string? ContextPath = null, string? FilledPath = null, Dictionary<string, string>? Parameters = null, IReadOnlyList<ReportEvidence>? Evidence = null);
public sealed record ReportEvidence(string Id, string Path, string Sha256);
public sealed record ReportArtifact(string Path, string Sha256, long Size, string MediaType);
public sealed record ReportReply(bool Ok, string RequestId, string? ResultJsonPath, IReadOnlyList<ReportArtifact> Artifacts, string? ErrorCode = null, bool ReportReady = false);
public interface IReportService
{
    Task<ReportReply> ExecuteAsync(DocumentContext context, ReportCommand command, IProgress<ReportProgress>? progress = null, CancellationToken ct = default);
    Task AcknowledgeReviewAsync(DocumentContext context, string sourceSha256, string fingerprint, string reviewPath, CancellationToken ct = default);
    void Invalidate(string contextId);
}
public interface IWorkspaceServices
{
    Identity Actor { get; }
    IWorkspaceData Data { get; }
    IIdentityService Identities { get; }
    IAssetService Assets { get; }
    IReportService Reports { get; }
    ILayoutStore Layout { get; }
    string DataRoot { get; }
    bool TryOpenDocument(string moduleId, string? projectId = null, string? sourcePath = null) => false;
}
