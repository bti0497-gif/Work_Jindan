const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// 로그 설정
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

let mainWindow;
let imageViewerWindow;
let imageViewerData;
let imageViewerLoading;
let imageViewerRequestId = 0;
let isQuitting = false;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:3000';
let reportAi;
let reportCollector;
function getReportCollector() {
    if (!reportCollector) reportCollector = require('./report-collector.cjs').createReportCollector({ BrowserWindow });
    return reportCollector;
}
const reportAiRequests = new Map();
function getReportAi() {
    if (!reportAi) reportAi = require('./report-ai.cjs').createReportAiService({
        userDataPath: app.getPath('userData'), safeStorage,
        envFile: app.isPackaged ? null : path.join(__dirname, '.env.local'),
    });
    return reportAi;
}
function requireReportCaller(event) {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unsupported report AI request');
}
ipcMain.handle('report-ai-status', event => { requireReportCaller(event); return getReportAi().status(); });
ipcMain.handle('report-ai-configure', (event, config) => { requireReportCaller(event); return getReportAi().configure(config); });
ipcMain.handle('report-ai-models', event => { requireReportCaller(event); return getReportAi().listModels(); });
ipcMain.handle('report-ai-run', async (event, data) => {
    requireReportCaller(event);
    if (!data || typeof data.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.id) || reportAiRequests.has(data.id)) throw new Error('Invalid report AI request ID');
    const controller = new AbortController();
    reportAiRequests.set(data.id, controller);
    try { return await getReportAi().execute(data.request, controller.signal); }
    finally { reportAiRequests.delete(data.id); }
});
ipcMain.handle('report-ai-cancel', (event, data) => { requireReportCaller(event); reportAiRequests.get(data?.id)?.abort(); });
ipcMain.handle('report-source-open', (event, scope) => { requireReportCaller(event); return getReportCollector().open(scope); });
ipcMain.handle('report-source-capture', (event, scope) => { requireReportCaller(event); return getReportCollector().capture(scope); });

function loadAppPage(window, query = {}) {
    if (process.env.NODE_ENV === 'development') {
        const url = new URL(devServerUrl);
        Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
        return window.loadURL(url.toString());
    }
    return window.loadFile(path.join(__dirname, 'dist/index.html'), { query });
}

function focusWindow(window) {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
}

function prepareImageViewer() {
    if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
        return imageViewerLoading;
    }

    // An independent top-level window can be switched with the app using Alt+Tab.
    const viewer = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 620,
        minHeight: 420,
        resizable: true,
        minimizable: true,
        maximizable: true,
        title: '사진·도면 뷰어',
        show: false,
        backgroundColor: '#101012',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'build/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });
    imageViewerWindow = viewer;
    // Closing the viewer hides it; its engine and PNG cache stay warm while
    // the main app is open. It still behaves as an independent top-level window.
    viewer.on('close', event => {
        if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
            event.preventDefault();
            viewer.hide();
        }
    });
    viewer.on('closed', () => {
        if (imageViewerWindow === viewer) {
            imageViewerWindow = null;
            imageViewerData = null;
            imageViewerLoading = null;
        }
    });
    imageViewerLoading = loadAppPage(viewer, { view: 'image-viewer' }).then(() => viewer).catch(error => {
        if (!viewer.isDestroyed()) viewer.destroy();
        throw error;
    });
    return imageViewerLoading;
}

ipcMain.handle('open-image-viewer', async (event, data) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unsupported viewer request');
    if (!data?.tree || typeof data.fileId !== 'string') throw new Error('Invalid viewer data');
    imageViewerData = { ...data, requestId: ++imageViewerRequestId };
    const viewer = await prepareImageViewer();
    if (viewer.isDestroyed()) return;
    viewer.webContents.send('image-viewer-data', imageViewerData);
    focusWindow(viewer);
});

ipcMain.handle('get-image-viewer-data', event => {
    if (event.sender !== imageViewerWindow?.webContents) throw new Error('Unsupported viewer request');
    return imageViewerData;
});

ipcMain.handle('focus-main-window', event => {
    if (event.sender !== imageViewerWindow?.webContents) throw new Error('Unsupported window request');
    focusWindow(mainWindow);
});

async function waitForDevServer() {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(devServerUrl);
            if (response.ok) return;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    throw new Error(`Vite dev server did not become ready at ${devServerUrl}`);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        frame: false, // 커스텀 타이틀바 사용
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true, // contextBridge를 사용하기 위해 true로 변경
            preload: path.join(__dirname, 'preload.cjs')
        },
        icon: path.join(__dirname, 'build/icon.ico')
    });

    loadAppPage(mainWindow).catch(error => log.error('Failed to load app:', error));
    mainWindow.on('closed', () => {
        mainWindow = null;
        reportCollector?.closeAll();
        if (imageViewerWindow && !imageViewerWindow.isDestroyed()) imageViewerWindow.close();
    });

    // Debugging: Open DevTools in all modes
    // mainWindow.webContents.openDevTools();

    // 창 닫기/최소화/최대화 이벤트 처리
    ipcMain.on('minimize-window', () => mainWindow.minimize());
    ipcMain.on('maximize-window', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('close-window', () => mainWindow.close());

    // 업데이트 이벤트 전송
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Prepare the engine without delaying or stealing focus from the app.
        prepareImageViewer().catch(error => log.error('Viewer preload failed:', error));
        if (process.env.NODE_ENV !== 'development') {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });
}

// 앱 준비 완료
app.whenReady().then(() => {
    const startApp = async () => {
        if (process.env.NODE_ENV === 'development') await waitForDevServer();
        createWindow();
    };

    startApp().catch(error => {
        log.error('Failed to start app:', error);
        app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => { isQuitting = true; reportCollector?.closeAll(); for (const request of reportAiRequests.values()) request.abort(); });

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 자동 업데이트 이벤트
autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    if (mainWindow) mainWindow.webContents.send('update-status', 'checking');
});

autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
    if (mainWindow) mainWindow.webContents.send('update-status', 'latest');
});

autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater. ' + err);
    if (mainWindow) mainWindow.webContents.send('update-error', err);
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    log.info(log_message);
    if (mainWindow) mainWindow.webContents.send('download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded');
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});
