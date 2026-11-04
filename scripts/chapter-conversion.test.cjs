const {test}=require('node:test'),assert=require('node:assert/strict');
const material={id:'reference-'+ 'c'.repeat(64),sha256:'c'.repeat(64),format:'pdf'},projectId='project:chapter';
async function fixture(){const {PDF_ANALYZER_VERSION}=await import('../src/services/report/pdfStructure.js');return {schema:'jindan-pdf-analysis/1',parserVersion:PDF_ANALYZER_VERSION,projectId,source:{sha256:material.sha256},pages:[
    {number:1,chapter:'제1장 공정 운영',discipline:'process',kind:'body',widthPt:595,heightPt:842,tables:[],images:[],lines:[{text:'제1장 공정 운영',size:18,bbox:[50,100,300,120]},{text:'공정 전용 내용',size:11,bbox:[50,160,300,180]}]},
    {number:2,chapter:'제1장 공정 운영',discipline:'process',kind:'blank',widthPt:595,heightPt:842,tables:[],images:[],lines:[]},
    {number:3,chapter:'제2장 기계 설비',discipline:'mechanical',kind:'body',widthPt:595,heightPt:842,tables:[],images:[],lines:[{text:'제2장 기계 설비',size:18,bbox:[50,100,300,120]},{text:'기계 전용 내용',size:11,bbox:[50,160,300,180]}]}
]};}
test('chapter conversion isolates source pages, retains blank pages and embeds provenance in editable HWPX',async()=>{
    const {buildWorkflowAnalysis}=await import('../src/services/report/workflowAnalysis.js'),{chapterConversionPlan}=await import('../src/services/report/chapterConversion.js'),{writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{unzipSync,strFromU8}=await import('fflate');
    const pdf=await fixture(),analysis=buildWorkflowAnalysis({material,projectId,pdf}),input={material,projectId,pdf,analysis,chapterId:'chapter:1'},plan=chapterConversionPlan(input,{pages:[3]});
    assert.deepEqual(plan.chapterScope.sourcePages,[1,2]);assert.ok(plan.blocks.some(b=>b.blankPage));assert.ok(!plan.blocks.some(b=>b.source?.page===3));
    const output=writePdfHwpx(plan),doc=await analyzeReport(output.bytes,'chapter.hwpx'),provenance=JSON.parse(strFromU8(unzipSync(output.bytes)['Contents/jindan-source.json']));
    assert.ok(doc.paragraphs.some(p=>p.text==='공정 전용 내용'));assert.ok(!doc.paragraphs.some(p=>p.text.includes('기계')));assert.deepEqual(provenance.chapterScope,plan.chapterScope);
    const next=chapterConversionPlan({...input,chapterId:'chapter:2'}),second=await analyzeReport(writePdfHwpx(next).bytes,'second.hwpx');assert.deepEqual(next.chapterScope.sourcePages,[3]);assert.ok(second.paragraphs.some(p=>p.text==='기계 전용 내용'));assert.ok(!second.paragraphs.some(p=>p.text.includes('공정')));
});
test('chapter conversion rejects missing selection, stale source/project and ambiguous page ownership',async()=>{
    const {buildWorkflowAnalysis}=await import('../src/services/report/workflowAnalysis.js'),{chapterConversionScope}=await import('../src/services/report/chapterConversion.js');const pdf=await fixture(),analysis=buildWorkflowAnalysis({material,projectId,pdf}),input={material,projectId,pdf,analysis,chapterId:'chapter:1'};
    assert.throws(()=>chapterConversionScope({...input,chapterId:''}),/장 카드/);assert.throws(()=>chapterConversionScope({...input,analysis:{...analysis,sourceSha256:'a'.repeat(64)}}),/복원 분석/);assert.throws(()=>chapterConversionScope({...input,pdf:{...pdf,projectId:'project:other'}}),/복원 분석/);
    assert.throws(()=>chapterConversionScope({...input,pdf:{...pdf,parserVersion:'pdf-structure/2'}}),/복원 분석을 다시/);
    assert.throws(()=>chapterConversionScope({...input,pdf:{...pdf,parserVersion:'pdf-structure/4'}}),/복원 분석을 다시/);
    assert.throws(()=>chapterConversionScope({...input,pdf:{...pdf,parserVersion:'pdf-structure/5'}}),/복원 분석을 다시/);
    assert.throws(()=>chapterConversionScope({...input,pdf:{...pdf,parserVersion:'pdf-structure/6'}}),/복원 분석을 다시/);
    assert.throws(()=>chapterConversionScope({...input,pdf:{...pdf,parserVersion:undefined}}),/복원 분석을 다시/);
    for(const pages of [[1,1],[1,3],[0],[4],[]])assert.throws(()=>chapterConversionScope({...input,analysis:{...analysis,chapters:analysis.chapters.map(c=>c.id==='chapter:1'?{...c,pages}:c)}}),/페이지 범위/);
});
test('chapter candidates use Windows-safe distinguishable filenames',async()=>{
    const {chapterCandidateFilename}=await import('../src/services/report/chapterConversion.js');
    const name=chapterCandidateFilename('기존:보고서.pdf','제2장 기계/설비?');assert.ok(name.endsWith('.hwpx'));assert.ok(!/[<>:"/\\|?*]/.test(name));assert.notEqual(name,chapterCandidateFilename('기존:보고서.pdf','제1장 공정'));
});
