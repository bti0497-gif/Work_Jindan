namespace Jindan.Desktop;

public sealed partial class WorkbenchForm
{
    bool fittingBusiness74;
    private void FitBusinessWorkspace74()
    {
        if (IsDisposed || fittingBusiness74 || studioActive || arrangement != "tabs") return;
        var viewport = Controls.OfType<MdiClient>().FirstOrDefault();
        if (viewport is null || viewport.ClientSize.Width < 1 || viewport.ClientSize.Height < 1) return;
        fittingBusiness74 = true;
        try
        {
            foreach (var document in MdiChildren.OfType<DocumentForm>())
            {
                // Native MDI maximization offsets borderless children by the hidden
                // caption/border sizes. Fill the viewport without entering that state.
                document.WindowState = FormWindowState.Normal;
                document.Bounds = viewport.ClientRectangle;
            }
        }
        finally { fittingBusiness74 = false; }
    }
}
