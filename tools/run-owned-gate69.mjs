import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [kind,arg,version='r6',buildSuffix='']=process.argv.slice(2);
if(!/^[0-9]{0,2}$/.test(buildSuffix))throw Error('Bounded test-only build suffix required');
if(!['r5','r6'].includes(version))throw Error('Known review version required');
const review=path.join(root,'artifacts/ready-for-review/final66-'+version),app=path.join(review,'application');
const out=path.resolve(root,arg??'');
if(!arg||!out.startsWith(path.join(root,'artifacts')+path.sep)||out.startsWith(review+path.sep)||fs.existsSync(out)||fs.existsSync(out+'.COMMAND.json'))throw Error('Fresh owned evidence required');
const cases={
 patch:[path.join(root,`artifacts/final-${version}-productpatch-build/Jindan.Patch.ProductTests.dll`),path.join(root,`artifacts/product-patch66-${version}/application`),path.join(root,`artifacts/patches66/projects-v2-final66-${version}`),out],
 files:[path.join(root,`artifacts/final-${version}-local-build${buildSuffix}/Jindan.LocalModules.Tests.dll`),out,app],
 entry:[path.join(root,'tests/Jindan.Launch.Tests/bin/Release/net10.0-windows/Jindan.Launch.Tests.dll'),path.join(root,`artifacts/product-patch66-${version}/application`),out]
};
if(!cases[kind])throw Error('Expected patch, files or entry');
const exe=path.join(app,'.runtime/dotnet.exe'),args=cases[kind],hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const startedAt=new Date().toISOString();let stdout='',stderr='',overflow=false;
const env={...process.env,DOTNET_ROOT:path.join(app,'.runtime'),DOTNET_ROOT_X64:path.join(app,'.runtime'),DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1'};
// The Files harness is itself the visible GUI owner. SW_HIDE on its startup
// suppresses the first native Form even when managed geometry tests can run.
// Patch/entry harnesses create their visible UI in separate owned children.
const windowsHide=kind!=='files';
const p=spawn(exe,args,{cwd:root,env,windowsHide,stdio:['ignore','pipe','pipe']});
p.stdout.on('data',b=>{if(stdout.length<16*1024*1024)stdout+=b.toString('utf8');else overflow=true;});
p.stderr.on('data',b=>{if(stderr.length<16*1024*1024)stderr+=b.toString('utf8');else overflow=true;});
const exit=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',resolve);});
fs.writeFileSync(out+'.stdout.log',stdout,{flag:'wx'});fs.writeFileSync(out+'.stderr.log',stderr,{flag:'wx'});
const result={schema:'jindan-owned-gate69/1',kind,command:[exe,...args],launchOptions:{windowsHide},startedAt,endedAt:new Date().toISOString(),pid:p.pid,exit,overflow,artifactManifestSha256:hash(path.join(review,'artifact-manifest.json')),runtimeSha256:hash(exe),harnessSha256:hash(args[0]),resultPath:path.join(out,'RESULT.json'),stdoutSha256:hash(out+'.stdout.log'),stderrSha256:hash(out+'.stderr.log'),reportReady:false,supervisorAccepted:false};
fs.writeFileSync(out+'.COMMAND.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));console.log(stdout.slice(-9000));if(stderr)console.log(stderr.slice(-3000));process.exitCode=exit===0&&!overflow?0:1;
