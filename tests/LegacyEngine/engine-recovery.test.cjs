const {test}=require('node:test'),assert=require('node:assert/strict'),{zipSync,unzipSync,strFromU8,strToU8}=require('fflate');
const projectId='project:recovery-synthetic',source=new Uint8Array([1,2,3]),saved=new Uint8Array([4,5,6]);
const files=()=>[{id:'original',role:'source',filename:'원본.hwpx',bytes:source},{id:'edited',role:'native-saved',filename:'saved.hwpx',parentIds:['original'],bytes:saved}];
test('project sidecar retains exact originals/saved versions and JSON independently from a native file, without stale binding restoration',async()=>{
    const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),engine=createReportEngine(),state={analyses:{original:{sourceSha256:'exact-old-version'}},reviews:{original:{measurement:'pending'}}};
    const r=await engine.createRecovery({projectId,files:files(),state});assert.equal(r.ok,true);state.reviews.original.measurement='mutated-after';
    const recovered=await engine.recover({bytes:r.value.bytes,expectedSha256:r.value.sha256,projectId});assert.equal(recovered.ok,true);const value=recovered.value;
    assert.deepEqual(value.files[0].bytes,source);assert.deepEqual(value.files[1].bytes,saved);assert.equal(value.files[1].requiresReanalysis,true);assert.equal(value.state.reviews.original.measurement,'pending');assert.equal(value.standaloneMetadataPreserved,false);assert.equal(value.reportReady,false);
    assert.equal((await engine.recover({bytes:r.value.bytes,projectId:'project:wrong'})).error.code,'BINDING_MISMATCH');
});
test('recovery rejects tampered payloads, unsafe paths, unregistered files, bad parent links and unsafe state',async()=>{
    const {createEngineRecovery,readEngineRecovery}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineRecovery.js'),out=await createEngineRecovery({projectId,files:files()});
    const alter=edit=>{const entries=unzipSync(out.bytes);edit(entries);return zipSync(entries);};
    await assert.rejects(readEngineRecovery(alter(e=>{const key=Object.keys(e).find(k=>k.startsWith('files/'));e[key]=new Uint8Array([9,9,9]);})),/bytes differ/);
    await assert.rejects(readEngineRecovery(alter(e=>{e['../escape']=source;})),/entry/);
    await assert.rejects(readEngineRecovery(alter(e=>{e['files/'+'a'.repeat(64)+'.bin']=source;})),/Unregistered/);
    await assert.rejects(createEngineRecovery({projectId,files:[...files(),{id:'bad',role:'draft',filename:'bad.hwpx',bytes:saved,parentIds:['missing']}]}),/parent/);
    await assert.rejects(createEngineRecovery({projectId,files:files(),state:JSON.parse('{"__proto__":{"bad":true}}')}),/Unsafe/);
    await assert.rejects(readEngineRecovery(alter(e=>{const m=JSON.parse(strFromU8(e['recovery.json']));m.files[1].parentIds=['edited'];e['recovery.json']=strToU8(JSON.stringify(m));})),/parent/);
    await assert.rejects(createEngineRecovery({projectId,files:files().map(f=>({...f,sha256:'a'.repeat(64)}))}),/hash differs/);
});
test('recovery shared content deduplicates without collapsing explicit file identities or accepting a derivation cycle',async()=>{
    const {createEngineRecovery,readEngineRecovery}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineRecovery.js'),same=[{id:'s',role:'source',filename:'source.hwpx',bytes:source},{id:'copy',role:'candidate',filename:'copy.hwpx',bytes:source,parentIds:['s']}],out=await createEngineRecovery({projectId,files:same});
    assert.equal(Object.keys(unzipSync(out.bytes)).length,2);assert.equal((await readEngineRecovery(out.bytes)).files.length,2);
    await assert.rejects(createEngineRecovery({projectId,files:[{...same[1],id:'a',parentIds:['b']},{...same[1],id:'b',parentIds:['a']}]}),/cycle/);
});
