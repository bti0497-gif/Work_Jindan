const path = require('node:path');
const asar = require('@electron/asar');

module.exports = async context => {
    const resources = context.electronPlatformName === 'darwin'
        ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(context.appOutDir, 'resources');
    const archive = path.join(resources, 'app.asar');
    const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
    const required = ['/main.cjs', '/preload.cjs', '/report-ai.cjs', '/report-collector.cjs', '/dist/index.html', '/build/icon.ico', '/node_modules/electron-updater/package.json'];
    const missing = required.filter(file => !files.includes(file));
    if (!files.some(file => /^\/dist\/assets\/cadPreview\.worker-.*\.js$/.test(file))) missing.push('CAD worker');
    if (!files.some(file => /^\/dist\/assets\/report\.worker-.*\.js$/.test(file))) missing.push('Report worker');
    if (!files.some(file => /^\/dist\/assets\/ReportWorkspace-.*\.js$/.test(file))) missing.push('Report workspace');
    if (missing.length) throw new Error(`Packaged app is incomplete: ${missing.join(', ')}`);
    const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
    if (packaged.version !== context.packager.appInfo.version) throw new Error('Packaged app version does not match the installer version');
    console.log(`Packaged app verified: ${packaged.version}, UI, CAD and report workers, AI and collector included.`);
};
