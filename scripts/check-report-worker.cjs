// Run after npm run build. Optional argument: a local HWP/HWPX file (never uploaded).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { zipSync, strToU8 } = require('fflate');

async function main() {
    const assets = path.join(__dirname, '..', 'dist', 'assets');
    const file = fs.readdirSync(assets).find(name => /^report\.worker-.*\.js$/.test(name));
    assert.ok(file, 'Build the application before checking its worker.');
    const source = process.argv.slice(2).find(argument => !argument.startsWith('--'));
    const input = source ? new Uint8Array(fs.readFileSync(source)) : zipSync({ 'Contents/section0.xml': strToU8('<sec><p><run><t>worker test &amp; text</t></run></p></sec>') });
    const execute = data => new Promise(resolve => {
        const self = { postMessage: resolve };
        // Deliberately omit Node globals (Buffer, process, require) used by some OLE libraries.
        const context = vm.createContext({ self, crypto: webcrypto, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView, setTimeout, clearTimeout });
        vm.runInContext(fs.readFileSync(path.join(assets, file), 'utf8'), context);
        self.onmessage({ data });
    });
    const message = await execute({ bytes: input, filename: 'worker-smoke' });
    assert.equal(message.error, undefined, message.error);
    assert.ok(message.document.paragraphs.length);
    assert.equal(message.document.source.sha256.length, 64);
    let nativeWriteVerified = false;
    let nativeCollectionVerified = false;
    if (process.argv.includes('--write')) {
        assert.equal(message.document.format, 'hwpx');
        const engine = await import('../src/services/report/reportEngine.js');
        const paragraph = message.document.paragraphs.find(p => !p.tableId && p.textSlots?.length === 1 && p.textSlots[0].plain);
        assert.ok(paragraph);
        let workspace = engine.createWorkspace({ id: 'worker-test', title: 'Worker test' }, message.document);
        workspace = engine.setField(workspace, { id: paragraph.id, label: 'worker-test', group: 'test', type: 'text', required: true, reference: paragraph.text, unit: '', binding: { sourceSha256: workspace.source.sha256, paragraphId: paragraph.id, ...paragraph.anchor } });
        workspace = engine.confirmSchema(workspace);
        workspace = engine.setValue(workspace, paragraph.id, 'worker-native-check');
        const output = await execute({ action: 'write-native', bytes: input, workspace, mode: 'draft' });
        assert.equal(output.error, undefined, output.error);
        const roundtrip = await execute({ bytes: output.native.bytes, filename: 'worker-written.hwpx' });
        assert.equal(roundtrip.error, undefined, roundtrip.error);
        assert.ok(roundtrip.document.paragraphs.some(p => p.text === 'worker-native-check'));
        nativeWriteVerified = true;
    }
    if (process.argv.includes('--collection')) {
        const engine = await import('../src/services/report/reportEngine.js');
        const paragraph = message.document.paragraphs.find(p => !p.tableId && p.textSlots?.length === 1 && p.textSlots[0].plain);
        assert.ok(paragraph);
        let workspace = engine.createWorkspace({ id: 'worker-survey', title: 'Worker collection check' }, message.document);
        workspace = engine.confirmSchema(engine.setField(workspace, { id: paragraph.id, label: 'new input', group: 'survey', type: 'text', required: true, reference: paragraph.text, unit: '', binding: { sourceSha256: workspace.source.sha256, paragraphId: paragraph.id } }));
        const output = await execute({ action: 'export-collection', bytes: input, workspace });
        assert.equal(output.error, undefined, output.error);
        const parsed = await execute({ bytes: output.collectionFile.bytes, filename: 'survey.hwpx' });
        assert.equal(parsed.error, undefined, parsed.error);
        const table = parsed.document.tables[0], cell = table.cells.find(cell => cell.fieldName?.startsWith('JDF_'));
        assert.ok(cell);
        let formState = engine.createWorkspace({ id: 'fill-worker-form' }, parsed.document);
        const field = engine.proposeCellField(parsed.document, table, cell);
        formState = engine.confirmSchema(engine.setField(formState, field));
        formState = engine.setValue(formState, field.id, 'worker-collected-input');
        const filled = await execute({ action: 'write-native', bytes: output.collectionFile.bytes, workspace: formState, mode: 'draft' });
        assert.equal(filled.error, undefined, filled.error);
        const imported = await execute({ action: 'import-collection', bytes: input, workspace, filledBytes: filled.native.bytes, filename: 'filled.hwpx' });
        assert.equal(imported.error, undefined, imported.error);
        assert.equal(imported.collectionPreview.rows[0].value, 'worker-collected-input');
        nativeCollectionVerified = true;
    }
    console.log(JSON.stringify({ worker: file, bytes: input.length, paragraphs: message.document.paragraphs.length, tables: message.document.tables.length, cells: message.document.tables.reduce((sum, table) => sum + table.cells.length, 0), sourceSha256: message.document.source.sha256, nativeWriteVerified, nativeCollectionVerified }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
