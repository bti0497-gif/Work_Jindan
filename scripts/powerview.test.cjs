const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const api = import('../src/services/report/powerView.js');
const bytes = xml => new TextEncoder().encode(xml);
function fixture({ compression='None', type='Single', values=[223.25, NaN, 224.5], gain='10', flag=true, count=3 }={}) {
    const raw = Buffer.alloc(values.length * 4); values.forEach((v,i)=>raw.writeFloatLE(v,i*4));
    const data = (compression==='GZip' ? zlib.gzipSync(raw) : raw).toString('base64');
    return bytes(`<PQData xmlns="http://tempuri.org/PQData.xsd"><PQSites><PQSite ID="site" Name="새 진단 시설"/></PQSites><PQInstruments><PQInstrument ID="device"><Company>Metrel</Company><Model>MI 2883</Model></PQInstrument></PQInstruments><PQRecordSettings><PQRecordSetting ID="setting"><CurrentRatios>원본 설정</CurrentRatios></PQRecordSetting></PQRecordSettings><PQDataRecords><PQDataSingleRecord><PQRecordProperties><ID>record</ID><Name>General fixture</Name><SubType>General</SubType><ActualStartTime>2026-11-05T09:00:00</ActualStartTime></PQRecordProperties><PQTimeAxis><Representation>EquallySpacedArray</Representation><NumberOfSamples>${count}</NumberOfSamples></PQTimeAxis><PQRecord><PQChannels><PQChannel ID="voltage"><QuantityInfo QuantityType="Voltage" PhaseType="Phase" PhaseNumber="1"/><PQMeasurements ID="rms"><BinaryData Compression="${compression}" DataType="${type}" Encoding="Base64Binary">${data}</BinaryData><IntervalType>RmsAvg</IntervalType><UnitInfo Unit="Volts"/><ConversionConstants Gain="${gain}"/>${flag?'<BinaryFlags>AA==</BinaryFlags>':''}</PQMeasurements></PQChannel></PQChannels><PQScalars><ScalarValue><QuantityInfo QuantityType="PowerFactor" PhaseNumber="2"/><UnitInfo/><Value>0.875</Value></ScalarValue><ScalarValue><QuantityInfo QuantityType="VoltageTHD"/><Value>NaN</Value></ScalarValue></PQScalars></PQRecord></PQDataSingleRecord></PQDataRecords></PQData>`);
}
test('PWV retains raw measurements, phase, gain and exclusion flags without certifying report values',async()=>{
    const { inspectPowerView }=await api;
    for(const compression of ['None','GZip']){
        const report=await inspectPowerView(fixture({compression}),'새 측정.pwv');
        const channel=report.records[0].channels[0], measurement=channel.measurements[0];
        assert.equal(report.instruments[0].model,'MI 2883');assert.equal(report.sites[0].Name,'새 진단 시설');
        assert.equal(channel.quantity.PhaseNumber,'1');assert.equal(measurement.interval,'RmsAvg');assert.equal(measurement.conversion.Gain,'10');assert.equal(measurement.hasFlags,true);
        assert.deepEqual(measurement.raw.preview,[223.25,null,224.5]);assert.equal(measurement.raw.missingCount,1);assert.equal(measurement.raw.min,223.25);
        assert.equal(report.records[0].scalars[0].value,0.875);assert.equal(report.records[0].scalars[1].value,null);
        assert.equal(report.reportReady,false);assert.equal(report.status,'raw-preview');assert.match(report.sourceSha256,/^[a-f0-9]{64}$/);
    }
});
test('PWV rejects unrelated/unsafe XML and reports unsupported data and sample-axis conflicts explicitly',async()=>{
    const {inspectPowerView,readPowerViewXml}=await api;
    for(const xml of ['<document/>','<PQData>','<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///secret">]><PQData/>','<PQData><PQSites/></PQData>'])assert.throws(()=>readPowerViewXml(bytes(xml)));
    assert.throws(()=>readPowerViewXml(new Uint8Array([255,255])));
    const unsupported=await inspectPowerView(fixture({type:'Mystery'}));assert.match(unsupported.records[0].channels[0].measurements[0].error,/수치 형식/);
    const conflict=await inspectPowerView(fixture({count:4}));assert.match(conflict.records[0].channels[0].measurements[0].warning,/시간축/);
});
test('PWV source input size is checked before reading and only accepted as new data',async()=>{
    const { inspectMaterial }=await import('../src/services/report/reportLibrary.js');
    let read=false;
    await assert.rejects(inspectMaterial({name:'large.pwv',size:49*1024*1024,arrayBuffer:async()=>{read=true;}},'data'),/48MB/);assert.equal(read,false);
    await assert.rejects(inspectMaterial({name:'measurement.pwv',size:100,arrayBuffer:async()=>fixture().buffer},'reference'),/지원 형식/);
    const file=fixture();const result=await inspectMaterial({name:'measurement.pwv',size:file.length,arrayBuffer:async()=>file.buffer},'data');assert.equal(result.format,'pwv');
});
