using System.Windows;
namespace Jindan.Fluent.Shared;
public partial class ExitPrompt
{
    public ExitPrompt() { InitializeComponent(); Loaded += (_, _) => CancelButton.Focus(); }
    void Confirm(object sender, RoutedEventArgs e) => DialogResult = true;
    public static bool Ask(Window owner) => new ExitPrompt { Owner = owner }.ShowDialog() == true;
}
