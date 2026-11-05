import {readFile,writeFile,mkdir,readdir,lstat,copyFile,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [reviewArg,targetArg,receiptArg]=process.argv.slice(2);if(!receiptArg)throw Error('review-root unexecuted-owned-app-clone new-receipt required');
const review=path.resolve(reviewArg),source=path.join(review,'application'),target=path.resolve(targetArg),receipt=path.resolve(receiptArg);
const owned=path.join(workspace,'artifacts')+path.sep;
if(!review.startsWith(path.join(workspace,'artifacts/ready-for-review')+path.sep)||!target.startsWith(owned)||!path.basename(path.dirname(target)).startsWith('product-patch66')||!receipt.startsWith(owned)||receipt.startsWith(path.join(workspace,'artifacts/ready-for-review')+path.sep)||source===target||target.startsWith(source+path.sep))throw Error('Use only the explicit immutable review and owned product-test clone.');
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function noLinkedAncestors(p){for(let q=p;;q=path.dirname(q)){if(await exists(q)&&(await lstat(q)).isSymbolicLink())throw Error('Linked clone ancestors are forbidden.');if(q===workspace)return;if(path.dirname(q)===q)throw Error('Clone path left owned workspace.');}}
await noLinkedAncestors(review);await noLinkedAncestors(target);await noLinkedAncestors(receipt);
if(await exists(receipt))throw Error('Receipt exists; preserve it.');
for(const name of['data','workspace','workspace-location.json','.updates','.jindan.application.lock'])if(await exists(path.join(target,name)))throw Error('Clone has been executed or used; choose a fresh target.');
const bytes=await readFile(path.join(review,'artifact-manifest.json'));const manifest=JSON.parse(bytes);
const expected=manifest.files.filter(f=>f.path.startsWith('application/')).map(f=>({...f,path:f.path.slice('application/'.length)}));
if(expected.length<1000)throw Error('Complete review application inventory is required.');
const sha=async p=>{const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');};
async function walk(dir){if(!await exists(dir))return[];let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if((await lstat(p)).isSymbolicLink())throw Error('Linked clone paths are forbidden.');if(e.isDirectory())out.push(...await walk(p));else out.push(path.relative(target,p).replaceAll('\\','/'));}return out;}
const names=new Set(expected.map(f=>f.path));for(const relative of await walk(target))if(!names.has(relative))throw Error('Unexpected clone file must be preserved, not removed: '+relative);
const backup=path.join(path.dirname(target),'pre-r2-delta-backup');if(await exists(backup))throw Error('Delta backup exists; no overwrite allowed.');
const changed=[];let verified=0;
for(const file of expected){
 if(file.path.includes('\\')||file.path.includes(':')||file.path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe manifest path.');
 const from=path.resolve(source,file.path),to=path.resolve(target,file.path);
 if(!from.startsWith(source+path.sep)||!to.startsWith(target+path.sep))throw Error('Manifest escaped explicit roots.');
 const before=await exists(to)?await sha(to):null;
 if(before!==file.sha256){
  if(await sha(from)!==file.sha256)throw Error('Immutable source differs: '+file.path);
  if(before){const saved=path.join(backup,file.path);await mkdir(path.dirname(saved),{recursive:true});await copyFile(to,saved);if(await sha(saved)!==before)throw Error('Delta backup verification failed.');}
  await mkdir(path.dirname(to),{recursive:true});const temp=to+'.clone-'+process.pid;await copyFile(from,temp);if(await sha(temp)!==file.sha256)throw Error('Staged clone copy differs.');await rename(temp,to);
  const after=await sha(to);if(after!==file.sha256)throw Error('Installed clone differs: '+file.path);
  changed.push({path:file.path,beforeSha256:before,afterSha256:after});
 }
 verified++;
}
await mkdir(path.dirname(receipt),{recursive:true});await writeFile(receipt,JSON.stringify({schema:'jindan-product-clone66/2',createdAt:new Date().toISOString(),reviewRoot:review,target,sourceArtifactManifestSha256:createHash('sha256').update(bytes).digest('hex'),filesVerified:verified,changed,backupPath:changed.some(c=>c.beforeSha256)?backup:null,allTargetFilesMatch:true,sourceModified:false,reportReady:false,supervisorAccepted:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pass:1,fail:0,filesVerified:verified,changed:changed.length,receipt}));
