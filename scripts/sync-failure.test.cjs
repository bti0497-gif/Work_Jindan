const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const load = async (path, prefix) => {
    const code = (await fs.readFile(path, 'utf8')).replace(/^import .*;\r?\n/gm, '');
    return import(`data:text/javascript;base64,${Buffer.from(prefix + code).toString('base64')}#${crypto.randomUUID()}`);
};
const setup = async (overrides = {}) => {
    const values = new Map();
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    const { dbService } = await import('../src/services/dbService.js');
    const model = await import('../src/services/workModel.js');
    const calls = [];
    const firebaseWorkService = { fetchData: async () => [], upsertData: async (table, row) => calls.push({ table, row }), deleteData: async (table, id) => calls.push({ table, id, deleted: true }), ...overrides };
    globalThis.__workSyncTest = { dbService, firebaseWorkService, ...model };
    const sync = await load('src/services/syncService.js', 'const {dbService,firebaseWorkService,WORK_TABLES,isWorkTable,mergeWorkRecords}=globalThis.__workSyncTest;\n');
    return { dbService, sync, calls, values };
};

test('Firebase failures preserve cached rows, pending writes and last successful sync', async () => {
    const fail = async () => { throw new Error('Offline'); };
    const { dbService, sync } = await setup({ fetchData: fail, upsertData: fail });
    dbService.save('프로젝트관리', { id: 'keep', title: 'Local changes' });
    dbService.setLastSync('previous');
    await assert.rejects(sync.syncAllData(), /Offline/);
    assert.equal(dbService.getAll('프로젝트관리')[0].title, 'Local changes');
    assert.equal(dbService.getSyncQueue().length, 1);
    assert.equal(dbService.getLastSync(), 'previous');
});

test('empty Firebase collections preserve legacy local records awaiting migration', async () => {
    const { dbService, sync } = await setup();
    dbService.setTable('프로젝트관리', [{ id: 'legacy', title: 'Previous report project' }]);
    await sync.syncAllData();
    assert.equal(dbService.getAll('프로젝트관리')[0].id, 'legacy');
    assert.notEqual(dbService.getLastSync(), '1970-01-01T00:00:00Z');
});

test('server pulls notify project selectors through a cache event without causing another upload cycle',async()=>{
    const previousWindow=globalThis.window,events=[];
    globalThis.window={dispatchEvent:event=>events.push(event.type)};
    try{
        const {dbService,sync}=await setup({fetchData:async table=>table==='프로젝트관리'?[{id:'cloud',title:'서버 프로젝트'}]:[]});
        await sync.syncAllData();
        assert.equal(dbService.getAll('프로젝트관리')[0].id,'cloud');
        assert.equal(events.filter(type=>type==='jindan-work-cache-change').length,3);
        assert.ok(!events.includes('jindan-work-change'));
        assert.equal(dbService.getSyncQueue().length,0);
    }finally{globalThis.window=previousWindow;}
});

test('unsent local edits and deletions win pulls while server tombstones remove acknowledged records', async () => {
    const fail = async () => { throw new Error('Offline'); };
    const { dbService, sync } = await setup({ upsertData: fail, deleteData: fail, fetchData: async table => table === '프로젝트관리' ? [
        { id: 'edit', title: 'Old cloud' }, { id: 'gone', title: 'Old cloud' }, { id: 'remote-deleted', deleted: true }, { id: 'new-cloud' },
    ] : [] });
    dbService.setTable('프로젝트관리', [{ id: 'remote-deleted' }]);
    dbService.save('프로젝트관리', { id: 'edit', title: 'Latest local' });
    dbService.remove('프로젝트관리', 'gone');
    await assert.rejects(sync.syncAllData(), /Offline/);
    assert.deepEqual(dbService.getAll('프로젝트관리'), [{ id: 'edit', title: 'Latest local' }, { id: 'new-cloud' }]);
    assert.equal(dbService.getSyncQueue().length, 2);
});

test('successful Firebase deletes are acknowledged and obsolete board queues are not sent', async () => {
    const { dbService, sync, calls } = await setup();
    dbService.save('전체게시판', { id: 'legacy-board' });
    dbService.remove('프로젝트관리', 'removed');
    await sync.pushLocalToFirebase();
    assert.deepEqual(calls, [{ table: '프로젝트관리', id: 'removed', deleted: true }]);
    assert.equal(dbService.getSyncQueue().length, 1);
    assert.equal(dbService.getSyncQueue()[0].tableName, '전체게시판');
});

test('a new local revision during upload survives acknowledgment and concurrent pushes share one upload', async () => {
    let release, started;
    const began = new Promise(resolve => { started = resolve; });
    const paused = new Promise(resolve => { release = resolve; });
    const { dbService, sync, calls } = await setup({ upsertData: async (_table, row) => { calls.push(row.title); started(); await paused; } });
    dbService.save('프로젝트관리', { id: 'edit', title: 'First' });
    const first = sync.pushLocalToFirebase(), second = sync.pushLocalToFirebase();
    assert.equal(first, second); await began;
    dbService.save('프로젝트관리', { id: 'edit', title: 'Second' });
    release(); await first;
    assert.deepEqual(calls, ['First']);
    assert.equal(dbService.getSyncQueue().length, 1);
    assert.equal(dbService.getAll('프로젝트관리')[0].title, 'Second');
});

test('storage failures leave the prior record and queue intact for saves and deletes', async () => {
    const { dbService } = await setup();
    dbService.save('프로젝트관리', { id: 'keep', title: 'Original' });
    const oldQueue = localStorage.getItem('jindan_sync_queue'), setItem = localStorage.setItem;
    localStorage.setItem = (key, value) => { if (key === 'jindan_db_프로젝트관리') throw new Error('Storage full'); setItem(key, value); };
    assert.throws(() => dbService.save('프로젝트관리', { id: 'keep', title: 'Changed' }), /Storage full/);
    assert.throws(() => dbService.remove('프로젝트관리', 'keep'), /Storage full/);
    assert.equal(dbService.getAll('프로젝트관리')[0].title, 'Original');
    assert.equal(localStorage.getItem('jindan_sync_queue'), oldQueue);
});
