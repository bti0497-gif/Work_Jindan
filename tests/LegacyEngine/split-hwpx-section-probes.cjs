// Content-preserving section-set diagnostics. Never launches Hancom or overwrites its input.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {strToU8,strFromU8}=require('fflate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),local=n=>n.name.split(':').at(-1);
const sectionPath=p=>/^Contents\/section\d+\.xml$/.test(p||'');
const attr=(xml,key,value)=>{const re=new RegExp(`\\b${key}="[^"]*"`);assert.match(xml,re);return xml.replace(re,`${key}="${value}"`);};
function replaceNodes(xml,nodes,replacement){
    assert.ok(nodes.length);const sorted=[...nodes].sort((a,b)=>a.start-b.start),first=sorted[0];
    for(const n of sorted.reverse())xml=xml.slice(0,n.start)+(n===first?replacement:'')+xml.slice(n.end);
    return xml;
}
async function splitGeneratedSectionProbe(input,ordinals){
    const {readHwpxPackage,packHwpxPackage,indexHwpxSection}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js'),{validateGeneratedHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/generatedHwpxValidation.js'),{analyzeReport}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/sourceParser.js');
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input),source=readHwpxPackage(bytes),hpf=strFromU8(source['Contents/content.hpf']),index=indexHwpxSection(hpf,'Contents/content.hpf'),items=index.nodes.filter(n=>local(n)==='item'),itemMap=new Map(items.map(n=>[n.attrs.id,n])),spine=index.nodes.filter(n=>local(n)==='itemref'),sections=spine.map(n=>itemMap.get(n.attrs.idref)).filter(n=>sectionPath(n?.attrs.href));
    const allParts=Object.keys(source).filter(sectionPath);assert.equal(sections.length,allParts.length,'All section parts must be declared in spine');assert.equal(new Set(sections.map(n=>n.attrs.href)).size,sections.length,'Section spine must be unique');
    if(!Array.isArray(ordinals)||!ordinals.length||ordinals.some((n,i)=>!Number.isInteger(n)||n<1||n>sections.length||i>0&&n<=ordinals[i-1]))throw Error('Select unique section ordinals in ascending spine order.');
    const selected=ordinals.map(n=>sections[n-1]),entries={...source},mapping=selected.map((n,i)=>({originalOrdinal:ordinals[i],originalPart:n.attrs.href,originalManifestId:n.attrs.id,targetPart:`Contents/section${i}.xml`,targetManifestId:`section${i}`,sectionXmlSha256:sha(source[n.attrs.href])}));
    for(const p of allParts)delete entries[p];for(const m of mapping)entries[m.targetPart]=source[m.originalPart];
    const originalHeader=strFromU8(source['Contents/header.xml']);assert.equal(Number(indexHwpxSection(originalHeader,'Contents/header.xml').nodes.find(n=>local(n)==='head').attrs.secCnt),sections.length);entries['Contents/header.xml']=strToU8(attr(originalHeader,'secCnt',String(mapping.length)));
    const sectionItems=items.filter(n=>sectionPath(n.attrs.href)),sectionIds=new Set(sectionItems.map(n=>n.attrs.id)),sectionRefs=spine.filter(n=>sectionIds.has(n.attrs.idref));
    let rewritten=replaceNodes(hpf,sectionItems,mapping.map(m=>{const node=itemMap.get(m.originalManifestId);return attr(attr(hpf.slice(node.start,node.end),'id',m.targetManifestId),'href',m.targetPart);}).join(''));
    // Reindex after the manifest edit before replacing spine byte ranges.
    const rewrittenIndex=indexHwpxSection(rewritten,'Contents/content.hpf'),newRefs=rewrittenIndex.nodes.filter(n=>local(n)==='itemref'&&sectionIds.has(n.attrs.idref));
    rewritten=replaceNodes(rewritten,newRefs,mapping.map(m=>{const node=sectionRefs.find(n=>n.attrs.idref===m.originalManifestId);return attr(hpf.slice(node.start,node.end),'idref',m.targetManifestId);}).join(''));entries['Contents/content.hpf']=strToU8(rewritten);
    const sourceHash=sha(bytes),metadata=source['Contents/jindan-source.json']?JSON.parse(strFromU8(source['Contents/jindan-source.json'])):null,selectedPageNumbers=new Set();
    if(metadata){
        const byPart=new Map((metadata.sections||[]).map(s=>[s.section,s]));for(const m of mapping){const original=byPart.get(m.originalPart);assert.ok(original,'Each selected section must retain its source-page mapping');m.sourcePage=original.sourcePage;selectedPageNumbers.add(original.sourcePage);}
        const pageFilter=rows=>(rows||[]).filter(r=>selectedPageNumbers.has(typeof r==='number'?r:r.number??r.sourcePage??r.page));
        const scoped={...metadata,sections:mapping.map(m=>({...byPart.get(m.originalPart),section:m.targetPart})),sourcePages:pageFilter(metadata.sourcePages),positionedPages:pageFilter(metadata.positionedPages),mapping:pageFilter(metadata.mapping),editedLocations:pageFilter(metadata.editedLocations),furniture:pageFilter(metadata.furniture),assets:pageFilter(metadata.assets),pageDecorations:pageFilter(metadata.pageDecorations),diagnosticSubset:{sourceSha256:sourceHash,originalSectionOrdinals:ordinals,retainedAllGlobalDefinitions:true,retainedAllBinaryAssets:true,reportReady:false}};
        if(metadata.chapterScope)scoped.chapterScope={...metadata.chapterScope,sourcePages:[...selectedPageNumbers]};
        if(metadata.reviewedReferenceText)scoped.reviewedReferenceText={...metadata.reviewedReferenceText,items:pageFilter(metadata.reviewedReferenceText.items)};
        entries['Contents/jindan-source.json']=strToU8(JSON.stringify(scoped));
    }
    const diagnostic={schema:'jindan-section-set-native-probe/1',sourceSha256:sourceHash,originalSectionCount:sections.length,selectedOriginalOrdinals:ordinals,mapping,allGlobalDefinitionsPreservedExceptSectionCount:true,allBinaryAssetsRetained:true,sectionXmlUnchanged:true,nativeOpen:'pending',reportReady:false};
    entries['Contents/jindan-native-open-probe.json']=strToU8(JSON.stringify(diagnostic));
    entries['Preview/PrvText.txt']=strToU8(`한글 열기 원인 분리용 · 원래 구역 ${ordinals.join(', ')} · 전체 보고서 재현 성공본이 아님`);
    // Keep any image preview references consistent, even though the current failing baseline has none.
    const {removeStaleImagePreview}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js');removeStaleImagePreview(entries);
    // Legacy failure probes must retain their original empty lists for the native A/B experiment.
    const validation=validateGeneratedHwpx(entries,{requireFurnitureParagraphs:false}),output=packHwpxPackage(entries),after=readHwpxPackage(output),document=await analyzeReport(output,'section-probe.hwpx');
    for(const m of mapping)assert.equal(sha(after[m.targetPart]),m.sectionXmlSha256,'Selected section XML must be byte-identical');
    assert.equal(strFromU8(after['Contents/header.xml']).replace(/\bsecCnt="\d+"/,'secCnt="SOURCE"'),originalHeader.replace(/\bsecCnt="\d+"/,'secCnt="SOURCE"'));
    const binaryAssets=Object.keys(source).filter(p=>p.startsWith('BinData/'));for(const p of binaryAssets)assert.equal(sha(source[p]),sha(after[p]));
    const changed=[...new Set([...Object.keys(source),...Object.keys(after)])].filter(p=>!source[p]||!after[p]||sha(source[p])!==sha(after[p]));
    return {bytes:output,proof:{...diagnostic,sha256:sha(output),bytes:output.length,selectedSourcePages:[...selectedPageNumbers],tables:document.tables.length,paragraphs:document.paragraphs.length,retainedBinaryAssets:binaryAssets.length,changedOrRemovedEntries:changed,removedEntries:Object.keys(source).filter(p=>!after[p]),addedEntries:Object.keys(after).filter(p=>!source[p]),structuralValidation:validation}};
}
async function main(){
    const args=process.argv.slice(2),at=k=>args[args.indexOf(k)+1];for(const key of ['--source','--output','--ranges'])if(!args.includes(key))throw Error('Use --source generated.hwpx --output NEW-folder --ranges 1-10,11-20');
    const input=path.resolve(at('--source')),out=path.resolve(at('--output'));if(input.startsWith(out+path.sep)||path.dirname(input)===out)throw Error('Use a separate new output folder.');
    const bytes=await fs.readFile(input),sourceSha256=sha(bytes),ranges=at('--ranges').split(',').map(value=>{const match=value.match(/^(\d+)-(\d+)$/);if(!match||Number(match[2])<Number(match[1]))throw Error('Ranges must be ascending 1-based start-end.');return {start:Number(match[1]),end:Number(match[2])};});
    if(args.includes('--expected-sha')&&sourceSha256!==at('--expected-sha'))throw Error('Diagnostic source SHA differs from the reviewed failed candidate.');
    await fs.mkdir(out,{recursive:true});const cases=[];
    for(const range of ranges){const ordinals=Array.from({length:range.end-range.start+1},(_,i)=>range.start+i),result=await splitGeneratedSectionProbe(bytes,ordinals),file=path.join(out,`sections-${String(range.start).padStart(2,'0')}-${String(range.end).padStart(2,'0')}.hwpx`);await fs.writeFile(file,result.bytes,{flag:'wx'});cases.push({...result.proof,path:file});}
    assert.equal(sha(await fs.readFile(input)),sourceSha256);const record={schema:'jindan-section-set-bisection/1',createdAt:new Date().toISOString(),source:{path:input,sha256:sourceSha256},policy:'Selected section XML unchanged; shared definitions and every original binary retained to isolate section composition. Only package section list/count, scoped provenance and diagnostic previews change.',causeConfirmed:false,nativeOpen:'pending',reportReady:false,cases};await fs.writeFile(path.join(out,'BISECTION.json'),JSON.stringify(record,null,2),{flag:'wx'});console.log(JSON.stringify(record));
}
module.exports={splitGeneratedSectionProbe};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
