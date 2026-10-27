const { createHash } = require('node:crypto');
const HOME = 'https://pp.kepco.co.kr/';
const allowed = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'kepco.co.kr' || url.hostname.endsWith('.kepco.co.kr')); }
    catch { return false; }
};
function scopeKey(scope) {
    if (!scope || !['userId', 'projectId', 'discipline', 'sourceSha256'].every(key => typeof scope[key] === 'string' && scope[key].length > 0 && scope[key].length <= 200) || !/^[a-f0-9]{64}$/.test(scope.sourceSha256)) throw new Error('외부 자료를 연결할 프로젝트·분야·보고서를 확인하세요.');
    return createHash('sha256').update(JSON.stringify([scope.userId, scope.projectId, scope.discipline, scope.sourceSha256])).digest('hex');
}
// Read only visible report tables. Credentials, form inputs, cookies and hidden API responses are never exported.
const READ_TABLES = `(() => {
    const visible = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
    if (Array.from(document.querySelectorAll('input[type="password"]')).some(visible)) return { loginRequired: true };
    const tables = Array.from(document.querySelectorAll('table')).filter(visible).slice(0, 40).map((table, index) => ({
        index, caption: (table.caption?.innerText || table.getAttribute('aria-label') || '').slice(0, 300),
        rows: Array.from(table.rows).slice(0, 1500).map(row => Array.from(row.cells).map(cell => (cell.innerText || '').trim().slice(0, 2000)))
    })).filter(table => table.rows.some(row => row.some(text => /[0-9]/.test(text))));
    const context = Array.from(document.querySelectorAll('h1,h2,h3,select')).filter(visible).slice(0,40).map(element =>
        (element.tagName === 'SELECT' ? Array.from(element.selectedOptions).map(option => option.textContent).join(' / ') : element.innerText || '').trim().slice(0,300));
    return { title: document.title.slice(0, 300), context, tables };
})()`;

function createReportCollector({ BrowserWindow }) {
    const windows = new Map();
    const open = async scope => {
        const key = scopeKey(scope);
        let window = windows.get(key);
        if (!window || window.isDestroyed()) {
            window = new BrowserWindow({ width: 1200, height: 850, title: '보고서 자료 수집 · 한전 파워플래너', autoHideMenuBar: true,
                webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: `report-source-${key}` } });
            windows.set(key, window);
            window.on('closed', () => { if (windows.get(key) === window) windows.delete(key); });
            window.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
            window.webContents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault(); });
            window.webContents.setWindowOpenHandler(({ url }) => {
                if (allowed(url)) window.loadURL(url).catch(() => {});
                return { action: 'deny' };
            });
            try { await window.loadURL(HOME); }
            catch { if (!window.isDestroyed()) window.destroy(); throw new Error('한전 파워플래너를 열지 못했습니다. 인터넷 연결과 사이트 접속 상태를 확인하세요.'); }
        }
        if (window.isMinimized()) window.restore();
        window.show(); window.focus();
        return { provider: 'kepco', opened: true };
    };
    const capture = async scope => {
        const key = scopeKey(scope), window = windows.get(key);
        if (!window || window.isDestroyed()) throw new Error('이 프로젝트의 한전 조회 창을 먼저 여세요.');
        const url = window.webContents.getURL();
        if (!allowed(url)) throw new Error('한전 공식 조회 화면에서만 수집할 수 있습니다.');
        const data = await window.webContents.executeJavaScript(READ_TABLES);
        if (data?.loginRequired) throw new Error('한전 조회 창에서 로그인한 뒤 필요한 사용량·요금 화면으로 이동하세요.');
        if (!Array.isArray(data?.tables) || !data.tables.length) throw new Error('수집할 조회 표가 없습니다. 로그인 후 사용량·요금 표가 표시된 화면으로 이동하세요.');
        if (JSON.stringify(data).length > 1000000) throw new Error('조회 자료가 너무 많습니다. 연도·월별로 나누어 수집하세요.');
        const contentHash = createHash('sha256').update(JSON.stringify({ url, ...data })).digest('hex');
        const location = new URL(url);
        return { ...data, provider: 'kepco', url: location.origin + location.pathname, contentHash, capturedAt: new Date().toISOString(),
            projectId: scope.projectId, discipline: scope.discipline, sourceSha256: scope.sourceSha256 };
    };
    const closeAll = () => { for (const window of windows.values()) if (!window.isDestroyed()) window.destroy(); windows.clear(); };
    return { open, capture, closeAll };
}
module.exports = { createReportCollector };
