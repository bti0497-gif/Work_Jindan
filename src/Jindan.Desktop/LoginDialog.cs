using Jindan.Contracts;
namespace Jindan.Desktop;

public sealed class LoginDialog : Form
{
    private readonly IIdentityService identities;
    private readonly TextBox name = new() { Width = 300 }, password = new() { Width = 300, UseSystemPasswordChar = true };
    private readonly CheckBox explicitLocal = new() { Text = "새 독립 로컬 작업공간 설정임을 확인합니다", AutoSize = true };
    private readonly Label message = new() { AutoSize = true, MaximumSize = new Size(340, 0) };
    public Identity? Actor { get; private set; }
    public LoginDialog(IIdentityService service)
    {
        identities = service; Text = "진단 작업대 · 로컬 로그인"; Width = 420; Height = 350; StartPosition = FormStartPosition.CenterScreen; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        var panel = new FlowLayoutPanel() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(20) };
        panel.Controls.Add(new Label() { Text = service.IsInitialized ? "로컬 계정으로 로그인" : "첫 실행: 로컬 관리자 계정 만들기", AutoSize = true }); panel.Controls.Add(new Label() { Text = "이름", AutoSize = true }); panel.Controls.Add(name); panel.Controls.Add(new Label() { Text = "암호 (10자 이상)", AutoSize = true }); panel.Controls.Add(password); if (!service.IsInitialized) panel.Controls.Add(explicitLocal);
        var login = new Button() { Text = service.IsInitialized ? "로그인" : "독립 작업공간 만들기", AutoSize = true }; login.Click += async (_, _) => { login.Enabled = false; try { Actor = identities.IsInitialized ? await identities.LoginAsync(name.Text, password.Text) : await identities.BootstrapAsync(name.Text, password.Text, explicitLocal.Checked); password.Clear(); DialogResult = DialogResult.OK; Close(); } catch { password.Clear(); message.Text = "이름·암호·로컬 설정 확인을 점검하세요."; } finally { login.Enabled = true; } }; panel.Controls.Add(login); panel.Controls.Add(message); Controls.Add(panel); AcceptButton = login;
    }
}
