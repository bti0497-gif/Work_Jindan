using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Windows;
using Jindan.Infrastructure;
using Jindan.Infrastructure.Cloud;
using Jindan.Startup;
using Jindan.Startup.Server;
using Jindan.Fluent.Shared;

namespace Jindan.Fluent.Desktop;

public partial class App : Application
{
    IStartupServer? server;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        Branding.ApplyAccent();
        // This WPF startup uses its own preferences/logs. No legacy workspace migration or account copying.
        var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Deojon", "Jindan", "Wpf");
        var diagnostic = new Diagnostic71(Path.Combine(data, "diagnostics"));
        diagnostic.Write("app.start", "start");
        try
        {
            using var settingsStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("server-public.json")!;
            var settings = JsonSerializer.Deserialize<ServerSettings75>(settingsStream) ?? throw new InvalidDataException();
            server = new FirebaseStartupServer(new CloudReadService71(diagnostic), settings);
            var context = new StartupUiContext(Path.Combine(data, "login-id.json"), (operation, phase, count) => diagnostic.Write(operation, phase, items: count));
            var shell = new MainWindow(server, context, new StartupModuleLoader(AppContext.BaseDirectory));
            MainWindow = shell; shell.Show();
        }
        catch
        {
            diagnostic.Write("app.failure", "failure");
            MessageBox.Show("시작 화면을 불러오지 못했습니다. 프로그램 파일과 진단 로그를 확인해 주세요.", "기술진단팀", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(2);
        }
    }
    protected override void OnExit(ExitEventArgs e) { server?.Dispose(); base.OnExit(e); }
}
