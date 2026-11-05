const {test}=require('node:test'),assert=require('node:assert/strict');
const sha='a'.repeat(64),metric={codePoint:32,advanceUnits:350,unitsPerEm:1000,method:'original-sfnt-space-cmap-hmtx'};
const glyph=(text,x,operator,spacing=0)=>({text,x,baseline:100,size:10,widthPercent:100,font:'original',fontInfo:{embeddedStreamSha256:sha,spaceAdvance:metric},bbox:[x,90,x+10,101.5],trackingSource:{operator,glyphIndex:0,character:text,fontSize:10,charSpace:0,tjAdjustment:-spacing*10,exactPercent:spacing,spacingPercent:spacing,supported:true},spacingPercent:spacing});
test('independently positioned next operator uses its observed origin instead of a stale terminal TJ',async()=>{
 const {reconcilePdfWhitespace,sourceTrackingPercent}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfWhitespaceTracking.js'),{pdfRunTypography}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfCellLayout.js');
 const items=[glyph('즈',100,1,28),glyph('(',109.4,2)],before=structuredClone(items),out=reconcilePdfWhitespace(items);
 assert.deepEqual(items,before);assert.equal(out[0].spacingPercent,-6);assert.equal(out[0].trackingSource.exactPercent,28);assert.ok(Math.abs(sourceTrackingPercent(out[0].trackingSource)+6)<1e-8);
 const r={text:'즈',bbox:out[0].bbox,style:{font:'original',size:10,spacingPercent:-6,fontInfo:out[0].fontInfo},trackingSources:[out[0].trackingSource]};assert.equal(pdfRunTypography(r).typography.spacingPercent,-6);
 const bad=structuredClone(r);bad.trackingSources[0].positionedBoundary.followingOperator=1;assert.throws(()=>pdfRunTypography(bad),/독립/);
 const wrongFont=structuredClone(r);wrongFont.style.fontInfo.embeddedStreamSha256='b'.repeat(64);assert.throws(()=>pdfRunTypography(wrongFont),/글꼴/);
});
test('an independent origin word gap still consumes a measured editable space only once',async()=>{
 const {reconcilePdfWhitespace,sourceTrackingPercent}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfWhitespaceTracking.js');
 const a=[glyph('가',100,1,0),glyph('나',114.4,2)],out=reconcilePdfWhitespace(a),e=out[0].trackingSource;
 assert.equal(out[0].spacingPercent,9);assert.ok(e.positionedBoundary);assert.ok(e.reconstructedWhitespace);assert.ok(out[1].inferredSpaceSource);assert.ok(Math.abs(sourceTrackingPercent(e)-9)<1e-8);assert.equal(e.exactPercent,0);
});
test('incomplete, mixed, rotated, long-gap and same-operator evidence never becomes a coordinate override',async()=>{
 const {reconcilePdfWhitespace}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfWhitespaceTracking.js');
 for(const mutate of [a=>a[1].trackingSource.operator=1,a=>delete a[0].fontInfo,a=>a[1].fontInfo.embeddedStreamSha256='b'.repeat(64),a=>a[1].font='other',a=>a[1].size=11,a=>a[1].widthPercent=90,a=>a[1].baseline=101,a=>a[1].bbox[1]=91,a=>{a[1].x=150;a[1].bbox=[150,90,160,101.5]},a=>a[0].text='두글',a=>a[0].trackingSource.supported=false]){
  const a=[glyph('가',100,1,28),glyph('나',109.4,2)];mutate(a);assert.ok(!reconcilePdfWhitespace(a)[0].trackingSource.positionedBoundary);
 }
});
