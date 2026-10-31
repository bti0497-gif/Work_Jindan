const {test} = require('node:test');
const assert = require('node:assert/strict');
test('manual thermal delivery binds exact file versions and keeps final report status pending', async () => {
    const {bindThermalDeliveryFile,thermalDeliveryStatus}=await import('../src/services/report/thermalDelivery.js');
    const materials=['bmt','xlsx','jpg'].map((format,i)=>({id:`m${i}`,format,filename:`result.${format}`,sha256:String(i).repeat(64)}));
    const delivery={bmt:bindThermalDeliveryFile(materials[0],'bmt'),measurements:bindThermalDeliveryFile(materials[1],'measurements'),image:bindThermalDeliveryFile(materials[2],'image'),pointsConfirmed:true,imageConfirmed:true};
    assert.deepEqual(thermalDeliveryStatus(delivery,materials),{missing:[],prepared:true,reportReady:false});
    assert.equal(thermalDeliveryStatus({...delivery,pointsConfirmed:false},materials).prepared,false);
    const changed=materials.map((m,i)=>i===0?{...m,sha256:'a'.repeat(64)}:m);
    assert.equal(thermalDeliveryStatus(delivery,changed).prepared,false);
    assert.throws(()=>bindThermalDeliveryFile(materials[2],'bmt'),/파일 종류/);
    assert.equal(thermalDeliveryStatus(delivery,materials.slice(1)).missing.length,1);
    assert.equal(thermalDeliveryStatus({...delivery,measurements:null},[materials[0],materials[2]]).prepared,true);
});
