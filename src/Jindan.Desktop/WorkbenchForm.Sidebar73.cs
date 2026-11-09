using Jindan.Desktop.Contracts;
namespace Jindan.Desktop;

public sealed partial class WorkbenchForm
{
    private WorkspaceSidebar73 Sidebar73(DocumentForm document)
    {
        if (!sidebars.TryGetValue(document, out var sidebar))
        {
            var routes = ((document.Module as IModuleNavigation73)?.SidebarRoutes ?? [])
                .Where(r => modules.Entries.Any(e => e.Module.ModuleId == r.ModuleId)).ToArray();
            sidebar = new WorkspaceSidebar73(document.Module.CreateLeftPanel(document.Document), routes, document.Module.ModuleId, document == studio);
            sidebar.NavigateRequested += id => { if (!document.IsDisposed && CurrentDocument == document) NavigateToModule73(id); };
            sidebar.ProjectRequested += id => { if (!document.IsDisposed && CurrentDocument == document) ChangeProject73(id); };
            sidebar.BackRequested += ReturnToWork;
            sidebars.Add(document, sidebar);
        }
        sidebar.SetProjects(projectChoices, document.Document.Context.ProjectId);
        return sidebar;
    }
    private void ReleaseSidebar73(DocumentForm document)
    {
        if (!sidebars.Remove(document, out var sidebar)) return;
        sidebar.Visible = false; sidebar.Parent?.Controls.Remove(sidebar); sidebar.Dispose();
    }
}
