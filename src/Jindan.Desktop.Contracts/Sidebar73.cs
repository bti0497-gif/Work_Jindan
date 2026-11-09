namespace Jindan.Desktop.Contracts;

public sealed record NavigationGroup73(string Id, string Label, string DefaultModule, int Order, bool AdminOnly = false);
public sealed record NavigationRoute73(string ModuleId, string Label);
public sealed record ProjectChoice73(string? Id, string Title) { public override string ToString() => Title; }
public interface IModuleNavigation73
{
    NavigationGroup73? NavigationGroup { get; }
    IReadOnlyList<NavigationRoute73> SidebarRoutes { get; }
}

// Reusable DLL control. Feature DLLs supply routes and their own panel body;
// the shell only coordinates navigation and authenticated project context.
public sealed class WorkspaceSidebar73 : UserControl
{
    readonly ComboBox projects = new() { Name = "SidebarProject", DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill, DropDownWidth = 340 };
    readonly List<Button> routes = [];
    readonly TableLayoutPanel heading = new() { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Padding = new(8), Name = "SidebarNavigation" };
    bool binding;
    public event Action<string>? NavigateRequested;
    public event Action<string?>? ProjectRequested;
    public event Action? BackRequested;
    public string? SelectedProjectId => (projects.SelectedItem as ProjectChoice73)?.Id;
    public WorkspaceSidebar73(Control body, IReadOnlyList<NavigationRoute73> entries, string currentModule, bool studio)
    {
        Name = "ModuleSidebar"; Dock = DockStyle.Fill; AutoScroll = true; BackColor = Color.FromArgb(242, 246, 252);
        if (studio)
        {
            var back = new Button { Name = "BackToWork", Text = "← 업무 화면으로", Dock = DockStyle.Top, AutoSize = true, Margin = new(0, 0, 0, 10) };
            back.Click += (_, _) => BackRequested?.Invoke(); heading.Controls.Add(back);
        }
        foreach (var entry in entries)
        {
            var button = new Button { Name = "Navigate_" + entry.ModuleId, Text = entry.Label, Tag = entry.ModuleId, Dock = DockStyle.Top, AutoSize = true, MinimumSize = new(0, 34), FlatStyle = FlatStyle.Flat, BackColor = entry.ModuleId == currentModule ? Color.FromArgb(225, 235, 250) : SystemColors.Control, Margin = new(0, 2, 0, 2) };
            button.FlatAppearance.BorderSize = 0; button.Click += (_, _) => NavigateRequested?.Invoke(entry.ModuleId); routes.Add(button); heading.Controls.Add(button);
        }
        heading.Controls.Add(new Label { Text = "현재 프로젝트", AutoSize = true, Margin = new(0, 12, 0, 5) });
        heading.Controls.Add(projects);
        projects.SelectedIndexChanged += (_, _) => { if (!binding) ProjectRequested?.Invoke(SelectedProjectId); };
        body.Dock = DockStyle.Fill; Controls.Add(body); Controls.Add(heading);
    }
    public void SetProjects(IReadOnlyList<ProjectChoice73> items, string? selected)
    {
        binding = true;
        try { projects.BeginUpdate(); projects.Items.Clear(); foreach (var item in items) projects.Items.Add(item); projects.SelectedIndex = items.ToList().FindIndex(p => p.Id == selected); }
        finally { projects.EndUpdate(); binding = false; }
    }
}
