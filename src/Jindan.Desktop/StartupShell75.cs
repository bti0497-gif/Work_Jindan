using System.Text.Json;
using Jindan.Infrastructure.Cloud;
namespace Jindan.Desktop;

public static class ApplicationBrand75
{
    public static Image LoadImage() { using var stream = typeof(ApplicationBrand75).Assembly.GetManifestResourceStream("Jindan.Desktop.Assets.brand.png")!; using var image = Image.FromStream(stream); return new Bitmap(image); }
    public static Icon LoadIcon() { using var stream = typeof(ApplicationBrand75).Assembly.GetManifestResourceStream("Jindan.Desktop.Assets.brand.ico")!; return new Icon(stream); }
    public static ServerSettings75 ServerSettings() { using var stream = typeof(ApplicationBrand75).Assembly.GetManifestResourceStream("Jindan.Desktop.Assets.server-public.json")!; return JsonSerializer.Deserialize<ServerSettings75>(stream) ?? throw new InvalidDataException(); }
}

public sealed class StartupShell75 : Form
{
    public StartupShell75()
    {
        Name = "StartupShell"; Text = "더죤환경기술(주) · 기술진단팀"; Icon = ApplicationBrand75.LoadIcon();
        WindowState = FormWindowState.Maximized; FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false; MinimizeBox = true;
        BackColor = Color.White; Font = new Font("맑은 고딕", 10);
        var menu = new MenuStrip { Name = "StartupMenu", Enabled = false, BackColor = Color.White, Padding = new(8, 5, 8, 5) };
        foreach (var text in new[] { "프로젝트", "파일관리", "할일관리", "보고서 스튜디오", "전체게시판", "회원관리", "설정" }) menu.Items.Add(text);
        MainMenuStrip = menu; Controls.Add(menu);
    }
}
