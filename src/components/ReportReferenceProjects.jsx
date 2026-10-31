import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, FileText, FolderOpen, FolderUp, LoaderCircle, Trash2 } from 'lucide-react';
import { REFERENCE_COMPONENTS, buildReferenceParts, filesFromReferenceDrop, importReferenceFolder, listReferenceEntries, listReferenceProjects, removeReferenceProject, setWholeReferencePdf, updateReferenceEntry } from '../services/report/referenceProjects.js';
import ReportReferenceAnalysis from './ReportReferenceAnalysis.jsx';

const partLabel = part => `${part.chapterNumber && ['chapter', 'divider'].includes(part.componentKind) ? `제${part.chapterNumber}장 · ` : ''}${REFERENCE_COMPONENTS[part.componentKind]}`;
const statusLabel = project => project.status === 'importing' ? '등록 진행 · 완료 확인 필요' : project.status === 'partial' ? `확인 필요 ${project.errors.length}개` : `HWPX ${project.hwpxCount} · PDF ${project.pdfCount}`;

export function ReferenceProjectSidebar({ userId, businessProjectId = '', version, activeProjectId, activePartId, busy, onProgress, onImported, onSelect, onRemoved, showConfirm }) {
    const [projects, setProjects] = useState([]), [parts, setParts] = useState({ projectId: '', items: [] }), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
    const [progress, setProgress] = useState(null);
    const picker = useRef(null), alive = useRef(true), importing = useRef(false);
    useEffect(() => {
        let cancelled = false; alive.current = true;
        listReferenceProjects(userId).then(items => { if (!cancelled) setProjects(items.filter(item => (item.businessProjectId || '') === businessProjectId)); }).catch(reason => { if (!cancelled) setError(reason.message); });
        return () => { cancelled = true; };
    }, [userId, businessProjectId, version]);
    useEffect(() => () => { alive.current = false; }, []);
    useEffect(() => {
        let cancelled = false;
        if (!activeProjectId) return;
        listReferenceEntries(userId, activeProjectId).then(entries => { if (!cancelled) setParts({ projectId: activeProjectId, items: buildReferenceParts(entries) }); })
            .catch(reason => { if (!cancelled) setError(reason.message); });
        return () => { cancelled = true; };
    }, [userId, activeProjectId, version]);
    const register = async input => {
        if (busy || importing.current) return;
        importing.current = true; setError('');
        const initial = { index: 0, total: 1, name: '폴더 확인 중' }; setProgress(initial); onProgress(initial);
        try {
            const files = await input;
            const output = await importReferenceFolder(userId, files, current => { if (alive.current) { setProgress(current); onProgress(current); } }, businessProjectId);
            if (!alive.current) return;
            setProjects((await listReferenceProjects(userId)).filter(item => (item.businessProjectId || '') === businessProjectId));
            await onImported(output); onSelect(output.project.id, '');
        } catch (reason) { if (alive.current) setError(reason.message); }
        finally { importing.current = false; if (alive.current) { setProgress(null); onProgress(null); } }
    };
    const remove = async project => {
        if (!await showConfirm(`'${project.name}' 폴더 연결을 해제할까요? 자료 모음에 보관한 원본 파일은 유지됩니다.`, '프로젝트 폴더 연결 해제')) return;
        try {
            await removeReferenceProject(userId, project.id);
            if (!alive.current) return;
            setProjects((await listReferenceProjects(userId)).filter(item => (item.businessProjectId || '') === businessProjectId)); onRemoved(project.id);
        } catch (reason) { if (alive.current) setError(reason.message); }
    };
    return <section className="studio-reference-sidebar" aria-label="기존 보고서 프로젝트 폴더">
        <div className="studio-reference-heading"><span>{businessProjectId ? '프로젝트 기존 보고서 폴더' : '형식 학습용 예시'}</span><span>{projects.length}</span></div>
        <button className={`studio-folder-drop ${dragging ? 'dragging' : ''}`} title="표지·책등·목차·각 장의 HWPX와 PDF가 든 프로젝트 폴더를 선택하거나 끌어 놓으세요." disabled={busy || !!progress} aria-label="기존 보고서 프로젝트 폴더 추가" onClick={() => picker.current.click()}
            onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
            onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragging(false); if (!busy && !importing.current) register(filesFromReferenceDrop(event.dataTransfer.items)); }}>
            {progress ? <LoaderCircle size={20} className="studio-spin" /> : <FolderUp size={21} />}<strong>{progress ? `${Math.min(progress.index + 1, progress.total)}/${progress.total}개 등록 중` : '프로젝트 폴더 추가'}</strong><small>HWPX · PDF · 하위 폴더 포함</small>
        </button>
        <input ref={picker} type="file" multiple webkitdirectory="" directory="" accept=".hwpx,.pdf" hidden aria-label="기존 보고서 프로젝트 폴더 선택" disabled={busy || !!progress} onChange={event => { const files = Array.from(event.target.files || []); if (files.length) register(files); event.target.value = ''; }} />
        {progress && <p className="studio-folder-progress" role="status" title={progress.name}>{progress.name}</p>}
        {error && <p className="studio-folder-error" role="alert">{error}</p>}
        {!!projects.length && <ul className="studio-reference-projects">{projects.map(project => <li key={project.id}>
            <div className={`studio-reference-project ${activeProjectId === project.id ? 'active' : ''}`}>
                <button title={`${project.name}\n${new Date(project.createdAt).toLocaleString('ko-KR')}`} aria-label={`${project.name} 프로젝트 원본 열기`} onClick={() => onSelect(project.id, '')}><FolderOpen size={15} /><span><strong>{project.name}</strong><small>{statusLabel(project)}</small></span><ChevronRight size={12} /></button>
                <button className="studio-icon" title="프로젝트 폴더 연결 해제" aria-label={`${project.name} 폴더 연결 해제`} disabled={busy} onClick={() => remove(project)}><Trash2 size={12} /></button>
            </div>
            {activeProjectId === project.id && parts.projectId === project.id && <ul className="studio-reference-parts">{parts.items.map(part => <li key={part.id}><button className={activePartId === part.id ? 'active' : ''} title={part.relativePath} onClick={() => onSelect(project.id, part.id)}><FileText size={12} /><span>{partLabel(part)}<small>{(part.original || part.pdf).filename}</small></span></button></li>)}</ul>}
        </li>)}</ul>}
        <p className="studio-reference-hint">{businessProjectId ? '선택한 업무 프로젝트의 전회 보고서만 등록하세요.' : '서남하수 등 예시 자료는 형식 학습용입니다. 업무 프로젝트의 기존 보고서로 자동 연결하지 않습니다.'}</p>
    </section>;
}

export function ReferenceProjectView({ userId, projectId, partId, version, onPreview, onChanged, onAnalysisProgress }) {
    const [state, setState] = useState({ loading: true }), [error, setError] = useState(''), [saving, setSaving] = useState(false);
    const alive = useRef(true);
    useEffect(() => {
        let cancelled = false; alive.current = true;
        Promise.all([listReferenceProjects(userId), listReferenceEntries(userId, projectId)]).then(([projects, entries]) => {
            if (!cancelled) setState({ project: projects.find(project => project.id === projectId), entries });
        }).catch(reason => { if (!cancelled) { setState({ loading: false }); setError(reason.message); } });
        return () => { cancelled = true; alive.current = false; };
    }, [userId, projectId, version]);
    useEffect(() => {
        if (partId && !state.loading) document.getElementById(`reference-part-${partId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [partId, state]);
    const saveEntry = async (entry, patch) => {
        setSaving(true); setError('');
        try { await updateReferenceEntry(userId, projectId, entry.id, patch); if (alive.current) onChanged(); }
        catch (reason) { if (alive.current) setError(reason.message); }
        finally { if (alive.current) setSaving(false); }
    };
    const saveWholePdf = async entryId => {
        setSaving(true); setError('');
        try { await setWholeReferencePdf(userId, projectId, entryId); if (alive.current) onChanged(); }
        catch (reason) { if (alive.current) setError(reason.message); }
        finally { if (alive.current) setSaving(false); }
    };
    if (state.loading) return <p className="studio-center"><LoaderCircle size={22} className="studio-spin" />프로젝트 원본을 불러오는 중입니다.</p>;
    if (!state.project) return <p className="studio-error" role="alert">{error || '프로젝트 폴더를 다시 선택하세요.'}</p>;
    const { project, entries } = state, parts = buildReferenceParts(entries), pdfs = entries.filter(entry => entry.format === 'pdf');
    const wholePdf = pdfs.find(entry => entry.id === project.wholePdfEntryId);
    return <div className="studio-library studio-reference-view" aria-label="프로젝트 원본 구성 확인">
        <div className="studio-page-heading"><span>REFERENCE PROJECT</span><h1>{project.name}</h1><p>원래 폴더 경로를 유지한 학습용 원본입니다. 구성 분류와 대응 PDF를 확인하세요.</p></div>
        <div className="studio-reference-summary"><span>HWPX <b>{project.hwpxCount}</b></span><span>PDF <b>{project.pdfCount}</b></span><span>장별 연결 <b>{parts.filter(part => part.original && part.pdf).length}</b></span><span>{project.analysis ? '양식 분석 결과 있음 · 재현 검증 전' : project.status === 'ready' ? '원본 등록 완료 · 학습 전' : project.status === 'partial' ? '일부 등록 실패 · 학습 전' : '등록 완료 확인 필요'}</span></div>
        {error && <p className="studio-error" role="alert">{error}</p>}
        <ReportReferenceAnalysis userId={userId} project={project} entries={entries} onChanged={onChanged} onProgress={onAnalysisProgress} />
        {!!project.errors.length && <details className="studio-folder-import-errors"><summary>등록하지 못한 파일 {project.errors.length}개</summary><ul>{project.errors.map((failure, index) => <li key={index}>{failure.relativePath}: {failure.message}</li>)}</ul></details>}
        {!!project.ignoredCount && <p className="studio-note">HWPX·PDF 외 {project.ignoredCount}개 파일은 제외했습니다. HWP 원본은 HWPX로 변환한 사본을 넣어주세요.</p>}
        <section className="studio-whole-pdf"><div><h2>전체 보고서 PDF</h2><p>각 장이 합쳐진 PDF는 여기에 연결합니다.</p></div><label><span className="studio-visually-hidden">전체 보고서 PDF 선택</span><select aria-label="전체 보고서 PDF 선택" value={project.wholePdfEntryId || ''} disabled={saving} onChange={event => saveWholePdf(event.target.value)}><option value="">선택 안 함</option>{pdfs.map(entry => <option value={entry.id} key={entry.id}>{entry.relativePath}</option>)}</select></label><button className="studio-icon" title="전체 보고서 PDF 보기" aria-label="전체 보고서 PDF 보기" disabled={!wholePdf} onClick={() => onPreview(wholePdf)}><BookOpen size={18} /></button></section>
        <div className="studio-reference-parts-heading"><h2>표지부터 마지막 장까지</h2><small>파일명을 기준으로 분류했습니다. 필요한 항목은 직접 수정하세요.</small></div>
        <div className="studio-reference-cards">{parts.map(part => {
            const entry = part.original || part.pdf;
            return <section className={`studio-reference-card ${partId === part.id ? 'selected' : ''}`} id={`reference-part-${part.id}`} key={part.id}>
                <header><div><span>{partLabel(part)}</span><strong>{entry.filename.replace(/\.[^.]+$/, '')}</strong></div><span className={`studio-pair-status status-${part.pairing}`}>{({ automatic: '파일명·경로 일치', manual: '직접 연결', ambiguous: 'PDF 연결 확인', missing: '개별 PDF 없음', unlinked: '연결 안 함', 'pdf-only': 'PDF 원본' })[part.pairing]}</span></header>
                <div className="studio-reference-file-pair"><div><small>HWPX 원본</small>{part.original ? <button title={part.original.relativePath} aria-label={`${part.original.relativePath} HWPX 확인`} onClick={() => onPreview(part.original)}><FileText size={16} /><span>{part.original.relativePath}</span><BookOpen size={14} /></button> : <p>대응 HWPX가 없습니다.</p>}</div><div><small>확인용 PDF</small>{part.pdf ? <button title={part.pdf.relativePath} aria-label={`${part.pdf.relativePath} PDF 확인`} onClick={() => onPreview(part.pdf)}><FileText size={16} /><span>{part.pdf.relativePath}</span><BookOpen size={14} /></button> : <p>{part.pairing === 'ambiguous' ? '아래에서 대응 PDF를 선택하세요.' : '개별 PDF를 연결하거나 전체 PDF로 확인하세요.'}</p>}</div></div>
                <div className="studio-reference-controls"><label>구성 분류<select aria-label={`${entry.relativePath} 구성 분류`} value={entry.componentKind} disabled={saving} onChange={event => saveEntry(entry, { componentKind: event.target.value })}>{Object.entries(REFERENCE_COMPONENTS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
                    {['chapter', 'divider'].includes(entry.componentKind) && <label className="studio-reference-chapter-number">장 번호<input aria-label={`${entry.relativePath} 장 번호`} type="number" min="1" max="999" defaultValue={entry.chapterNumber || ''} key={`${entry.id}-${entry.chapterNumber}`} disabled={saving} onBlur={event => { const number = event.target.value ? Number(event.target.value) : null; if (number !== entry.chapterNumber) saveEntry(entry, { chapterNumber: number }); }} /></label>}
                    {part.original && <label className="studio-reference-pdf-choice">대응 PDF<select aria-label={`${entry.relativePath} 대응 PDF 선택`} value={entry.pdfChoice || ''} disabled={saving} onChange={event => saveEntry(entry, { pdfChoice: event.target.value })}><option value="">파일명·경로로 자동 연결</option><option value="none">연결하지 않음</option>{pdfs.map(pdf => <option key={pdf.id} value={pdf.id}>{pdf.relativePath}</option>)}</select></label>}
                </div>
            </section>;
        })}</div>
        <p className="studio-local-note">원본과 양식 분석 결과는 로그인한 사용자의 이 PC에 보관됩니다. PDF 대조와 한 쪽 재현 검증 후 양식을 확정합니다.</p>
    </div>;
}
