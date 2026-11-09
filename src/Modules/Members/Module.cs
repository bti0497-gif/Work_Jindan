using Jindan.Contracts;
using Jindan.Desktop.Contracts;
namespace Jindan.Modules.Members;

public sealed class Module : IDesktopModule, IModuleNavigation73
{
    private IWorkspaceServices services = null!;
    public NavigationGroup73 NavigationGroup => new("members", "회원관리", "members", 60, true);
    public IReadOnlyList<NavigationRoute73> SidebarRoutes => [new("members", "회원 목록")];
    public string ModuleId => "members"; public string DisplayName => "회원·권한 관리"; public string Version => "1.0.0";
    public IReadOnlyList<RecordSchema> Schemas => [];
    public void Initialize(IWorkspaceServices value) => services = value;
    public IWorkspaceDocument CreateDocument(DocumentContext context) => new MemberDocument(services, context);
    public Control CreateLeftPanel(IWorkspaceDocument document) => ((MemberDocument)document).Navigation;
    public Control CreateRightPanel(IWorkspaceDocument document) => ((MemberDocument)document).Inspector;
    public void Activate(IWorkspaceDocument document) { }
    public void Deactivate(IWorkspaceDocument document) { }
    public void Dispose() { }
}
public sealed class MemberDocument : UserControl, IWorkspaceDocument
{
    private readonly IWorkspaceServices services; private string? selectedId; private bool dirty, loading;
    private readonly DataGridView grid = new() { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, MultiSelect = false };
    private readonly TextBox name = new(), position = new(), password = new() { UseSystemPasswordChar = true }, projects = new(); private readonly ComboBox role = new() { DropDownStyle = ComboBoxStyle.DropDownList }; private readonly CheckBox disabled = new() { Text = "비활성 계정" }; private readonly Label notice = new() { Dock = DockStyle.Bottom, Height = 42 };
    public Control Navigation { get; } = new Label() { Dock = DockStyle.Fill, Text = "독립 로컬 계정\n관리자만 회원·역할·프로젝트 접근권을 수정할 수 있습니다.\n기존 클라우드 계정은 변경하지 않습니다.", Padding = new Padding(12) };
    public Control Inspector { get; } = new Panel() { Dock = DockStyle.Fill }; public string Title => "회원·권한" + (dirty ? " *" : ""); public DocumentContext Context { get; private set; }
    public Control View => this; public bool IsDirty => dirty; public event EventHandler? TitleChanged; public event EventHandler? SelectionChanged;
    public MemberDocument(IWorkspaceServices value, DocumentContext context)
    {
        services = value; Context = context; Dock = DockStyle.Fill; role.Items.AddRange(["admin", "editor", "viewer"]); var toolbar = new ToolStrip() { Dock = DockStyle.Top }; var add = new ToolStripButton("새 회원"); add.Click += (_, _) => { if (dirty) return; selectedId = null; loading = true; name.Clear(); position.Clear(); password.Clear(); projects.Clear(); role.SelectedIndex = 1; disabled.Checked = false; loading = false; }; var save = new ToolStripButton("회원 저장"); save.Click += async (_, _) => { try { await SaveAsync(); } catch (Exception e) { notice.Text = e.Message; } }; toolbar.Items.AddRange([add, save]); Controls.Add(grid); Controls.Add(notice); Controls.Add(toolbar); grid.Columns.Add("name", "이름"); grid.Columns.Add("role", "역할"); grid.Columns.Add("position", "직책"); grid.Columns.Add("projects", "프로젝트 접근권"); grid.Columns.Add("disabled", "비활성");
        var panel = new FlowLayoutPanel() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(10) }; foreach (var (label, control) in new (string, Control)[] { ("이름", name), ("직책", position), ("새 암호 (10자 이상)", password), ("역할", role), ("프로젝트 ID (쉼표로 구분)", projects), ("", disabled) }) { panel.Controls.Add(new Label() { Text = label, AutoSize = true }); control.Width = 230; panel.Controls.Add(control); control.TextChanged += Changed; }
        disabled.CheckedChanged += Changed; role.SelectedIndexChanged += Changed; Inspector.Controls.Add(panel);
        grid.SelectionChanged += (_, _) => { if (dirty || grid.CurrentRow?.Tag is not UserInfo u) return; loading = true; selectedId = u.Id; name.Text = u.DisplayName; position.Text = u.Position; password.Clear(); projects.Text = string.Join(',', u.ProjectIds); role.SelectedItem = u.Role; disabled.Checked = u.Disabled; loading = false; SelectionChanged?.Invoke(this, EventArgs.Empty); }; Load += async (_, _) => { try { await RefreshAsync(); } catch (Exception e) { notice.Text = e.Message; } };
    }
    private void Changed(object? sender, EventArgs e) { if (!loading) { dirty = true; TitleChanged?.Invoke(this, EventArgs.Empty); } }
    public async Task RefreshAsync() { var rows = await services.Identities.ListAsync(services.Actor); loading = true; try { grid.Rows.Clear(); foreach (var row in rows) { var i = grid.Rows.Add(row.DisplayName, row.Role, row.Position, string.Join(',', row.ProjectIds), row.Disabled); grid.Rows[i].Tag = row; } } finally { loading = false; } }
    public async Task SaveAsync(CancellationToken ct = default) { var user = await services.Identities.SaveUserProfileAsync(services.Actor, selectedId, name.Text, position.Text, role.Text, projects.Text.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries), disabled.Checked, string.IsNullOrWhiteSpace(password.Text) ? null : password.Text, ct); selectedId = user.Id; password.Clear(); dirty = false; TitleChanged?.Invoke(this, EventArgs.Empty); await RefreshAsync(); notice.Text = "로컬 계정 저장됨"; }
    public void SetContext(DocumentContext context) { if (context.ContextId != Context.ContextId) throw new InvalidOperationException("문서 문맥 불일치"); Context = context; }
    protected override void Dispose(bool disposing) { if (disposing) { Navigation.Dispose(); Inspector.Dispose(); } base.Dispose(disposing); }
}
