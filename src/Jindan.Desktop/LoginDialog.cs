using System.Text.Json;
using Jindan.Contracts;
namespace Jindan.Desktop;

public sealed class LoginDialog : Form
{
    readonly TextBox name = new() { Name = "LoginId", PlaceholderText = "아이디", AccessibleName = "아이디", Dock = DockStyle.Fill, Margin = new(0, 0, 12, 10), TabIndex = 0 };
    readonly TextBox password = new() { Name = "LoginPassword", PlaceholderText = "비밀번호", AccessibleName = "비밀번호", UseSystemPasswordChar = true, Dock = DockStyle.Fill, Margin = new(0, 0, 12, 10), TabIndex = 1 };
    readonly CheckBox remember = new() { Name = "RememberId", Text = "아이디 저장", AutoSize = true, Margin = new(0, 4, 0, 0), TabIndex = 2 };
    readonly Label message = new() { Name = "LoginMessage", Dock = DockStyle.Fill, ForeColor = Color.Firebrick };
    public Identity? Actor { get; private set; }
    readonly CancellationTokenSource lifetime = new();
    public LoginDialog(IIdentityService? service, string? preferences = null, Func<string, string, CancellationToken, Task<Identity>>? serverLogin = null)
    {
        Text = "더죤환경기술 · 로그인"; Name = "JindanLogin"; Icon = ApplicationBrand75.LoadIcon();
        Font = new Font("Malgun Gothic", 10); AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new(420, 300); BackColor = Color.FromArgb(241, 245, 249);
        StartPosition = FormStartPosition.CenterScreen; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        var card = new TableLayoutPanel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new(28), ColumnCount = 2, RowCount = 4 };
        card.ColumnStyles.Add(new(SizeType.Percent, 100)); card.ColumnStyles.Add(new(SizeType.Absolute, 104));
        card.RowStyles.Add(new(SizeType.Absolute, 42)); card.RowStyles.Add(new(SizeType.Absolute, 42)); card.RowStyles.Add(new(SizeType.Absolute, 34)); card.RowStyles.Add(new(SizeType.Percent, 100));
        var login = new Button { Name = "LoginSubmit", Text = "로그인", Dock = DockStyle.Fill, BackColor = Color.FromArgb(30, 41, 59), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Margin = new(0, 0, 0, 10), TabIndex = 3 };
        login.FlatAppearance.BorderSize = 0;
        card.Controls.Add(name, 0, 0); card.Controls.Add(password, 0, 1); card.Controls.Add(login, 1, 0); card.SetRowSpan(login, 2);
        card.Controls.Add(remember, 0, 2); card.Controls.Add(message, 0, 3); card.SetColumnSpan(message, 2);
        if (serverLogin is null && service?.IsInitialized != true)
        {
            var setup = new LinkLabel { Name = "FirstSetup", Text = "최초 설정", AutoSize = true, Margin = new(0, 6, 0, 0) };
            setup.LinkClicked += (_, _) => { using var dialog = new LocalSetupDialog(service!); if (dialog.ShowDialog(this) == DialogResult.OK) { name.Text = dialog.AccountName; setup.Visible = false; password.Focus(); } };
            card.Controls.Add(setup, 1, 2);
        }
        var header = new Panel { Dock = DockStyle.Top, Height = 76, BackColor = Color.White, Padding = new(24, 12, 24, 8) };
        var logo = new PictureBox { Name = "CompanyIcon", Image = ApplicationBrand75.LoadImage(), SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Left, Width = 52 };
        header.Controls.Add(new Label { Text = "더죤환경기술(주)\n기술진단팀 협업 스튜디오", Dock = DockStyle.Fill, Padding = new(12, 4, 0, 0), ForeColor = Color.FromArgb(36, 57, 87) }); header.Controls.Add(logo);
        Disposed += (_, _) => logo.Image?.Dispose();
        Controls.Add(card); Controls.Add(header); AcceptButton = login;
        name.Text = LoginIdPreference72.Read(preferences); remember.Checked = name.Text.Length > 0;
        Shown += (_, _) => { if (remember.Checked) password.Focus(); else name.Focus(); };
        login.Click += async (_, _) =>
        {
            if (serverLogin is null && service?.IsInitialized != true) { message.Text = "최초 설정 후 로그인해 주세요."; return; }
            login.Enabled = false; message.Text = "";
            try { Actor = serverLogin is not null ? await serverLogin(name.Text.Trim(), password.Text, lifetime.Token) : await service!.LoginAsync(name.Text.Trim(), password.Text, lifetime.Token); if (IsDisposed || lifetime.IsCancellationRequested) return; LoginIdPreference72.Save(preferences, remember.Checked ? name.Text.Trim() : ""); DialogResult = DialogResult.OK; Close(); }
            catch { if (!IsDisposed) { message.Text = serverLogin is null ? "아이디 또는 비밀번호를 확인해 주세요." : "서버 로그인 실패: 계정·활성 상태·연결을 확인하세요."; password.Focus(); } }
            finally { if (!IsDisposed) { password.Clear(); login.Enabled = true; } }
        };
        FormClosing += (_, _) => lifetime.Cancel();
        Disposed += (_, _) => lifetime.Dispose();
    }
}

// The opt-in ID is stored separately; never persist passwords or fail login on preference I/O.
public static class LoginIdPreference72
{
    public static string Read(string? path)
    {
        try { if (path is null || !File.Exists(path) || new FileInfo(path).Length > 4096) return ""; var id = JsonSerializer.Deserialize<string>(File.ReadAllText(path)); return id is { Length: <= 200 } ? id : ""; } catch { return ""; }
    }
    public static void Save(string? path, string id)
    {
        if (path is null || id.Length > 200) return;
        var temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try { Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!); File.WriteAllText(temporary, JsonSerializer.Serialize(id)); File.Move(temporary, path, true); }
        catch { }
        finally { try { if (File.Exists(temporary)) File.Delete(temporary); } catch { } }
    }
}

sealed class LocalSetupDialog : Form
{
    public string AccountName { get; private set; } = "";
    public LocalSetupDialog(IIdentityService identities)
    {
        Text = "최초 작업공간 설정"; ClientSize = new(400, 280); StartPosition = FormStartPosition.CenterParent; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new(20), FlowDirection = FlowDirection.TopDown, WrapContents = false };
        var id = new TextBox { Width = 340, PlaceholderText = "아이디" }; var password = new TextBox { Width = 340, PlaceholderText = "비밀번호 (10자 이상)", UseSystemPasswordChar = true };
        var confirm = new CheckBox { Text = "새 로컬 작업공간을 만듭니다", AutoSize = true }; var notice = new Label { AutoSize = true }; var create = new Button { Text = "만들기", AutoSize = true };
        panel.Controls.AddRange([new Label { Text = "이 PC에서 사용할 첫 계정을 설정합니다.", AutoSize = true }, id, password, confirm, create, notice]); Controls.Add(panel); AcceptButton = create;
        create.Click += async (_, _) => { create.Enabled = false; try { await identities.BootstrapAsync(id.Text.Trim(), password.Text, confirm.Checked); AccountName = id.Text.Trim(); DialogResult = DialogResult.OK; Close(); } catch { notice.Text = "아이디·비밀번호·설정 확인을 점검하세요."; } finally { password.Clear(); create.Enabled = true; } };
    }
}
