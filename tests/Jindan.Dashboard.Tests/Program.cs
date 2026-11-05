using System.Drawing.Imaging;
using System.Security.Cryptography;
using System.Text.Json;
using Jindan.Contracts;
using Jindan.Infrastructure;
using Jindan.Modules.Dashboard;

static class Program
{
    static readonly List<object> Results = [];
    static string Root = "";
    static void Check(bool condition, string detail = "Assertion failed") { if (!condition) throw new Exception(detail); }
    static async Task Case(string name, Func<Task> action)
    {
        try { await action(); Results.Add(new { name, pass = true }); Console.WriteLine("PASS " + name); }
        catch (Exception ex) { Results.Add(new { name, pass = false, error = ex.GetType().Name + ": " + ex.Message }); Console.WriteLine("FAIL " + name + " " + ex); }
    }
    static void Reject(Action action) { try { action(); } catch (Exception ex) when (ex is InvalidDataException or ArgumentException or IOException or OperationCanceledException) { return; } throw new Exception("Expected reject"); }
    static async Task RejectAsync(Func<Task> action) { try { await action(); } catch (Exception ex) when (ex is InvalidOperationException or OperationCanceledException or Jindan.Core.WorkspaceException) { return; } throw new Exception("Expected reject"); }
    static WorkRecord Record(string id, string title, string kind = "photos", string project = "p", string? asset = null) => new(id, kind, project, "owner", 1, false, new() { ["title"] = title, ["assetId"] = asset ?? "asset-" + id });
    public static async Task<int> Main(string[] args)
    {
        var index = Array.IndexOf(args, "--output");
        Root = index >= 0 ? Path.GetFullPath(args[index + 1]) : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../artifacts/dashboard70", Guid.NewGuid().ToString("N")));
        if (Directory.Exists(Root) && Directory.EnumerateFileSystemEntries(Root).Any()) throw new InvalidOperationException("Fresh output required.");
        Directory.CreateDirectory(Root);
        await Case("bounded newest local list selection preserves deterministic order", () => { var rows = Enumerable.Range(0, 12).Select(i => Record(i.ToString(), i + ".png")).ToArray(); Check(GalleryItems.Select(rows, "p").Select(i => i.Record.Id).SequenceEqual(new[] { "11", "10", "9", "8", "7", "6", "5", "4" })); return Task.CompletedTask; });
        await Case("deleted, wrong project, blank asset, text files excluded; CAD and image files included", () => { WorkRecord[] rows = [Record("0", "x.png") with { Deleted = true }, Record("1", "x.png", project: "q"), Record("2", "x.png", asset: ""), Record("3", "x.txt", "files"), Record("4", "x.DXF", "files"), Record("5", "x.jpg", "files")]; var selected = GalleryItems.Select(rows, "p"); Check(selected.Select(x => x.Record.Id).SequenceEqual(new[] { "5", "4" }) && selected[1].IsCad); return Task.CompletedTask; });
        await Case("duplicate asset is scoped by project and selection copies fields", () => { var record = Record("1", "a.png", asset: "shared"); var items = GalleryItems.Select(new[] { record, Record("2", "b.png", asset: "shared"), Record("3", "c.png", project: "q", asset: "shared") }, null); Check(items.Count == 2); items[1].Record.Fields["title"] = "mutation"; Check(record.Fields["title"] == "a.png"); return Task.CompletedTask; });

        var source = Path.Combine(Root, "synthetic-source.png");
        using (var image = new Bitmap(400, 200)) { using var graphics = Graphics.FromImage(image); graphics.Clear(Color.DarkBlue); image.Save(source, ImageFormat.Png); }
        var bytes = File.ReadAllBytes(source); var hash = Convert.ToHexStringLower(SHA256.HashData(bytes));
        var asset = new AssetInfo("synthetic", hash, "synthetic.png", bytes.Length, "image/png", source);
        await Case("thumbnail and preview are bounded with aspect ratio and unlocked source", () => { using var thumb = GalleryItems.Decode(asset, 112, default); using var preview = GalleryItems.Decode(asset, 1200, default); Check(thumb.Size == new Size(112, 56) && preview.Size == new Size(400, 200)); using var exclusive = new FileStream(source, FileMode.Open, FileAccess.ReadWrite, FileShare.None); Check(exclusive.Length == bytes.Length); return Task.CompletedTask; });
        await Case("tampered hash and declared size fail closed", () => { Reject(() => GalleryItems.Decode(asset with { Sha256 = new string('0', 64) }, 112, default)); Reject(() => GalleryItems.Decode(asset with { Size = bytes.Length + 1 }, 112, default)); return Task.CompletedTask; });
        await Case("locked source, malformed image, cancellation and invalid edge reject", () => { using (var locked = new FileStream(source, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) Reject(() => GalleryItems.Decode(asset, 112, default)); var broken = Path.Combine(Root, "broken.png"); File.WriteAllBytes(broken, [1, 2, 3]); var invalid = asset with { StoredPath = broken, Size = 3, Sha256 = Convert.ToHexStringLower(SHA256.HashData(new byte[] { 1, 2, 3 })) }; Reject(() => GalleryItems.Decode(invalid, 112, default)); Reject(() => GalleryItems.Decode(asset, 112, new CancellationToken(true))); Reject(() => GalleryItems.Decode(asset, 1201, default)); return Task.CompletedTask; });
        await Case("oversized image pixels reject without changing input", () => { var large = Path.Combine(Root, "large.png"); using (var image = new Bitmap(5001, 4000)) image.Save(large, ImageFormat.Png); var info = new FileInfo(large); var oversized = asset with { StoredPath = large, Size = info.Length, Sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(large))) }; Reject(() => GalleryItems.Decode(oversized, 112, default)); Check(new FileInfo(large).Length == info.Length); return Task.CompletedTask; });

        using var workspace = new LocalWorkspace(Path.Combine(Root, "workspace"));
        workspace.RegisterSchema(new("projects", "Projects", [new("title", "Title", Required: true)], false));
        workspace.RegisterSchema(new("photos", "Photos", [new("title", "Title", Required: true), new("assetId", "Asset"), new("sha256", "SHA")], true));
        var admin = await workspace.BootstrapAsync("Synthetic owner", "dashboard-test-password-70", true);
        var project = await workspace.SaveAsync(admin, new(null, "projects", null, 0, new() { ["title"] = "Synthetic P" }));
        var imported = await workspace.ImportAsync(admin, project.Id, source);
        var photo = await workspace.SaveAsync(admin, new(null, "photos", project.Id, 0, new() { ["title"] = "Synthetic photo", ["assetId"] = imported.Id, ["sha256"] = imported.Sha256 }));
        var item = GalleryItems.Select(new[] { photo }, project.Id).Single();
        var services = new Services(workspace, admin);
        await Case("Dashboard inspector keeps authoritative content and storage while hiding RTF companion", () => { Exception? failure = null; var thread = new Thread(() => { try { var fields = new Dictionary<string, string> { ["title"] = "Synthetic formatted project", ["content"] = "Readable project content", ["contentRtf"] = "{\\rtf1\\ansi Readable project content}" }; var fake = new MemoryData([new("formatted", "projects", null, "owner", 1, false, fields)]); using var document = new DashboardDocument(new Services(workspace, admin) { DataOverride = fake }, new("dashboard-rtf70", "dashboard", null, admin.Id)); document.RefreshAsync().GetAwaiter().GetResult(); var grid = document.Controls.OfType<DataGridView>().Single(); grid.CurrentCell = grid.Rows[0].Cells[0]; Check(document.Inspector.Text.Contains("formatted", StringComparison.Ordinal) && document.Inspector.Text.Contains("content: Readable project content", StringComparison.Ordinal)); Check(!document.Inspector.Text.Contains("contentRtf", StringComparison.Ordinal) && !document.Inspector.Text.Contains("\\rtf", StringComparison.Ordinal)); Check(fields["contentRtf"] == "{\\rtf1\\ansi Readable project content}"); } catch (Exception ex) { failure = ex; } }); thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join(); if (failure is not null) throw failure; return Task.CompletedTask; });
        await Case("native Dashboard current row and empty refresh bind and clear the inspector", () => { Exception? failure = null; var thread = new Thread(() => { try { var fake = new MemoryData([new("visible", "projects", null, "owner", 1, false, new() { ["title"] = "Synthetic current row" })]); using var document = new DashboardDocument(new Services(workspace, admin) { DataOverride = fake }, new("dashboard-bind70", "dashboard", null, admin.Id)); document.RefreshAsync().GetAwaiter().GetResult(); var grid = document.Controls.OfType<DataGridView>().Single(); grid.CurrentCell = grid.Rows[0].Cells[0]; Check(document.Inspector.Text.Contains("visible", StringComparison.Ordinal)); fake.Records = []; document.RefreshAsync().GetAwaiter().GetResult(); Check(document.Inspector.Text.Length == 0); } catch (Exception ex) { failure = ex; } }); thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join(); if (failure is not null) throw failure; return Task.CompletedTask; });
        await Case("click rechecks live record revision, asset linkage, SHA and ACL", async () => { var opened = await GalleryItems.ReauthorizeAsync(services, item, default); Check(opened.Id == imported.Id && opened.Sha256 == hash); var updated = await workspace.SaveAsync(admin, new(photo.Id, "photos", project.Id, photo.Revision, new(photo.Fields) { ["title"] = "Changed" })); await RejectAsync(() => GalleryItems.ReauthorizeAsync(services, item, default)); item = GalleryItems.Select(new[] { updated }, project.Id).Single(); });
        await Case("permission revocation after rendering blocks next open", async () => { var user = await workspace.SaveUserAsync(admin, null, "Synthetic viewer", "viewer", [project.Id], false, "dashboard-viewer-password"); var viewer = await workspace.LoginAsync("Synthetic viewer", "dashboard-viewer-password"); var scoped = new Services(workspace, viewer); await GalleryItems.ReauthorizeAsync(scoped, item, default); await workspace.SaveUserAsync(admin, user.Id, user.DisplayName, "viewer", [], false, null); await RejectAsync(() => GalleryItems.ReauthorizeAsync(scoped, item, default)); });
        await Case("deleted record and canceled request block next open", async () => { await RejectAsync(() => GalleryItems.ReauthorizeAsync(services, item, new CancellationToken(true))); await workspace.DeleteAsync(admin, "photos", item.Record.Id, item.Record.Revision, true); await RejectAsync(() => GalleryItems.ReauthorizeAsync(services, item, default)); });
        await Case("original synthetic source stays byte identical", () => { Check(File.ReadAllBytes(source).SequenceEqual(bytes)); return Task.CompletedTask; });
        var fail = Results.Count(r => !JsonSerializer.SerializeToElement(r).GetProperty("pass").GetBoolean());
        var result = new { schema = "dashboard-local70/1", pass = Results.Count - fail, fail, tests = Results, source = new { path = source, sha256 = hash }, loadedAssemblies = new[] { typeof(GalleryItems).Assembly, typeof(IWorkspaceServices).Assembly, typeof(LocalWorkspace).Assembly }.Select(a => new { a.Location, sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(a.Location))) }), noGuiClaim = true, reportReady = false, supervisorAccepted = false };
        File.WriteAllText(Path.Combine(Root, "RESULT.json"), JsonSerializer.Serialize(result, new JsonSerializerOptions() { WriteIndented = true }));
        Console.WriteLine($"RESULT pass={Results.Count - fail} fail={fail} output={Root}");
        return fail == 0 ? 0 : 1;
    }
    sealed class Services(LocalWorkspace workspace, Identity actor) : IWorkspaceServices
    {
        public IWorkspaceData? DataOverride { get; init; }
        public Identity Actor => actor;
        public IWorkspaceData Data => DataOverride ?? workspace;
        public IIdentityService Identities => workspace;
        public IAssetService Assets => workspace;
        public IReportService Reports => throw new NotSupportedException();
        public ILayoutStore Layout => workspace;
        public string DataRoot => workspace.DataRoot;
    }
    sealed class MemoryData(IReadOnlyList<WorkRecord> records) : IWorkspaceData
    {
        public IReadOnlyList<WorkRecord> Records { get; set; } = records;
        public Task<IReadOnlyList<WorkRecord>> ListAsync(Identity actor, RecordQuery query, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<WorkRecord>>(Records.Where(r => r.Kind == query.Kind).ToArray());
        public Task<WorkRecord> SaveAsync(Identity actor, RecordDraft draft, CancellationToken ct = default) => throw new NotSupportedException();
        public Task DeleteAsync(Identity actor, string kind, string id, long expectedRevision, bool confirmed, CancellationToken ct = default) => throw new NotSupportedException();
        public void RegisterSchema(RecordSchema schema) { }
        public Task<string> ExportAsync(Identity actor, string destination, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<ImportPreview> PreviewImportAsync(Identity actor, string path, CancellationToken ct = default) => throw new NotSupportedException();
        public Task ImportAsync(Identity actor, ImportPreview preview, bool confirmed, CancellationToken ct = default) => throw new NotSupportedException();
        public Task RollbackLastImportAsync(Identity actor, bool confirmed, CancellationToken ct = default) => throw new NotSupportedException();
    }
}
