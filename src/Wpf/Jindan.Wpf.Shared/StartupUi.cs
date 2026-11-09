using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using Jindan.Startup;
using Wpf.Ui.Controls;

namespace Jindan.Fluent.Shared;

public interface IStartupUiModule
{
    string Id { get; }
    Window CreateWindow(IStartupServer server, StartupUiContext context);
}

public sealed class StartupUiContext(string preferencesPath, Action<string, string, int>? trace = null)
{
    public string PreferencesPath { get; } = preferencesPath;
    public ProjectChoice? SelectedProject { get; set; }
    public Jindan.Contracts.ProjectFiles.ProjectFile77? ProjectFile { get; set; }
    public bool ExitRequested { get; set; }
    public bool LoginRequired { get; set; }
    public bool CanCancelProjectSelection { get; init; }
    public Func<Window, bool> ConfirmExit { get; init; } = ExitPrompt.Ask;
    public void Trace(string operation, string phase, int items = 0) => trace?.Invoke(operation, phase, items);
}

public static class Branding
{
    public static void ApplyAccent() => Wpf.Ui.Appearance.ApplicationAccentColorManager.Apply(System.Windows.Media.Color.FromRgb(53, 108, 206), Wpf.Ui.Appearance.ApplicationTheme.Light, false);
    public static BitmapImage Logo => new(new Uri("pack://application:,,,/Jindan.Wpf.Shared;component/Assets/brand.png"));
    public static BitmapImage Icon => new(new Uri("pack://application:,,,/Jindan.Wpf.Shared;component/Assets/brand.ico"));
}

public class StartupDialog : FluentWindow
{
    readonly CancellationTokenSource lifetime = new();
    bool accepted;
    protected StartupUiContext Context { get; }
    protected CancellationToken Lifetime => lifetime.Token;
    public bool IsClosed { get; private set; }
    protected virtual bool CanReturnToWorkspace => false;
    protected StartupDialog(StartupUiContext context)
    {
        Context = context; Icon = Branding.Icon; ResizeMode = ResizeMode.NoResize; MinWidth = MinHeight = 0;
        ShowInTaskbar = false; WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ExtendsContentIntoTitleBar = true; WindowBackdropType = WindowBackdropType.None;
        FontFamily = new("Malgun Gothic"); FontSize = 13; UseLayoutRounding = true;
        SetResourceReference(BackgroundProperty, "ApplicationBackgroundBrush");
        SetResourceReference(ForegroundProperty, "TextFillColorPrimaryBrush");
        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) { e.Handled = true; Close(); } };
        Loaded += (_, _) => { MaxHeight = SystemParameters.WorkArea.Height; MaxWidth = SystemParameters.WorkArea.Width; };
    }
    protected void Finish() { accepted = true; DialogResult = true; }
    protected override void OnClosing(CancelEventArgs e)
    {
        if (!accepted && !CanReturnToWorkspace && !Context.ExitRequested)
        {
            if (!Context.ConfirmExit(this)) e.Cancel = true;
            else Context.ExitRequested = true;
        }
        if (!e.Cancel) lifetime.Cancel();
        base.OnClosing(e);
    }
    protected override void OnClosed(EventArgs e) { IsClosed = true; lifetime.Cancel(); lifetime.Dispose(); base.OnClosed(e); }
}
