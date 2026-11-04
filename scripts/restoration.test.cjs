const {test}=require('node:test');
const assert=require('node:assert/strict');

async function fixture(){
    const {writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js');
    const {unzipSync,strFromU8,strToU8}=await import('fflate');
    const {packHwpxPackage}=await import('../src/services/report/hwpxPackage.js');
    const table={id:'table-1',rows:2,columns:2,columnWidths:[90,90],rowHeights:[20,20],cells:[
        {id:'c0',row:0,column:0,rowSpan:1,colSpan:1,text:'설비'},{id:'c1',row:0,column:1,rowSpan:1,colSpan:1,text:'운전전류'},
        {id:'c2',row:1,column:0,rowSpan:1,colSpan:1,text:'펌프 A'},{id:'c3',row:1,column:1,rowSpan:1,colSpan:1,text:'12.5 A'}]};
    const out=writePdfHwpx({schema:'jindan-pdf-authoring/1',projectId:'project:test',mode:'reference',source:{sha256:'a'.repeat(64)},blocks:[{kind:'heading',text:'제5장 전기 설비'},{kind:'paragraph',text:'기존 본문 진단 결과임.'},{kind:'table',table,caption:'<표 5-1> 점검표'}],mapping:[],editedLocations:[],warnings:[]},{spec:{header:'전회 시설 · 2023년',headerVisible:true,footer:'보고서 작성기관',footerVisible:true}});
    const files=unzipSync(out.bytes);let xml=strFromU8(files['Contents/section0.xml']);
    const shape='<hp:rect id="991" textWrap="TOP_AND_BOTTOM"><hp:sz width="7200" height="3600"/><hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzOffset="100" vertOffset="200"/></hp:rect>';
    xml=xml.replace('</hp:header>',`<hp:subList><hp:p id="998" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">${shape}<hp:pic id="992"><hp:sz width="1000" height="1000"/><hc:img binaryItemIDRef="keep"/></hp:pic></hp:run></hp:p></hp:subList></hp:header>`);
    files['Contents/section0.xml']=strToU8(xml);files['BinData/keep.png']=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZl0AAAAASUVORK5CYII=','base64'));
    files['Contents/content.hpf']=strToU8(strFromU8(files['Contents/content.hpf']).replace('</opf:manifest>','<opf:item id="keep" href="BinData/keep.png" media-type="image/png" isEmbeded="1"/></opf:manifest>'));
    const bytes=packHwpxPackage(files),{analyzeReferenceSource}=await import('../src/services/report/referenceAnalyzer.js'),{specificationFromProfile}=await import('../src/services/report/reportSpecification.js');
    const profile=await analyzeReferenceSource(bytes,'source.hwpx');return {bytes,files,shape,profile,spec:specificationFromProfile(profile)};
}

test('native inspection distinguishes rich header objects, areas and immutable source anchors',async()=>{
    const {inspectRestoration}=await import('../src/services/report/restoration.js'),f=await fixture(),info=inspectRestoration(f.bytes,f.spec.sourceSha256);
    assert.equal(info.furniture.filter(a=>a.kind==='header').length,1);assert.equal(info.furniture[0].pictures,1);assert.equal(info.furniture[0].shapes,1);
    assert.ok(info.objects.some(o=>o.kind==='tbl'&&o.area==='body'));assert.ok(info.objects.some(o=>o.kind==='rect'&&o.area==='header'&&o.position));assert.equal(info.layoutVerified,false);
});

test('source style injection clones body styles, changes page geometry and retains rich furniture, cells and binary assets',async()=>{
    const {applyRestorationSpecification}=await import('../src/services/report/restoration.js'),{unzipSync,strFromU8}=await import('fflate'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),f=await fixture();
    const output=await applyRestorationSpecification(f.bytes,{...f.spec,fontFamily:'맑은 고딕',fontSizePt:12,widthPercent:95,spacingPercent:-3,lineSpacingPercent:170,applyBodyStyle:true,margins:{...f.spec.margins,left:24}});
    const files=unzipSync(output.bytes),xml=strFromU8(files['Contents/section0.xml']),header=strFromU8(files['Contents/header.xml']);
    assert.ok(xml.includes(f.shape));assert.deepEqual(files['BinData/keep.png'],f.files['BinData/keep.png']);assert.ok(header.includes('face="맑은 고딕"'));assert.ok(header.includes('hangul="95"'));assert.ok(header.includes('hangul="-3"'));assert.ok(header.includes('value="170"'));
    assert.ok(xml.includes('left="6803"'));const before=await analyzeReport(f.bytes,'a.hwpx'),after=await analyzeReport(output.bytes,'b.hwpx');
    assert.deepEqual(after.tables.map(t=>t.cells.map(c=>c.text)),before.tables.map(t=>t.cells.map(c=>c.text)));assert.equal(output.review.reportReady,false);assert.equal(output.review.preservedObjects,3);
    const sourceHeader=strFromU8(f.files['Contents/header.xml']);assert.ok(header.includes(sourceHeader.match(/<hh:charPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:charPr>/)[0]));
    const {analyzeReferenceSource}=await import('../src/services/report/referenceAnalyzer.js'),{specificationFromProfile}=await import('../src/services/report/reportSpecification.js');
    const saved=specificationFromProfile(await analyzeReferenceSource(output.bytes,'candidate.hwpx'));assert.equal(saved.widthPercent,95);assert.equal(saved.spacingPercent,-3);assert.equal(saved.fontSizePt,12);
});

test('rich header literal text and floating shape positions can change without flattening the shape or losing pictures',async()=>{
    const {inspectRestoration,applyRestorationSpecification}=await import('../src/services/report/restoration.js'),{unzipSync,strFromU8}=await import('fflate'),f=await fixture(),info=inspectRestoration(f.bytes,f.spec.sourceSha256);
    const area=info.furniture.find(a=>a.kind==='header'),slot=area.slots.find(s=>s.text.includes('전회')),shape=info.objects.find(o=>o.kind==='rect');
    const result=await applyRestorationSpecification(f.bytes,{...f.spec,furnitureEdits:{[slot.slotId]:'금회 시설 & 진단'},furnitureAlignments:{[area.id]:'RIGHT'},objectPositions:{[shape.id]:{positioning:'page',horizontalMm:20,verticalMm:12}}});
    const xml=strFromU8(unzipSync(result.bytes)['Contents/section0.xml']);assert.ok(xml.includes('금회 시설 &amp; 진단'));assert.ok(xml.includes('<hp:rect'));assert.ok(xml.includes('<hp:pic'));assert.ok(xml.includes('horzOffset="5669"'));assert.ok(xml.includes('vertOffset="3402"'));
    assert.ok(strFromU8(unzipSync(result.bytes)['Contents/header.xml']).includes('horizontal="RIGHT"'));
});

test('style writing rejects stale sources, invalid typography and unrelated text or object anchors',async()=>{
    const {applyRestorationSpecification}=await import('../src/services/report/restoration.js'),f=await fixture();
    await assert.rejects(applyRestorationSpecification(f.bytes,{...f.spec,sourceSha256:'0'.repeat(64)}),/원본 버전/);
    await assert.rejects(applyRestorationSpecification(f.bytes,{...f.spec,widthPercent:900}),/장평/);
    await assert.rejects(applyRestorationSpecification(f.bytes,{...f.spec,furnitureEdits:{foreign:'text'}}),/원본 글자/);
    await assert.rejects(applyRestorationSpecification(f.bytes,{...f.spec,objectPositions:{foreign:{positioning:'page',horizontalMm:1,verticalMm:1}}}),/개체 위치/);
});

test('PDF restoration preserves native header tables and editable footer text instead of silently dropping margin content',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{unzipSync,strFromU8}=await import('fflate');
    const table={id:'head-table',bbox:[20,15,200,55],rows:2,columns:2,columnWidths:[90,90],rowHeights:[20,20],cells:[0,1,2,3].map(i=>({id:'h'+i,row:Math.floor(i/2),column:i%2,rowSpan:1,colSpan:1,text:'항목'+i}))};
    const page={number:1,widthPt:595,heightPt:842,discipline:'electrical',kind:'body',tables:[table],images:[],lines:[{text:'전회 진단기관',size:9,bbox:[30,5,200,14]},{text:'전기설비 본문임.',size:11,bbox:[50,90,300,102]},{text:'- 99 -',size:9,bbox:[270,815,325,827]}]};
    const analysis={schema:'jindan-pdf-analysis/1',projectId:'project:test',source:{sha256:'a'.repeat(64)},pages:[page]};
    const plan=pdfAuthoringPlan(analysis,{pages:[1]},'project:test','reference');assert.equal(plan.furniture[0].tables.length,1);assert.ok(!plan.blocks.some(b=>b.kind==='table'));
    const output=writePdfHwpx(plan,{spec:{widthPercent:93,spacingPercent:-2,lineSpacingPercent:175}}),doc=await analyzeReport(output.bytes,'candidate.hwpx'),xml=strFromU8(unzipSync(output.bytes)['Contents/section0.xml']);
    assert.equal(doc.tables.length,1);assert.ok(doc.paragraphs.some(p=>p.text.includes('전회 진단기관')));assert.ok(xml.includes('applyPageType="BOTH"'));assert.ok(xml.includes('page="99"'));assert.ok(xml.includes('<hp:newNum num="99" numType="PAGE"'));assert.ok(!doc.paragraphs.some(p=>p.text==='- 99 -'));
});

test('replacement inventory keeps exact cell provenance and separates candidates from approvals',async()=>{
    const {replacementInventory}=await import('../src/services/report/restoration.js');
    const result=replacementInventory({source:{sha256:'a'.repeat(64)},paragraphs:[{id:'p1',text:'2023년 측정 결과 양호함.'}],tables:[{id:'t1',title:'점검표',cells:[{id:'c1',row:1,column:1,text:'운전전류 0 A'}]}]});
    assert.equal(result.items.length,2);assert.equal(result.items[0].target.cellId,'c1');assert.equal(result.items[0].target.tableId,'t1');assert.ok(result.items.every(i=>i.status==='review-required'));assert.equal(result.reportReady,false);
});

test('picture replacement clones a shared asset and changes only the selected source object',async()=>{
    const {inspectRestoration,applyRestorationSpecification}=await import('../src/services/report/restoration.js'),{packHwpxPackage}=await import('../src/services/report/hwpxPackage.js'),{unzipSync,strFromU8,strToU8}=await import('fflate'),f=await fixture();
    f.files['Contents/section0.xml']=strToU8(strFromU8(f.files['Contents/section0.xml']).replace('</hs:sec>','<hp:p id="999" paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:pic id="993"><hc:img binaryItemIDRef="keep"/></hp:pic></hp:run></hp:p></hs:sec>'));
    const source=packHwpxPackage(f.files),sourceSha256=Buffer.from(await crypto.subtle.digest('SHA-256',source)).toString('hex'),info=inspectRestoration(source,sourceSha256),target=info.objects.find(o=>o.kind==='pic');
    assert.equal(info.objects.filter(o=>o.image?.binaryId==='keep').length,2);
    const replacement={objectId:target.id,materialId:'image-'+ 'b'.repeat(64),sha256:'b'.repeat(64)},picture={bytes:f.files['BinData/keep.png'],mime:'image/png',materialId:replacement.materialId,sourceSha256:replacement.sha256};
    const result=await applyRestorationSpecification(source,{...f.spec,sourceSha256,pictureReplacements:[replacement]},{pictures:{[target.id]:picture}}),files=unzipSync(result.bytes),xml=strFromU8(files['Contents/section0.xml']);
    assert.equal((xml.match(/binaryItemIDRef="keep"/g)||[]).length,1);assert.equal((xml.match(/binaryItemIDRef="jindanReplacement1"/g)||[]).length,1);
    assert.deepEqual(files['BinData/keep.png'],f.files['BinData/keep.png']);assert.deepEqual(files['BinData/jindanReplacement1.png'],picture.bytes);assert.equal(result.review.imageChanges.length,1);
    await assert.rejects(applyRestorationSpecification(source,{...f.spec,sourceSha256,pictureReplacements:[replacement]},{pictures:{[target.id]:{...picture,sourceSha256:'c'.repeat(64)}}}),/교체 그림/);
});

test('role-specific styles change chapter and table text independently without changing body or furniture',async()=>{
    const {applyRestorationSpecification}=await import('../src/services/report/restoration.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{analyzeReferenceSource}=await import('../src/services/report/referenceAnalyzer.js'),f=await fixture();
    const output=await applyRestorationSpecification(f.bytes,{...f.spec,roleStyles:{chapterTitle:{fontFamily:'맑은 고딕',fontSizePt:22},tableBody:{fontSizePt:13,widthPercent:92}}});
    const profile=await analyzeReferenceSource(output.bytes,'roles.hwpx'),doc=await analyzeReport(output.bytes,'roles.hwpx');assert.equal(profile.roleTypography.chapterTitle[0].value.sizePt,22);assert.equal(profile.roleTypography.chapterTitle[0].value.font,'맑은 고딕');assert.equal(profile.roleTypography.tableBody[0].value.sizePt,13);assert.equal(profile.roleTypography.tableBody[0].value.widthPercent,92);assert.equal(profile.bodyTypography[0].value.sizePt,f.profile.bodyTypography[0].value.sizePt);assert.ok(doc.paragraphs.some(p=>p.area==='header'&&p.text.includes('전회')));assert.equal(output.review.reportReady,false);
});

test('chapter typography uses native paragraph anchors and leaves adjacent chapters and shared furniture unchanged',async()=>{
    const {writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{analyzeReferenceSource}=await import('../src/services/report/referenceAnalyzer.js'),{inspectRestoration,applyRestorationSpecification}=await import('../src/services/report/restoration.js'),{buildWorkflowAnalysis}=await import('../src/services/report/workflowAnalysis.js'),{specificationFromProfile}=await import('../src/services/report/reportSpecification.js');
    const input=writePdfHwpx({schema:'jindan-pdf-authoring/1',projectId:'project:test',mode:'reference',source:{sha256:'a'.repeat(64)},blocks:[{kind:'heading',text:'제1장 현황'},{kind:'paragraph',text:'첫 장 본문임.'},{kind:'heading',text:'제2장 공정'},{kind:'paragraph',text:'둘째 장 본문임.'}],mapping:[],editedLocations:[],warnings:[]},{spec:{header:'공통 머리말',headerVisible:true}}).bytes;
    const doc=await analyzeReport(input,'native.hwpx'),profile=await analyzeReferenceSource(input,'native.hwpx'),material={sha256:doc.source.sha256,format:'hwpx'},analysis=buildWorkflowAnalysis({material,projectId:'project:test',document:doc,profile,restoration:inspectRestoration(input,doc.source.sha256)});
    assert.equal(analysis.purpose,'authoring');assert.equal(analysis.chapters.length,2);assert.ok(analysis.chapters.every(c=>c.counts.bodyPages===null&&c.counts.headers===1&&c.fonts.length));
    const chapter=analysis.chapters.find(c=>c.number===1),spec={...specificationFromProfile(profile),typographyScope:chapter.paragraphScope,roleStyles:{body:{fontSizePt:17}}},output=await applyRestorationSpecification(input,spec),after=await analyzeReport(output.bytes,'edited.hwpx');
    const chars=(report,text)=>report.paragraphs.find(p=>p.textSlots.some(s=>s.text===text)).textSlots[0].charShapeId;
    assert.notEqual(chars(after,'첫 장 본문임.'),chars(doc,'첫 장 본문임.'));assert.equal(chars(after,'둘째 장 본문임.'),chars(doc,'둘째 장 본문임.'));assert.equal(chars(after,'공통 머리말'),chars(doc,'공통 머리말'));
    const area=doc.paragraphs.find(p=>p.area==='header');await assert.rejects(applyRestorationSpecification(input,{...spec,typographyScope:[{section:area.anchor.section,index:area.index}]}),/챕터 문단/);
});
