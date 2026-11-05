const {test}=require('node:test'),assert=require('node:assert/strict');
const sha='a'.repeat(64),fontInfo={embeddedStreamSha256:sha,spaceAdvance:{codePoint:32,advanceUnits:500,unitsPerEm:1000,method:'original-sfnt-space-cmap-hmtx'}};
async function lineFixture(){
 const {pdfGraphics,pdfTextItems,pdfLines}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfStructure.js');
 const ops={beginText:1,setFont:2,setTextMatrix:3,showText:4},list={fnArray:[1,2,3,4],argsArray:[[],['F',10],[1,0,0,1,60,600],[[{unicode:'가',width:1000},-440,{unicode:'나',width:1000}]]]},g=pdfGraphics(list,ops,{transform:[1,0,0,-1,0,842]}),items=pdfTextItems({items:[{str:'가 나',transform:[10,0,0,10,60,600],width:24.4,fontName:'F'}],styles:{F:{sourceFont:'굴림',sourceInfo:fontInfo}}},{transform:[1,0,0,-1,0,842],scale:1},[],[],g.textGlyphs);
 return {g,items,line:pdfLines(items)[0],pdfLines};
}
test('inferred space consumes the original TJ word advance once, keeping logical text, glyph positions, font width and size',async()=>{
 const {g,line}=await lineFixture(),{pdfRunTypography}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfCellLayout.js');
 assert.equal(line.text,'가 나');assert.equal(g.textGlyphs[0].spacingPercent,44);assert.deepEqual(line.runs.map(r=>r.text),['가',' ','나']);
 assert.deepEqual(line.runs.map(r=>pdfRunTypography(r).typography.spacingPercent),[-6,0,0]);assert.equal(line.runs[0].trackingSources[0].reconstructedWhitespace.advanceUnits,500);
 assert.equal(line.runs[0].trackingSources[0].exactPercent,44);assert.equal(g.textGlyphs[1].x,74.4);
 // 10pt glyph -0.6pt tracking +5pt measured space =14.4pt, not19.4pt.
 assert.ok(Math.abs(10+10*(-6)/100+10*.5-(g.textGlyphs[1].x-g.textGlyphs[0].x))<1e-8);
 const tampered=structuredClone(line.runs[0]);tampered.trackingSources[0].reconstructedWhitespace.advanceUnits=400;assert.throws(()=>pdfRunTypography(tampered),/공백/);
 const stale=structuredClone(line.runs[0]);stale.trackingSources[0].reconstructedWhitespace.embeddedStreamSha256='stale';assert.throws(()=>pdfRunTypography(stale),/공백/);
});
test('unknown metrics, explicit PDF space advances, independent matrices and tabs are not treated as the same TJ word gap',async()=>{
 const {items,pdfLines}=await lineFixture();
 for(const change of [a=>{delete a[0].fontInfo;},a=>{a[1].x+=5;a[1].bbox=a[1].bbox.map((v,i)=>i%2===0?v+5:v);},a=>{a[1].x+=50;a[1].bbox=a[1].bbox.map((v,i)=>i%2===0?v+50:v);}]){
  const a=structuredClone(items);change(a);const line=pdfLines(a)[0];assert.ok(!line.runs.some(r=>r.trackingSources?.some(e=>e.reconstructedWhitespace)));assert.ok(!line.runs.some(r=>r.inferredSpaceSource));
 }
 assert.ok(items.every(i=>!i.trackingSource?.reconstructedWhitespace),'parser input evidence is immutable');
});
test('an original subset without a space glyph represents an observed word gap once and retains its unmeasured status',async()=>{
 const {items,pdfLines}=await lineFixture(),a=structuredClone(items);for(const item of a)item.fontInfo.spaceAdvance=null;
 const line=pdfLines(a)[0],{pdfRunTypography}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfCellLayout.js');assert.equal(line.text,'가 나');assert.deepEqual(line.runs.map(r=>r.text),['가',' ','나']);assert.deepEqual(line.runs.map(r=>pdfRunTypography(r).typography.spacingPercent),[0,0,0]);
 const e=line.runs[0].trackingSources[0];assert.equal(e.exactPercent,44);assert.equal(e.representedAsSpace.method,'source-word-gap-inferred-space-unmeasured');assert.ok(!e.reconstructedWhitespace);assert.equal(e.representedAsSpace.horizontalEmPt,10);
 const bad=structuredClone(line.runs[0]);bad.trackingSources[0].representedAsSpace.sourceGapPt+=1;assert.throws(()=>pdfRunTypography(bad),/단어 간격/);
 const invented=structuredClone(line.runs[0]);invented.style.fontInfo.spaceAdvance=fontInfo.spaceAdvance;assert.throws(()=>pdfRunTypography(invented),/단어 간격/);
});
test('source SFNT space advance reads the cmap/hmtx only and does not change font bytes',async()=>{
 const {sfntSpaceAdvance}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/sfntFonts.js'),bytes=require('./fixtures/legacy-font.cjs')(),before=bytes.slice();
 assert.equal(sfntSpaceAdvance(bytes),null);assert.deepEqual(bytes,before);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let cmap,hmtx;
 for(let i=0;i<view.getUint16(4);i++){const at=12+i*16,tag=String.fromCharCode(...bytes.subarray(at,at+4));if(tag==='cmap')cmap=view.getUint32(at+8);if(tag==='hmtx')hmtx=view.getUint32(at+8);}
 const sub=cmap+view.getUint32(cmap+8),n=view.getUint16(sub+6)/2;view.setUint16(sub+14,32);view.setUint16(sub+16+n*2,32);view.setUint16(sub+16+n*4,(1-32)&65535);view.setUint16(hmtx,500);
 assert.deepEqual(sfntSpaceAdvance(bytes),fontInfo.spaceAdvance);
});
test('paired paragraph condense is learned and preserved only from valid original paragraph data',async()=>{
 const {paragraphStyleValues}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/paragraphFormatting.js'),{pairedParagraphStyle}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pairedParagraphStyle.js'),{default:base}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/assets/hwpxBase.json',{with:{type:'json'}}),{analyzeReferenceSource}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/referenceAnalyzer.js'),{packHwpxPackage}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js'),{strToU8}=require('fflate');
 assert.equal(paragraphStyleValues({condense:'20'},()=>[]).condense,'20');
 const profile=await analyzeReferenceSource(packHwpxPackage({'Contents/header.xml':strToU8(base.header),'Contents/section0.xml':strToU8(base.sectionOpen+'</hs:sec>')}),'base.hwpx'),pr=base.header.match(/<hh:paraPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:paraPr>/)[0],style={...profile.paragraphStyles['0'],condense:'20'};
 const changed=pairedParagraphStyle(pr,99,style);assert.ok(changed.includes('condense="20"'));assert.equal(changed.replace('id="99"','id="0"').replace('condense="20"','condense="0"'),pairedParagraphStyle(pr,0,{...style,condense:'0'}));
 for(const bad of ['101','-1','20.5','x'])assert.throws(()=>pairedParagraphStyle(pr,99,{...style,condense:bad}),/공백/);
});
