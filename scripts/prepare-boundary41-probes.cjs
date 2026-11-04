const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{strFromU8}=require('fflate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const root=path.resolve('output/supervision/20261103-report-studio'),out=path.join(root,'implementation-native-open/boundary41'),{readHwpxPackage}=await import('../src/services/report/hwpxPackage.js'),{splitGeneratedSectionProbe}=require('./split-hwpx-section-probes.cjs'),pages=[115,124,125],cases=[];
 await fs.mkdir(out,{recursive:true});
 for(const [name,dir,engine,expected]of [['01-before25','daecheong-production25','pdf-hwpx/25','30375069e932deef1bda8e4a522c555dc2903b359e3cf16e7c34e938a712be8a'],['02-boundaries26','daecheong-production26-retry','pdf-hwpx/26',null]]){
  const proof=JSON.parse(await fs.readFile(path.join(root,'evidence',dir,'actual-download-proof.json'),'utf8')),bytes=await fs.readFile(proof.disk.path);assert.equal(sha(bytes),proof.sha256);if(expected)assert.equal(sha(bytes),expected);
  const entries=readHwpxPackage(bytes),source=JSON.parse(strFromU8(entries['Contents/jindan-source.json']));assert.equal(source.engineVersion,engine);const ordinals=pages.map(p=>source.sections.findIndex(s=>s.sourcePage===p)+1);assert.ok(ordinals.every(n=>n>0));
  const subset=await splitGeneratedSectionProbe(bytes,ordinals),file=path.join(out,name+'-source115-124-125.hwpx');await fs.writeFile(file,subset.bytes,{flag:'wx'});cases.push({path:file,sha256:sha(subset.bytes),bytes:subset.bytes.length,parent:{path:proof.disk.path,sha256:proof.sha256},sourcePages:pages,proof:subset.proof,native:'pending_parent_only'});assert.equal(sha(await fs.readFile(proof.disk.path)),proof.sha256);
 }
 await fs.writeFile(path.join(out,'BOUNDARY41_MANIFEST.json'),JSON.stringify({createdAt:new Date().toISOString(),cases,scope:'Same complete source115/124/125 page sets, retaining every global font/image asset. Compare before25 and26 tracking only; full character/style/geometry equivalence is separately audited in INDEPENDENT_BOUNDARY41_AUDIT.json. Not whole-company or native-save approval.',reportReady:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(cases.map(c=>({path:c.path,sha256:c.sha256,bytes:c.bytes}))));
}
main().catch(e=>{console.error(e);process.exitCode=1});
