import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let argv=process.argv.slice(2),visible=false;if(argv[0]==='--visible'){visible=true;argv.shift();}
const [label,outArg,exe,...args]=argv,out=path.resolve(root,outArg||''),prefix=path.join(root,'artifacts')+path.sep;
if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(label||'')||!out.startsWith(prefix)||out.startsWith(path.join(root,'artifacts/ready-for-review')+path.sep)||!exe)throw Error('Expected label, fresh owned artifacts prefix, executable and exact arguments.');
for(const ext of ['.COMMAND.json','.stdout.log','.stderr.log'])if(fs.existsSync(out+ext))throw Error('Evidence prefix already used.');
for(let a=path.dirname(out);a&&a!==path.dirname(a);a=path.dirname(a))if(fs.existsSync(a)&&fs.lstatSync(a).isSymbolicLink())throw Error('Linked evidence ancestor.');
fs.mkdirSync(path.dirname(out),{recursive:true});const startedAt=new Date().toISOString();
const runtime=path.basename(exe).toLowerCase()==='dotnet.exe'?path.dirname(exe):path.join(root,'.tools/dotnet');
const child=spawn(exe,args,{cwd:root,windowsHide:!visible,shell:false,env:{...process.env,DOTNET_ROOT:runtime,DOTNET_ROOT_X64:runtime,DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_HOME:path.join(root,'.tools/cli-home'),DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_NOLOGO:'1'},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='',overflow=false;for(const [name,stream]of [['stdout',child.stdout],['stderr',child.stderr]])stream.on('data',b=>{if((name==='stdout'?stdout:stderr).length+b.length>16*1024*1024){overflow=true;return;}if(name==='stdout')stdout+=b.toString('utf8');else stderr+=b.toString('utf8');});
let error=null;const exit=await new Promise(resolve=>{child.once('error',e=>{error=e.code||'LAUNCH_FAILED';resolve(null);});child.once('close',resolve);});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [ext,value]of [['.stdout.log',stdout],['.stderr.log',stderr]])fs.writeFileSync(out+ext,value,{flag:'wx'});
const receipt={schema:'jindan-exact-gate70/1',label,command:[exe,...args],launchOptions:{windowsHide:!visible,shell:false},startedAt,endedAt:new Date().toISOString(),ownedPid:child.pid,exit,error,overflow,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),executableSha256:fs.existsSync(exe)?hash(fs.readFileSync(exe)):null,reportReady:false,supervisorAccepted:false};
fs.writeFileSync(out+'.COMMAND.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));console.log(stdout.slice(-2500));if(stderr)console.log(stderr.slice(-1500));process.exitCode=exit===0&&!overflow?0:1;
