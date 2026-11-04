// Hypothesis-only native-open probe. No production engine change and no Hancom launch.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {strFromU8,strToU8}=require('fflate'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function patchEmptyFurnitureLists(input,{expectedCount}={}){
    const {readHwpxPackage,packHwpxPackage,indexHwpxSection}=await import('../src/services/report/hwpxPackage.js'),{validateGeneratedHwpx}=await import('../src/services/report/generatedHwpxValidation.js'),bytes=input instanceof Uint8Array?input:new Uint8Array(input),source=readHwpxPackage(bytes),entries={...source},header=indexHwpxSection(strFromU8(source['Contents/header.xml']),'Contents/header.xml'),parts=Object.keys(source).filter(p=>/^Contents\/section\d+\.xml$/.test(p)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
    for(const name of ['hh:paraPr','hh:charPr','hh:style'])assert.ok(header.nodes.some(n=>n.name===name&&n.attrs.id==='0'),`Reference0 must exist: ${name}`);
    const indexed=parts.map(part=>{const xml=strFromU8(source[part]);return {part,xml,index:indexHwpxSection(xml,part)};}),allIds=indexed.flatMap(p=>p.index.nodes.map(n=>n.attrs.id).filter(v=>/^\d+$/.test(v||'')).map(Number));let nextId=Math.max(0,...allIds)+1;const changes=[];
    for(const {part,xml,index}of indexed){
        const children=new Map();for(const n of index.nodes){const list=children.get(n.parent)||[];list.push(n);children.set(n.parent,list);}
        const lists=index.nodes.filter(n=>n.name==='hp:subList'&&['hp:header','hp:footer'].includes(n.parent?.name)&&!(children.get(n)||[]).some(c=>c.name==='hp:p'));
        let edited=xml;const patches=[];
        for(const list of lists){
            assert.equal((children.get(list)||[]).length,0,'Do not modify a nonempty unsupported furniture list');
            const selfClosing=list.closeStart==null,original=xml.slice(list.start,list.end);if(!selfClosing)assert.equal(xml.slice(list.openEnd,list.closeStart).trim(),'','Do not replace significant text');
            assert.ok(nextId<4294967295,'Paragraph ID space exhausted');const paragraphId=String(nextId++),paragraph=`<hp:p id="${paragraphId}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>`,replacement=selfClosing?original.replace(/\/\s*>$/,`>${paragraph}</hp:subList>`):xml.slice(list.start,list.closeStart)+paragraph+xml.slice(list.closeStart,list.end);
            patches.push({begin:list.start,end:list.end,original,replacement});changes.push({part,control:list.parent.name.split(':').at(-1),controlId:list.parent.attrs.id,paragraphId,paragraphXml:paragraph,originalSubListXml:original,replacementSubListXml:replacement,originalParagraphCount:0,newParagraphCount:1,existingControlAttributes:{...list.parent.attrs},existingSubListAttributes:{...list.attrs}});
        }
        for(const patch of patches.sort((a,b)=>b.begin-a.begin))edited=edited.slice(0,patch.begin)+patch.replacement+edited.slice(patch.end);
        if(patches.length){let restored=edited;for(const patch of patches) {assert.equal(restored.split(patch.replacement).length,2,'New list must be unambiguous');restored=restored.replace(patch.replacement,patch.original);}assert.equal(restored,xml,'Only the exact four empty-list additions may differ');entries[part]=strToU8(edited);}
    }
    if(expectedCount!=null)assert.equal(changes.length,expectedCount,'Unexpected number of empty header/footer lists');
    const validation=validateGeneratedHwpx(entries),output=packHwpxPackage(entries),after=readHwpxPackage(output),changedEntries=Object.keys(source).filter(p=>sha(source[p])!==sha(after[p]));assert.deepEqual(Object.keys(after).sort(),Object.keys(source).sort());
    assert.deepEqual([...new Set(changes.map(c=>c.part))].sort(),[...changedEntries].sort());for(const p of Object.keys(source).filter(p=>!changedEntries.includes(p)))assert.equal(sha(source[p]),sha(after[p]));
    return {bytes:output,proof:{schema:'jindan-empty-furniture-probe/1',sourceSha256:sha(bytes),sha256:sha(output),bytes:output.length,changes,changedEntries,headerByteIdentical:true,allOtherEntriesByteIdentical:true,allBodyTablePictureContentUnchanged:true,emptyControlAndInheritanceBlockingPreserved:true,onlyAddedEmptyParagraphRunText:true,structuralValidation:validation,causeConfirmed:false,nativeOpen:'pending',reportReady:false}};
}
async function main(){
    const args=process.argv.slice(2),at=k=>args[args.indexOf(k)+1];for(const key of ['--source','--output','--expected-sha','--expected-count'])if(!args.includes(key))throw Error('Use --source baseline.hwpx --output NEW.hwpx --expected-sha sha256 --expected-count4');
    const input=path.resolve(at('--source')),output=path.resolve(at('--output'));assert.notEqual(input.toLowerCase(),output.toLowerCase());const bytes=await fs.readFile(input);assert.equal(sha(bytes),at('--expected-sha'),'Source differs from reviewed baseline');const result=await patchEmptyFurnitureLists(bytes,{expectedCount:Number(at('--expected-count'))});await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,result.bytes,{flag:'wx'});assert.equal(sha(await fs.readFile(input)),result.proof.sourceSha256);const proof={...result.proof,createdAt:new Date().toISOString(),sourcePath:input,path:output};await fs.writeFile(output+'.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({path:output,sha256:proof.sha256,changedEntries:proof.changedEntries,addedParagraphs:proof.changes.length}));
}
module.exports={patchEmptyFurnitureLists};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
