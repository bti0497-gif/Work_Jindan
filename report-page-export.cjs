// The PDF is printed from the same validated object model used by the editor.
module.exports.printPageTrial = async function printPageTrial({ BrowserWindow }, input) {
    const { validatePageTrial, pageTrialHtml } = await import('./src/services/report/pageReproduction.js');
    const model = validatePageTrial(input);
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true } });
    if (process.env.REPORT_PAGE_DEBUG) window.webContents.on('console-message', (_event, _level, message) => console.log(message.slice(0, 500)));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    try {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageTrialHtml(model))}`);
        const families = [...new Set(model.objects.filter(o => o.type === 'text').map(o => o.fontFamily))];
        const fonts = await window.webContents.executeJavaScript(`Promise.all(${JSON.stringify(families)}.map(family => document.fonts.load('20px '+JSON.stringify(family)))).then(() => document.fonts.ready).then(() => [...document.fonts].map(f => ({family:f.family,status:f.status})))`);
        if (model.fonts.length && (!fonts.length || fonts.some(font => font.status !== 'loaded'))) throw new Error('재현 페이지의 글꼴을 불러오지 못했습니다.');
        return await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    } finally { if (!window.isDestroyed()) window.destroy(); }
};
