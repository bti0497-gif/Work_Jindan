using Jindan.Contracts;
using Jindan.Desktop.Contracts;

namespace Jindan.Modules.Board;

public sealed partial class BoardDocument
{
    void RenderThread(IEnumerable<WorkRecord> records)
    {
        thread.Clear(); thread.DetectUrls = false;
        foreach (var record in records)
        {
            if (thread.TextLength > 0) thread.AppendText("\n\n────────\n");
            thread.SelectionStart = thread.TextLength; thread.SelectionLength = 0;
            thread.SelectionFont = thread.Font;
            thread.AppendText(record.Fields.GetValueOrDefault("title", "") + "\n");
            var text = record.Fields.GetValueOrDefault("content", "");
            var rtf = record.Fields.GetValueOrDefault("contentRtf", "");
            RichTextEditor70.AppendValidated(thread, text, rtf);
        }
    }
}
