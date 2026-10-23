const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const folderType = 'application/vnd.google-apps.folder';
const tree = {
    id: 'root', name: 'Drive', mimeType: folderType,
    children: [{
        id: 'photos', name: '현장사진', mimeType: folderType,
        children: [
            { id: 'old-photo', name: '현장_A.png', modifiedTime: '2026-10-22T00:00:00Z' },
            { id: 'drawing', name: '시설배치도.dxf', modifiedTime: '2026-10-23T00:00:00Z' },
            { id: 'new-photo', name: '현장_B.png', modifiedTime: '2026-10-24T00:00:00Z' }
        ]
    }, { id: 'empty', name: '빈 폴더', mimeType: folderType, children: [] }]
};

async function startMain(mode) {
    const handlers = new Map();
    const windows = [];
    const app = new EventEmitter();
    app.whenReady = () => Promise.resolve();
    app.quit = () => {};
    class BrowserWindow extends EventEmitter {
        static getAllWindows() { return windows.filter(window => !window.destroyed); }
        constructor(options) {
            super();
            this.options = options;
            this.destroyed = false;
            this.minimized = false;
            this.focused = false;
            this.webContents = { sent: [], send: (...args) => this.webContents.sent.push(args) };
            windows.push(this);
        }
        loadURL(url) { this.url = url; return Promise.resolve(); }
        loadFile(file, options) { this.file = file; this.loadOptions = options; return Promise.resolve(); }
        isDestroyed() { return this.destroyed; }
        isMinimized() { return this.minimized; }
        restore() { this.minimized = false; }
        show() { this.visible = true; }
        hide() { this.visible = false; this.focused = false; }
        focus() { windows.forEach(window => { window.focused = window === this; }); }
        destroy() { this.destroyed = true; this.emit('closed'); }
        close() {
            const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
            this.emit('close', event);
            if (!event.defaultPrevented) this.destroy();
        }
    }
    const ipcMain = new EventEmitter();
    ipcMain.handle = (name, handler) => handlers.set(name, handler);
    const updater = new EventEmitter();
    updater.checkForUpdatesAndNotify = () => {};
    const log = { info() {}, error() {}, transports: { file: {} } };
    const dependencies = {
        electron: { app, BrowserWindow, ipcMain },
        path,
        'electron-updater': { autoUpdater: updater },
        'electron-log': log
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'main.cjs'), 'utf8'), {
        require: name => dependencies[name],
        __dirname: root,
        process: { env: { NODE_ENV: mode }, platform: 'win32' },
        URL, setTimeout, fetch: async () => ({ ok: true })
    });
    await new Promise(resolve => setImmediate(resolve));
    windows[0].focus();
    windows[0].emit('ready-to-show');
    await new Promise(resolve => setImmediate(resolve));
    return { handlers, windows, main: windows[0], app };
}

for (const mode of ['development', 'production']) {
    test(`${mode}: preloads invisibly, reuses the viewer after close, and follows app shutdown`, async () => {
        const { handlers, windows, main } = await startMain(mode);
        const viewer = windows[1];
        assert.equal(windows.length, 2, 'Viewer should preload before a file is selected');
        assert.ok(!viewer.visible);
        assert.equal(main.focused, true);
        assert.equal(handlers.get('get-image-viewer-data')({ sender: viewer.webContents }), undefined);
        const open = handlers.get('open-image-viewer');
        const data = { tree, fileId: 'old-photo' };
        await open({ sender: main.webContents }, data);
        assert.ok(viewer);
        assert.ok(!viewer.options.parent);
        assert.ok(!viewer.options.modal);
        assert.ok(!viewer.options.alwaysOnTop);
        assert.ok(!viewer.options.skipTaskbar);
        assert.equal(viewer.options.webPreferences.contextIsolation, true);
        assert.equal(viewer.options.webPreferences.nodeIntegration, false);
        if (mode === 'development') {
            assert.equal(new URL(viewer.url).searchParams.get('view'), 'image-viewer');
        } else {
            assert.equal(main.file, path.join(root, 'dist/index.html'));
            assert.equal(viewer.file, path.join(root, 'dist/index.html'));
            assert.equal(viewer.loadOptions.query.view, 'image-viewer');
        }
        assert.equal(handlers.get('get-image-viewer-data')({ sender: viewer.webContents }).fileId, 'old-photo');
        viewer.emit('ready-to-show');
        assert.equal(viewer.focused, true);
        assert.equal(main.destroyed, false);

        viewer.minimized = true;
        await open({ sender: main.webContents }, { tree, fileId: 'drawing' });
        assert.equal(windows.length, 2);
        assert.equal(viewer.minimized, false);
        assert.equal(viewer.webContents.sent.at(-1)[1].fileId, 'drawing');
        handlers.get('focus-main-window')({ sender: viewer.webContents });
        assert.equal(main.focused, true);
        assert.equal(viewer.destroyed, false);

        viewer.close();
        assert.equal(main.destroyed, false);
        assert.equal(viewer.destroyed, false, 'Closing preserves the warm renderer and PNG cache');
        assert.equal(viewer.visible, false);
        await open({ sender: main.webContents }, data);
        assert.equal(windows.length, 2);
        assert.equal(viewer.visible, true);
        main.close();
        assert.equal(viewer.destroyed, true);
    });
}

test('application quit destroys the preloaded viewer instead of hiding it', async () => {
    const { windows, app } = await startMain('development');
    app.emit('before-quit');
    windows[1].close();
    assert.equal(windows[1].destroyed, true);
});

test('viewer IPC rejects unrelated windows', async () => {
    const { handlers, main } = await startMain('development');
    await assert.rejects(handlers.get('open-image-viewer')({ sender: {} }, { tree, fileId: 'drawing' }));
    await assert.rejects(handlers.get('open-image-viewer')({ sender: main.webContents }, { tree, fileId: null }));
    assert.throws(() => handlers.get('get-image-viewer-data')({ sender: main.webContents }));
    assert.throws(() => handlers.get('focus-main-window')({ sender: {} }));
});

test('preload subscription can be cleaned up and keeps the IPC event private', () => {
    let bridge;
    const ipcRenderer = new EventEmitter();
    vm.runInNewContext(fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8'), {
        require: () => ({ contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } }, ipcRenderer })
    });
    const values = [];
    const unsubscribe = bridge.receive('image-viewer-data', data => values.push(data));
    ipcRenderer.emit('image-viewer-data', { sender: 'private' }, { fileId: 'drawing' });
    assert.deepEqual(values, [{ fileId: 'drawing' }]);
    unsubscribe();
    assert.equal(ipcRenderer.listenerCount('image-viewer-data'), 0);
    assert.equal(bridge.receive('untrusted-channel', () => {}), undefined);
});

test('mixed photo/CAD selection opens the clicked file by ID, including its folder', async () => {
    const gallery = await import('../src/services/galleryData.js');
    const transform = await import('../src/hooks/useImageTransform.js');
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const compiled = transformSync(fs.readFileSync(path.join(root, 'src/components/ImageViewer.jsx'), 'utf8'), {
        loader: 'jsx', format: 'cjs', jsx: 'automatic'
    }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports,
        require: name => {
            if (name.endsWith('/galleryData')) return gallery;
            if (name.endsWith('/driveService')) return {};
            if (name.endsWith('/viewerPreviewService')) return {};
            if (name.endsWith('/useImageTransform')) return transform;
            if (name.endsWith('/cadPreviewService')) return { isCadFile: file => /\.(dwg|dxf)$/i.test(file.name) };
            return require(name);
        }
    });
    for (const [fileId, name, position] of [
        ['old-photo', '현장_A.png', '3 / 3'],
        ['drawing', '시설배치도.dxf', '2 / 3'],
        ['new-photo', '현장_B.png', '1 / 3']
    ]) {
        const html = renderToStaticMarkup(React.createElement(module.exports.default, { tree, initialFileId: fileId }));
        assert.ok(html.includes(`<strong>${name}</strong>`));
        assert.ok(html.includes(position));
        assert.ok(html.includes('Drive / 현장사진'));
        assert.ok(!html.includes('aria-modal'));
    }
});

test('web preview opens a separate window and reports blocked popups', async () => {
    const source = fs.readFileSync(path.join(root, 'src/services/imageViewerService.js'), 'utf8');
    const module = { exports: {} };
    const opened = [];
    const window = {
        location: { href: 'http://localhost:3000/' },
        open: (url, name, features) => { opened.push({ url, name, features }); return { focus() {} }; }
    };
    vm.runInNewContext(transformSync(source, { format: 'cjs' }).code, { module, exports: module.exports, window, URL });
    await module.exports.openImageViewer(tree, 'drawing');
    assert.equal(new URL(opened[0].url).searchParams.get('fileId'), 'drawing');
    assert.ok(opened[0].features.includes('resizable=yes'));
    window.open = () => null;
    await assert.rejects(module.exports.openImageViewer(tree, 'drawing'), /팝업/);
});
