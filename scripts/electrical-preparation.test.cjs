const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = import('../src/services/report/electricalPreparation.js');

test('electrical candidates retain source and structural anchors without promoting historical values', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { inspectElectricalSource } = await api;
    const p = text => `<hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p>`;
    const cell = (column, text) => `<hp:tc><hp:subList>${p(text)}</hp:subList><hp:cellAddr rowAddr="0" colAddr="${column}"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>`;
    const bytes = zipSync({ mimetype: strToU8('application/hwp+zip'), 'Contents/section0.xml': strToU8('<hs:sec xmlns:hs="s" xmlns:hp="p">'
        + p('제7장 전기 및 계측설비') + p('7.2 한전 전력량 분석') + p('전회 진단: 절연저항 100 MΩ, 양호') + p('[표 7-2] 운전전류 측정')
        + '<hp:p><hp:run><hp:tbl rowCnt="1" colCnt="2"><hp:tr>' + cell(0, 'P-001') + cell(1, '10 A') + '</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>') });
    const before = bytes.slice(), result = await inspectElectricalSource(bytes, '제7장.hwpx');
    assert.deepEqual(bytes, before);
    assert.equal(result.reportReady, false); assert.equal(result.status, 'candidates');
    assert.match(result.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(result.candidates.some(item => item.sections.includes('kepco')));
    const old = result.candidates.find(item => item.sections.includes('insulation'));
    assert.ok(old.id && old.anchor.section && old.anchor.path); assert.match(old.excerpt, /100 MΩ/);
    assert.equal(old.judgement, undefined); assert.equal(old.newValue, undefined);
    const table = result.candidates.find(item => item.kind === 'table');
    assert.ok(table.sections.includes('current')); assert.equal(table.cells[1].column, 1); assert.ok(table.cells[1].id.startsWith(table.id));
});

test('input links require a source hash and category-compatible file; plan invalidates with source changes', async () => {
    const { linkElectricalInput, electricalPlanIsCurrent } = await api;
    const material = { id: 'm', sha256: 'a'.repeat(64), filename: '측정.pwv', format: 'pwv' };
    assert.equal(linkElectricalInput(material, 'quality').sha256, material.sha256);
    assert.throws(() => linkElectricalInput(material, 'thermal'), /파일 형식/);
    assert.throws(() => linkElectricalInput({ ...material, sha256: '' }, 'quality'), /원본 연결/);
    const plan = { signature: 'original', files: [{ entryId: 'e', source: { sha256: material.sha256 } }] };
    const entries = [{ id: 'e', sha256: material.sha256 }];
    assert.ok(electricalPlanIsCurrent(plan, 'original', entries));
    assert.equal(electricalPlanIsCurrent(plan, 'new-signature', entries), false);
    assert.equal(electricalPlanIsCurrent(plan, 'original', [{ id: 'e', sha256: 'b'.repeat(64) }]), false);
});

test('KEPCO follows the current report, preserves explicit choices and does not infer absence from incomplete analysis', async () => {
    const { resolveKepcoScope } = await api;
    const plan = { files: [{ candidates: [{ sections: ['thermal'] }] }], failures: [] };
    assert.equal(resolveKepcoScope({ plan }, true).mode, 'exclude');
    assert.equal(resolveKepcoScope({ plan }, false).mode, 'pending');
    assert.equal(resolveKepcoScope({ plan: { ...plan, failures: [{ error: 'failed' }] } }, true).mode, 'pending');
    assert.equal(resolveKepcoScope({ plan: { ...plan, files: [{ candidates: [], truncated: true }] } }, true).mode, 'pending');
    assert.equal(resolveKepcoScope({ plan: { ...plan, files: [{ candidates: [{ sections: ['kepco'] }] }] } }, true).mode, 'include');
    assert.equal(resolveKepcoScope({ plan, kepcoMode: 'include' }, true).mode, 'include');
    assert.equal(resolveKepcoScope({ kepcoMode: 'exclude', inputs: { kepco: [{}] } }).mode, 'exclude');
    assert.equal(resolveKepcoScope({ inputs: { kepco: [{}] } }).mode, 'include');
});
