import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { inspectMaterial, listMaterials, loadMaterial, reportLibraryDatabase,REPORT_TYPES } from './reportLibrary.js';
import {validateSpecification} from './reportSpecification.js';
import { listReferenceEntries, listReferenceProjects } from './referenceProjects.js';

export const MAX_PROJECT_BYTES = 512 * 1024 * 1024;
const MAX_EXPANDED = 768 * 1024 * 1024;
const schema = 'jindan-report-project/1';
const key = (uid, ...parts) => JSON.stringify([String(uid), ...parts]);
const metadata = material => Object.fromEntries(['id','filename','title','format','size','sha256','role','reportType','facility','templateGroup','notes','includeInPatterns','addedAt','updatedAt'].filter(name=>material[name]!==undefined).map(name=>[name,material[name]]));
function collectIds(value, ids = new Set(), depth = 0) {
    if (depth > 60) throw new Error('프로젝트 데이터의 중첩 한도를 넘습니다.');
    if (!value || typeof value !== 'object') return ids;
    for (const [name, item] of Object.entries(value)) {
        if ((/materialId$/i.test(name) || name === 'coverId') && typeof item === 'string' && item) ids.add(item);
        if (['materialIds','reportIds'].includes(name) && Array.isArray(item)) item.forEach(id=>ids.add(id));
        if (item && typeof item === 'object') collectIds(item, ids, depth+1);
    }
    return ids;
}
export async function exportProjectArchive(userId, book, projectName) {
    const ids = collectIds(book), all = await listMaterials(userId);
    if (book.pageTrial) for (const material of all) if ([book.pageTrial.model?.source?.hwpxSha256, book.pageTrial.model?.source?.pdfSha256].includes(material.sha256)) ids.add(material.id);
    const sourceIds = new Set([...(book.referenceProjectIds || []), book.electrical?.referenceProjectId].filter(Boolean));
    const projects = (await listReferenceProjects(userId)).filter(project=>sourceIds.has(project.id)), references = [];
    if (projects.length !== sourceIds.size) throw new Error('연결한 기준 보고서 폴더가 없습니다. 연결을 확인하세요.');
    for (const project of projects) for (const entry of await listReferenceEntries(userId, project.id)) { references.push({ projectId: project.id, entry }); ids.add(entry.materialId); }
    const materials = all.filter(material=>ids.has(material.id));
    if (materials.length !== ids.size || materials.length > 1000) throw new Error('프로젝트 원본이 누락됐거나 파일 개수 한도를 넘습니다.');
    let total = 0; const files = {};
    for (const material of materials) {
        const blob = await loadMaterial(userId, material.id);
        if ((total += blob.size) > MAX_EXPANDED) throw new Error('프로젝트의 전체 원본 크기가 768MB를 넘습니다.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if (hash !== material.sha256) throw new Error(`${material.filename}: 원본 해시가 변경됐습니다.`);
        files[`files/${material.id}.${material.format}`] = [bytes,{level:0}];
    }
    const manifest = { schema, createdAt:new Date().toISOString(), projectName:projectName || book.title, book, materials:materials.map(metadata), referenceProjects:projects, referenceEntries:references };
    const json = strToU8(JSON.stringify(manifest));
    if (json.length > 16 * 1024 * 1024) throw new Error('프로젝트 설정·분석 데이터가 16MB를 넘습니다.');
    files['project.json'] = json;
    const bytes = zipSync(files);
    if (bytes.length > MAX_PROJECT_BYTES) throw new Error('프로젝트 파일은 512MB 이하로 나누어 관리하세요.');
    return bytes;
}
function rejectUnsafeKeys(value, depth=0) {
    if (depth>60) throw new Error('프로젝트 설정 중첩 한도를 넘습니다.');
    if (!value || typeof value!=='object') return;
    for(const [name,item] of Object.entries(value)) {
        if(['__proto__','prototype','constructor'].includes(name)) throw new Error('안전하지 않은 프로젝트 설정입니다.');
        rejectUnsafeKeys(item,depth+1);
    }
}
export async function readProjectArchive(input) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if (!bytes.length || bytes.length>MAX_PROJECT_BYTES) throw new Error('프로젝트 파일은 0바이트보다 크고 512MB 이하여야 합니다.');
    let count=0,total=0;
    const files=unzipSync(bytes,{filter:entry=>{
        if(++count>2001 || (total+=entry.originalSize)>MAX_EXPANDED+16*1024*1024 || !(entry.name==='project.json' || /^files\/(?:reference|data|image)-[a-f0-9]{64}\.[a-z0-9]+$/.test(entry.name))) throw new Error('프로젝트 패키지의 크기 또는 경로가 올바르지 않습니다.');
        if(entry.name==='project.json'&&entry.originalSize>16*1024*1024) throw new Error('프로젝트 설정 크기 한도를 넘습니다.');
        return true;
    }});
    if(!files['project.json']) throw new Error('프로젝트 설정 파일이 없습니다.');
    const manifest=JSON.parse(strFromU8(files['project.json'])); rejectUnsafeKeys(manifest);
    if(manifest.schema!==schema || !manifest.book || !Array.isArray(manifest.book.chapters) || !manifest.book.chapters.length || manifest.book.chapters.length>500 || typeof manifest.book.title!=='string' || !Array.isArray(manifest.materials) || manifest.materials.length>1000 || !Array.isArray(manifest.referenceProjects) || !Array.isArray(manifest.referenceEntries)) throw new Error('지원하는 보고서 프로젝트 형식이 아닙니다.');
    for(const chapter of manifest.book.chapters) if(typeof chapter.id!=='string'||typeof chapter.title!=='string'||typeof chapter.text!=='string'||!['cover','contents','chapter'].includes(chapter.kind)) throw new Error('프로젝트 목차 데이터가 올바르지 않습니다.');
    for(const name of ['reportIds','materialIds','referenceProjectIds'])if(manifest.book[name]!=null&&(!Array.isArray(manifest.book[name])||manifest.book[name].some(id=>typeof id!=='string')))throw new Error('프로젝트 파일 목록이 올바르지 않습니다.');
    for(const name of ['activeReportId','coverId','header','footer','titleAlign','titlePosition','projectName'])if(manifest.book[name]!=null&&typeof manifest.book[name]!=='string')throw new Error('프로젝트 문서 설정이 올바르지 않습니다.');
    for(const name of ['applicationRuns','applicationChanges'])if(manifest.book[name]!=null&&!Array.isArray(manifest.book[name]))throw new Error('프로젝트 작업 기록이 올바르지 않습니다.');
    const ids=new Set(), restored=[];
    for(const m of manifest.materials) {
        if(!/^[a-f0-9]{64}$/.test(m.sha256)||m.id!==`${m.role}-${m.sha256}`||ids.has(m.id)||typeof m.filename!=='string'||m.filename.length>1000) throw new Error('프로젝트 원본 식별 정보가 올바르지 않습니다.');
        for(const name of ['title','facility','templateGroup','notes','addedAt','updatedAt'])if(m[name]!=null&&typeof m[name]!=='string')throw new Error('프로젝트 자료 메타데이터가 올바르지 않습니다.');
        if(m.reportType&&!Object.hasOwn(REPORT_TYPES,m.reportType))throw new Error('프로젝트 자료 종류가 올바르지 않습니다.');
        ids.add(m.id); const data=files[`files/${m.id}.${m.format}`];
        if(!data) throw new Error(`${m.filename}: 원본이 누락됐습니다.`);
        const inspected=await inspectMaterial({name:m.filename,size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)},m.role);
        if(inspected.sha256!==m.sha256||inspected.format!==m.format||data.length!==m.size) throw new Error(`${m.filename}: 원본 검증에 실패했습니다.`);
        restored.push({material:metadata(m),blob:inspected.blob});
    }
    if(Object.keys(files).length!==restored.length+1) throw new Error('프로젝트에 등록되지 않은 원본 파일이 있습니다.');
    for(const id of collectIds(manifest.book)) if(!ids.has(id)) throw new Error('프로젝트 자료 연결이 누락됐습니다.');
    for(const [id,spec] of Object.entries(manifest.book.reportSpecs||{})){if(!ids.has(id)||spec.sourceSha256!==manifest.materials.find(m=>m.id===id)?.sha256)throw new Error('보고서 서식의 원본 연결이 다릅니다.');validateSpecification(spec);}
    const projectIds=new Set(manifest.referenceProjects.map(p=>p.id));
    if(projectIds.size!==manifest.referenceProjects.length) throw new Error('중복된 기준 보고서 폴더입니다.');
    for(const ref of manifest.referenceEntries) if(!projectIds.has(ref.projectId)||!ids.has(ref.entry?.materialId)||ref.entry.sha256!==manifest.materials.find(m=>m.id===ref.entry.materialId)?.sha256||typeof ref.entry.id!=='string') throw new Error('기준 보고서 원본 연결이 올바르지 않습니다.');
    if(manifest.book.pageTrial) { const {bindPageTrial}=await import('./pageReproduction.js'); manifest.book.pageTrial=bindPageTrial(manifest.book.pageTrial.model,manifest.materials); }
    return {manifest,restored};
}
export async function importProjectArchive(userId,input,target = null) {
    const uid=String(userId); if(!uid.trim())throw new Error('로그인한 사용자 정보를 확인하세요.');
    if(target&&!/^project:[a-zA-Z0-9_.:%-]{1,160}$/.test(target.projectId))throw new Error('프로젝트 관리에 등록한 대상 프로젝트를 선택하세요.');
    const {manifest,restored}=await readProjectArchive(input), projectId=target?.projectId||`archive:${crypto.randomUUID()}`;
    const projectMap=new Map(manifest.referenceProjects.map(p=>[p.id,crypto.randomUUID()]));
    const remap=value=>typeof value==='string'?(projectMap.get(value)||value):Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)])):value;
    const book=remap(manifest.book); book.projectName=String(target?.projectName||manifest.projectName||book.title).slice(0,500);
    if(target)book.businessProjectId=projectId;
    const db=await reportLibraryDatabase(),tx=db.transaction(['materials','files','referenceProjects','referenceEntries','facilityStudios'],'readwrite');
    const complete=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('프로젝트 복원에 실패했습니다.'));});
    for(const {material,blob} of restored){const k=key(uid,material.id),store=tx.objectStore('materials'),request=store.get(k);request.onsuccess=()=>{if(!request.result)store.put({key:k,userId:uid,material});};tx.objectStore('files').put({key:k,blob});}
    for(const old of manifest.referenceProjects){const project=remap(old);project.id=projectMap.get(old.id);project.businessProjectId=projectId;tx.objectStore('referenceProjects').put({key:key(uid,project.id),userId:uid,project});}
    for(const {projectId:oldId,entry} of manifest.referenceEntries){const id=projectMap.get(oldId);tx.objectStore('referenceEntries').put({key:key(uid,id,entry.id),userId:uid,projectId:id,materialId:entry.materialId,entry});}
    const studioStore=tx.objectStore('facilityStudios');
    if(target){const old=studioStore.get(key(uid,projectId));old.onsuccess=()=>{if(old.result){const backupId=`archive:${crypto.randomUUID()}`;studioStore.put({...old.result,key:key(uid,backupId),facilityId:backupId,backupOf:projectId});}studioStore.put({key:key(uid,projectId),userId:uid,facilityId:projectId,studio:book,updatedAt:new Date().toISOString()});};}
    else studioStore.put({key:key(uid,projectId),userId:uid,facilityId:projectId,studio:book,updatedAt:new Date().toISOString()});
    await complete;return {projectId,book,materials:restored.length};
}
