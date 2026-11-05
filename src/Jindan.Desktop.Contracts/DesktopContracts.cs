using Jindan.Contracts;
namespace Jindan.Desktop.Contracts;

public interface IWorkspaceDocument : IDisposable
{
    string Title { get; }
    DocumentContext Context { get; }
    Control View { get; }
    bool IsDirty { get; }
    event EventHandler? TitleChanged;
    event EventHandler? SelectionChanged;
    void SetContext(DocumentContext context);
    Task SaveAsync(CancellationToken ct = default);
}
public interface IDesktopModule : IDisposable
{
    string ModuleId { get; }
    string DisplayName { get; }
    string Version { get; }
    IReadOnlyList<RecordSchema> Schemas { get; }
    void Initialize(IWorkspaceServices services);
    IWorkspaceDocument CreateDocument(DocumentContext context);
    Control CreateLeftPanel(IWorkspaceDocument document);
    Control CreateRightPanel(IWorkspaceDocument document);
    void Activate(IWorkspaceDocument document);
    void Deactivate(IWorkspaceDocument document);
}
public abstract class RecordModule : IDesktopModule
{
    protected IWorkspaceServices Services { get; private set; } = null!;
    public abstract string ModuleId { get; }
    public abstract string DisplayName { get; }
    public virtual string Version => "1.0.0";
    public abstract RecordSchema Schema { get; }
    public IReadOnlyList<RecordSchema> Schemas => [Schema];
    public virtual void Initialize(IWorkspaceServices services) { Services = services; services.Data.RegisterSchema(Schema); }
    public virtual IWorkspaceDocument CreateDocument(DocumentContext context) => new RecordDocument(Services, Schema, context);
    public virtual Control CreateLeftPanel(IWorkspaceDocument document) => ((RecordDocument)document).NavigationPanel;
    public virtual Control CreateRightPanel(IWorkspaceDocument document) => ((RecordDocument)document).PropertiesPanel;
    public virtual void Activate(IWorkspaceDocument document) { }
    public virtual void Deactivate(IWorkspaceDocument document) { }
    public virtual void Dispose() { }
}
