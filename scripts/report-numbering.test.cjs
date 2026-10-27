const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const api = import('../src/services/report/reportNumbering.js');
const run = (text, style = 7) => `<hp:run charPrIDRef="${style}"><hp:t>${text}</hp:t></hp:run>`;
const p = text => `<hp:p paraPrIDRef="31" styleIDRef="4">${run(text)}<hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>`;
const rich = text => `<hp:p paraPrIDRef="31">${text}<hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>`;
const table = (caption = '') => `<hp:p><hp:run><hp:tbl id="123" rowCnt="1" colCnt="1">${caption ? `<hp:caption>${caption}</hp:caption>` : ''}<hp:tr><hp:tc><hp:subList>${p('설비 목록 380V')}</hp:subList><hp:cellAddr rowAddr="0" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`;
const pic = (caption = '') => `<hp:p><hp:run><hp:pic id="456"><hp:img binaryItemIDRef="image1"/>${caption ? `<hp:caption>${caption}</hp:caption>` : ''}</hp:pic></hp:run></hp:p>`;
const numberedTable = caption => p(caption) + table();
const numberedPic = caption => pic() + p(caption);
function fixture(sections) {
    return zipSync({ mimetype: [strToU8('application/hwp+zip'), { level: 0 }],
        'Contents/header.xml': strToU8('<hh:head xmlns:hh="header"><hh:charPr id="7" height="1200"/></hh:head>'),
        'BinData/image1.png': new Uint8Array([1, 2, 3, 4]),
        ...Object.fromEntries(Object.entries(typeof sections === 'string' ? { 0: sections } : sections).map(([index, body]) =>
            [`Contents/section${index}.xml`, strToU8(`<hs:sec xmlns:hs="section" xmlns:hp="paragraph">${body}</hs:sec>`)])),
    });
}
const xml = (output, section = 0) => strFromU8(unzipSync(output.bytes)[`Contents/section${section}.xml`]);
const text = output => xml(output).replace(/<[^>]*>/g, '');

test('draft numbers tables and figures independently and updates references before and after their targets', async () => {
    const { repairReportNumbering } = await api;
    const bytes = fixture(p('분석은 &lt;표 7&gt; 및 그림 8을 참조한다.') + numberedTable('[표 3] 첫 측정') + numberedTable('[표 7] 두 번째 측정')
        + numberedPic('[그림 4] 첫 시설') + numberedPic('[그림 8] 두 번째 시설') + p('표 3과 표 7을 비교하였다.'));
    const output = repairReportNumbering(bytes), content = text(output);
    assert.match(content, /&lt;표 2&gt; 및 그림 2을/);
    assert.match(content, /\[표 1\] 첫 측정.*\[표 2\] 두 번째 측정/);
    assert.match(content, /\[그림 1\] 첫 시설.*\[그림 2\] 두 번째 시설/);
    assert.match(content, /표 1과 표 2을 비교/);
    assert.equal(output.report.tables, 2); assert.equal(output.report.figures, 2);
    assert.equal(output.report.status, 'corrected');
    assert.deepEqual(unzipSync(output.bytes)['BinData/image1.png'], unzipSync(bytes)['BinData/image1.png']);
    assert.deepEqual(unzipSync(output.bytes)['Contents/header.xml'], unzipSync(bytes)['Contents/header.xml']);
    assert.equal(repairReportNumbering(output.bytes).report.corrections.length, 0, 'A second pass must be stable');
});

test('chapter and subsection prefixes survive; sections are ordered numerically and counts span section boundaries', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture({ 10: numberedTable('&lt;표 4-3-11&gt; 후속 측정') + numberedTable('[표 5.2.8] 전기 측정'),
        2: numberedTable('&lt;표 4-3-9&gt; 첫 측정') }));
    assert.match(xml(output, 2), /표 4-3-1/); assert.match(xml(output, 10), /표 4-3-2/); assert.match(xml(output, 10), /표 5.2.1/);
});

test('chapter-prefix conflicts are reported instead of silently accepting a different numbering hierarchy', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture(p('제 4 장 기계 및 배관설비') + numberedTable('[표 5-3-8] 점검 결과')));
    assert.ok(output.report.warnings.some(message => message.includes('제4장과 다릅니다')));
    assert.equal(output.report.status, 'review-required');
});

test('split character runs retain their styles and only edited paragraph layout caches are invalidated', async () => {
    const { repairReportNumbering } = await api;
    const caption = rich(run('[표 4-', 8) + run('3-', 9) + run('1', 10) + run('2] 측정', 11));
    const ref = rich(run('표 4-3-', 12) + run('12', 13) + run('를 확인한다.', 14));
    const output = repairReportNumbering(fixture(caption + table() + ref + p('주변 본문')));
    assert.match(xml(output), /charPrIDRef="10"><hp:t>1<\/hp:t>/);
    assert.match(xml(output), /charPrIDRef="11"><hp:t>] 측정<\/hp:t>/);
    assert.match(xml(output), /charPrIDRef="13"><hp:t>1<\/hp:t>/);
    assert.match(xml(output), /주변 본문<\/hp:t>.*?<hp:linesegarray>/);
    assert.equal(output.report.corrections.length, 2);
});

test('explicit continuation tables share one ordinal while later tables advance the sequence', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture(numberedTable('[표 4-3-5] 점검표') + numberedTable('[표 4-3-5] 점검표 (계속)')
        + numberedTable('[표 4-3-6] 성능표') + p('표 4-3-5를 참조한다.')));
    assert.equal(output.report.tables, 2);
    assert.equal((text(output).match(/\[표 4-3-1\]/g) || []).length, 2);
    assert.match(text(output), /표 4-3-2\] 성능표/);
    assert.match(text(output), /표 4-3-1를 참조/);
    assert.deepEqual(output.report.warnings, []);
});

test('duplicate original numbers are corrected but ambiguous references remain visible for review', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture(numberedTable('[표 3] 첫 표') + numberedTable('[표 3] 둘째 표') + p('표 3을 참조한다.')));
    assert.match(text(output), /\[표 1\] 첫 표.*\[표 2\] 둘째 표/);
    assert.match(text(output), /표 3을 참조/);
    assert.ok(output.report.warnings.some(message => message.includes('중복')));
    assert.equal(output.report.status, 'review-required');
});

test('TOC labels follow captions without becoming extra captions or changing page numbers', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture(p('표 목차') + p('[표 7] 측정 결과 ........ 32') + numberedTable('[표 7] 측정 결과')));
    assert.equal(output.report.tables, 1);
    assert.match(text(output), /\[표 1\] 측정 결과 ........ 32/);
    assert.ok(output.report.warnings.some(message => message.includes('목차')));
});

test('dangling, external and range references are reported instead of silently assigning a different target', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture(numberedTable('[표 7] 현장 결과') + p('표 7~9를 참조한다.')
        + p('전회차 보고서의 표 7을 인용한다.') + p('그림 99를 확인한다.')));
    assert.match(text(output), /표 7~9/); assert.match(text(output), /전회차 보고서의 표 7/); assert.match(text(output), /그림 99/);
    assert.ok(output.report.warnings.some(message => message.includes('연결되는')));
    assert.ok(output.report.warnings.filter(message => message.includes('범위·외부')).length >= 2);
});

test('native table/figure counters and existing start controls are repaired without touching page or footnote counters', async () => {
    const { repairReportNumbering } = await api;
    const auto = (kind, num) => `<hp:run><hp:ctrl><hp:autoNum num="${num}" numType="${kind}"><hp:autoNumFormat type="DIGIT" prefixChar="" suffixChar=""/></hp:autoNum></hp:ctrl></hp:run>`;
    const body = '<hp:startNum table="8" pic="6" page="31"/>'
        + table(rich(run('[표 ') + auto('TABLE', 8) + run('] 설비 현황')))
        + '<hp:p><hp:run><hp:ctrl><hp:newNum num="9" numType="TABLE"/><hp:newNum num="31" numType="PAGE"/></hp:ctrl></hp:run></hp:p>'
        + table(rich(run('[표 ') + auto('TABLE', 9) + run('] 점검 결과')))
        + pic(rich(run('[그림 ') + auto('PICTURE', 6) + run('] 계통도')))
        + rich(auto('PAGE', 31) + auto('FOOTNOTE', 5));
    const output = repairReportNumbering(fixture(body));
    assert.match(xml(output), /startNum table="1" pic="1" page="31"/);
    assert.match(xml(output), /autoNum num="1" numType="TABLE"/);
    assert.match(xml(output), /autoNum num="2" numType="TABLE"/);
    assert.match(xml(output), /autoNum num="1" numType="PICTURE"/);
    assert.match(xml(output), /newNum num="2" numType="TABLE"/);
    assert.match(xml(output), /newNum num="31" numType="PAGE"/);
    assert.match(xml(output), /autoNum num="5" numType="FOOTNOTE"/);
    assert.equal(output.report.tables, 2); assert.equal(output.report.figures, 1);
    assert.equal(repairReportNumbering(output.bytes).report.corrections.length, 0);
});

test('caption titles beginning with Korean particles remain valid and figures grouped in layout tables are numbered once', async () => {
    const { repairReportNumbering } = await api;
    const layout = table().replace('설비 목록 380V', '').replace('<hp:subList>', '<hp:subList>' + pic());
    const output = repairReportNumbering(fixture(numberedTable('[표 7] 가동현황') + layout + p('[그림 8] 와류 발생 현황')));
    assert.equal(output.report.tables, 1); assert.equal(output.report.figures, 1);
    assert.match(text(output), /\[표 1\] 가동현황/); assert.match(text(output), /\[그림 1\] 와류/);
    assert.deepEqual(output.report.uncaptionedObjects, []);
});

test('native caption format prefixes preserve chapter numbering and explicit resets survive a second repair', async () => {
    const { repairReportNumbering } = await api;
    const auto = (prefix, num) => rich(`<hp:run><hp:ctrl><hp:autoNum num="${num}" numType="TABLE"><hp:autoNumFormat type="DIGIT" prefixChar="[표 ${prefix}-" suffixChar="] "/></hp:autoNum></hp:ctrl></hp:run>` + run('점검 현황'));
    const output = repairReportNumbering(fixture(table(auto('4-3', 7)) + table(auto('5-2', 8))));
    assert.deepEqual(output.report.captions.map(item => item.after), ['4-3-1', '5-2-1']);
    assert.equal((xml(output).match(/newNum num="1" numType="TABLE"/g) || []).length, 2);
    assert.equal(repairReportNumbering(output.bytes).report.corrections.length, 0);
});

test('unsupported compound text stays intact and its references are never redirected to a number that was not written', async () => {
    const { repairReportNumbering } = await api;
    const caption = rich('<hp:run><hp:t>[표 7]<hp:tab width="800"/> 측정값</hp:t></hp:run>');
    const output = repairReportNumbering(fixture(caption + table() + p('표 7을 확인한다.')));
    assert.match(xml(output), /\[표 7\]<hp:tab width="800"\/>/);
    assert.match(text(output), /표 7을 확인/);
    assert.ok(output.report.warnings.some(message => message.includes('복합 번호')));
    assert.equal(output.report.captions[0].after, '7');
});

test('native linked reference fields are left for Hancom refresh, and non-decimal counters are reported', async () => {
    const { repairReportNumbering } = await api;
    const field = rich('<hp:run><hp:ctrl><hp:fieldBegin type="CROSSREF" id="1"/></hp:ctrl></hp:run>' + run('표 7을 참조한다.'));
    const roman = rich('<hp:run><hp:ctrl><hp:autoNum num="7" numType="PICTURE"><hp:autoNumFormat type="ROMAN_CAPITAL"/></hp:autoNum></hp:ctrl></hp:run>' + run('계통도'));
    const output = repairReportNumbering(fixture(numberedTable('[표 7] 측정표') + field + pic(roman)));
    assert.match(text(output), /표 7을 참조/);
    assert.match(xml(output), /autoNum num="7" numType="PICTURE"/);
    assert.ok(output.report.warnings.some(message => message.includes('필드')));
    assert.ok(output.report.warnings.some(message => message.includes('숫자 이외')));
});

test('reference sentences beside objects do not become captions; layout tables without captions are reported', async () => {
    const { repairReportNumbering } = await api;
    const output = repairReportNumbering(fixture(p('표 8에서 확인한 결과는 다음과 같다.') + table() + numberedTable('[표 7] 실제 점검표')));
    assert.equal(output.report.tables, 1);
    assert.match(text(output), /표 8에서 확인/);
    assert.equal(output.report.uncaptionedObjects.length, 1);
});

test('native draft repair runs after fresh narrative replacement and does not renumber blank survey output or mutate the source', async () => {
    const [{ analyzeReport }, engine, writer] = await Promise.all([import('../src/services/report/sourceParser.js'), import('../src/services/report/reportEngine.js'), import('../src/services/report/nativeWriter.js')]);
    const bytes = fixture(numberedTable('[표 7] 측정표') + p('과거 의견'));
    const original = new Uint8Array(bytes), doc = await analyzeReport(bytes);
    const paragraph = doc.paragraphs.find(item => item.text === '과거 의견');
    let state = engine.createWorkspace({ id: 'numbering-project' }, doc);
    state = engine.setField(state, { id: paragraph.id, label: '새 의견', group: '진단', type: 'text', unit: '', required: true,
        valueSource: 'diagnosis', binding: { sourceSha256: state.source.sha256, paragraphId: paragraph.id } });
    state = engine.confirmSchema(state); state = engine.setNotes(state, { diagnosis: '표 7을 근거로 작성하였다.' });
    const output = await writer.writeNativeReport(state, bytes);
    assert.match(text(output), /\[표 1\] 측정표/); assert.match(text(output), /표 1을 근거로 작성/);
    assert.equal(output.review.numbering.corrections.length, 2);
    assert.deepEqual(bytes, original);
    const blank = await writer.writeNativeReport(state, bytes, 'blank');
    assert.match(text(blank), /\[표 7\]/); assert.equal(blank.review.numbering, null);
});
