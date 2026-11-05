import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(repo,process.argv[2]??'artifacts/review69-legacy-ab01');
if(!output.startsWith(path.join(repo,'artifacts')+path.sep))throw Error('Fresh owned output required');
await mkdir(output,{recursive:false});
const old=path.join(repo,'artifacts/ready-for-review/final66-r4/application');
const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=async p=>sha(await readFile(p));
const oldPackage=path.join(old,'modules/projects'),manifest=JSON.parse(await readFile(path.join(oldPackage,'module.json'),'utf8')),manifestHash=await hash(path.join(oldPackage,'module.json'));
async function inventory(dir){return Promise.all((await readdir(dir)).sort().map(async name=>({name,sha256:await hash(path.join(dir,name))})));}
const evidence=[];
for(const mode of ['exact-r4-before','new-source-legacy-rejection']){
 const root=path.join(output,mode);await mkdir(path.join(root,'modules/projects'),{recursive:true});await copyFile(path.join(oldPackage,'module.json'),path.join(root,'modules/projects/module.json'));
 for(const f of manifest.files){const to=path.join(root,'modules/projects',f.path);await mkdir(path.dirname(to),{recursive:true});await copyFile(path.join(oldPackage,f.path),to);}
 const data=path.join(root,'data'),snapshot=path.join(root,'.updates/probe69/data-before');await mkdir(data);await mkdir(snapshot,{recursive:true});
 for(const name of ['a','b']){await writeFile(path.join(data,'current-'+name+'.txt'),'synthetic current '+name);await writeFile(path.join(snapshot,'old-'+name+'.txt'),'synthetic historical '+name);}
 const complete=await inventory(snapshot);await unlink(path.join(snapshot,'old-b.txt'));
 const before=await inventory(data);const fingerprint=sha(before.map(f=>'file:'+f.name+':'+f.sha256).join('\n'));
 const journal={patchId:'probe69',moduleId:'projects',stage:'committed',beforeVersion:manifest.version,afterVersion:manifest.version,beforeManifestSha256:manifestHash,afterManifestSha256:manifestHash,dataSnapshot:true,dataAfterFingerprint:fingerprint};
 await writeFile(path.join(root,'.updates/journal.json'),JSON.stringify(journal,null,2));await writeFile(path.join(root,'trust.json'),JSON.stringify([manifestHash]));
 const tool=mode==='exact-r4-before'?path.join(old,'update-tool/Jindan.Update.Tool.dll'):path.join(repo,'src/Jindan.Update.Tool/bin/Release/net10.0/Jindan.Update.Tool.dll');
 const startedAt=new Date().toISOString();const args=[tool,'rollback','--root',root,'--trust',path.join(root,'trust.json')];let stdout='',stderr='';
 const child=spawn(path.join(old,'.runtime/dotnet.exe'),args,{cwd:repo,windowsHide:true,env:{...process.env,DOTNET_ROOT:path.join(old,'.runtime'),DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 const after=await inventory(data);const result={mode,startedAt,endedAt:new Date().toISOString(),exit,command:[path.join(old,'.runtime/dotnet.exe'),...args],toolSha256:await hash(tool),updateDllSha256:await hash(path.join(path.dirname(tool),'Jindan.Update.dll')),completeSnapshotBeforeFault:complete,snapshotAfterFault:await inventory(snapshot),currentDataBefore:before,currentDataAfter:after,livePreserved:JSON.stringify(before)===JSON.stringify(after),stdout,stderr};
 if(mode==='exact-r4-before'){result.expectedDefectConfirmed=exit===0&&!result.livePreserved&&after.length===1&&after[0].name==='old-a.txt';if(!result.expectedDefectConfirmed)throw Error('ExactR4 defect was not reproduced');}
 else if(exit===0||!result.livePreserved||!stderr.includes('DATA_BACKUP_UNVERIFIABLE'))throw Error('New source did not reject legacy unbound snapshot safely');
 await writeFile(path.join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});evidence.push(result);
}
await writeFile(path.join(output,'RESULT.json'),JSON.stringify({schema:'jindan-snapshot69-legacy-ab/1',qualification:'Synthetic committed-journal corruption reproduces exactR4 defect. New source rejects legacy unbound snapshots; separate PackageTests actual ApplyAsync/migration cases verify new complete-snapshot corruption/restart paths. Not a company data migration or native report test.',cases:evidence,pass:2,fail:0,reportReady:false,supervisorAccepted:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pass:2,fail:0,exactR4DefectConfirmed:true,newSourcePreservesLive:true,output}));
