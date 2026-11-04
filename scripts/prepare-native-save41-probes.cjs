// Read-only source + new diagnostic output. Never runs a native application.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{strFromU8,strToU8}=require('fflate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const root=path.resolve('output/supervision/20261103-report-studio/implementation-native-open'),input=path.join(root,'causal38/04-final25-source124.hwpx'),bytes=await fs.readFile(input);
 assert.equal(sha(bytes),'5e55bfbd39753d255501371349a1547df3c3e594d8534885ba8d71f390d90201');
 const {readHwpxPackage,indexHwpxSection,packHwpxPackage}=await import('../src/services/report/hwpxPackage.js'),{validateGeneratedHwpx}=await import('../src/services/report/generatedHwpxValidation.js');
 const entries=readHwpxPackage(bytes),part='Contents/section0.xml',xml=strFromU8(entries[part]),index=indexHwpxSection(xml,part),manifest=indexHwpxSection(strFromU8(entries['Contents/content.hpf']),'hpf'),items=new Map(manifest.nodes.filter(n=>n.name.endsWith(':item')).map(n=>[n.attrs.id,n.attrs.href])),changes=[];
 for(const pic of index.nodes.filter(n=>n.name==='hp:pic')){
  const image=index.nodes.find(n=>n.parent===pic&&n.name==='hc:img'),dim=index.nodes.find(n=>n.parent===pic&&n.name==='hp:imgDim'),href=items.get(image?.attrs.binaryItemIDRef),data=entries[href];assert.ok(dim&&data);
  assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);const dv=new DataView(data.buffer,data.byteOffset,data.byteLength),w=dv.getUint32(16),h=dv.getUint32(20);assert.ok(w>0&&h>0&&w<100000&&h<100000);
  // Diagnostic hypothesis ONLY: image natural dimensions at the native
  // saved-package convention (pixel * 75 HWPUNIT). Placement stays identical.
  const before=xml.slice(dim.start,dim.end),after=before.replace(/dimwidth="\d+"/,`dimwidth="${w*75}"`).replace(/dimheight="\d+"/,`dimheight="${h*75}"`);
  changes.push({start:dim.start,end:dim.end,before,after,binaryItemId:image.attrs.binaryItemIDRef,href,width:w,height:h,sha256:sha(data)});
 }
 assert.equal(changes.length,2);let changed=xml;for(const c of [...changes].reverse())changed=changed.slice(0,c.start)+c.after+changed.slice(c.end);
 let reversed=changed;for(const c of changes)reversed=reversed.replace(c.after,c.before);assert.equal(reversed,xml);const outputEntries={...entries,[part]:strToU8(changed)};validateGeneratedHwpx(outputEntries);const output=packHwpxPackage(outputEntries),unpacked=readHwpxPackage(output);
 for(const [name,b]of Object.entries(entries))if(name!==part)assert.deepEqual(unpacked[name],b);
 const dir=path.join(root,'native-save41');await fs.mkdir(dir,{recursive:true});const cases=[];
 for(const [name,b,scope]of [['01-final25-source124-control',bytes,'Exact final25 source124 derivative, unchanged'],['02-original-pixel-natural-dimensions',output,'Only two hp:imgDim width/height pairs changed; all original PNG/font bytes and all draw/clip/placement/text/section/page structures preserved. Hypothesis, not a production fix.']]){
  const file=path.join(dir,name+'.hwpx');await fs.writeFile(file,b,{flag:'wx'});cases.push({path:file,sha256:sha(b),bytes:b.length,scope,native:'pending_parent_only'});
 }
 await fs.writeFile(path.join(dir,'NATIVE_SAVE41_MANIFEST.json'),JSON.stringify({createdAt:new Date().toISOString(),source:{path:input,sha256:sha(bytes)},cases,changes,productionPolicyChanged:false,claim:'Compare native open/layout and SaveAs image pixels without changing settings. The observed factor-three resampling is NOT attributed to imgDim until this control is tested. Font/source-JSON/tab loss remains separate and unresolved.',reportReady:false},null,2)+'\n',{flag:'wx'});
 assert.equal(sha(await fs.readFile(input)),sha(bytes));console.log(JSON.stringify(cases));
}
main().catch(e=>{console.error(e);process.exitCode=1});
