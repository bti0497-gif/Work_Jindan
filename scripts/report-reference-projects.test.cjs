const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = import('../src/services/report/referenceProjects.js');
async function entry(id, relativePath, changes = {}) {
    const { classifyReferencePath } = await api;
    return { id, relativePath, filename: relativePath.split('/').at(-1), format: relativePath.split('.').at(-1).toLowerCase(), ...classifyReferencePath(relativePath), ...changes };
}
test('classifies covers, spines, contents, chapter dividers, appendices and full PDFs without treating contents as body', async () => {
    const { classifyReferencePath: classify } = await api;
    for (const [name, kind] of [['00. 표지.hwpx', 'cover'], ['01. 속표지.hwpx', 'innerCover'], ['02. 책등.hwpx', 'spine'], ['목차.hwpx', 'contents'], ['표 목차.pdf', 'tableContents'], ['그림목차.pdf', 'figureContents'], ['간지/제3장.hwpx', 'divider'], ['제4장/표지.hwpx', 'divider'], ['제2장/본문.hwpx', 'chapter'], ['부록(측정자료).hwpx', 'appendix'], ['전체보고서.pdf', 'complete'], ['빈페이지.hwpx', 'blank']]) assert.equal(classify(name).componentKind, kind, name);
    assert.equal(classify('03. 제１０장 전기.hwpx').chapterNumber, 10);
    assert.equal(classify('알수없는파일.hwpx').componentKind, 'other');
});
test('retains valid relative paths and rejects absolute or traversing paths', async () => {
    const { normalizeReferencePath: normalize } = await api;
    assert.equal(normalize('보고서\\HWPX\\제1장.hwpx'), '보고서/HWPX/제1장.hwpx');
    for (const path of ['', '/보고서/장.hwpx', 'C:\\보고서\\장.hwpx', '보고서/../장.hwpx', '보고서//장.hwpx', '보고서/./장.hwpx', '보고서/\0장.hwpx']) assert.throws(() => normalize(path));
});
test('pairs matching filenames across format folders and preserves every source entry', async () => {
    const { buildReferenceParts: build } = await api;
    const sources = await Promise.all([entry('h1', 'HWPX/00. 표지.hwpx'), entry('p1', 'PDF/00. 표지.pdf'), entry('h2', 'HWPX/01. 제1장 개요.hwpx'), entry('p2', 'PDF/제1장 개요.pdf'), entry('full', 'PDF/전체보고서.pdf')]);
    const parts = build(sources);
    assert.equal(parts.length, 3);
    assert.equal(parts[0].original.id, 'h1'); assert.equal(parts[0].pdf.id, 'p1');
    assert.equal(parts[1].original.id, 'h2'); assert.equal(parts[1].pdf.id, 'p2');
    assert.equal(parts[2].pairing, 'pdf-only');
    assert.equal(sources[0].relativePath, 'HWPX/00. 표지.hwpx');
});
test('does not guess between duplicate chapter originals or mix year/revision directories', async () => {
    const { buildReferenceParts: build } = await api;
    const duplicates = build(await Promise.all([entry('h1', 'HWPX/01. 제1장 개요.hwpx'), entry('h2', 'HWPX/02. 제1장 개요.hwpx'), entry('p1', 'PDF/제1장 개요.pdf')]));
    assert.equal(duplicates.filter(part => part.pairing === 'ambiguous').length, 2);
    assert.ok(duplicates.filter(part => part.original).every(part => !part.pdf));
    const versions = build(await Promise.all([entry('old', '2025/HWPX/제1장.hwpx'), entry('new', '2026/PDF/제1장.pdf')]));
    assert.ok(versions.every(part => !(part.original && part.pdf)));
});
test('manual PDF choice and explicit unlink override automatic pairing', async () => {
    const { buildReferenceParts: build } = await api;
    const pdfs = await Promise.all([entry('p1', 'PDF/표지.pdf'), entry('p2', 'PDF/확인본.pdf')]);
    const original = await entry('h', 'HWPX/표지.hwpx', { pdfChoice: 'p2' });
    assert.equal(build([original, ...pdfs]).find(part => part.original).pdf.id, 'p2');
    assert.equal(build([{ ...original, pdfChoice: 'none' }, ...pdfs]).find(part => part.original).pdf, null);
    assert.equal(build([{ ...original, pdfChoice: 'none' }, ...pdfs]).find(part => part.original).pairing, 'unlinked');
});
test('orders chapters numerically and keeps chapter dividers before their body', async () => {
    const { buildReferenceParts: build } = await api;
    const parts = build(await Promise.all([entry('ten', '제10장.hwpx'), entry('two', '제2장.hwpx'), entry('one', '제1장.hwpx'), entry('divider', '간지/제2장.hwpx'), entry('spine', '책등.hwpx'), entry('cover', '표지.hwpx')]));
    assert.deepEqual(parts.map(part => part.id), ['cover', 'spine', 'one', 'divider', 'two', 'ten']);
});
test('directory drops consume all readEntries batches and preserve nested paths', async () => {
    const { filesFromReferenceDrop } = await api;
    let reads = 0;
    const file = name => ({ name, isFile: true, file: resolve => resolve({ name }) });
    const root = { name: '프로젝트', isDirectory: true, createReader: () => ({ readEntries: resolve => {
        reads++;
        resolve(reads === 1 ? Array.from({ length: 100 }, (_, i) => file(`${i}.hwpx`)) : reads === 2 ? [file('마지막장.hwpx')] : []);
    } }) };
    const files = await filesFromReferenceDrop([{ webkitGetAsEntry: () => root }]);
    assert.equal(files.length, 101); assert.equal(reads, 3); assert.equal(files.at(-1).relativePath, '프로젝트/마지막장.hwpx');
    await assert.rejects(filesFromReferenceDrop([{ webkitGetAsEntry: () => file('한장.hwpx') }]), /폴더/);
});
test('invalid and unsupported folder selections fail before writing a project', async () => {
    const { importReferenceFolder } = await api;
    await assert.rejects(importReferenceFolder('user', []), /파일/);
    await assert.rejects(importReferenceFolder('user', [{ relativePath: 'A/원본.hwp', file: {} }]), /HWPX/);
    await assert.rejects(importReferenceFolder('user', [{ relativePath: 'A/장.hwpx', file: {} }, { relativePath: 'B/장.pdf', file: {} }]), /한 개씩/);
    await assert.rejects(importReferenceFolder('user', Array.from({ length: 1001 }, (_, i) => ({ relativePath: `A/${i}.hwpx`, file: {} }))), /1,000/);
});
