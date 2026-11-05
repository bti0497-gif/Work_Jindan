const {test}=require('node:test'),assert=require('node:assert/strict'),{zipSync,strToU8,strFromU8}=require('fflate');
const prefix='../../src/Jindan.Report.Worker/engine/src/services/report/';
function duplicate(entries,from,to){const b=Buffer.from(zipSync(entries)),a=Buffer.from(from),z=Buffer.from(to);assert.equal(a.length,z.length);let n=0;for(let p=0;(p=b.indexOf(a,p))>=0;p+=a.length){z.copy(b,p);n++;}assert.equal(n,2);return b;}
test('arbitrary thrown values normalize and never reject or expose secret values',async()=>{
 const {createReportEngine}=await import(prefix+'engineFacade.js');
 for(const thrown of [null,undefined,'password=private',42,{},Symbol('token'),Object.create(null),new Proxy({},{get(){throw undefined;}})]){
  const r=await createReportEngine({analyzePdf:async()=>{throw thrown;}}).analyze({bytes:strToU8('%PDF-1.7 synthetic'),projectId:'project:repair66'});
  assert.equal(r.ok,false);assert.equal(r.error.code,'ENGINE_ERROR');assert.equal(r.error.message,'Engine operation failed.');assert.equal(r.reportReady,false);
 }
 const e=new Error('Local adapter failed api_key=private token=secret sk-proj-abc');e.code='ADAPTER_REQUIRED';
 const r=await createReportEngine({analyzePdf:async()=>{throw e;}}).analyze({bytes:strToU8('%PDF-1.7'),projectId:'project:repair66'});assert.equal(r.error.code,'ADAPTER_REQUIRED');assert.doesNotMatch(r.error.message,/private|secret|sk-proj/);
});
test('shared ZIP boundary checks duplicates including ignored entries, paths and budgets',async()=>{
 const {createZipEntryGuard}=await import(prefix+'zipBoundary.js');
 for(const name of ['../x','a/../b','/root','C:/x','a\\b','a//b','./x'])assert.throws(()=>createZipEntryGuard()({name,originalSize:0}),e=>e.code==='INVALID_ARCHIVE');
 let g=createZipEntryGuard({maxEntries:1,maxExpandedBytes:4});g({name:'a',originalSize:4});assert.throws(()=>g({name:'b',originalSize:0}));
 g=createZipEntryGuard();g({name:'x',originalSize:0});assert.throws(()=>g({name:'x',originalSize:0}));
 assert.throws(()=>createZipEntryGuard()({name:'x',originalSize:-1}));
});
test('duplicate HWPX package, direct parser and facade all fail closed on a real generated HWPX',async()=>{
 const {readHwpxPackage}=await import(prefix+'hwpxPackage.js'),{analyzeReport}=await import(prefix+'sourceParser.js'),{createReportEngine}=await import(prefix+'engineFacade.js'),{pdfAuthoringPlan,writePdfHwpx}=await import(prefix+'pdfHwpxWriter.js');
 const p='project:repair66',pdf={schema:'jindan-pdf-analysis/1',projectId:p,source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',chapter:'Synthetic',discipline:'process',images:[],tables:[],lines:[{text:'FIRST',bbox:[50,100,300,120],size:11}]}]},bytes=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},p,'reference')).bytes,copy=bytes.slice(),entries=readHwpxPackage(bytes);
 entries['Contents/section1.xml']=strToU8(strFromU8(entries['Contents/section0.xml']).replaceAll('FIRST','LAST!'));
 const dup=duplicate(entries,'Contents/section1.xml','Contents/section0.xml');
 assert.throws(()=>readHwpxPackage(dup),e=>e.code==='INVALID_ARCHIVE');await assert.rejects(analyzeReport(dup,'duplicate.hwpx'));
 const e=createReportEngine();assert.equal((await e.analyze({bytes,filename:'normal.hwpx',projectId:p})).ok,true);const rejected=await e.analyze({bytes:dup,filename:'duplicate.hwpx',projectId:p});assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'INVALID_ARCHIVE');assert.deepEqual(bytes,copy);
 const ignored=duplicate({'Contents/section0.xml':strToU8('<x/>'),'Unused/a':strToU8('a'),'Unused/b':strToU8('b')},'Unused/b','Unused/a');await assert.rejects(analyzeReport(ignored,'duplicate.hwpx'));
});
test('project and recovery archive duplicates are rejected before JSON acceptance',async()=>{
 const {readProjectArchive}=await import(prefix+'projectArchive.js'),{readEngineRecovery}=await import(prefix+'engineRecovery.js');
 const dup=duplicate({'project.json':strToU8('{}'),'projecx.json':strToU8('{}')},'projecx.json','project.json');await assert.rejects(readProjectArchive(dup));
 const other=duplicate({'recovery.json':strToU8('{}'),'recoverx.json':strToU8('{}')},'recoverx.json','recovery.json');await assert.rejects(readEngineRecovery(other));
});
