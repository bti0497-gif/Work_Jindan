using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Jindan.Startup;
using Jindan.Fluent.Shared;
using Jindan.Contracts.ProjectFiles;
using System.IO;
using Microsoft.Win32;

namespace Jindan.Fluent.Projects;

public sealed class ProjectsModule : IStartupUiModule
{
    public string Id => "projects";
    public Window CreateWindow(IStartupServer server, StartupUiContext context) => new ProjectWindow(server, context);
}

public partial class ProjectWindow : StartupDialog
{
    public ProjectSelectionModel Model { get; }
    readonly IStartupServer server;
    readonly IProjectFileServer? fileServer;
    readonly ProjectFileCatalog catalog;
    (string Id, ProjectFile77 File, string Path)? pendingFile;
    bool fileBusy;
    protected override bool CanReturnToWorkspace => Context.CanCancelProjectSelection;
    public ProjectWindow(IStartupServer server, StartupUiContext context) : base(context)
    {
        this.server = server; fileServer = server as IProjectFileServer;
        catalog = new(ProjectFileCatalog.Location(context.PreferencesPath, fileServer?.CurrentServerId ?? "", server.Member?.Id ?? ""));
        Model = new(server, WithFileLocation); InitializeComponent(); DataContext = Model;
        StartDate.SelectedDate = EndDate.SelectedDate = DateTime.Today;
        if (context.CanCancelProjectSelection)
        {
            ExitButton.Content = "취소";
        }
        ContentRendered += async (_, _) =>
        {
            await Model.RefreshAsync(Lifetime);
            if (!IsClosed && context.CanCancelProjectSelection)
                Model.Selected = Model.Projects.FirstOrDefault(p => p.Id == context.SelectedProject?.Id);
        };
    }
    ProjectChoice WithFileLocation(ProjectChoice project)
    {
        try { return project with { LocalFilePath = catalog.FilePathFor(project.Id) }; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        { FileNotice.Text = "저장된 파일 경로를 읽을 수 없습니다. 파일 열기로 위치를 확인해 주세요."; return project; }
    }
    async void Refresh(object sender, RoutedEventArgs e) => await Model.RefreshAsync(Lifetime);
    async void Create(object sender, RoutedEventArgs e)
    {
        if (StartDate.SelectedDate is not { } start || EndDate.SelectedDate is not { } end) { StartDate.Focus(); return; }
        await Model.CreateAsync(new(ProjectName.Text, DateOnly.FromDateTime(start), DateOnly.FromDateTime(end), Description.Text), Lifetime);
    }
    async void Open(object sender, RoutedEventArgs e)
    {
        if (fileBusy || !Model.CanOpen) return;
        fileBusy = true; MainBody.IsEnabled = false;
        try
        {
            var project = await Model.OpenAsync(Lifetime);
            if (project is null || IsClosed) return;
            var manifest = fileServer is null ? null : await fileServer.ExportProjectFileAsync(project.Id, Lifetime);
            if (IsClosed) return;
            Context.SelectedProject = project; Context.ProjectFile = manifest; Context.Trace("project.selected", "success"); Finish();
        }
        catch (Exception error) { if (!IsClosed) FileNotice.Text = FileError(error); }
        finally { fileBusy = false; if (!IsClosed) MainBody.IsEnabled = true; }
    }
    void OpenByDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (ItemsControl.ContainerFromElement(ProjectList, e.OriginalSource as DependencyObject) is DataGridRow) Open(sender, e);
    }
    void Exit(object sender, RoutedEventArgs e) => Close();
    void LoginAgain(object sender, RoutedEventArgs e) { Context.LoginRequired = true; Finish(); }
    async void OpenProjectFile(object sender, RoutedEventArgs e)
    {
        if (fileBusy || !Model.CanAct || fileServer is null) return;
        var ct = Lifetime;
        fileBusy = true; MainBody.IsEnabled = false; FileNotice.Text = "";
        try
        {
            if (pendingFile is null)
            {
                var dialog = new OpenFileDialog { Title = "프로젝트 파일 열기", Filter = "더죤 프로젝트 (*.tzprj)|*.tzprj", CheckFileExists = true, Multiselect = false };
                if (dialog.ShowDialog(this) != true) return;
                var file = await ProjectFileCodec.ReadAsync(dialog.FileName, ct); if (IsClosed) return;
                var accessible = await server.ListProjectsAsync(ct); if (IsClosed) return;
                var existing = catalog.FindExisting(file, fileServer.CurrentServerId, accessible);
                if (existing is not null)
                {
                    // Resolve current server settings, not stale settings from an old local copy.
                    var current = await fileServer.ExportProjectFileAsync(existing.Id, ct); if (IsClosed) return;
                    catalog.Remember(existing.Id, dialog.FileName, file);
                    Context.SelectedProject = WithFileLocation(existing); Context.ProjectFile = current;
                    Context.Trace("project.selected", "success"); Finish(); return;
                }
                if (new ProjectFileReview(file, fileServer.CurrentServerId) { Owner = this }.ShowDialog() != true) return;
                pendingFile = (Guid.NewGuid().ToString("N"), file, dialog.FileName);
            }
            FileNotice.Text = "프로젝트 연결 정보를 서버에 등록하는 중입니다…";
            var opened = await fileServer.ImportProjectFileAsync(pendingFile.Value.Id, pendingFile.Value.File, ct);
            if (IsClosed) return;
            catalog.Remember(opened.Id, pendingFile.Value.Path, pendingFile.Value.File);
            Context.SelectedProject = WithFileLocation(opened);
            Context.ProjectFile = pendingFile.Value.File with { Project = pendingFile.Value.File.Project with { Id = opened.Id } };
            pendingFile = null; Context.Trace("project.selected", "success"); Finish();
        }
        catch (Exception error)
        {
            if (!IsClosed)
            {
                FileNotice.Text = FileError(error);
                if (pendingFile is not null) { FileOpenButton.Content = "파일 등록 재시도"; FileNotice.Text += " 재시도해도 같은 요청을 확인하므로 중복 등록하지 않습니다."; }
            }
        }
        finally { fileBusy = false; if (!IsClosed) MainBody.IsEnabled = true; }
    }
    async void SaveProjectFile(object sender, RoutedEventArgs e)
    {
        if (fileBusy || !Model.CanOpen || Model.Selected is not { } selected || fileServer is null) return;
        var filename = new string(selected.Name.Take(80).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).ToArray());
        var dialog = new SaveFileDialog { Title = "프로젝트 저장", Filter = "더죤 프로젝트 (*.tzprj)|*.tzprj", DefaultExt = ".tzprj", AddExtension = true, FileName = selected.LocalFilePath.Length > 0 ? selected.LocalFilePath : filename + ".tzprj", OverwritePrompt = true };
        if (dialog.ShowDialog(this) != true) return;
        var ct = Lifetime; fileBusy = true; MainBody.IsEnabled = false; FileNotice.Text = "프로젝트 연결 정보를 저장하는 중입니다…";
        try
        {
            var document = await fileServer.ExportProjectFileAsync(selected.Id, ct);
            await ProjectFileCodec.SaveAsync(dialog.FileName, document, ct);
            try { catalog.Remember(selected.Id, dialog.FileName, document); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
            { if (!IsClosed) FileNotice.Text = "파일은 저장했지만 목록에 파일 경로를 기록하지 못했습니다."; return; }
            if (!IsClosed) { Model.RefreshFileLocations(); FileNotice.Text = "프로젝트 파일을 저장하고 목록에 경로를 반영했습니다."; }
        }
        catch (Exception error) { if (!IsClosed) FileNotice.Text = FileError(error); }
        finally { fileBusy = false; if (!IsClosed) MainBody.IsEnabled = true; }
    }
    static string FileError(Exception error) => error is InvalidDataException or System.Text.Json.JsonException
        ? "지원하는 .tzprj 프로젝트 파일인지 확인해 주세요."
        : error is IOException or UnauthorizedAccessException ? "프로젝트 파일을 읽거나 저장할 수 없습니다. 파일 위치와 권한을 확인해 주세요."
        : StartupMessages.For(error);
}
