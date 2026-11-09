using System.Net;
using System.Text.RegularExpressions;
using Jindan.Contracts.Cloud;
using Jindan.Contracts.Drive;

namespace Jindan.Desktop.Contracts;

public class CloudWindow71 : Form
{
    protected readonly ICloudReadService Cloud;
    protected readonly CancellationTokenSource Lifetime = new();
    protected readonly Label Notice = new() { Dock = DockStyle.Bottom, Height = 60, Padding = new(10), Text = "서버 조회 전용 · 로컬 자료와 별도 · 연결은 이번 로그인 동안 유지됩니다." };
    readonly List<Control> actions = [];
    protected CloudWindow71(ICloudReadService cloud) { Cloud = cloud; Size = new(820, 630); MinimumSize = new(600, 480); StartPosition = FormStartPosition.CenterParent; Controls.Add(Notice); }
    protected Button Action(string title, FlowLayoutPanel bar, Func<Task> run)
    {
        var button = new Button { Text = title, AutoSize = true }; bar.Controls.Add(button); actions.Add(button);
        button.Click += async (_, _) => await Run(run); return button;
    }
    protected async Task Run(Func<Task> action)
    {
        foreach (var button in actions) button.Enabled = false; Notice.Text = "서버에 요청 중입니다…";
        try { await action(); if (!IsDisposed) Notice.Text = "완료 · 서버 자료를 조회했습니다. 로컬 자료와 서버 원본은 변경하지 않았습니다."; }
        catch (OperationCanceledException) { if (!IsDisposed) Notice.Text = "요청을 취소했습니다."; }
        catch (Exception error) { if (!IsDisposed) Notice.Text = error is CloudConnectionException ? "연결 설정·로그인·접근 권한을 확인하세요. 상태: " + error.Message : "요청을 완료하지 못했습니다. 연결과 입력 내용을 확인하세요."; }
        finally { if (!IsDisposed) foreach (var button in actions) button.Enabled = true; }
    }
    protected override void OnFormClosing(FormClosingEventArgs e) { Lifetime.Cancel(); base.OnFormClosing(e); }
    protected override void Dispose(bool disposing) { if (disposing) Lifetime.Cancel(); base.Dispose(disposing); }
}

public sealed class CloudConnectionsWindow71 : CloudWindow71
{
    public CloudConnectionsWindow71(ICloudReadService cloud) : base(cloud)
    {
        Text = "Drive · Firebase 연결";
        var tabs = new TabControl { Dock = DockStyle.Fill }; Controls.Add(tabs); tabs.BringToFront();
        FlowLayoutPanel Page(string title) { var page = new TabPage(title); tabs.TabPages.Add(page); var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new(18), FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true }; page.Controls.Add(layout); return layout; }
        TextBox Input(FlowLayoutPanel panel, string label, bool secret = false) { panel.Controls.Add(new Label { Text = label, AutoSize = true }); var box = new TextBox { Width = 470, UseSystemPasswordChar = secret }; panel.Controls.Add(box); return box; }
        var drive = Page("Google Drive");
        drive.Controls.Add(new Label { AutoSize = true, MaximumSize = new(480, 0), Text = "Google 데스크톱 앱 연결 설정을 입력하세요. 브라우저에서 직접 승인한 계정으로 파일을 조회합니다. 기존 앱의 토큰은 가져오지 않습니다." });
        var client = Input(drive, "데스크톱 OAuth 클라이언트 ID"); var secret = Input(drive, "클라이언트 보안 값", true); var root = Input(drive, "공유 폴더 ID (이번 연결의 시작 폴더)");
        Action("브라우저로 Drive 연결", drive, async () => { try { await Cloud.ConnectDriveAsync(client.Text.Trim(), secret.Text.Trim(), root.Text.Trim(), Lifetime.Token); } finally { secret.Clear(); } });
        var board = Page("Firebase 게시판");
        board.Controls.Add(new Label { AutoSize = true, MaximumSize = new(480, 0), Text = "기존 회사 게시판 계정으로 직접 로그인합니다. 로컬 작업대 계정과는 별도이며 비밀번호와 토큰은 파일에 저장하지 않습니다." });
        var project = Input(board, "Firebase 프로젝트 ID"); var key = Input(board, "Firebase 웹 API 키", true); var id = Input(board, "기존 게시판 아이디"); var password = Input(board, "게시판 비밀번호", true);
        Action("게시판 연결", board, async () => { try { await Cloud.ConnectBoardAsync(project.Text.Trim(), key.Text.Trim(), id.Text.Trim(), password.Text, Lifetime.Token); } finally { password.Clear(); key.Clear(); } });
        Action("두 연결 해제", board, () => { Cloud.Disconnect(); return Task.CompletedTask; });
        Notice.Text = $"Drive: {(cloud.Status.DriveConnected ? "연결됨" : "미연결")} · 게시판: {(cloud.Status.BoardConnected ? "연결됨" : "미연결")} · 앱 종료/로그아웃 또는 인증 만료 시 재연결";
    }
}

public sealed class CloudDriveWindow71 : CloudWindow71
{
    readonly ListView list = new() { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, MultiSelect = false };
    readonly Stack<string?> history = new(); string? folder;
    public CloudDriveWindow71(ICloudReadService cloud) : base(cloud)
    {
        Text = "공유 Drive · 서버 조회"; list.Columns.Add("이름", 430); list.Columns.Add("종류", 120); list.Columns.Add("크기", 100);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46, AutoScroll = true };
        Controls.Add(list); Controls.Add(bar); list.BringToFront(); bar.BringToFront();
        Action("연결 설정", bar, () => { using var view = new CloudConnectionsWindow71(Cloud); view.ShowDialog(this); history.Clear(); folder = null; list.Items.Clear(); return Task.CompletedTask; });
        Action("새로고침", bar, Reload);
        Action("상위 폴더", bar, async () => { if (history.Count > 0) { folder = history.Pop(); await Reload(); } });
        Action("폴더 열기", bar, async () => { if (Selected() is { IsFolder: true } entry) { var previous = folder; folder = entry.Id; try { await Reload(); history.Push(previous); } catch { folder = previous; throw; } } });
        Action("선택 파일 내려받기", bar, Download);
    }
    DriveEntry? Selected() => list.SelectedItems.Count == 1 ? list.SelectedItems[0].Tag as DriveEntry : null;
    async Task Reload() { var rows = await Cloud.ListDriveAsync(folder, Lifetime.Token); if (IsDisposed) return; list.Items.Clear(); foreach (var row in rows) list.Items.Add(new ListViewItem([row.Name, row.IsFolder ? "폴더" : row.MimeType, row.Size.ToString("N0")]) { Tag = row }); }
    async Task Download()
    {
        if (Selected() is not { IsFolder: false } entry) throw new CloudConnectionException("DRIVE_SELECTION_REQUIRED");
        var invalid = Path.GetInvalidFileNameChars(); var filename = new string(entry.Name.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).TrimEnd('.', ' ');
        using var dialog = new SaveFileDialog { FileName = filename.Length > 0 ? filename : "download", OverwritePrompt = true };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        var destination = Path.GetFullPath(dialog.FileName); var temporary = destination + ".partial-" + Guid.NewGuid().ToString("N");
        // Do not overwrite original app/workspace evidence even through a chosen path.
        var protectedRoots = new[] { "F:/jindan", "F:/jindan-maintenance", "F:/jindan-dotnet/artifacts/ready-for-review" };
        if (protectedRoots.Any(p => destination.StartsWith(Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))) throw new CloudConnectionException("DOWNLOAD_PROTECTED_PATH");
        for (var directory = new DirectoryInfo(Path.GetDirectoryName(destination)!); directory is not null; directory = directory.Parent) if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0) throw new CloudConnectionException("DOWNLOAD_PATH_INVALID");
        try { await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { await Cloud.DownloadDriveAsync(entry.Id, output, Lifetime.Token); await output.FlushAsync(Lifetime.Token); } Lifetime.Token.ThrowIfCancellationRequested(); File.Move(temporary, destination, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}

public sealed class CloudBoardWindow71 : CloudWindow71
{
    readonly ListView list = new() { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, MultiSelect = false };
    readonly TextBox body = new() { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both };
    readonly ComboBox menu = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 130 };
    public CloudBoardWindow71(ICloudReadService cloud) : base(cloud)
    {
        Text = "Firebase 게시판 · 서버 조회"; menu.Items.AddRange(["전체게시판", "본사공지"]); menu.SelectedIndex = 0;
        list.Columns.Add("제목", 380); list.Columns.Add("작성자", 130); list.Columns.Add("수정일", 180);
        var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, Size = new(780, 490), SplitterDistance = 230 }; split.Panel1.Controls.Add(list); split.Panel2.Controls.Add(body);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46, AutoScroll = true }; bar.Controls.Add(menu); Controls.Add(split); Controls.Add(bar); split.BringToFront(); bar.BringToFront();
        Action("연결 설정", bar, () => { using var view = new CloudConnectionsWindow71(Cloud); view.ShowDialog(this); list.Items.Clear(); body.Clear(); return Task.CompletedTask; });
        Action("게시글 조회", bar, async () => { var rows = await Cloud.ListBoardAsync(menu.Text, Lifetime.Token); if (IsDisposed) return; list.Items.Clear(); body.Clear(); foreach (var row in rows) list.Items.Add(new ListViewItem([row.Title, row.Author, row.UpdatedAt]) { Tag = row }); });
        Action("본문·댓글 보기", bar, async () => { if (list.SelectedItems.Count != 1 || list.SelectedItems[0].Tag is not CloudPost post) return; var comments = await Cloud.ListCommentsAsync(post.Id, Lifetime.Token); if (IsDisposed) return; body.Text = post.Title + "\r\n" + Plain(post.Content) + "\r\n\r\n첨부 목록 (다운로드 연결 전):\r\n" + string.Join("\r\n", post.Attachments.Select(a => a.Name)) + "\r\n\r\n댓글:\r\n" + string.Join("\r\n", comments.Select(c => c.Author + ": " + Plain(c.Content))); });
    }
    // Plain text display only: never execute stored HTML or reuse it as RTF.
    static string Plain(string value) => WebUtility.HtmlDecode(Regex.Replace(value, "<[^>]*>", " ", RegexOptions.None, TimeSpan.FromSeconds(1)));
}
