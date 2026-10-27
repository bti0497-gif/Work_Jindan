const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const { createReportCollector } = require('../report-collector.cjs');
const scope = { userId: 'user', projectId: 'site-a', discipline: 'electrical', sourceSha256: 'a'.repeat(64) };
function setup() {
    const windows = [];
    class Window extends EventEmitter {
        constructor(options) {
            super(); this.options = options; this.webContents = new EventEmitter();
            this.webContents.setWindowOpenHandler = handler => { this.popup = handler; };
            this.webContents.getURL = () => this.url;
            this.webContents.executeJavaScript = async code => { this.code = code; this.reads = (this.reads || 0) + 1; return this.response; };
            windows.push(this);
        }
        async loadURL(url) { this.url = url; }
        isDestroyed() { return !!this.destroyed; }
        isMinimized() { return false; }
        show() {} focus() {}
        destroy() { this.destroyed = true; this.emit('closed'); }
    }
    return { windows, service: createReportCollector({ BrowserWindow: Window }) };
}
test('source windows are isolated per user/project/template and read nothing until capture is requested', async () => {
    const { service, windows } = setup();
    await service.open(scope); await service.open(scope);
    assert.equal(windows.length, 1); assert.equal(windows[0].reads, undefined);
    assert.equal(windows[0].options.webPreferences.preload, undefined);
    assert.equal(windows[0].options.webPreferences.nodeIntegration, false);
    await service.open({ ...scope, projectId: 'site-b' });
    await service.open({ ...scope, userId: 'other' });
    assert.equal(new Set(windows.map(window => window.options.webPreferences.partition)).size, 3);
    await assert.rejects(service.open({ ...scope, sourceSha256: '../bad' }), /프로젝트/);
    service.closeAll(); assert.ok(windows.every(window => window.destroyed));
});
test('login pages and unrelated origins are rejected; captured sources strip query tokens and stay project-bound', async () => {
    const { service, windows } = setup();
    await assert.rejects(service.capture(scope), /먼저/);
    await service.open(scope);
    const window = windows[0]; window.response = { loginRequired: true };
    await assert.rejects(service.capture(scope), /로그인/);
    let prevented = false;
    window.webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://example.com/');
    assert.equal(prevented, true);
    assert.deepEqual(window.popup({ url: 'https://example.com/' }), { action: 'deny' });
    window.url = 'https://pp.kepco.co.kr/bills?token=private-session';
    window.response = { title: '월별 청구요금', tables: [{ index: 0, caption: '', rows: [['사용량(kWh)'], ['100,000']] }] };
    const capture = await service.capture(scope);
    assert.equal(capture.projectId, 'site-a'); assert.equal(capture.contentHash.length, 64);
    assert.equal(capture.url, 'https://pp.kepco.co.kr/bills');
    assert.equal(JSON.stringify(capture).includes('private-session'), false);
    // Exercise the actual DOM reader with a password input that must never be read.
    const password = { getBoundingClientRect: () => ({ width: 0, height: 0 }), get value() { throw new Error('Credential access'); } };
    const table = { getBoundingClientRect: () => ({ width: 100, height: 100 }), caption: null, getAttribute: () => '', rows: [{ cells: [{ innerText: '100,000' }] }] };
    const document = { title: '조회', querySelectorAll: selector => selector === 'input[type="password"]' ? [password] : selector === 'table' ? [table] : [] };
    const read = vm.runInNewContext(window.code, { document, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) });
    assert.equal(read.tables[0].rows[0][0], '100,000');
});
