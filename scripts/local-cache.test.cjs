const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

const key = 'jindan_db_회원관리';
const member = { person_id: 'upgrade-user', projectId: 'existing-project', password: 'synthetic-old-password', role: 'admin' };
const cloud = { uid: 'verified-uid', person_id: member.person_id, name: 'Verified member', role: 'user', email: '' };
const storage = () => {
    const values = new Map();
    return {
        values,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
};
const setup = async (authOverrides = {}) => {
    globalThis.localStorage = storage();
    globalThis.sessionStorage = storage();
    const { dbService } = await import('../src/services/dbService.js');
    globalThis.__cacheAuthTest = {
        dbService,
        loginBoard: async () => ({ ...cloud }),
        getBoardUser: async () => ({ ...cloud }),
        logoutBoard: async () => {},
        ...authOverrides,
    };
    const source = (await fs.readFile('src/services/authService.js', 'utf8')).replace(/^import .*;\r?\n/gm, '');
    const prefix = 'const { dbService, loginBoard, getBoardUser, logoutBoard } = globalThis.__cacheAuthTest;\n';
    const auth = await import(`data:text/javascript;base64,${Buffer.from(prefix + source).toString('base64')}#${crypto.randomUUID()}`);
    return { dbService, auth };
};

test('upgrade login accepts a single cached member without modifying the original cache', async () => {
    const { dbService, auth } = await setup();
    const original = JSON.stringify(member);
    localStorage.setItem(key, original);
    assert.deepEqual(dbService.getAll('회원관리'), [member]);
    const user = await auth.login(member.person_id, 'synthetic-password');
    assert.equal(user.firebaseUid, cloud.uid);
    assert.equal(user.role, 'user');
    assert.equal(user.projectId, member.projectId);
    assert.equal('password' in user, false);
    assert.equal('password' in JSON.parse(sessionStorage.getItem('currentUser')), false);
    assert.equal(localStorage.getItem(key), original);
    assert.equal(localStorage.values.size, 1);
    assert.equal((await auth.restoreSession()).firebaseUid, cloud.uid);
});

test('malformed, null, primitive and unrecognized caches cannot block verified login or rewrite originals', async () => {
    const { dbService, auth } = await setup();
    for (const original of ['{broken', 'null', 'false', '42', '"text"', '{"unexpected":"shape"}']) {
        localStorage.setItem(key, original);
        assert.deepEqual(dbService.getAll('회원관리'), []);
        assert.equal((await auth.login(member.person_id, 'synthetic-password')).firebaseUid, cloud.uid);
        assert.equal(localStorage.getItem(key), original);
        assert.equal(localStorage.values.size, 1);
    }
});

test('invalid array entries and email values do not break member matching', async () => {
    const { dbService, auth } = await setup({ loginBoard: async () => ({ ...cloud, email: 'member@example.invalid' }) });
    const rows = [null, false, 'bad', [], { email: 42 }, member];
    localStorage.setItem(key, JSON.stringify(rows));
    assert.deepEqual(dbService.getAll('회원관리'), [{ email: 42 }, member]);
    assert.equal((await auth.login(member.person_id, 'synthetic-password')).projectId, member.projectId);
    assert.deepEqual(JSON.parse(localStorage.getItem(key)), rows);
});

test('a cached member cannot bypass failed server authentication', async () => {
    const { auth } = await setup({ loginBoard: async () => { throw new Error('Invalid credentials'); } });
    localStorage.setItem(key, JSON.stringify(member));
    await assert.rejects(auth.login(member.person_id, 'wrong-password'), /Invalid credentials/);
    assert.equal(sessionStorage.getItem('currentUser'), null);
});

test('cache read failure does not reject successful cloud authentication', async () => {
    const { auth } = await setup();
    localStorage.getItem = () => { throw new Error('Storage unavailable'); };
    assert.equal((await auth.login(member.person_id, 'synthetic-password')).firebaseUid, cloud.uid);
});

test('cloud ID and role take precedence over stale cached values', async () => {
    const { auth } = await setup();
    localStorage.setItem(key, JSON.stringify([{ ...member, firebaseUid: cloud.uid, person_id: 'stale-id' }]));
    const user = await auth.login(cloud.person_id, 'synthetic-password');
    assert.equal(user.person_id, cloud.person_id);
    assert.equal(user.role, cloud.role);
});

test('writes preserve nonstandard original bytes before replacing the cache', async () => {
    const { dbService } = await setup();
    for (const original of [JSON.stringify(member), '{broken', 'null', JSON.stringify([null, member])]) {
        localStorage.values.clear();
        localStorage.setItem(key, original);
        dbService.setTable('회원관리', [member]);
        assert.deepEqual(JSON.parse(localStorage.getItem(key)), [member]);
        const backups = [...localStorage.values.entries()].filter(([name]) => name.startsWith(`${key}_backup_`));
        assert.equal(backups.length, 1);
        assert.equal(backups[0][1], original);
        dbService.setTable('회원관리', [member]);
        assert.equal(localStorage.values.size, 2);
    }
});

test('failed backup or invalid replacement cannot overwrite the original', async () => {
    const { dbService } = await setup();
    const original = JSON.stringify(member);
    localStorage.setItem(key, original);
    assert.throws(() => dbService.setTable('회원관리', member), /레코드 배열/);
    assert.throws(() => dbService.setTable('회원관리', [null]), /레코드 배열/);
    const setItem = localStorage.setItem;
    localStorage.setItem = (name, value) => {
        if (name.startsWith(`${key}_backup_`)) throw new Error('Storage full');
        setItem(name, value);
    };
    assert.throws(() => dbService.setTable('회원관리', []), /Storage full/);
    assert.equal(localStorage.getItem(key), original);
});

test('single record updates preserve existing fields and sync queue compatibility', async () => {
    const { dbService } = await setup();
    localStorage.setItem(key, JSON.stringify(member));
    localStorage.setItem('jindan_sync_queue', JSON.stringify({ tableName: '회원관리', id: member.person_id }));
    const updated = { ...dbService.getById('회원관리', member.person_id), name: 'Updated' };
    dbService.save('회원관리', updated);
    assert.deepEqual(dbService.getAll('회원관리'), [updated]);
    assert.equal(dbService.getSyncQueue().length, 1);
    dbService.removeFromSyncQueue('회원관리', member.person_id);
    assert.deepEqual(dbService.getSyncQueue(), []);
    dbService.remove('회원관리', member.person_id);
    assert.deepEqual(dbService.getAll('회원관리'), []);
});
