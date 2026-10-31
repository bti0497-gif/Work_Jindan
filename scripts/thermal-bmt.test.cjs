const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./fixtures/thermal-bmt.cjs');
const api = import('../src/services/report/thermalBmt.js');
test('BMT extracts metadata, images and real array dimensions while raw readings remain unconverted', async () => {
    const { inspectThermalBmt } = await api, bytes = fixture({ columns: 4, rows: 4, superResolution: true }), before = Buffer.from(bytes);
    const result = await inspectThermalBmt(bytes, 'SR-test.BMT', { includeImages: true });
    assert.deepEqual(bytes, before); assert.equal(result.device, 'Testo fixture'); assert.equal(result.recordedClock, '2023-02-24 12:42:08');
    assert.equal(result.timeZone, 'unconfirmed'); assert.equal(result.superResolution, true); assert.equal(result.detector.columns,2); assert.equal(result.grid.columns,4);
    assert.equal(result.grid.samples,16); assert.equal(result.grid.rawMaximum,8015); assert.equal(result.grid.temperatureC,null); assert.equal(result.points[0].temperatureC,null);
    assert.equal(result.reportReady,false); assert.ok(Math.abs(result.environment.reflectedTemperature.celsius-20)<.001);
    assert.match(result.source.sha256,/^[a-f0-9]{64}$/); assert.equal(result.images.real[0],255); assert.equal(result.images.preview[0],255);
    assert.match(result.warnings.join(' '),/표시 범위 설정/);
});
test('BMT rejects plain JPEGs, unsupported versions, XML entities, truncation and inconsistent binary sizes', async () => {
    const { readThermalBmt } = await api, bytes = fixture();
    assert.throws(()=>readThermalBmt(Buffer.from([255,216,255,217])),/ToFo/);
    assert.throws(()=>readThermalBmt(fixture({version:'9.0'})),/버전/);
    assert.throws(()=>readThermalBmt(bytes.subarray(0,bytes.length-20)),/길이/);
    const text = bytes.toString('latin1');
    assert.throws(()=>readThermalBmt(Buffer.from(text.replace('size="2"','size="0"'),'latin1')),/크기/);
    assert.throws(()=>readThermalBmt(Buffer.from(text.replace('<xml ','<!ENTITY x "bad"><xml '),'latin1')),/형식 정보/);
});
test('IRSoft editor marker blocks are distinguished from camera points, never silently promoted to final edited measurements', async () => {
    const {inspectThermalBmt}=await api;
    const result=await inspectThermalBmt(fixture({editorMarkers:true}),'edited.bmt');
    assert.equal(result.editor.savedByIrsoft,true);assert.equal(result.editor.hasEditorMarkers,true);
    assert.equal(result.editor.editedPointsVerified,false);assert.equal(result.pointsSource,'camera-metadata');
    assert.match(result.warnings.join(' '),/재지정한 최종 탐지점/);assert.equal(result.reportReady,false);
});
