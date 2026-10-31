const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFileSync, spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const script = name => path.join(root, 'skills/technical-report-hwpx/scripts', name);
async function setup(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jindan-report-skill-'));
    t.after(async()=>{
        const target = path.resolve(directory);
        assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('jindan-report-skill-'));
        await fs.rm(target, {recursive:true,force:true});
    });
    const {zipSync,strToU8}=await import('fflate');
    const p=text=>`<hp:p styleIDRef="1" paraPrIDRef="0"><hp:run charPrIDRef="1"><hp:t>${text}</hp:t></hp:run></hp:p>`;
    const cell=(row,column,text)=>`<hp:tc><hp:subList>${p(text)}</hp:subList><hp:cellAddr rowAddr="${row}" colAddr="${column}"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>`;
    const section='<hs:sec xmlns:hs="sec" xmlns:hp="p">'+p('제1장 진단의 개요')+p('이전 시설명')+p('유지할 내용')+'<hp:p><hp:run><hp:tbl rowCnt="2" colCnt="2"><hp:tr>'+cell(0,0,'항목')+cell(0,1,'판정')+'</hp:tr><hp:tr>'+cell(1,0,'기존 목록')+cell(1,1,'이전 판정')+'</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>';
    const bytes=zipSync({mimetype:strToU8('application/hwp+zip'),'Contents/section0.xml':strToU8(section),'Contents/header.xml':strToU8('<head><styles><style id="1" name="본문"/></styles></head>'),'BinData/image1.png':new Uint8Array([1,2,3,4]),'Preview/PrvText.txt':strToU8('old preview')});
    const source=path.join(directory,'원본.hwpx');await fs.writeFile(source,bytes);
    const {analyzeReport}=await import('../src/services/report/sourceParser.js');
    const document=await analyzeReport(bytes,'원본.hwpx');
    return {directory,source,bytes,document,analyzeReport};
}
const run = (name,args) => execFileSync(process.execPath,[script(name),'--repo',root,...args],{cwd:root,encoding:'utf8',windowsHide:true});

test('skill analyzer discovers paired files and exposes source-bound editable positions without claiming reproduction',async t=>{
    const {directory,source}=await setup(t), folder=path.join(directory,'프로젝트 폴더'), output=path.join(directory,'analysis.json');
    await fs.mkdir(folder);await fs.copyFile(source,path.join(folder,'제1장.hwpx'));await fs.writeFile(path.join(folder,'제1장.pdf'),'%PDF-1.4\nfixture');
    const summary=JSON.parse(run('analyze-project.mjs',['--input',folder,'--output',output,'--slots','--skip-pdf']));
    const analysis=JSON.parse(await fs.readFile(output,'utf8'));
    assert.equal(summary.paired,1);assert.equal(summary.tables,1);assert.equal(analysis.status,'extracted');
    const original=analysis.files.find(file=>file.format==='hwpx');
    assert.equal(original.profile.source.sha256,original.sha256);assert.ok(original.editableSlots.some(slot=>slot.expectedText==='이전 시설명'));
    assert.equal(analysis.files.find(file=>file.format==='pdf').pdfInventory.status,'not-inspected');assert.equal(analysis.verification.independentReconstruction,'pending');
});

test('candidate writer changes the selected editable location while preserving source, table labels and binary/style parts',async t=>{
    const {directory,source,bytes,document,analyzeReport}=await setup(t), edits=path.join(directory,'edits.json'), output=path.join(directory,'candidate.hwpx');
    const slot=document.paragraphs.flatMap(p=>p.textSlots).find(slot=>slot.text==='이전 시설명');
    await fs.writeFile(edits,JSON.stringify({sourceSha256:document.source.sha256,replacements:[{slotId:slot.id,expectedText:slot.text,value:'이번 시설명 & 새 내용'}]}));
    const result=JSON.parse(run('write-candidate.mjs',['--source',source,'--edits',edits,'--output',output]));
    assert.equal(result.layoutVerification,'pending');assert.equal(result.replacedSlots,1);
    assert.deepEqual(new Uint8Array(await fs.readFile(source)),bytes);
    const candidateBytes=new Uint8Array(await fs.readFile(output)), candidate=await analyzeReport(candidateBytes,'candidate.hwpx');
    assert.ok(candidate.paragraphs.some(p=>p.text==='이번 시설명 & 새 내용'));
    assert.equal(candidate.tables[0].cells.find(c=>c.row===1&&c.column===0).text,'기존 목록');
    const {unzipSync}=await import('fflate'), before=unzipSync(bytes), after=unzipSync(candidateBytes);
    assert.deepEqual(after['BinData/image1.png'],before['BinData/image1.png']);assert.deepEqual(after['Contents/header.xml'],before['Contents/header.xml']);
    const review=JSON.parse(await fs.readFile(output+'.review.json','utf8'));assert.equal(review.independentPageReconstruction,'not-performed');
    const invalid=path.join(directory,'invalid.hwpx');
    await fs.writeFile(edits,JSON.stringify({sourceSha256:document.source.sha256,replacements:[{slotId:slot.id,expectedText:'wrong version text',value:'x'}]}));
    assert.notEqual(spawnSync(process.execPath,[script('write-candidate.mjs'),'--repo',root,'--source',source,'--edits',edits,'--output',invalid],{encoding:'utf8',windowsHide:true}).status,0);
    await assert.rejects(fs.access(invalid));
    assert.notEqual(spawnSync(process.execPath,[script('write-candidate.mjs'),'--repo',root,'--source',source,'--edits',edits,'--output',source],{encoding:'utf8',windowsHide:true}).status,0);
    assert.deepEqual(new Uint8Array(await fs.readFile(source)),bytes);
});

test('unseen chapter order, style IDs and A3 geometry are read from the new report rather than copied from the baseline',async t=>{
    const {directory}=await setup(t), source=path.join(directory,'다른 진단.hwpx'), output=path.join(directory,'different-analysis.json');
    const {zipSync,strToU8}=await import('fflate');
    const p=text=>`<hp:p styleIDRef="81" paraPrIDRef="42"><hp:run charPrIDRef="99"><hp:t>${text}</hp:t></hp:run></hp:p>`;
    const section='<hs:sec xmlns:hs="sec" xmlns:hp="p"><hp:secPr><hp:pagePr width="84188" height="119056"><hp:margin left="5669" right="5669"/></hp:pagePr></hp:secPr>'+p('제2장 기계설비 진단')+p('제7장 전기설비 진단')+'</hs:sec>';
    const header='<head><fontfaces><fontface lang="HANGUL"><font id="17" face="검증용 다른 서체"/></fontface></fontfaces><charProperties><charPr id="99" height="1400"><fontRef hangul="17"/></charPr></charProperties><styles><style id="81" name="새 양식"/></styles></head>';
    await fs.writeFile(source,zipSync({mimetype:strToU8('application/hwp+zip'),'Contents/header.xml':strToU8(header),'Contents/section0.xml':strToU8(section)}));
    run('analyze-project.mjs',['--input',source,'--output',output]);
    const result=JSON.parse(await fs.readFile(output,'utf8'));
    assert.deepEqual(result.summary.chapters.map(ch=>[ch.number,ch.discipline]),[[2,'mechanical'],[7,'electrical']]);
    assert.equal(result.summary.layouts[0].widthMm,297);assert.equal(result.summary.layouts[0].heightMm,420);
    assert.equal(result.summary.typography[0].font,'검증용 다른 서체');assert.equal(result.summary.typography[0].sizePt,14);
});

test('PDF tools find true empty pages and visualize differences without certifying copied or unverified candidates',async t=>{
    const {directory,source}=await setup(t), reference=path.join(directory,'reference.pdf'), candidate=path.join(directory,'candidate.pdf');
    const create="import fitz,sys\na=fitz.open();p=a.new_page();p.insert_text((72,100),'Reference facility');a.new_page();a.save(sys.argv[1]);b=fitz.open();p=b.new_page();p.insert_text((72,100),'New facility');b.new_page();b.save(sys.argv[2])";
    execFileSync('python',['-c',create,reference,candidate],{windowsHide:true});
    const inventory=JSON.parse(execFileSync('python',[script('inspect-pdf.py'),'--input',reference],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}}));
    assert.equal(inventory.pageCount,2);assert.deepEqual(inventory.emptyContentPages,[2]);
    const output=path.join(directory,'comparison');
    execFileSync('python',[script('compare-pages.py'),'--reference',reference,'--candidate',candidate,'--candidate-source',source,'--output',output,'--dpi','72'],{windowsHide:true});
    const result=JSON.parse(await fs.readFile(path.join(output,'comparison.json'),'utf8'));
    assert.equal(result.sameExtractedText,false);assert.ok(result.changedPixelFractionThreshold12>0);assert.equal(result.verified,false);assert.equal(result.independentCandidateBytes,true);
    assert.ok(result.candidateSource.paragraphElements>0);
    const retained=path.join(root,'.firebase/report-skill-check');await fs.mkdir(retained,{recursive:true});await fs.copyFile(path.join(output,'comparison.png'),path.join(retained,'comparison.png'));
    const same=path.join(directory,'same');
    execFileSync('python',[script('compare-pages.py'),'--reference',reference,'--candidate',reference,'--output',same,'--dpi','72'],{windowsHide:true});
    const self=JSON.parse(await fs.readFile(path.join(same,'comparison.json'),'utf8'));
    assert.equal(self.independentCandidateBytes,false);assert.equal(self.verified,false);assert.equal(self.changedPixelFractionThreshold12,0);
});
