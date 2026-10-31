const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const make = () => ({ schema: 'jindan-editable-page/1', title: 'Unseen chapter', width: 595.22, height: 842,
    source: { pdfSha256: 'a'.repeat(64), hwpxSha256: 'b'.repeat(64), pdfPage: 7, pdfName: 'different.pdf', hwpxName: 'different.hwpx', method: 'fixture evidence' },
    objects: [{ id: 'frame', type: 'panel', label: 'Frame', x: 70, y: 80, width: 450, height: 650, radius: 24, corner: 'top', fill: 'none', stroke: '#cccccc', strokeWidth: 2 },
        { id: 'chapter', type: 'text', label: 'Title', x: 165, y: 201, text: 'Unseen chapter', originalText: 'Unseen chapter', fontFamily: 'Arial', fontSize: 25, originalFontSize: 25, originalWidth: 250, fill: '#000000', sourceParagraphs: [{ section: 'Contents/section3.xml', index: 81, id: 'different' }] }] });
test('editable page binding uses both source hashes, rejects invalid/executable objects, and isolates mutation', async () => {
    const { validatePageTrial, bindPageTrial, pageTrialSvg } = await import('../src/services/report/pageReproduction.js');
    const model = make();
    assert.throws(() => bindPageTrial(model, [{ format: 'pdf', sha256: 'a'.repeat(64), id: 'pdf' }]));
    const bound = bindPageTrial(model, [{ format: 'pdf', sha256: 'a'.repeat(64), id: 'pdf' }, { format: 'hwpx', sha256: 'b'.repeat(64), id: 'hwpx' }]);
    assert.equal(bound.hwpxMaterialId, 'hwpx');
    bound.model.objects[1].text = 'New <text> & "label"';
    const svg = pageTrialSvg(bound.model);
    assert.match(svg, /New &lt;text&gt; &amp; &quot;label&quot;/); assert.doesNotMatch(svg, /<image|<iframe|<script|textLength=/);
    assert.equal(model.objects[1].text, 'Unseen chapter');
    for (const mutate of [m => m.objects.push({ type: 'image', src: 'https://invalid/' }), m => m.objects[0].x = Infinity,
        m => m.objects[0].fill = 'url(https://invalid/)', m => m.objects[1].id = 'frame', m => m.fonts = [{ family: 'x', data: '<script/>' }]]) {
        const invalid = make(); mutate(invalid); assert.throws(() => validatePageTrial(invalid));
    }
});
test('production PDF exporter independently prints edited text and vector paths without PDF or raster input', { timeout: 30000 }, async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'jindan-page-export-'));
    try {
        const model = make(); model.objects[1].text = 'Changed project title';
        await fs.writeFile(path.join(temporary, 'page.json'), JSON.stringify(model));
        const rendered = spawnSync(process.execPath, ['scripts/render-page-trial.cjs', path.join(temporary, 'page.json'), path.join(temporary, 'page.pdf')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 20000, windowsHide: true });
        assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
        const inspect = spawnSync('python', ['-X', 'utf8', '-c', 'import fitz,json,sys; d=fitz.open(sys.argv[1]); p=d[0]; print(json.dumps({"pages":len(d),"text":p.get_text(),"images":len(p.get_images()),"paths":len(p.get_drawings()),"w":p.rect.width,"h":p.rect.height}))', path.join(temporary, 'page.pdf')], { encoding: 'utf8', windowsHide: true });
        assert.equal(inspect.status, 0, inspect.stderr); const result = JSON.parse(inspect.stdout);
        assert.equal(result.pages, 1); assert.match(result.text, /Changed project title/); assert.doesNotMatch(result.text, /Unseen chapter/);
        assert.equal(result.images, 0); assert.ok(result.paths >= 2); assert.ok(Math.abs(result.w - model.width) < 0.3 && Math.abs(result.h - model.height) < 0.3);
    } finally {
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir())); assert.ok(path.basename(temporary).startsWith('jindan-page-export-'));
        await fs.rm(temporary, { recursive: true, force: true });
    }
});
