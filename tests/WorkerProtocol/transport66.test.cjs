const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const workerPath=path.resolve(__dirname,'../../src/Jindan.Report.Worker/worker.mjs'),clientUrl=require('node:url').pathToFileURL(path.resolve(__dirname,'../../src/Jindan.Report.Worker/worker-client.mjs')).href;
const hash=b=>createHash('sha256').update(b).digest('hex'),projectId='project:worker66-synthetic';
process.env.JINDAN_WORKER_TEST='1';
async function setup(operation='test:echo'){
    const sessionDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'jindan-worker66-'));
    return {nodePath:process.execPath,workerPath,sessionDirectory,request:{protocol:'jindan-worker/1',requestId:randomUUID(),projectId,sourceSha256:'a'.repeat(64),operation,files:{}},timeoutMs:10000};
}
const invoke=async options=>(await import(clientUrl)).invokeWorker(options);
async function descriptor(dir,name,bytes){const file=path.join(dir,name);await fs.writeFile(file,bytes);return {path:file,sha256:hash(bytes)};}
async function fixture(){
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,kind:'body',discipline:'process',chapter:'Synthetic process',widthPt:595,heightPt:842,images:[],tables:[],lines:[{text:'Synthetic process',bbox:[50,80,300,100],size:16},{text:'Measurement BOD 12.3 mg/L',bbox:[50,130,400,145],size:11}]}]};
    return writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes;
}
async function resultValue(result){assert.equal(result.ok,true,JSON.stringify(result));return JSON.parse(await fs.readFile(result.resultFile.path,'utf8'));}
function isExited(pid){try{process.kill(pid,0);return false;}catch{return true;}}

test('actual native source analysis is bound to exact bytes, file output, IDs and immutable source',async()=>{
    const options=await setup('analyze'),bytes=await fixture();options.request.files.source=await descriptor(options.sessionDirectory,'synthetic.hwpx',bytes);options.request.sourceSha256=hash(bytes);options.request.parameters={filename:'synthetic.hwpx'};
    const events=[],result=await invoke({...options,onProgress:event=>events.push(event)}),payload=await resultValue(result);
    assert.equal(payload.ok,true);assert.equal(payload.value.material.sha256,hash(bytes));assert.equal(payload.value.projectId,projectId);assert.ok(payload.value.fingerprint);
    assert.equal(result.requestId,options.request.requestId);assert.equal(result.reportReady,false);assert.equal(result.workerExited,true);assert.equal(isExited(result.workerPid),true);
    assert.ok(events.length>=2);assert.ok(events.every(event=>event.requestId===options.request.requestId&&!Object.hasOwn(event,'text')));
    assert.deepEqual(new Uint8Array(await fs.readFile(options.request.files.source.path)),bytes);
});

test('timeout terminates a noncooperative owned CPU process and waits for exit; retry uses a fresh process',async()=>{
    const options=await setup('test:cpu');let started=false;
    const result=await invoke({...options,timeoutMs:500,onProgress:()=>{started=true;}});
    assert.equal(started,true);assert.equal(result.ok,false);assert.equal(result.error.code,'TIMEOUT');assert.equal(result.workerExited,true);assert.equal(isExited(result.workerPid),true);
    const retry=await invoke(await setup());assert.equal(retry.ok,true);assert.notEqual(retry.workerPid,result.workerPid);
});

test('cancellation kills only the owned child and never exposes a success after cancellation',async()=>{
    const controller=new AbortController(),options=await setup('test:hang');
    const result=await invoke({...options,signal:controller.signal,onProgress:()=>controller.abort()});
    assert.equal(result.ok,false);assert.equal(result.error.code,'CANCELLED');assert.equal(result.workerExited,true);assert.equal(isExited(result.workerPid),true);
    assert.equal(process.kill(process.pid,0),true);
    const already=new AbortController();already.abort();const next=await invoke({...await setup(),signal:already.signal});assert.equal(next.error.code,'CANCELLED');assert.equal(next.workerPid,undefined);
});

test('crash, stale IDs and concurrent requests cannot publish another request result',async()=>{
    const crashed=await invoke(await setup('test:crash'));assert.equal(crashed.error.code,'WORKER_CRASH');assert.equal(isExited(crashed.workerPid),true);
    const stale=await invoke(await setup('test:wrong-id'));assert.equal(stale.error.code,'STALE_RESULT');assert.equal(isExited(stale.workerPid),true);
    const [a,b,c]=await Promise.all([setup(),setup(),setup()]);const outputs=await Promise.all([invoke(a),invoke(b),invoke(c)]);
    assert.equal(new Set(outputs.map(r=>r.workerPid)).size,3);assert.deepEqual(outputs.map(r=>r.requestId),[a,b,c].map(r=>r.request.requestId));assert.ok(outputs.every(r=>r.ok));
});

test('file hash, primary SHA, external paths, reused sessions and metadata limits fail closed',async()=>{
    const hashBad=await setup('analyze');hashBad.request.files.source=await descriptor(hashBad.sessionDirectory,'source.hwpx',await fixture());hashBad.request.sourceSha256='b'.repeat(64);hashBad.request.files.source.sha256='b'.repeat(64);
    assert.equal((await invoke(hashBad)).error.code,'FILE_HASH_MISMATCH');
    const binding=await setup('analyze');binding.request.files.source=await descriptor(binding.sessionDirectory,'source.hwpx',await fixture());assert.equal((await invoke(binding)).error.code,'BINDING_MISMATCH');
    const outside=await setup('analyze'),foreign=await setup();outside.request.files.source=await descriptor(foreign.sessionDirectory,'foreign.hwpx',await fixture());outside.request.sourceSha256=outside.request.files.source.sha256;assert.equal((await invoke(outside)).error.code,'PATH_OUTSIDE_SESSION');
    const reused=await setup();assert.equal((await invoke(reused)).ok,true);assert.equal((await invoke(reused)).error.code,'SESSION_ALREADY_USED');
    const oversized=await setup();oversized.request.parameters={untrusted:'x'.repeat(65536)};assert.equal((await invoke(oversized)).error.code,'REQUEST_TOO_LARGE');
});

test('analysis file binding rejects changed bundles, protects unreviewed drafts, and binary artifact export uses a sidecar',async()=>{
    const source=await fixture(),analysisOptions=await setup('analyze');analysisOptions.request.files.source=await descriptor(analysisOptions.sessionDirectory,'source.hwpx',source);analysisOptions.request.sourceSha256=hash(source);
    const bundle=(await resultValue(await invoke(analysisOptions))).value;
    const prepare=await setup('prepareDraft');prepare.request.sourceSha256=hash(source);prepare.request.files.source=await descriptor(prepare.sessionDirectory,'source.hwpx',source);prepare.request.files.bundle=await descriptor(prepare.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));
    const plan=(await resultValue(await invoke(prepare))).value;assert.equal(plan.canWriteDraft,false);
    const stale=await setup('writeDraft');stale.request.sourceSha256=hash(source);stale.request.files.source=await descriptor(stale.sessionDirectory,'source.hwpx',source);bundle.analysis.sections[0].text='Untrusted old slot';stale.request.files.bundle=await descriptor(stale.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));
    assert.equal((await invoke(stale)).error.code,'BINDING_MISMATCH');
    const artifact=await setup('exportArtifact');artifact.request.sourceSha256=hash(source);artifact.request.files.source=await descriptor(artifact.sessionDirectory,'source.hwpx',source);const value=(await resultValue(await invoke(artifact))).value;
    assert.ok(value.bytes.$workerFile);assert.equal(value.bytes.$workerFile.sha256,hash(source));assert.deepEqual(await fs.readFile(value.bytes.$workerFile.path),Buffer.from(source));
});

test('test operations require explicit inherited environment opt-in and callback failures cannot escape the client',async()=>{
    const options=await setup();delete process.env.JINDAN_WORKER_TEST;let result;
    try{result=await invoke(options);}finally{process.env.JINDAN_WORKER_TEST='1';}
    assert.equal(result.error.code,'UNSUPPORTED_OPERATION');
    const failed=await invoke({...await setup('test:hang'),onProgress(){throw new Error('sk-do-not-log synthetic secret');}});assert.equal(failed.error.code,'PROGRESS_CALLBACK_FAILED');assert.ok(!JSON.stringify(failed).includes('sk-do-not-log'));
});

test('actual PDF analysis, original-picture restoration and paired native analysis run through the file-only protocol',async()=>{
    const {PDFDocument}=require('pdf-lib'),{createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(16,12);
    canvas.getContext('2d').fillStyle='#ff0000';canvas.getContext('2d').fillRect(0,0,16,12);
    const pdf=await PDFDocument.create(),page=pdf.addPage([400,400]),image=await pdf.embedPng(canvas.toBuffer('image/png'));page.drawImage(image,{x:60,y:120,width:160,height:120});const source=await pdf.save();
    const analyze=await setup('analyze');analyze.request.sourceSha256=hash(source);analyze.request.files.source=await descriptor(analyze.sessionDirectory,'source.pdf',source);analyze.request.parameters={filename:'synthetic-image.pdf'};
    const bundle=(await resultValue(await invoke(analyze))).value;assert.equal(bundle.material.format,'pdf');assert.equal(bundle.pdf.pages[0].images.length,1);
    const restore=await setup('restore');restore.request.sourceSha256=hash(source);restore.request.files.source=await descriptor(restore.sessionDirectory,'source.pdf',source);restore.request.files.bundle=await descriptor(restore.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));restore.request.parameters={chapterId:bundle.analysis.chapters[0].id};
    const restored=(await resultValue(await invoke(restore))).value,bytes=await fs.readFile(restored.bytes.$workerFile.path);assert.ok(bytes.length>1000);assert.equal(restored.review.missingPictures.length,0);
    const native=await setup('analyze');native.request.sourceSha256=hash(bytes);native.request.files.source=await descriptor(native.sessionDirectory,'restored.hwpx',bytes);native.request.parameters={filename:'restored.hwpx'};const nativeBundle=(await resultValue(await invoke(native))).value;assert.equal(nativeBundle.material.format,'hwpx');
    const pair=await setup('pairReference');pair.request.sourceSha256=hash(source);pair.request.files.source=await descriptor(pair.sessionDirectory,'source.pdf',source);pair.request.files.bundle=await descriptor(pair.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));pair.request.files.referenceSource=await descriptor(pair.sessionDirectory,'reference.hwpx',bytes);pair.request.files.referenceBundle=await descriptor(pair.sessionDirectory,'reference-bundle.json',Buffer.from(JSON.stringify(nativeBundle)));
    const paired=(await resultValue(await invoke(pair))).value;assert.equal(paired.projectId,projectId);assert.equal(paired.material.sha256,hash(source));assert.ok(paired.pdf.pairedLearning);
});

test('blank draft, collection return, recovery sidecars and fresh analysis require exact local source/context/evidence',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const table={id:'t1',rows:2,columns:2,bbox:[50,200,400,260],columnWidths:[175,175],rowHeights:[30,30],cells:[['Label',0,0],['Measurement',0,1],['BOD',1,0],['12.3',1,1]].map(([text,row,column])=>({id:`c${row}${column}`,text,row,column,rowSpan:1,colSpan:1,bbox:[50+column*175,200+row*30,225+column*175,230+row*30]}))};
    const pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',discipline:'process',chapter:'Synthetic',images:[],tables:[table],lines:[]}]},source=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes;
    async function request(operation,{bundle,context,filled,archive}={}){
        const options=await setup(operation);options.request.sourceSha256=hash(archive||source);options.request.files[archive?'archive':'source']=await descriptor(options.sessionDirectory,archive?'archive.zip':'source.hwpx',archive||source);
        for(const [key,value]of Object.entries({bundle,context}))if(value)options.request.files[key]=await descriptor(options.sessionDirectory,key+'.json',Buffer.from(JSON.stringify(value)));
        if(filled)options.request.files.filled=await descriptor(options.sessionDirectory,'filled.hwpx',filled);return invoke(options);
    }
    const bundle=(await resultValue(await request('analyze'))).value;
    const review={sourceSha256:hash(source),items:Object.fromEntries(bundle.analysis.sections.map(row=>[row.id,row.text==='12.3'?{decision:'replace',contentRole:'measurement',clearValue:true}:{decision:'keep',contentRole:'label',retentionPurpose:'static-label'}]))},context={review,draftMode:'blank',materials:[]};
    const collection=(await resultValue(await request('exportCollection',{bundle,context}))).value,filled=await fs.readFile(collection.bytes.$workerFile.path);
    const returned=(await resultValue(await request('importCollection',{bundle,context,filled}))).value;assert.ok(returned.rows.length>0);assert.ok(returned.rows.every(row=>row.value===''));
    const draft=(await resultValue(await request('writeDraft',{bundle,context}))).value;assert.equal(draft.review.status,'blank-working-draft');
    const recovery=(await resultValue(await request('createRecovery',{context:{files:[{id:'original',role:'source',filename:'synthetic.hwpx',parentIds:[],fileKey:'source'}],state:{untrustedApproval:true}}}))).value;
    const archive=await fs.readFile(recovery.bytes.$workerFile.path),recovered=(await resultValue(await request('recover',{archive}))).value;assert.equal(recovered.manifest.projectId,projectId);assert.equal(recovered.files[0].sha256,hash(source));assert.deepEqual(await fs.readFile(recovered.files[0].bytes.$workerFile.path),Buffer.from(source));assert.equal(recovered.reportReady,false);
    // Recovered arbitrary approval remains untrusted metadata, never a draft input.
    assert.equal(recovered.manifest.state.untrustedApproval,true);assert.equal((await resultValue(await request('prepareDraft',{bundle}))).value.canWriteDraft,false);
});

test('cancellation on complete progress suppresses an otherwise successful final engine result',async()=>{
    const options=await setup('analyze'),bytes=await fixture(),controller=new AbortController();options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'source.hwpx',bytes);
    const result=await invoke({...options,signal:controller.signal,onProgress(event){if(event.stage==='complete')controller.abort();}});assert.equal(result.ok,false);assert.equal(result.error.code,'CANCELLED');assert.equal(result.workerExited,true);assert.equal(isExited(result.workerPid),true);
});

test('direct native source preview renders actual pages with real canvas metrics and never substitutes a PDF',async()=>{
    const {writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js'),plan=blocks=>({schema:'jindan-pdf-authoring/1',projectId,source:{sha256:'a'.repeat(64)},mode:'reference',blocks,mapping:[],warnings:[]});
    async function preview(bytes,page){const options=await setup('preview');options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'native-source.hwpx',bytes);options.request.parameters={filename:'native-source.hwpx',page:String(page),scale:'1'};return invoke(options);}
    const bytes=writePdfHwpx(plan([{kind:'paragraph',text:'NATIVE FIRST PAGE CONTENT'},{kind:'paragraph',text:'SECOND PAGE',pageBreak:true}])).bytes;
    const first=(await resultValue(await preview(bytes,1))).value,second=(await resultValue(await preview(bytes,2))).value;assert.equal(first.engine,'rhwp/0.8.7');assert.equal(first.measurement,'napi-canvas-font-metrics');assert.equal(first.pageCount,2);assert.equal(second.pageNumber,2);assert.equal(first.sourceSha256,hash(bytes));assert.equal(first.nativeHancomApproval,false);assert.equal(first.pngBytes.$workerFile.mediaType,'image/png');assert.notEqual(first.pngBytes.$workerFile.sha256,second.pngBytes.$workerFile.sha256);
    const other=writePdfHwpx(plan([{kind:'paragraph',text:'ACTUALLY CHANGED NATIVE SOURCE'},{kind:'paragraph',text:'SECOND PAGE',pageBreak:true}])).bytes;assert.notEqual((await resultValue(await preview(other,1))).value.pngBytes.$workerFile.sha256,first.pngBytes.$workerFile.sha256);
    assert.equal((await preview(bytes,3)).error.code,'INVALID_PAGE');
});

test('PDF page preview emits a bounded original-source PNG rather than restoration background',async()=>{
    const {PDFDocument,rgb}=require('pdf-lib');const pdf=await PDFDocument.create(),page=pdf.addPage([200,300]);page.drawRectangle({x:20,y:20,width:100,height:100,color:rgb(1,0,0)});const bytes=await pdf.save();
    const options=await setup('preview');options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'source.pdf',bytes);options.request.parameters={filename:'source.pdf',page:'1',scale:'1'};
    const value=(await resultValue(await invoke(options))).value;assert.equal(value.engine,'pdfjs/5.4.624');assert.equal(value.width,200);assert.equal(value.height,300);assert.equal(value.pageCount,1);assert.equal(value.sourceSha256,hash(bytes));assert.equal(value.pngBytes.$workerFile.mediaType,'image/png');
    const {loadImage,createCanvas}=require('@napi-rs/canvas'),image=await loadImage(await fs.readFile(value.pngBytes.$workerFile.path)),canvas=createCanvas(200,300);canvas.getContext('2d').drawImage(image,0,0);assert.deepEqual([...canvas.getContext('2d').getImageData(50,250,1,1).data],[255,0,0,255]);
});

test('material reader parses local CSV, PWV and BMT diagnostics and rejects duplicate XLSX names',async()=>{
    const {zipSync,strToU8}=require('fflate');
    async function inspect(bytes,filename,operation='inspectMaterial'){const options=await setup(operation);options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'material.bin',bytes);options.request.parameters={filename};return invoke(options);}
    const csv=(await resultValue(await inspect(Buffer.from('label,value\nBOD,\n'),'synthetic.csv'))).value;assert.equal(csv.tables.tables[0].rows[1][1].value,'');assert.equal(csv.tables.reportReady,false);
    const pwv=strToU8('<?xml version="1.0"?><PQData><PQDataRecords/><PQInstruments/><PQSites/></PQData>');const power=(await resultValue(await inspect(pwv,'synthetic.pwv'))).value;assert.equal(power.powerView.records.length,0);assert.equal(power.powerView.reportReady,false);
    const thermal=(await resultValue(await inspect(require('../LegacyEngine/fixtures/thermal-bmt.cjs').fixture(),'synthetic.bmt'))).value;assert.equal(thermal.thermal.device,'Testo fixture');assert.equal(thermal.thermal.grid.temperatureC,null);assert.equal(thermal.thermal.reportReady,false);
    assert.equal((await inspect(Buffer.from('malformed-BMT-only'),'synthetic.bmt')).ok,false);
    const duplicate=Buffer.from(zipSync({'xl/workbook.xml':strToU8('<workbook/>'),'xl/workbooK.xml':strToU8('<workbook/>')})),needle=Buffer.from('xl/workbooK.xml'),replacement=Buffer.from('xl/workbook.xml');let matches=0;
    for(let offset=0;(offset=duplicate.indexOf(needle,offset))>=0;offset+=needle.length){replacement.copy(duplicate,offset);matches++;}assert.equal(matches,2);
    assert.equal((await inspect(duplicate,'synthetic.xlsx')).error.code,'INVALID_PACKAGE');
});

test('native preview SVG boundary rejects external/script/declaration/style execution without rasterizing it',async()=>{
    for(const body of ['<script>alert(1)</script>','<foreignObject><div>x</div></foreignObject>','<image href="https://example.invalid/p.png"/>','<g onload="alert(1)"/>','<path d="M0 0" style="fill:url/**/(http://example.invalid/p)"/>','<path style="fill:u\\72l(file:///private)"/>','<style>@import "http://example.invalid/p";</style>']){
        const bytes=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`),options=await setup('test:validate-svg');options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'synthetic.svg',bytes);assert.equal((await invoke(options)).error.code,'UNSAFE_PREVIEW');
    }
});

test('CAD preview uses actual bounded local DXF renderer and typed PNG artifact',async()=>{
    const bytes=Buffer.from(['0','SECTION','2','ENTITIES','0','LINE','8','0','10','0','20','0','30','0','11','120','21','40','31','0','0','ENDSEC','0','EOF',''].join('\n')),options=await setup('cadPreview');options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'synthetic.blob',bytes);options.request.parameters={filename:'synthetic.dxf'};
    const value=(await resultValue(await invoke(options))).value;assert.equal(value.sourceSha256,hash(bytes));assert.equal(value.previewOnly,true);assert.equal(value.pngBytes.$workerFile.mediaType,'image/png');assert.ok(value.width>0&&value.width<=1600);assert.equal(value.layoutVerified,false);
});

test('discipline schema calculations use explicit inputs, preserve confirmation for value-only edits and bind collection versions',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const table={id:'t1',rows:2,columns:2,bbox:[50,200,400,260],columnWidths:[175,175],rowHeights:[30,30],cells:[['Label',0,0],['Value',0,1],['BOD',1,0],['12.3',1,1]].map(([text,row,column])=>({id:`c${row}${column}`,text,row,column,rowSpan:1,colSpan:1,bbox:[50+column*175,200+row*30,225+column*175,230+row*30]}))},pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',discipline:'process',chapter:'Synthetic',images:[],tables:[table],lines:[]}]},source=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes;
    const a=await setup('analyze');a.request.sourceSha256=hash(source);a.request.files.source=await descriptor(a.sessionDirectory,'source.hwpx',source);const bundle=(await resultValue(await invoke(a))).value;let workspace;
    async function action(name,payload={},filled){const options=await setup('discipline');options.request.sourceSha256=hash(source);options.request.files.source=await descriptor(options.sessionDirectory,'source.hwpx',source);options.request.files.bundle=await descriptor(options.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));options.request.files.context=await descriptor(options.sessionDirectory,'context.json',Buffer.from(JSON.stringify({workspace,payload})));if(filled)options.request.files.filled=await descriptor(options.sessionDirectory,'filled.json',Buffer.from(JSON.stringify(filled)));options.request.parameters={action:name,discipline:'process'};const result=await invoke(options);if(result.ok){const value=(await resultValue(result)).value;workspace=value.workspace;return value;}return result;}
    await action('addTableFields',{tableId:bundle.document.tables[0].id});const field=workspace.fields[0];assert.equal(workspace.values[field.id],undefined);await action('setValue',{id:field.id,value:'6'});let result=await action('setRule',{rule:{id:'r1',label:'Synthetic mean',operation:'mean',fieldIds:[field.id]}});assert.equal(result.results[0].value,6);
    await action('confirmSchema');const revision=workspace.revision;await action('replaceEditor',{fields:workspace.fields,rules:workspace.rules,values:{[field.id]:'7'},notes:workspace.notes});assert.equal(workspace.revision,revision);assert.equal(workspace.confirmedRevision,revision);
    const form=(await action('exportCollection')).collection;assert.equal(form.values[field.id],'');await action('importCollection',{},form);assert.equal(workspace.values[field.id],'');assert.equal((await action('inspect')).results[0].status,'pending');
    const stale={...form,sourceSha256:'0'.repeat(64)};assert.equal((await action('importCollection',{},stale)).ok,false);
});

test('source-bound native specification edits preserve content and source while rejecting stale SHA and unknown object edits',async()=>{
    const source=await fixture(),{unzipSync,strFromU8}=require('fflate'),a=await setup('analyze');a.request.sourceSha256=hash(source);a.request.files.source=await descriptor(a.sessionDirectory,'source.hwpx',source);const bundle=(await resultValue(await invoke(a))).value;
    async function action(name,spec){const options=await setup('specification');options.request.sourceSha256=hash(source);options.request.files.source=await descriptor(options.sessionDirectory,'source.hwpx',source);options.request.files.bundle=await descriptor(options.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));if(spec)options.request.files.context=await descriptor(options.sessionDirectory,'context.json',Buffer.from(JSON.stringify({spec})));options.request.parameters={action:name};return invoke(options);}
    const original=(await resultValue(await action('inspect'))).value;assert.equal(original.spec.sourceSha256,hash(source));assert.ok(original.profile.sections.length);const spec={...original.spec,applyBodyStyle:true,fontSizePt:13,leftIndentMm:2,firstLineIndentMm:-1,keepWithNext:true};
    assert.equal((await action('validate',{...spec,sourceSha256:'0'.repeat(64)})).error.code,'BINDING_MISMATCH');assert.equal((await action('apply',{...spec,objectPositions:{unknown:{positioning:'page',horizontalMm:0,verticalMm:0}}})).ok,false);
    const value=(await resultValue(await action('apply',spec))).value,bytes=await fs.readFile(value.bytes.$workerFile.path);assert.equal(value.review.reportReady,false);assert.equal(value.review.sourceSha256,hash(source));const entries=unzipSync(bytes),before=unzipSync(source);assert.ok(strFromU8(entries['Contents/header.xml']).includes('height="1300"'));assert.ok(strFromU8(entries['Contents/section0.xml']).includes('Measurement BOD 12.3 mg/L'));assert.equal(hash(await fs.readFile(a.request.files.source.path)),hash(source));for(const key of Object.keys(before).filter(key=>key.startsWith('BinData/')))assert.equal(hash(before[key]),hash(entries[key]));
});

test('native source location uses current row binding and independent page text; never invents unknown row location',async()=>{
    const source=await fixture(),a=await setup('analyze');a.request.sourceSha256=hash(source);a.request.files.source=await descriptor(a.sessionDirectory,'source.hwpx',source);const bundle=(await resultValue(await invoke(a))).value,row=bundle.analysis.sections.find(row=>row.text.includes('BOD'));
    async function locate(rowId){const options=await setup('locate');options.request.sourceSha256=hash(source);options.request.files.source=await descriptor(options.sessionDirectory,'source.hwpx',source);options.request.files.bundle=await descriptor(options.sessionDirectory,'bundle.json',Buffer.from(JSON.stringify(bundle)));options.request.parameters={rowId};return invoke(options);}
    const value=(await resultValue(await locate(row.id))).value;assert.deepEqual(value.pages,[1]);assert.equal(value.method,'independent-renderer-layout-text-match');assert.equal(value.nativeHancomApproval,false);assert.equal((await locate('invented')).error.code,'BINDING_MISMATCH');
});

test('legacy project inspection verifies exact archive/files and exposes historical context without old actor or executable approvals',async()=>{
    const {zipSync,strToU8}=require('fflate'),source=await fixture(),sha=hash(source),csv=Buffer.from('label,value\nBOD,99\n'),csvSha=hash(csv),materials=[{id:'reference-'+sha,sha256:sha,filename:'synthetic.hwpx',format:'hwpx',role:'reference',size:source.length},{id:'data-'+csvSha,sha256:csvSha,filename:'past.csv',format:'csv',role:'data',size:csv.length}],manifest={schema:'jindan-report-project/1',book:{title:'Historical synthetic',chapters:[{id:'c',kind:'chapter',title:'Past chapter',text:'Historical context only'}],reportIds:[materials[0].id],materialIds:[materials[1].id],ownerId:'UNTRUSTED_OLD_ACTOR',acknowledgedReview:true,currentValues:{BOD:999}},materials,referenceProjects:[],referenceEntries:[]};
    const entries={'project.json':strToU8(JSON.stringify(manifest)),['files/'+materials[0].id+'.hwpx']:source,['files/'+materials[1].id+'.csv']:csv};
    async function inspect(bytes){const options=await setup('inspectLegacyProject');options.request.sourceSha256=hash(bytes);options.request.files.source=await descriptor(options.sessionDirectory,'legacy.jindanproj',bytes);return invoke(options);}
    const value=(await resultValue(await inspect(zipSync(entries)))).value;assert.equal(value.files.length,2);assert.equal(value.requiresFreshReview,true);assert.equal(hash(await fs.readFile(value.files[0].bytes.$workerFile.path)),sha);assert.equal(value.receipt.readOnlyHistoricalContext,true);assert.equal(JSON.stringify(value.receipt).includes('UNTRUSTED_OLD_ACTOR'),false);assert.equal(Object.hasOwn(value.receipt,'acknowledgedReview'),false);assert.equal(Object.hasOwn(value.receipt,'currentValues'),false);
    const broken={...entries,['files/'+materials[0].id+'.hwpx']:Buffer.from('not-original')};assert.equal((await inspect(zipSync(broken))).ok,false);assert.equal((await inspect(zipSync({...entries,'../unexpected':csv}))).ok,false);
    const duplicate=Buffer.from(zipSync({...entries,'projecT.json':strToU8(JSON.stringify(manifest))})),needle=Buffer.from('projecT.json');for(let p=0;(p=duplicate.indexOf(needle,p))>=0;p+=needle.length)Buffer.from('project.json').copy(duplicate,p);assert.equal((await inspect(duplicate)).ok,false);
});

test('binary output size guard is symmetric with document input and rejects before writing oversized artifact',async()=>{
    const accepted=await setup('test:binary-limit');accepted.request.parameters={length:'1024'};const value=(await resultValue(await invoke(accepted))).value;assert.equal(value.bytes.$workerFile.size,1024);assert.equal(value.bytes.$workerFile.mediaType,'application/octet-stream');
    const refused=await setup('test:binary-limit');refused.request.parameters={length:'1025'};const result=await invoke(refused);assert.equal(result.error.code,'OUTPUT_LIMIT');assert.deepEqual(await fs.readdir(path.join(refused.sessionDirectory,'output')),[]);
    const old=process.env.JINDAN_WORKER_TEST;delete process.env.JINDAN_WORKER_TEST;try{const disabled=await setup('test:binary-limit');disabled.request.parameters={length:'1024'};assert.equal((await invoke(disabled)).error.code,'UNSUPPORTED_OPERATION');}finally{process.env.JINDAN_WORKER_TEST=old;}
});
