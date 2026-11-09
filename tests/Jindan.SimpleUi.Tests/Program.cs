using Jindan.Contracts;
using Jindan.Desktop;
using Jindan.Desktop.Contracts;
using Jindan.Infrastructure;

static class Program
{
    static int passed, failed;
    static void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS " + label); passed++; }
    static IEnumerable<Control> Tree(Control root) { yield return root; foreach (Control child in root.Controls) foreach (var value in Tree(child)) yield return value; }
    static async Task ReportReady(DocumentForm document) { if (document.Document.GetType().GetProperty("Ready")?.GetValue(document.Document) is Task task) await task; }
    [STAThread] static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var root = Path.GetFullPath(args[0]);
        var testRoot = Path.GetFullPath(Path.Combine("artifacts", "simple72-tests-" + Guid.NewGuid().ToString("N")));
        using var store = new LocalWorkspace(Path.Combine(testRoot, "data"));
        var actor = store.BootstrapAsync("synthetic72", "Synthetic72-Only!", true).GetAwaiter().GetResult();
        var preference = Path.Combine(testRoot, "login-id.json");
        LoginIdPreference72.Save(preference, "sample-id");
        Check(LoginIdPreference72.Read(preference) == "sample-id", "remember ID round trip");
        using (var login = new LoginDialog(store, preference))
        {
            var controls = Tree(login).ToArray();
            Check(controls.OfType<TextBox>().Count() == 2 && controls.OfType<TextBox>().Single(x => x.Name == "LoginPassword").Text == "", "login has ID/password only and no stored password");
            Check(controls.OfType<CheckBox>().Count() == 1 && controls.OfType<CheckBox>().Single().Checked, "login restores explicit remember ID option");
            Check(!controls.Any(x => x.Name == "FirstSetup"), "existing workspace does not show setup fields");
        }
        LoginIdPreference72.Save(preference, ""); Check(LoginIdPreference72.Read(preference) == "", "forget ID removes saved value");
        File.WriteAllText(preference, "invalid json"); Check(LoginIdPreference72.Read(preference) == "", "damaged preference does not block login form");
        LoginIdPreference72.Save(testRoot, "unwritable-as-file"); Check(Directory.Exists(testRoot), "preference write failure is isolated");
        using (var shell = new StartupShell75())
        {
            Check(shell.Controls.Count == 1 && shell.Controls[0] is MenuStrip { Enabled: false }, "startup background contains only disabled menu bar");
            Check(shell.WindowState == FormWindowState.Maximized && !shell.MaximizeBox && shell.MinimizeBox, "startup shell opens maximized with minimize and close only");
        }
        using var modules = DesktopModules.Load(root);
        Check(modules.Errors.Count == 0 && modules.Entries.Count == 9, "all nine packaged modules load");
        using var services = new WorkspaceServices(actor, store, new NoReports());
        if (args.Contains("--review-startup"))
        {
            foreach (var entry in modules.Entries) entry.Module.Initialize(services);
            using var shell = new StartupShell75();
            shell.Shown += (_, _) =>
            {
                using var picker = modules.Entries.Select(e => e.Module).OfType<IProjectSelectionModule75>().Single().CreateProjectSelectionDialog();
                picker.GetType().GetProperty("ConfirmExit")!.SetValue(picker, (Func<IWin32Window, DialogResult>)(_ => DialogResult.OK));
                using var timer = new System.Windows.Forms.Timer { Interval = 55000 };
                timer.Tick += (_, _) => { timer.Stop(); picker.Close(); }; timer.Start();
                picker.ShowDialog(shell); shell.Close();
            };
            Application.Run(shell); return 0;
        }
        using var form = new WorkbenchForm(root, modules, services);
        form.Shown += async (_, _) =>
        {
            try
            {
                await form.Ready.WaitAsync(TimeSpan.FromSeconds(15));
                var selectionModule = modules.Entries.Select(e => e.Module).OfType<IProjectSelectionModule75>().Single();
                using (var chooser = selectionModule.CreateProjectSelectionDialog())
                {
                    chooser.Show(form); await (Task)chooser.GetType().GetProperty("Ready")!.GetValue(chooser)!;
                    Check(!Tree(chooser).OfType<Button>().Single(b => b.Name == "OpenProject").Enabled, "cannot enter workspace without selected project");
                    chooser.GetType().GetProperty("ConfirmExit")!.SetValue(chooser, (Func<IWin32Window, DialogResult>)(_ => DialogResult.Cancel));
                    chooser.Close(); Check(chooser.Visible && !chooser.IsDisposed, "cancel exit confirmation keeps project chooser open");
                    Tree(chooser).OfType<TextBox>().Single(t => t.Name == "ProjectTitle").Text = "Startup created fixture";
                    Tree(chooser).OfType<Button>().Single(b => b.Name == "CreateProject").PerformClick();
                    for (int i = 0; i < 100 && !Tree(chooser).OfType<Button>().Single(b => b.Name == "OpenProject").Enabled; i++) await Task.Delay(50);
                    var chooseGrid = Tree(chooser).OfType<DataGridView>().Single();
                    Check(chooseGrid.Rows.Count == 1 && chooseGrid.CurrentRow?.Tag is WorkRecord, "create project refreshes and selects persisted row");
                    Tree(chooser).OfType<Button>().Single(b => b.Name == "OpenProject").PerformClick();
                    for (int i = 0; i < 100 && chooser.Visible; i++) await Task.Delay(50);
                    Check(((IProjectSelectionDialog75)chooser).SelectedProjectId is not null && chooser.DialogResult == DialogResult.OK, "open returns validated selected project");
                }
                using (var chooser = selectionModule.CreateProjectSelectionDialog())
                {
                    chooser.Show(form); await (Task)chooser.GetType().GetProperty("Ready")!.GetValue(chooser)!;
                    chooser.GetType().GetProperty("ConfirmExit")!.SetValue(chooser, (Func<IWin32Window, DialogResult>)(_ => DialogResult.OK));
                    chooser.Close(); Check(chooser.IsDisposed && ((IProjectSelectionDialog75)chooser).SelectedProjectId is null, "confirmed exit returns no project and closes chooser");
                }
                var menu = form.Controls.OfType<MenuStrip>().Single();
                Check(menu.Items.Cast<ToolStripItem>().Count(i => i.Text == "프로젝트") == 1 && !menu.Items.Cast<ToolStripItem>().Any(i => i.Text == "공정관리"), "project and process share one main menu group");
                Check(!form.Controls.OfType<TabControl>().Any() && form.Controls.OfType<ToolStrip>().Count(t => t.Dock == DockStyle.Top) == 1, "one main menu row with no global selector or duplicate tabs");
                var sidebar = Tree(form).OfType<WorkspaceSidebar73>().Single();
                Check(sidebar.GetType().Assembly.GetName().Name == "Jindan.Desktop.Contracts" && Tree(sidebar).Any(c => c.Name == "Navigate_projects") && Tree(sidebar).Any(c => c.Name == "Navigate_processes"), "DLL sidebar receives project and process routes from feature modules");
                Tree(sidebar).OfType<Button>().Single(b => b.Name == "Navigate_processes").PerformClick();
                var processWindow = (DocumentForm)form.ActiveMdiChild!; await ((RecordDocument)processWindow.Document).Ready;
                Check(processWindow.Module.ModuleId == "processes" && !processWindow.ControlBox && !processWindow.ShowIcon, "sidebar changes workspace without child system icon or buttons");
                Check(ReferenceEquals(form.NavigateToModule73("processes"), processWindow), "repeated menu navigation reuses current document");
                foreach (var windowState in new[] { FormWindowState.Maximized, FormWindowState.Normal })
                {
                    form.WindowState = windowState; await Task.Delay(150);
                    var viewport = form.Controls.OfType<MdiClient>().Single();
                    var bar = Tree(processWindow.Document.View).OfType<ToolStrip>().First();
                    var origin = viewport.PointToClient(bar.PointToScreen(Point.Empty));
                    Console.WriteLine($"GEOMETRY {windowState}: document={processWindow.Bounds}, toolbar={origin}, viewport={viewport.ClientRectangle}");
                    Check(origin.Y >= 0 && origin.X >= 0 && origin.Y + bar.Height <= viewport.ClientSize.Height, "workspace toolbar remains inside viewport " + windowState);
                }
                form.NavigateToModule73("projects");
                var empty = form.OpenDocument("report-studio"); await ReportReady(empty);
                Check(Tree(empty.Document.View).Single(x => x.Name == "ReportStatus").Text.Contains("프로젝트를 선택"), "unselected project shows guidance instead of read error");
                Check(Tree(form).OfType<WorkspaceSidebar73>().Single().SelectedProjectId is null && Tree(form).Any(c => c.Name == "BackToWork"), "studio project selection and return belong to sidebar");
                empty.Close(); await Task.Delay(150);
                Check(!form.StudioActive && empty.IsDisposed, "closing studio restores business workspace");
                var project = await store.SaveAsync(actor, new(null, "projects", null, 0, new() { ["title"] = "UI transition fixture" }));
                await form.RefreshProjectsAsync(); form.SelectProject(project.Id);
                var business = form.ActiveMdiChild as DocumentForm ?? throw new Exception("No business window");
                var projectEditor = (RecordDocument)business.Document;
                projectEditor.NewRecord(); projectEditor.SetField("title", "Unsaved business draft");
                var otherProject = await store.SaveAsync(actor, new(null, "projects", null, 0, new() { ["title"] = "Second context fixture" }));
                await form.RefreshProjectsAsync();
                var currentSidebar = Tree(form).OfType<WorkspaceSidebar73>().Single();
                var selector = Tree(currentSidebar).OfType<ComboBox>().Single(c => c.Name == "SidebarProject");
                selector.SelectedItem = selector.Items.Cast<ProjectChoice73>().Single(p => p.Id == otherProject.Id);
                Check(form.SelectedProjectId == project.Id && currentSidebar.SelectedProjectId == project.Id && projectEditor.IsDirty, "sidebar project change cannot discard dirty document or misreport selection");
                var studio = form.OpenDocument("report-studio"); await ReportReady(studio);
                Check(form.StudioActive && studio.MdiParent is null && !studio.TopLevel, "studio is embedded dedicated workspace, not MDI or modal");
                Check(!form.Controls.OfType<MenuStrip>().Single().Visible && form.Controls.OfType<TabControl>().All(t => !t.Visible), "business navigation hidden in studio");
                var draft = Tree(form).OfType<TextBox>().Single(x => x.Name == "DraftText"); draft.Text = "Preserve editor draft on return";
                var context = studio.Document.Context.ContextId;
                form.ReturnToWork();
                Check(!form.StudioActive && ReferenceEquals(form.ActiveMdiChild, business) && projectEditor.IsDirty, "return preserves business window and unsaved edit");
                var reopened = form.OpenDocument("report-studio");
                Check(ReferenceEquals(studio, reopened) && reopened.Document.Context.ContextId == context && draft.Text == "Preserve editor draft on return", "reenter preserves same studio context and editor contents");
                Check(form.Documents.Count(d => d.Module.ModuleId == "report-studio") == 1, "studio opening does not duplicate documents");
                var commands = Tree(studio.Document.View).OfType<ToolStrip>().Single(x => x.Name == "ReportMainCommands");
                Check(commands.Items.Count == 5, "report command bar has five groups/actions");
                var pages = Tree(studio.Document.View).OfType<TabControl>().Single(x => x.Name == "DocumentTabs");
                Check(pages.TabCount <= 6 && !pages.TabPages.Cast<TabPage>().Any(p => p.Name == "LegacyArchiveTab"), "deferred report tools removed from normal tabs");
                form.ReturnToWork(); await projectEditor.SaveAsync();
                var files = form.OpenDocument("files"); await ((RecordDocument)files.Document).Ready;
                var fileToolbar = Tree(files.Document.View).OfType<ToolStrip>().First();
                var fileGrid = Tree(files.Document.View).OfType<DataGridView>().Single();
                Check(!fileGrid.Columns["assetId"]!.Visible && !fileGrid.Columns["sha256"]!.Visible && !fileGrid.Columns["folderId"]!.Visible, "file list hides internal identifiers without changing stored fields");
                Check(fileGrid.ColumnHeadersHeightSizeMode == DataGridViewColumnHeadersHeightSizeMode.AutoSize && fileGrid.Columns.Cast<DataGridViewColumn>().Where(c => c.Visible).All(c => c.MinimumWidth >= 100), "column headers resize and retain readable minimum width");
                foreach (var size in new[] { new Size(900, 620), new Size(1600, 900) })
                {
                    form.Size = size; await Task.Delay(150);
                    var viewport = form.Controls.OfType<MdiClient>().Single();
                    var origin = viewport.PointToClient(fileToolbar.PointToScreen(Point.Empty));
                    Console.WriteLine($"FILES GEOMETRY {size}: document={files.Bounds}, toolbar={origin}");
                    Check(origin.Y >= 0 && origin.X >= 0, "file toolbar remains visible after resize " + size);
                }
                Check(fileToolbar.Items.OfType<ToolStripButton>().Count() <= 5 && !fileToolbar.Items.Cast<ToolStripItem>().Any(i => i.Text?.Contains("시험") == true), "file commands grouped and cache test hidden");
                var last = form.OpenDocument("report-studio");
                Check(last.Document.Context.ProjectId == project.Id, "studio keeps report project scope across module changes");
                using (var startup = new WorkbenchForm(root, modules, services, project.Id))
                {
                    startup.Show(); await startup.Ready.WaitAsync(TimeSpan.FromSeconds(15));
                    Check(startup.SelectedProjectId == project.Id && startup.Documents.All(d => d.Document.Context.ProjectId == project.Id), "selected startup project propagates to first workspace before use");
                    Check(!startup.MaximizeBox && startup.MinimizeBox, "workbench exposes minimize and close only");
                    startup.Close();
                }
                if (args.Contains("--review-window"))
                {
                    form.ReturnToWork(); form.NavigateToModule73("projects");
                    form.Text = "UI 점검 · 메뉴와 사이드바";
                    await Task.Delay(TimeSpan.FromSeconds(45));
                }
            }
            catch (Exception error) { failed++; Console.WriteLine("FAIL " + error); }
            finally
            {
                foreach (var document in form.Documents.ToArray()) if (document.Document.IsDirty) document.Dispose();
                form.Close();
            }
        };
        Application.Run(form);
        Console.WriteLine($"RESULT pass={passed} fail={failed}"); return failed == 0 ? 0 : 1;
    }
    sealed class NoReports : IReportService
    {
        public Task<ReportReply> ExecuteAsync(DocumentContext context, ReportCommand command, IProgress<ReportProgress>? progress = null, CancellationToken ct = default) => throw new NotSupportedException();
        public Task AcknowledgeReviewAsync(DocumentContext context, string sourceSha256, string fingerprint, string reviewPath, CancellationToken ct = default) => throw new NotSupportedException();
        public void Invalidate(string contextId) { }
    }
}
