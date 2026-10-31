import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, FileImage, FileText, Files, ImagePlus, LayoutTemplate, ListTree, LoaderCircle, MoreHorizontal, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { ACCEPT_MATERIALS, MATERIAL_ROLES, REPORT_TYPES, addMaterial, listMaterials, loadMaterial, loadStudio, materialSize, removeMaterial, reorderChapterTitles, saveStudio, updateMaterial } from '../services/report/reportLibrary.js';
import './ReportStudio.css';
import { ReferenceProjectSidebar, ReferenceProjectView } from './ReportReferenceProjects.jsx';
import { PageTrialInspector, PageTrialView } from './ReportPageTrial.jsx';
import { bindPageTrial } from '../services/report/pageReproduction.js';
import PowerViewPreview from './PowerViewPreview.jsx';
import ElectricalReportPreparation from './ElectricalReportPreparation.jsx';
import ThermalBmtPreview from './ThermalBmtPreview.jsx';
import {dbService} from '../services/dbService.js';
import {listReferenceEntries,listReferenceProjects} from '../services/report/referenceProjects.js';
import {studioMaterialIds,studioProjectOptions} from '../services/report/studioProjects.js';
import {MAX_PROJECT_BYTES,exportProjectArchive,importProjectArchive} from '../services/report/projectArchive.js';
import {specificationFromProfile} from '../services/report/reportSpecification.js';
import ReportSpecification from './ReportSpecification.jsx';
import ReportDocumentView from './ReportDocumentView.jsx';
import ReportDataApplication from './ReportDataApplication.jsx';
import PdfReportWorkbench from './PdfReportWorkbench.jsx';
import {pdfAuthoringPlan} from '../services/report/pdfHwpxWriter.js';
import ReportDrivePicker from './ReportDrivePicker.jsx';

function studioWorker(message) {
    return new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('../services/report/report.worker.js',import.meta.url),{type:'module'});
        const timer=setTimeout(()=>{worker.terminate();reject(new Error('문서 작업 시간이 초과되었습니다.'));},120000);
        worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(new Error(data.error)):resolve(data);};
        worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('문서 작업을 실행하지 못했습니다.'));};
        worker.postMessage(message,message.bytes?[message.bytes]:[]);
    });
}

function download(blob, filename) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function MaterialPreview({ userId, material, onClose }) {
    const [preview, setPreview] = useState({ loading: true });
    const dialog = useRef(null), close = useRef(null);
    useEffect(() => {
        const previous = document.activeElement; close.current?.focus();
        const keyboard = event => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Tab') {
                const nodes = [...dialog.current.querySelectorAll('button,iframe,[tabindex="0"]')];
                const edge = event.shiftKey ? nodes[0] : nodes.at(-1);
                if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? nodes.at(-1) : nodes[0])?.focus(); }
            }
        };
        document.addEventListener('keydown', keyboard);
        return () => { document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
    }, [onClose]);
    useEffect(() => {
        let cancelled = false, url, worker;
        loadMaterial(userId, material.id).then(async blob => {
            if (cancelled) return;
            if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(material.format)) {
                url = URL.createObjectURL(blob); setPreview({ url });
            } else if (['hwp', 'hwpx', 'pwv', 'bmt'].includes(material.format)) {
                worker = new Worker(new URL('../services/report/report.worker.js', import.meta.url), { type: 'module' });
                worker.onmessage = ({ data }) => { if (!cancelled) setPreview(data.error ? { error: data.error } : data.thermal ? { thermal: data.thermal } : data.powerView ? { powerView: data.powerView } : { document: data.document }); worker.terminate(); };
                worker.onerror = () => { if (!cancelled) setPreview({ error: '문서 구조를 읽지 못했습니다. 원본 파일로 확인하세요.' }); worker.terminate(); };
                const bytes = await blob.arrayBuffer();
                const action = { pwv: 'inspect-powerview', bmt: 'inspect-thermal-bmt' }[material.format];
                if (!cancelled) worker.postMessage({ bytes, filename: material.filename, ...(action ? { action } : {}) }, [bytes]);
            } else if (material.format === 'csv') {
                const bytes = await blob.slice(0, 100000).arrayBuffer();
                let text;
                try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('euc-kr').decode(bytes); }
                if (!cancelled) setPreview({ text });
            } else setPreview({ unsupported: true });
        }).catch(error => { if (!cancelled) setPreview({ error: error.message }); });
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); worker?.terminate(); };
    }, [userId, material.id, material.format, material.filename]);
    return <div className="studio-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <section ref={dialog} className="studio-preview" role="dialog" aria-modal="true" aria-labelledby="studio-preview-title">
            <header><div><small>원본 자료 확인</small><h2 id="studio-preview-title">{material.filename}</h2></div><button ref={close} className="studio-icon" title="미리보기 닫기" aria-label="미리보기 닫기" onClick={onClose}><X size={20} /></button></header>
            <div className="studio-preview-body">
                {preview.loading && <p className="studio-center"><LoaderCircle className="studio-spin" size={24} />문서를 여는 중입니다.</p>}
                {preview.error && <p role="alert" className="studio-error">{preview.error}</p>}
                {preview.url && (material.format === 'pdf' ? <iframe src={preview.url} title={`${material.filename} PDF 미리보기`} /> : <img src={preview.url} alt={material.title} />)}
                {preview.text && <pre>{preview.text}</pre>}
                {preview.unsupported && <p className="studio-center">이 자료는 원본을 내려받아 확인하세요.</p>}
                {preview.powerView && <PowerViewPreview inspection={preview.powerView} />}
                {preview.thermal && <ThermalBmtPreview inspection={preview.thermal} />}
                {preview.document && <article className="studio-structure"><p className="studio-note">문단·표의 앞부분을 표시하는 구조 미리보기입니다. 전체 내용과 원본의 쪽 배치는 내려받은 한글 파일에서 확인하세요.</p>
                    {preview.document.paragraphs.filter(p => !p.tableId && p.text).slice(0, 80).map(p => <p key={p.id}>{p.text}</p>)}
                    {preview.document.tables.slice(0, 5).map(table => <section key={table.id}><h3>{table.title}</h3><table><tbody>{Array.from({ length: Math.min(table.rows, 25) }, (_, row) => <tr key={row}>{table.cells.filter(cell => cell.row === row).map(cell => <td key={cell.id} colSpan={cell.colSpan} rowSpan={cell.rowSpan}>{cell.text}</td>)}</tr>)}</tbody></table></section>)}
                </article>}
            </div>
        </section>
    </div>;
}

function Studio({ userId, facilityId, projectName, projectOptions, onFacilityChange, onProjectImported, onRefreshProjects, onExit, showConfirm, showPrompt }) {
    const [book, setBook] = useState(null), latestBook = useRef(null);
    const [allMaterials, setMaterials] = useState([]), [pane, setPane] = useState(facilityId ? 'electrical' : 'library');
    const [folderMaterialIds,setFolderMaterialIds]=useState([]);
    const ownedMaterialIds=studioMaterialIds(book);
    folderMaterialIds.forEach(id=>ownedMaterialIds.add(id));
    const materialScopeKey=JSON.stringify([...ownedMaterialIds].sort());
    const materials=useMemo(()=>{const ids=new Set(JSON.parse(materialScopeKey));return allMaterials.filter(item=>ids.has(item.id));},[allMaterials,materialScopeKey]);
    const [role, setRole] = useState('reference'), [selectedId, setSelectedId] = useState('');
    const [chapterId, setChapterId] = useState(''), [search, setSearch] = useState('');
    const [working, setWorking] = useState(null), [notice, setNotice] = useState(''), [errors, setErrors] = useState([]);
    const [saveStatus, setSaveStatus] = useState('불러오는 중'), [dragging, setDragging] = useState(false);
    const [previewId, setPreviewId] = useState(''), [cover, setCover] = useState(null);
    const [previewSource, setPreviewSource] = useState(null), [referenceProjectId, setReferenceProjectId] = useState(''), [referencePartId, setReferencePartId] = useState('');
    const [referenceVersion, setReferenceVersion] = useState(0);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [trialSelectedId, setTrialSelectedId] = useState('');
    const trialPicker = useRef(null);
    const reportPicker=useRef(null),archivePicker=useRef(null);
    const [drivePickerOpen,setDrivePickerOpen]=useState(false);
    const [pdfInspector,setPdfInspector]=useState(null);
    const [reportState,setReportState]=useState(null),[applicationTarget,setApplicationTarget]=useState(null),[applicationJob,setApplicationJob]=useState(null);
    const picker = useRef(null), imagePicker = useRef(null), mounted = useRef(true), saving = useRef(0), importing = useRef(false);
    useEffect(() => {
        mounted.current = true;
        Promise.all([loadStudio(userId, facilityId, projectName), listMaterials(userId)]).then(([savedBook, records]) => {
            if (!mounted.current) return;
            latestBook.current = savedBook; setBook(savedBook); setChapterId(savedBook.chapters[0]?.id || ''); setMaterials(records); setSaveStatus('이 PC에 저장');
            if(facilityId&&savedBook.activeReportId)setPane('report');
        }).catch(error => { if (mounted.current) { setErrors([error.message]); setSaveStatus('저장소 연결 실패'); } });
        return () => { mounted.current = false; };
    }, [userId, facilityId]);
    useEffect(()=>{
        let cancelled=false;
        listReferenceProjects(userId).then(async projects=>{
            const owned=projects.filter(project=>(project.businessProjectId||'')===facilityId);
            const entries=await Promise.all(owned.map(project=>listReferenceEntries(userId,project.id)));
            if(!cancelled)setFolderMaterialIds(entries.flat().map(entry=>entry.materialId));
        }).catch(reason=>{if(!cancelled)setErrors([reason.message]);});
        return()=>{cancelled=true;};
    },[userId,facilityId,referenceVersion]);
    useEffect(()=>{
        let cancelled=false,url;
        const id=facilityId&&book?.activeReportId;if(!id){setReportState(null);return;}
        const material=materials.find(item=>item.id===id);if(!material)return;
        setReportState({id,material,loading:true});setApplicationTarget(null);setApplicationJob(null);
        loadMaterial(userId,id).then(async blob=>{
            if(cancelled)return;
            if(material.format==='pdf'){url=URL.createObjectURL(blob);setReportState({id,material,url});return;}
            const bytes=await blob.arrayBuffer(),data=await studioWorker({action:'inspect-studio-report',bytes,filename:material.filename});
            if(!cancelled)setReportState({id,material,...data});
        }).catch(reason=>{if(!cancelled)setReportState({id,material,error:reason.message});});
        return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
    },[userId,book?.activeReportId,materials]);
    useEffect(() => {
        let cancelled = false, url;
        if (!book?.coverId) return;
        loadMaterial(userId, book.coverId).then(blob => {
            if (!cancelled) { url = URL.createObjectURL(blob); setCover({ id: book.coverId, url }); }
        }).catch(() => { if (!cancelled) setErrors(['표지 이미지를 다시 선택하세요.']); });
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    }, [userId, book?.coverId]);
    const changeBook = updater => {
        const updated = typeof updater === 'function' ? updater(latestBook.current) : updater;
        const next = facilityId ? {...updated,businessProjectId:facilityId,projectName} : updated;
        latestBook.current = next; setBook(next); setSaveStatus('저장 중');
        const revision = ++saving.current;
        saveStudio(userId, next, facilityId).then(() => { if (mounted.current && revision === saving.current) setSaveStatus('이 PC에 저장'); })
            .catch(error => { if (mounted.current && revision === saving.current) { setErrors([error.message]); setSaveStatus('저장 실패'); } });
    };
    const act = async callback => { try { await callback(); } catch (error) { if (mounted.current) setErrors([error.message]); } };
    const upload = async (input, targetRole = role) => {
        const files = Array.from(input || []);
        if (!files.length || importing.current) return;
        if (files.length > 50) { setErrors(['한 번에 최대 50개까지 등록할 수 있습니다. 나누어 추가하세요.']); return; }
        importing.current = true; setErrors([]); setNotice('');
        let added = 0, duplicates = 0, lastAdded, firstImage; const failed = [], addedIds=[];
        try {
            for (let index = 0; index < files.length; index++) {
                if (mounted.current) setWorking({ index, total: files.length, name: files[index].name });
                try {
                    const output = await addMaterial(userId, files[index], targetRole);
                    if (output.duplicate) duplicates++; else added++;
                    lastAdded = output.material; if (!firstImage && targetRole === 'image') firstImage = output.material;
                    addedIds.push(output.material.id);
                } catch (error) { failed.push(`${files[index].name}: ${error.message}`); }
            }
            const records = await listMaterials(userId);
            if (!mounted.current) return;
            setMaterials(records); setRole(targetRole); setPane('library');
            changeBook(current=>({...current,materialIds:[...new Set([...(current.materialIds||[]),...addedIds])]}));
            if (lastAdded) setSelectedId(lastAdded.id);
            if (firstImage) { changeBook(current => ({ ...current, coverId: firstImage.id })); setPane('document'); setChapterId(latestBook.current.chapters.find(chapter => chapter.kind === 'cover')?.id || ''); }
            setNotice(`${added}개 등록${duplicates ? ` · 같은 파일 ${duplicates}개 제외` : ''}`); setErrors(failed);
        } catch (error) { if (mounted.current) setErrors([...failed, error.message]); }
        finally { importing.current = false; if (mounted.current) setWorking(null); }
    };
    const update = (material, patch) => act(async () => {
        const saved = await updateMaterial(userId, material.id, patch);
        if (mounted.current) setMaterials(items => items.map(item => item.id === saved.id ? saved : item));
    });
    const remove = material => act(async () => {
        if(facilityId){
            if(folderMaterialIds.includes(material.id))throw new Error('이 자료는 프로젝트 보고서 폴더의 원본입니다. 폴더 연결에서 관리하세요.');
            if(studioMaterialIds({applicationChanges:book.applicationChanges,applicationRuns:book.applicationRuns,pageTrial:book.pageTrial,electrical:book.electrical}).has(material.id))throw new Error('측정 항목이나 적용 작업의 근거로 사용 중인 자료입니다. 원본을 유지합니다.');
            if(!await showConfirm(`'${material.filename}'을 이 프로젝트의 자료 목록에서 해제할까요? 보관한 원본은 유지합니다.`,'프로젝트 자료 연결 해제'))return;
            changeBook(current=>{const specs={...current.reportSpecs};delete specs[material.id];return {...current,reportSpecs:specs,materialIds:(current.materialIds||[]).filter(id=>id!==material.id),reportIds:(current.reportIds||[]).filter(id=>id!==material.id),activeReportId:current.activeReportId===material.id?'':current.activeReportId,coverId:current.coverId===material.id?'':current.coverId};});
            setSelectedId('');setNotice('이 프로젝트의 자료 연결을 해제했습니다. 보관한 원본은 유지됩니다.');return;
        }
        if (!await showConfirm(`'${material.filename}'을 스튜디오 자료에서 삭제할까요? 원래 파일은 그대로 유지됩니다.`, '자료 삭제')) return;
        await removeMaterial(userId, material.id);
        if (!mounted.current) return;
        setMaterials(items => items.filter(item => item.id !== material.id)); setSelectedId('');
        changeBook(current=>({...current,materialIds:(current.materialIds||[]).filter(id=>id!==material.id),reportIds:(current.reportIds||[]).filter(id=>id!==material.id),activeReportId:current.activeReportId===material.id?'':current.activeReportId}));
        if (latestBook.current.coverId === material.id) { changeBook(current => ({ ...current, coverId: '' })); setCover(null); }
        setNotice('스튜디오에 보관한 자료를 삭제했습니다.');
    });
    const addChapter = () => act(async () => {
        const name = await showPrompt('새 장의 제목을 입력하세요.', `제${book.chapters.filter(item => item.kind === 'chapter').length + 1}장`, '장 추가');
        if (!name?.trim() || !mounted.current) return;
        const chapter = { id: crypto.randomUUID(), kind: 'chapter', title: name.trim().slice(0, 300), text: '' };
        changeBook(current => ({ ...current, chapters: [...current.chapters, chapter] })); setChapterId(chapter.id); setPane('document');
    });
    const moveChapter = (id, direction) => changeBook(current => {
        const chapters = [...current.chapters], from = chapters.findIndex(chapter => chapter.id === id), to = from + direction;
        if (from < 2 || to < 2 || to >= chapters.length) return current;
        [chapters[from], chapters[to]] = [chapters[to], chapters[from]];
        return { ...current, chapters: reorderChapterTitles(chapters) };
    });
    const deleteChapter = chapter => act(async () => {
        if (!await showConfirm(`'${chapter.title}'과 작성한 본문을 삭제할까요?`, '장 삭제') || !mounted.current) return;
        changeBook(current => ({ ...current, chapters: reorderChapterTitles(current.chapters.filter(item => item.id !== chapter.id)) }));
        setChapterId(latestBook.current.chapters[0]?.id || '');
    });
    const chapter = book?.chapters.find(item => item.id === chapterId) || book?.chapters[0];
    const selected = materials.find(item => item.id === selectedId);
    const previewMaterial = previewSource || materials.find(item => item.id === previewId);
    const visible = materials.filter(item => item.role === role && `${item.filename} ${item.title} ${item.facility} ${item.templateGroup}`.toLowerCase().includes(search.trim().toLowerCase()));
    const chapterChange = patch => changeBook(current => ({ ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, ...patch } : item) }));
    const closePreview = useRef(() => { setPreviewId(''); setPreviewSource(null); }).current;
    const importTrial = async file => act(async () => {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) throw new Error('재현 페이지는 2MB 이하의 JSON 파일로 선택하세요.');
        const trial = bindPageTrial(JSON.parse(await file.text()), materials);
        if (!mounted.current) return;
        changeBook(current => ({ ...current, pageTrial: trial }));
        setTrialSelectedId(trial.model.objects.find(o => o.type === 'text')?.id || ''); setPane('reproduction');
        setNotice('재현 페이지를 불러왔습니다. 글자·도형을 선택해 수정할 수 있습니다.');
    });
    const selectReferenceProject = (id, part = '') => { setReferenceProjectId(id); setReferencePartId(part); setPane('reference'); };
    const referenceImported = async ({ project, duplicate }) => {
        const records = await listMaterials(userId);
        if (!mounted.current) return;
        setMaterials(records); setReferenceVersion(value => value + 1);
        const entries=await listReferenceEntries(userId,project.id);
        if(mounted.current)changeBook(current=>({...current,referenceProjectIds:[...new Set([...(current.referenceProjectIds||[]),project.id])],...(facilityId?{reportIds:[...new Set([...(current.reportIds||[]),...entries.map(entry=>entry.materialId)])]}:{})}));
        setNotice(duplicate ? '같은 폴더 원본이 이미 등록되어 있어 기존 프로젝트를 열었습니다.' : `${project.name}: HWPX ${project.hwpxCount}개 · PDF ${project.pdfCount}개 등록${project.errors.length ? ` · 실패 ${project.errors.length}개 확인 필요` : ''}`);
    };
    const chooseReport=id=>{changeBook(current=>({...current,activeReportId:id}));setPane('report');setInspectorOpen(true);};
    const importReports=async (fileList,driveOrigins=[],referenceDriveFolder)=>{
        const files=Array.from(fileList||[]);if(!files.length||working)return;
        if(!facilityId){setErrors(['프로젝트 관리에 등록한 프로젝트를 먼저 선택하세요.']);return;}
        setErrors([]);setWorking({index:0,total:files.length,name:'기존 보고서 등록'});
        const ids=[],failed=[],driveReports=[];
        try{if(files.length>50)throw new Error('보고서는 한 번에 50개 이하로 선택하세요.');for(const [index,file] of files.entries()){setWorking({index,total:files.length,name:file.name});try{const {material}=await addMaterial(userId,file,'reference');ids.push(material.id);if(driveOrigins[index])driveReports.push({...driveOrigins[index],materialId:material.id,sha256:material.sha256,importedAt:new Date().toISOString()});}catch(reason){failed.push(`${file.name}: ${reason.message}`);}}
            const records=await listMaterials(userId);if(!mounted.current)return;setMaterials(records);changeBook(current=>({...current,reportIds:[...new Set([...(current.reportIds||[]),...ids])],activeReportId:ids[0]||current.activeReportId,...(driveReports.length?{driveReports:[...(current.driveReports||[]),...driveReports],referenceDriveFolder}:{} )}));setPane('report');setInspectorOpen(true);setErrors(failed);
        }catch(reason){setErrors([reason.message]);}finally{if(mounted.current)setWorking(null);}
    };
    const saveProject=()=>act(async()=>{setWorking({index:0,total:1,name:'프로젝트 원본 묶는 중'});try{const bytes=await exportProjectArchive(userId,latestBook.current,projectName||book.title);download(new Blob([bytes],{type:'application/octet-stream'}),`${(projectName||book.title).replace(/[\\/:*?"<>|]/g,'_')}.jindanproj`);setNotice('보고서·측정 원본·설정·작업 기록을 프로젝트 파일로 저장했습니다.');}finally{setWorking(null);}});
    const openProject=file=>act(async()=>{if(!file)return;if(!facilityId)throw new Error('가져올 대상 프로젝트를 먼저 선택하세요.');if(file.size>MAX_PROJECT_BYTES)throw new Error('프로젝트 파일은 512MB 이하여야 합니다.');if(studioMaterialIds(book).size&&!await showConfirm(`'${projectName}'의 보고서 작업을 '${file.name}' 내용으로 복원할까요? 현재 작업은 이 PC에 백업하고 원본 파일은 유지합니다.`,'프로젝트 보고서 복원'))return;setWorking({index:0,total:1,name:'프로젝트 파일 검증 중'});try{await importProjectArchive(userId,await file.arrayBuffer(),{projectId:facilityId,projectName});onProjectImported(facilityId);}finally{if(mounted.current)setWorking(null);}});
    const projectInputMaterials=Object.values(book?.electrical?.inputs||{}).flat().flatMap(link=>{const m=materials.find(item=>item.id===link.materialId&&item.sha256===link.sha256);return m?[m]:[];}).filter((m,i,all)=>all.findIndex(item=>item.id===m.id)===i);
    const startApplication=()=>act(async()=>{
        setWorking({index:0,total:projectInputMaterials.length,name:'측정자료 추출 중'});const results=[];
        try{for(const [index,material] of projectInputMaterials.entries()){
            setWorking({index,total:projectInputMaterials.length,name:material.filename});const record={materialId:material.id,sha256:material.sha256,filename:material.filename,kind:'원본 이미지·문서 보관'};
            try{const action={pwv:'inspect-powerview',bmt:'inspect-thermal-bmt',xlsx:'read-input-tables',csv:'read-input-tables'}[material.format];if(action){const bytes=await(await loadMaterial(userId,material.id)).arrayBuffer(),data=await studioWorker({action,bytes,filename:material.filename});if(data.thermal)delete data.thermal.images;Object.assign(record,data,{kind:data.tables?'표 수치':data.powerView?'전력품질 원시값':'열화상 설정·원시 배열'});}}catch(reason){record.error=reason.message;}results.push(record);
        }const job={createdAt:new Date().toISOString(),sourceMaterialId:reportState.id,sourceSha256:reportState.document.source.sha256,results,status:'review-pending'};setApplicationJob(job);changeBook(current=>({...current,applicationRuns:[...(current.applicationRuns||[]).slice(-9),{...job,results:results.map(({tables,powerView,thermal,...summary})=>summary)}]}));}finally{setWorking(null);}
    });
    const applyText=(value,evidence)=>act(async()=>{
        if(!reportState?.document||!applicationJob||applicationJob.sourceSha256!==reportState.document.source.sha256)throw new Error('선택 보고서에서 데이터 적용 작업을 다시 시작하세요.');
        setWorking({index:0,total:1,name:'HWPX 적용 후보 만드는 중'});
        try{const material=reportState.material,bytes=await(await loadMaterial(userId,material.id)).arrayBuffer();const {candidate}=await studioWorker({action:'write-studio-replacement',bytes,filename:material.filename,sourceSha256:reportState.document.source.sha256,target:applicationTarget,value});
            const filename=`${material.filename.replace(/\.[^.]+$/,'')}-작성후보.hwpx`,{material:output}=await addMaterial(userId,new File([candidate.bytes],filename),'data');
            setMaterials(await listMaterials(userId));changeBook(current=>({...current,reportIds:[...new Set([...(current.reportIds||[]),output.id])],activeReportId:output.id,reportSpecs:current.reportSpecs?.[material.id]?{...current.reportSpecs,[output.id]:{...current.reportSpecs[material.id],sourceSha256:output.sha256}}:current.reportSpecs,applicationChanges:[...(current.applicationChanges||[]),{sourceMaterialId:material.id,candidateMaterialId:output.id,evidence,...candidate.review,createdAt:new Date().toISOString()}]}));setNotice('선택 위치를 교체한 HWPX 후보를 만들었습니다. 원본과 쪽 배치·미교체 항목을 검토하세요.');
        }finally{setWorking(null);}
    });
    const generatePdfNative=async(mode,settings,pictures,{signal}={})=>{
        const source=reportState.material,analysis=latestBook.current.pdfAnalyses?.[source.id];
        const plan=pdfAuthoringPlan(analysis,settings,facilityId,mode);
        const {candidate}=await studioWorker({action:'write-pdf-hwpx',plan,options:{pictures,spec:settings.outputSpec||{}}});
        if(!mounted.current||signal?.aborted)return;
        const filename=`${source.filename.replace(/\.pdf$/i,'')}-${mode==='draft'?'금회전기양식':'전기원문재구성'}.hwpx`;
        const {material}=await addMaterial(userId,new File([candidate.bytes],filename),'data');
        if(!mounted.current||signal?.aborted)return;
        setMaterials(await listMaterials(userId));
        changeBook(current=>({...current,reportIds:[...new Set([...(current.reportIds||[]),material.id])],activeReportId:material.id,pdfAuthoring:{...current.pdfAuthoring,[source.id]:settings},pdfWritingRuns:[...(current.pdfWritingRuns||[]),{sourceMaterialId:source.id,candidateMaterialId:material.id,...candidate.review,createdAt:new Date().toISOString()}]}));
        setNotice(`${mode==='draft'?'금회 전기 작성 양식':'전회 원문 재구성 참고본'} HWPX를 만들었습니다. 원본 대조와 한글 쪽 배치를 검토하세요.`);
    };
    const reportSpec=reportState?.profile?(book.reportSpecs?.[reportState.id]||specificationFromProfile(reportState.profile)):null;
    return <div className="report-studio" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => event.preventDefault()}>
        <header className="studio-topbar"><div className="studio-brand"><button className="studio-icon studio-exit" title="협업시스템으로 돌아가기" aria-label="협업시스템으로 돌아가기" disabled={!!working} onClick={onExit}><ArrowLeft size={19} /></button><span className="studio-brand-icon"><BookOpen size={20} /></span><div><strong>보고서 스튜디오</strong><small>자료 수집과 보고서 구성</small></div></div>
            <div className="studio-top-actions"><button className="studio-secondary" disabled={!book||!facilityId||!!working} onClick={saveProject}>프로젝트 파일 저장</button><button className="studio-secondary" disabled={!facilityId||!!working} onClick={()=>archivePicker.current.click()}>프로젝트 파일 열기</button><input ref={archivePicker} hidden type="file" accept=".jindanproj" aria-label="통합 프로젝트 파일 선택" onChange={event=>{openProject(event.target.files[0]);event.target.value='';}}/><span className="studio-save" role="status"><span />{saveStatus}</span><button className="studio-icon studio-settings-toggle" aria-label="문서 설정 열기" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(open => !open)}><LayoutTemplate size={19} /></button></div>
        </header>
        <div className="studio-layout">
            <aside className="studio-navigation" aria-label="목차와 자료 관리">
                <label className="studio-facility-select">프로젝트 선택<select aria-label="작성할 시설 보고서" disabled={!book || !!working} value={facilityId} onChange={event => onFacilityChange(event.target.value)}><option value="">프로젝트를 선택하세요</option>{projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <button className="studio-secondary studio-project-refresh" disabled={!!working} onClick={onRefreshProjects}>프로젝트 목록 새로고침</button>
                {!facilityId&&<p className="studio-reference-hint">프로젝트 관리에 등록한 목록에서 선택하세요. 지금은 형식 학습용 예시 공간입니다.</p>}
                <section className="studio-report-sidebar" aria-label="프로젝트 기존 보고서 목록"><h2>{facilityId?'프로젝트 기존 보고서':'프로젝트 미선택'}</h2><button className="studio-secondary" disabled={!book||!facilityId||!!working} onClick={()=>reportPicker.current.click()}>기존 보고서 선택(다중)</button><input ref={reportPicker} type="file" accept=".hwpx,.hwp,.pdf" multiple hidden aria-label="프로젝트 기존 보고서 파일 선택" onChange={event=>{importReports(event.target.files);event.target.value='';}}/>
                    <button className="studio-secondary" disabled={!book||!facilityId||!!working} onClick={()=>setDrivePickerOpen(true)}>드라이브 보고서 선택</button>
                    <ul>{(facilityId?book?.reportIds||[]:[]).map(id=>{const material=materials.find(item=>item.id===id);return <li key={id}><button className={pane==='report'&&book.activeReportId===id?'active':''} disabled={!!working||!material} title={material?.filename} aria-label={`${material?.filename||'누락 원본'} 보고서 작업 열기`} onClick={()=>chooseReport(id)}><FileText size={15}/><span>{material?.filename||'원본 연결 확인 필요'}<small>{material?.format.toUpperCase()}</small></span></button></li>;})}</ul>
                    {facilityId&&<details><summary>이 프로젝트의 보관 보고서 연결</summary>{materials.filter(item=>item.role==='reference').map(item=><label key={item.id}><input type="checkbox" checked={!!book?.reportIds?.includes(item.id)} disabled={!book||!!working} onChange={event=>changeBook(current=>({...current,reportIds:event.target.checked?[...new Set([...(current.reportIds||[]),item.id])]:(current.reportIds||[]).filter(id=>id!==item.id),activeReportId:!event.target.checked&&current.activeReportId===item.id?'':current.activeReportId}))}/>{item.filename}</label>)}</details>}
                </section>
                <button className={`studio-library-link ${pane === 'electrical' ? 'active' : ''}`} disabled={!book||!facilityId} onClick={() => setPane('electrical')}><FileText size={17} /><span>전기 진단 준비</span></button>
                <button className={`studio-library-link ${pane === 'library' ? 'active' : ''}`} onClick={() => setPane('library')}><Files size={17} /><span>자료 모음</span><b>{materials.length}</b></button>
                <button className={`studio-library-link ${pane === 'reproduction' ? 'active' : ''}`} disabled={!book} onClick={() => setPane('reproduction')}><LayoutTemplate size={17} /><span>한 쪽 재현시험</span></button>
                <input ref={trialPicker} type="file" accept=".json,application/json" aria-label="재현 페이지 파일 선택" hidden onChange={event => { importTrial(event.target.files[0]); event.target.value = ''; }} />
                <ReferenceProjectSidebar userId={userId} businessProjectId={facilityId} version={referenceVersion} activeProjectId={pane === 'reference' ? referenceProjectId : ''} activePartId={referencePartId} busy={!book || !!working} showConfirm={showConfirm}
                    onProgress={progress => { importing.current = !!progress; setWorking(progress); }} onImported={referenceImported} onSelect={selectReferenceProject}
                    onRemoved={id => { changeBook(current=>({...current,referenceProjectIds:(current.referenceProjectIds||[]).filter(item=>item!==id),electrical:current.electrical?.referenceProjectId===id?{...current.electrical,referenceProjectId:'',plan:null}:current.electrical}));setReferenceVersion(value => value + 1); if (referenceProjectId === id) { setReferenceProjectId(''); setReferencePartId(''); setPane('library'); } }} />
                <div className="studio-nav-section"><span><ListTree size={15} />목차·챕터</span><button className="studio-icon" title="새 장 추가" aria-label="새 장 추가" disabled={!book} onClick={addChapter}><Plus size={17} /></button></div>
                <ol className="studio-chapters">{book?.chapters.map((item, index) => <li className={pane === 'document' && item.id === chapter?.id ? 'active' : ''} key={item.id}>
                    <button className="studio-chapter-open" onClick={() => { setChapterId(item.id); setPane('document'); }}><span className="studio-chapter-symbol">{item.kind === 'cover' ? <LayoutTemplate size={16} /> : item.kind === 'contents' ? <ListTree size={16} /> : String(book.chapters.slice(0, index).filter(c => c.kind === 'chapter').length + 1).padStart(2, '0')}</span><span>{item.title}</span></button>
                    {item.kind === 'chapter' && <div className="studio-chapter-actions"><button className="studio-icon" title="장 위로 이동" aria-label={`${item.title} 위로 이동`} disabled={index === 2} onClick={() => moveChapter(item.id, -1)}><ArrowUp size={13} /></button><button className="studio-icon" title="장 아래로 이동" aria-label={`${item.title} 아래로 이동`} disabled={index === book.chapters.length - 1} onClick={() => moveChapter(item.id, 1)}><ArrowDown size={13} /></button><button className="studio-icon" title="장 삭제" aria-label={`${item.title} 삭제`} onClick={() => deleteChapter(item)}><Trash2 size={13} /></button></div>}
                </li>)}</ol>
                <div className="studio-nav-bottom"><span className="studio-small-icon"><Check size={14} /></span><strong>양면 보고서 기본 규칙</strong><p>새 장·본문은 홀수 쪽 시작<br />빈 쪽의 머리말·꼬리말과<br />쪽 번호는 표시하지 않음</p></div>
            </aside>
            <main className="studio-center-panel" aria-label="보고서 작업 영역">
                <div className="studio-pane-tabs"><button className={pane === 'library' ? 'active' : ''} onClick={() => setPane('library')}><Files size={16} />자료 등록</button><button className={pane === 'document' ? 'active' : ''} disabled={!book} onClick={() => setPane('document')}><FileText size={16} />보고서 구성</button>{referenceProjectId && <button className={pane === 'reference' ? 'active' : ''} onClick={() => setPane('reference')}><BookOpen size={16} />프로젝트 원본</button>}</div>
                <div className="studio-scroll">
                    {!!errors.length && <div className="studio-error" role="alert"><strong>확인이 필요합니다</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul><button className="studio-icon" aria-label="오류 메시지 닫기" onClick={() => setErrors([])}><X size={16} /></button></div>}
                    {notice && <p className="studio-notice" role="status"><Check size={15} />{notice}</p>}
                    {pane==='report'?<div className="studio-report-workspace">{!reportState?<p className="studio-center">왼쪽에서 보고서를 선택하세요. HWPX 원본과 대응 PDF를 여러 개 등록할 수 있습니다.</p>:reportState.loading?<p className="studio-center">선택 보고서를 분석하고 있습니다…</p>:reportState.error?<p className="studio-error" role="alert">{reportState.error}</p>:<><div className="studio-page-heading"><h1>{reportState.material.filename}</h1><button className="studio-secondary" onClick={()=>act(async()=>download(await loadMaterial(userId,reportState.id),reportState.material.filename))}>선택 보고서 내려받기</button><p>{reportState.document?`문단 ${reportState.document.paragraphs.length} · 표 ${reportState.document.tables.length} · 원본 보존`:'PDF 분야 분석 · 전기 HWPX 신규 작성'}</p></div>{reportState.url?<PdfReportWorkbench key={reportState.id} userId={userId} projectId={facilityId} material={reportState.material} url={reportState.url} analysis={book.pdfAnalyses?.[reportState.id]} settings={book.pdfAuthoring?.[reportState.id]} onAnalysis={analysis=>changeBook(current=>({...current,pdfAnalyses:{...current.pdfAnalyses,[reportState.id]:analysis}}))} onSettings={settings=>changeBook(current=>({...current,pdfAuthoring:{...current.pdfAuthoring,[reportState.id]:settings}}))} onGenerate={generatePdfNative} inspectorTarget={pdfInspector} onShowInspector={()=>setInspectorOpen(true)}/>:<><ReportDataApplication document={reportState.document} materials={projectInputMaterials} job={applicationJob} target={applicationTarget} onTarget={setApplicationTarget} onStart={startApplication} onApply={applyText} onRegister={()=>setPane('electrical')} busy={!!working}/>{reportSpec?<ReportDocumentView document={reportState.document} spec={reportSpec} onTarget={setApplicationTarget} selection={applicationTarget}/>:<article>{reportState.document.paragraphs.slice(0,300).map(p=><p key={p.id}>{p.text}</p>)}</article>}</>}</>}</div>
                        :pane === 'electrical' ? book && <ElectricalReportPreparation userId={userId} businessProjectId={facilityId} facility={projectName||book.projectName||book.title} value={book.electrical} pdfAnalyses={book.pdfAnalyses} pdfSettings={book.pdfAuthoring} onOpenReport={chooseReport}
                        onChange={updater => changeBook(current => ({ ...current, electrical: updater(current.electrical || { referenceProjectId: '', inputs: {}, notes: {} }) }))}
                        materials={materials} onMaterialsChanged={async () => { const records = await listMaterials(userId); if (mounted.current) {setMaterials(records);const newIds=records.filter(item=>!allMaterials.some(old=>old.id===item.id)).map(item=>item.id);changeBook(current=>({...current,materialIds:[...new Set([...(current.materialIds||[]),...newIds])]}));} }} onPreview={setPreviewSource}
                        onOpenReference={selectReferenceProject} onBusy={busy => setWorking(busy ? { index: 0, total: 1, name: '전기 진단 자료 준비' } : null)} />
                        : pane === 'reproduction' ? <PageTrialView userId={userId} trial={book?.pageTrial} selectedId={trialSelectedId} onSelect={setTrialSelectedId} onImport={() => trialPicker.current.click()} /> : pane === 'library' ? <div className="studio-library">
                        <div className="studio-page-heading"><span>{facilityId?'PROJECT MATERIALS':'LAYOUT EXAMPLES'}</span><h1>{facilityId?`${projectName} 자료`:'형식 학습용 예시 자료'}</h1><p>{facilityId?'이 프로젝트의 기존 보고서와 금회 측정·조사자료를 등록하세요.':'보고서 형식 학습과 재현시험에 사용할 예시입니다. 실제 프로젝트의 기존 보고서로 자동 연결하지 않습니다.'}</p></div>
                        <div className="studio-role-tabs" aria-label="자료 종류">{Object.entries(MATERIAL_ROLES).map(([key, label]) => <button key={key} aria-label={label} className={role === key ? 'active' : ''} onClick={() => { setRole(key); setSelectedId(''); }}>{label}<span>{materials.filter(item => item.role === key).length}</span></button>)}</div>
                        <div className={`studio-dropzone ${dragging ? 'dragging' : ''} ${working ? 'working' : ''}`} role="button" tabIndex={working || !book ? -1 : 0} aria-label={`${MATERIAL_ROLES[role]} 파일 추가`} aria-disabled={!!working || !book}
                            onClick={() => { if (!working && book) picker.current.click(); }} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!working && book) picker.current.click(); } }}
                            onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
                            onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragging(false); if (book) upload(event.dataTransfer.files); }}>
                            <span className="studio-upload-icon">{working ? <LoaderCircle size={27} className="studio-spin" /> : <UploadCloud size={28} />}</span>
                            <h2>{working ? `${working.index + 1}/${working.total}개 파일 등록 중` : '파일을 여기로 끌어 놓으세요'}</h2><p>{working ? working.name : '또는 클릭하여 여러 파일을 선택하세요'}</p>
                            <small>{role === 'reference' ? 'PDF · HWP · HWPX' : role === 'data' ? 'HWPX · HWP · PDF · XLSX · CSV · PWV · BMT' : 'PNG · JPG · WEBP'}<span>파일당 최대 160MB · PWV/BMT 48MB</span></small>
                            {working && <progress max={working.total} value={working.index} aria-label="파일 등록 진행" />}
                        </div>
                        <input ref={picker} type="file" multiple aria-label="자료 파일 선택" accept={ACCEPT_MATERIALS[role]} hidden disabled={!!working || !book} onChange={event => { upload(event.target.files); event.target.value = ''; }} />
                        <div className="studio-library-caption"><div><h2>{MATERIAL_ROLES[role]}</h2><span>{visible.length}개</span></div><label className="studio-search"><Search size={15} /><input aria-label="등록 자료 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="파일명·시설명 검색" /></label></div>
                        {visible.length ? <div className="studio-material-list">{visible.map(item => <article key={item.id} className={`studio-material ${selectedId === item.id ? 'selected' : ''}`}>
                            <button className="studio-material-main" onClick={() => { setSelectedId(item.id); setInspectorOpen(true); }} aria-label={`${item.filename} 자료 정보`}><span className={`studio-file-icon format-${item.format}`}>{item.role === 'image' ? <FileImage size={24} /> : <FileText size={24} />}<small>{item.format.toUpperCase()}</small></span><span><strong>{item.title}</strong><small>{item.filename} · {materialSize(item.size)}</small><span className="studio-material-tags"><i>{REPORT_TYPES[item.reportType]}</i>{item.templateGroup && <i>{item.templateGroup}</i>}{item.role === 'reference' && item.includeInPatterns && <i className="included">양식 비교 대상</i>}</span></span></button>
                            <button className="studio-icon" title="원본 미리보기" aria-label={`${item.filename} 미리보기`} onClick={() => setPreviewId(item.id)}><BookOpen size={17} /></button><button className="studio-icon" title={facilityId?"이 프로젝트의 자료 연결 해제":"보관한 예시 자료 삭제"} aria-label={`${item.filename} 삭제`} onClick={() => remove(item)}><Trash2 size={16} /></button>
                        </article>)}</div> : <div className="studio-empty"><Files size={28} /><strong>{search ? '검색 결과가 없습니다.' : '아직 등록한 자료가 없습니다.'}</strong><p>{role === 'data' ? '빈 양식을 채운 문서나 측정·운영 자료를 추가하세요.' : role === 'image' ? '표지와 본문에 사용할 이미지를 추가하세요.' : '다양한 보고서를 모아 양식 비교에 사용할 자료를 선택하세요.'}</p></div>}
                        <p className="studio-local-note">등록한 원본과 설정은 로그인한 사용자의 이 PC에 보관됩니다. 자료 등록만으로 AI 분석이나 외부 전송을 시작하지 않습니다.</p>
                    </div> : pane === 'reference' ? <ReferenceProjectView key={referenceProjectId} userId={userId} projectId={referenceProjectId} partId={referencePartId} version={referenceVersion} onChanged={() => setReferenceVersion(value => value + 1)} onAnalysisProgress={value => { importing.current = !!value; if (mounted.current) setWorking(value); }} onPreview={entry => setPreviewSource({ ...entry, id: entry.materialId, title: entry.relativePath })} /> : book && chapter && <div className="studio-document">
                        <div className="studio-document-heading"><div><span>구성 미리보기</span><h1>{chapter.title}</h1></div><span className="studio-page-rule">홀수 쪽 시작</span></div>
                        <div className={`studio-paper kind-${chapter.kind}`} style={{ '--studio-title-align': book.titleAlign }}>
                            {chapter.kind === 'cover' ? <div className={`studio-cover position-${book.titlePosition}`}><small>기술진단 보고서</small><h2>{book.title}</h2>{book.coverId && cover?.id === book.coverId && <img src={cover.url} alt="선택한 표지 이미지" />}</div>
                                : chapter.kind === 'contents' ? <div className="studio-contents"><h2>차 례</h2><ol>{book.chapters.filter(item => item.kind === 'chapter').map(item => <li key={item.id}><span>{item.title}</span><span /></li>)}</ol><p>쪽 번호는 본문 편집과 쪽 배치가 끝난 뒤 확정합니다.</p></div>
                                    : <><header className="studio-paper-header">{book.header}</header><h2>{chapter.title}</h2><textarea className="studio-body-editor" aria-label={`${chapter.title} 본문`} value={chapter.text} onChange={event => chapterChange({ text: event.target.value })} placeholder="본문 초안을 작성하거나, 자료 모음에서 작성한 조사자료를 등록하세요." /><footer className="studio-paper-footer">{book.footer}</footer></>}
                        </div><p className="studio-draft-note">구성과 본문 메모를 저장하는 미리보기입니다. 원본 한글 서식 편집·조사자료 자동 반영·정밀 쪽 배치는 이후 연결합니다.</p>
                    </div>}
                </div>
                <footer className="studio-bottom-status"><span>{materials.length}개 자료 · 양식 비교 대상 {materials.filter(item => item.role === 'reference' && item.includeInPatterns).length}개</span><span>원본 보관 · 이 PC</span></footer>
            </main>
            <aside className={`studio-inspector ${inspectorOpen ? 'open' : ''}`} aria-label="보고서와 자료 설정"><div className="studio-inspector-title"><span><LayoutTemplate size={16} />설정</span><button className="studio-icon studio-settings-toggle" aria-label="설정 닫기" onClick={() => setInspectorOpen(false)}><X size={17} /></button></div>
                {pane==='report'&&reportState?.profile&&<ReportSpecification key={reportState.id} profile={reportState.profile} saved={book.reportSpecs?.[reportState.id]} disabled={!!working} onApply={spec=>{changeBook(current=>({...current,reportSpecs:{...current.reportSpecs,[reportState.id]:spec}}));setNotice('선택 보고서의 서식을 저장하고 가운데 미리보기에 적용했습니다.');}}/>}
                {pane==='report'&&reportState?.url&&<section className="studio-pdf-inspector" ref={setPdfInspector} aria-label="PDF 분석·작성 설정"/>}{pane==='report'&&!reportState?.profile&&!reportState?.url&&<p className="studio-inspector-help">HWPX 보고서를 선택하면 머릿글·바닥글·폰트·여백·장 제목·쪽 번호 설정을 표시합니다.</p>}
                {pane === 'reproduction' && <PageTrialInspector trial={book?.pageTrial} selectedId={trialSelectedId} onSelect={setTrialSelectedId} onChange={trial => changeBook(current => ({ ...current, pageTrial: trial }))} />}
                {pane === 'library' && selected && <section className="studio-property-section" key={selected.id}><h2>선택한 자료</h2><label>자료 제목<input defaultValue={selected.title} maxLength={300} onBlur={event => { if (event.target.value !== selected.title) update(selected, { title: event.target.value }); }} /></label><label>보고서 종류<select value={selected.reportType} onChange={event => update(selected, { reportType: event.target.value })}>{Object.entries(REPORT_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>시설명<input defaultValue={selected.facility} maxLength={300} onBlur={event => update(selected, { facility: event.target.value })} placeholder="예: 대청 처리시설" /></label><label>양식 그룹<input defaultValue={selected.templateGroup} maxLength={300} onBlur={event => update(selected, { templateGroup: event.target.value })} placeholder="같은 양식끼리 묶는 이름" /></label>
                    {selected.role === 'reference' && <label className="studio-checkbox"><input type="checkbox" checked={selected.includeInPatterns} onChange={event => update(selected, { includeInPatterns: event.target.checked })} />양식 비교에 사용할 자료</label>}
                    <label>자료 메모<textarea defaultValue={selected.notes} maxLength={10000} rows={3} onBlur={event => update(selected, { notes: event.target.value })} placeholder={selected.role === 'data' ? '작성한 양식의 대상 시설·조사 기간 등' : '이 보고서에서 참고할 점'} /></label><button className="studio-secondary" onClick={() => act(async () => download(await loadMaterial(userId, selected.id), selected.filename))}>원본 내려받기</button>
                    {selected.role === 'data' && <p className="studio-note">입력자료로 보관합니다. 원래 표·셀에 반영할 연결은 보고서 편집 단계에서 확인합니다.</p>}
                </section>}
                {pane === 'electrical' && <section className="studio-property-section"><h2>{projectName} 전기 분야</h2><p>1. 기준 보고서·원본 양식 확인</p><p>2. 자료별 지점·기간·단위 확인</p><p>3. 요약·진단·관리요점 검토</p><p>4. 개선사항 협의</p><p>5. 표·그림 교체와 쪽 배치 검증</p><p className="studio-note">현재 화면은 1~4단계의 준비 기록입니다. 자료가 연결됐다는 이유만으로 판정이나 보고서 반영을 완료 처리하지 않습니다.</p></section>}
                {book && !['reproduction', 'electrical','report'].includes(pane) && <><section className="studio-property-section"><h2>보고서 제목과 배치</h2><label>보고서 제목<textarea rows={3} value={book.title} maxLength={300} onChange={event => changeBook(current => ({ ...current, title: event.target.value }))} /></label><div className="studio-property-row"><label>표지 제목 위치<select value={book.titlePosition} onChange={event => changeBook(current => ({ ...current, titlePosition: event.target.value }))}><option value="upper">상단</option><option value="middle">중앙</option></select></label><label>제목 정렬<select value={book.titleAlign} onChange={event => changeBook(current => ({ ...current, titleAlign: event.target.value }))}><option value="left">왼쪽</option><option value="center">가운데</option></select></label></div>{pane === 'document' && chapter?.kind === 'chapter' && <label>장·중간 제목<input value={chapter.title} maxLength={300} onChange={event => chapterChange({ title: event.target.value })} /></label>}</section>
                    <section className="studio-property-section"><h2>머리말·꼬리말</h2><label>머리말<input value={book.header} maxLength={300} onChange={event => changeBook(current => ({ ...current, header: event.target.value }))} placeholder="예: 제1장 기술진단의 개요" /></label><label>꼬리말<input value={book.footer} maxLength={300} onChange={event => changeBook(current => ({ ...current, footer: event.target.value }))} placeholder="예: 기관명·보고서명" /></label><p className="studio-note">본문에 적용할 내용을 설정합니다. 장 사이의 빈 쪽에는 표시하지 않습니다.</p></section>
                    <section className="studio-property-section"><h2>표지 이미지</h2><label>선택한 이미지<select aria-label="표지 이미지 선택" value={book.coverId} onChange={event => { changeBook(current => ({ ...current, coverId: event.target.value })); if (!event.target.value) setCover(null); }}><option value="">이미지 없음</option>{materials.filter(item => item.role === 'image').map(item => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label><button className="studio-secondary" disabled={!!working} onClick={() => imagePicker.current.click()}><ImagePlus size={16} />표지 이미지 추가</button><input ref={imagePicker} aria-label="표지 이미지 파일 선택" type="file" accept={ACCEPT_MATERIALS.image} hidden disabled={!!working} onChange={event => { upload(event.target.files, 'image'); event.target.value = ''; }} /></section>
                </>}
                {!selected && pane === 'library' && <p className="studio-inspector-help"><MoreHorizontal size={20} />자료를 선택하면 종류·시설명·양식 그룹을 설정할 수 있습니다.</p>}
            </aside>
        </div>
        {previewMaterial && <MaterialPreview key={previewMaterial.id} userId={userId} material={previewMaterial} onClose={closePreview} />}
        {drivePickerOpen&&<ReportDrivePicker projectName={projectName} initialFolder={book.referenceDriveFolder} onImport={importReports} onClose={()=>setDrivePickerOpen(false)}/>}
    </div>;
}

export default function ReportStudio({ currentUser, onExit, showConfirm, showPrompt, onRefreshProjects, projectSyncError, projectSyncing }) {
    const [facilityId, setFacilityId] = useState('');
    const [projectOptions,setProjectOptions]=useState(()=>studioProjectOptions(dbService.getAll('프로젝트관리')));
    const [restoreVersion,setRestoreVersion]=useState(0);
    const userId = currentUser?.person_id || currentUser?.id || currentUser?.uid;
    useEffect(()=>{if(!userId)return;const refresh=()=>{const options=studioProjectOptions(dbService.getAll('프로젝트관리'));setProjectOptions(options);setFacilityId(id=>!id||options.some(p=>p.id===id)?id:'');};refresh();window.addEventListener('jindan-work-change',refresh);window.addEventListener('jindan-work-cache-change',refresh);return()=>{window.removeEventListener('jindan-work-change',refresh);window.removeEventListener('jindan-work-cache-change',refresh);};},[userId]);
    if (!userId) return <p className="center-msg">로그인한 사용자 정보를 확인하세요.</p>;
    return <><Studio key={JSON.stringify([String(userId), facilityId,restoreVersion])} userId={String(userId)} facilityId={facilityId} projectName={projectOptions.find(p=>p.id===facilityId)?.name||''} projectOptions={projectOptions} onFacilityChange={setFacilityId} onRefreshProjects={onRefreshProjects||(()=>setProjectOptions(studioProjectOptions(dbService.getAll('프로젝트관리'))))} onProjectImported={()=>setRestoreVersion(v=>v+1)} onExit={onExit} showConfirm={showConfirm} showPrompt={showPrompt} />{(projectSyncing||projectSyncError)&&<p className="studio-project-sync" role={projectSyncError?'alert':'status'}>{projectSyncError?`프로젝트 동기화 실패: ${projectSyncError}`:'Firebase 프로젝트 목록을 동기화하고 있습니다…'}</p>}</>;
}
