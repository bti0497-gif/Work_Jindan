const {test}=require('node:test');const assert=require('node:assert/strict');
test('studio destinations come only from registered projects and material membership includes nested evidence',async()=>{
    const {studioProjectOptions,studioMaterialIds}=await import('../src/services/report/studioProjects.js');
    assert.deepEqual(studioProjectOptions([{id:'one',title:'업무 프로젝트'},{id:'gone',deleted:true},{}]),[{id:'project:one',businessProjectId:'one',name:'업무 프로젝트'}]);
    const ids=studioMaterialIds({reportIds:['old','candidate'],materialIds:['sheet'],coverId:'cover',electrical:{inputs:{thermal:[{materialId:'bmt'}]}},pageTrial:{pdfMaterialId:'pdf'},applicationChanges:[{sourceMaterialId:'old',evidence:{materialId:'sheet'}}]});
    assert.deepEqual([...ids].sort(),['bmt','candidate','cover','old','pdf','sheet']);
});
test('CSV preserves quoted fields, zero and exact coordinates; candidate replaces only selected HWPX cell',async()=>{
    const {readInputTables,createReportTextCandidate}=await import('../src/services/report/applicationData.js');
    const {analyzeReport}=await import('../src/services/report/sourceParser.js');
    const {zipSync,strToU8,unzipSync,strFromU8}=await import('fflate');
    const data=readInputTables(strToU8('설비,전류\r\n"P,1",0\r\nP2,"12.5"'),'measure.csv');assert.equal(data.tables[0].rows[1][0].value,'P,1');assert.equal(data.tables[0].rows[1][1].value,'0');assert.equal(data.tables[0].rows[2][1].address,'R3C2');
    const p=t=>`<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`,c=(col,text)=>`<hp:tc><hp:subList>${p(text)}</hp:subList><hp:cellAddr rowAddr="0" colAddr="${col}"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>`;
    const bytes=zipSync({mimetype:strToU8('application/hwp+zip'),'Contents/section0.xml':strToU8(`<hs:sec xmlns:hs="s" xmlns:hp="p">${p('운전전류')}<hp:p><hp:run><hp:tbl rowCnt="1" colCnt="2"><hp:tr>${c(0,'펌프')}${c(1,'220')}</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`),'BinData/keep.bin':Uint8Array.from([1,2,3])});
    const doc=await analyzeReport(bytes,'test.hwpx'),table=doc.tables[0];
    const out=await createReportTextCandidate(bytes,'test.hwpx',doc.source.sha256,{tableId:table.id,cellId:table.cells[1].id},'12.5');
    const next=await analyzeReport(out.bytes,'candidate.hwpx');assert.equal(next.tables[0].cells[0].text,'펌프');assert.equal(next.tables[0].cells[1].text,'12.5');assert.deepEqual(unzipSync(out.bytes)['BinData/keep.bin'],Uint8Array.from([1,2,3]));assert.equal(out.review.requiresLayoutReview,true);
    await assert.rejects(createReportTextCandidate(bytes,'test.hwpx','0'.repeat(64),{tableId:table.id,cellId:table.cells[1].id},'1'),/원본 버전/);
});
test('XLSX extraction follows sheet relations, shared strings and sparse addresses and flags cached formulas',async()=>{
    const {readInputTables}=await import('../src/services/report/applicationData.js'),{zipSync,strToU8}=await import('fflate');
    const input=zipSync({'xl/workbook.xml':strToU8('<workbook xmlns:r="r"><sheets><sheet name="운전전류" r:id="rId1"/></sheets></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/sharedStrings.xml':strToU8('<sst><si><t>설비명</t></si></sst>'),'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>0</v></c></row><row r="2"><c r="C2"><f>SUM(C1)</f><v>0</v></c></row></sheetData></worksheet>')});
    const result=readInputTables(input,'input.xlsx');assert.equal(result.tables[0].name,'운전전류');assert.equal(result.tables[0].rows[0][0].value,'설비명');assert.equal(result.tables[0].rows[0][1].address,'C1');assert.equal(result.tables[0].rows[1][0].formula,true);assert.equal(result.reportReady,false);
});
test('report specification validates margins, source binding and fixed duplex policy',async()=>{
    const {specificationFromProfile,validateSpecification}=await import('../src/services/report/reportSpecification.js');
    const spec=specificationFromProfile({source:{sha256:'a'.repeat(64)},sections:[{section:'Contents/section0.xml',widthMm:210,heightMm:297,marginsMm:{left:25,right:20,top:15,bottom:15}}],headers:[{text:'전기'}],typography:[{value:{font:'바탕',sizePt:11}}]});
    assert.equal(spec.margins.left,25);assert.equal(spec.header,'전기');assert.equal(validateSpecification({...spec,blankPageFurniture:true}).blankPageFurniture,false);assert.throws(()=>validateSpecification({...spec,margins:{...spec.margins,left:210}}),/여백/);
});
test('project archive rejects path traversal and missing or altered blobs before restoration',async()=>{
    const {readProjectArchive}=await import('../src/services/report/projectArchive.js'),{zipSync,strToU8}=await import('fflate');
    await assert.rejects(readProjectArchive(zipSync({'../bad':strToU8('x')})),/경로/);
    const manifest={schema:'jindan-report-project/1',book:{title:'test',chapters:[{id:'c',kind:'chapter',title:'본문',text:''}],reportIds:['reference-'+ 'a'.repeat(64)]},materials:[{id:'reference-'+ 'a'.repeat(64),sha256:'a'.repeat(64),filename:'ref.pdf',format:'pdf',role:'reference',size:8}],referenceProjects:[],referenceEntries:[]};
    await assert.rejects(readProjectArchive(zipSync({'project.json':strToU8(JSON.stringify(manifest))})),/누락/);
    await assert.rejects(readProjectArchive(zipSync({'project.json':strToU8(JSON.stringify(manifest)),[`files/${manifest.materials[0].id}.pdf`]:strToU8('%PDF-1.4')})),/검증/);
});
