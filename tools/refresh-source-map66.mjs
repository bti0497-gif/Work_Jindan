import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),file=path.join(root,'migration/source-map.json');
const map=JSON.parse(await readFile(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const entry of map.files){if(entry.origin&&hash(await readFile(entry.origin))!==entry.originSha256)throw Error('Preserved origin differs: '+entry.origin);const current=hash(await readFile(path.join(root,entry.destination)));entry.initialImportedSha256??=entry.migratedSha256;entry.migratedSha256=current;if(current!==entry.initialImportedSha256)entry.currentChange='ROADMAP66 new-tree repair/integration; initial imported and origin hashes retained. See engine repair tests and final source checkpoint.';}
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const known=new Set(map.files.map(e=>e.destination));for(const p of await walk(path.join(root,map.engineSingleSource))){const destination=path.relative(root,p).replaceAll('\\','/');if(!known.has(destination))map.files.push({origin:null,originSha256:null,destination,migratedSha256:hash(await readFile(p)),initialImportedSha256:null,category:'new-engine-boundary',transformation:'Authored in isolated ROADMAP66 repair; not copied from old workspace.'});}
map.refreshedAt=new Date().toISOString();map.reportReady=false;map.supervisorAccepted=false;
await writeFile(file+'.tmp',JSON.stringify(map,null,2)+'\n');const {rename}=await import('node:fs/promises');await rename(file+'.tmp',file);
console.log(JSON.stringify({pass:1,fail:0,files:map.files.length,sourceMapSha256:hash(await readFile(file)),originsVerified:true}));
