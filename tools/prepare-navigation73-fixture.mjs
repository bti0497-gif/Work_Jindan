import { mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.cwd();
const destination = path.resolve(root, 'artifacts', 'navigation73-fixture-' + Date.now());
await mkdir(destination);
const inventory = [], trusted = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const feature of ['Projects','Processes','Photos','Files','Tasks','Board','Members','Dashboard','ReportStudio']) {
  const id = feature === 'ReportStudio' ? 'report-studio' : feature.toLowerCase();
  const folder = path.join(destination, 'modules', id); await mkdir(folder, { recursive: true });
  const dll = `Jindan.Modules.${feature}.dll`;
  const sources = [[`src/Modules/${feature}/bin/Release/net10.0-windows/${dll}`, dll]];
  if (['Projects','Processes','Dashboard','Files'].includes(feature)) sources.push(['src/Jindan.Core/bin/Release/net10.0/Jindan.Core.dll', 'Jindan.Core.dll']);
  if (feature === 'Files') sources.push(['src/Jindan.Infrastructure/bin/Release/net10.0/Jindan.Infrastructure.dll', 'Jindan.Infrastructure.dll']);
  const files = [];
  for (const [source, name] of sources) {
    const target = path.join(folder, name); await copyFile(path.join(root, source), target);
    files.push({ path: name, size: (await stat(target)).size, sha256: hash(await readFile(target)) });
  }
  const capabilities = ['photos','dashboard'].includes(id) ? [] : ['sidebar-navigation/73'];
  if (['files','board'].includes(id)) capabilities.push('cloud-read/71');
  if (id === 'projects') capabilities.push('project-selection/75');
  const manifest = { schemaVersion: 1, moduleId: id, version: ['files','board'].includes(id) ? '1.0.1' : '1.0.0', entryAssembly: dll, entryType: `Jindan.Modules.${feature}.Module`, minimumHostContractMajor: 1, maximumHostContractMajor: 1, dataSchemaVersion: 1, dependencies: [], requiredHostCapabilities: capabilities, files };
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(path.join(folder, 'module.json'), bytes); trusted.push(hash(bytes)); inventory.push('modules/' + id);
}
await writeFile(path.join(destination, 'module-inventory.json'), JSON.stringify(inventory));
await writeFile(path.join(destination, 'trusted-manifests.json'), JSON.stringify(trusted));
await writeFile(path.join(destination, 'TEST-ONLY.json'), JSON.stringify({ syntheticOnly: true, reportRuntimeIncluded: false, reportReady: false }));
console.log(destination);
