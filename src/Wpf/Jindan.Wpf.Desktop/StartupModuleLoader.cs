using System.IO;
using System.Runtime.Loader;
using Jindan.Fluent.Shared;

namespace Jindan.Fluent.Desktop;

// Deliberate inventory, no assembly-directory scanning. UI DLLs only depend on the shared contract.
// This is the development composition root, not a replacement for the existing verified package updater.
public sealed class StartupModuleLoader(string root)
{
    readonly Dictionary<string, IStartupUiModule> loaded = [];
    public IStartupUiModule Get(string id)
    {
        if (loaded.TryGetValue(id, out var module)) return module;
        var (file, type) = id switch
        {
            "login" => ("Jindan.Wpf.Login.dll", "Jindan.Fluent.Login.LoginModule"),
            "projects" => ("Jindan.Wpf.Projects.dll", "Jindan.Fluent.Projects.ProjectsModule"),
            _ => throw new InvalidOperationException("Unknown startup module")
        };
        var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(Path.Combine(root, "modules", file)));
        module = Activator.CreateInstance(assembly.GetType(type, throwOnError: true)!) as IStartupUiModule ?? throw new InvalidDataException();
        if (module.Id != id) throw new InvalidDataException();
        loaded.Add(id, module); return module;
    }
}
