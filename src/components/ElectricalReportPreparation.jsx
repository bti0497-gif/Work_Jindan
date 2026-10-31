import { useEffect, useRef, useState } from 'react';
import { ELECTRICAL_SECTIONS, electricalPlanIsCurrent, electricalPdfCandidates, linkElectricalInput, resolveKepcoScope } from '../services/report/electricalPreparation.js';
import { addMaterial, loadMaterial } from '../services/report/reportLibrary.js';
import { listReferenceEntries, listReferenceProjects, referenceAnalysisSignature } from '../services/report/referenceProjects.js';
import ThermalDeliveries from './ThermalDeliveries.jsx';

const inputRole = file => /\.(?:png|jpe?g|webp)$/i.test(file.name) ? 'image' : 'data';
function inspect(bytes, filename, activeWorker) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../services/report/report.worker.js', import.meta.url), { type: 'module' });
        activeWorker.current = worker;
        const finish = (error, value) => { clearTimeout(timer); worker.terminate(); activeWorker.current = null; error ? reject(error) : resolve(value); };
        const timer = setTimeout(() => finish(new Error('교체 위치 분석 시간이 초과되었습니다.')), 90000);
        worker.onerror = () => finish(new Error('보고서 분석 작업을 시작하지 못했습니다.'));
        worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : !data.electrical ? new Error('교체 위치 결과가 없습니다.') : null, data.electrical);
        worker.postMessage({ action: 'prepare-electrical', bytes, filename }, [bytes]);
    });
}

export default function ElectricalReportPreparation({ userId, businessProjectId = '', facility, value, onChange, materials, pdfAnalyses={}, pdfSettings={}, onMaterialsChanged, onPreview, onOpenReference, onOpenReport, onBusy }) {
    const [projects, setProjects] = useState([]), [entries, setEntries] = useState([]), [error, setError] = useState(''), [progress, setProgress] = useState('');
    const alive = useRef(true), activeWorker = useRef(null), lock = useRef(false);
    const state = value || { referenceProjectId: '', inputs: {}, notes: {} };
    useEffect(() => {
        alive.current = true;
        listReferenceProjects(userId).then(items => { if (alive.current) setProjects(items.filter(item=>(item.businessProjectId||'')===businessProjectId)); }).catch(reason => { if (alive.current) setError(reason.message); });
        return () => { alive.current = false; activeWorker.current?.terminate(); onBusy(false); };
    }, [userId,businessProjectId]);
    useEffect(() => {
        let cancelled = false; setEntries([]);
        if (projects.some(item=>item.id===state.referenceProjectId)) listReferenceEntries(userId, state.referenceProjectId).then(items => { if (!cancelled) setEntries(items); }).catch(reason => { if (!cancelled) setError(reason.message); });
        return () => { cancelled = true; };
    }, [userId, state.referenceProjectId, projects]);
    const project = projects.find(item => item.id === state.referenceProjectId);
    const pdf=pdfAnalyses[state.referencePdfMaterialId],pdfIsCurrent=pdf?.projectId===businessProjectId&&materials.some(m=>m.id===state.referencePdfMaterialId&&m.sha256===pdf.source.sha256);
    const signature = pdfIsCurrent?JSON.stringify([pdf.source.sha256,pdf.parserVersion,pdf.ocrUpdatedAt||'',pdfSettings[state.referencePdfMaterialId]?.disciplines||{}]):project ? referenceAnalysisSignature(project, entries) : '';
    const current = pdfIsCurrent?state.plan?.signature===signature:project && electricalPlanIsCurrent(state.plan, signature, entries);
    const kepcoScope = resolveKepcoScope(state, current), kepcoMode = kepcoScope.mode;
    const patch = change => onChange(previous => ({ ...previous, ...change }));
    const run = async action => {
        if (lock.current) return;
        lock.current = true; onBusy(true); setError(''); setProgress('자료 확인 중');
        try { await action(); } catch (reason) { if (alive.current) setError(reason.message); }
        finally { lock.current = false; if (alive.current) { setProgress(''); onBusy(false); } }
    };
    const prepare = () => run(async () => {
        const originals = entries.filter(entry => entry.format === 'hwpx');
        if (!originals.length) throw new Error('HWPX 원본이 필요합니다. 왼쪽에서 기존 보고서 프로젝트 폴더를 먼저 등록하세요.');
        const files = [], failures = [];
        for (const [index, entry] of originals.entries()) {
            if (!alive.current) return;
            setProgress(`${index + 1}/${originals.length} · ${entry.relativePath}`);
            try {
                const bytes = await (await loadMaterial(userId, entry.materialId)).arrayBuffer();
                const result = await inspect(bytes, entry.filename, activeWorker);
                if (result.source.sha256 !== entry.sha256) throw new Error('등록 원본과 해시가 다릅니다.');
                files.push({ ...result, entryId: entry.id, materialId: entry.materialId, relativePath: entry.relativePath });
            } catch (reason) { failures.push({ filename: entry.relativePath, error: reason.message }); }
        }
        if (!alive.current) return;
        const latestEntries = await listReferenceEntries(userId, project.id), latestProject = (await listReferenceProjects(userId)).find(item => item.id === project.id);
        if (!latestProject || referenceAnalysisSignature(latestProject, latestEntries) !== signature) throw new Error('분석 중 기준 보고서 구성이 바뀌었습니다. 다시 분석하세요.');
        patch({ plan: { signature, createdAt: new Date().toISOString(), files, failures, status: failures.length ? 'partial' : 'candidates', reportReady: false }, targets: {} });
    });
    const attach = (section, material) => {
        const linked = linkElectricalInput(material, section.id);
        onChange(previous => ({ ...previous, inputs: { ...previous.inputs, [section.id]: [...(previous.inputs?.[section.id] || []).filter(item => item.materialId !== material.id), linked] } }));
    };
    const upload = (section, fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        run(async () => {
            if (files.length > 50) throw new Error('자료를 50개 이하로 나누어 등록하세요.');
            const failures = [];
            for (const [index, file] of files.entries()) {
                if (!alive.current) return;
                setProgress(`${index + 1}/${files.length} · ${file.name}`);
                try {
                    if (!section.accept.split(',').includes(`.${file.name.split('.').at(-1).toLowerCase()}`)) throw new Error('이 항목에서 받는 파일 형식이 아닙니다.');
                    const { material } = await addMaterial(userId, file, inputRole(file));
                    if (alive.current) attach(section, material);
                } catch (reason) { failures.push(`${file.name}: ${reason.message}`); }
            }
            if (alive.current) { await onMaterialsChanged(); if (failures.length) setError(failures.join('\n')); }
        });
    };
    const note = (id, field, text) => onChange(previous => ({ ...previous, notes: { ...previous.notes, [id]: { ...previous.notes?.[id], [field]: text } } }));
    return <div className="studio-electrical">
        <div className="studio-page-heading"><span>ELECTRICAL REPORT</span><h1>{facility} 전기 진단 준비</h1><p>기준 보고서 분석 → 금회 자료 연결 → 수치·판정 검토 → 개선 협의 → 양식 반영</p></div>
        <p className="studio-notice">시설마다 보고서와 자료 연결을 따로 저장합니다. 수집·교체 준비 단계이며, 과거 수치·판정은 금회 내용으로 확정되지 않습니다.</p>
        {error && <p className="studio-error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>}
        <section className="electrical-baseline"><h2>1. 재현할 기준 보고서</h2>
            <label>PDF 기준 보고서<select aria-label="전기 PDF 기준 보고서" disabled={!!progress} value={state.referencePdfMaterialId||''} onChange={event=>patch({referencePdfMaterialId:event.target.value,referenceProjectId:'',plan:null,targets:{}})}><option value="">프로젝트의 분석한 PDF 선택</option>{materials.filter(m=>m.format==='pdf'&&pdfAnalyses[m.id]?.projectId===businessProjectId&&pdfAnalyses[m.id]?.source.sha256===m.sha256).map(m=><option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
            <div className="electrical-actions"><button className="studio-secondary" disabled={!pdfIsCurrent||!!progress} onClick={()=>run(async()=>patch({plan:{signature,createdAt:new Date().toISOString(),files:[electricalPdfCandidates(pdf,businessProjectId,pdfSettings[state.referencePdfMaterialId])],failures:[],status:'candidates',reportReady:false},targets:{}}))}>PDF 전기 항목 분석</button><button className="studio-secondary" disabled={!pdfIsCurrent||!!progress} onClick={()=>onOpenReport(state.referencePdfMaterialId)}>PDF 분석·한글 작성 열기</button></div>
            <label>HWPX 기준 보고서 폴더<select aria-label="전기 기준 보고서" disabled={!!progress} value={state.referenceProjectId || ''} onChange={event => patch({ referenceProjectId: event.target.value,referencePdfMaterialId:'', plan: null, targets: {} })}><option value="">등록한 프로젝트 폴더를 선택하세요</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="electrical-actions"><button className="studio-secondary" disabled={!project || !!progress || !entries.length} onClick={prepare}>교체 위치 분석</button><button className="studio-secondary" disabled={!project || !!progress} onClick={() => onOpenReference(project.id)}>원본 구성·서식 분석 열기</button></div>
            {!projects.length && <p>PDF만 있어도 왼쪽 기존 보고서 목록에서 분석·OCR·전기 HWPX 작성을 시작할 수 있습니다. 파일관리 드라이브의 보고서는 ‘드라이브 보고서 선택’으로 가져옵니다.</p>}
            {state.plan && <p role="status">{current ? `${state.plan.files.length}개 파일 분석 · ${state.plan.files.reduce((sum, file) => sum + file.candidates.length, 0)}개 교체 후보 · 검토 필요` : '기준 원본 연결을 다시 확인하고 재분석하세요.'}</p>}
            {state.plan?.files.some(file => file.truncated) && <p>파일별 후보 표시 한도(800개)에 도달했습니다. 누락 위치는 원본에서 확인하세요.</p>}
            {state.plan?.failures.map((failure, i) => <p className="studio-note" key={i}>{failure.filename}: {failure.error}</p>)}
            <p className="studio-note">표·문단의 키워드로 후보를 찾습니다. 그림의 온도·그래프 수치나 최종 판정은 이 분석으로 추출되지 않습니다. 표 전체 후보 선택은 개별 셀의 덮어쓰기 승인이 아닙니다.</p>
        </section>
        <section className="electrical-period"><h2>2. 금회 진단 범위</h2><label>대상 시설·설비 범위<input aria-label="전기 대상 시설 범위" maxLength={500} value={state.scope || ''} onChange={event => patch({ scope: event.target.value })} placeholder="하수/분뇨 구분, 처리시설·설비 범위 확인" /></label>
            <label>한전 사용정보 분석 적용<select aria-label="한전 자료 적용 여부" value={['include', 'exclude'].includes(state.kepcoMode) ? state.kepcoMode : 'auto'} onChange={event => patch({ kepcoMode: event.target.value })}><option value="auto">기존 보고서 분석에 따름</option><option value="include">금회 보고서에 포함</option><option value="exclude">금회 보고서에서 제외</option></select></label>
            <p className="studio-note" aria-label="한전 항목 분석 결과">{kepcoScope.reason}</p>
            <label>적용·제외 근거<input aria-label="한전 자료 적용 근거" maxLength={1000} value={state.kepcoReason || ''} onChange={event => patch({ kepcoReason: event.target.value })} placeholder="진단 범위, 사용정보 제공 여부, 담당자 확인 내용 등" /></label>
            <p className="studio-note">기존 보고서에 해당 분석 항목이 있는지를 먼저 확인합니다. 조회 계정이 필요한 자료는 사용자가 확보한 파일로 받습니다.</p>
            {kepcoMode !== 'include' && !!state.inputs?.kepco?.length && <p className="studio-note">기존 한전 연결 자료 {state.inputs.kepco.length}개는 보관 중입니다. ‘금회 보고서에 포함’을 선택하면 다시 확인할 수 있습니다.</p>}
            {kepcoMode === 'include' && <><div className="electrical-grid"><label>한전 자료 시작일<input aria-label="한전 자료 시작일" type="date" value={state.periodStart || ''} onChange={event => patch({ periodStart: event.target.value })} /></label><label>한전 자료 종료일<input aria-label="한전 자료 종료일" type="date" value={state.periodEnd || ''} onChange={event => patch({ periodEnd: event.target.value })} /></label></div><p className="studio-note">최근 3개년의 정확한 범위와 누락 월은 원본을 보고 확인합니다. 사용량·요금·수요전력의 단위와 계약 변경도 함께 확인합니다.</p></>}
        </section>
        <h2>3. 항목별 자료와 교체 준비</h2>
        {ELECTRICAL_SECTIONS.map((section, index) => {
            if (section.id === 'kepco' && kepcoMode !== 'include') return null;
            const links = state.inputs?.[section.id] || [], notes = state.notes?.[section.id] || {};
            const candidates = current ? state.plan.files.flatMap(file => file.candidates.filter(candidate => candidate.sections.includes(section.id)).map(candidate => ({ file, candidate, key: JSON.stringify([file.entryId, candidate.id]) }))) : [];
            return <details className="electrical-section" key={section.id} open={(kepcoMode === 'include' ? index === 0 : section.id === 'thermal') ? true : undefined}><summary>{section.title}<small>연결 자료 {links.length} · 교체 후보 {candidates.length}</small></summary><div>
                <p>{section.hint}</p><p className="studio-note">작성 흐름: {section.output}</p>
                <label className="electrical-upload">자료 추가<input type="file" multiple accept={section.accept} aria-label={`${section.title} 자료 선택`} disabled={!!progress} onChange={event => { upload(section, event.target.files); event.target.value = ''; }} /></label>
                {section.id === 'thermal' && <><label className="electrical-upload">열화상 폴더 추가<input type="file" multiple webkitdirectory="" directory="" aria-label="열화상 폴더 선택" disabled={!!progress} onChange={event => { const files = Array.from(event.target.files || []).filter(file => section.accept.split(',').includes(`.${file.name.split('.').at(-1).toLowerCase()}`)); upload(section, files); event.target.value = ''; }} /></label><p className="studio-note">하위 폴더의 BMT와 보고서용 이미지·온도표를 함께 받습니다(한 번에 최대 50개). IR/SR은 같은 촬영의 일반·SuperResolution 버전일 수 있으므로 서로 다른 측정 건수로 확정하지 않습니다. 촬영일과 시설은 원본에서 확인하세요.</p></>}
                <label>이미 보관한 자료 연결<select aria-label={`${section.title} 보관 자료 연결`} value="" disabled={!!progress} onChange={event => { const material = materials.find(item => item.id === event.target.value); if (material) attach(section, material); }}><option value="">자료를 선택하세요</option>{materials.filter(item => item.role !== 'reference' && section.accept.split(',').includes(`.${item.format}`)).map(item => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label>
                <ul className="electrical-inputs">{links.map(link => {
                    const material = materials.find(item => item.id === link.materialId && item.sha256 === link.sha256);
                    return <li key={link.materialId}><button disabled={!material} title="연결한 원본 자료 보기" onClick={() => onPreview(material)}>{link.filename}</button><span>{material ? '원본 연결 · 내용 미검증' : '원본 없음 · 다시 연결 필요'}</span><button title="이 항목의 연결만 해제" aria-label={`${link.filename} ${section.title} 연결 해제`} onClick={() => onChange(previous => ({ ...previous, inputs: { ...previous.inputs, [section.id]: previous.inputs[section.id].filter(item => item.materialId !== link.materialId) } }))}>연결 해제</button></li>;
                })}</ul>
                {section.id === 'thermal' && <ThermalDeliveries deliveries={state.thermalDeliveries} materials={links.flatMap(link => { const material = materials.find(item => item.id === link.materialId && item.sha256 === link.sha256); return material ? [material] : []; })}
                    onChange={updater => onChange(previous => ({ ...previous, thermalDeliveries: updater(previous.thermalDeliveries || []) }))} />}
                <label>측정지점·기간·조건 / 자료 누락<textarea aria-label={`${section.title} 측정 조건`} rows={2} maxLength={10000} value={notes.conditions || ''} onChange={event => note(section.id, 'conditions', event.target.value)} /></label>
                <label>요약·진단 검토 메모<textarea aria-label={`${section.title} 진단 메모`} rows={3} maxLength={20000} value={notes.diagnosis || ''} onChange={event => note(section.id, 'diagnosis', event.target.value)} placeholder="새 자료의 근거, 적용 기준·확인일, 해석과 관리요점. 검토 전 초안입니다." /></label>
                {section.id === 'improvement' && <><label>협의 상태<select aria-label="개선사항 협의 상태" value={notes.consultation || 'proposed'} onChange={event => note(section.id, 'consultation', event.target.value)}><option value="proposed">제안 준비</option><option value="discussing">협의 중</option><option value="agreed">합의 문구 기록</option></select></label><label>협의일·참여자·합의 내용<textarea aria-label="개선사항 합의 내용" rows={3} maxLength={20000} value={notes.agreement || ''} onChange={event => note(section.id, 'agreement', event.target.value)} /></label></>}
                <details className="electrical-targets"><summary>교체 위치 후보 검토 ({candidates.length})</summary><p>선택은 교체 계획에만 기록합니다. 원본 표의 항목·단위·입력 셀과 그림 교체 방식은 반영 전에 확인해야 합니다.</p>{candidates.map(({ file, candidate, key }) => <label className="electrical-target" key={key}><input type="checkbox" checked={!!state.targets?.[section.id]?.[key]} onChange={event => onChange(previous => ({ ...previous, targets: { ...previous.targets, [section.id]: { ...previous.targets?.[section.id], [key]: event.target.checked } } }))} /><span><strong>{file.relativePath} · {candidate.kind === 'table' ? `표 ${candidate.rows}×${candidate.columns}` : '문단'}</strong><small>{candidate.context || '원본 위치 연결됨'}</small><pre>{candidate.excerpt}</pre><em>전회 원문 · 금회 확정값 아님</em></span></label>)}</details>
            </div></details>;
        })}
        {progress && <p className="electrical-progress" role="status">{progress}</p>}
        <p className="studio-note">현재는 자료 연결·교체 후보·검토 메모를 이 PC에 저장합니다. 한전 엑셀 집계, 열화상 온도 추출, PWV 통계 검증과 양식 자동 반영은 아직 완료되지 않았습니다.</p>
    </div>;
}
