namespace Jindan.Desktop.Contracts;

public interface IProjectSelectionModule75
{
    Form CreateProjectSelectionDialog();
}
public interface IProjectSelectionDialog75
{
    string? SelectedProjectId { get; }
}
