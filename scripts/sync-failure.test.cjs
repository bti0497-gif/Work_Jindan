const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const loadSource = async (path, prefix) => {
    const code = (await fs.readFile(path, 'utf8')).replace(/^import .*;\r?\n/gm, '');
    const quietConsole = 'const console = { log() {}, warn() {}, error() {} };\n';
    return import(`data:text/javascript;base64,${Buffer.from(quietConsole + prefix + code).toString('base64')}#${Date.now()}`);
};

test('Supabase failures reject rather than look like an empty cloud table or successful write', async () => {
    const failure = new Error('Network unavailable');
    globalThis.__supabaseFailureTest = {
        from: () => ({
            select: () => ({ order: async () => ({ error: failure }) }),
            upsert: async () => ({ error: failure }),
        }),
    };
    const { supabaseService } = await loadSource('src/services/supabaseService.js', 'const supabase = globalThis.__supabaseFailureTest;\n');
    await assert.rejects(supabaseService.fetchData('회원관리'), /Network unavailable/);
    await assert.rejects(supabaseService.upsertData('회원관리', { person_id: 'member' }), /Network unavailable/);
    delete globalThis.__supabaseFailureTest;
});

test('failed sync preserves local rows and pending writes; migrated boards are excluded', async () => {
    const local = [{ id: 'keep-me' }];
    const queue = [{ tableName: '전체게시판', id: 'old-post' }, { tableName: '프로젝트관리', id: 'keep-me' }];
    const fetched = [];
    const pushed = [];
    const replaced = [];
    const removed = [];
    globalThis.__syncFailureTest = {
        dbService: {
            getSyncQueue: () => queue, getById: () => local[0],
            getLastSync: () => '1970-01-01', setLastSync: () => {},
            setTable: (table, rows) => replaced.push({ table, rows }),
            removeFromSyncQueue: (table, id) => removed.push({ table, id }),
        },
        supabaseService: {
            fetchData: async table => { fetched.push(table); throw new Error('Offline'); },
            upsertData: async table => { pushed.push(table); throw new Error('Offline'); },
        },
        getSystemFolderIds: () => ({}), fetchTableLogs: async () => [],
        saveJsonData: async () => {}, saveActionLog: async () => {},
    };
    const { syncAllData } = await loadSource('src/services/syncService.js', 'const { dbService, supabaseService, getSystemFolderIds, fetchTableLogs, saveJsonData, saveActionLog } = globalThis.__syncFailureTest;\n');
    await syncAllData();
    assert.equal(fetched.includes('전체게시판'), false);
    assert.equal(fetched.includes('회원관리'), false);
    assert.equal(fetched.includes('게시판댓글'), false);
    assert.deepEqual(pushed, ['프로젝트관리']);
    assert.deepEqual(replaced, []);
    assert.deepEqual(removed, []);
    assert.equal(queue.length, 2);
    delete globalThis.__syncFailureTest;
});
