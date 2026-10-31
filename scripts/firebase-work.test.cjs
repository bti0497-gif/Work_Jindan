const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = import('../src/services/workModel.js');
const user = { uid: 'owner-uid', person_id: 'author-id', name: 'Author', role: 'user' };
const project = { id: 'project', title: 'Facility diagnosis', startDate: '2026-10-01', endDate: '2026-12-31', content: '<p>Overview</p>' };

test('Firebase work records whitelist fields and never transmit cached credentials or Drive payloads', async () => {
    const { makeWorkRecord } = await model;
    const saved = makeWorkRecord('프로젝트관리', { ...project, password: 'old', accessToken: 'old', fileId: 'backup-only', ownerUid: 'forged' }, user);
    assert.equal(saved.ownerUid, user.uid); assert.equal(saved.authorId, user.person_id);
    for (const key of ['password', 'accessToken', 'fileId']) assert.equal(key in saved, false);
    const next = makeWorkRecord('프로젝트관리', { ...project, authorId: 'forged', createdAt: 'forged' }, user, saved);
    assert.equal(next.authorId, saved.authorId); assert.equal(next.createdAt, saved.createdAt);
});

test('work records reject invalid dates, reversed ranges, foreign creation and deleted-record resurrection', async () => {
    const { makeWorkRecord } = await model;
    for (const patch of [{ startDate: '2026-02-30' }, { endDate: '2026-09-01' }, { authorId: 'other' }, { id: '../foreign' }, { title: '' }]) assert.throws(() => makeWorkRecord('프로젝트관리', { ...project, ...patch }, user));
    assert.throws(() => makeWorkRecord('프로젝트관리', project, user, { ...project, deleted: true }), /삭제/);
    assert.throws(() => makeWorkRecord('회원관리', project, user), /지원하지/);
});

test('private tasks retain their author and processes cannot be moved between projects', async () => {
    const { makeWorkRecord } = await model;
    const task = makeWorkRecord('할일관리', { id: 'task', content: 'Inspect', date: '2026-10-31' }, user);
    assert.equal(task.isPublic, false);
    assert.throws(() => makeWorkRecord('할일관리', { ...task, authorId: 'other' }, { ...user, role: 'admin' }), /본인의/);
    const process = makeWorkRecord('공정관리', { ...project, id: 'process', projectId: project.id }, user);
    assert.throws(() => makeWorkRecord('공정관리', { ...process, projectId: 'different' }, user, process), /프로젝트/);
});

test('Firebase task reads use separate public and own-author queries, including tombstones', async () => {
    const fs = require('node:fs/promises');
    const calls = [];
    const modelApi = await model;
    globalThis.__firebaseWorkFixture = { ...modelApi, getBoardUser: async () => user, getFirebase: () => ({ db: {} }), collection: (_db, name) => name,
        where: (key, op, value) => ({ key, op, value }), query: (name, filter) => ({ name, filter }),
        getDocsFromServer: async target => { calls.push(target); return { docs: [{ id: 'same', data: () => ({ deleted: true, authorId: user.person_id }) }] }; },
    };
    const source = (await fs.readFile('src/services/firebaseWorkService.js', 'utf8')).replace(/^import .*;\r?\n/gm, '');
    const prefix = 'const {collection,doc,getDocsFromServer,query,runTransaction,where,getFirebase,getBoardUser,WORK_COLLECTIONS,assertWorkId,assertWorkTable,makeWorkRecord}=globalThis.__firebaseWorkFixture;\n';
    try {
        const { firebaseWorkService } = await import(`data:text/javascript;base64,${Buffer.from(prefix + source).toString('base64')}`);
        const rows = await firebaseWorkService.fetchData('할일관리');
        assert.equal(rows.length, 1); assert.equal(rows[0].deleted, true);
        assert.deepEqual(calls.map(call => call.filter), [{ key: 'isPublic', op: '==', value: true }, { key: 'authorId', op: '==', value: user.person_id }]);
    } finally { delete globalThis.__firebaseWorkFixture; }
});

test('tasks no longer readable after a privacy change leave the local cloud cache without dropping legacy or pending tasks', async () => {
    const { mergeWorkRecords } = await model;
    const local = [{ id: 'previously-public', ownerUid: 'other' }, { id: 'legacy' }, { id: 'pending', ownerUid: user.uid }];
    assert.deepEqual(mergeWorkRecords(local, [], [{ id: 'pending' }], true), [{ id: 'legacy' }, { id: 'pending', ownerUid: user.uid }]);
});
