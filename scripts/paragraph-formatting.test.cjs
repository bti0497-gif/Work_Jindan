const {test}=require('node:test'),assert=require('node:assert/strict');

async function fixture(){
    const {default:base}=await import('../src/services/report/assets/hwpxBase.json',{with:{type:'json'}}),{packHwpxPackage}=await import('../src/services/report/hwpxPackage.js'),{strToU8}=await import('fflate');
    const p=text=>`<hp:p id="10" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="40000" flags="393216"/></hp:linesegarray></hp:p>`;
    const xml=base.sectionOpen+p('Selected A</hp:t><hp:lineBreak/><hp:t>Selected B')+p('Adjacent paragraph')+`<hp:p id="11" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">${base.sectionProperties}${base.columns}<hp:ctrl><hp:header id="12" applyPageType="BOTH"><hp:subList>${p('Shared header')}</hp:subList></hp:header></hp:ctrl></hp:run></hp:p></hs:sec>`;
    const header=base.header.replace(/<hh:paraPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:paraPr>/,s=>s.replace(/<hc:left value="0"/g,'<hc:left value="720"').replace(/<hc:intent value="0"/g,'<hc:intent value="-360"').replace(/<hc:prev value="0"/g,'<hc:prev value="200"'));
    return packHwpxPackage({'mimetype':strToU8('application/hwp+zip'),'Contents/header.xml':strToU8(header),'Contents/section0.xml':strToU8(xml)});
}

test('native HWPX learning reads real indents, spacing, break settings, style links and forced line breaks',async()=>{
    const {analyzeReferenceSource}=await import('../src/services/report/referenceAnalyzer.js'),{specificationFromProfile}=await import('../src/services/report/reportSpecification.js');
    const bytes=await fixture(),profile=await analyzeReferenceSource(bytes,'source.hwpx'),p=profile.paragraphStyles['0'];
    assert.ok(Math.abs(p.leftIndentMm-2.54)<.0001);assert.ok(Math.abs(p.firstLineIndentMm+1.27)<.0001);assert.equal(p.spaceBeforePt,2);assert.equal(p.keepLines,false);assert.equal(p.breakSetting.breakLatinWord,'KEEP_WORD');assert.equal(profile.counts.explicitLineBreaks,1);assert.equal(profile.paragraphFormats[0].value.styleId,'0');assert.equal(specificationFromProfile(profile).leftIndentMm,2.54);
});

test('selected paragraph edits clone its native style, retain manual line breaks and leave adjacent/shared paragraphs unchanged',async()=>{
    const {analyzeReferenceSource}=await import('../src/services/report/referenceAnalyzer.js'),{specificationFromProfile,validateSpecification}=await import('../src/services/report/reportSpecification.js'),{applyRestorationSpecification}=await import('../src/services/report/restoration.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{unzipSync,strFromU8}=await import('fflate');
    const bytes=await fixture(),before=bytes.slice(),profile=await analyzeReferenceSource(bytes,'source.hwpx'),spec={...specificationFromProfile(profile),applyBodyStyle:false,roleStyles:{body:{leftIndentMm:12.5,rightIndentMm:2,firstLineIndentMm:-3,spaceBeforePt:4,spaceAfterPt:6,paragraphAlign:'LEFT',keepWithNext:true,keepLines:true,widowOrphan:true}},typographyScope:[{section:'Contents/section0.xml',index:0}]};
    const out=await applyRestorationSpecification(bytes,spec),updated=await analyzeReferenceSource(out.bytes,'edited.hwpx'),doc=await analyzeReport(out.bytes,'edited.hwpx'),selected=doc.paragraphs.find(p=>p.text.includes('Selected A')),adjacent=doc.paragraphs.find(p=>p.text==='Adjacent paragraph'),header=doc.paragraphs.find(p=>p.text==='Shared header'),p=updated.paragraphStyles[selected.paragraphShapeId];
    assert.notEqual(selected.paragraphShapeId,'0');assert.equal(adjacent.paragraphShapeId,'0');assert.equal(header.paragraphShapeId,'0');assert.equal(selected.styleId,'0');assert.deepEqual(bytes,before);assert.ok(Math.abs(p.leftIndentMm-12.5)<.002);assert.ok(Math.abs(p.firstLineIndentMm+3)<.002);assert.equal(p.spaceAfterPt,6);assert.equal(p.keepWithNext,true);assert.equal(p.keepLines,true);assert.equal(p.paragraphAlign,'LEFT');assert.equal(p.lineSpacing.type,'PERCENT');assert.equal(p.lineSpacing.value,'160');assert.equal(updated.counts.explicitLineBreaks,1);assert.equal(selected.textSlots[0].charShapeId,'0');
    const xml=strFromU8(unzipSync(out.bytes)['Contents/section0.xml']);assert.equal((xml.match(/<hp:linesegarray>/g)||[]).length,2);assert.equal((xml.match(/<hp:lineBreak\/>/g)||[]).length,1);
    for(const invalid of [{leftIndentMm:NaN},{firstLineIndentMm:-301},{keepLines:'1'},{paragraphAlign:'unknown'}])assert.throws(()=>validateSpecification({...spec,roleStyles:{body:invalid}}));
});
