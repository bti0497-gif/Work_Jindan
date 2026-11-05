const {test}=require('node:test'),assert=require('node:assert/strict');
const {strFromU8,unzipSync}=require('fflate'),{splitGeneratedSectionProbe}=require('./split-hwpx-section-probes.cjs');
async function fixture(){
    const {writePdfHwpx,pdfAuthoringPlan}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
    const pages=Array.from({length:3},(_,i)=>({number:i+1,widthPt:595,heightPt:842,kind:'body',lines:[{text:`원래 구역 ${i+1} 본문`,bbox:[70,110,400,125],baseline:122,size:12,fonts:['굴림']}],tables:[],images:[{id:`image-${i}`,kind:'figure',operator:20,bbox:[70,180,100,210]}]})),pdf={schema:'jindan-pdf-analysis/1',projectId:'project:bisect',source:{sha256:'a'.repeat(64)},pages},pictures=Object.fromEntries(pages.map((p,i)=>[`image-${i}`,{bytes:png,width:1,height:1}]));
    return writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1,2,3]},pdf.projectId,'reference'),{pictures}).bytes;
}
test('section split rebinds spine/manifest to consecutive names while preserving selected XML, global definitions and every asset',async()=>{
    const bytes=await fixture(),before=unzipSync(bytes),copy=bytes.slice(),result=await splitGeneratedSectionProbe(bytes,[2,3]),after=unzipSync(result.bytes),manifest=strFromU8(after['Contents/content.hpf']);
    assert.deepEqual(bytes,copy);assert.deepEqual(after['Contents/section0.xml'],before['Contents/section1.xml']);assert.deepEqual(after['Contents/section1.xml'],before['Contents/section2.xml']);assert.equal(after['Contents/section2.xml'],undefined);
    assert.equal(strFromU8(after['Contents/header.xml']).replace('secCnt="2"','secCnt="SOURCE"'),strFromU8(before['Contents/header.xml']).replace('secCnt="3"','secCnt="SOURCE"'));
    for(const p of Object.keys(before).filter(p=>p.startsWith('BinData/')))assert.deepEqual(after[p],before[p]);
    assert.match(manifest,/<opf:item id="section0" href="Contents\/section0.xml"/);assert.doesNotMatch(manifest,/section2/);assert.match(manifest,/<opf:itemref idref="section0" linear="yes"\/><opf:itemref idref="section1" linear="yes"\/>/);
    const provenance=JSON.parse(strFromU8(after['Contents/jindan-source.json']));assert.deepEqual(provenance.sourcePages.map(p=>p.number),[2,3]);assert.deepEqual(provenance.sections.map(s=>[s.section,s.sourcePage]),[['Contents/section0.xml',2],['Contents/section1.xml',3]]);assert.equal(provenance.assets.length,2);assert.equal(result.proof.retainedBinaryAssets,3);assert.equal(result.proof.nativeOpen,'pending');assert.equal(result.proof.reportReady,false);
});
test('nonconsecutive spine selection preserves its original page identities without renumbering the content',async()=>{
    const bytes=await fixture(),result=await splitGeneratedSectionProbe(bytes,[1,3]),after=unzipSync(result.bytes),before=unzipSync(bytes);assert.deepEqual(after['Contents/section1.xml'],before['Contents/section2.xml']);assert.deepEqual(result.proof.selectedSourcePages,[1,3]);assert.deepEqual(result.proof.mapping.map(m=>m.originalOrdinal),[1,3]);
});
test('bisection rejects empty, duplicate, reversed and outside section ranges',async()=>{
    const bytes=await fixture();for(const ordinals of [[],[0],[4],[1,1],[3,2],[1.5]])await assert.rejects(splitGeneratedSectionProbe(bytes,ordinals),/Select unique/);
});
