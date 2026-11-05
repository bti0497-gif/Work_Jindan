using Jindan.Desktop.Contracts;
namespace Jindan.Desktop;

public sealed class DocumentForm : Form
{
    public IDesktopModule Module { get; }
    public IWorkspaceDocument Document { get; }
    private bool closeConfirmed, closePending;
    public DocumentForm(IDesktopModule module, IWorkspaceDocument document) { Module = module; Document = document; Text = document.Title; Controls.Add(document.View); document.View.Dock = DockStyle.Fill; document.TitleChanged += TitleUpdated; MinimumSize = new Size(280, 180); }
    private void TitleUpdated(object? sender, EventArgs e) => Text = Document.Title;
    public async Task<bool> ConfirmCloseAsync()
    {
        if (closeConfirmed) return true;
        if (!Document.IsDirty) { closeConfirmed = true; return true; }
        var answer = MessageBox.Show(this, "변경 내용을 저장하고 닫을까요?", "미저장 문서", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (answer == DialogResult.Cancel) return false;
        if (answer == DialogResult.Yes) { try { await Document.SaveAsync(); if (Document.IsDirty) throw new InvalidOperationException("The document still has unsaved changes."); } catch { MessageBox.Show(this, "저장하지 못했습니다. 문서를 유지합니다.", "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Error); return false; } }
        closeConfirmed = true; return true;
    }
    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if (!closeConfirmed)
        {
            e.Cancel = true; base.OnFormClosing(e);
            // The owner serially confirms MDI children. Avoid duplicate prompts from WinForms propagation.
            if (e.CloseReason == CloseReason.MdiFormClosing || closePending) return;
            closePending = true; try { if (await ConfirmCloseAsync()) Close(); } finally { closePending = false; }
            return;
        }
        base.OnFormClosing(e);
    }
    protected override void Dispose(bool disposing) { if (disposing && !IsDisposed) { Document.TitleChanged -= TitleUpdated; Document.Dispose(); } base.Dispose(disposing); }
}
