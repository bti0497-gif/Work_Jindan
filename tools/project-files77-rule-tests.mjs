import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only synthetic contexts sent to the Rules test API. No Firestore writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = '/databases/(default)/documents';
const id = 'synthetic-project';
const uid = 'synthetic-member';
const original = {
  projectId: id, ownerUid: uid, sourceSha256: 'a'.repeat(64), schemaVersion: 1,
  metadataJson: '{"format":"deojon.project"}', createdAt: '2026-11-09', updatedAt: '2026-11-09'
};
const mock = (fn, target, value) => ({ function: fn, args: [{ exactValue: target }], result: { value } });
const cases = [];
function add(name, method, expectation, options = {}) {
  const who = options.uid ?? uid;
  const data = { ...original, ...options.changes };
  if (options.omit) delete data[options.omit];
  const profile = { data: { isActive: options.active !== false, userLevel: options.admin ? 0 : 2, person_id: 'synthetic-person' } };
  const parent = { data: { ownerUid: options.parentOwner ?? uid, deleted: options.parentDeleted ?? false } };
  const collection = options.collection ?? 'jindan_project_files';
  const document = `${base}/${collection}/${id}`;
  const context = {
    expectation, pathEncoding: 'PLAIN',
    request: { path: document, method, auth: options.anonymous ? null : { uid: who, token: {} },
      ...(method === 'create' || method === 'update' ? { resource: { data } } : {}) },
    ...(method !== 'create' && !options.missing ? { resource: { data: options.resource ?? original } } : {}),
    functionMocks: [
      mock('get', `${base}/jindan_members/${who}`, profile),
      mock('get', `${base}/jindan_projects/${id}`, parent),
      mock('getAfter', `${base}/jindan_projects/${id}`, parent),
      mock('exists', `${base}/jindan_tasks/${id}`, true)
    ]
  };
  cases.push({ name, context });
}
add('active member reads metadata', 'get', 'ALLOW');
add('active member reads absent metadata for retry', 'get', 'ALLOW', { missing: true });
add('anonymous metadata read denied', 'get', 'DENY', { anonymous: true });
add('inactive metadata read denied', 'get', 'DENY', { active: false });
add('bulk metadata listing denied', 'list', 'DENY');
add('valid owner registration allowed', 'create', 'ALLOW');
add('anonymous registration denied', 'create', 'DENY', { anonymous: true });
add('inactive registration denied', 'create', 'DENY', { active: false });
add('spoofed metadata owner denied', 'create', 'DENY', { changes: { ownerUid: 'other' } });
add('other parent owner denied', 'create', 'DENY', { parentOwner: 'other' });
add('deleted parent registration denied', 'create', 'DENY', { parentDeleted: true });
add('mismatched project id denied', 'create', 'DENY', { changes: { projectId: 'other' } });
add('unknown schema denied', 'create', 'DENY', { changes: { schemaVersion: 2 } });
add('invalid fingerprint denied', 'create', 'DENY', { changes: { sourceSha256: 'bad' } });
add('missing required field denied', 'create', 'DENY', { omit: 'createdAt' });
add('additional fields denied', 'create', 'DENY', { changes: { unexpected: true } });
add('empty metadata denied', 'create', 'DENY', { changes: { metadataJson: '' } });
add('oversized metadata denied', 'create', 'DENY', { changes: { metadataJson: 'x'.repeat(300001) } });
add('owner metadata update allowed', 'update', 'ALLOW', { changes: { metadataJson: '{"changed":true}', updatedAt: '2026-11-10' } });
add('admin metadata update allowed', 'update', 'ALLOW', { uid: 'synthetic-admin', admin: true, changes: { metadataJson: '{"changed":true}' } });
add('other member update denied', 'update', 'DENY', { uid: 'other' });
add('inactive owner update denied', 'update', 'DENY', { active: false });
add('owner reassignment denied', 'update', 'DENY', { changes: { ownerUid: 'other' } });
add('fingerprint replacement denied', 'update', 'DENY', { changes: { sourceSha256: 'b'.repeat(64) } });
add('created date replacement denied', 'update', 'DENY', { changes: { createdAt: '2026-11-10' } });
add('deleted parent update denied', 'update', 'DENY', { parentDeleted: true });
add('metadata hard delete denied', 'delete', 'DENY');
add('existing project member read preserved', 'get', 'ALLOW', { collection: 'jindan_projects' });
add('existing project anonymous read denied', 'get', 'DENY', { collection: 'jindan_projects', anonymous: true });
add('own private task read preserved', 'get', 'ALLOW', { collection: 'jindan_tasks', resource: { isPublic: false, authorId: 'synthetic-person' } });
add('other private task denied', 'get', 'DENY', { collection: 'jindan_tasks', resource: { isPublic: false, authorId: 'other-person' } });
add('unknown collection remains denied', 'get', 'DENY', { collection: 'unrelated_collection' });
const folder = path.join(root, 'artifacts/project-files77-rules');
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(path.join(folder, 'test-suite.json'), JSON.stringify({ testCases: cases.map(c => c.context) }, null, 2));
await fs.writeFile(path.join(folder, 'test-names.json'), JSON.stringify(cases.map(c => c.name), null, 2));
console.log(`Prepared ${cases.length} synthetic rule checks`);
