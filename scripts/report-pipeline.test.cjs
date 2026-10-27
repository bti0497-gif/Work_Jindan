const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const modules = Promise.all([
    import('../src/services/report/sourceParser.js'), import('../src/services/report/reportEngine.js'),
    import('../src/services/report/collectionForms.js'), import('../src/services/report/nativeWriter.js'),
    import('../src/services/report/reportInterpreter.js'), import('../src/services/report/hwpxPackage.js'),
    import('../src/services/report/reportAnalyzer.js'),
]);
function fixture(number = '220', suffix = ' V') {
    const p = (text, style = 7) => `<hp:p paraPrIDRef="31" styleIDRef="4"><hp:run charPrIDRef="${style}"><hp:t>${text}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>`;
    const cell = (r, c, content) => `<hp:tc><hp:subList>${content}</hp:subList><hp:cellAddr rowAddr="${r}" colAddr="${c}"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>`;
    const xml = `<?xml version="1.0"?><hs:sec xmlns:hs="section" xmlns:hp="paragraph">${p('[표 1] 측정 결과')}<hp:p><hp:run><hp:tbl rowCnt="2" colCnt="2"><hp:tr>${cell(0, 0, p('설비'))}${cell(0, 1, p('전압'))}</hp:tr><hp:tr>${cell(1, 0, p('A1'))}${cell(1, 1, `<hp:p paraPrIDRef="32" styleIDRef="5"><hp:run charPrIDRef="9"><hp:t>${number}</hp:t></hp:run><hp:run charPrIDRef="10"><hp:t>${suffix}</hp:t></hp:run></hp:p>`)}</hp:tr></hp:tbl></hp:run></hp:p>${p('과거 진단 의견', 12)}${p('', 13)}</hs:sec>`;
    return zipSync({ mimetype: [strToU8('application/hwp+zip'), { level: 0 }], 'version.xml': [strToU8('<version/>'), { level: 0 }], 'Contents/section0.xml': strToU8(xml),
        'Contents/header.xml': strToU8('<hh:head xmlns:hh="header"><hh:charPr id="9" height="1200"><hh:ratio hangul="95"/><hh:spacing hangul="-5"/></hh:charPr><hh:paraPr id="32"><hh:indent value="1000"/></hh:paraPr></hh:head>'),
        'BinData/image1.png': new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
        'META-INF/container.xml': strToU8('<container><rootfile full-path="Contents/content.hpf"/><rootfile full-path="Preview/PrvText.txt"/></container>'),
        'Preview/PrvText.txt': strToU8('과거 측정값 220'), 'Preview/PrvImage.png': new Uint8Array([1, 2, 3]),
    });
}
async function work() {
    const [parser, engine] = await modules;
    const bytes = fixture(), document = await parser.analyzeReport(bytes, '현장별 원본.hwpx');
    const table = document.tables[0], cell = table.cells.at(-1);
    let result = engine.createWorkspace({ id: 'p1', title: '새 현장' }, document);
    result = engine.setField(result, { ...engine.proposeCellField(document, table, cell), type: 'number', unit: 'V' });
    return { bytes, work: result };
}
test('blank collection forms exclude historical and already-entered values; downloaded data can be reimported', async () => {
    const [, engine, forms] = await modules;
    let { work: state } = await work();
    const id = state.fields[0].id;
    state = engine.confirmSchema(state);
    state = engine.setValue(state, id, '999');
    const form = await forms.createCollectionForm(state);
    assert.equal(form.values[id], '');
    assert.doesNotMatch(forms.collectionFormHtml(form), /999|220 V/);
    const html = forms.collectionFormHtml(form), handlers = {}, nodes = new Map();
    const embedded = html.match(/id="form-data">([\s\S]*?)<\/script>/)[1];
    const code = html.match(/<script>\(\(\)=>[\s\S]*?<\/script>/)[0].slice(8, -9);
    nodes.set('form-data', { textContent: embedded });
    nodes.set('field-0', { value: '230' });
    for (const key of ['diagnosis', 'conclusion', 'improvements']) nodes.set(`note-${key}`, { value: '' });
    let savedBlob;
    const document = { getElementById: id => {
        if (!nodes.has(id)) nodes.set(id, { addEventListener: (name, fn) => { handlers[`${id}:${name}`] = fn; } });
        return nodes.get(id);
    }, createElement: () => ({ click() {} }) };
    vm.runInNewContext(code, { document, window: { print() {} }, Blob, URL: { createObjectURL: blob => { savedBlob = blob; return 'blob:test'; }, revokeObjectURL() {} }, setTimeout: () => {} });
    handlers['save:click']();
    const collected = JSON.parse(await savedBlob.text());
    const imported = await forms.importCollectionData(state, collected);
    assert.equal(imported.values[id], '230');
    assert.equal(imported.runs.at(-1).values[id], '999');
    assert.equal(imported.draft, null);
});
test('collection data is bound to source, project, schema contents and revision', async () => {
    const [, engine, forms] = await modules;
    let { work: state } = await work(); state = engine.confirmSchema(state);
    const form = await forms.createCollectionForm(state);
    for (const changed of [{ ...form, projectId: 'p2' }, { ...form, sourceSha256: '0'.repeat(64) }, { ...form, schemaRevision: 999 }, { ...form, values: { unexpected: '1' } }]) await assert.rejects(forms.importCollectionData(state, changed));
    const altered = { ...state, fields: [{ ...state.fields[0], unit: 'kV' }] };
    await assert.rejects(forms.importCollectionData(altered, form), /일치/);
    const unsafe = structuredClone(form); unsafe.fields[0].label = '</script><script>bad()</script>';
    const html = forms.collectionFormHtml(unsafe);
    assert.doesNotMatch(html, /<script>bad\(\)<\/script>/);
});

test('department survey forms and AI results cannot be applied across departments with the same source and fields', async () => {
    const [, engine, forms, , interpreter, , analyzer] = await modules;
    let { work: state } = await work();
    state = engine.confirmSchema(state);
    const process = { ...state, discipline: 'process' }, mechanical = { ...state, discipline: 'mechanical' };
    const form = await forms.createCollectionForm(process);
    assert.equal(form.discipline, 'process');
    assert.match(forms.collectionFormHtml(form), /공정 진단 조사 양식/);
    await assert.rejects(forms.importCollectionData(mechanical, form), /분야/);
    // A renamed department alone cannot bypass the fingerprint check.
    await assert.rejects(forms.importCollectionData(mechanical, { ...form, discipline: 'mechanical' }), /일치/);
    const analysis = await analyzer.createAnalysisRequest(process);
    await assert.rejects(analyzer.validateAnalysis(mechanical, analysis.responseContract), /일치/);
    const input = state.fields[0].id;
    const interpreted = await interpreter.createInterpretationRequest(engine.buildDraft(engine.setValue(process, input, '230')));
    await assert.rejects(interpreter.validateInterpretation(engine.setValue(mechanical, input, '230'), interpreted.responseContract), /일치/);
});

test('draft readiness requires fresh input, validates zero correctly and permits unfinished human conclusions', async () => {
    const [, engine] = await modules;
    const { draftReadiness } = await import('../src/services/report/reportSections.js');
    let { work: state } = await work();
    const field = state.fields[0];
    assert.equal(draftReadiness(state).ready, false);
    state = engine.confirmSchema(state);
    assert.equal(draftReadiness(state).requiredFilled, 0);
    assert.equal(draftReadiness(state).ready, false, 'An old reference measurement does not count as new input');
    state = engine.setValue(state, field.id, '230 V');
    assert.equal(draftReadiness(state).ready, false);
    state = engine.setValue(state, field.id, 0);
    assert.equal(draftReadiness(state).ready, true);
    assert.equal(draftReadiness(state).requiredFilled, 1);
    assert.equal(state.notes.conclusion, '');
    const optional = engine.confirmSchema(engine.setField(state, { ...field, required: false }));
    assert.equal(draftReadiness(engine.startNewRun(optional)).ready, false, 'All blank optional fields still cannot start a diagnosis');
});
test('native writer preserves mixed character styles, paragraph properties, table geometry, fonts and binary pictures', async () => {
    const [parser, engine, , writer] = await modules;
    let { bytes, work: state } = await work();
    const field = state.fields[0], slots = writer.fieldTextSlots(state, field);
    assert.equal(slots.length, 2);
    assert.equal(slots[0].charShapeId, '9'); assert.equal(slots[1].charShapeId, '10');
    state = engine.confirmSchema(state); state = engine.setValue(state, field.id, '230');
    assert.ok(writer.planNativeWrite(state).errors.some(error => error.includes('서식 구간')));
    state = engine.setField(state, { ...field, binding: { ...field.binding, slotId: slots[0].id } });
    state = engine.confirmSchema(state);
    const output = await writer.writeNativeReport(state, bytes);
    assert.equal(output.review.status, 'hancom-review-required');
    const oldParts = unzipSync(bytes), newParts = unzipSync(output.bytes);
    for (const key of ['Contents/header.xml', 'BinData/image1.png', 'META-INF/container.xml', 'mimetype']) assert.deepEqual(newParts[key], oldParts[key]);
    const oldXml = strFromU8(oldParts['Contents/section0.xml']), newXml = strFromU8(newParts['Contents/section0.xml']);
    assert.equal(newXml, oldXml.replace('<hp:t>220</hp:t>', '<hp:t>230</hp:t>'));
    assert.doesNotMatch(strFromU8(newParts['Preview/PrvText.txt']), /220/);
    assert.equal(newParts['Preview/PrvImage.png'], undefined);
    const roundtrip = await parser.analyzeReport(output.bytes);
    assert.equal(roundtrip.tables[0].cells.at(-1).text, '230 V');
    assert.equal(roundtrip.tables[0].cells.at(-1).textSlots[1].charShapeId, '10');
});

test('numeric replacements retain native unit glyphs and grouping without duplicating units in other runs', async () => {
    const [parser, engine, , writer] = await modules;
    for (const [original, suffix, unit, value, expected] of [['220 V', '', 'V', '230', '230 V'], ['40,000㎾', '', 'kW', '45000.5', '45,000.5㎾'], ['220', ' V', 'V', '230', '230 V']]) {
        const bytes = fixture(original, suffix), document = await parser.analyzeReport(bytes);
        let state = engine.createWorkspace({ id: 'units' }, document);
        const table = document.tables[0], cell = table.cells.at(-1);
        const field = { ...engine.proposeCellField(document, table, cell), type: 'number', unit };
        field.binding.slotId = cell.textSlots[0].id;
        state = engine.setField(state, field); state = engine.confirmSchema(state); state = engine.setValue(state, field.id, value);
        const output = await writer.writeNativeReport(state, bytes), doc = await parser.analyzeReport(output.bytes);
        assert.equal(doc.tables[0].cells.at(-1).text, expected);
    }
});
test('native blank output clears only designated data; narrative roles use interpreted notes', async () => {
    const [parser, engine, forms, writer] = await modules;
    let { bytes, work: state } = await work();
    const first = state.fields[0], slot = writer.fieldTextSlots(state, first)[0];
    state = engine.setField(state, { ...first, binding: { ...first.binding, slotId: slot.id } });
    const paragraph = state.document.paragraphs.find(p => p.text === '과거 진단 의견');
    state = engine.setField(state, { id: paragraph.id, label: '진단 내용', group: '종합 평가', type: 'text', unit: '', required: true, reference: paragraph.text, valueSource: 'diagnosis', binding: { sourceSha256: state.source.sha256, paragraphId: paragraph.id, ...paragraph.anchor } });
    state = engine.confirmSchema(state);
    assert.equal((await forms.createCollectionForm(state)).fields.length, 1);
    const blank = await writer.writeNativeReport(state, bytes, 'blank');
    const blankDoc = await parser.analyzeReport(blank.bytes);
    assert.equal(blankDoc.tables[0].cells.at(-1).text, 'V');
    assert.ok(blankDoc.paragraphs.some(p => p.text === '[표 1] 측정 결과'));
    assert.ok(!blankDoc.paragraphs.some(p => p.text === '과거 진단 의견'));
    state = engine.setValue(state, first.id, '231');
    state = engine.setNotes(state, { diagnosis: '측정 결과에 따른 새로운 진단 내용\n추가 검토 필요' });
    const output = await writer.writeNativeReport(state, bytes);
    const doc = await parser.analyzeReport(output.bytes);
    assert.ok(doc.paragraphs.some(p => p.text.includes('새로운 진단 내용\n추가 검토')));
});

test('editable drafts allow unfinished conclusions and visibly mark assessments made before data changes', async () => {
    const [parser, engine, , writer] = await modules;
    let { bytes, work: state } = await work();
    const input = state.fields[0];
    state = engine.setField(state, { ...input, binding: { ...input.binding, slotId: writer.fieldTextSlots(state, input)[0].id } });
    const paragraph = state.document.paragraphs.find(p => p.text === '과거 진단 의견');
    state = engine.setField(state, { id: paragraph.id, label: '종합 의견 초안', group: '담당자 검토', type: 'text', unit: '', required: true, reference: paragraph.text, valueSource: 'conclusion', binding: { sourceSha256: state.source.sha256, paragraphId: paragraph.id, ...paragraph.anchor } });
    state = engine.confirmSchema(state); state = engine.setValue(state, input.id, '230');
    assert.deepEqual(writer.planNativeWrite(state).errors, []);
    const output = await writer.writeNativeReport(state, bytes);
    const doc = await parser.analyzeReport(output.bytes);
    assert.ok(doc.paragraphs.some(p => p.text === '[담당자 작성·검토 필요]'));
    assert.ok(!doc.paragraphs.some(p => p.text === '과거 진단 의견'));
    const stale = { ...engine.setNotes(state, { conclusion: '잠정적 진단 의견' }), interpretationStale: true };
    const plan = writer.planNativeWrite(stale);
    assert.deepEqual(plan.errors, []);
    assert.ok(plan.warnings.some(text => text.includes('데이터가 변경')));
    assert.match(plan.replacements.find(item => item.fieldId === paragraph.id).value, /재검토 필요.*\n잠정적/s);
});

test('separate diagnosis paragraphs receive their own AI text and retain independent manual edits', async () => {
    const [parser, engine, , writer, interpreter] = await modules;
    let { bytes, work: state } = await work();
    const input = state.fields[0];
    state = engine.setField(state, { ...input, binding: { ...input.binding, slotId: writer.fieldTextSlots(state, input)[0].id } });
    const targets = [state.document.paragraphs.find(p => p.text === '과거 진단 의견'), state.document.paragraphs.at(-1)];
    for (const [index, p] of targets.entries()) state = engine.setField(state, { id: p.id, label: `설비 ${index + 1} 진단`, group: `전기실 ${index + 1}`, type: 'text', unit: '', required: true, reference: p.text, valueSource: 'diagnosis', binding: { sourceSha256: state.source.sha256, paragraphId: p.id, ...p.anchor } });
    state = engine.confirmSchema(state); state = engine.setValue(state, input.id, '230'); state = engine.setNotes(state, { diagnosis: '전체 종합 요약' }); state = engine.buildDraft(state);
    assert.equal(engine.narrativeValue(state, state.fields[1]), '', 'Do not repeat a global summary in multiple paragraphs');
    const request = await interpreter.createInterpretationRequest(state);
    assert.equal(request.narrativeTargets.length, 2);
    const response = { ...request.responseContract, notes: { diagnosis: '전체 요약', conclusion: '', improvements: '' }, evidenceFieldIds: [input.id], fieldNotes: targets.map((p, index) => ({ fieldId: p.id, text: `전기실 ${index + 1}의 개별 진단 초안`, evidenceFieldIds: [input.id] })) };
    state = await interpreter.applyInterpretation(state, response);
    state = engine.setNarrativeValue(state, targets[0].id, '담당자가 수정한 1번 전기실 진단');
    const output = await writer.writeNativeReport(state, bytes), doc = await parser.analyzeReport(output.bytes);
    assert.ok(doc.paragraphs.some(p => p.text === '담당자가 수정한 1번 전기실 진단'));
    assert.ok(doc.paragraphs.some(p => p.text === '전기실 2의 개별 진단 초안'));
    assert.ok(!doc.paragraphs.some(p => p.text === '전체 요약'));
    assert.match(engine.draftHtml(engine.buildDraft(state).draft), /담당자가 수정한 1번/);
    const fresh = engine.startNewRun(state);
    assert.deepEqual(fresh.narrativeValues, {});
    assert.equal(engine.restoreLastRun(fresh).narrativeValues[targets[0].id], '담당자가 수정한 1번 전기실 진단');
    const invalid = { ...response, fieldNotes: [{ fieldId: targets[0].id, text: '근거 없는 의견', evidenceFieldIds: [] }] };
    await assert.rejects(interpreter.validateInterpretation({ ...state, values: { ...state.values, [input.id]: '250' } }, invalid), /일치/);
    const freshRequest = await interpreter.createInterpretationRequest(engine.buildDraft(state));
    await assert.rejects(interpreter.validateInterpretation(state, { ...invalid, inputFingerprint: freshRequest.inputFingerprint }), /근거/);
});
test('native writer refuses wrong versions and duplicate positions and supports empty native text slots', async () => {
    const [, engine, , writer, , packageApi] = await modules;
    let { bytes, work: state } = await work();
    const field = state.fields[0], slot = writer.fieldTextSlots(state, field)[0];
    const bound = { ...field, binding: { ...field.binding, slotId: slot.id } };
    state = engine.setField(state, bound); state = engine.setField(state, { ...bound, id: 'duplicate' }); state = engine.confirmSchema(state);
    assert.ok(writer.planNativeWrite(state, 'blank').errors.some(error => error.includes('겹칩니다')));
    await assert.rejects(packageApi.replaceHwpxSlots(bytes, '0'.repeat(64), []), /버전/);
    const empty = state.document.paragraphs.flatMap(p => p.textSlots).find(slot => slot.selfClosing);
    // The fixture uses an explicit empty hp:t; exercise that insertion path as well.
    const fallback = empty || state.document.paragraphs.flatMap(p => p.textSlots).find(slot => slot.text === '');
    const output = await packageApi.replaceHwpxSlots(bytes, state.source.sha256, [{ section: fallback.section, slotId: fallback.id, value: '새 문장 <검토> & 확인', expectedText: '' }]);
    assert.match(strFromU8(unzipSync(output.bytes)['Contents/section0.xml']), /새 문장 &lt;검토&gt; &amp; 확인/);
});
test('interpreter requests only relevant data, validates evidence and rejects stale evaluation results', async () => {
    const [, engine, , writer, interpreter] = await modules;
    let { work: state } = await work();
    state = engine.setField(state, { ...state.fields[0], binding: { ...state.fields[0].binding, slotId: writer.fieldTextSlots(state, state.fields[0])[0].id } });
    state = engine.confirmSchema(state); state = engine.setValue(state, state.fields[0].id, '230'); state = engine.buildDraft(state);
    const request = await interpreter.createInterpretationRequest(state);
    assert.equal(request.inputFingerprint.length, 64);
    const response = { ...request.responseContract, notes: { diagnosis: '추가 확인 필요', conclusion: '', improvements: '' }, evidenceFieldIds: [state.fields[0].id], questions: ['진단기기 교정 성적서를 제공해 주세요.'] };
    const applied = await interpreter.applyInterpretation(state, response);
    assert.equal(applied.notes.diagnosis, '추가 확인 필요');
    assert.equal(applied.interpretation.questions.length, 1);
    assert.equal(applied.draft, null);
    const changed = engine.setValue(applied, state.fields[0].id, '240');
    assert.equal(changed.interpretationStale, true);
    assert.ok(writer.planNativeWrite(changed).warnings.some(text => text.includes('평가 이후')));
    assert.equal(engine.confirmManualNotes(changed).interpretationStale, false);
    assert.equal(engine.startNewRun(applied).interpretation, null);
    await assert.rejects(interpreter.applyInterpretation(engine.setValue(state, state.fields[0].id, '240'), response), /최신 데이터/);
    await assert.rejects(interpreter.validateInterpretation(state, { ...response, evidenceFieldIds: ['unknown'] }), /근거/);
    await assert.rejects(interpreter.validateInterpretation(state, { ...response, evidenceFieldIds: [] }), /근거/);
});

test('analyzer proposals bind to actual source cells and style slots and never copy previous measurements', async () => {
    const [, engine, , writer, , , analyzer] = await modules;
    const { work: state } = await work();
    const request = await analyzer.createAnalysisRequest(state, [state.document.tables[0].id]);
    assert.equal(request.tableDetails.length, 1);
    const slot = writer.fieldTextSlots(state, state.fields[0])[0];
    const proposal = { ...request.responseContract, fields: [{ targetId: state.fields[0].binding.cellId, slotId: slot.id,
        label: '1호기 전압', group: '현장 A / 전기실', type: 'number', unit: 'V', required: true, valueSource: 'input' }], questions: ['적용 판정 기준을 확인해 주세요.'] };
    const next = await analyzer.applyAnalysis(state, proposal);
    assert.equal(next.fields.length, 2);
    assert.deepEqual(next.values, {});
    assert.equal(next.fields.at(-1).binding.slotId, slot.id);
    assert.equal(next.confirmedRevision, null);
    assert.equal(next.analysisRequests.length, 1);
    await assert.rejects(analyzer.validateAnalysis(state, { ...proposal, fields: [{ ...proposal.fields[0], targetId: 'fake-source' }] }), /원본 위치/);
    const redefined = engine.setField(state, { ...state.fields[0], unit: 'kV' });
    await assert.rejects(analyzer.validateAnalysis(redefined, proposal), /일치/);
});

test('native export invalidates changed paragraph layout caches and stores package signatures uncompressed', async () => {
    const [parser, , , , , packageApi] = await modules;
    const { bytes, work: state } = await work();
    const paragraph = state.document.paragraphs.find(p => p.text === '과거 진단 의견'), slot = paragraph.textSlots[0];
    assert.equal(paragraph.layoutCaches.length, 1);
    const result = await packageApi.replaceHwpxSlots(bytes, state.source.sha256, [{ slotId: slot.id, section: slot.section, expectedText: slot.text, value: '짧음' }]);
    const doc = await parser.analyzeReport(result.bytes);
    assert.equal(doc.paragraphs.find(p => p.text === '짧음').layoutCaches.length, 0);
    assert.equal(doc.paragraphs.find(p => p.text === '[표 1] 측정 결과').layoutCaches.length, 1);
    const data = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength);
    const methods = {};
    for (let offset = 0; offset + 30 < data.byteLength && data.getUint32(offset, true) === 0x04034b50;) {
        const size = data.getUint32(offset + 18, true), nameLength = data.getUint16(offset + 26, true), extraLength = data.getUint16(offset + 28, true);
        const name = new TextDecoder().decode(result.bytes.subarray(offset + 30, offset + 30 + nameLength));
        methods[name] = data.getUint16(offset + 8, true);
        offset += 30 + nameLength + extraLength + size;
    }
    assert.equal(Object.keys(methods)[0], 'mimetype');
    assert.equal(methods.mimetype, 0); assert.equal(methods['version.xml'], 0);
});
