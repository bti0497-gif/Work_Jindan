import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadEnv } from 'vite';
import { adminApi, project } from './firebase-admin-api.mjs';
import { authPasswordForId, loginEmailForId } from '../src/services/firebaseIdentity.js';

const api = adminApi();
const key = loadEnv('production', process.cwd(), '').VITE_FIREBASE_API_KEY;
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const file = '.firebase/ui-account.json';
if (process.argv[2] === 'create') {
    try { await fs.access(file); throw new Error('Clean up the previous UI test account first.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const tag = randomUUID().slice(0, 8);
    const personId = `board-ui-${tag}`;
    const email = await loginEmailForId(personId);
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: await authPasswordForId(personId, 'Temporary-board-test-2026!'), returnSecureToken: true }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message);
    await fs.mkdir('.firebase', { recursive: true });
    await fs.writeFile(file, JSON.stringify({ uid: result.localId, personId, tag }));
    await api(`${root}/jindan_members/${result.localId}`, 'PATCH', { fields: {
        uid: { stringValue: result.localId }, person_id: { stringValue: 'board-ui-' + tag },
        email: { stringValue: email }, name: { stringValue: '게시판 검증 계정' },
        position: { stringValue: '관리자' }, isActive: { booleanValue: true }, userLevel: { integerValue: '0' },
    } });
    console.log(JSON.stringify({ id: personId, memberId: `board-ui-member-${tag}` }));
} else if (process.argv[2] === 'cleanup') {
    const session = JSON.parse(await fs.readFile(file, 'utf8'));
    const accounts = await api(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000`);
    const profiles = await api(`${root}/jindan_members?pageSize=1000`);
    const testIds = new Set((profiles.documents || []).filter(profile => {
        const id = profile.fields?.person_id?.stringValue || '';
        return id.startsWith('board-ui-') && id.includes(session.tag);
    }).map(profile => profile.name.split('/').pop()));
    testIds.add(session.uid);
    const tests = accounts.users.filter(account => testIds.has(account.localId));
    const ids = new Set(tests.map(account => account.localId));
    let deleted = 0;
    for (const name of ['jindan_board_posts', 'jindan_board_comments']) {
        const docs = await api(`${root}/${name}?pageSize=1000`);
        for (const document of docs.documents || []) {
            if (ids.has(document.fields?.ownerUid?.stringValue) || ids.has(document.fields?.migratedBy?.stringValue)) {
                await api(`https://firestore.googleapis.com/v1/${document.name}`, 'DELETE'); deleted++;
            }
        }
    }
    for (const account of tests) {
        await api(`${root}/jindan_members/${account.localId}`, 'DELETE');
        await api(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`, 'POST', { localId: account.localId });
    }
    await fs.unlink(file);
    console.log(`Removed ${deleted} test board documents and ${tests.length} test accounts/profiles.`);
} else throw new Error('Use create or cleanup. Only temporary board-ui test accounts are affected.');
