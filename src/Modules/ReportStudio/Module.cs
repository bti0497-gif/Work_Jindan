using Jindan.Contracts;
using Jindan.Desktop.Contracts;

namespace Jindan.Modules.ReportStudio;

public sealed class Module : IDesktopModule, IModuleNavigation73
{
    private IWorkspaceServices _services = null!;
    public NavigationGroup73 NavigationGroup => new("report-studio", "보고서 스튜디오", "report-studio", 40);
    public IReadOnlyList<NavigationRoute73> SidebarRoutes => [];
    public string ModuleId => "report-studio";
    public string DisplayName => "보고서 스튜디오";
    public string Version => "1.0.0";
    public IReadOnlyList<RecordSchema> Schemas => [];
    public void Initialize(IWorkspaceServices services) => _services = services;
    public IWorkspaceDocument CreateDocument(DocumentContext context) => new ReportDocument(_services, context);
    public Control CreateLeftPanel(IWorkspaceDocument document) => ((ReportDocument)document).NavigationPanel;
    public Control CreateRightPanel(IWorkspaceDocument document) => ((ReportDocument)document).PropertiesPanel;
    public void Activate(IWorkspaceDocument document) { }
    public void Deactivate(IWorkspaceDocument document) { }
    public void Dispose() { }
}
