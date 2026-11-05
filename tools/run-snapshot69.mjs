import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,process.argv[2]??'artifacts/review69-snapshot-tests02');
const installation=process.argv[3]?path.resolve(process.argv[3]):null;
if(installation&&!installation.startsWith(path.join(root,'artifacts','ready-for-review')+path.sep))throw Error('Exact immutable review package required');
if(!out.startsWith(path.join(root,'artifacts')+path.sep))throw Error('Owned new evidence directory required');
await mkdir(out,{recursive:false});
const env={...process.env,DOTNET_ROOT:path.join(root,'.tools/dotnet'),DOTNET_ROOT_X64:path.join(root,'.tools/dotnet'),DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_HOME:path.join(root,'.tools/cli-home'),DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_UI_LANGUAGE:'en'};
const results=[];
async function run(name,exe,args){const startedAt=new Date().toISOString();let output='';let overflow=false;const p=spawn(exe,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const stream of[p.stdout,p.stderr])stream.on('data',b=>{if(output.length<32*1024*1024)output+=b.toString('utf8');else overflow=true;});const exit=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',resolve);});await writeFile(path.join(out,name+'.log'),output,{flag:'wx'});const result={name,command:[exe,...args],startedAt,endedAt:new Date().toISOString(),exit,overflow,log:path.relative(root,path.join(out,name+'.log')).replaceAll('\\','/')};results.push(result);console.log(JSON.stringify(result));console.log(output.slice(-7000));return{exit:overflow?1:exit,output};}
const buildArgs=['-NoProfile','-NonInteractive','-File',path.join(root,'tools/dotnet.ps1'),'build','tests/Jindan.Package.Tests/Jindan.Package.Tests.csproj','-c','Release'];
if(installation)buildArgs.push('-p:InstallationRoot='+installation,'-p:OutputPath='+path.join(out,'harness')+path.sep);
const built=await run('build','powershell.exe',buildArgs);
let code=built.exit,tests=null;
if(!code){if(installation){env.DOTNET_ROOT=path.join(installation,'.runtime');env.DOTNET_ROOT_X64=env.DOTNET_ROOT;}const args=installation?[path.join(out,'harness/Jindan.Package.Tests.dll'),'--packaged-root',installation]:['tests/Jindan.Package.Tests/bin/Release/net10.0/Jindan.Package.Tests.dll'];const r=await run('snapshot-regressions',installation?path.join(installation,'.runtime/dotnet.exe'):path.join(root,'.tools/dotnet/dotnet.exe'),args);code=r.exit;const m=r.output.match(/PACKAGE_TESTS pass=(\d+) fail=(\d+) evidence=(.+)/);if(m)tests={pass:Number(m[1]),fail:Number(m[2]),evidence:m[3].trim()};else code=1;}
await writeFile(path.join(out,'RESULT.json'),JSON.stringify({schema:'jindan-snapshot69-run/1',installation,runtimeEnvironment:{DOTNET_ROOT:env.DOTNET_ROOT,DOTNET_ROOT_X64:env.DOTNET_ROOT_X64,DOTNET_MULTILEVEL_LOOKUP:env.DOTNET_MULTILEVEL_LOOKUP},results,tests,passed:code===0,reportReady:false,supervisorAccepted:false},null,2)+'\n',{flag:'wx'});process.exitCode=code??1;
