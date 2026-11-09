using Jindan.Contracts;
namespace Jindan.Desktop;

public sealed partial class WorkbenchForm
{
    private DocumentForm? studio;
    private bool studioActive;
    private readonly Panel studioSurface = new() { Dock = DockStyle.Fill, Visible = false, Name = "StudioWorkspace" };
    private DocumentForm? CurrentDocument => studioActive ? studio : ActiveMdiChild as DocumentForm;
    public bool StudioActive => studioActive;

    private void InitializeStudioWorkspace()
    {
        Controls.Add(studioSurface); studioSurface.BringToFront();
    }
    private DocumentForm OpenStudio()
    {
        if (studio is null || studio.IsDisposed)
        {
            var module = modules.Entries.Single(e => e.Module.ModuleId == "report-studio").Module;
            var context = new DocumentContext(Guid.NewGuid().ToString("N"), module.ModuleId, SelectedProjectId, services.Actor.Id);
            var document = module.CreateDocument(context);
            // Hosted directly in the dedicated surface: no MDI parent or floating dialog.
            studio = new DocumentForm(module, document) { TopLevel = false, Font = Font, FormBorderStyle = FormBorderStyle.None, Dock = DockStyle.Fill };
            studioSurface.Controls.Add(studio);
            var ownedStudio = studio;
            studio.FormClosed += (_, _) => { services.Reports.Invalidate(context.ContextId); if (!closeRequestPending && !closing) ReturnToWork(); ReleaseSidebar73(ownedStudio); studio = null; };
            if (services is WorkspaceServices owned) owned.RecordModuleOpen(module.ModuleId);
        }
        if (!studioActive)
        {
            previous?.Module.Deactivate(previous.Document); UnbindPanels();
            studioActive = true;
            if (ActiveMdiChild is not null) ActiveMdiChild.WindowState = FormWindowState.Normal;
            foreach (var client in Controls.OfType<MdiClient>()) client.Visible = false;
            menu.Visible = false;
            studioSurface.Visible = true;
            studioSurface.BringToFront(); studio.Show(); previous = studio;
            studio.Module.Activate(studio.Document); BindPanels(studio);
            selectedProjectId = studio.Document.Context.ProjectId;
            Text = "보고서 스튜디오 · 기술진단팀";
        }
        return studio;
    }
    public void ReturnToWork()
    {
        if (!studioActive) return;
        studio?.Module.Deactivate(studio.Document); UnbindPanels(); previous = null;
        studioActive = false; studioSurface.Visible = false;
        menu.Visible = true;
        foreach (var client in Controls.OfType<MdiClient>()) client.Visible = true;
        FitBusinessWorkspace74();
        Text = "기술진단팀 · 모듈형 작업대";
        ActiveChanged(this, EventArgs.Empty);
        if (ActiveMdiChild is null && !closeRequestPending && !closing) OpenDocument("projects");
    }
}
