const { test } = require('node:test');
const assert = require('node:assert/strict');

async function setup() {
    const { createCadEngine } = await import('../src/services/cadEngine.js');
    const workers = [];
    const engine = createCadEngine(() => {
        const worker = {
            sent: [], terminated: false,
            postMessage(data) { this.sent.push(data); },
            terminate() { this.terminated = true; },
            ready() { this.onmessage({ data: { ready: true } }); },
            result(preview = { svg: '<svg/>', width: 10, height: 10 }) {
                this.onmessage({ data: { id: this.sent.at(-1).id, preview } });
            }
        };
        workers.push(worker);
        return worker;
    });
    return { engine, workers };
}

test('warm-up loads once; multiple drawings reuse the same imported engine', async () => {
    const { engine, workers } = await setup();
    const firstWarm = engine.warm();
    assert.equal(firstWarm, engine.warm());
    assert.equal(workers.length, 1);
    workers[0].ready();
    await firstWarm;
    for (const name of ['a.dwg', 'b.dxf']) {
        const pending = engine.render(name, new ArrayBuffer(8));
        assert.equal(workers[0].sent.at(-1).name, name);
        workers[0].result();
        await pending;
    }
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, false);
    engine.dispose();
});

test('requests arriving during startup wait until the engine is ready', async () => {
    const { engine, workers } = await setup();
    const pending = engine.render('a.dwg', new ArrayBuffer(8));
    assert.equal(workers[0].sent.length, 0);
    workers[0].ready();
    assert.equal(workers[0].sent.length, 1);
    workers[0].result();
    await pending;
    engine.dispose();
});

test('cancelling a queued drawing preserves the active engine', async () => {
    const { engine, workers } = await setup();
    const warm = engine.warm();
    workers[0].ready();
    await warm;
    const first = engine.render('a.dwg', new ArrayBuffer(8));
    const controller = new AbortController();
    const second = engine.render('b.dwg', new ArrayBuffer(8), controller.signal);
    controller.abort();
    await assert.rejects(second, { name: 'AbortError' });
    assert.equal(workers[0].terminated, false);
    workers[0].result();
    await first;
    assert.equal(workers[0].sent.length, 1);
    engine.dispose();
});

test('cancelling an active parse replaces the worker and resumes the queued drawing', async () => {
    const { engine, workers } = await setup();
    const warm = engine.warm();
    workers[0].ready();
    await warm;
    const controller = new AbortController();
    const first = engine.render('a.dwg', new ArrayBuffer(8), controller.signal);
    const second = engine.render('b.dwg', new ArrayBuffer(8));
    controller.abort();
    await assert.rejects(first, { name: 'AbortError' });
    assert.equal(workers[0].terminated, true);
    assert.equal(workers.length, 2);
    workers[1].ready();
    assert.equal(workers[1].sent[0].name, 'b.dwg');
    workers[1].result();
    await second;
    engine.dispose();
});

test('a corrupt drawing does not unload the ready engine', async () => {
    const { engine, workers } = await setup();
    const first = engine.render('broken.dwg', new ArrayBuffer(8));
    workers[0].ready();
    workers[0].onmessage({ data: { id: workers[0].sent[0].id, error: 'bad drawing' } });
    await assert.rejects(first, /bad drawing/);
    const second = engine.render('valid.dwg', new ArrayBuffer(8));
    workers[0].result();
    await second;
    assert.equal(workers.length, 1);
    engine.dispose();
});

test('a failed engine can be initialized again without stale failures killing its replacement', async () => {
    const { engine, workers } = await setup();
    const firstWarm = engine.warm();
    const first = engine.render('a.dwg', new ArrayBuffer(8));
    workers[0].onerror();
    const replacementWarm = engine.warm();
    workers[1].ready();
    await assert.rejects(firstWarm);
    await assert.rejects(first);
    await replacementWarm;
    const second = engine.render('b.dwg', new ArrayBuffer(8));
    workers[1].result();
    await second;
    assert.equal(workers[1].terminated, false);
    engine.dispose();
});
