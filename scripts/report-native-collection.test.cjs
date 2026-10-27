const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const modules = Promise.all([
    import('../src/services/report/sourceParser.js'), import('../src/services/report/reportEngine.js'),
    import('../src/services/report/nativeCollection.js'), import('../src/services/report/hwpxPackage.js'),
    import('../src/services/report/collectionForms.js'), import('../src/services/report/nativeWriter.js'),
]);
const p = text => `<hp:p paraPrIDRef="3" styleIDRef="2"><hp:run charPrIDRef="7"><hp:t>${text}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>`;
const cell = (row, column, text, span = 1) => `<hp:tc name="" borderFillIDRef="1"><hp:subList>${p(text)}</hp:subList><hp:cellAddr rowAddr="${row}" colAddr="${column}"/><hp:cellSpan rowSpan="1" colSpan="${span}"/><hp:cellSz width="10000" height="2000"/></hp:tc>`;
function table(id, equipment) {
    return `${p(`[표 ${id}] 수배전설비 ${equipment}`)}<hp:p paraPrIDRef="5" styleIDRef="2"><hp:run charPrIDRef="7"><hp:tbl id="${id}" rowCnt="3" colCnt="3" borderFillIDRef="1"><hp:sz width="30000" height="6000"/><hp:pos treatAsChar="0"/><hp:tr>${cell(0, 0, '장비명·규격', 2)}${cell(0, 2, '양호/불량 판정')}</hp:tr><hp:tr>${cell(1, 0, `${equipment}-1`)}${cell(1, 1, '380V / 100kVA')}${cell(1, 2, '양호')}</hp:tr><hp:tr>${cell(2, 0, `${equipment}-2`)}${cell(2, 1, '220V / 50kVA')}${cell(2, 2, '불량')}</hp:tr></hp:tbl></hp:run></hp:p>`;
}
function fixture() {
    return zipSync({ mimetype: [strToU8('application/hwp+zip'), { level: 0 }], 'version.xml': [strToU8('<version/>'), { level: 0 }],
        'Contents/section0.xml': strToU8(`<?xml version="1.0"?><hs:sec xmlns:hs="section" xmlns:hp="paragraph">${p('보고서에만 남을 진단 의견')}${table(1, '변압기')}${table(2, '차단기')}${table(3, '조사 제외 설비')}</hs:sec>`),
        'Contents/header.xml': strToU8('<hh:head xmlns:hh="header" secCnt="1"><hh:refList><hh:charPr id="7"/><hh:paraPr id="3"/><hh:paraPr id="5"/></hh:refList></hh:head>'),
        'Contents/content.hpf': strToU8('<opf:package xmlns:opf="opf"><opf:metadata/><opf:manifest><opf:item id="header" href="Contents/header.xml"/><opf:item id="oldSection" href="Contents/section0.xml"/></opf:manifest><opf:spine><opf:itemref idref="header"/><opf:itemref idref="oldSection"/></opf:spine></opf:package>'),
        'BinData/image1.png': new Uint8Array([137, 80, 78, 71]), 'Preview/PrvImage.png': new Uint8Array([1, 2, 3]),
    });
}
async function work() {
    const [parser, engine] = await modules;
    const bytes = fixture(), document = await parser.analyzeReport(bytes, '설비목록.hwpx');
    let workspace = { ...engine.createWorkspace({ id: 'project-a', title: '현장 A' }, document), discipline: 'electrical' };
    for (const table of document.tables.slice(0, 2)) workspace = engine.addFields(workspace, engine.proposeJudgmentFields(document, table));
    workspace = engine.confirmSchema(workspace);
    return { bytes, workspace };
}
async function filled(bytes, values) {
    const [, , , hwpx] = await modules;
    const parts = unzipSync(bytes);
    for (const name of Object.keys(parts).filter(name => /^Contents\/section\d+\.xml$/.test(name))) {
        let xml = strFromU8(parts[name]);
        const { nodes } = hwpx.indexHwpxSection(xml, name);
        const patches = nodes.filter(node => Object.hasOwn(values, node.attrs.name || '')).map(node => ({
            start: node.start, end: node.end,
            // Word processors may split a cell into new runs/paragraphs and renumber document IDs.
            text: xml.slice(node.start, node.end).replace(/(<hp:subList\b[^>]*>).*?<\/hp:subList>/s, (_, opening) => `${opening}${p(values[node.attrs.name])}</hp:subList>`),
        }));
        for (const patch of patches.sort((a, b) => b.start - a.start)) xml = xml.slice(0, patch.start) + patch.text + xml.slice(patch.end);
        parts[name] = strToU8(xml.replace(/id="\d+"/g, 'id="1234567"').replace('<hs:sec xmlns:hs="section" xmlns:hp="paragraph">', `<hs:sec xmlns:hs="section" xmlns:hp="paragraph">${p('작성자가 추가한 현장 메모')}`));
    }
    return zipSync(parts);
}

test('one HWPX survey contains only selected original tables, retains equipment and style, and blanks judgment cells only', async () => {
    const [parser, , collection] = await modules;
    const { bytes, workspace } = await work();
    assert.equal(workspace.fields.length, 4);
    const output = await collection.exportNativeCollection(workspace, bytes);
    assert.equal(output.tableCount, 2);
    const doc = await parser.analyzeReport(output.bytes);
    assert.equal(doc.tables.length, 2);
    assert.ok(!doc.paragraphs.some(p => /보고서에만 남을|조사 제외 설비/.test(p.text)));
    for (const table of doc.tables) {
        assert.equal(table.cells[0].colSpan, 2);
        assert.equal(table.cells.find(c => c.row === 1 && c.column === 1).text, '380V / 100kVA');
        const judgments = table.cells.filter(cell => cell.fieldName.startsWith('JDF_'));
        assert.equal(judgments.length, 2); assert.ok(judgments.every(cell => cell.text === ''));
        assert.ok(judgments.every(cell => cell.textSlots[0].charShapeId === '7'));
    }
    const parts = unzipSync(output.bytes), originals = unzipSync(bytes);
    assert.deepEqual(parts['Contents/header.xml'], originals['Contents/header.xml']);
    assert.deepEqual(parts['BinData/image1.png'], originals['BinData/image1.png']);
    assert.equal(parts['Preview/PrvImage.png'], undefined);
    assert.doesNotMatch(strFromU8(parts['Contents/content.hpf']), /oldSection/);
});

test('edited HWPX is matched by cell names, previewed, imported and substituted back into original report tables', async () => {
    const [parser, engine, collection, , forms, writer] = await modules;
    const { bytes, workspace } = await work();
    const output = await collection.exportNativeCollection(workspace, bytes);
    const doc = await parser.analyzeReport(output.bytes), names = doc.tables.flatMap(table => table.cells.filter(cell => cell.fieldName.startsWith('JDF_')).map(cell => cell.fieldName));
    const edited = await filled(output.bytes, Object.fromEntries(names.map((name, i) => [name, i % 2 ? '양호' : '정밀점검 필요'])));
    const preview = await collection.readNativeCollection(workspace, bytes, edited, '작성한-양식.hwpx');
    assert.equal(preview.errors.length, 0); assert.equal(preview.rows.length, 4);
    assert.deepEqual(workspace.values, {}, 'Reading a preview must not change stored values');
    const imported = await forms.importCollectionData(workspace, preview.collection);
    assert.equal(imported.values[workspace.fields[0].id], '정밀점검 필요');
    const draft = engine.buildDraft(imported), report = await writer.writeNativeReport(draft, bytes);
    const result = await parser.analyzeReport(report.bytes);
    assert.equal(result.tables.length, 3);
    assert.equal(result.tables[0].cells.find(cell => cell.row === 1 && cell.column === 2).text, '정밀점검 필요');
    assert.equal(result.tables[0].cells.find(cell => cell.row === 1 && cell.column === 0).text, '변압기-1');
    assert.equal(result.tables[0].cells.find(cell => cell.row === 1 && cell.column === 1).text, '380V / 100kVA');
    assert.ok(result.paragraphs.some(p => p.text === '보고서에만 남을 진단 의견'));
});

test('HWPX surveys reject another project, department, schema revision, missing markers and duplicate input cells', async () => {
    const [parser, engine, collection, hwpx] = await modules;
    const { bytes, workspace } = await work(), output = await collection.exportNativeCollection(workspace, bytes);
    for (const altered of [{ ...workspace, projectId: 'other' }, { ...workspace, discipline: 'mechanical' }, engine.confirmSchema(engine.setField(workspace, { ...workspace.fields[0], label: '바뀐 항목 이름' }))]) await assert.rejects(collection.readNativeCollection(altered, bytes, output.bytes), /다른 프로젝트/);
    const parts = unzipSync(output.bytes), xml = strFromU8(parts['Contents/section0.xml']);
    const name = (await parser.analyzeReport(output.bytes)).tables[0].cells.find(cell => cell.fieldName).fieldName;
    parts['Contents/section0.xml'] = strToU8(xml.replace(`name="${name}"`, 'name=""'));
    await assert.rejects(collection.readNativeCollection(workspace, bytes, zipSync(parts)), /식별자가 없습니다/);
    parts['Contents/section0.xml'] = strToU8(xml.replace(/name="JDF_[^"]+"/, `name="${name}"`).replace(/name="JDF_[^"]+"/g, `name="${name}"`));
    await assert.rejects(collection.readNativeCollection(workspace, bytes, zipSync(parts)), /복제/);
    const nodes = hwpx.indexHwpxSection(xml, 'Contents/section0.xml').nodes;
    assert.ok(nodes.some(node => node.attrs.name === name));
});

test('blank and partial HWPX imports show missing data; fixed equipment edits are warned and never replace the report', async () => {
    const [parser, , collection] = await modules;
    const { bytes, workspace } = await work(), output = await collection.exportNativeCollection(workspace, bytes);
    const blank = await collection.readNativeCollection(workspace, bytes, output.bytes);
    assert.equal(blank.errors.filter(error => error.includes('필수 값 누락')).length, 4);
    const parts = unzipSync(output.bytes);
    parts['Contents/section0.xml'] = strToU8(strFromU8(parts['Contents/section0.xml']).replace('변압기-1', '바꾼 장비명'));
    const preview = await collection.readNativeCollection(workspace, bytes, zipSync(parts));
    assert.match(preview.warnings[0], /고정 셀의 변경은 가져오지 않습니다/);
    assert.ok((await parser.analyzeReport(bytes)).tables[0].cells.some(cell => cell.text === '변압기-1'));
});

test('an input run keeps neighboring unit text and free-text inputs receive named cells in the same HWPX', async () => {
    const [parser, engine, collection] = await modules;
    const parts = unzipSync(fixture());
    parts['Contents/section0.xml'] = strToU8(strFromU8(parts['Contents/section0.xml']).replace('<hp:t>양호</hp:t>', '<hp:t>220</hp:t></hp:run><hp:run charPrIDRef="8"><hp:t> V</hp:t>'));
    const bytes = zipSync(parts), document = await parser.analyzeReport(bytes);
    let workspace = engine.createWorkspace({ id: 'run-units', title: '문자 구간 양식' }, document);
    const table = document.tables[0], cell = table.cells.find(cell => cell.row === 1 && cell.column === 2);
    workspace = engine.setField(workspace, { ...engine.proposeCellField(document, table, cell), type: 'number', unit: 'V', binding: { sourceSha256: document.source.sha256, tableId: table.id, cellId: cell.id, slotId: cell.textSlots[0].id } });
    workspace = engine.setField(workspace, { id: 'extra', label: '추가 현장 메모', group: '협의', type: 'text', unit: '', required: false, reference: '', binding: null });
    workspace = engine.confirmSchema(workspace);
    const output = await collection.exportNativeCollection(workspace, bytes), doc = await parser.analyzeReport(output.bytes);
    assert.equal(doc.tables.length, 2);
    const names = doc.tables.flatMap(table => table.cells.filter(cell => cell.fieldName).map(cell => cell.fieldName));
    const edited = await filled(output.bytes, { [names[0]]: '230 V', [names[1]]: '새 현장 메모' });
    const result = await collection.readNativeCollection(workspace, bytes, edited);
    assert.equal(result.collection.values[workspace.fields[0].id], '230');
    assert.equal(result.collection.values.extra, '새 현장 메모');
    const changedUnit = await filled(output.bytes, { [names[0]]: '230 A' });
    await assert.rejects(collection.readNativeCollection(workspace, bytes, changedUnit), /고정 문구·단위/);
});

test('whole judgment cells with mixed styles, multiple paragraphs and inline line breaks clear all old text', async () => {
    const [parser, engine, collection, , forms, writer] = await modules;
    const parts = unzipSync(fixture());
    parts['Contents/section0.xml'] = strToU8(strFromU8(parts['Contents/section0.xml']).replace('<hp:t>양호</hp:t>', '<hp:t>과거 의견<hp:lineBreak/>둘째 줄</hp:t></hp:run><hp:run charPrIDRef="8"><hp:t>강조된 과거 판정</hp:t>'));
    const bytes = zipSync(parts), document = await parser.analyzeReport(bytes);
    let state = engine.createWorkspace({ id: 'mixed-judgment', title: '서식 혼합 판정' }, document);
    state = engine.addFields(state, engine.proposeJudgmentFields(document, document.tables[0]));
    state = engine.confirmSchema(state);
    const output = await collection.exportNativeCollection(state, bytes), blank = await parser.analyzeReport(output.bytes);
    const cells = blank.tables[0].cells.filter(cell => cell.fieldName);
    assert.ok(cells.every(cell => cell.text === ''));
    const edited = await filled(output.bytes, Object.fromEntries(cells.map(cell => [cell.fieldName, '새 점검 결과'])));
    const preview = await collection.readNativeCollection(state, bytes, edited);
    state = await forms.importCollectionData(state, preview.collection);
    const report = await writer.writeNativeReport(engine.buildDraft(state), bytes), result = await parser.analyzeReport(report.bytes);
    const cell = result.tables[0].cells.find(cell => cell.row === 1 && cell.column === 2);
    assert.equal(cell.text, '새 점검 결과');
    assert.equal(cell.textSlots[0].charShapeId, '7'); assert.equal(cell.textSlots[1].charShapeId, '8');
    assert.ok(!result.paragraphs.some(p => p.text.includes('과거 의견')));
});

test('survey extraction renumbers selected sections and prunes only unused manifest images', async () => {
    const [parser, engine, collection] = await modules;
    const parts = unzipSync(fixture());
    parts['Contents/section1.xml'] = strToU8(`<hs:sec xmlns:hs="section" xmlns:hp="paragraph">${table(7, '추가 구역')}<hp:p><hp:run><hp:pic binaryItemIDRef="usedImage"/></hp:run></hp:p></hs:sec>`);
    // The picture outside selected tables is excluded from the survey. A header asset remains referenced.
    parts['Contents/header.xml'] = strToU8('<hh:head xmlns:hh="header" secCnt="2"><hh:binData binaryItemIDRef="headerImage"/></hh:head>');
    parts['Contents/content.hpf'] = strToU8('<opf:package xmlns:opf="opf"><opf:manifest><opf:item id="s0" href="Contents/section0.xml"/><opf:item id="s1" href="Contents/section1.xml"/><opf:item id="headerImage" href="BinData/header.png"/><opf:item id="usedImage" href="BinData/outside.png"/></opf:manifest><opf:spine><opf:itemref idref="s0"/><opf:itemref idref="s1"/></opf:spine></opf:package>');
    parts['BinData/header.png'] = new Uint8Array([1, 2]); parts['BinData/outside.png'] = new Uint8Array([3, 4]);
    const bytes = zipSync(parts), document = await parser.analyzeReport(bytes);
    let state = engine.createWorkspace({ id: 'sections', title: '구역 선택' }, document);
    state = engine.confirmSchema(engine.addFields(state, engine.proposeJudgmentFields(document, document.tables.at(-1))));
    const output = await collection.exportNativeCollection(state, bytes), result = unzipSync(output.bytes);
    assert.equal(result['Contents/section1.xml'], undefined);
    assert.match(strFromU8(result['Contents/header.xml']), /secCnt="1"/);
    assert.ok(result['BinData/header.png']); assert.equal(result['BinData/outside.png'], undefined);
    assert.doesNotMatch(strFromU8(result['Contents/content.hpf']), /idref="s[01]"|id="usedImage"/);
    assert.equal((await parser.analyzeReport(output.bytes)).tables.length, 1);
    assert.equal((await collection.readNativeCollection(state, bytes, output.bytes)).rows.length, 2);
});
