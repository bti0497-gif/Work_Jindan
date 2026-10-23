const { test } = require('node:test');
const assert = require('node:assert/strict');
const cacheModule = () => import('../src/services/previewCache.js');

test('reuses the raster blob and shares concurrent requests', async () => {
    const { createPreviewCache } = await cacheModule();
    const cache = createPreviewCache();
    let calls = 0;
    const produce = async () => { calls += 1; return new Blob(['png']); };
    const [first, concurrent] = await Promise.all([cache.load('drawing-v1', produce), cache.load('drawing-v1', produce)]);
    assert.equal(first, concurrent);
    assert.equal(await cache.load('drawing-v1', produce), first);
    assert.equal(calls, 1);
    await cache.load('drawing-v2', produce);
    assert.equal(calls, 2);
});

test('LRU eviction respects both entry and byte limits', async () => {
    const { createPreviewCache } = await cacheModule();
    const cache = createPreviewCache({ maxEntries: 2, maxBytes: 6 });
    let calls = 0;
    const produce = async () => { calls += 1; return new Blob(['png']); };
    await cache.load('a', produce);
    await cache.load('b', produce);
    await cache.load('a', produce);
    await cache.load('c', produce);
    await cache.load('b', produce);
    assert.equal(calls, 4);
    const large = async () => { calls += 1; return new Blob(['too large']); };
    await cache.load('large', large);
    await cache.load('large', large);
    assert.equal(calls, 6);
});

test('one aborted subscriber does not cancel another subscriber', async () => {
    const { createPreviewCache } = await cacheModule();
    const cache = createPreviewCache();
    const first = new AbortController();
    let finish;
    let workSignal;
    const produce = signal => { workSignal = signal; return new Promise(resolve => { finish = resolve; }); };
    const abandoned = cache.load('a', produce, first.signal);
    const waiting = cache.load('a', produce);
    await new Promise(resolve => setImmediate(resolve));
    first.abort();
    await assert.rejects(abandoned, { name: 'AbortError' });
    assert.equal(workSignal.aborted, false);
    finish(new Blob(['png']));
    assert.equal((await waiting).size, 3);
});

test('abandoning a drawing cancels its work and permits an immediate retry', async () => {
    const { createPreviewCache } = await cacheModule();
    const cache = createPreviewCache();
    const controller = new AbortController();
    let workSignal;
    const abandoned = cache.load('a', signal => {
        workSignal = signal;
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }, controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(abandoned, { name: 'AbortError' });
    assert.equal(workSignal.aborted, true);
    const result = await cache.load('a', async () => new Blob(['retry']));
    assert.equal(result.size, 5);
});

test('failed conversions are retried instead of being cached', async () => {
    const { createPreviewCache } = await cacheModule();
    const cache = createPreviewCache();
    await assert.rejects(cache.load('a', async () => { throw new Error('bad file'); }));
    const result = await cache.load('a', async () => new Blob(['retry']));
    assert.equal(result.size, 5);
});
