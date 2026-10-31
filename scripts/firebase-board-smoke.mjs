import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from 'vite';
import { adminApi, project } from './firebase-admin-api.mjs';

if (!process.argv.includes('--run')) throw new Error('Pass --run to create temporary test accounts and records, verify deployed rules, and remove the test data.');
const api = adminApi();
const env = loadEnv('production', process.cwd(), '');
const key = env.VITE_FIREBASE_API_KEY;
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const prefix = `smoke_${randomUUID().replaceAll('-', '')}`;
const accounts = [];
const documents = new Set();
const field = value => {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return { integerValue: String(value) };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
    return { mapValue: { fields: fields(value) } };
};
const fields = value => Object.fromEntries(Object.entries(value).map(([name, value]) => [name, field(value)]));
const request = async (path, account, method = 'GET', data) => {
    const response = await fetch(root + '/' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(account ? { Authorization: `Bearer ${account.idToken}` } : {}) },
        body: data ? JSON.stringify({ fields: fields(data) }) : undefined,
    });
    return { status: response.status, body: await response.json() };
};
const expect = async (label, promise, status) => {
    const result = await promise;
    assert.equal(result.status, status, `${label}: ${result.body.error?.message || result.status}`);
    console.log(`PASS ${label}`);
    return result;
};
const signup = async label => {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${prefix}_${label}@example.com`, password: randomUUID(), returnSecureToken: true }),
    });
    const account = await response.json();
    if (!response.ok) throw new Error(account.error?.message || 'Test sign-up failed');
    accounts.push(account);
    return account;
};
const profile = (account, level = 2) => ({ uid: account.localId, person_id: account.localId, email: account.email, name: 'Temporary test user', position: 'Tester', isActive: true, userLevel: level });
const seed = async (path, data) => {
    documents.add(path);
    await api(root + '/' + path, 'PATCH', { fields: fields(data) });
};
try {
    const owner = await signup('owner');
    const other = await signup('other');
    const admin = await signup('admin');
    const outsider = await signup('outsider');
    await seed(`jindan_members/${owner.localId}`, profile(owner));
    await seed(`jindan_members/${other.localId}`, profile(other));
    await seed(`jindan_members/${admin.localId}`, profile(admin, 0));
    const postId = prefix + '_post';
    const path = `jindan_board_posts/${postId}`;
    const post = {
        id: postId, menu: '전체게시판', title: 'Temporary verification', content: '<p>Temporary test</p>',
        author: 'Temporary test user', authorId: owner.localId, ownerUid: owner.localId,
        attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false,
    };
    // 신규 규칙 전파가 끝나면 시작한다. 사용자의 기존 데이터에는 쓰지 않는다.
    const deadline = Date.now() + 45000;
    while ((await request(`jindan_members/${owner.localId}`, owner)).status !== 200) {
        if (Date.now() > deadline) throw new Error('Published rules have not propagated to the test profile.');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await expect('anonymous board access denied', request('jindan_board_posts', null), 403);
    await expect('unapproved account denied', request('jindan_board_posts', outsider), 403);
    await expect('regular member cannot list private profiles', request('jindan_members', owner), 403);
    await expect('member cannot grant administrator access', request(`jindan_members/${owner.localId}?updateMask.fieldPaths=userLevel`, owner, 'PATCH', { userLevel: 0 }), 403);
    documents.add(path);
    await expect('approved member creates post', request(path, owner, 'PATCH', post), 200);
    await expect('another member reads post', request(path, other), 200);
    await expect('another member cannot edit post', request(`${path}?updateMask.fieldPaths=title`, other, 'PATCH', { title: 'Not allowed' }), 403);
    await expect('owner edits post', request(`${path}?updateMask.fieldPaths=title`, owner, 'PATCH', { title: 'Edited' }), 200);
    await expect('owner cannot transfer ownership', request(`${path}?updateMask.fieldPaths=ownerUid`, owner, 'PATCH', { ownerUid: other.localId }), 403);
    const comments = [owner, other].map((account, index) => {
        const id = `${prefix}_comment_${index}`;
        documents.add('jindan_board_comments/' + id);
        return { account, id, data: { id, postId, ownerUid: account.localId, author: 'Tester', content: 'Concurrent comment', createdAt: new Date().toISOString() } };
    });
    await Promise.all(comments.map(comment => expect('independent comment saved', request(`jindan_board_comments/${comment.id}`, comment.account, 'PATCH', comment.data), 200)));
    await expect('administrator can edit a member post', request(`${path}?updateMask.fieldPaths=title`, admin, 'PATCH', { title: 'Admin edit' }), 200);
    await expect('hard delete denied', request(path, owner, 'DELETE'), 403);
    await expect('owner soft-deletes post', request(`${path}?updateMask.fieldPaths=deleted`, owner, 'PATCH', { deleted: true }), 200);
    await expect('deleted post cannot be resurrected by stale writes', request(`${path}?updateMask.fieldPaths=deleted`, owner, 'PATCH', { deleted: false }), 403);
    await expect('comments on deleted post denied', request(`jindan_board_comments/${comments[0].id}_late`, owner, 'PATCH', { ...comments[0].data, id: comments[0].id + '_late' }), 403);
    await expect('legacy collections remain inaccessible', request('posts', owner), 403);
    documents.add(`jindan_members/${outsider.localId}`);
    await expect('administrator can approve a new account', request(`jindan_members/${outsider.localId}`, admin, 'PATCH', profile(outsider)), 200);
    await expect('approved account gains board access', request('jindan_board_posts', outsider), 200);
    if (process.argv.includes('--work')) {
        const base = { author: 'Temporary test user', authorId: owner.localId, ownerUid: owner.localId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false };
        const projectId = prefix + '_project', projectPath = `jindan_projects/${projectId}`;
        const workProject = { ...base, id: projectId, title: 'Temporary work check', content: 'Fixture only', startDate: '2026-10-01', endDate: '2026-12-31' };
        documents.add(projectPath);
        await expect('anonymous work access denied', request('jindan_projects', null), 403);
        await expect('member creates Firebase project', request(projectPath, owner, 'PATCH', workProject), 200);
        await expect('team member reads project', request(projectPath, other), 200);
        await expect('other member cannot edit project', request(`${projectPath}?updateMask.fieldPaths=title`, other, 'PATCH', { title: 'Forbidden' }), 403);
        await expect('owner edits project', request(`${projectPath}?updateMask.fieldPaths=title`, owner, 'PATCH', { title: 'Updated' }), 200);
        await expect('work owner cannot be reassigned', request(`${projectPath}?updateMask.fieldPaths=ownerUid`, owner, 'PATCH', { ownerUid: other.localId }), 403);
        await expect('credentials cannot enter work records', request(`${projectPath}?updateMask.fieldPaths=password`, owner, 'PATCH', { password: 'synthetic' }), 403);
        const processId = prefix + '_process', processPath = `jindan_processes/${processId}`;
        documents.add(processPath);
        await expect('member creates Firebase process', request(processPath, owner, 'PATCH', { ...base, id: processId, projectId, title: 'Process check', startDate: '2026-10-01', endDate: '2026-10-31', isCompleted: false }), 200);
        await expect('team completes shared process', request(`${processPath}?updateMask.fieldPaths=isCompleted`, other, 'PATCH', { isCompleted: true }), 200);
        await expect('process project cannot be reassigned', request(`${processPath}?updateMask.fieldPaths=projectId`, owner, 'PATCH', { projectId: 'foreign' }), 403);
        const taskId = prefix + '_task', taskPath = `jindan_tasks/${taskId}`;
        documents.add(taskPath);
        await expect('owner can read a not-yet-created task for transactions', request(taskPath, owner), 404);
        await expect('owner creates private Firebase task', request(taskPath, owner, 'PATCH', { ...base, id: taskId, date: '2026-10-31', content: 'Private fixture', isPublic: false }), 200);
        await expect('private task visible to its author', request(taskPath, owner), 200);
        await expect('private task hidden from other member', request(taskPath, other), 403);
        await expect('private task hidden from administrator', request(taskPath, admin), 403);
        await expect('unfiltered task query denied', request('jindan_tasks', owner), 403);
        const taskQuery = async filter => {
            const response = await fetch(`${root}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.idToken}` }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'jindan_tasks' }], where: { fieldFilter: filter } } }) });
            return { status: response.status, body: await response.json() };
        };
        await expect('public task query allowed', taskQuery({ field: { fieldPath: 'isPublic' }, op: 'EQUAL', value: { booleanValue: true } }), 200);
        await expect('own-author task query allowed', taskQuery({ field: { fieldPath: 'authorId' }, op: 'EQUAL', value: { stringValue: owner.localId } }), 200);
        await expect('owner publishes task', request(`${taskPath}?updateMask.fieldPaths=isPublic`, owner, 'PATCH', { isPublic: true }), 200);
        await expect('other member reads public task', request(taskPath, other), 200);
        await expect('other member cannot edit public task', request(`${taskPath}?updateMask.fieldPaths=content`, other, 'PATCH', { content: 'Forbidden' }), 403);
        await expect('task hard deletion denied', request(taskPath, owner, 'DELETE'), 403);
        await expect('owner soft-deletes task', request(`${taskPath}?updateMask.fieldPaths=deleted`, owner, 'PATCH', { deleted: true }), 200);
        await expect('stale task cannot be resurrected', request(`${taskPath}?updateMask.fieldPaths=deleted`, owner, 'PATCH', { deleted: false }), 403);
        await expect('owner soft-deletes project', request(`${projectPath}?updateMask.fieldPaths=deleted`, owner, 'PATCH', { deleted: true }), 200);
        await expect('stale project cannot be resurrected', request(`${projectPath}?updateMask.fieldPaths=deleted`, owner, 'PATCH', { deleted: false }), 403);
        console.log('Firebase work live checks passed.');
    }
    console.log('Firebase board live checks passed.');
} finally {
    const failures = [];
    for (const path of documents) {
        try { await api(root + '/' + path, 'DELETE'); }
        catch (error) { failures.push({ path, error: error.message }); }
    }
    for (const account of accounts) {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: account.idToken }),
        });
        if (!response.ok) failures.push({ account: account.localId, error: 'Temporary account cleanup failed' });
    }
    if (failures.length) throw new Error(JSON.stringify(failures));
    console.log(`Removed ${documents.size} temporary documents and ${accounts.length} temporary accounts.`);
}
