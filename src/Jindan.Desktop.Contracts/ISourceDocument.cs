namespace Jindan.Desktop.Contracts;

/// <summary>Optional source-opening capability used by file/photo navigation.
/// A local file is imported as a new immutable asset, never edited in place.</summary>
public interface ISourceDocument
{
    Task OpenSourceAsync(string path);
}
