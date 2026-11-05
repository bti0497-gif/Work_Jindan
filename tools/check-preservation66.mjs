import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=JSON.parse((await readFile(path.join(root,'migration/baseline66.json'),'utf8')).replace(/^\uFEFF/,''));
const hash=async p=>{const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');};
const problems=[];let checked=0;
for(const f of baseline.files){try{const p=path.join(baseline.root,f.path);if(await hash(p)!==f.sha256||(await stat(p)).size!==f.bytes)problems.push({id:f.path,kind:'legacy-baseline-mismatch'});checked++;}catch{problems.push({id:f.path,kind:'legacy-baseline-unavailable'});}}
const git=async args=>(await promisify(execFile)('git',['--no-optional-locks','-C',baseline.root,...args],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024})).stdout.trimEnd();
const head=await git(['rev-parse','HEAD']),gitStatus=await git(['status','--porcelain=v1','--untracked-files=all']);
if(head!==baseline.head)problems.push({kind:'legacy-head-mismatch'});
if(gitStatus!==baseline.gitStatus.trimEnd())problems.push({kind:'legacy-dirty-status-mismatch'});
// Read only path metadata; never copy report contents or these private paths.
const seonam=JSON.parse((await readFile('F:/jindan/.firebase/onepage-source-paths.json','utf8')).replace(/^\uFEFF/,''));
const daecheong=JSON.parse((await readFile('F:/jindan/.firebase/daecheong-reproduction-source.json','utf8')).replace(/^\uFEFF/,''));
const originals=[['seonam-pdf',seonam.pdf,'d12201c4a424afef500aee4cc182bea7604c2c98964b0d9bcfb9d3096e9f9346'],['seonam-hwpx',seonam.hwpx,'da88560943552884e44864182d5f8abcea03e287586d41b407906ca70aa8898e'],['daecheong-pdf',daecheong.pdf,'521e5659e143c9bc45d04c6b2cdf9d5cae2fbbd711663ce75ee81b556527ab01']];
const originalChecks=[];for(const[id,p,expected]of originals){try{const actual=await hash(p);originalChecks.push({id,expected,actual,size:(await stat(p)).size,ok:actual===expected});if(actual!==expected)problems.push({id,kind:'original-sha-mismatch'});}catch{problems.push({id,kind:'original-unavailable'});}}
const oldZip='F:/jindan/output/supervision/20261103-report-studio/implementation-native-open/local-handoff63-01/jindan-local-engine-handoff63.zip';
const oldZipExpected='b83e94b8575d34d80c1846837e599e15cc11b3e0a0dcb3519bb6b926dc63877b';
const oldZipActual=await hash(oldZip);if(oldZipActual!==oldZipExpected)problems.push({kind:'frozen63-zip-mismatch'});
const result={schema:'jindan-preservation66/1',checkedAt:new Date().toISOString(),legacyFileCount:checked,headMatches:head===baseline.head,dirtyStatusMatches:gitStatus===baseline.gitStatus.trimEnd(),originalChecks,frozen63Zip:{expected:oldZipExpected,actual:oldZipActual,ok:oldZipActual===oldZipExpected},problems,ok:problems.length===0,scope:'Tracked/nonignored untracked baseline files, git head/status, three originals, frozen63 ZIP. Not a claim that every ignored output was inventoried.',reportReady:false,supervisorAccepted:false};
await mkdir(path.join(root,'artifacts/preservation66'),{recursive:true});const out=path.join(root,'artifacts/preservation66/RESULT.json');await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:result.ok,checked,problems:problems.length,result:'artifacts/preservation66/RESULT.json'}));if(!result.ok)process.exitCode=1;
