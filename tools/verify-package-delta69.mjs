import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Read-only package/source/resource audit; only writes one fresh external receipt.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const review=path.resolve(root,process.argv[2]??'artifacts/ready-for-review/final66-r6');
const output=path.resolve(root,process.argv[3]??'artifacts/packaging66/FINAL_R6_VERIFICATION.json');
assert(review.startsWith(path.join(root,'artifacts/ready-for-review')+path.sep));
assert(output.startsWith(path.join(root,'artifacts')+path.sep)&&!output.startsWith(review+path.sep));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sha=async p=>hash(await fs.readFile(p));
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
async function noLinks(p){for(let q=p;;q=path.dirname(q)){try{assert(!(await fs.lstat(q)).isSymbolicLink(),'Linked path: '+q);}catch(e){if(e.code!=='ENOENT')throw e;}if(q===root)return;assert(path.dirname(q)!==q);}}
function safe(base,relative){assert(typeof relative==='string'&&relative&&!relative.includes('\\')&&!relative.includes(':')&&!relative.startsWith('/')&&!relative.split('/').some(p=>!p||p==='.'||p==='..'));const full=path.resolve(base,...relative.split('/'));assert(full.startsWith(base+path.sep));return full;}
async function checkFiles(base,files){const names=new Set();let bytes=0;for(const f of files){assert(!names.has(f.path.toLowerCase()),'Duplicate declared path');names.add(f.path.toLowerCase());const p=safe(base,f.path);await noLinks(p);const b=await fs.readFile(p);assert.equal(b.length,f.size,f.path);assert.equal(hash(b),f.sha256,f.path);bytes+=b.length;}return{files:files.length,bytes};}
await noLinks(review);await noLinks(path.dirname(output));
const beforeDefinitions=[['r4','8b816b99814d21779f85a843c3c2f991856759d2ce144957cd1b154887ab6fb2'],['r5','d0a16bac5e8662fb69ae5e43636699e42b20fc02270029fb114090f844abc06a']];
const preserved=[];
for(const[version,expected]of beforeDefinitions){const directory=path.join(root,'artifacts/ready-for-review/final66-'+version);assert.equal(await sha(path.join(directory,'artifact-manifest.json')),expected);const manifest=await read(path.join(directory,'artifact-manifest.json'));const verified=await checkFiles(directory,manifest.files);preserved.push({version,directory,manifest,...verified,manifestSha256:expected});}
const manifest=await read(path.join(review,'artifact-manifest.json')),source=await read(path.join(review,'source-checkpoint.json'));
assert(manifest.sourceStable&&manifest.reportReady===false&&manifest.supervisorAccepted===false);assert.equal(source.files.length,178);
assert.equal(await sha(path.join(review,'source-checkpoint.json')),manifest.sourceCheckpointSha256);
const current=await checkFiles(review,manifest.files),currentSource=await checkFiles(root,source.files);
assert.equal(source.files.find(f=>f.path==='src/Jindan.Desktop.Contracts/RecordDocument.cs').sha256,'aa6047f3fa0cd4ff44fe29921bba8c54d6173d0b91e3f57161a25d42a6d787d5');
assert.equal(source.files.find(f=>f.path==='src/Jindan.Report.Adapter/ReportService.cs').sha256,'5f24b341963c7e2fc4c1730c670c75da9bf21f4a63d49cf47cfc971b802febe2');
const before=preserved.find(p=>p.version==='r5').manifest,beforeMap=new Map(before.files.map(f=>[f.path,f])),afterMap=new Map(manifest.files.map(f=>[f.path,f]));
function delta(a,b){const old=new Map(a.map(f=>[f.path,f])),now=new Map(b.map(f=>[f.path,f]));return{added:b.filter(f=>!old.has(f.path)).map(f=>f.path),removed:a.filter(f=>!now.has(f.path)).map(f=>f.path),changed:b.filter(f=>old.has(f.path)&&old.get(f.path).sha256!==f.sha256).map(f=>({path:f.path,beforeSha256:old.get(f.path).sha256,afterSha256:f.sha256,size:f.size}))};}
const outerDelta=delta(before.files,manifest.files);
const resources=prefix=>{const files=before.files.filter(f=>f.path.startsWith(prefix));return{verified:files.length,changed:files.filter(f=>afterMap.get(f.path)?.sha256!==f.sha256).map(f=>f.path),added:manifest.files.filter(f=>f.path.startsWith(prefix)&&!beforeMap.has(f.path)).map(f=>f.path)};};
const worker=resources('application/modules/report-studio/worker/'),runtime=resources('application/.runtime/');
assert.equal(worker.verified,2690);assert.equal(runtime.verified,481);assert.equal(worker.changed.length+worker.added.length+runtime.changed.length+runtime.added.length,0);
const trust=await read(path.join(review,'application/trusted-manifests.json'));
async function packageAt(directory,expected){await noLinks(directory);assert.equal(await sha(path.join(directory,'module.json')),expected);assert(trust.includes(expected));const value=await read(path.join(directory,'module.json'));await checkFiles(directory,value.files);return value;}
const modules=[];for(const m of manifest.modules){await packageAt(path.join(review,'application/modules',m.moduleId),m.manifestSha256);modules.push({...m,sameManifestAsR5:before.modules.find(b=>b.moduleId===m.moduleId).manifestSha256===m.manifestSha256});}
assert.equal(modules.length,9);await packageAt(manifest.patchCandidate.directory,manifest.patchCandidate.manifestSha256);
const nativeRoot=path.join(review,'reusable-engine/native'),native=await read(path.join(nativeRoot,'MANIFEST.json'));
assert.equal(await sha(path.join(nativeRoot,'MANIFEST.json')),manifest.reusableNativeManifestSha256);await checkFiles(nativeRoot,native.files);assert.equal(native.files.length,8);
assert(native.files.some(f=>f.path==='docs/preservation-contract66.md'));assert.equal(native.hybridWorker.manifestSha256,modules.find(m=>m.moduleId==='report-studio').manifestSha256);assert.equal(await sha(path.join(review,'application/modules/report-studio/worker/node.exe')),native.hybridWorker.nodeSha256);
assert.equal(await sha(path.join(nativeRoot,'Jindan.Report.Adapter.dll')),await sha(path.join(review,'application/Jindan.Report.Adapter.dll')));
const previousSource=await read(path.join(preserved.find(p=>p.version==='r5').directory,'source-checkpoint.json'));
const applicationFiles=manifest.files.filter(f=>f.path.startsWith('application/'));
const result={schema:'jindan-final-r6-package-delta-verification69/1',verifiedAt:new Date().toISOString(),reviewRoot:review,ok:true,sourceStable:true,currentSourceHashesVerified:currentSource.files,currentSourceBytes:currentSource.bytes,artifactFilesVerified:current.files,artifactBytes:current.bytes,applicationFiles:applicationFiles.length,applicationBytes:applicationFiles.reduce((n,f)=>n+f.size,0),artifactManifestSha256:await sha(path.join(review,'artifact-manifest.json')),sourceCheckpointSha256:manifest.sourceCheckpointSha256,nativeManifestSha256:manifest.reusableNativeManifestSha256,hostSha256:await sha(path.join(review,'application/Jindan.Desktop.dll')),desktopContractsSha256:await sha(path.join(review,'application/Jindan.Desktop.Contracts.dll')),adapterSha256:await sha(path.join(review,'application/Jindan.Report.Adapter.dll')),preserved:preserved.map(({manifest,...p})=>p),modules,patchCandidate:manifest.patchCandidate,workerResources:worker,runtimeResources:runtime,applicationDeltaFromR5:{added:outerDelta.added.filter(p=>p.startsWith('application/')),removed:outerDelta.removed.filter(p=>p.startsWith('application/')),changed:outerDelta.changed.filter(f=>f.path.startsWith('application/'))},outerArtifactDeltaFromR5:outerDelta,sourceDeltaFromR5:delta(previousSource.files,source.files),nativeWorkerBindingVerified:true,nativeAdapterMatchesApplication:true,preservationAppendixIncluded:true,allModuleAndCandidatePayloadVerified:true,reportReady:false,supervisorAccepted:false};
await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...result,outerArtifactDeltaFromR5:undefined,applicationDeltaFromR5:{added:result.applicationDeltaFromR5.added,removed:result.applicationDeltaFromR5.removed,changed:result.applicationDeltaFromR5.changed.map(f=>f.path)}}));
