const {test} = require('node:test');
const assert = require('node:assert/strict');
const fflate = import('fflate');
const api = import('../src/services/report/referenceAnalyzer.js');
async function fixture(headerOverride) {
    const {zipSync,strToU8}=await fflate;
    const p = text => `<hp:p styleIDRef="1" paraPrIDRef="2"><hp:run charPrIDRef="3"><hp:t>${text}</hp:t></hp:run></hp:p>`;
    const header = '<hh:head xmlns:hh="head"><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="3" height="1100"><hh:fontRef hangul="0"/><hh:bold/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="2"><hh:align horizontal="JUSTIFY"/><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr></hh:paraProperties><hh:styles><hh:style id="1" name="본문"/></hh:styles></hh:head>';
    const sec = '<hs:sec xmlns:hs="sec" xmlns:hp="p"><hp:secPr><hp:pagePr width="59528" height="84188"><hp:margin left="7086" right="7086" top="4252" bottom="4252" header="4252" footer="4252" gutter="0"/></hp:pagePr><hp:startNum pageStartsOn="BOTH" page="0"/></hp:secPr>'
        +p('제1장 기술진단의 개요')+p('1.1 진단 범위')+p('제2장 일반현황')+p('[표 2-1-1] 시설현황')+p('[표 2-1-1]은 이전 측정값이다.')+p('[표 2-1-1] 계 속')
        +'<hp:header applyPageType="ODD">'+p('기술진단 보고서')+'</hp:header><hp:footer applyPageType="BOTH">'+p('기관명')+'</hp:footer><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT"/></hs:sec>';
    return zipSync({mimetype:strToU8('application/hwp+zip'),'Contents/header.xml':strToU8(headerOverride??header),'Contents/section0.xml':strToU8(sec)});
}
test('extracts real fonts, paragraph styles, margins and furniture rather than counting unrelated attributes',async()=>{
    const {analyzeReferenceSource}=await api;
    const bytes=await fixture(), before=bytes.slice();
    const profile=await analyzeReferenceSource(bytes,'1,2장.hwpx');
    assert.equal(profile.typography[0].value.font,'바탕');assert.equal(profile.typography[0].value.sizePt,11);assert.equal(profile.typography[0].value.bold,true);
    assert.equal(profile.sections[0].widthMm,210);assert.equal(profile.sections[0].marginsMm.left,25);
    assert.equal(profile.headers.length,1);assert.equal(profile.headers[0].text,'기술진단 보고서');assert.equal(profile.footers[0].text,'기관명');
    assert.equal(profile.paragraphFormats[0].value.lineSpacing.value,'160');assert.equal(profile.pageNumbers[0].formatType,'DIGIT');
    assert.deepEqual(bytes,before);
});
test('recognizes multiple logical chapters in a single file and does not treat prose references as captions',async()=>{
    const {analyzeReferenceSource}=await api;
    const profile=await analyzeReferenceSource(await fixture(),'1,2장.hwpx');
    assert.deepEqual(profile.chapters.map(ch=>ch.number),[1,2]);
    assert.equal(profile.captions.length,2);assert.equal(profile.captions[1].continuation,true);
    assert.equal(profile.captions[0].pattern,'[표 N-N-N]');
});
test('contents references are not taught as actual body chapters and unsafe header definitions are rejected',async()=>{
    const {analyzeReferenceSource}=await api;
    const profile=await analyzeReferenceSource(await fixture(),'표지,제출문,목차.hwpx');
    assert.equal(profile.catalogOnly,true);assert.deepEqual(profile.chapters,[]);
    await assert.rejects(analyzeReferenceSource(await fixture('<!DOCTYPE head><head/>'),'bad.hwpx'),/서식 정의/);
});
test('chapter grouping uses content evidence for disciplines and retains split-file provenance',async()=>{
    const {summarizeReferenceProfiles}=await import('../src/services/report/referenceLearning.js');
    const base={counts:{paragraphs:1,tables:0,cells:0,pictures:0},sections:[],typography:[]};
    const summary=summarizeReferenceProfiles([{entryId:'a',relativePath:'공정.hwpx',profile:{...base,chapters:[{number:3,title:'제3장 공정 및 운영분야'}]}},{entryId:'b',relativePath:'3.4.hwpx',profile:{...base,chapters:[{number:3,title:'제3장'}]}},{entryId:'c',relativePath:'기계.hwpx',profile:{...base,chapters:[{number:5,title:'제5장 기계설비'}]}},{entryId:'d',relativePath:'전기.hwpx',profile:{...base,chapters:[{number:4,title:'제4장 전기설비'}]}}]);
    assert.deepEqual(summary.chapters[0].files,['a','b']);
    assert.equal(summary.chapters.find(ch=>ch.number===5).discipline,'mechanical');assert.equal(summary.chapters.find(ch=>ch.number===4).discipline,'electrical');
});
