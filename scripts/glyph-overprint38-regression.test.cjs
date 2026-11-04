const {test}=require('node:test'),assert=require('node:assert/strict');
const glyph=(text,x,operator)=>({text,x,baseline:200,size:10,widthPercent:100,spacingPercent:0,bbox:[x,190,x+10,201.5],font:'F',color:'#000000',paintOrder:operator,trackingSource:{operator,glyphIndex:0,charSpace:0,tjAdjustment:0}}),item=text=>({text,x:60,baseline:200,size:10,bbox:[60,190,80,201.5],dir:'ltr'});
test('a fully matching identical overprint resolves one source row without doubling editable text',async()=>{
 const {observedPdfItems}=await import('../src/services/report/pdfGlyphGeometry.js'),g=[glyph('가',60,1),glyph('나',70,1),glyph('가',60,2),glyph('나',70,2)],before=structuredClone(g),r=observedPdfItems([item('가나')],g,{F:{sourceFont:'굴림'}});
 assert.equal(r.evidence.matchedRows,1);assert.equal(r.evidence.unresolvedRows,0);assert.equal(r.items.length,2);assert.equal(r.items.map(i=>i.text).join(''),'가나');assert.equal(r.evidence.identicalOverprints.length,1);assert.equal(r.evidence.identicalOverprints[0].sourceGlyphs,4);assert.deepEqual(r.evidence.identicalOverprints[0].duplicates[0].operators,[1,2]);assert.deepEqual(g,before);
});
test('shadows, different fonts/sizes/positions/tracking and incomplete text remain unresolved',async()=>{
 const {observedPdfItems}=await import('../src/services/report/pdfGlyphGeometry.js');
 for(const change of [g=>g.color='#666666',g=>g.font='OTHER',g=>g.size=11,g=>{g.x+=.01;g.bbox[0]+=.01;},g=>g.trackingSource.tjAdjustment=1,g=>g.paintOrder=1]){
  const a=glyph('가',60,1),b=glyph('가',60,2);change(b);const r=observedPdfItems([item('가')],[a,b],{});assert.equal(r.evidence.matchedRows,0);assert.equal(r.evidence.identicalOverprints.length,0);assert.equal(r.items[0].text,'가');
 }
 const missing=observedPdfItems([item('가나다')],[glyph('가',60,1),glyph('나',70,1),glyph('가',60,2),glyph('나',70,2)],{});assert.equal(missing.evidence.matchedRows,0);assert.equal(missing.evidence.identicalOverprints.length,0);
 const unknown=[glyph('가',60,1),glyph('가',60,2)];unknown.forEach(g=>delete g.color);assert.equal(observedPdfItems([item('가')],unknown,{}).evidence.matchedRows,0);
});
test('source text which actually includes repeated coincident characters is not deduplicated',async()=>{
 const {observedPdfItems}=await import('../src/services/report/pdfGlyphGeometry.js'),r=observedPdfItems([item('가가')],[glyph('가',60,1),glyph('가',60,2)],{});assert.equal(r.evidence.matchedRows,1);assert.equal(r.items.length,2);assert.equal(r.evidence.identicalOverprints.length,0);
});
