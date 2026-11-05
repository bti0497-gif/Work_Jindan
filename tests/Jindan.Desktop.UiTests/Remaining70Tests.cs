using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Jindan.Contracts;
using Jindan.Core;
using Jindan.Desktop;
using Jindan.Desktop.Contracts;
using Jindan.Infrastructure;

namespace Jindan.Desktop.UiTests;

static partial class Program
{
    sealed class CadOnlyReports70 : IReportService, IDisposable
    {
        readonly Jindan.Report.Adapter.ReportService service;
        public CadOnlyReports70(LocalWorkspace store, Identity actor)
        {
            var root = Path.Combine(Package, "modules/report-studio/worker"); var node = Path.Combine(root, "node.exe"); var worker = Path.Combine(root, "worker.mjs");
            service = new(store.DataRoot, node, worker, 30000, authorize: (context, _, ct) => store.AuthorizeDocumentAsync(actor, context, false, ct));
            Samples.Add(new { name = "remaining70 exact local CAD worker binding", node, nodeSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(node))), worker, workerSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(worker))) });
        }
        public Task<ReportReply> ExecuteAsync(DocumentContext context, ReportCommand command, IProgress<ReportProgress>? progress = null, CancellationToken ct = default) => command.Operation == "cadPreview" ? service.ExecuteAsync(context, command, progress, ct) : Task.FromResult(new ReportReply(false, Guid.NewGuid().ToString("N"), null, [], "REMAINING70_CAD_ONLY"));
        public Task AcknowledgeReviewAsync(DocumentContext context, string sha, string fingerprint, string path, CancellationToken ct = default) => Task.FromException(new NotSupportedException());
        public void Invalidate(string contextId) => service.Invalidate(contextId);
        public void Dispose() => service.Dispose();
    }
    static RichTextEditor70 Rich70(RecordDocument doc) => Tree(doc.PropertiesPanel).OfType<RichTextEditor70>().Single();
    static async Task<Control> Dashboard70(WorkbenchForm form)
    {
        var window = form.OpenDocument("dashboard"); var control = window.Document.View;
        await (Task)control.GetType().GetMethod("RefreshAsync")!.Invoke(control, null)!;
        return control;
    }
    static Button[] Tiles70(Control dashboard) => Tree(dashboard).OfType<FlowLayoutPanel>().Single(p => p.Name == "DashboardGalleryItems").Controls.OfType<Button>().ToArray();
    static void ModuleHashes70(WorkbenchForm form)
    {
        foreach (var module in new[] { "projects", "board", "dashboard" })
        {
            var assembly = form.Documents.First(d => d.Document.Context.ModuleId == module).Module.GetType().Assembly;
            var actual = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(assembly.Location)));
            var expectedPath = Path.Combine(Package, "modules", module, "Jindan.Modules." + (module == "projects" ? "Projects" : module == "board" ? "Board" : "Dashboard") + ".dll");
            var expected = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(expectedPath)));
            Check(actual == expected, "New local feature module differs from supplied package: " + module);
            Samples.Add(new { name = "remaining70 exact module binding", module, assembly.Location, expectedPath, sha256 = actual });
        }
    }
    static async Task Remaining70Checks(WorkbenchForm form, LocalWorkspace store, WorkspaceServices services)
    {
        string p1 = "", p2 = "", boardId = ""; RecordDocument? project = null; RecordDocument? board = null; Control? dashboard = null;
        await Test("remaining70 actual Projects native toolbar formats without changing text and saves paired fields", async () =>
        {
            project = await OpenRecord(form, "projects"); project.NewRecord(); project.SetField("title", "Remaining70 합성 서식 프로젝트"); project.SetField("content", "서식만 바꾸는 합성 조사 메모");
            var rich = Rich70(project); rich.Editor.Select(0, 2); Tree(rich).OfType<Button>().Single(b => b.Text == "굵게").PerformClick();
            Check(project.IsDirty && rich.Editor.Text == "서식만 바꾸는 합성 조사 메모", "Formatting-only change lost text/dirty state");
            DumpRich70(rich, project, "project-before-save");
            await SaveByButton(project); p1 = project.SelectedId!; Ids["remaining70-project"] = p1;
            var saved = (await store.ListAsync(services.Actor, new RecordQuery("projects"))).Single(r => r.Id == p1); Check(saved.Fields.ContainsKey("contentRtf") && saved.Fields["content"] == rich.Editor.Text, "Formatted project missing companion/plain binding");
            rich.Editor.Select(0, 2); Check(rich.Editor.SelectionFont?.Bold == true, "Save/rebind lost native bold"); Capture(form, "remaining70-project-richtext");
            p2 = (await store.SaveAsync(services.Actor, new(null, "projects", null, 0, new() { ["title"] = "Remaining70 separate photo project" }))).Id; Ids["remaining70-other-project"] = p2;
            await form.RefreshProjectsAsync(); form.SelectProject(p1);
        });
        await Test("remaining70 native Board thread keeps styled post with plain reply and project toolbar state", async () =>
        {
            board = await OpenRecord(form, "board"); board.NewRecord(); board.SetField("title", "Remaining70 styled post"); board.SetField("content", "선택한 본문 굵게 유지");
            var rich = Rich70(board); rich.Editor.Select(0, 3); Tree(rich).OfType<Button>().Single(b => b.Text == "굵게").PerformClick();
            try { await SaveByButton(board); }
            catch
            {
                DumpRich70(rich, board, "board-after-save-timeout");
                File.WriteAllText(Path.Combine(Output, "remaining70-board-state.json"), JsonSerializer.Serialize(new { board.IsDirty, board.SelectedId, rows = Grid(board).Rows.Count, labels = Tree(board).OfType<Label>().Select(l => l.Text).ToArray() }));
                Capture(form, "remaining70-board-save-timeout"); throw;
            }
            boardId = board.SelectedId!; Ids["remaining70-board"] = boardId;
            Tool(board, "답글·댓글 작성").PerformClick(); board.SetField("content", "Remaining70 plain reply"); await SaveByButton(board);
            await Until(() => Tree(board).OfType<RichTextBox>().Any(r => r.ReadOnly && r.Text.Contains("Remaining70 plain reply") && r.Text.Contains("선택한 본문")), "Native styled thread/reply missing");
            var thread = Tree(board).OfType<RichTextBox>().Single(r => r.ReadOnly); var index = thread.Text.IndexOf("선택한", StringComparison.Ordinal); thread.Select(index, 3); Check(thread.SelectionFont?.Bold == true, "Thread lost safe source formatting");
            Check(!Grid(board).Columns["contentRtf"]!.Visible, "Raw RTF companion exposed as grid content"); Capture(form, "remaining70-board-thread");
        });
        if (Environment.GetEnvironmentVariable("JINDAN_UI70_BOARD_DIAGNOSTIC") == "1") return;
        await Test("remaining70 ten local photos build eight bounded thumbnail tiles with real horizontal viewport navigation", async () =>
        {
            for (int i = 0; i < 10; i++)
            {
                var path = Path.Combine(Output, "remaining70-photo-" + i + ".png"); using (var image = new Bitmap(200, 100)) { using var graphics = Graphics.FromImage(image); graphics.Clear(Color.FromArgb(20 * i, 40, 180)); image.Save(path, System.Drawing.Imaging.ImageFormat.Png); }
                var asset = await store.ImportAsync(services.Actor, p1, path); await store.SaveAsync(services.Actor, new(null, "photos", p1, 0, new() { ["title"] = "Remaining70 photo " + i, ["assetId"] = asset.Id, ["sha256"] = asset.Sha256 }));
            }
            dashboard = await Dashboard70(form); await Until(() => Tiles70(dashboard).Length == 8 && Tiles70(dashboard).All(b => b.Image is not null), "Eight authorized local thumbnails never rendered");
            Check(Tiles70(dashboard).All(b => b.Width > 0 && b.Height > 0 && b.Visible && b.Image!.Width <= 112 && b.Image.Height <= 112), "Visible tile bounds/decoded image bounds differ");
            var inspector = (Control)dashboard.GetType().GetProperty("Inspector")!.GetValue(dashboard)!;
            var current = Tree(dashboard).OfType<DataGridView>().Single().CurrentRow?.Tag as WorkRecord;
            Check(current is not null && inspector.Text.Contains(current.Id, StringComparison.Ordinal), "Initial highlighted Dashboard row did not bind the inspector");
            Check(!inspector.Text.Contains("contentRtf", StringComparison.Ordinal) && !inspector.Text.Contains("\\rtf", StringComparison.Ordinal), "Dashboard inspector exposed raw formatting companion source");
            Samples.Add(new { name = "remaining70 current Dashboard inspector binding", recordId = current!.Id, inspectorContainsId = true, rawRtfHidden = true });
            ModuleHashes70(form); Capture(form, "remaining70-dashboard-eight");
            var strip = Tree(dashboard).OfType<FlowLayoutPanel>().Single(p => p.Name == "DashboardGalleryItems"); var first = Tiles70(dashboard).First(); var last = Tiles70(dashboard).Last();
            strip.ScrollControlIntoView(last); await Task.Delay(80); Check(Rectangle.Intersect(strip.ClientRectangle, last.Bounds).Width >= last.Width / 2, "Last loaded tile could not be scrolled into actual viewport"); Capture(form, "remaining70-dashboard-last-tile-viewport");
            strip.ScrollControlIntoView(first); await Task.Delay(80); Check(Rectangle.Intersect(strip.ClientRectangle, first.Bounds).Width >= first.Width / 2, "First loaded tile could not return to viewport");
            Samples.Add(new { name = "remaining70 loaded strip viewport navigation", loadedTiles = Tiles70(dashboard).Length, firstAndLastScrolledIntoView = true, allEightSimultaneouslyVisibleClaim = false });
        });
        await Test("remaining70 actual tile click opens exact bound photo and context switch closes owned preview", async () =>
        {
            var tile = Tiles70(dashboard!).First(); var tag = tile.Tag!; var record = (WorkRecord)tag.GetType().GetProperty("Record")!.GetValue(tag)!; tile.PerformClick();
            await Until(() => Application.OpenForms.Cast<Form>().Any(f => f.Name == "DashboardAssetPreview"), "Exact photo preview did not open from tile click");
            var preview = Application.OpenForms.Cast<Form>().Single(f => f.Name == "DashboardAssetPreview"); var image = Tree(preview).OfType<PictureBox>().Single().Image; Check(image is not null && image.Size == new Size(200, 100) && preview.Text.StartsWith("remaining70-photo-9.png", StringComparison.Ordinal), "Clicked tile and displayed asset differ: " + record.Id); Capture(preview, "remaining70-clicked-original-preview");
            form.SelectProject(p2); await Until(() => preview.IsDisposed && Tiles70(dashboard!).Length == 0, "Context change retained prior project image/preview"); Check(!dashboard!.IsDisposed, "Changing project disposed dashboard instead of refreshing");
            form.SelectProject(p1); await (Task)dashboard.GetType().GetMethod("RefreshAsync")!.Invoke(dashboard, null)!; await Until(() => Tiles70(dashboard).Length == 8, "Returning to original project lost gallery");
        });
        await Test("remaining70 stale tile click after record edit is rejected before opening photo", async () =>
        {
            var tile = Tiles70(dashboard!).First(); var item = tile.Tag!; var record = (WorkRecord)item.GetType().GetProperty("Record")!.GetValue(item)!; await store.SaveAsync(services.Actor, new(record.Id, "photos", p1, record.Revision, new(record.Fields) { ["caption"] = "Changed after tile render" })); tile.PerformClick();
            await Until(() => Tree(dashboard!).OfType<Label>().Any(l => l.Name == "DashboardGalleryStatus" && l.Text.StartsWith("미리보기를 열 수 없습니다", StringComparison.Ordinal)), "Stale tile was not explicitly rejected"); Check(!Application.OpenForms.Cast<Form>().Any(f => f.Name == "DashboardAssetPreview"), "Stale tile leaked photo preview");
        });
        await Test("remaining70 viewer membership revocation blocks rendered photo tile on re-read", async () =>
        {
            var member = await store.SaveUserAsync(services.Actor, null, "Remaining70 viewer", "viewer", [p1], false, "Remaining70-viewer-only!"); var viewer = await store.LoginAsync(member.DisplayName, "Remaining70-viewer-only!"); using var catalog = DesktopModules.Load(Package); using var viewerServices = new WorkspaceServices(viewer, store, new ExplicitNoReports()); using var other = new WorkbenchForm(Package, catalog, viewerServices); other.Show(form); await other.Ready; other.SelectProject(p1); var scoped = await Dashboard70(other); await Until(() => Tiles70(scoped).Length == 8 && Tiles70(scoped).All(b => b.Image is not null), "Viewer authorized gallery failed to render");
            await store.SaveUserAsync(services.Actor, member.Id, member.DisplayName, "viewer", [], false, null); Tiles70(scoped)[0].PerformClick(); await Until(() => Tree(scoped).OfType<Label>().Any(l => l.Name == "DashboardGalleryStatus" && l.Text.StartsWith("미리보기를 열 수 없습니다", StringComparison.Ordinal)), "Revoked viewer tile did not fail closed"); Check(!Application.OpenForms.Cast<Form>().Any(f => f.Name == "DashboardAssetPreview"), "Revoked membership opened old photo"); other.Close(); await Until(() => other.IsDisposed, "Owned viewer workbench did not close normally");
        });
        await Test("remaining70 actual Dashboard CAD tile opens exact registered Files row and bounded local DXF preview", async () =>
        {
            var path = Path.Combine(Output, "remaining70-exact-cad.dxf"); await File.WriteAllTextAsync(path, string.Join('\n', new[] { "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "120", "21", "0", "31", "0", "0", "CIRCLE", "8", "0", "10", "60", "20", "40", "30", "0", "40", "20", "0", "ENDSEC", "0", "EOF", "" }));
            var original = Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(path))); var asset = await store.ImportAsync(services.Actor, p1, path);
            var record = await store.SaveAsync(services.Actor, new(null, "files", p1, 0, new() { ["title"] = "remaining70-exact-cad.dxf", ["assetId"] = asset.Id, ["sha256"] = asset.Sha256, ["size"] = asset.Size.ToString(), ["category"] = "CAD" })); Ids["remaining70-cad"] = record.Id;
            form.Documents.Single(d => ReferenceEquals(d.Document.View, dashboard)).Activate(); form.SelectProject(p1); await (Task)dashboard!.GetType().GetMethod("RefreshAsync")!.Invoke(dashboard, null)!;
            var tile = Tiles70(dashboard).Single(b => b.Tag is object tag && ((WorkRecord)tag.GetType().GetProperty("Record")!.GetValue(tag)!).Id == record.Id); tile.PerformClick();
            await Until(() => Application.OpenForms.Cast<Form>().Any(f => f.Name == "CadPreviewWindow" && Tree(f).OfType<PictureBox>().Any(p => p.Image is not null)), "Direct selected CAD preview failed", 30000);
            var preview = Application.OpenForms.Cast<Form>().Single(f => f.Name == "CadPreviewWindow"); var picture = Tree(preview).OfType<PictureBox>().Single(); Check(picture.Image!.Width is > 0 and <= 1600 && picture.Image.Height is > 0 and <= 1600 && preview.Text.EndsWith("remaining70-exact-cad.dxf", StringComparison.Ordinal), "Wrong source/size in direct CAD preview");
            var files = (RecordDocument)form.Documents.Single(d => d.Document.Context.ModuleId == "files").Document; Check(files.SelectedId == record.Id && Grid(files).CurrentRow?.Tag is WorkRecord visual && visual.Id == record.Id && !files.IsDirty, "Exact source request bypassed logical/editor selection");
            Samples.Add(new { name = "remaining70 exact selected CAD source", record.Id, assetId = asset.Id, asset.Sha256, originalSha256 = original }); Capture(preview, "remaining70-exact-cad-preview"); preview.Close(); await Until(() => preview.IsDisposed, "Owned CAD preview failed to close"); Check(Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(path))) == original, "CAD source original changed");
            var assembly = files.GetType().Assembly; var expected = Path.Combine(Package, "modules/files/Jindan.Modules.Files.dll"); Check(SHA256.HashData(File.ReadAllBytes(assembly.Location)).SequenceEqual(SHA256.HashData(File.ReadAllBytes(expected))), "Files module differs from exact supplied package"); Samples.Add(new { name = "remaining70 exact Files source module", assembly.Location, sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(expected))) });
            files.SetField("content", "Unsaved synthetic CAD note"); try { await (Task)files.GetType().GetMethod("ResolveExistingSourceAsync")!.Invoke(files, new object[] { asset.StoredPath, CancellationToken.None })!; throw new Exception("Dirty source navigation was accepted"); } catch (InvalidOperationException) { }
            await SaveByButton(files); try { await files.SelectExistingAsync(record.Id, record.Revision); throw new Exception("Stale source revision selected"); } catch (InvalidOperationException) { }
            form.SelectProject(p2); try { await (Task)files.GetType().GetMethod("ResolveExistingSourceAsync")!.Invoke(files, new object[] { asset.StoredPath, CancellationToken.None })!; throw new Exception("Cross-project source navigation accepted"); } catch (InvalidOperationException) { } form.SelectProject(p1);
            Tool(files, "Drive 목록 캐시 · 로컬 시험").PerformClick();
            await Until(() => Application.OpenForms.Cast<Form>().Any(f => f.GetType().Name == "DriveCacheWindow"), "Dynamic Files toolbar did not open its local Drive cache surface");
            var drive = Application.OpenForms.Cast<Form>().Single(f => f.GetType().Name == "DriveCacheWindow");
            var scope = (DocumentContext)drive.GetType().GetField("context", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(drive)!; Check(scope.ProjectId == p1 && scope.UserId == services.Actor.Id, "Drive cache surface captured another project/user context");
            var exampleTask = (Task)drive.GetType().GetMethod("CreateExampleAsync")!.Invoke(drive, null)!; await exampleTask; var example = exampleTask.GetType().GetProperty("Result")!.GetValue(exampleTask)!;
            var listing = Path.Combine(Output, "remaining70-owned-drive-listing.json"); await File.WriteAllBytesAsync(listing, JsonSerializer.SerializeToUtf8Bytes(example, example.GetType()));
            await (Task)drive.GetType().GetMethod("OpenFixtureAsync")!.Invoke(drive, new object[] { listing })!;
            await Until(() => Tree(drive).OfType<DataGridView>().Any(g => g.Name == "DriveCachedEntries" && g.Rows.Count > 0), "Dynamic Files cache did not render its explicitly generated local fixture");
            Check(Tree(drive).OfType<Label>().Any(l => l.Name == "DriveCacheStatus" && l.Text.Contains("실제 Drive 미연결", StringComparison.Ordinal)) && Tree(drive).OfType<TreeView>().Any(t => t.Name == "DriveCacheFolders" && t.Nodes.Count > 0), "Drive offline scope/status/tree was not displayed");
            Samples.Add(new { name = "remaining70 dynamic Drive cache toolbar", scope.ContextId, scope.ProjectId, scope.UserId, visibleRows = Tree(drive).OfType<DataGridView>().Single().Rows.Count, explicitLocalFixture = true, liveDriveConnected = false });
            Capture(drive, "remaining70-dynamic-files-drive-cache"); drive.Close(); await Until(() => drive.IsDisposed, "Owned Drive cache window did not close normally");
            form.Documents.Single(d => ReferenceEquals(d.Document.View, dashboard)).Activate();
        });
        await Test("remaining70 actual sync menu shows feature-save outbox while production push and schedule are disabled", async () =>
        {
            var syncMenu = Tree(form).OfType<MenuStrip>().SelectMany(menu => menu.Items.OfType<ToolStripMenuItem>()).Single(menu => menu.Text == "동기화");
            var open = syncMenu.DropDownItems.OfType<ToolStripMenuItem>().Single(menu => menu.Text == "대기 목록·연결 상태");
            form.BeginInvoke((Action)(() => open.PerformClick()));
            await Until(() => form.OwnedForms.Any(f => f.Name == "WorkspaceSync70" && Tree(f).OfType<DataGridView>().Any(g => g.Name == "SyncPending70" && g.Rows.Count > 0)), "Actual sync queue dialog did not load the saved project outbox");
            var dialog = form.OwnedForms.Single(f => f.Name == "WorkspaceSync70"); var pending = Tree(dialog).OfType<DataGridView>().Single();
            Check(pending.Rows.Cast<DataGridViewRow>().Any(r => r.DataBoundItem is WorkspaceSyncEntry entry && entry.Kind == "projects" && entry.Id == p1), "Saved native project was not present in sync pending list");
            Check(Tree(dialog).OfType<Button>().Single(b => b.Text == "대기 변경 보내기").Enabled == false && Tree(dialog).OfType<CheckBox>().Single(c => c.Text.StartsWith("자동 보내기", StringComparison.Ordinal)).Enabled == false, "Unconfigured production transmission/schedule controls enabled");
            Check(Tree(dialog).OfType<Label>().Any(l => l.Text.Contains("실제 서버 연결 미설정", StringComparison.Ordinal)), "Default live adapter status did not clearly report unconfigured");
            Capture(dialog, "remaining70-default-sync-blocked"); dialog.Close(); await Until(() => dialog.IsDisposed, "Owned sync dialog did not close normally");
        });
        await Test("remaining70 fresh-process fixtures persist exact native formatting without cloud or current measurements", async () => { Check(p1.Length > 0 && boardId.Length > 0 && project is not null && board is not null, "Native prerequisites missing"); await form.SaveLayoutAsync(); File.WriteAllText(Path.Combine(Output, "remaining70-fixture.json"), JsonSerializer.Serialize(new { project = p1, board = boardId })); });
    }
    static void DumpRich70(RichTextEditor70 editor, RecordDocument document, string name)
    {
        var rtf = editor.Editor.Rtf ?? ""; string? parsed = null, error = null;
        try { parsed = RichTextRules70.PlainText(rtf); } catch (Exception ex) { error = ex.Message; }
        var values = (Dictionary<string, string>)typeof(RecordDocument).GetField("Values", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(document)!;
        File.WriteAllText(Path.Combine(Output, "remaining70-" + name + ".json"), JsonSerializer.Serialize(new { text = editor.Editor.Text, parsed, error, rtf, actualDpi = editor.DeviceDpi, values }));
    }
    static async Task Remaining70ReopenChecks(WorkbenchForm form, LocalWorkspace store, WorkspaceServices services)
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(Output, "remaining70-fixture.json"))); var p1 = fixture.RootElement.GetProperty("project").GetString()!; var postId = fixture.RootElement.GetProperty("board").GetString()!;
        await Test("remaining70 fresh owned process reopens native project formatting and safe Board thread", async () => { form.SelectProject(p1); var project = await OpenRecord(form, "projects"); Select(project, p1); var rich = Rich70(project); rich.Editor.Select(0, 2); Check(rich.Editor.SelectionFont?.Bold == true && !project.IsDirty, "Fresh process project formatting/binding differs"); var board = await OpenRecord(form, "board"); Select(board, postId); await Until(() => Tree(board).OfType<RichTextBox>().Any(r => r.ReadOnly && r.Text.Contains("Remaining70 plain reply")), "Fresh process Board thread missing"); var thread = Tree(board).OfType<RichTextBox>().Single(r => r.ReadOnly); thread.Select(thread.Text.IndexOf("선택한", StringComparison.Ordinal), 3); Check(thread.SelectionFont?.Bold == true, "Fresh process Board formatting differs"); Capture(form, "remaining70-fresh-richtext"); });
        await Test("remaining70 fresh owned process rebuilds seven thumbnails plus CAD tile and binds exact feature module hashes", async () => { var dashboard = await Dashboard70(form); await Until(() => Tiles70(dashboard).Length == 8 && Tiles70(dashboard).Count(t => t.Image is not null) == 7 && Tiles70(dashboard).Any(t => t.Text.StartsWith("도면 ·", StringComparison.Ordinal)), "Fresh process gallery/CAD tile did not rebuild"); ModuleHashes70(form); Capture(form, "remaining70-fresh-dashboard"); });
    }
}
