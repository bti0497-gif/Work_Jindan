const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = () => import('../src/services/boardModel.js');
const user = { uid: 'firebase-user', person_id: 'employee', name: 'Team member', role: 'user' };
const input = { menu: '전체게시판', title: 'Post', content: '<p>Content</p>', attachments: [] };

test('ID login preserves case, Korean IDs and existing short passwords without exposing the ID as an email', async () => {
    const { authPasswordForId, loginEmailForId } = await import('../src/services/firebaseIdentity.js');
    assert.equal(await loginEmailForId(' admin '), await loginEmailForId('admin'));
    assert.notEqual(await loginEmailForId('Admin'), await loginEmailForId('admin'));
    assert.match(await loginEmailForId('진단팀/홍길동'), /^id-[a-f0-9]{64}@work-jindan\.internal$/);
    assert.equal((await authPasswordForId('admin', 'admin')).length, 64);
    assert.equal(await authPasswordForId('admin', 'admin'), await authPasswordForId('admin', 'admin'));
    assert.notEqual(await authPasswordForId('admin', 'admin'), await authPasswordForId('admin', 'changed'));
    assert.notEqual(await authPasswordForId('admin', 'admin'), await authPasswordForId('other', 'admin'));
});

test('Firebase Auth and Firestore register on the same SDK app instance', async () => {
    const { initializeApp, deleteApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const { getFirestore } = await import('firebase/firestore');
    const app = initializeApp({ apiKey: 'test-api-key', projectId: 'demo-board-test', appId: 'demo-board' }, 'sdk-test');
    assert.equal(getAuth(app).app, app);
    assert.equal(getFirestore(app).app, app);
    await deleteApp(app);
});

test('cloud posts exclude local credentials and Drive log identifiers', async () => {
    const { makePost } = await model();
    const post = makePost({ ...input, password: 'do-not-send', fileId: 'legacy-log' }, user);
    assert.equal(post.ownerUid, user.uid);
    assert.equal(post.authorId, user.person_id);
    assert.equal('password' in post, false);
    assert.equal('fileId' in post, false);
    assert.equal('comments' in post, false);
});
test('edits preserve original owner, author and migration marker', async () => {
    const { makePost } = await model();
    const original = { ...makePost(input, user), migratedBy: 'admin' };
    const updated = makePost({ ...input, title: 'Edited', menu: '본사공지' }, { ...user, uid: 'admin', name: 'Admin' }, original);
    for (const key of ['id', 'menu', 'ownerUid', 'author', 'authorId', 'createdAt', 'migratedBy']) assert.equal(updated[key], original[key]);
});
test('only owner or administrator can edit', async () => {
    const { canEditPost } = await model();
    const post = { ownerUid: 'firebase-user' };
    assert.equal(canEditPost(post, user), true);
    assert.equal(canEditPost(post, { ...user, uid: 'other' }), false);
    assert.equal(canEditPost(post, { uid: 'admin', role: 'admin' }), true);
    assert.equal(canEditPost(post, null), false);
});
test('invalid boards, oversized text and incomplete attachments are rejected', async () => {
    const { makePost } = await model();
    for (const invalid of [
        { menu: undefined }, { title: ' ' }, { content: '' },
        { title: 'x'.repeat(301) }, { content: '한'.repeat(200001) },
        { attachments: [{ name: 'not-uploaded' }] },
        { attachments: Array.from({ length: 11 }, (_, i) => ({ id: String(i) })) },
    ]) assert.throws(() => makePost({ ...input, ...invalid }, user));
});
