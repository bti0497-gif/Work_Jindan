using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using Jindan.ModuleHost;

internal static partial class Program
{
    // Match the real collectible ModuleAssemblyScope policy. Default-ALC source
    // harnesses may otherwise hide a missing Core/Infrastructure declaration.
    static Task CheckModuleClosure70()
    {
        var root = packagedRoot ?? throw new InvalidOperationException();
        var enrolled = System.Text.Json.JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "trusted-manifests.json")))!;
        var observations = new List<object>();
        foreach (var directory in Directory.GetDirectories(Path.Combine(root, "modules")))
        {
            var module = ModuleCatalog.Verify(directory, new(enrolled));
            var declared = module.Manifest.Files.Where(f => !f.Path.Contains('/') && f.Path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)).ToDictionary(f => Path.GetFileNameWithoutExtension(f.Path), StringComparer.OrdinalIgnoreCase);
            foreach (var file in declared.Values)
            {
                using var input = File.OpenRead(Path.Combine(directory, file.Path));
                using var pe = new PEReader(input);
                if (!pe.HasMetadata) continue;
                var metadata = pe.GetMetadataReader();
                foreach (var handle in metadata.AssemblyReferences)
                {
                    var reference = metadata.GetAssemblyReference(handle);
                    var name = metadata.GetString(reference.Name);
                    var shared = name is "Jindan.Contracts" or "Jindan.Desktop.Contracts";
                    var framework = name is "netstandard" or "mscorlib" || name.StartsWith("System", StringComparison.Ordinal) || name.StartsWith("Microsoft.Win32", StringComparison.Ordinal);
                    Assert(shared || framework || declared.ContainsKey(name), $"{module.Manifest.ModuleId}/{file.Path} requires undeclared {name}; default host context is not a module dependency declaration");
                    if (!shared && !framework) observations.Add(new { module = module.Manifest.ModuleId, file.Path, reference = name, sha256 = declared[name].Sha256 });
                }
            }
        }
        File.WriteAllText(Path.Combine(workspace, "module-managed-closure70.json"), System.Text.Json.JsonSerializer.Serialize(observations, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
        return Task.CompletedTask;
    }
}
