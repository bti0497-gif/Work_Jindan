namespace Jindan.Desktop.Contracts;

// Shared presentation only. Each feature DLL retains its commands and data.
public static class WorkspaceUi74
{
    public static readonly Color Accent = Color.FromArgb(55, 105, 210);
    public static void Grid(DataGridView grid)
    {
        grid.BackgroundColor = Color.White;
        grid.BorderStyle = BorderStyle.None;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(238, 242, 249);
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.FromArgb(35, 48, 68);
        grid.ColumnHeadersDefaultCellStyle.WrapMode = DataGridViewTriState.False;
        grid.ColumnHeadersDefaultCellStyle.Padding = new Padding(8, 7, 8, 7);
        grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        grid.DefaultCellStyle.Padding = new Padding(8, 4, 8, 4);
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(225, 235, 252);
        grid.DefaultCellStyle.SelectionForeColor = Color.FromArgb(25, 45, 80);
        grid.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(249, 251, 254);
        grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCellsExceptHeaders;
        grid.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        grid.GridColor = Color.FromArgb(230, 235, 243);
        grid.RowHeadersVisible = false;
        void FitColumn(DataGridViewColumn column)
        {
            var textWidth = TextRenderer.MeasureText(column.HeaderText, grid.Font).Width;
            column.MinimumWidth = Math.Max(100, textWidth + 42);
            column.FillWeight = column.Name == "title" ? 220 : 100;
        }
        grid.ColumnAdded += (_, e) => FitColumn(e.Column);
        grid.FontChanged += (_, _) => { foreach (DataGridViewColumn column in grid.Columns) FitColumn(column); };
        foreach (DataGridViewColumn column in grid.Columns) FitColumn(column);
    }

    public static void Commands(ToolStrip bar)
    {
        bar.GripStyle = ToolStripGripStyle.Hidden;
        bar.BackColor = Color.White;
        bar.Padding = new Padding(6, 5, 6, 5);
        bar.CanOverflow = true;
        bar.RenderMode = ToolStripRenderMode.System;
        bar.ItemAdded += (_, e) => { if (e.Item is not null) e.Item.Padding = new Padding(5, 3, 5, 3); };
    }
}
