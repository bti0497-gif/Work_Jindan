const {test,before}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let HwpDocument,writePdfHwpx;
before(async()=>{const core=await import('@rhwp/core');HwpDocument=core.HwpDocument;globalThis.measureTextWidth=(_font,text)=>text.length*8;await core.default({module_or_path:fs.readFileSync(require.resolve('@rhwp/core/rhwp_bg.wasm'))});({writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'));});
const plan=blocks=>({schema:'jindan-pdf-authoring/1',projectId:'project:preview',source:{sha256:'a'.repeat(64)},mode:'reference',blocks,mapping:[],warnings:[]});
const text=svg=>[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1]).join('').replace(/\s+/g,'');
test('native renderer reads actual HWPX pages and styles without an original PDF',()=>{
    const bytes=writePdfHwpx(plan([{kind:'paragraph',text:'ACTUAL HWPX FIRST PAGE'},{kind:'paragraph',text:'SECOND PAGE CONTENT',pageBreak:true}])),doc=new HwpDocument(bytes.bytes);
    try{assert.equal(doc.pageCount(),2);assert.ok(text(doc.renderPageSvg(0)).includes('ACTUALHWPXFIRSTPAGE'));assert.ok(!text(doc.renderPageSvg(0)).includes('SECONDPAGE'));assert.ok(text(doc.renderPageSvg(1)).includes('SECONDPAGECONTENT'));const size=JSON.parse(doc.getPageInfo(0));assert.ok(size.width>700&&size.height>1000);}finally{doc.free();}
});
test('changing the native file changes the independent preview and preserves explicit blank pages',()=>{
    const blocks=[{kind:'paragraph',text:'NATIVE VERSION ONE'},{kind:'paragraph',text:'',pageBreak:true,blankPage:true}],first=new HwpDocument(writePdfHwpx(plan(blocks),{spec:{fontSizePt:10}}).bytes),second=new HwpDocument(writePdfHwpx(plan([{...blocks[0],text:'NATIVE VERSION TWO'},blocks[1]]),{spec:{fontSizePt:15}}).bytes);
    try{assert.equal(first.pageCount(),2);assert.equal(second.pageCount(),2);assert.ok(text(second.renderPageSvg(0)).includes('NATIVEVERSIONTWO'));assert.ok(!text(second.renderPageSvg(0)).includes('VERSIONONE'));assert.notEqual(first.renderPageSvg(0),second.renderPageSvg(0));assert.ok(second.renderPageSvg(0).includes('font-size="20"'));assert.ok(!text(second.renderPageSvg(1)).includes('NATIVEVERSION'));}finally{first.free();second.free();}
});

test('preview intrinsic pixels follow display width and density without changing native vector text or layout',async()=>{
    const {nativeSvgAtDisplaySize}=await import('../src/services/report/nativePreview.js');
    const svg='<svg width="800" height="1200" viewBox="0 0 800 1200"><text x="25" y="40">Editable native text</text><image href="data:image/png;base64,AA=="/></svg>';
    const enlarged=nativeSvgAtDisplaySize(svg,1100,2);assert.ok(enlarged.includes('width="2200" height="3300"'));assert.ok(enlarged.includes('viewBox="0 0 800 1200"'));assert.equal(enlarged.slice(enlarged.indexOf('><text')),svg.slice(svg.indexOf('><text')));
    assert.ok(nativeSvgAtDisplaySize(svg,500,1.25).includes('width="625"'));assert.equal(nativeSvgAtDisplaySize(svg,0,2),svg);assert.equal(nativeSvgAtDisplaySize(svg,NaN,2),svg);
});

test('chapter divider native text follows source positions and keeps the unnumbered first page',async()=>{
    const {pdfAuthoringPlan}=await import('../src/services/report/pdfHwpxWriter.js'),{unzipSync,strFromU8}=await import('fflate');
    const pdf={schema:'jindan-pdf-analysis/1',projectId:'project:preview',source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'divider',images:[],tables:[],lines:[{text:'CHAPTER',size:24,baseline:200,bbox:[120,176,400,204],fonts:['Arial']},{text:'SECTION',size:18,baseline:300,bbox:[170,282,400,303],fonts:['Arial']}]}]};
    const output=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},pdf.projectId,'reference')),doc=new HwpDocument(output.bytes);
    try{const svg=doc.renderPageSvg(0),first=svg.match(/<text x="([\d.]+)" y="([\d.]+)"/);assert.ok(Math.abs(Number(first[1])*.75-120)<1);assert.ok(Math.abs(Number(first[2])*.75-200)<2);assert.equal(doc.pageCount(),1);assert.ok(!strFromU8(unzipSync(output.bytes)['Contents/section0.xml']).includes('<hp:pageNum '));}finally{doc.free();}
});
