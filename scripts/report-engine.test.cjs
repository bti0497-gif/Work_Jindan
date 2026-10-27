const { test } = require('node:test');
const assert = require('node:assert/strict');
const CFB = require('cfb');
const { deflateSync, zipSync, strToU8 } = require('fflate');
const modules = Promise.all([
    import('../src/services/report/sourceParser.js'),
    import('../src/services/report/reportEngine.js'),
    import('../src/services/report/reportStore.js'),
]);

function record(tag, level, data) {
    const header = Buffer.alloc(4);
    header.writeUInt32LE((data.length << 20) | (level << 10) | tag);
    return Buffer.concat([header, data]);
}
function paragraph(text, level = 0) {
    return [record(66, level, Buffer.alloc(22)), record(67, level + 1, Buffer.from(`${text}\r`, 'utf16le'))];
}
function hwp({ compressed = false, flags = 0, broken = false } = {}) {
    const file = CFB.utils.cfb_new();
    const header = Buffer.alloc(256);
    header.write('HWP Document File');
    header.writeUInt32LE(0x05000300, 32);
    header.writeUInt32LE(flags | Number(compressed), 36);
    const table = Buffer.alloc(22); table.writeUInt16LE(2, 4); table.writeUInt16LE(2, 6);
    const parts = [...paragraph('[표 1] 현장별 계측'), record(71, 1, Buffer.from(' lbt')), record(77, 2, table)];
    ['설비', '전압', 'A호기', '220.5'].forEach((text, index) => {
        const cell = Buffer.alloc(34);
        cell.writeUInt32LE(1); cell.writeUInt16LE(index % 2, 8); cell.writeUInt16LE(Math.floor(index / 2), 10); cell.writeUInt16LE(1, 12); cell.writeUInt16LE(1, 14);
        parts.push(record(72, 2, cell), ...paragraph(text, 2));
    });
    let body = Buffer.concat(parts);
    if (broken) body = body.subarray(0, body.length - 1);
    const info = record(17, 0, Buffer.alloc(32));
    CFB.utils.cfb_add(file, 'FileHeader', header);
    CFB.utils.cfb_add(file, 'DocInfo', compressed ? deflateSync(info) : info);
    CFB.utils.cfb_add(file, 'BodyText/Section0', compressed ? deflateSync(body) : body);
    return CFB.write(file, { type: 'buffer' });
}
function hwpx(text = '유량 &amp; 수위', replacement = '') {
    const xml = `<?xml version="1.0"?><hs:sec xmlns:hs="section" xmlns:hp="paragraph"><hp:p><hp:run><hp:t>[표 2] 계측 제어</hp:t></hp:run></hp:p><hp:p><hp:run><hp:tbl rowCnt="2" colCnt="3"><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="2" rowSpan="1"/></hp:tc><hp:tc><hp:subList><hp:p><hp:run><hp:t>단위</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="2" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc></hp:tr><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>17.5</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="2" rowSpan="1"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`;
    return zipSync({ 'Contents/section0.xml': strToU8(replacement || xml), 'BinData/ignored.bin': new Uint8Array(64) });
}
async function workspace() {
    const [parser, engine] = await modules;
    const document = await parser.analyzeReport(hwp(), '현장.hwp');
    let work = engine.createWorkspace({ id: 'plant-a', title: '현장 A' }, document);
    for (let index = 0; index < 3; index++) work = engine.setField(work, { id: `phase-${index}`, label: ['R상', 'S상', 'T상'][index], group: '1호기', type: 'number', unit: '°C', required: true, reference: '과거 측정값 999', binding: null });
    return work;
}

test('HWP reads binary cells and stable anchors, including compressed streams', async () => {
    const [parser] = await modules;
    for (const compressed of [false, true]) {
        const doc = await parser.analyzeReport(hwp({ compressed }), '원본.hwp');
        assert.equal(doc.tables.length, 1);
        assert.equal(doc.paragraphs.length, 5);
        assert.equal(doc.tables[0].cells.length, 4);
        assert.equal(doc.tables[0].title, '[표 1] 현장별 계측');
        assert.equal(doc.tables[0].cells[3].text, '220.5');
        assert.equal(doc.tables[0].cells[3].row, 1);
        assert.equal(doc.source.sha256.length, 64);
    }
});
test('HWPX preserves merged coordinates and text entities without loading pictures', async () => {
    const [parser] = await modules;
    const doc = await parser.analyzeReport(hwpx(), '표.hwpx');
    assert.equal(doc.format, 'hwpx');
    assert.equal(doc.tables[0].cells[0].text, '유량 & 수위');
    assert.equal(doc.tables[0].cells[0].colSpan, 2);
    assert.equal(doc.tables[0].cells[2].row, 1);
    assert.equal(doc.tables[0].title, '[표 2] 계측 제어');
});
test('source adapters reject protected, truncated, non-report and entity documents', async () => {
    const [parser] = await modules;
    await assert.rejects(parser.analyzeReport(hwp({ flags: 2 })), /암호/);
    await assert.rejects(parser.analyzeReport(hwp({ flags: 4 })), /배포/);
    await assert.rejects(parser.analyzeReport(hwp({ broken: true })), /길이/);
    await assert.rejects(parser.analyzeReport(strToU8('%PDF-1.7')), /HWP/);
    await assert.rejects(parser.analyzeReport(hwpx('', '<!DOCTYPE r [<!ENTITY x "bad">]><r>&x;</r>')), /외부 개체/);
    await assert.rejects(parser.analyzeReport(hwpx('', '<r><broken></r>')), /XML/);
    assert.throws(() => parser.readRecords(new Uint8Array([1, 2])), /잘렸/);
});
test('schemas come from each source instead of fixed electrical fields; old measurements stay reference-only', async () => {
    const [parser, engine] = await modules;
    const docs = [await parser.analyzeReport(hwp()), await parser.analyzeReport(hwpx('기계 진동'))];
    const fields = docs.map(doc => engine.proposeCellField(doc, doc.tables[0], doc.tables[0].cells.at(-1)));
    assert.notEqual(fields[0].id, fields[1].id);
    assert.notEqual(fields[0].label, fields[1].label);
    const fresh = engine.setField(engine.createWorkspace({ id: 'p' }, docs[0]), fields[0]);
    assert.deepEqual(fresh.values, {});
    assert.equal(fresh.fields[0].reference, '220.5');
    assert.ok(engine.validateData(fresh).errors.some(error => error.includes('필수')));
});
test('numeric inputs distinguish blank, zero, grouping errors and unsupported units', async () => {
    const [, engine] = await modules;
    assert.equal(engine.parseNumber(''), null);
    assert.equal(engine.parseNumber('0'), 0);
    assert.equal(engine.parseNumber('40,000.5'), 40000.5);
    for (const input of ['4,00', '23°C', 'Infinity', '0x20']) assert.ok(Number.isNaN(engine.parseNumber(input)));
});
test('confirmed data generates traceable temperature analysis and reviewed improvement wording', async () => {
    const [, engine] = await modules;
    let work = await workspace();
    work = engine.setRule(work, { id: 'delta', label: '상간 온도차', operation: 'spread', fieldIds: work.fields.map(f => f.id), criterion: { min: '', max: '0.4', source: '현장 검토 기준 2026-10', confirmed: true }, narratives: { outside: '온도차 {value} {unit}의 원인 확인이 필요하다.', recommendation: '접속부 상태와 운전 부하를 확인한다.' } });
    work = engine.confirmSchema(work);
    [30.2, 29.7, 29.7].forEach((value, i) => { work = engine.setValue(work, `phase-${i}`, String(value)); });
    work = engine.setNotes(work, { conclusion: '현장 관찰과 함께 추가 검토한다.' });
    work = engine.buildDraft(work);
    assert.ok(Math.abs(work.draft.results[0].value - 0.5) < 1e-9);
    assert.equal(work.draft.results[0].assessment, '설정 기준 범위 밖');
    assert.match(work.draft.results[0].text, /온도차 0.5 °C/);
    assert.match(work.draft.results[0].recommendation, /접속부/);
    assert.equal(work.draft.results[0].inputs.length, 3);
    assert.equal(work.draft.status, 'review-required');
    assert.doesNotMatch(engine.draftHtml(work.draft), /999/);
    assert.equal(engine.prepareAiReview(work).sourceSha256, work.source.sha256);
    const changed = engine.setValue(work, 'phase-0', '31');
    assert.equal(changed.draft, null);
    assert.equal(changed.history.length, 1);
    const redefined = engine.setField(work, { ...work.fields[0], unit: 'K' });
    assert.equal(redefined.confirmedRevision, null);
    assert.throws(() => engine.buildDraft(redefined), /단위가 다릅니다/);
});
test('rules do not silently sum missing values, divide by zero or apply an unconfirmed criterion', async () => {
    const [, engine] = await modules;
    let work = await workspace();
    const ratio = { id: 'ratio', label: '비율', operation: 'ratio', fieldIds: ['phase-0', 'phase-1'] };
    assert.equal(engine.evaluateRule(work, ratio).status, 'pending');
    work = engine.setValue(work, 'phase-0', '0');
    work = engine.setValue(work, 'phase-1', '0');
    assert.equal(engine.evaluateRule(work, ratio).status, 'pending');
    const invalid = engine.setRule(work, { ...ratio, criterion: { min: '0', max: '10', source: '과거 기준', confirmed: false } });
    assert.throws(() => engine.confirmSchema(invalid), /기준/);
    assert.throws(() => engine.confirmSchema(engine.setRule(work, { ...ratio, fieldIds: ['phase-0', 'phase-0'] })), /중복/);
    assert.equal(engine.evaluateRule(work, { ...ratio, operation: 'sum' }).value, 0);
});
test('optional missing measurements remain pending and HTML escapes user content', async () => {
    const [, engine] = await modules;
    let work = await workspace();
    for (const field of work.fields) work = engine.setField(work, { ...field, required: false });
    work = engine.setRule(work, { id: 'sum', label: '합계', operation: 'sum', fieldIds: ['phase-0', 'phase-1'] });
    work = engine.confirmSchema(work);
    work = engine.setNotes(work, { improvements: '<script>alert(1)</script>' });
    work = engine.buildDraft(work);
    assert.equal(work.draft.results[0].status, 'pending');
    assert.equal(work.draft.groups[0].entries[0].value, null);
    assert.match(engine.draftHtml(work.draft), /&lt;script&gt;/);
    assert.doesNotMatch(engine.draftHtml(work.draft), /<script>/);
    assert.doesNotMatch(JSON.stringify(engine.prepareAiReview(work)), /과거 측정값/);
});
test('backup restoration is project-bound, validates cells and invalidates previous approvals', async () => {
    const [, engine, store] = await modules;
    const work = engine.confirmSchema(await workspace());
    assert.equal(store.validateBackup(work, 'plant-a').confirmedRevision, null);
    assert.throws(() => store.validateBackup(work, 'plant-b'), /프로젝트/);
    const corrupt = structuredClone(work);
    delete corrupt.document.tables[0].cells;
    assert.throws(() => store.validateBackup(corrupt, 'plant-a'), /원본 표/);
    const stale = structuredClone(work);
    stale.document.source = { ...stale.document.source, sha256: '0'.repeat(64) };
    assert.throws(() => store.validateBackup(stale, 'plant-a'), /프로젝트/);
});

test('table candidates are generated in bulk; a new diagnosis reuses schema with empty data and recoverable values', async () => {
    const [parser, engine] = await modules;
    const doc = await parser.analyzeReport(hwp());
    const fields = engine.proposeTableFields(doc, doc.tables[0], 1, 1);
    assert.equal(fields.length, 1);
    assert.equal(fields[0].label, 'A호기 / 전압');
    assert.throws(() => engine.proposeTableFields(doc, doc.tables[0], 2, 1), /범위/);
    let work = engine.addFields(engine.createWorkspace({ id: 'p' }, doc), fields);
    work = engine.addFields(work, fields);
    assert.equal(work.fields.length, 1);
    work = engine.confirmSchema(work);
    work = engine.setValue(work, fields[0].id, '230');
    const fresh = engine.startNewRun(work);
    assert.equal(fresh.confirmedRevision, work.confirmedRevision);
    assert.deepEqual(fresh.values, {});
    assert.equal(fresh.runs[0].values[fields[0].id], '230');
    assert.equal(engine.restoreLastRun(fresh).values[fields[0].id], '230');
});

test('local storage isolates account, project and department while keeping legacy electrical work accessible', async () => {
    const [, , store] = await modules;
    const records = new Map();
    global.indexedDB = { open: () => {
        const request = {};
        request.result = { transaction: () => {
            const tx = { objectStore: () => ({
                put: record => { records.set(record.key, structuredClone(record)); queueMicrotask(() => tx.oncomplete()); },
                index: name => { assert.equal(name, 'scope'); return { getAll: scope => {
                    const result = { result: [...records.values()].filter(record => record.userId === scope[0] && record.projectId === scope[1]) };
                    queueMicrotask(() => result.onsuccess());
                    return result;
                } }; },
            }) };
            return tx;
        } };
        queueMicrotask(() => request.onsuccess());
        return request;
    } };
    const first = await workspace();
    const second = { ...first, projectId: 'plant-b', projectTitle: '현장 B' };
    await store.saveWorkspace('alice', first);
    await store.saveWorkspace('alice', second);
    await store.saveWorkspace('bob', { ...first, projectTitle: 'Bob only' });
    assert.equal(records.size, 3);
    await store.saveWorkspace('alice', { ...first, discipline: 'process', values: { measurement: '100' } });
    await store.saveWorkspace('alice', { ...first, discipline: 'mechanical', values: { measurement: '200' } });
    assert.equal(records.size, 5);
    assert.equal((await store.listWorkspaces('alice', 'plant-a', 'process'))[0].values.measurement, '100');
    assert.equal((await store.listWorkspaces('alice', 'plant-a', 'mechanical'))[0].values.measurement, '200');
    assert.equal((await store.listWorkspaces('alice', 'plant-a', 'electrical')).length, 1);
    await store.saveWorkspace('alice', { ...first, discipline: 'process', values: { measurement: '101' } });
    assert.equal(records.size, 5);
    assert.equal((await store.listWorkspaces('alice', 'plant-a', 'mechanical'))[0].values.measurement, '200');
    assert.equal((await store.listWorkspaces('alice', 'plant-a', 'process'))[0].values.measurement, '101');
    assert.throws(() => store.validateBackup({ ...first, discipline: 'mechanical' }, 'plant-a', 'process'), /분야/);
    assert.equal(store.validateBackup(first, 'plant-a', 'electrical').discipline, 'electrical');
    assert.throws(() => store.validateBackup(first, 'plant-a', 'process'), /분야/);
    assert.deepEqual((await store.listWorkspaces('alice', 'plant-a')).map(item => item.projectTitle), ['현장 A']);
    assert.equal((await store.listWorkspaces('alice', 'plant-b'))[0].projectTitle, '현장 B');
    assert.equal((await store.listWorkspaces('bob', 'plant-a'))[0].projectTitle, 'Bob only');
    assert.deepEqual(await store.listWorkspaces('charlie', 'plant-a'), []);
    delete global.indexedDB;
});
