using System.ComponentModel;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Jindan.Contracts.Cloud;
using Jindan.Fluent.Desktop;
using Jindan.Fluent.Login;
using Jindan.Fluent.Projects;
using Jindan.Fluent.Shared;
using Jindan.Infrastructure;
using Jindan.Infrastructure.Cloud;
using Jindan.Startup;
using Jindan.Startup.Server;

internal static class Program
{
    static int passed;
    static readonly string Output = Path.GetFullPath("artifacts/wpf76-tests");
    static void Check(bool success, string message) { if (!success) throw new Exception(message); passed++; Console.WriteLine("PASS " + message); }
    [STAThread]
    static int Main()
    {
        try
        {
            Directory.CreateDirectory(Output); ServerChecks().GetAwaiter().GetResult(); ModelChecks().GetAwaiter().GetResult(); ProjectFileChecks77.Run(Check, Output).GetAwaiter().GetResult(); ProjectCatalogChecks78.Run(Check, Output); UiChecks();
            Console.WriteLine($"PASS TOTAL {passed}; synthetic requests only; no company server writes"); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
    static async Task ServerChecks()
    {
        var fixture = new FirebaseFixture();
        var cloud = new CloudReadService71(new Diagnostic71(Output), fixture);
        using var server = new FirebaseStartupServer(cloud, new("fixture-project", "fixture-public-key"));
        Check(!server.IsAuthenticated, "no inherited authentication");
        fixture.BadPassword = true;
        try { await server.SignInAsync("sample", "synthetic-password", default); throw new Exception("login accepted"); } catch (CloudConnectionException) { Check(!server.IsAuthenticated, "failed server login never opens session"); }
        fixture.BadPassword = false; await server.SignInAsync("sample", "synthetic-password", default);
        Check(server.IsAuthenticated && server.Member?.Name == "테스트 사용자", "server member profile gates authentication");
        Check(fixture.TransformedCredentials, "legacy ID/password transform is reused");
        var rows = await server.ListProjectsAsync(default);
        Check(rows.Count == 1 && rows[0].Id == "existing-project", "existing project ID is retained and deleted rows are hidden");
        Check(rows[0].Name == "기존 환경시설 기술진단" && rows[0].StartDate == "2026-10-12", "legacy project fields map to separate columns");
        var id = Guid.NewGuid().ToString("N"); var input = new NewProject("신규 테스트", new(2026, 11, 9), new(2027, 1, 29), "synthetic only");
        fixture.LoseCommitResponse = true;
        try { await server.CreateProjectAsync(id, input, default); throw new Exception("expected lost response"); } catch (CloudConnectionException) { Check(fixture.Commits == 1, "server committed but response was lost"); }
        var retried = await server.CreateProjectAsync(id, input, default);
        Check(retried.Id == id && fixture.Commits == 1, "retry resolves same document without another create");
        Check(fixture.ValidWrite, "create uses existing schema with create-only precondition");
        try { await server.CreateProjectAsync(id, input with { Name = "different" }, default); throw new Exception("collision accepted"); } catch (CloudConnectionException error) { Check(error.Message == "PROJECT_REQUEST_CONFLICT", "conflicting request ID cannot open another project"); }
        fixture.Active = false;
        try { await server.ListProjectsAsync(default); throw new Exception("disabled accepted"); } catch (CloudConnectionException) { Check(!server.IsAuthenticated, "revoked member cannot read projects"); }
        var diagnostics = string.Join("", Directory.GetFiles(Output, "*.jsonl").Select(File.ReadAllText));
        Check(!diagnostics.Contains("synthetic-password") && !diagnostics.Contains("fixture-token") && !diagnostics.Contains("기존 환경시설"), "diagnostics exclude secrets and project content");
    }
    static async Task ModelChecks()
    {
        using var server = new FakeServer(); var model = new ProjectSelectionModel(server);
        await model.RefreshAsync(default); Check(model.Projects.Count == 1 && !model.CanOpen, "list does not silently select a project");
        model.Selected = model.Projects[0]; Check(model.CanOpen, "explicit selection enables open");
        server.Rows.Clear(); Check(await model.OpenAsync(default) is null && !model.CanOpen, "deleted project is revalidated and cannot open");
        server.Rows.Add(FakeServer.Existing); await model.RefreshAsync(default); model.Selected = model.Projects[0];
        server.FailList = true; await model.RefreshAsync(default);
        Check(model.Projects.Count == 0 && !model.CanOpen && model.Notice.Contains("서버"), "list failure removes stale options and shows failure, not empty result");
        server.FailList = false;
        var input = new NewProject("테스트 프로젝트", new(2026, 11, 9), new(2027, 1, 29), "");
        await model.CreateAsync(input with { Name = " " }, default); Check(server.CreateCalls == 0, "invalid creation never reaches server");
        await model.CreateAsync(input with { End = new(2026, 1, 1) }, default); Check(server.CreateCalls == 0, "reversed dates never reach server");
        server.LoseCreateResponse = true; await model.CreateAsync(input, default);
        var requestId = server.LastId;
        Check(!model.CanEdit && model.CreateLabel.Contains("재시도"), "uncertain creation retains immutable request");
        await model.CreateAsync(input with { Name = "ignored mutation" }, default);
        Check(server.LastId == requestId && server.LastInput?.Name == input.Name && model.CanOpen, "retry keeps original ID and input");
        Check((await model.OpenAsync(default))?.Id == requestId, "created project opens only after server revalidation");
        var gate = new TaskCompletionSource<IReadOnlyList<ProjectChoice>>(); server.WaitList = gate.Task;
        var loading = model.RefreshAsync(default); await model.RefreshAsync(default); await model.CreateAsync(input, default);
        Check(model.IsBusy && !model.CanOpen && !model.CanAct, "loading blocks duplicate actions");
        gate.SetResult(server.Rows); await loading; server.WaitList = null;
        server.Revoked = true; await model.RefreshAsync(default);
        Check(model.RequiresLogin && !model.CanAct, "revocation requires re-login rather than cached access");
        var preferences = Path.Combine(Output, "remembered-id-test.json"); RememberedId.Save(preferences, "sample");
        Check(RememberedId.Read(preferences) == "sample", "remember ID round trip"); RememberedId.Save(preferences, "");
        Check(RememberedId.Read(preferences) == "", "unchecking remember clears the saved ID");
    }
    static void UiChecks()
    {
        var application = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        application.Resources = new ResourceDictionary { Source = new Uri("pack://application:,,,/Jindan.Wpf.Shared;component/CompactTheme.xaml") };
        Branding.ApplyAccent();
        using var server = new FakeServer();
        var context = new StartupUiContext(Path.Combine(Output, "ui-id.json")) { ConfirmExit = _ => false };
        var shell = new MainWindow(server, context, new StartupModuleLoader(AppContext.BaseDirectory));
        Check(shell.WindowState == WindowState.Maximized && shell.ResizeMode == ResizeMode.CanResize && ((Wpf.Ui.Controls.TitleBar)shell.FindName("AppTitle")).ShowMaximize, "main window starts maximized and permits user restore/resize");
        shell.WindowState = WindowState.Normal; shell.RaiseEvent(new RoutedEventArgs(FrameworkElement.LoadedEvent));
        Check(shell.WindowState == WindowState.Maximized, "first native load reapplies startup maximization");
        shell.WindowState = WindowState.Normal;
        Check(shell.WindowState == WindowState.Normal, "user restore is not forced back into a maximize loop");
        Check(((Grid)shell.FindName("WorkspaceHost")).Children.Count == 0 && !((Menu)shell.FindName("MainMenu")).IsEnabled, "pre-login shell contains only disabled menu and empty workspace");
        Render(shell, "main.png", 1280, 720);
        var login = new LoginWindow(server, context); Render(login, "login.png", 360, 258);
        Check(((FrameworkElement)login.FindName("LoginId")).Height == 32 && ((PasswordBox)login.FindName("Password")).Password.Length == 0, "compact login uses empty password and 32px inputs");
        var picker = new ProjectWindow(server, context); picker.Model.RefreshAsync(default).GetAwaiter().GetResult();
        picker.Model.Projects[0] = picker.Model.Projects[0] with { LocalFilePath = @"D:\기술진단\옹진군\시설 기술진단.tzprj" };
        Render(picker, "projects.png", 760, 434);
        var grid = (DataGrid)picker.FindName("ProjectList");
        Check(grid.Columns.Count == 2 && grid.Columns[1].Header.Equals("파일 경로") && grid.RowHeight == 34 && picker.Width == 760, "project picker shows name and file path in compact two-column rows");
        Check(grid.Items.Count == 1 && !grid.CanUserAddRows && grid.IsReadOnly, "server project appears as a read-only detail row");
        var fileReview = new ProjectFileReview(ProjectFileChecks77.Sample(), "current-company");
        Render(fileReview, "project-file-review.png", 420, 300);
        Check(((TextBlock)fileReview.FindName("Details")).Text.Contains("다른 서버"), "file review makes a foreign server reference visible before registration");
        var closing = new ProbeDialog(context);
        Check(closing.RequestCloseCancelled() && !context.ExitRequested, "exit cancellation keeps startup alive");
        var exitContext = new StartupUiContext("unused") { ConfirmExit = _ => true };
        Check(!new ProbeDialog(exitContext).RequestCloseCancelled() && exitContext.ExitRequested, "exit confirmation closes startup");
        var switchContext = new StartupUiContext("unused")
        {
            CanCancelProjectSelection = true, SelectedProject = FakeServer.Existing,
            ConfirmExit = _ => throw new Exception("Project switching must not ask to exit the app")
        };
        var switchPicker = new ProjectWindow(server, switchContext);
        Check(!RequestProjectClose(switchPicker) && !switchContext.ExitRequested && switchContext.SelectedProject == FakeServer.Existing, "cancelling project switch preserves current project without an exit prompt");
        Check(switchPicker.Title == "프로젝트 열기" && picker.Title == "프로젝트 열기" && ((Wpf.Ui.Controls.Button)switchPicker.FindName("ExitButton")).Content.Equals("취소"), "startup and reused picker both say open while keeping cancel behavior");
        var startupPicker = new ProjectWindow(server, context);
        Check(RequestProjectClose(startupPicker) && !context.ExitRequested, "initial project picker still requires exit confirmation");
        Check(!typeof(LoginModule).Assembly.GetReferencedAssemblies().Any(a => a.Name == "Jindan.Wpf.Projects") && !typeof(ProjectsModule).Assembly.GetReferencedAssemblies().Any(a => a.Name == "Jindan.Wpf.Login"), "feature DLLs do not reference each other");
        var hostPath = Path.GetFullPath("src/Wpf/Jindan.Wpf.Desktop/bin/Debug/net10.0-windows");
        var loader = new StartupModuleLoader(hostPath);
        Check(loader.Get("login").Id == "login" && loader.Get("projects").Id == "projects", "host loads the two feature DLLs from explicit module inventory");
        Check(!File.Exists(Path.Combine(hostPath, "Jindan.Wpf.Desktop.exe")), "no packaged EXE was produced");
        application.Shutdown();
    }
    static void Render(Window window, string name, double width, double height)
    {
        var content = (FrameworkElement)window.Content;
        content.SetValue(TextElement.ForegroundProperty, Brushes.Black);
        if (content is Panel panel && panel.Background is null) panel.Background = Brushes.White;
        content.Measure(new Size(width, height)); content.Arrange(new Rect(0, 0, width, height)); content.UpdateLayout();
        var image = new RenderTargetBitmap((int)width, (int)height, 96, 96, PixelFormats.Pbgra32); image.Render(content);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image)); using var file = File.Create(Path.Combine(Output, name)); encoder.Save(file);
    }
    sealed class ProbeDialog(StartupUiContext context) : StartupDialog(context)
    {
        public bool RequestCloseCancelled() { var args = new CancelEventArgs(); OnClosing(args); return args.Cancel; }
    }
    static bool RequestProjectClose(ProjectWindow window)
    {
        var args = new CancelEventArgs();
        typeof(StartupDialog).GetMethod("OnClosing", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(window, [args]);
        return args.Cancel;
    }
    sealed class FakeServer : IStartupServer
    {
        public static readonly ProjectChoice Existing = new("existing", "기존 환경시설 기술진단", "2026-10-12", "2027-01-29", "");
        public List<ProjectChoice> Rows = [Existing];
        public bool FailList, Revoked, LoseCreateResponse;
        public int CreateCalls; public string? LastId; public NewProject? LastInput;
        public Task<IReadOnlyList<ProjectChoice>>? WaitList;
        public bool IsAuthenticated => !Revoked;
        public StartupMember? Member => new("fixture", "테스트 사용자");
        public Task SignInAsync(string id, string password, CancellationToken ct) => Task.CompletedTask;
        public Task<IReadOnlyList<ProjectChoice>> ListProjectsAsync(CancellationToken ct)
        {
            if (Revoked) throw new CloudConnectionException("FIREBASE_MEMBER_DISABLED");
            if (FailList) throw new CloudConnectionException("CLOUD_REQUEST_FAILED");
            return WaitList ?? Task.FromResult<IReadOnlyList<ProjectChoice>>(Rows.ToArray());
        }
        public Task<ProjectChoice> CreateProjectAsync(string id, NewProject input, CancellationToken ct)
        {
            CreateCalls++; LastId = id; LastInput = input;
            var row = new ProjectChoice(id, input.Name, input.Start.ToString("yyyy-MM-dd"), input.End.ToString("yyyy-MM-dd"), input.Description);
            if (!Rows.Any(r => r.Id == id)) Rows.Add(row);
            if (LoseCreateResponse) { LoseCreateResponse = false; throw new CloudConnectionException("CLOUD_REQUEST_FAILED"); }
            return Task.FromResult(row);
        }
        public void Disconnect() { }
        public void Dispose() { }
    }
    sealed class FirebaseFixture : HttpMessageHandler
    {
        public bool BadPassword, Active = true, LoseCommitResponse, ValidWrite, TransformedCredentials;
        public int Commits;
        readonly List<JsonElement> created = [];
        static object S(string value) => new { stringValue = value };
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            object response; var path = request.RequestUri!.AbsolutePath;
            if (path.Contains("signInWithPassword"))
            {
                using var input = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
                string Hash(string value) => Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value)));
                TransformedCredentials = input.RootElement.GetProperty("email").GetString() == "id-" + Hash("work-jindan:id:v1:sample") + "@work-jindan.internal" && input.RootElement.GetProperty("password").GetString() == Hash("work-jindan:password:v1:sample:synthetic-password");
                if (BadPassword) return new(HttpStatusCode.BadRequest);
                response = new { idToken = "fixture-token", localId = "fixture-uid", expiresIn = "3600" };
            }
            else
            {
                if (request.Headers.Authorization?.Parameter != "fixture-token") throw new Exception("missing bearer");
                if (path.EndsWith("jindan_members/fixture-uid")) response = new { fields = new { isActive = new { booleanValue = Active }, person_id = S("sample"), name = S("테스트 사용자"), userLevel = new { integerValue = "1" } } };
                else if (path.EndsWith("/jindan_projects"))
                {
                    var rows = new List<object>
                    {
                        new { name = "projects/fixture-project/databases/(default)/documents/jindan_projects/existing-project", fields = new { title = S("기존 환경시설 기술진단"), startDate = S("2026-10-12"), endDate = S("2027-01-29"), content = S(""), ownerUid = S("fixture-uid"), deleted = new { booleanValue = false } } },
                        new { name = "projects/fixture-project/databases/(default)/documents/jindan_projects/deleted", fields = new { deleted = new { booleanValue = true } } }
                    };
                    rows.AddRange(created.Cast<object>()); response = new { documents = rows };
                }
                else if (path.EndsWith("/documents:commit"))
                {
                    using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)); var write = body.RootElement.GetProperty("writes")[0]; var update = write.GetProperty("update");
                    ValidWrite = !write.GetProperty("currentDocument").GetProperty("exists").GetBoolean() && update.GetProperty("fields").GetProperty("ownerUid").GetProperty("stringValue").GetString() == "fixture-uid";
                    created.Add(update.Clone()); Commits++;
                    if (LoseCommitResponse) { LoseCommitResponse = false; throw new HttpRequestException("synthetic lost response"); }
                    response = new { commitTime = "2026-11-09T00:00:00Z" };
                }
                else throw new Exception("unexpected synthetic endpoint");
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json") };
        }
    }
}
