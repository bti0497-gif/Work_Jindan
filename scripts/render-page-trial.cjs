// Local export harness uses the production PDF renderer, never the reference PDF.
const fs = require('node:fs/promises');
const path = require('node:path');
async function run() {
    const args = process.argv.slice(2), input = args[0], output = args[1];
    if (!input || !output || path.resolve(input) === path.resolve(output)) throw new Error('Usage: node scripts/render-page-trial.cjs model.json output.pdf');
    if (!process.versions.electron) {
        const { spawn } = require('node:child_process');
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(require('electron'), [__filename, ...args], { env, stdio: 'inherit', windowsHide: true });
        process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
        return;
    }
    const { app, BrowserWindow } = require('electron');
    app.on('window-all-closed', () => {});
    await app.whenReady();
    try {
        const model = JSON.parse(await fs.readFile(input, 'utf8'));
        const bytes = await require('../report-page-export.cjs').printPageTrial({ BrowserWindow }, model);
        await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true }); await fs.writeFile(output, bytes);
        console.log(JSON.stringify({ output: path.resolve(output), bytes: bytes.length, renderer: 'editable-page-svg-chromium', referencePdfReadByRenderer: false }));
    } finally { app.quit(); }
}
run().catch(error => { console.error(error); if (process.versions.electron) require('electron').app.exit(1); else process.exitCode = 1; });
