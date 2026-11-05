import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [reviewArg,outArg]=process.argv.slice(2);
if(!reviewArg||!outArg)throw Error('Usage: node tools/verify-review66.mjs review-root fresh-result.json');
const review=path.resolve(reviewArg),out=path.resolve(outArg);
const owned=p=>p.startsWith(path.join(root,'artifacts')+path.sep);
if(!owned(review)||!owned(out)||out.startsWith(review+path.sep))throw Error('Use an owned review directory and a separate fresh result.');
async function noLinks(p){for(let q=p;;q=path.dirname(q)){if((await lstat(q)).isSymbolicLink())throw Error('Linked path rejected');if(q===root)break;if(path.dirname(q)===q)throw Error('Path left owned root');}}
await noLinks(review);
const hash=async p=>{const h=createHash('sha256');for await(const bytes of createReadStream(p))h.update(bytes);return h.digest('hex');};
async function json(p){return JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));}
function entryPath(base,name){if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').some(v=>!v||v==='.'||v==='..'))throw Error('Unsafe manifest path');return path.join(base,...name.split('/'));}
const startedAt=new Date().toISOString();
const manifest=await json(path.join(review,'artifact-manifest.json'));
const source=await json(path.join(review,'source-checkpoint.json'));
if(!manifest.sourceStable||manifest.reportReady!==false||manifest.supervisorAccepted!==false)throw Error('Review source/approval gate mismatch');
if(await hash(path.join(review,'source-checkpoint.json'))!==manifest.sourceCheckpointSha256)throw Error('Source checkpoint binding mismatch');
let artifactBytes=0,sourceBytes=0;const names=new Set();
for(const f of manifest.files){const key=f.path.toLowerCase();if(names.has(key))throw Error('Duplicate artifact path');names.add(key);const p=entryPath(review,f.path);await noLinks(p);const stat=await lstat(p);if(!stat.isFile()||stat.size!==f.size||await hash(p)!==f.sha256)throw Error('Artifact differs: '+f.path);artifactBytes+=stat.size;}
const sourceNames=new Set();
for(const f of source.files){const key=f.path.toLowerCase();if(sourceNames.has(key))throw Error('Duplicate source path');sourceNames.add(key);const p=entryPath(root,f.path);await noLinks(p);const stat=await lstat(p);if(!stat.isFile()||stat.size!==f.size||await hash(p)!==f.sha256)throw Error('Product source differs: '+f.path);sourceBytes+=stat.size;}
const result={schema:'jindan-readonly-review-verification66/1',startedAt,endedAt:new Date().toISOString(),pass:1,fail:0,review,artifactFiles:manifest.files.length,artifactBytes,sourceInputs:source.files.length,sourceBytes,artifactManifestSha256:await hash(path.join(review,'artifact-manifest.json')),sourceCheckpointSha256:await hash(path.join(review,'source-checkpoint.json')),hostSha256:await hash(path.join(review,'application/Jindan.Desktop.dll')),scope:'Rehash every declared immutable artifact and current product input after GUI/patch tests. Does not assert that every generated log or mutable workspace is an immutable payload.',reportReady:false,supervisorAccepted:false};
await mkdir(path.dirname(out),{recursive:true});await noLinks(path.dirname(out));await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
