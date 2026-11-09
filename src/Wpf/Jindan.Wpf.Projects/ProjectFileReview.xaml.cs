using System.Windows;
using Jindan.Contracts.ProjectFiles;
namespace Jindan.Fluent.Projects;
public partial class ProjectFileReview : Wpf.Ui.Controls.FluentWindow
{
    public ProjectFileReview(ProjectFile77 file, string currentServer)
    {
        InitializeComponent(); ProjectName.Text = file.Project.Name;
        Details.Text = $"작성자: {file.Project.CreatedBy}\n작성일: {file.Project.CreatedAt}\n공정 연결: {(file.Server.ProjectId == currentServer ? "현재 서버" : "다른 서버 · 해당 서버 권한 필요")}\n드라이브: {(file.Drive.RootFolderId.Length > 0 ? "폴더 연결 있음" : "폴더 연결 없음")} · 파일 연결 {file.Drive.Files.Length}개\n보고서: {file.Reports.Documents.Length}개 연결";
    }
    void Confirm(object sender, RoutedEventArgs e) => DialogResult = true;
}
