import {readFile,writeFile,mkdir,stat,lstat,readdir,copyFile,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);let destination=path.join(root,'artifacts','ready-for-review');
if(args.length){if(args.length!==2||!['--destination','--output'].includes(args[0]))throw Error('Usage: node tools/prepare-review66.mjs [--destination F:/jindan-dotnet/artifacts/ready-for-review/NEW-NAME]');destination=path.resolve(args[1]);}
const artifacts=path.join(root,'artifacts');
if(destination!==path.join(artifacts,'integration-review66')&&destination!==path.join(artifacts,'ready-for-review')&&!destination.startsWith(path.join(artifacts,'ready-for-review')+path.sep))throw Error('Review destination must remain in the owned ready-for-review tree.');
const exists=async p=>{try{await stat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
if(await exists(destination))throw Error('Review output exists; choose a fresh --destination. No existing artifact is overwritten.');
await mkdir(destination,{recursive:true});
const logs=path.join(destination,'logs');await mkdir(logs);
const app=path.join(destination,'application');await mkdir(app);
const sha=async(file,algorithm='sha256')=>{const h=createHash(algorithm);for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
const json=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');};
const readJson=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const forward=p=>p.split(path.sep).join('/');
async function files(dir,filter=()=>true){let out=[];for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);const s=await lstat(p);if(s.isSymbolicLink())throw Error('Reparse/symlink source is not an explicit package file: '+forward(path.relative(root,p)));if(!filter(p,ent))continue;if(ent.isDirectory())out.push(...await files(p,filter));else if(ent.isFile())out.push(p);}return out.sort();}
async function copy(from,to){await mkdir(path.dirname(to),{recursive:true});await copyFile(from,to);}
async function copyTree(from,to,filter=()=>true){for(const f of await files(from,filter))await copy(f,path.join(to,path.relative(from,f)));}
const env={...process.env,DOTNET_ROOT:path.join(root,'.tools','dotnet'),DOTNET_ROOT_X64:path.join(root,'.tools','dotnet'),DOTNET_CLI_HOME:path.join(root,'.tools','cli-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'};
async function run(exe,argv,label){const chunks=[];const child=spawn(exe,argv,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{chunks.push(b);process.stdout.write(b);});await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(label+' exited '+code)));}).finally(async()=>writeFile(path.join(logs,label+'.log'),Buffer.concat(chunks)));}
async function sourceSnapshot(){const selected=[];for(const name of['src','build'])if(await exists(path.join(root,name)))selected.push(...await files(path.join(root,name),(p,e)=>!['bin','obj','node_modules','.tools','artifacts'].includes(e.name)));for(const name of['tools/dotnet.ps1','tools/prepare-review66.mjs','Directory.Build.props','NuGet.Config','global.json','Jindan.sln','package.json','package-lock.json'])if(await exists(path.join(root,name)))selected.push(path.join(root,name));const result=[];for(const f of selected.sort())result.push({path:forward(path.relative(root,f)),size:(await stat(f)).size,sha256:await sha(f)});return result;}
const initial=await sourceSnapshot();await json(path.join(destination,'source-checkpoint.json'),{schema:1,createdAt:new Date().toISOString(),root,files:initial,reportReady:false,supervisorAccepted:false});
const buildStart=new Date().toISOString();
try{
 const wrapper=path.join(root,'tools','dotnet.ps1');
 await run('powershell.exe',['-NoProfile','-NonInteractive','-File',wrapper,'build',path.join(root,'Jindan.sln'),'-c','Release','-v','minimal'],'release-build');
 await run('powershell.exe',['-NoProfile','-NonInteractive','-File',wrapper,'build',path.join(root,'src/Jindan.Update.Tool/Jindan.Update.Tool.csproj'),'-c','Release','-v','minimal'],'update-tool-build');
 const desktop=path.join(root,'src/Jindan.Desktop/bin/Release/net10.0-windows');
 for(const f of await files(desktop,(p,e)=>!e.isDirectory()&&!e.name.endsWith('.pdb')))await copy(f,path.join(app,path.basename(f)));
 const tool=path.join(root,'src/Jindan.Update.Tool/bin/Release/net10.0');
 for(const f of await files(tool,(p,e)=>!e.isDirectory()&&!e.name.endsWith('.pdb')))await copy(f,path.join(app,'update-tool',path.basename(f)));
 const sdk=path.join(root,'.tools','dotnet');const sdkProof=await readJson(path.join(root,'artifacts/sdk66/sdk-verification.json'));
 if(!sdkProof.sha512Verified||sdkProof.actualSha512!==sdkProof.sdkFile.hash||await sha(sdkProof.archivePath,'sha512')!==sdkProof.actualSha512)throw Error('Official SDK archive verification failed.');
 const runtimeVersion='10.0.14';const runtimeRel=['dotnet.exe','LICENSE.txt','ThirdPartyNotices.txt'];
 for(const folder of['host/fxr/'+runtimeVersion,'shared/Microsoft.NETCore.App/'+runtimeVersion,'shared/Microsoft.WindowsDesktop.App/'+runtimeVersion])for(const f of await files(path.join(sdk,folder)))runtimeRel.push(forward(path.relative(sdk,f)));
 await json(path.join(destination,'runtime-source-spec.json'),{archivePath:sdkProof.archivePath,sdkRoot:sdk,files:runtimeRel});
 const python=`import sys,json,zipfile,hashlib,pathlib\ns=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))\nwith zipfile.ZipFile(s['archivePath']) as z:\n for relative in s['files']:\n  expected=hashlib.sha256(z.read(relative)).digest()\n  actual=hashlib.sha256((pathlib.Path(s['sdkRoot'])/relative).read_bytes()).digest()\n  if expected!=actual: raise RuntimeError('Runtime differs from verified archive: '+relative)\nprint('RUNTIME_VERIFIED',len(s['files']))\n`;
 await run('python',['-c',python,path.join(destination,'runtime-source-spec.json')],'runtime-archive-validation');
 for(const rel of runtimeRel)await copy(path.join(sdk,rel),path.join(app,'.runtime',rel));
 await json(path.join(app,'.runtime','provenance.json'),{runtimeVersion,sdkVersion:sdkProof.sdkVersion,officialArchive:sdkProof.sdkFile.url,archiveSha512:sdkProof.actualSha512,metadataSha256:sdkProof.metadataSha256,scope:'hostfxr+NETCore+WindowsDesktop only; no SDK/ASP.NET/build tools',files:runtimeRel.length});
 const modules=[['Projects','projects'],['Processes','processes'],['Photos','photos'],['Files','files'],['Tasks','tasks'],['Board','board'],['Members','members'],['Dashboard','dashboard'],['ReportStudio','report-studio']];
 const trust=[],inventory=[],moduleProof=[];
 async function manifest(folder,feature,id,version){const payload=[];for(const f of await files(folder))payload.push({path:forward(path.relative(folder,f)),size:(await stat(f)).size,sha256:await sha(f)});const value={schemaVersion:1,moduleId:id,version,entryAssembly:'Jindan.Modules.'+feature+'.dll',entryType:'Jindan.Modules.'+feature+'.Module',minimumHostContractMajor:1,maximumHostContractMajor:1,dataSchemaVersion:1,dependencies:[],files:payload};const out=path.join(folder,'module.json');await json(out,value);return{moduleId:id,version,manifestSha256:await sha(out),payloadFiles:payload.length,payloadBytes:payload.reduce((s,f)=>s+f.size,0)};}
 for(const [feature,id]of modules){const folder=path.join(app,'modules',id);await mkdir(folder,{recursive:true});const dll='Jindan.Modules.'+feature+'.dll';await copy(path.join(root,'src','Modules',feature,'bin','Release','net10.0-windows',dll),path.join(folder,dll));if(['Projects','Processes','Dashboard','Files'].includes(feature))await copy(path.join(root,'src/Jindan.Core/bin/Release/net10.0/Jindan.Core.dll'),path.join(folder,'Jindan.Core.dll'));if(feature==='Files')await copy(path.join(root,'src/Jindan.Infrastructure/bin/Release/net10.0/Jindan.Infrastructure.dll'),path.join(folder,'Jindan.Infrastructure.dll'));if(id==='report-studio'){
  const worker=path.join(folder,'worker');const sourceWorker=path.join(root,'src/Jindan.Report.Worker');await mkdir(worker);
  for(const name of['worker.mjs','node-pictures.mjs','node-cad.mjs'])if(await exists(path.join(sourceWorker,name)))await copy(path.join(sourceWorker,name),path.join(worker,name));
  await copyTree(path.join(sourceWorker,'engine','src'),path.join(worker,'engine','src'));
  const packageJson=await readJson(path.join(root,'package.json'));const lock=await readJson(path.join(root,'package-lock.json'));
  const applicable=(list,value)=>!Array.isArray(list)||(!list.includes('!'+value)&&(list.every(x=>x.startsWith('!'))||list.includes(value)));
  const selected=[];
  for(const [relative,entry]of Object.entries(lock.packages)){if(!relative||entry.dev||relative.includes('/.bin')||!relative.startsWith('node_modules/')||!applicable(entry.os,'win32')||!applicable(entry.cpu,'x64'))continue;const source=path.join(root,relative);if(!await exists(source)){if(entry.optional)continue;throw Error('Required installed package missing: '+relative);}selected.push({relative,version:entry.version,integrity:entry.integrity,license:entry.license});await copyTree(source,path.join(worker,relative),(p,e)=>!['node_modules','.bin','.git','.github','test','tests','__tests__','coverage','examples'].includes(e.name));}
  await json(path.join(worker,'package.json'),{name:'jindan-report-worker66',version:'0.1.0',private:true,type:'module',dependencies:packageJson.dependencies});
  await json(path.join(worker,'dependency-closure.json'),{platform:'win32',arch:'x64',sourceLockSha256:await sha(path.join(root,'package-lock.json')),selection:'installed non-dev lock packages applicable to win32/x64; package test/example/dev-bin directories excluded',packages:selected});
  const nodePath=await new Promise((resolve,reject)=>{let text='';const child=spawn('node',['-p','process.execPath'],{cwd:root,env,windowsHide:true});child.stdout.on('data',b=>text+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(text.trim()):reject(Error('Node discovery failed')));});const nodeActual=await realpath(nodePath);
  if(nodeActual.toLowerCase().startsWith('f:\\jindan\\')||nodeActual.toLowerCase().startsWith('f:/jindan/'))throw Error('Old workspace Node must not be copied.');
  await copy(nodeActual,path.join(worker,'node.exe'));await copy(path.join(path.dirname(nodeActual),'LICENSE'),path.join(worker,'licenses','Node-LICENSE.txt'));
  await json(path.join(worker,'licenses','component-inventory.json'),{node:{source:nodeActual,sha256:await sha(nodeActual),license:'Node-LICENSE.txt'},npm:selected.map(p=>({package:p.relative,version:p.version,license:p.license,integrity:p.integrity})),notice:'Included upstream package license files and metadata; no production signing or company-content approval.'});
 }
 const proof=await manifest(folder,feature,id,'1.0.0');trust.push(proof.manifestSha256);inventory.push('modules/'+id);moduleProof.push(proof);console.log('PACKAGED_MODULE '+id+' '+proof.payloadFiles+'files '+proof.payloadBytes+'bytes');}
 await json(path.join(app,'module-inventory.json'),inventory);
 const reusable=path.join(destination,'reusable-engine','native');await mkdir(reusable,{recursive:true});
 const reusableSources=[
  ['src/Engines/Jindan.Engine.Package/bin/Release/net10.0/Jindan.Engine.Package.dll','Jindan.Engine.Package.dll'],
  ['src/Jindan.Contracts/bin/Release/net10.0/Jindan.Contracts.dll','Jindan.Contracts.dll'],
  ['src/Jindan.Report.Adapter/bin/Release/net10.0-windows/Jindan.Report.Adapter.dll','Jindan.Report.Adapter.dll'],
  ['docs/engine-reuse66.md','docs/engine-reuse66.md'],
  ['docs/preservation-contract66.md','docs/preservation-contract66.md'],
  ['docs/worker-protocol66.md','docs/worker-protocol66.md'],
  ['docs/report-adapter66.md','docs/report-adapter66.md'],
  ['migration/source-map.json','migration/source-map.json']
 ];
 const reusableFiles=[];for(const [source,target]of reusableSources){const original=path.join(root,source);const copied=path.join(reusable,target);await copy(original,copied);const sourceSha256=await sha(original);if(await sha(copied)!==sourceSha256)throw Error('Reusable native copy differs: '+target);reusableFiles.push({path:target,size:(await stat(copied)).size,sha256:sourceSha256,source});}
 const reportPackage=moduleProof.find(p=>p.moduleId==='report-studio');if(!reportPackage)throw Error('Report worker package is missing.');
 await json(path.join(reusable,'MANIFEST.json'),{schema:'jindan-reusable-native/66',configuration:'Release',nativeCapabilities:['bounded HWPX ZIP/XML/manifest/hash inventory and recovery verification','UI-independent contracts','authenticated owned-process hybrid report transport'],notStandaloneFullRenderer:true,requirements:{dotnetMajor:10,targetFrameworks:{'Jindan.Engine.Package.dll':'net10.0','Jindan.Contracts.dll':'net10.0','Jindan.Report.Adapter.dll':'net10.0-windows'},hybridRuntime:'Exact declared worker package, bundled Node executable and its complete runtime resources are required for restoration/preview; the three native DLLs alone are insufficient.'},hybridWorker:{relativeToReviewRoot:'application/modules/report-studio',manifestFile:'application/modules/report-studio/module.json',manifestSha256:reportPackage.manifestSha256,workerEntry:'worker/worker.mjs',nodeEntry:'worker/node.exe',nodeSha256:await sha(path.join(app,'modules/report-studio/worker/node.exe')),fullWorkerDuplicated:false},files:reusableFiles,limitations:['Structural validation is not native Hancom rendering/font/value/editability approval.','Consumers must supply real authorization and fresh source/evidence/review gates; no old acceptance is recovered.','No separate PDF application was modified and no paid/cloud provider is configured.'],reportReady:false,supervisorAccepted:false});
 const patchSuffix=path.basename(destination)==='ready-for-review'?'':'-'+path.basename(destination);const patchBuild=path.join(artifacts,'patches66','projects-v2-build'+patchSuffix);const patchDir=path.join(artifacts,'patches66','projects-v2'+patchSuffix);
 if(await exists(patchDir))throw Error('Projects v2 candidate exists; preserve it and choose a fresh review destination before regenerating.');
 await run('powershell.exe',['-NoProfile','-NonInteractive','-File',wrapper,'build',path.join(root,'src/Modules/Projects/Jindan.Modules.Projects.csproj'),'-c','Release','-p:DefineConstants=PATCH_V2','-p:BuildProjectReferences=false','-o',patchBuild,'-v','minimal'],'projects-v2-build');
 await mkdir(patchDir,{recursive:true});await copy(path.join(patchBuild,'Jindan.Modules.Projects.dll'),path.join(patchDir,'Jindan.Modules.Projects.dll'));await copy(path.join(root,'src/Jindan.Core/bin/Release/net10.0/Jindan.Core.dll'),path.join(patchDir,'Jindan.Core.dll'));
 const patchProof=await manifest(patchDir,'Projects','projects','1.1.0');trust.push(patchProof.manifestSha256);
 await json(path.join(app,'trusted-manifests.json'),trust);
 await json(path.join(app,'LOCAL-TRUST-POLICY.json'),{schema:1,kind:'explicit-local-build-enrollment',enrollmentAuthority:'ROADMAP66 user-approved local packaging and one-module v2 test instruction',productionSigning:false,packages:moduleProof,candidate:{directory:patchDir,...patchProof},note:'Integrity allowlist is not publisher authentication or report/business approval.',reportReady:false,supervisorAccepted:false});
 await writeFile(path.join(destination,'Run.ps1'),`param([string]$Workspace, [switch]$HealthCheck)\n$ErrorActionPreference='Stop'\n$app=Join-Path $PSScriptRoot 'application'\n$env:DOTNET_ROOT=Join-Path $app '.runtime'\n$env:DOTNET_ROOT_X64=$env:DOTNET_ROOT\n$env:DOTNET_MULTILEVEL_LOOKUP='0'\n$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'\n$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'\n$arguments=@((Join-Path $app 'Jindan.Desktop.dll'),'--installation-root',$app)\nif($Workspace){$arguments+=@('--workspace',[IO.Path]::GetFullPath($Workspace))}\nif($HealthCheck){$arguments+='--healthcheck'}\n& (Join-Path $env:DOTNET_ROOT 'dotnet.exe') @arguments\nexit $LASTEXITCODE\n`);
 await writeFile(path.join(destination,'Update.ps1'),`param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ToolArguments)\n$ErrorActionPreference='Stop'\n$app=Join-Path $PSScriptRoot 'application'\n$env:DOTNET_ROOT=Join-Path $app '.runtime'\n$env:DOTNET_ROOT_X64=$env:DOTNET_ROOT\n$env:DOTNET_MULTILEVEL_LOOKUP='0'\n$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'\n$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'\n& (Join-Path $env:DOTNET_ROOT 'dotnet.exe') (Join-Path $app 'update-tool/Jindan.Update.Tool.dll') @ToolArguments\nexit $LASTEXITCODE\n`);
 const runbook=await exists(path.join(root,'docs/run-review70.md'))?'docs/run-review70.md':'docs/run-review66.md';
 if(await exists(path.join(root,runbook)))await copy(path.join(root,runbook),path.join(destination,'RUN-REVIEW.md'));
 const after=await sourceSnapshot();if(JSON.stringify(initial)!==JSON.stringify(after))throw Error('Source changed during packaging; preserve this incomplete artifact and rebuild from a stable checkpoint.');
 const artifactFiles=[];for(const f of await files(destination,(p,e)=>e.name!=='logs'))artifactFiles.push({path:forward(path.relative(destination,f)),size:(await stat(f)).size,sha256:await sha(f)});
 await json(path.join(destination,'artifact-manifest.json'),{schema:1,createdAt:new Date().toISOString(),buildStartedAt:buildStart,buildConfiguration:'Release',sourceStable:true,reusableNativeManifestSha256:await sha(path.join(reusable,'MANIFEST.json')),sdk:'10.0.403',runtime:runtimeVersion,sourceCheckpointSha256:await sha(path.join(destination,'source-checkpoint.json')),modules:moduleProof,patchCandidate:{directory:patchDir,...patchProof},mutableExclusions:['logs/**','application/data/**','application/workspace/**','application/workspace-location.json','application/.updates/**','application/.jindan.application.lock'],files:artifactFiles,reportReady:false,supervisorAccepted:false});
 await json(path.join(destination,'PREPARATION_RESULT.json'),{ok:true,sourceStable:true,reusableNativeManifestSha256:await sha(path.join(reusable,'MANIFEST.json')),artifactManifestSha256:await sha(path.join(destination,'artifact-manifest.json')),sourceCheckpointSha256:await sha(path.join(destination,'source-checkpoint.json')),files:artifactFiles.length,modules:9,patchCandidate:patchProof,healthAndUI:'not-run-by-packager; coordinator-owned',reportReady:false,supervisorAccepted:false});
 console.log('READY_FOR_COORDINATOR_TEST '+destination);
}catch(error){await json(path.join(destination,'PREPARATION_RESULT.json'),{ok:false,error:error.message,buildStartedAt:buildStart,failedAt:new Date().toISOString(),existingArtifactPreserved:true,reportReady:false,supervisorAccepted:false});throw error;}







