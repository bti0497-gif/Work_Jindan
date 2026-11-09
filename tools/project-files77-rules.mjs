import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adminApi, project } from 'file:///F:/jindan/scripts/firebase-admin-api.mjs';

// Explicit user approval on 2026-11-09 authorizes this additive rules deployment.
// Existing gcloud credentials are used in memory by the read-only legacy helper.
// No credential, session token, company document or Drive content is copied.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'artifacts/project-files77-rules');
const endpoint = `https://firebaserules.googleapis.com/v1/projects/${project}`;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cleanSource = source => ({ files: source.files.map(({ name, content }) => ({ name, content })) });
const api = adminApi();
const mode = process.argv[2];
const read = name => fs.readFile(path.join(folder, name), 'utf8').then(JSON.parse);
const write = (name, data) => fs.writeFile(path.join(folder, name), JSON.stringify(data, null, 2) + '\n');

if (project !== 'work-jindan') throw new Error('Unexpected Firebase project');
if (mode === 'prepare') {
  await fs.mkdir(folder, { recursive: true });
  const release = await api(`${endpoint}/releases/cloud.firestore`);
  const rules = await api(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const before = cleanSource(rules.source);
  const candidate = structuredClone(before);
  const file = candidate.files.find(f => f.name === 'firestore.rules');
  if (!file || file.content.includes('match /jindan_project_files/')) throw new Error('Missing main rules or connection rules already present; inspect current release');
  const marker = /^(\s*)match \/\{document=\*\*\} \{ allow read, write: if false; \}/gm;
  const matches = [...file.content.matchAll(marker)];
  if (matches.length !== 1) throw new Error('Cannot identify unique deny-all insertion point');
  const snippet = await fs.readFile(path.join(root, 'server/project-files77/add-project-files.rules'), 'utf8');
  const offset = matches[0].index;
  file.content = file.content.slice(0, offset) + snippet + '\n' + file.content.slice(offset);
  const proof = structuredClone(candidate);
  proof.files.find(f => f.name === 'firestore.rules').content = file.content.replace(snippet + '\n', '');
  if (digest(proof) !== digest(before)) throw new Error('Existing rules changed');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await write(`backup-${stamp}.json`, { release, rules });
  await write('prepared.json', { project, preparedAt: new Date().toISOString(), previousRuleset: release.rulesetName, beforeHash: digest(before), candidateHash: digest(candidate) });
  await write('candidate.json', candidate);
  await fs.writeFile(path.join(folder, 'candidate.rules'), file.content);
  console.log(JSON.stringify({ prepared: true, project, existingFilesPreserved: true, previousRuleset: release.rulesetName, candidateHash: digest(candidate) }));
} else if (mode === 'test') {
  const source = await read('candidate.json'); const prepared = await read('prepared.json');
  if (digest(source) !== prepared.candidateHash) throw new Error('Candidate changed');
  const suitePath = process.argv[3];
  const testSuite = suitePath ? JSON.parse(await fs.readFile(path.resolve(root, suitePath), 'utf8')) : undefined;
  const checked = await api(`${endpoint}:test`, 'POST', { source, ...(testSuite ? { testSuite } : {}) });
  await write(testSuite ? 'behavior-test.json' : 'compile-test.json', { sourceHash: digest(source), ...checked });
  const failed = checked.issues?.some(i => i.severity === 'ERROR') || checked.testResults?.some(r => r.state !== 'SUCCESS');
  console.log(JSON.stringify({ issues: checked.issues ?? [], testResults: checked.testResults?.map(r => ({ state: r.state, errors: r.errors, debugMessages: r.debugMessages })) ?? [], failed: !!failed }));
  if (failed) process.exitCode = 1;
} else if (mode === 'deploy') {
  const source = await read('candidate.json'); const prepared = await read('prepared.json');
  if (digest(source) !== prepared.candidateHash) throw new Error('Candidate changed');
  const compiled = await read('compile-test.json'); const tested = await read('behavior-test.json');
  if (compiled.sourceHash !== prepared.candidateHash || tested.sourceHash !== prepared.candidateHash
    || compiled.issues?.some(i => i.severity === 'ERROR') || tested.issues?.some(i => i.severity === 'ERROR')
    || !tested.testResults?.length || tested.testResults.some(r => r.state !== 'SUCCESS')) throw new Error('Verification not passed for this source');
  const current = await api(`${endpoint}/releases/cloud.firestore`);
  if (current.rulesetName !== prepared.previousRuleset) throw new Error('Live rules changed since preparation; do not overwrite');
  const rules = await api(`${endpoint}/rulesets`, 'POST', { source });
  await write('created-ruleset.json', rules);
  const latest = await api(`${endpoint}/releases/cloud.firestore`);
  if (latest.rulesetName !== prepared.previousRuleset) throw new Error('Live rules changed during preparation; do not overwrite');
  await api(`${endpoint}/releases/cloud.firestore`, 'PATCH', { release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: rules.name }, updateMask: 'rulesetName' });
  const deployed = await api(`${endpoint}/releases/cloud.firestore`);
  const active = await api(`https://firebaserules.googleapis.com/v1/${deployed.rulesetName}`);
  if (deployed.rulesetName !== rules.name || digest(cleanSource(active.source)) !== prepared.candidateHash) throw new Error('Published source verification failed');
  const receipt = { deployedAt: new Date().toISOString(), project, previousRuleset: prepared.previousRuleset, activeRuleset: deployed.rulesetName, candidateHash: prepared.candidateHash, sourceVerified: true, behaviorChecks: tested.testResults.length };
  await write('deployment-receipt.json', receipt); console.log(JSON.stringify(receipt));
} else throw new Error('Use prepare, test [suite.json], or deploy');
