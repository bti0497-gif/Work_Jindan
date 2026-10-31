const {test}=require('node:test'),assert=require('node:assert/strict');
const source={sha256:'a'.repeat(64),filename:'source.pdf',materialId:'pdf-source',format:'pdf'};
const item=(text,x,y)=>({text,x,baseline:y+10,size:10,bbox:[x,y,x+30,y+11]});
async function fixture(){
    const {recoverPdfTables,buildPdfAnalysis}=await import('../src/services/report/pdfStructure.js');
    const segments=[10,30,50,70].map(at=>({axis:'h',at,start:10,end:210}));
    segments.push({axis:'v',at:10,start:10,end:70},{axis:'v',at:210,start:10,end:70},{axis:'v',at:110,start:30,end:70});
    const {tables}=recoverPdfTables([item('측정표',20,15),item('전압',20,35),item('220',120,35),item('전류',20,55),item('12.5',120,55)],{segments,images:[]},1);
    const page={number:1,widthPt:595,heightPt:842,lines:[{text:'제5장 전기 및 계측제어 설비',bbox:[70,80,450,102],size:18},{text:'전회 판정: 노후',bbox:[70,120,300,132],size:10}],tables:tables.map(t=>({...t,bbox:[10,150,210,210]})),images:[],warnings:[]};
    return buildPdfAnalysis([page],source,'project:one');
}
test('vector boundaries recover merged PDF cells and preserve zero/measurement strings',async()=>{
    const a=await fixture(),t=a.pages[0].tables[0];assert.equal(t.rows,3);assert.equal(t.columns,2);assert.equal(t.cells[0].colSpan,2);assert.equal(t.cells[2].text,'220');assert.equal(t.cells[4].text,'12.5');
});
test('chapter headings classify following pages without classifying a contents page as the chapter',async()=>{
    const {classifyPdfPages}=await import('../src/services/report/pdfStructure.js');
    const p=(n,text,size=18)=>({number:n,widthPt:595,heightPt:842,lines:text?[{text,size,bbox:[80,90,450,110]}]:[],tables:[],images:[],warnings:[]});
    const pages=classifyPdfPages([p(1,'제3장 공정 분야'),p(2,'운영 자료',10),p(3,'제4장 기계설비 분야'),p(4,'제5장 전기 및 계측제어'),p(5,'목차')]);
    assert.deepEqual(pages.map(p=>p.discipline),['process','process','mechanical','electrical','common']);assert.equal(pages[4].kind,'contents');
});
test('new HWPX contains editable tables, blanks historical values and binds PDF/project provenance',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{unzipSync,strFromU8}=await import('fflate');
    const a=await fixture();const plan=pdfAuthoringPlan(a,{pages:[1],labelsReviewed:true},'project:one','draft');const output=writePdfHwpx(plan);const document=await analyzeReport(output.bytes,'new.hwpx');
    assert.equal(document.tables.length,1);assert.equal(document.tables[0].cells[1].text,'전압');assert.equal(document.tables[0].cells[2].text,'');assert.ok(!document.paragraphs.some(p=>p.text.includes('전회 판정')));assert.equal(output.review.reportReady,false);
    const package=unzipSync(output.bytes),provenance=JSON.parse(strFromU8(package['Contents/jindan-source.json']));assert.equal(provenance.source.sha256,source.sha256);assert.equal(provenance.projectId,'project:one');
    assert.ok(strFromU8(package['Contents/section0.xml']).includes('pageStartsOn="ODD"'));
    const reference=await analyzeReport(writePdfHwpx(pdfAuthoringPlan(a,{pages:[1]},'project:one','reference')).bytes,'old.hwpx');assert.equal(reference.tables[0].cells[2].text,'220');assert.ok(reference.paragraphs.some(p=>p.text.includes('전회 판정')));
});
test('draft generation rejects foreign projects, unreviewed labels and mechanical/process pages',async()=>{
    const {pdfAuthoringPlan}=await import('../src/services/report/pdfHwpxWriter.js'),a=await fixture();
    assert.throws(()=>pdfAuthoringPlan(a,{pages:[1]},'project:other'),/프로젝트/);assert.throws(()=>pdfAuthoringPlan(a,{pages:[1]},'project:one'),/검토/);
    assert.throws(()=>pdfAuthoringPlan(a,{pages:[1],labelsReviewed:true,disciplines:{1:'mechanical'}},'project:one'),/전기/);
    assert.throws(()=>pdfAuthoringPlan(a,{pages:[1],labelsReviewed:true,labelColumns:{[a.pages[0].tables[0].id]:[99]}},'project:one'),/항목 열/);
    assert.throws(()=>pdfAuthoringPlan(a,{pages:[1],chapterNumber:0},'project:one','reference'),/장 번호/);
    a.pages[0].chapter='제7장 전기 설비';assert.ok(pdfAuthoringPlan(a,{pages:[1]},'project:one','reference').blocks[0].text.startsWith('제7장'));
});
test('OCR supplements raster body text without replacing native PDF cells or treating photos as body',async()=>{
    const {mergePdfOcr}=await import('../src/services/report/pdfOcr.js');
    const page={kind:'body',lines:[],tables:[{bbox:[0,0,50,50]}],images:[{kind:'text-raster',bbox:[0,60,200,80]},{kind:'figure',bbox:[0,90,200,150]}],warnings:[]};
    const head='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
    const tsv=head+'5\t1\t1\t1\t1\t1\t10\t10\t20\t10\t99\t999\n5\t1\t2\t1\t1\t1\t10\t64\t60\t10\t90\t본문\n5\t1\t3\t1\t1\t1\t10\t100\t40\t10\t90\t사진글자';
    const result=mergePdfOcr(page,tsv,1);assert.equal(result.ocr.lines.length,1);assert.equal(result.ocr.lines[0].text,'본문');assert.equal(result.textVerified,false);assert.equal(result.ocr.reviewed,false);
    assert.equal(mergePdfOcr({...page,kind:'scan',tables:[],images:[{kind:'figure',bbox:[0,0,500,500]}]},tsv,1).ocr.lines.length,3);
});
test('newly created blank cells accept the existing HWPX replacement engine',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{createReportTextCandidate}=await import('../src/services/report/applicationData.js');
    const a=await fixture(),out=writePdfHwpx(pdfAuthoringPlan(a,{pages:[1],labelsReviewed:true},'project:one'));const doc=await analyzeReport(out.bytes,'new.hwpx'),table=doc.tables[0];
    const changed=await createReportTextCandidate(out.bytes,'new.hwpx',doc.source.sha256,{tableId:table.id,cellId:table.cells[2].id},'229.1');const result=await analyzeReport(changed.bytes,'filled.hwpx');assert.equal(result.tables[0].cells[2].text,'229.1');assert.equal(result.tables[0].cells[1].text,'전압');
});

test('PDF output uses the saved body font, margins and furniture and rejects invalid page geometry',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{unzipSync,strFromU8}=await import('fflate');
    const a=await fixture(),plan=pdfAuthoringPlan(a,{pages:[1]},'project:one','reference');
    const spec={fontFamily:'함초롬돋움',fontSizePt:11.5,widthMm:210,heightMm:297,margins:{left:25,right:15,top:20,bottom:20},header:'금회 전기 진단',headerVisible:true,pageNumberVisible:false};
    const output=unzipSync(writePdfHwpx(plan,{spec}).bytes),header=strFromU8(output['Contents/header.xml']),section=strFromU8(output['Contents/section0.xml']);
    assert.ok(header.includes('face="함초롬돋움"'));assert.ok(header.includes('height="1150"'));assert.ok(section.includes('left="7087"'));assert.ok(section.includes('금회 전기 진단'));assert.ok(!section.includes('<hp:pageNum '));
    assert.throws(()=>writePdfHwpx(plan,{spec:{...spec,widthMm:0}}),/용지/);assert.throws(()=>writePdfHwpx(plan,{spec:{...spec,fontSizePt:0}}),/글자/);assert.throws(()=>writePdfHwpx(plan,{spec:{...spec,margins:{...spec.margins,left:200}}}),/여백/);
});
test('electrical data requests use project-bound PDF text and do not infer absence while raster text is unread',async()=>{
    const {electricalPdfCandidates,resolveKepcoScope}=await import('../src/services/report/electricalPreparation.js');
    const a=await fixture();a.pages[0].lines.push({text:'한전 전력사용량 · 전기요금',bbox:[60,80,300,90],size:10});a.pages[0].images=[{kind:'text-raster',bbox:[20,100,200,120]}];
    const result=electricalPdfCandidates(a,'project:one');assert.equal(result.incompletePdfText,true);assert.ok(result.candidates.some(c=>c.sections.includes('kepco')));assert.equal(resolveKepcoScope({plan:{files:[result]}},true).mode,'include');
    assert.throws(()=>electricalPdfCandidates(a,'project:foreign'),/프로젝트/);
    a.pages[0].lines=a.pages[0].lines.filter(l=>!l.text.includes('한전'));const incomplete=electricalPdfCandidates(a,'project:one');assert.equal(resolveKepcoScope({plan:{files:[incomplete]}},true).mode,'pending');
});
