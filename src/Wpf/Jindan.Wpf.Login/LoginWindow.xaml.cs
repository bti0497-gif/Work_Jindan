using System.Windows;
using Jindan.Startup;
using Jindan.Fluent.Shared;

namespace Jindan.Fluent.Login;

public sealed class LoginModule : IStartupUiModule
{
    public string Id => "login";
    public Window CreateWindow(IStartupServer server, StartupUiContext context) => new LoginWindow(server, context);
}

public partial class LoginWindow : StartupDialog
{
    readonly IStartupServer server;
    bool busy;
    public LoginWindow(IStartupServer server, StartupUiContext context) : base(context)
    {
        this.server = server; InitializeComponent();
        LoginId.Text = RememberedId.Read(context.PreferencesPath); Remember.IsChecked = LoginId.Text.Length > 0;
        Remember.Unchecked += (_, _) => RememberedId.Save(context.PreferencesPath, "");
        Loaded += (_, _) => { if (LoginId.Text.Length > 0) Password.Focus(); else LoginId.Focus(); };
        Closed += (_, _) => Password.Clear();
    }
    async void SignIn(object sender, RoutedEventArgs e)
    {
        if (busy) return;
        var id = LoginId.Text.Trim();
        if (id.Length == 0 || Password.Password.Length == 0) { ShowNotice("아이디와 비밀번호를 입력해 주세요."); return; }
        busy = true; Fields.IsEnabled = Submit.IsEnabled = false; Submit.Content = "로그인 중…"; Notice.Visibility = Visibility.Collapsed;
        Context.Trace("login.submit", "start");
        try
        {
            var request = server.SignInAsync(id, Password.Password, Lifetime); Password.Clear(); await request;
            if (IsClosed) { server.Disconnect(); return; }
            RememberedId.Save(Context.PreferencesPath, Remember.IsChecked == true ? id : "");
            Context.LoginRequired = false; Context.Trace("login.success", "success"); Finish();
        }
        catch (Exception error)
        {
            Context.Trace("login.submit", "failure");
            if (!IsClosed) ShowNotice(StartupMessages.RequiresLogin(error) || error.Message == "CLOUD_REQUEST_REJECTED" ? "아이디·비밀번호 또는 계정의 활성 상태를 확인해 주세요." : StartupMessages.For(error));
        }
        finally
        {
            busy = false;
            if (!IsClosed) { Password.Clear(); Fields.IsEnabled = Submit.IsEnabled = true; Submit.Content = "로그인"; Password.Focus(); }
        }
    }
    void ShowNotice(string text) { Notice.Text = text; Notice.Visibility = Visibility.Visible; }
}
