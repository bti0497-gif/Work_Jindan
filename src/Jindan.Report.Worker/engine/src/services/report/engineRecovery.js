import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
import {engineBytes,engineHash,engineJson,engineClone,engineProject,requireEngine} from './engineContract.js';

export const RECOVERY_SCHEMA='jindan-engine-recovery/1';
export const RECOVERY_LIMIT=512*1024*1024;
const roles=new Set(['source','candidate','native-saved','evidence','collection','draft']);
const hashPattern=/^[a-f0-9]{64}$/;
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(id);

// This sidecar preserves exact versions. It never restores stripped metadata into
// an edited HWPX or attaches old slot offsets/reviews to a new file hash.
export async function createEngineRecovery({projectId,files,state={}}){
    engineProject(projectId);
    requireEngine(Array.isArray(files)&&files.length>0&&files.length<=1000,'INVALID_RECOVERY','Recovery requires 1..1000 explicit files.');
    const entries={},records=[],ids=new Set();let total=0;
    for(const file of files){
        requireEngine(validId(file.id)&&!ids.has(file.id)&&roles.has(file.role)&&typeof file.filename==='string'&&file.filename.length>0&&file.filename.length<=1000,'INVALID_RECOVERY','Invalid recovery file identity.');
        ids.add(file.id);const bytes=engineBytes(file.bytes),sha256=await engineHash(bytes);
        requireEngine(!file.sha256||file.sha256===sha256,'BINDING_MISMATCH','Recovery input hash differs from its declared version.');
        total+=bytes.length;requireEngine(total<=RECOVERY_LIMIT,'INVALID_RECOVERY','Recovery payload exceeds 512MB.');
        const entry=`files/${sha256}.bin`;entries[entry]=bytes;
        records.push({id:file.id,role:file.role,filename:file.filename,sha256,size:bytes.length,entry,parentIds:engineClone(file.parentIds||[])});
    }
    validateLinks(records);
    const manifest={schema:RECOVERY_SCHEMA,projectId,files:records,state:engineClone(state),recoveryMode:'project-assisted',reportReady:false};
    entries['recovery.json']=strToU8(engineJson(manifest,8*1024*1024));
    const bytes=zipSync(entries);requireEngine(bytes.length<=RECOVERY_LIMIT,'INVALID_RECOVERY','Recovery archive exceeds 512MB.');
    return {bytes,sha256:await engineHash(bytes),manifest,reportReady:false};
}
function validateLinks(records){
    const byId=new Map(records.map(f=>[f.id,f]));
    for(const record of records){
        requireEngine(Array.isArray(record.parentIds)&&record.parentIds.length<=100&&new Set(record.parentIds).size===record.parentIds.length&&record.parentIds.every(id=>byId.has(id)&&id!==record.id),'INVALID_RECOVERY','Recovery parent bindings are missing or duplicated.');
        requireEngine(record.role!=='source'||!record.parentIds.length,'INVALID_RECOVERY','An immutable source cannot be a derived file.');
        requireEngine(!['native-saved','candidate','collection','draft'].includes(record.role)||record.parentIds.length>0,'INVALID_RECOVERY','Derived files need explicit parent identities.');
    }
    const active=new Set(),done=new Set();
    const visit=id=>{requireEngine(!active.has(id),'INVALID_RECOVERY','Recovery derivation cycle.');if(done.has(id))return;active.add(id);byId.get(id).parentIds.forEach(visit);active.delete(id);done.add(id);};
    records.forEach(r=>visit(r.id));
}
export async function readEngineRecovery(input,{projectId,expectedSha256}={}){
    const bytes=engineBytes(input,RECOVERY_LIMIT),sha256=await engineHash(bytes);
    requireEngine(!expectedSha256||sha256===expectedSha256,'BINDING_MISMATCH','Recovery archive hash differs.');
    let count=0,total=0;const names=new Set();
    const entries=unzipSync(bytes,{filter:entry=>{
        requireEngine(!names.has(entry.name)&&++count<=1001&&(total+=entry.originalSize)<=RECOVERY_LIMIT+8*1024*1024&&(entry.name==='recovery.json'||/^files\/[a-f0-9]{64}\.bin$/.test(entry.name)),'INVALID_RECOVERY','Invalid recovery entry or expanded size.');
        names.add(entry.name);requireEngine(entry.name!=='recovery.json'||entry.originalSize<=8*1024*1024,'INVALID_RECOVERY','Recovery manifest is too large.');return true;
    }});
    requireEngine(entries['recovery.json'],'INVALID_RECOVERY','Recovery manifest is missing.');
    const manifest=JSON.parse(strFromU8(entries['recovery.json']));engineJson(manifest,8*1024*1024);engineProject(manifest.projectId);
    requireEngine(manifest.schema===RECOVERY_SCHEMA&&manifest.recoveryMode==='project-assisted'&&manifest.reportReady===false&&Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=1000,'INVALID_RECOVERY','Unsupported recovery manifest.');
    requireEngine(!projectId||projectId===manifest.projectId,'BINDING_MISMATCH','Recovery belongs to a different project.');
    const ids=new Set(),used=new Set(['recovery.json']),files=[];
    for(const record of manifest.files){
        requireEngine(validId(record.id)&&!ids.has(record.id)&&roles.has(record.role)&&hashPattern.test(record.sha256)&&record.entry===`files/${record.sha256}.bin`&&typeof record.filename==='string'&&record.filename.length>0&&record.filename.length<=1000,'INVALID_RECOVERY','Invalid recovery record.');ids.add(record.id);
        const data=entries[record.entry];requireEngine(data&&data.length===record.size&&data.length>0&&data.length<=160*1024*1024,'INVALID_RECOVERY','A recovery file is missing or has an invalid size.');
        requireEngine(await engineHash(data)===record.sha256,'BINDING_MISMATCH','Recovery file bytes differ from their bound version.');used.add(record.entry);
        files.push({...record,bytes:data,requiresReanalysis:record.role==='native-saved',retainedReviewAppliesToSha256:record.sha256});
    }
    validateLinks(files);requireEngine(Object.keys(entries).length===used.size,'INVALID_RECOVERY','Unregistered recovery payload.');
    return {manifest,files,sha256,state:manifest.state,recoveryMode:'project-assisted',standaloneMetadataPreserved:false,reportReady:false,warnings:['Project-assisted recovery retains exact file versions; native-saved documents require fresh analysis and review. Image/font/layout preservation is not inferred.']};
}
