import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { adminApi, project } from 'file:///F:/jindan/scripts/firebase-admin-api.mjs';

// Read-only evidence for the user-authorized UI save/import check.
// No tokens or original company document contents are written to evidence.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'artifacts/project-roundtrip77');
const api = adminApi();
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
async function snapshot() {
  const documents = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await api(`${base}/jindan_projects?${query}`);
    documents.push(...(page.documents ?? [])); pageToken = page.nextPageToken;
  } while (pageToken);
  return documents.map(doc => ({ id: doc.name.split('/').at(-1), hash: hash(doc), updateTime: doc.updateTime }));
}
await fs.mkdir(folder, { recursive: true });
if (process.argv[2] === 'before') {
  const target = path.join(folder, 'before.json');
  const before = { capturedAt: new Date().toISOString(), project, documents: await snapshot() };
  await fs.writeFile(target, JSON.stringify(before, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ baselineSaved: true, projectCount: before.documents.length }));
} else if (process.argv[2] === 'after') {
  const before = JSON.parse(await fs.readFile(path.join(folder, 'before.json'), 'utf8'));
  const after = await snapshot();
  const preserved = before.documents.every(old => after.some(doc => doc.id === old.id && doc.hash === old.hash));
  const added = after.filter(doc => !before.documents.some(old => old.id === doc.id));
  const receipt = { checkedAt: new Date().toISOString(), project, originalCount: before.documents.length,
    currentCount: after.length, allOriginalDocumentsUnchanged: preserved, addedProjects: added };
  await fs.writeFile(path.join(folder, 'after.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
  if (!preserved) process.exitCode = 1;
} else if (process.argv[2] === 'verify-file') {
  const filePath = path.resolve(process.argv[3]);
  const archive = JSON.parse(execFileSync('python', ['-c',
    'import json,sys,zipfile,os; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"entries":z.namelist(),"bytes":os.path.getsize(sys.argv[1]),"document":json.loads(z.read("project.json"))},ensure_ascii=True))',
    filePath], { encoding: 'utf8' }));
  const file = archive.document;
  const selected = await api(`${base}/jindan_projects/${encodeURIComponent(file.project.id)}`);
  const metadata = await api(`${base}/jindan_project_files/${encodeURIComponent(file.project.id)}`);
  const original = await api(`${base}/jindan_projects/${encodeURIComponent(file.server.scopeProjectId)}`);
  const field = (doc, name) => doc.fields[name]?.stringValue ?? '';
  const lowerKeys = value => Array.isArray(value) ? value.map(lowerKeys)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key[0].toLowerCase() + key.slice(1), lowerKeys(child)])) : value;
  const source = lowerKeys(JSON.parse(field(metadata, 'metadataJson')));
  const header = doc => ({ id: doc.name.split('/').at(-1), name: field(doc, 'title'),
    startDate: field(doc, 'startDate'), endDate: field(doc, 'endDate'), description: field(doc, 'content'),
    createdAt: field(doc, 'createdAt'), createdBy: field(doc, 'author') });
  const business = doc => ['title', 'content', 'startDate', 'endDate'].map(key => field(doc, key));
  const before = JSON.parse(await fs.readFile(path.join(folder, 'before.json'), 'utf8'));
  const now = await snapshot();
  const logPath = path.join(process.env.LOCALAPPDATA, 'Deojon/Jindan/Wpf/diagnostics/session-20261109-073752-6fca48f8347e4c6b88d0a12a31fdf823.jsonl');
  const events = (await fs.readFile(logPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const start = events.find(e => e.operation === 'app.start');
  const imported = events.find(e => e.operation === 'project.file.import' && e.phase === 'success');
  const exportBeforeImport = imported && events.some(e => e.operation === 'project.file.export' && e.phase === 'success' && e.time < imported.time);
  const checks = {
    singleManifestEntry: archive.entries.length === 1 && archive.entries[0] === 'project.json',
    metadataOnlySchema: hash(Object.keys(file).sort()) === hash(['format','version','project','drive','reports','server','settings'].sort()),
    originalSeparateFromImported: file.project.id !== file.server.scopeProjectId,
    originalNotModifiedSinceAppLaunch: new Date(original.updateTime) < new Date(start.time),
    allBaselineProjectsUnchanged: before.documents.every(old => now.some(doc => doc.id === old.id && doc.hash === old.hash)),
    noFurtherProjectsAdded: now.length === before.documents.length,
    importedBusinessFieldsMatchOriginal: hash(business(selected)) === hash(business(original)),
    sourceHeaderMatchesOriginal: hash(source.project) === hash(header(original)),
    exportedHeaderMatchesSelectedProject: hash(file.project) === hash(header(selected)),
    sourceScopePreserved: source.server.scopeProjectId === original.name.split('/').at(-1),
    exportedConnectionsMatchStoredManifest: ['server','drive','reports','settings'].every(key => hash(source[key]) === hash(file[key])),
    metadataOwnerMatchesNewProject: field(metadata, 'ownerUid') === field(selected, 'ownerUid'),
    metadataIdMatchesNewProject: field(metadata, 'projectId') === file.project.id,
    uiExportBeforeImportSucceeded: !!exportBeforeImport,
    uiProjectOpenedAfterImport: !!imported && events.some(e => e.operation === 'project.selected' && e.phase === 'success' && e.time >= imported.time)
  };
  const receipt = { verifiedAt: new Date().toISOString(), filePath, fileBytes: archive.bytes,
    originalProjectId: file.server.scopeProjectId, importedProjectId: file.project.id,
    originalUpdateTime: original.updateTime, importSucceededAt: imported?.time,
    projectCount: now.length, driveFolderConfigured: !!file.drive.rootFolderId,
    driveFileLinks: file.drive.files.length, reportLinks: file.reports.documents.length,
    checks, passed: Object.values(checks).every(Boolean) };
  await fs.writeFile(path.join(folder, 'roundtrip-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
  if (!receipt.passed) process.exitCode = 1;
} else throw new Error('Use before, after or verify-file <path.tzprj>');
