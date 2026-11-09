using Jindan.Core;

namespace Jindan.Desktop.Contracts;

// Bounded native text editor. Arbitrary clipboard RTF is checked before persistence;
// unsafe input is never restored from a stored record into the native control.
public sealed class RichTextEditor70 : UserControl
{
    public RichTextBox Editor { get; } = new PlainPasteRichTextBox70() { Dock = DockStyle.Fill, DetectUrls = false, HideSelection = false, AcceptsTab = true, MaxLength = 100000, Name = "NativeRichText", EnableAutoDragDrop = false, AllowDrop = false };
    readonly FlowLayoutPanel toolbar = new() { Dock = DockStyle.Top, AutoSize = true, WrapContents = true, Padding = new Padding(0, 2, 0, 2) };
    bool filling;
    string lastEmittedRtf = "";
    public bool IsEdited { get; private set; }
    public event EventHandler? FormattingChanged;
    public RichTextEditor70()
    {
        Height = 290; MinimumSize = new Size(150, 230); Dock = DockStyle.Top;
        Controls.Add(Editor); Controls.Add(toolbar);
        var extra = new ContextMenuStrip();
        var format = new Button { Text = "서식", ContextMenuStrip = extra, AutoSize = true, Margin = new Padding(1), TabStop = false }; format.Click += (_, _) => extra.Show(format, new Point(0, format.Height));
        Disposed += (_, _) => extra.Dispose();
        void Action(string caption, Action action) { if (caption is not ("굵게" or "기울임" or "밑줄")) { extra.Items.Add(caption, null, (_, _) => { action(); NotifyChanged(); Editor.Focus(); }); return; } var b = new Button() { Text = caption, AutoSize = true, MinimumSize = new Size(28, 27), Margin = new Padding(1), TabStop = false }; b.Click += (_, _) => { action(); NotifyChanged(); Editor.Focus(); }; toolbar.Controls.Add(b); }
        Action("굵게", () => Toggle(FontStyle.Bold)); Action("기울임", () => Toggle(FontStyle.Italic)); Action("밑줄", () => Toggle(FontStyle.Underline)); Action("취소선", () => Toggle(FontStyle.Strikeout));
        var size = new ComboBox() { Width = 55, DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(1), Name = "RichFontSize" }; size.Items.AddRange(new object[] { 10, 11, 12, 14, 16, 18, 24, 32 }); size.SelectedItem = 11; size.SelectedIndexChanged += (_, _) => { if (filling || size.SelectedItem is not int points) return; var font = Editor.SelectionFont ?? Editor.Font; Editor.SelectionFont = new Font(font.FontFamily, points, font.Style); NotifyChanged(); Editor.Focus(); }; toolbar.Controls.Add(size);
        Action("서체", () => { using var dialog = new FontDialog() { Font = Editor.SelectionFont ?? Editor.Font, MinSize = 8, MaxSize = 72, ShowEffects = false }; if (dialog.ShowDialog(this) == DialogResult.OK) Editor.SelectionFont = dialog.Font; });
        Action("글자색", () => { using var dialog = new ColorDialog() { Color = Editor.SelectionColor }; if (dialog.ShowDialog(this) == DialogResult.OK) Editor.SelectionColor = dialog.Color; });
        Action("배경색", () => { using var dialog = new ColorDialog() { Color = Editor.SelectionBackColor }; if (dialog.ShowDialog(this) == DialogResult.OK) Editor.SelectionBackColor = dialog.Color; });
        Action("왼쪽", () => Editor.SelectionAlignment = HorizontalAlignment.Left); Action("가운데", () => Editor.SelectionAlignment = HorizontalAlignment.Center); Action("오른쪽", () => Editor.SelectionAlignment = HorizontalAlignment.Right);
        Action("목록", () => Editor.SelectionBullet = !Editor.SelectionBullet); Action("인용 들여쓰기", () => Editor.SelectionIndent = Editor.SelectionIndent == 0 ? 24 : 0);
        Action("가로 구분", () => Editor.SelectedText = "\n────────────\n");
        toolbar.Controls.Add(format);
        Editor.TextChanged += (_, _) => NotifyChanged();
    }
    void Toggle(FontStyle style) { var font = Editor.SelectionFont ?? Editor.Font; Editor.SelectionFont = new Font(font.FontFamily, font.Size, font.Style ^ style); }
    void NotifyChanged() { if (!filling) { var current = Editor.Rtf ?? ""; if (current == lastEmittedRtf) return; lastEmittedRtf = current; IsEdited = true; FormattingChanged?.Invoke(this, EventArgs.Empty); } }
    public void Fill(string text, string rtf)
    {
        filling = true;
        try
        {
            if (rtf.Length > 0)
            {
                try { RichTextRules70.Validate(rtf, text); Editor.Rtf = rtf; if (RichTextRules70.Normalize(Editor.Text) == RichTextRules70.Normalize(text)) return; }
                catch (Exception ex) when (ex is WorkspaceException or ArgumentException) { }
            }
            Editor.Clear(); Editor.SelectionFont = Editor.Font; Editor.SelectionColor = Editor.ForeColor; Editor.SelectionBackColor = Editor.BackColor; Editor.Text = text;
        }
        finally { filling = false; IsEdited = false; lastEmittedRtf = Editor.Rtf ?? ""; }
    }
    public (string Text, string Rtf) CaptureFormatting()
    {
        var text = Editor.Text; var rtf = Editor.Rtf ?? "";
        RichTextRules70.Validate(rtf, text);
        return (text, rtf);
    }
    public static void AppendValidated(RichTextBox target, string text, string rtf)
    {
        try
        {
            if (rtf.Length == 0) { target.AppendText(text); return; }
            RichTextRules70.Validate(rtf, text);
            target.SelectionStart = target.TextLength; target.SelectionLength = 0;
            target.SelectedRtf = rtf;
        }
        catch (Exception ex) when (ex is WorkspaceException or ArgumentException) { target.AppendText(text); }
    }
}

// Pasting text never introduces RTF/OLE fields or objects from the clipboard.
// No clipboard write is performed, and no link is opened by this control.
sealed class PlainPasteRichTextBox70 : RichTextBox
{
    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0302) { PastePlain(); return; } // WM_PASTE
        base.WndProc(ref message);
    }
    protected override void OnKeyDown(KeyEventArgs e)
    {
        if ((e.Control && e.KeyCode == Keys.V) || (e.Shift && e.KeyCode == Keys.Insert)) { e.SuppressKeyPress = true; e.Handled = true; PastePlain(); return; }
        base.OnKeyDown(e);
    }
    void PastePlain()
    {
        try
        {
            if (ReadOnly || !Clipboard.ContainsText(TextDataFormat.UnicodeText)) return;
            var text = Clipboard.GetText(TextDataFormat.UnicodeText);
            var remaining = Math.Max(0, MaxLength - (TextLength - SelectionLength));
            SelectedText = text.Length <= remaining ? text : text[..remaining];
        }
        catch (System.Runtime.InteropServices.ExternalException) { /* Busy clipboard leaves the current document unchanged. */ }
    }
}
