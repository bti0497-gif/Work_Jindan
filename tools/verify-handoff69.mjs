import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),p=path.join(root,'handoff/FILES69.json');
const m=JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(m.reportReady!==false||m.supervisorAccepted!==false)throw Error('Approval flags changed');
const names=new Set();for(const f of m.files){if(!/^(artifacts|handoff)\//.test(f.path)||f.path.includes('\\')||f.path.includes(':')||f.path.split('/').some(x=>!x||x==='.'||x==='..')||names.has(f.path.toLowerCase()))throw Error('Unsafe/duplicate evidence path');names.add(f.path.toLowerCase());const full=path.join(root,f.path);if(fs.statSync(full).size!==f.size||hash(full)!==f.sha256)throw Error('Handoff changed: '+f.path);}
if(crypto.createHash('sha256').update(JSON.stringify(m.files)).digest('hex')!==m.aggregateSha256)throw Error('Aggregate changed');console.log(JSON.stringify({pass:1,fail:0,files:m.files.length,sha256:hash(p),scope:m.scope,reportReady:false,supervisorAccepted:false}));
