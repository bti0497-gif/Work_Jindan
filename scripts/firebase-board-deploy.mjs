import fs from 'node:fs/promises';
import { adminApi, project } from './firebase-admin-api.mjs';

const api = adminApi();
const root = `https://firebaserules.googleapis.com/v1/projects/${project}`;
const source = { files: [{ name: 'firestore.rules', content: await fs.readFile('firestore.rules', 'utf8') }] };
const checked = await api(`${root}:test`, 'POST', { source });
if (checked.issues?.some(issue => issue.severity === 'ERROR')) throw new Error(JSON.stringify(checked.issues));
console.log('Firestore rules compilation passed.');
if (!process.argv.includes('--deploy')) {
    console.log('Validation only. Pass --deploy to publish the checked rules.');
} else {
    const release = await api(`${root}/releases/cloud.firestore`);
    const oldRules = await api(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
    await fs.mkdir('.firebase/backups', { recursive: true });
    const backup = `.firebase/backups/firestore-${Date.now()}.json`;
    await fs.writeFile(backup, JSON.stringify({ release, rules: oldRules }, null, 2));
    const rules = await api(`${root}/rulesets`, 'POST', { source });
    const current = await api(`${root}/releases/cloud.firestore`);
    if (current.rulesetName !== release.rulesetName) throw new Error('Rules changed during deployment. Review the current release before retrying.');
    await api(`${root}/releases/cloud.firestore`, 'PATCH', {
        release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: rules.name },
        updateMask: 'rulesetName',
    });
    const deployed = await api(`${root}/releases/cloud.firestore`);
    if (deployed.rulesetName !== rules.name) throw new Error('Published rules do not match the checked ruleset.');
    console.log(`Firestore rules published to ${project}. Previous rules: ${backup}`);
}
