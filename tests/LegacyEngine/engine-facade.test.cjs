const {test}=require('node:test'),assert=require('node:assert/strict');
const projectId='project:engine-synthetic',sha=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
async function fixture(){
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,kind:'body',discipline:'process',chapter:'제3장 공정',widthPt:595,heightPt:842,images:[],tables:[],lines:[{text:'제3장 공정',bbox:[50,80,300,100],size:16},{text:'측정 BOD 12.3 mg/L',bbox:[50,130,400,145],size:11}]}]};
    return writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes;
}
test('portable facade imports without UI, analyzes exact native bytes and blocks unknown historical data in a current draft',async()=>{
    const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),engine=createReportEngine(),bytes=await fixture(),original=bytes.slice(),events=[];
    const analyzed=await engine.analyze({bytes,filename:'synthetic.hwpx',projectId},{onProgress:e=>events.push(e.stage)});assert.equal(analyzed.ok,true,JSON.stringify(analyzed.error));
    const bundle=analyzed.value;assert.equal(bundle.material.sha256,sha(bytes));assert.equal(bundle.analysis.purpose,'authoring');assert.deepEqual(events,['start','complete']);
    const unreviewed=await engine.prepareDraft({bytes,bundle,projectId});assert.equal(unreviewed.ok,true);assert.equal(unreviewed.value.canWriteDraft,false);
    const rejected=await engine.writeDraft({bytes,bundle,projectId});assert.equal(rejected.ok,false);assert.equal(rejected.reportReady,false);
    const review={sourceSha256:sha(bytes),items:Object.fromEntries(bundle.analysis.sections.map(row=>[row.id,{decision:'replace',contentRole:row.contentRole,clearValue:true}]))};
    const blank=await engine.writeDraft({bytes,bundle,projectId,context:{review,draftMode:'blank',materials:[]}});assert.equal(blank.ok,true,JSON.stringify(blank.error));assert.equal(blank.value.review.status,'blank-working-draft');
    const read=await engine.analyze({bytes:blank.value.bytes,filename:'blank.hwpx',projectId});assert.equal(read.ok,true);assert.ok(!read.value.document.paragraphs.some(p=>p.text.includes('12.3')));assert.deepEqual(bytes,original);
});
test('source, project and analysis fingerprints are checked independently, and native input is never called PDF restoration',async()=>{
    const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),engine=createReportEngine(),bytes=await fixture(),bundle=(await engine.analyze({bytes,filename:'synthetic.hwpx',projectId})).value;
    const altered=structuredClone(bundle);altered.analysis.sections[0].text='Changed expected slot';
    for(const input of [{bytes,bundle:altered,projectId},{bytes,bundle,projectId:'project:other'},{bytes:new Uint8Array([...bytes,0]),bundle,projectId}]){
        const r=await engine.prepareDraft(input);assert.equal(r.ok,false);assert.equal(r.error.code,'BINDING_MISMATCH');
    }
    const r=await engine.restore({bytes,bundle,projectId,chapterId:bundle.analysis.chapters[0].id});assert.equal(r.error.code,'UNSUPPORTED_FORMAT');
});
test('facade restores a selected PDF chapter through the existing writer and an explicit local analysis adapter',async()=>{
    const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),{buildPdfAnalysis}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfStructure.js'),{readHwpxPackage}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js'),{pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const bytes=new TextEncoder().encode('%PDF-1.7\nsynthetic-adapter-only'),engine=createReportEngine({async analyzePdf(data,filename,id){return buildPdfAnalysis([{number:1,widthPt:595,heightPt:842,lines:[{text:'제3장 공정',bbox:[50,100,300,120],size:16},{text:'공정 설명',bbox:[50,150,400,165],size:11}],images:[],tables:[],warnings:[]}],{sha256:sha(data),filename,format:'pdf'},id);}});
    const a=await engine.analyze({bytes,filename:'synthetic-adapter.pdf',projectId});assert.equal(a.ok,true,JSON.stringify(a.error));const bundle=a.value,chapterId=bundle.analysis.chapters[0].id;
    const restored=await engine.restore({bytes,bundle,projectId,chapterId});assert.equal(restored.ok,true,JSON.stringify(restored.error));
    const old=writePdfHwpx(pdfAuthoringPlan(bundle.pdf,{pages:[1]},projectId,'reference')),actual=readHwpxPackage(restored.value.bytes),expected=readHwpxPackage(old.bytes);
    for(const name of ['Contents/header.xml','Contents/section0.xml'])assert.deepEqual(actual[name],expected[name]);assert.equal(restored.reportReady,false);
    assert.equal((await engine.restore({bytes,bundle,projectId,chapterId:'missing'})).ok,false);
});
test('cancellation, adapter failure, export version and typed-array slices return explicit bounded results',async()=>{
    const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),engine=createReportEngine(),bytes=await fixture(),controller=new AbortController();controller.abort();
    assert.equal((await engine.analyze({bytes,projectId},{signal:controller.signal})).error.code,'CANCELLED');
    const stopped=new AbortController(),failure=await engine.analyze({bytes,projectId},{signal:stopped.signal,onProgress:e=>{if(e.stage==='complete')stopped.abort();}});
    assert.equal(failure.error.code,'CANCELLED');
    const exportResult=await engine.exportArtifact({bytes:new Uint8Array([0,1,2,3]).subarray(1,3),filename:'out.hwpx',projectId});assert.deepEqual([...exportResult.value.bytes],[1,2]);
    assert.equal((await engine.exportArtifact({bytes,projectId,expectedSha256:'0'.repeat(64)})).error.code,'BINDING_MISMATCH');
    const bad=createReportEngine({async analyzePdf(){throw new Error('Local adapter failed');}}),r=await bad.analyze({bytes:new TextEncoder().encode('%PDF-1.7'),projectId});assert.equal(r.ok,false);assert.equal(r.error.message,'Local adapter failed');
});
test('native blank collection returns to original cells and a blank draft through the portable facade, with no invented current values',async()=>{
    const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),{pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js'),engine=createReportEngine();
    const table={id:'t1',rows:2,columns:2,bbox:[50,200,400,260],columnWidths:[175,175],rowHeights:[30,30],cells:[['항목',0,0],['측정결과',0,1],['BOD',1,0],['12.3',1,1]].map(([text,row,column])=>({id:`c${row}${column}`,text,row,column,rowSpan:1,colSpan:1,bbox:[50+column*175,200+row*30,225+column*175,230+row*30]}))};
    const pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',discipline:'process',chapter:'제3장 공정',images:[],tables:[table],lines:[{text:'제3장 공정',bbox:[50,80,300,100],size:16}]}]},bytes=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes,bundle=(await engine.analyze({bytes,filename:'synthetic-table.hwpx',projectId})).value;
    const review={sourceSha256:sha(bytes),items:Object.fromEntries(bundle.analysis.sections.map(row=>[row.id,row.text==='12.3'?{decision:'replace',contentRole:'measurement',clearValue:true}:{decision:'keep',contentRole:row.formatRole==='tableBody'?'label':row.contentRole,retentionPurpose:'static-label'}]))},context={review,draftMode:'blank',materials:[]};
    const collection=await engine.exportCollection({bytes,bundle,projectId,context});assert.equal(collection.ok,true,JSON.stringify(collection.error));
    const returned=await engine.importCollection({bytes,bundle,projectId,context,filledBytes:collection.value.bytes,filename:'blank-return.hwpx'});assert.equal(returned.ok,true,JSON.stringify(returned.error));assert.ok(returned.value.rows.length>0);assert.ok(returned.value.rows.every(r=>!r.value));
    const draft=await engine.writeDraft({bytes,bundle,projectId,context});assert.equal(draft.ok,true,JSON.stringify(draft.error));
    const after=(await engine.analyze({bytes:draft.value.bytes,filename:'blank-draft.hwpx',projectId})).value;assert.equal(after.document.tables[0].cells.find(c=>c.row===1&&c.column===1).text,'');assert.equal(after.document.tables[0].cells.find(c=>c.row===1&&c.column===0).text,'BOD');
    const eBytes=new TextEncoder().encode('synthetic evidence only, no measurements'),material={id:'e',sha256:sha(eBytes),filename:'synthetic.txt',format:'txt'};
    assert.equal((await engine.prepareDraft({bytes,bundle,projectId,context:{...context,materials:[material]}})).error.code,'BINDING_MISMATCH');
    const bound=await engine.prepareDraft({bytes,bundle,projectId,context:{...context,materials:[material]},evidenceFiles:[{id:'e',bytes:eBytes}]});assert.equal(bound.ok,true);assert.equal(bound.value.reportReady,false);
    assert.equal((await engine.prepareDraft({bytes,bundle,projectId,context:{...context,materials:[material]},evidenceFiles:[{id:'e',bytes:new Uint8Array([9])}]})).error.code,'BINDING_MISMATCH');
});
