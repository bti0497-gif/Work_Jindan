using System.ComponentModel;
using System.Windows;
using Jindan.Startup;
using Jindan.Fluent.Shared;

namespace Jindan.Fluent.Desktop;

public partial class MainWindow : Wpf.Ui.Controls.FluentWindow
{
    readonly IStartupServer server;
    readonly StartupUiContext context;
    readonly StartupModuleLoader modules;
    bool starting;
    public ProjectChoice? CurrentProject => context.SelectedProject;
    public MainWindow(IStartupServer server, StartupUiContext context, StartupModuleLoader modules)
    {
        this.server = server; this.context = context; this.modules = modules;
        InitializeComponent(); Icon = Branding.Icon;
        Loaded += MaximizeOnFirstLoad;
        ContentRendered += StartOnce;
    }
    void MaximizeOnFirstLoad(object sender, RoutedEventArgs e)
    {
        Loaded -= MaximizeOnFirstLoad;
        // Apply after the native window/chrome exists; subsequent restore/resize
        // is user controlled and must not trigger a forced maximize loop.
        WindowState = WindowState.Maximized;
    }
    void StartOnce(object? sender, EventArgs e) { ContentRendered -= StartOnce; RunStartup(); }
    void RunStartup(bool projectOnly = false)
    {
        if (starting) return;
        starting = true; MainMenu.IsEnabled = false; WorkspaceHost.Children.Clear(); context.SelectedProject = null; context.ProjectFile = null;
        AppTitle.Title = Title = "더죤환경기술(주) · 기술진단팀";
        try
        {
            while (!context.ExitRequested)
            {
                if (!projectOnly || !server.IsAuthenticated || context.LoginRequired)
                {
                    server.Disconnect(); context.LoginRequired = false;
                    var login = modules.Get("login").CreateWindow(server, context); login.Owner = this; context.Trace("login.window", "success");
                    if (login.ShowDialog() != true || !server.IsAuthenticated) { context.ExitRequested = true; break; }
                }
                var picker = modules.Get("projects").CreateWindow(server, context); picker.Owner = this; context.Trace("project.window", "success");
                if (picker.ShowDialog() != true) { context.ExitRequested = true; break; }
                if (context.LoginRequired) { projectOnly = false; continue; }
                if (context.SelectedProject is null || !server.IsAuthenticated) { projectOnly = false; continue; }
                MainMenu.IsEnabled = true;
                AppTitle.Title = Title = $"더죤환경기술 · {context.SelectedProject.Name}";
                return;
            }
            Close();
        }
        catch
        {
            context.Trace("app.failure", "failure"); server.Disconnect();
            MessageBox.Show(this, "로그인·프로젝트 화면을 불러오지 못했습니다. 프로그램 파일을 확인해 주세요.", "시작 오류", MessageBoxButton.OK, MessageBoxImage.Error);
            context.ExitRequested = true; Close();
        }
        finally { starting = false; }
    }
    void ChooseProject(object sender, RoutedEventArgs e)
    {
        if (starting) return;
        if (!server.IsAuthenticated || context.SelectedProject is null) { RunStartup(); return; }
        // Keep the current workspace until the user successfully opens another project.
        var selection = new StartupUiContext(context.PreferencesPath, context.Trace)
        {
            CanCancelProjectSelection = true, SelectedProject = context.SelectedProject, ProjectFile = context.ProjectFile,
            ConfirmExit = context.ConfirmExit
        };
        bool loginRequired = false;
        starting = true;
        try
        {
            var picker = modules.Get("projects").CreateWindow(server, selection); picker.Owner = this;
            context.Trace("project.window", "success");
            var accepted = picker.ShowDialog() == true;
            loginRequired = selection.LoginRequired || !server.IsAuthenticated;
            if (accepted && !loginRequired && selection.SelectedProject is { } project)
            {
                context.SelectedProject = project; context.ProjectFile = selection.ProjectFile; WorkspaceHost.Children.Clear();
                AppTitle.Title = Title = $"더죤환경기술 · {project.Name}";
            }
        }
        catch
        {
            context.Trace("app.failure", "failure");
            MessageBox.Show(this, "프로젝트 열기 창을 열지 못했습니다. 현재 프로젝트는 유지됩니다.", "프로젝트 열기", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { starting = false; }
        if (loginRequired) RunStartup();
    }
    void Logout(object sender, RoutedEventArgs e) => RunStartup();
    protected override void OnClosing(CancelEventArgs e)
    {
        if (!context.ExitRequested && !context.ConfirmExit(this)) e.Cancel = true;
        if (!e.Cancel) { context.ExitRequested = true; server.Disconnect(); }
        base.OnClosing(e);
    }
}
