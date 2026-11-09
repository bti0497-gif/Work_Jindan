using System.Text.Json;
using Jindan.Contracts;
using Jindan.Infrastructure;
using Jindan.Report.Adapter;
using Jindan.ModuleHost;
using Jindan.Update;
using Jindan.Desktop.Contracts;
using Jindan.Contracts.Cloud;
using Jindan.Infrastructure.Cloud;
namespace Jindan.Desktop;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        string? Arg(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
        var root = Path.GetFullPath(Arg("--installation-root") ?? AppContext.BaseDirectory);
        var diagnostic = new Diagnostic71(Path.Combine(root, "diagnostics"));
        diagnostic.Write("app.start", "start");
        if (args.Contains("--healthcheck"))
        {
            try { using var modules = DesktopModules.Load(root); if (modules.Errors.Count > 0 || modules.Entries.Count == 0) return 3; return 0; } catch { return 4; }
        }
        try
        {
            using var lease = ApplicationLease.Acquire(root);
            var workspaceRoot = Path.GetFullPath(Arg("--workspace") ?? Path.Combine(root, "data"));
            var settings = ApplicationBrand75.ServerSettings();
            while (true)
            {
                using var shell = new StartupShell75(); shell.Show();
                using var cloud = new CloudReadService71(diagnostic);
                LocalWorkspace? serverStore = null;
                try
                {
                    using var login = new LoginDialog(null, Path.Combine(workspaceRoot, "login-id.json"), async (id, password, ct) =>
                    {
                        var member = await cloud.Authenticate75Async(settings, id, password, ct);
                        ct.ThrowIfCancellationRequested();
                        var accountKey = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(settings.ProjectId + ":" + member.Uid)));
                        serverStore?.Dispose(); serverStore = new LocalWorkspace(Path.Combine(workspaceRoot, "server-accounts", accountKey));
                        return await serverStore.OpenServerSession75Async(cloud, ct);
                    });
                    if (login.ShowDialog(shell) != DialogResult.OK || login.Actor is null || serverStore is null) return 0;
                    var store = serverStore;
                    WorkspaceLocation.Register(root, store.DataRoot);
                    using var modules = DesktopModules.Load(root);
                    diagnostic.Write("login.success", "success");
                    diagnostic.Write("modules.loaded", modules.Errors.Count == 0 ? "success" : "failure", items: modules.Entries.Count);
                    foreach (var entry in modules.Entries) diagnostic.Write("module.load", "success", component: entry.Module.ModuleId);
                    using var reports = new ReportBridge(store.DataRoot, root, modules.Entries.Any(e => e.Module.ModuleId == "report-studio"), (context, operation, ct) => store.AuthorizeDocumentAsync(login.Actor, context, operation is not ("analyze" or "preview" or "inspectMaterial" or "readThermalBmt" or "readPowerView" or "cadPreview" or "locate"), ct));
                    using var services = new WorkspaceServices(login.Actor, store, reports, diagnostic, cloud, new ServerProjectData75(store, cloud, login.Actor));
                    foreach (var entry in modules.Entries) entry.Module.Initialize(services);
                    var projectModule = modules.Entries.Select(e => e.Module).OfType<IProjectSelectionModule75>().Single();
                    using var picker = projectModule.CreateProjectSelectionDialog();
                    if (picker.ShowDialog(shell) != DialogResult.OK || picker is not IProjectSelectionDialog75 { SelectedProjectId: { } projectId }) return 0;
                    diagnostic.Write("project.selected", "success");
                    using var form = new WorkbenchForm(root, modules, services, projectId);
                    shell.Hide(); Application.Run(form); if (!form.LogoutRequested) return 0;
                }
                finally { serverStore?.Dispose(); }
            }
        }
        catch (Exception error) { diagnostic.Write("app.failure", "failure"); MessageBox.Show(error is IOException ? "작업대가 실행 중이거나 로컬 파일을 사용할 수 없습니다." : "작업대를 시작하지 못했습니다. 설치·로컬 저장소 상태를 확인하세요.", "진단 작업대", MessageBoxButtons.OK, MessageBoxIcon.Error); return 2; }
    }
    public static string FindDevelopmentWorker() { for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent) { var f = Path.Combine(d.FullName, "src/Jindan.Report.Worker/worker.mjs"); if (File.Exists(f)) return f; } throw new FileNotFoundException("Worker runtime not installed"); }
    public static string ResolveNode(string root) { var bundled = Path.Combine(root, "modules/report-studio/worker/node.exe"); if (File.Exists(bundled)) return bundled; foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) { var file = Path.Combine(dir, "node.exe"); if (File.Exists(file)) return file; } throw new FileNotFoundException("Explicit local Node runtime missing"); }
}
public sealed class ReportBridge : IReportService, IDisposable
{
    private readonly ReportService? implementation;
    public bool Available => implementation is not null;
    public ReportBridge(string dataRoot, string root, bool modulePresent, Func<DocumentContext, string, CancellationToken, Task>? authorize = null) { if (!modulePresent) return; try { var worker = Path.Combine(root, "modules/report-studio/worker/worker.mjs"); if (!File.Exists(worker)) worker = Program.FindDevelopmentWorker(); implementation = new(dataRoot, Program.ResolveNode(root), worker, authorize: authorize); } catch (FileNotFoundException) { } }
    public Task<ReportReply> ExecuteAsync(DocumentContext context, ReportCommand command, IProgress<ReportProgress>? progress = null, CancellationToken ct = default) => implementation?.ExecuteAsync(context, command, progress, ct) ?? Task.FromResult(new ReportReply(false, Guid.NewGuid().ToString("N"), null, [], "RUNTIME_UNAVAILABLE"));
    public Task AcknowledgeReviewAsync(DocumentContext context, string sourceSha256, string fingerprint, string reviewPath, CancellationToken ct = default) => implementation?.AcknowledgeReviewAsync(context, sourceSha256, fingerprint, reviewPath, ct) ?? Task.FromException(new InvalidOperationException("로컬 보고서 런타임을 사용할 수 없습니다."));
    public void Invalidate(string contextId) => implementation?.Invalidate(contextId);
    public void Dispose() => implementation?.Dispose();
}
public sealed class WorkspaceServices(Identity actor, LocalWorkspace store, IReportService reports, Diagnostic71? diagnostic = null, CloudReadService71? authenticatedCloud = null, IWorkspaceData? serverData = null) : IWorkspaceServices, IReportWorkspaceAccess, IWorkspaceSyncAccess, ICloudWorkspaceAccess, IDisposable
{
    private readonly CloudReadService71 cloud = authenticatedCloud ?? new(diagnostic);
    public ICloudReadService Cloud => cloud;
    internal void RecordModuleOpen(string module) => diagnostic?.Write("module.open", "success", component: module);
    private readonly WorkspaceSyncService sync = new(store, actor);
    public IWorkspaceSyncService Sync => sync;
    public bool ServerSession => authenticatedCloud is not null;
    public void Dispose() { if (authenticatedCloud is null) cloud.Dispose(); sync.Dispose(); }
    public Task AuthorizeReportWorkspaceAsync(DocumentContext context, bool write, CancellationToken ct = default) => store.AuthorizeDocumentAsync(actor, context, write, ct);
    public Task<AssetInfo?> ResolveExistingReportAssetAsync(DocumentContext context, string storedPath, CancellationToken ct = default) => store.ResolveProjectAssetAsync(actor, context, storedPath, ct);
    public async Task<bool> CanWriteReportWorkspaceAsync(DocumentContext context, CancellationToken ct = default) { await store.AuthorizeDocumentAsync(actor, context, false, ct); try { await store.AuthorizeDocumentAsync(actor, context, true, ct); return true; } catch (Jindan.Core.WorkspaceException error) when (error.Code == "FORBIDDEN") { return false; } }
    public Func<string, string?, string?, bool>? OpenRequested { get; set; }
    public bool TryOpenDocument(string moduleId, string? projectId = null, string? sourcePath = null) => OpenRequested?.Invoke(moduleId, projectId, sourcePath) ?? false;
    public Identity Actor => actor; public IWorkspaceData Data => serverData ?? store; public IIdentityService Identities => store; public IAssetService Assets => store; public IReportService Reports => reports; public ILayoutStore Layout => store; public string DataRoot => store.DataRoot;
}
public sealed class DesktopModules : IDisposable
{
    public List<(IDesktopModule Module, ModuleAssemblyScope Scope)> Entries { get; } = [];
    public List<string> Errors { get; } = [];
    public static DesktopModules Load(string root)
    {
        var result = new DesktopModules();
        try
        {
            var trust = new ModuleTrustPolicy(JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "trusted-manifests.json"))) ?? []);
            var inventory = JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "module-inventory.json"))) ?? [];
            var paths = inventory.Select(relative => { if (Path.IsPathFullyQualified(relative) || relative.Contains("..") || !relative.StartsWith("modules/", StringComparison.Ordinal)) throw new InvalidDataException(); return Path.Combine(root, relative); });
            var verified = ModuleCatalog.VerifyInventory(paths, trust);
            result.Errors.AddRange(verified.Errors.Select(e => e.Code));
            foreach (var package in verified.Modules) { ModuleAssemblyScope? scope = null; try { scope = new(package); if (scope.CreateEntry() is not IDesktopModule module) throw new InvalidDataException(); if (module.ModuleId != package.Manifest.ModuleId || module.Version != package.Manifest.Version) throw new InvalidDataException(); result.Entries.Add((module, scope)); } catch { scope?.Dispose(); result.Errors.Add("MODULE_ACTIVATION_FAILED:" + package.Manifest.ModuleId); } }
        }
        catch { result.Errors.Add("MODULE_INVENTORY_UNAVAILABLE"); }
        return result;
    }
    public void Dispose() { foreach (var entry in Entries) { entry.Module.Dispose(); entry.Scope.Dispose(); } Entries.Clear(); }
}
