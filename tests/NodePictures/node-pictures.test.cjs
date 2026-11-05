const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const {PDFDocument,degrees}=require('pdf-lib');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=resolve(__dirname,'../..');
const moduleUrl=pathToFileURL(resolve(root,'src/Jindan.Report.Worker/node-pictures.mjs')).href;
const analysisUrl=pathToFileURL(resolve(root,'src/Jindan.Report.Worker/engine/src/services/report/pdfAnalysis.js')).href;
async function fixture({rotation=0,second=false}={}){
 const c=createCanvas(16,12),ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,8,12);ctx.fillStyle='#0000ff';ctx.fillRect(8,0,8,12);
 const pdf=await PDFDocument.create(),page=pdf.addPage([400,400]),img=await pdf.embedPng(c.toBuffer('image/png'));page.drawImage(img,{x:60,y:120,width:160,height:120,rotate:degrees(rotation)});if(second)page.drawImage(img,{x:240,y:60,width:80,height:60});
 const bytes=await pdf.save();const {analyzePdfReport}=await import(analysisUrl);const analysis=await analyzePdfReport(bytes,'synthetic-pictures.pdf','project:node-pictures');return {bytes,analysis};
}
test('extracts original image object with pixel content, dimensions, immutable input and SHA/operator binding',async()=>{
 const {extractNodePdfPictures}=await import(moduleUrl),{bytes,analysis}=await fixture(),before=Buffer.from(bytes),snapshot=JSON.stringify(analysis);
 const out=await extractNodePdfPictures(bytes,analysis,[1]);assert.equal(Object.keys(out).length,1);const p=out['pdf:p1:image0'];assert.equal(p.method,'pdf-image-object');assert.equal(p.originalWidth,16);assert.equal(p.originalHeight,12);assert.equal(p.width,16);assert.equal(p.height,12);assert.equal(p.sourceSha256,analysis.source.sha256);assert.equal(p.sha256,createHash('sha256').update(p.bytes).digest('hex'));assert.deepEqual(p.bbox,analysis.pages[0].images[0].bbox);
 const decoded=await loadImage(p.bytes),c=createCanvas(16,12);c.getContext('2d').drawImage(decoded,0,0);const rgba=c.getContext('2d').getImageData(0,0,16,12).data;assert.deepEqual([...rgba.slice(0,4)],[255,0,0,255]);assert.deepEqual([...rgba.slice(60,64)],[0,0,255,255]);assert.deepEqual(Buffer.from(bytes),before);assert.equal(JSON.stringify(analysis),snapshot);
});
test('rotated original transform keeps both painted colors and bounded output',async()=>{
 const {extractNodePdfPictures}=await import(moduleUrl),{bytes,analysis}=await fixture({rotation:90});const p=(await extractNodePdfPictures(bytes,analysis,[1]))['pdf:p1:image0'];assert.equal(p.width,12);assert.equal(p.height,16);const image=await loadImage(p.bytes),c=createCanvas(p.width,p.height);c.getContext('2d').drawImage(image,0,0);const d=c.getContext('2d').getImageData(0,0,p.width,p.height).data;assert.ok([...d].filter((v,i)=>i%4===0&&v===255).length>20);assert.ok([...d].filter((v,i)=>i%4===2&&v===255).length>20);
});
test('rejects source SHA, page/operator/bbox/transform/list mismatches',async()=>{
 const {extractNodePdfPictures}=await import(moduleUrl),{bytes,analysis}=await fixture();
 for(const change of [a=>a.source.sha256='0'.repeat(64),a=>a.pages[0].images[0].operator++,a=>a.pages[0].images[0].bbox[0]+=.01,a=>a.pages[0].images[0].transform[4]+=.01,a=>a.pages[0].images=[],a=>a.pages[0].widthPt++,a=>delete a.pages[0].widthPt]){const a=structuredClone(analysis);change(a);await assert.rejects(extractNodePdfPictures(bytes,a,[1]),e=>e.code==='BINDING_MISMATCH');}
 await assert.rejects(extractNodePdfPictures(bytes,analysis,[1,1]),e=>e.code==='INVALID_INPUT');
});
test('cancel before and during progress returns no successful or partial result',async()=>{
 const {extractNodePdfPictures}=await import(moduleUrl),{bytes,analysis}=await fixture();const c=new AbortController();c.abort();await assert.rejects(extractNodePdfPictures(bytes,analysis,[1],{signal:c.signal}),e=>e.code==='CANCELLED');const d=new AbortController();await assert.rejects(extractNodePdfPictures(bytes,analysis,[1],{signal:d.signal,onProgress:()=>d.abort()}),e=>e.code==='CANCELLED');
});
test('strict pixel, PNG and aggregate budgets reject without partial output',async()=>{
 const {extractNodePdfPictures}=await import(moduleUrl),{bytes,analysis}=await fixture({second:true});
 for(const options of [{maxImagePixels:1},{maxPngBytes:1},{maxTotalBytes:1}])await assert.rejects(extractNodePdfPictures(bytes,analysis,[1],options),e=>e.code==='PICTURE_LIMIT');
 await assert.rejects(extractNodePdfPictures(bytes,analysis,[1],{maxImagePixels:16000001}),e=>e.code==='INVALID_INPUT');
});

test('real PDF image-mask is explicitly unsupported even when analysis image list is empty',async()=>{
 const {pushGraphicsState,popGraphicsState,concatTransformationMatrix,drawObject}=require('pdf-lib');const pdf=await PDFDocument.create(),page=pdf.addPage([400,400]);
 const stream=pdf.context.flateStream(new Uint8Array([255]),{Type:'XObject',Subtype:'Image',Width:8,Height:1,ImageMask:true,BitsPerComponent:1});const name=page.node.newXObject('Mask',pdf.context.register(stream));page.pushOperators(pushGraphicsState(),concatTransformationMatrix(160,0,0,120,60,120),drawObject(name),popGraphicsState());
 const bytes=await pdf.save(),{analyzePdfReport}=await import(analysisUrl),analysis=await analyzePdfReport(bytes,'synthetic-mask.pdf','project:node-pictures');assert.equal(analysis.pages[0].images.length,0);
 const {extractNodePdfPictures}=await import(moduleUrl);await assert.rejects(extractNodePdfPictures(bytes,analysis,[1]),e=>e.code==='UNSUPPORTED_PDF_IMAGE');
});
