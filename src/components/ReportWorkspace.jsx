import { useEffect, useRef, useState } from 'react';
import { dbService } from '../services/dbService';
import { addFields, buildDraft, confirmManualNotes, confirmSchema, createWorkspace, draftHtml, narrativeValue, OPERATIONS, proposeCellField, proposeJudgmentFields, proposeTableFields, removeField, removeRule, restoreLastRun, setField, setNarrativeValue, setNotes, setRule, setValue, startNewRun, validateData } from '../services/report/reportEngine.js';
import { listWorkspaces, loadReportSource, saveReportSource, saveWorkspace, validateBackup } from '../services/report/reportStore.js';
import { collectionFormHtml, createCollectionForm, fingerprint, importCollectionData, inputFields } from '../services/report/collectionForms.js';
import { fieldTextSlots, planNativeWrite } from '../services/report/nativeWriter.js';
import { applyInterpretation, createInterpretationRequest, validateInterpretation } from '../services/report/reportInterpreter.js';
import { applyAnalysis, createAnalysisRequest, validateAnalysis } from '../services/report/reportAnalyzer.js';
import { startReportAi } from '../services/report/reportAiClient.js';
import { draftReadiness, reportSection } from '../services/report/reportSections.js';
import { analyzeWorkflow } from '../services/report/reportAnalysisFlow.js';
import { applyCollectedValues, createCollectionExtractionRequest, validateCollectedValues } from '../services/report/reportCollection.js';
import ReportAiSettings from './ReportAiSettings.jsx';
import ReportWorkflowPanel from './ReportWorkflowPanel.jsx';
import './ReportWorkspace.css';

function download(name, content, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const toJson = value => JSON.stringify(value, null, 2);

function NativeBindings({ workspace, change }) {
    return <details className="report-card"><summary>한글 교체 위치·서식 및 진단 문단 연결</summary><p>한글 원본의 글자 모양·문단 모양·표·그림 구조를 유지하고 지정한 글자 구간만 교체합니다. 여러 글자 모양이 섞인 셀은 교체 구간을 직접 지정하세요.</p>
        {workspace.document.format !== 'hwpx' && <p className="report-error">현재 HWP 원본은 읽기만 지원합니다. 한글에서 HWPX 사본으로 저장하여 새 원본으로 분석하면 글자 구간을 연결할 수 있습니다.</p>}
        {workspace.fields.map(field => {
            const slots = fieldTextSlots(workspace, field);
            return <div className="report-card" key={field.id}><strong>{field.group} / {field.label}</strong><div className="report-form-row"><label>내용 역할<select value={field.valueSource || 'input'} onChange={event => change(value => setField(value, { ...field, valueSource: event.target.value, type: event.target.value === 'input' ? field.type : 'text' }))}><option value="input">사용자 입력 데이터</option><option value="diagnosis">진단 내용 문단</option><option value="conclusion">최종 진단 의견 문단</option><option value="improvements">개선 내용 문단</option></select></label><label>교체할 글자 구간<select disabled={!slots.length} value={field.binding?.scope === 'cell' ? '__cell__' : field.binding?.slotId || ''} onChange={event => change(value => setField(value, { ...field, binding: { ...field.binding, scope: event.target.value === '__cell__' ? 'cell' : undefined, slotId: event.target.value === '__cell__' ? undefined : event.target.value || undefined }, reference: slots.find(slot => slot.id === event.target.value)?.text ?? field.reference }))}><option value="">{slots.length === 1 ? '단일 구간 자동 연결' : '교체 구간을 선택하세요.'}</option>{field.binding?.cellId && <option value="__cell__">셀 전체 · 첫 글자 서식으로 새 내용 적용</option>}{slots.map((slot, index) => <option key={slot.id} value={slot.id} disabled={!slot.plain}>{index + 1}. 글자 모양 {slot.charShapeId || '(기본)'} · {slot.text || '(빈 구간)'}{!slot.plain ? ' [복합 요소: 보존만 지원]' : ''}</option>)}</select></label><label>한글에 표시할 형식<input value={field.outputPattern || '{value}'} onChange={event => change(value => setField(value, { ...field, outputPattern: event.target.value }))} placeholder="{value} {unit}" /></label></div><small>{'{value}는 새 값, {unit}은 양식의 단위입니다. 예: {value} {unit} / ({value})'}</small>
                {slots.length > 1 && <button onClick={() => change(value => {
                    const candidates = slots.filter(slot => slot.plain && slot.text.trim()).map((slot, index) => ({ ...field, id: `${field.id}@${slot.id}`, label: `${field.label} · 구간 ${index + 1}`, reference: slot.text, binding: { ...field.binding, scope: undefined, slotId: slot.id } }));
                    return addFields(removeField(value, field.id), candidates);
                })}>이 항목을 글자 구간별로 나누기</button>}</div>;
        })}
    </details>;
}

function RuleEditor({ workspace, onSave }) {
    const [label, setLabel] = useState('');
    const [operation, setOperation] = useState('mean');
    const [fieldIds, setFieldIds] = useState([]);
    const [unit, setUnit] = useState('');
    const [min, setMin] = useState('');
    const [max, setMax] = useState('');
    const [source, setSource] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [outsideText, setOutsideText] = useState('');
    const [insideText, setInsideText] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const numeric = workspace.fields.filter(field => field.type === 'number');
    return <details className="report-card"><summary>계산·판정 기준 추가</summary>
        <p>항목을 선택한 순서로 계산합니다. 서로 다른 설비·기간 또는 예산 대안이 섞이지 않도록 확인하세요.</p>
        <div className="report-form-row"><label>계산 이름<input value={label} onChange={event => setLabel(event.target.value)} placeholder="예: 1호기 상간 온도차" /></label>
            <label>계산식<select value={operation} onChange={event => setOperation(event.target.value)}>{Object.entries(OPERATIONS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
            {operation === 'ratio' && <label>결과 단위<input value={unit} onChange={event => setUnit(event.target.value)} placeholder="예: kWh/m³" /></label>}</div>
        <div className="report-rule-fields">{numeric.length ? numeric.map(field => <label key={field.id}><input type="checkbox" checked={fieldIds.includes(field.id)} onChange={event => setFieldIds(ids => event.target.checked ? [...ids, field.id] : ids.filter(id => id !== field.id))} />{fieldIds.includes(field.id) ? `${fieldIds.indexOf(field.id) + 1}. ` : ''}{field.group} / {field.label} ({field.unit || '단위 없음'})</label>) : <p>양식에서 숫자 항목을 먼저 지정하세요.</p>}</div>
        <div className="report-form-row"><label>기준 최솟값 (선택)<input value={min} onChange={event => setMin(event.target.value)} /></label><label>기준 최댓값 (선택)<input value={max} onChange={event => setMax(event.target.value)} /></label><label>기준 근거·적용 연도<input value={source} onChange={event => setSource(event.target.value)} placeholder="예: 현장 협의서 ○항, 적용 연도" /></label></div>
        <label className="report-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />이 현장에 적용할 기준과 결과 단위를 확인했습니다.</label>
        <details><summary>결과별 진단·개선 문구 등록 (선택)</summary><p>담당자가 확인한 문구를 이 규칙에서 재사용합니다. {'{value}, {unit}, {label}'}은 계산값으로 치환됩니다.</p><label>기준 범위 안일 때의 진단 문구<textarea rows={2} value={insideText} onChange={event => setInsideText(event.target.value)} /></label><label>기준 범위 밖일 때의 진단 문구<textarea rows={2} value={outsideText} onChange={event => setOutsideText(event.target.value)} /></label><label>기준 범위 밖일 때의 개선 검토 문구<textarea rows={2} value={recommendation} onChange={event => setRecommendation(event.target.value)} /></label></details>
        <button type="button" disabled={!label.trim() || !fieldIds.length} onClick={() => { onSave({ id: crypto.randomUUID(), label, operation, fieldIds, unit, criterion: min.trim() || max.trim() || source.trim() ? { min, max, source, confirmed } : null, narratives: { inside: insideText, outside: outsideText, recommendation } }); setLabel(''); setFieldIds([]); }}>계산 규칙에 추가</button>
    </details>;
}

function SchemaEditor({ workspace, change, onAnalysisRequest, onAnalyze, aiEnabled }) {
    const [tableId, setTableId] = useState(workspace.document.tables[0]?.id || '');
    const [filter, setFilter] = useState('');
    const [query, setQuery] = useState('');
    const [headerRows, setHeaderRows] = useState(1);
    const [labelColumns, setLabelColumns] = useState(1);
    const [candidateError, setCandidateError] = useState('');
    const table = workspace.document.tables.find(item => item.id === tableId);
    const shownTables = workspace.document.tables.filter(item => item.title.includes(filter));
    const paragraphs = query.trim() ? workspace.document.paragraphs.filter(p => !p.tableId && p.text.includes(query)).slice(0, 20) : [];
    const selected = new Set(workspace.fields.map(field => field.id));
    const toggle = cell => change(value => selected.has(cell.id) ? removeField(value, cell.id) : setField(value, proposeCellField(value.document, table, cell, headerRows, labelColumns)));
    const custom = () => change(value => setField(value, { id: `custom:${crypto.randomUUID()}`, label: '새 입력항목', group: '추가 조사 항목', type: 'text', unit: '', required: true, reference: '', binding: null }));
    const judgmentsOnly = () => {
        try {
            const candidates = proposeJudgmentFields(workspace.document, table, headerRows, labelColumns);
            change(value => {
                let next = value;
                for (const field of value.fields) if (field.binding?.tableId === table.id && (!field.valueSource || field.valueSource === 'input')) next = removeField(next, field.id);
                return addFields(next, candidates);
            });
            setCandidateError('');
        } catch (error) { setCandidateError(error.message); }
    };
    return <>
        <div className="report-card"><h2>원본에서 입력항목 지정</h2><p>표의 셀을 누르면 새 값을 받을 항목이 됩니다. 열 제목·행 이름은 후보 이름에만 사용합니다. 선택된 셀의 과거 값은 새 데이터에 복사되지 않습니다.</p>
            <div className="report-form-row"><label>표 제목 검색<input value={filter} onChange={event => setFilter(event.target.value)} /></label><label>원본 표<select value={tableId} onChange={event => setTableId(event.target.value)}>{!shownTables.some(t => t.id === tableId) && table && <option value={table.id}>{table.title}</option>}{shownTables.map((item, index) => <option value={item.id} key={item.id}>{index + 1}. {item.title} ({item.rows}행 × {item.columns}열)</option>)}</select></label></div>
            {table && <button onClick={() => onAnalysisRequest([table.id])}>이 표의 상세 분석 요청 저장</button>}
            {table && <button disabled={!aiEnabled} onClick={() => onAnalyze([table.id])}>AI로 이 표의 입력항목 분석</button>}
            {table && <div className="report-judgment-choice"><button onClick={judgmentsOnly}>이 표는 판정란만 다시 작성</button><p>수배전설비처럼 목록이 유지되는 표는 장비명·규격을 남기고 판정 열만 선택합니다. 그 밖의 측정값은 바꿀 셀만 직접 선택하세요.</p></div>}
            {table ? <><p className="report-muted">위치: {table.id} · 같은 제목의 연속 표도 각각 확인하세요.</p><div className="report-form-row"><label>위쪽 제목 행 수<input type="number" min="0" value={headerRows} onChange={event => setHeaderRows(Number(event.target.value))} /></label><label>왼쪽 이름 열 수<input type="number" min="0" value={labelColumns} onChange={event => setLabelColumns(Number(event.target.value))} /></label><button onClick={() => { try { const candidates = proposeTableFields(workspace.document, table, headerRows, labelColumns); change(value => addFields(value, candidates)); setCandidateError(''); } catch (err) { setCandidateError(err.message); } }}>이 표의 입력 양식 자동 생성</button></div><p>제목 행과 이름 열을 제외한 셀을 후보 양식으로 만듭니다. 단위와 자료형을 확인하고 불필요한 항목은 제외하세요.</p>{candidateError && <p role="alert" className="report-error">{candidateError}</p>}<div className="report-table-scroll"><table className="report-source-table"><tbody>{Array.from({ length: table.rows }, (_, row) => <tr key={row}>{table.cells.filter(cell => cell.row === row).sort((a, b) => a.column - b.column).map(cell => <td key={cell.id} rowSpan={cell.rowSpan} colSpan={cell.colSpan} className={selected.has(cell.id) ? 'selected' : ''}><button type="button" onClick={() => toggle(cell)} aria-pressed={selected.has(cell.id)} title={`행 ${cell.row + 1}, 열 ${cell.column + 1}\n${cell.text}`}>{cell.text || '(빈 셀)'}{selected.has(cell.id) && <strong>입력 대상</strong>}</button></td>)}</tr>)}</tbody></table></div></> : <p>추출한 표가 없습니다. 문단 검색 또는 추가 항목을 사용하세요.</p>}
            <details><summary>문단에서 입력항목 지정</summary><input aria-label="원본 문단 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="시설명·장 제목·본문 검색 (최대 20개 표시)" />{paragraphs.map(p => <div className="report-paragraph" key={p.id}><p>{p.text}</p><button disabled={selected.has(p.id)} onClick={() => change(value => setField(value, { id: p.id, label: p.text.slice(0, 60), group: '본문 교체 항목', type: 'text', unit: '', required: true, reference: p.text, binding: { sourceSha256: value.source.sha256, paragraphId: p.id, ...p.anchor } }))}>{selected.has(p.id) ? '추가됨' : '입력항목으로 추가'}</button></div>)}</details>
        </div>
        <div className="report-card"><div className="report-toolbar"><h2>입력 양식 · 버전 {workspace.revision}</h2><button onClick={custom}>항목 직접 추가</button></div><p>항목 이름에 처리장·실명·설비번호·측정기간을 포함하면 같은 TAG를 구분할 수 있습니다. 새 설비·추가 측정값도 직접 추가할 수 있습니다.</p>
            <div className="report-table-scroll"><table><thead><tr><th>그룹 / 설비·기간</th><th>입력항목 이름</th><th>자료형</th><th>단위</th><th>필수</th><th>원본 참고값</th><th>관리</th></tr></thead><tbody>{workspace.fields.map(field => <tr key={field.id}><td><input aria-label="입력 그룹" value={field.group} onChange={event => change(value => setField(value, { ...field, group: event.target.value }))} /></td><td><input aria-label="항목 이름" value={field.label} onChange={event => change(value => setField(value, { ...field, label: event.target.value }))} /></td><td><select aria-label="자료형" value={field.type} onChange={event => change(value => setField(value, { ...field, type: event.target.value }))}><option value="text">문자</option><option value="number">숫자</option><option value="date">날짜</option></select></td><td><input aria-label="단위" className="report-unit" value={field.unit} onChange={event => change(value => setField(value, { ...field, unit: event.target.value }))} /></td><td><input aria-label="필수 입력" type="checkbox" checked={field.required} onChange={event => change(value => setField(value, { ...field, required: event.target.checked }))} /></td><td className="report-reference">{field.reference || '없음'}</td><td><button onClick={() => change(value => removeField(value, field.id))}>제외</button></td></tr>)}</tbody></table></div>
            {!workspace.fields.length && <p>원본 표의 셀을 선택하거나 항목을 직접 추가하세요.</p>}
        </div>
        <RuleEditor workspace={workspace} onSave={rule => change(value => setRule(value, rule))} />
        <NativeBindings workspace={workspace} change={change} />
        {!!workspace.rules.length && <div className="report-card"><h2>저장된 계산 규칙</h2>{workspace.rules.map(rule => <div className="report-rule" key={rule.id}><span><strong>{rule.label}</strong> · {OPERATIONS[rule.operation]}<br />{rule.fieldIds.map(id => workspace.fields.find(f => f.id === id)?.label || '(제외된 항목)').join(' → ')}{rule.criterion && <small>기준: {rule.criterion.min || '하한 없음'} ~ {rule.criterion.max || '상한 없음'} / {rule.criterion.source}</small>}</span><button onClick={() => change(value => removeRule(value, rule.id))}>삭제</button></div>)}</div>}
    </>;
}

function ReportProject({ project, userId, aiStatus, discipline }) {
    const [workspace, setWorkspace] = useState(null);
    const [saved, setSaved] = useState([]);
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState('');
    const [proposal, setProposal] = useState(null);
    const [collectionPreview, setCollectionPreview] = useState(null);
    const [externalProposal, setExternalProposal] = useState(null);
    const [overwriteExternal, setOverwriteExternal] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(null);
    const analysisProposal = workspace?.analysisProposal || null;
    const [loadingSaved, setLoadingSaved] = useState(true);
    const section = reportSection(discipline);
    const filename = name => `${section.label}-${name}`;
    const worker = useRef(null);
    const alive = useRef(true);
    const latest = useRef(null);
    const job = useRef(0);
    const source = useRef(null);
    const activeAi = useRef(null);
    const collectionPreviewElement = useRef(null);
    useEffect(() => {
        if (collectionPreview) collectionPreviewElement.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [collectionPreview]);
    useEffect(() => {
        const jobs = job;
        alive.current = true;
        listWorkspaces(userId, project.id, discipline).then(items => {
            if (alive.current) { setSaved(items); setWorkspace(items[0] || null); }
        }).catch(err => { if (alive.current) setError(err.message); }).finally(() => { if (alive.current) setLoadingSaved(false); });
        return () => { alive.current = false; jobs.current++; worker.current?.terminate(); activeAi.current?.cancel().catch(() => {}); if (latest.current) saveWorkspace(userId, latest.current).catch(() => {}); };
    }, [userId, project.id, discipline]);
    useEffect(() => {
        latest.current = workspace;
        if (!workspace) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            setSaveStatus('저장 중…');
            saveWorkspace(userId, workspace).then(() => { if (!cancelled) { setSaveStatus('이 PC에 저장됨'); setSaved(items => [workspace, ...items.filter(item => item.source.sha256 !== workspace.source.sha256)]); } }).catch(err => { if (!cancelled) { setSaveStatus('저장 실패 — 백업을 내보내세요.'); setError(err.message); } });
        }, 500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [workspace, userId]);
    const change = updater => {
        setCollectionPreview(null);
        setExternalProposal(null);
        if (typeof updater !== 'function' && latest.current && updater.source.sha256 !== latest.current.source.sha256) {
            saveWorkspace(userId, latest.current).catch(err => { if (alive.current) setError(err.message); });
            setProposal(null);
        }
        setError(''); setSaveStatus('저장 대기'); setWorkspace(updater);
    };
    const run = action => { try { action(); setError(''); } catch (err) { setError(err.message); } };
    const runAsync = async action => { try { await action(); if (alive.current) setError(''); } catch (err) { if (alive.current) setError(err.message); } };
    const upload = async file => {
        if (!file) return;
        const currentJob = ++job.current;
        worker.current?.terminate();
        setBusy('analyze'); setError('');
        try {
            if (file.size > 160 * 1024 * 1024) throw new Error('160MB 이하의 HWP/HWPX 파일을 선택하세요.');
            const bytes = await file.arrayBuffer();
            if (!alive.current || currentJob !== job.current) return;
            const parser = new Worker(new URL('../services/report/report.worker.js', import.meta.url), { type: 'module' });
            worker.current = parser;
            parser.onmessage = ({ data }) => {
                parser.terminate(); worker.current = null;
                if (!alive.current || currentJob !== job.current) return;
                setBusy(false);
                if (data.error) { setError(data.error); return; }
                const existing = latest.current?.source.sha256 === data.document.source.sha256 ? latest.current : saved.find(item => item.source.sha256 === data.document.source.sha256);
                source.current = { sha256: data.document.source.sha256, bytes: new Uint8Array(data.sourceBytes) };
                saveReportSource(userId, project.id, data.document.source.sha256, source.current.bytes, discipline).catch(err => { if (alive.current) setError(`원본 보관 실패: ${err.message}`); });
                change(existing ? { ...existing, discipline, document: data.document } : { ...createWorkspace(project, data.document), discipline });
                setProposal(null);
                setStep(1);
            };
            parser.onerror = () => { parser.terminate(); worker.current = null; if (alive.current && currentJob === job.current) { setBusy(false); setError('분석기를 실행하지 못했습니다. 파일 형식과 앱 실행 상태를 확인하세요.'); } };
            parser.postMessage({ bytes, filename: file.name }, [bytes]);
        } catch (err) { if (alive.current && currentJob === job.current) { setBusy(false); setError(err.message); } }
    };
    const importBackup = async file => {
        if (!file) return;
        try {
            if (file.size > 40 * 1024 * 1024) throw new Error('40MB 이하의 엔진 백업을 선택하세요.');
            const value = validateBackup(JSON.parse(await file.text()), project.id, discipline);
            if (alive.current) { change(value); setStep(1); }
        } catch (err) { if (alive.current) setError(err.message); }
    };
    const exportForm = () => runAsync(async () => download(filename('빈-조사양식.html'), collectionFormHtml(await createCollectionForm(workspace, { scope: 'manual' })), 'text/html'));
    const nativeCollection = (action, file) => runAsync(async () => {
        if (action === 'import-collection' && !file) return;
        const snapshot = workspace, currentJob = ++job.current;
        setBusy(action === 'import-collection' ? 'form-import' : 'form-export');
        setCollectionPreview(null);
        try {
            if (file?.size > 160 * 1024 * 1024) throw new Error('160MB 이하의 작성한 HWPX 양식을 선택하세요.');
            const original = source.current?.sha256 === snapshot.source.sha256 ? source.current.bytes : await loadReportSource(userId, project.id, snapshot.source.sha256, discipline);
            const filledBytes = file ? await file.arrayBuffer() : undefined;
            if (!alive.current || currentJob !== job.current) return;
            const bytes = original.slice().buffer;
            const handler = new Worker(new URL('../services/report/report.worker.js', import.meta.url), { type: 'module' });
            worker.current = handler;
            handler.onmessage = ({ data }) => {
                handler.terminate(); worker.current = null;
                if (!alive.current || currentJob !== job.current) return;
                setBusy(false);
                if (data.error) { setError(data.error); return; }
                if (latest.current !== snapshot) { setError('조사 양식 처리 중 작업이 변경되었습니다. 최신 양식으로 다시 실행하세요.'); return; }
                if (data.collectionFile) download(filename('빈-조사양식.hwpx'), data.collectionFile.bytes, 'application/octet-stream');
                if (data.collectionPreview) { setCollectionPreview(data.collectionPreview); setStep(2); }
            };
            handler.onerror = () => { handler.terminate(); worker.current = null; if (alive.current && currentJob === job.current) { setBusy(false); setError('한글 조사 양식을 처리하지 못했습니다. 파일과 앱 실행 상태를 확인하세요.'); } };
            handler.postMessage({ action, workspace: snapshot, bytes, filledBytes, filename: file?.name, options: { scope: 'manual' } }, filledBytes ? [bytes, filledBytes] : [bytes]);
        } catch (err) { if (alive.current && currentJob === job.current) setBusy(false); throw err; }
    });
    const applyCollectionPreview = () => runAsync(async () => {
        const snapshot = latest.current, preview = collectionPreview;
        if (!preview || preview.inputFingerprint !== await fingerprint({ values: snapshot.values, revision: snapshot.revision })) throw new Error('미리보기 이후 입력값이 바뀌었습니다. 작성한 양식을 다시 불러오세요.');
        const next = await importCollectionData(snapshot, preview.collection);
        if (!alive.current) return;
        if (latest.current !== snapshot) throw new Error('데이터 확인 중 작업이 바뀌었습니다. 양식을 다시 불러오세요.');
        change({ ...next, lastCollectionImport: preview.collection.collectedFrom }); setStep(2);
    });
    const exportAnalysis = tableIds => runAsync(async () => download('report-analysis-request.json', toJson(await createAnalysisRequest(workspace, tableIds))));
    const runAi = (kind, tableIds = []) => runAsync(async () => {
        const snapshot = workspace, currentJob = ++job.current;
        if (kind !== 'analysis') {
            const check = draftReadiness(snapshot);
            if (!check.ready) { setStep(2); throw new Error(check.errors.join('\n')); }
        }
        setBusy('ai');
        const active = () => alive.current && currentJob === job.current && latest.current === snapshot;
        const execute = async request => {
            if (!active()) throw new Error('작업이 변경되었습니다. 최신 데이터로 다시 요청하세요.');
            const task = startReportAi(request); activeAi.current = task;
            const result = await task.result;
            if (!active()) throw new Error('AI 작업 중 데이터·양식이 변경되었습니다. 다시 요청하세요.');
            return result;
        };
        try {
            if (kind === 'analysis') {
                const result = await analyzeWorkflow(snapshot, execute, { tableIds, previous: analysisProposal, active, onProgress: setAnalysisProgress });
                if (!active()) return;
                change({ ...snapshot, lastAi: result.lastAi, analysisProposal: result.response }); setStep(1);
            } else {
                const result = await execute(await createInterpretationRequest(snapshot.draft ? snapshot : buildDraft(snapshot)));
                const next = await applyInterpretation(snapshot, result.response);
                if (!active()) return;
                change({ ...buildDraft(next), lastAi: { model: result.model, cacheHit: result.cacheHit, usage: result.usage, generatedAt: new Date().toISOString() } });
                setProposal(null); setStep(3);
            }
        } catch (error) {
            if (!alive.current || currentJob !== job.current) return;
            throw error;
        } finally { if (alive.current && currentJob === job.current) { activeAi.current = null; setBusy(false); setAnalysisProgress(null); } }
    });
    const applyAnalysisPlan = () => runAsync(async () => {
        const snapshot = latest.current, next = await applyAnalysis(snapshot, analysisProposal);
        if (!alive.current) return;
        if (latest.current !== snapshot) throw new Error('양식이 변경되었습니다. 분석 결과를 다시 확인하세요.');
        change(next); setStep(1);
    });
    const sourceScope = () => ({ userId, projectId: String(project.id), discipline, sourceSha256: workspace.source.sha256 });
    const openSource = () => runAsync(async () => {
        if (!window.electron?.invoke) throw new Error('한전 조회 창은 설치형 앱에서 사용할 수 있습니다.');
        setBusy('source-open');
        try { const result = await window.electron.invoke('report-source-open', sourceScope()); if (!result) throw new Error('앱을 재시작해 한전 자료 수집 연결을 적용하세요.'); }
        finally { if (alive.current) setBusy(false); }
    });
    const collectSource = () => runAsync(async () => {
        if (!window.electron?.invoke) throw new Error('한전 자료 수집은 설치형 앱에서 사용할 수 있습니다.');
        const snapshot = workspace, currentJob = ++job.current;
        setBusy('collection'); setExternalProposal(null); setOverwriteExternal(false);
        try {
            const capture = await window.electron.invoke('report-source-capture', sourceScope());
            if (!alive.current || currentJob !== job.current) return;
            if (latest.current !== snapshot) throw new Error('조회 중 보고서 작업이 변경되었습니다. 다시 수집하세요.');
            if (!capture) throw new Error('앱을 재시작해 한전 자료 수집 연결을 적용하세요.');
            const request = await createCollectionExtractionRequest(snapshot, capture);
            const task = startReportAi(request); activeAi.current = task;
            const result = await task.result;
            const next = await validateCollectedValues(snapshot, capture, result.response);
            if (!alive.current || currentJob !== job.current) return;
            if (latest.current !== snapshot) throw new Error('자료 정리 중 입력값이 변경되었습니다. 다시 수집하세요.');
            setExternalProposal(next); setStep(2);
        } finally { if (alive.current && currentJob === job.current) { activeAi.current = null; setBusy(false); } }
    });
    const applyExternal = () => runAsync(async () => {
        const snapshot = latest.current;
        const next = await applyCollectedValues(snapshot, externalProposal, overwriteExternal);
        if (!alive.current) return;
        if (latest.current !== snapshot) throw new Error('자료 적용 중 작업이 변경되었습니다. 다시 확인하세요.');
        change(next); setStep(2);
    });
    const importAnalysis = file => runAsync(async () => {
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) throw new Error('8MB 이하의 구조 분석 결과를 선택하세요.');
        const result = JSON.parse(await file.text()), snapshot = latest.current;
        await validateAnalysis(snapshot, result);
        if (!alive.current) return;
        if (latest.current !== snapshot) throw new Error('양식이 변경되었습니다. 분석 결과를 다시 가져오세요.');
        change({ ...snapshot, analysisProposal: result });
    });
    const importData = file => runAsync(async () => {
        if (!file) return;
        if (file.size > 40 * 1024 * 1024) throw new Error('40MB 이하의 조사 데이터 파일을 선택하세요.');
        const data = JSON.parse(await file.text());
        const snapshot = latest.current;
        const next = await importCollectionData(snapshot, data);
        if (!alive.current) return;
        if (latest.current !== snapshot) throw new Error('가져오는 동안 작업이 변경되었습니다. 다시 가져오세요.');
        change(next); setProposal(null); setStep(2);
    });
    const importProposal = file => runAsync(async () => {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) throw new Error('2MB 이하의 해석 결과를 선택하세요.');
        const data = JSON.parse(await file.text());
        const snapshot = latest.current;
        const result = await validateInterpretation(snapshot, data);
        if (!alive.current) return;
        if (latest.current !== snapshot) throw new Error('해석 결과를 확인하는 동안 작업이 변경되었습니다. 다시 가져오세요.');
        setProposal(result);
    });
    const exportNative = mode => runAsync(async () => {
        const snapshot = workspace;
        const plan = planNativeWrite(snapshot, mode);
        if (plan.errors.length) throw new Error(plan.errors.join('\n'));
        const currentJob = ++job.current;
        setBusy('write');
        try {
            const original = source.current?.sha256 === snapshot.source.sha256 ? source.current.bytes : await loadReportSource(userId, project.id, snapshot.source.sha256, discipline);
            if (!alive.current || currentJob !== job.current) return;
            const bytes = original.slice().buffer;
            const writer = new Worker(new URL('../services/report/report.worker.js', import.meta.url), { type: 'module' });
            worker.current = writer;
            writer.onmessage = ({ data }) => {
                writer.terminate(); worker.current = null;
                if (!alive.current || currentJob !== job.current) return;
                setBusy(false);
                if (data.error) { setError(data.error); return; }
                if (latest.current !== snapshot) { setError('작성 중 데이터가 변경되었습니다. 최신 데이터로 다시 작성하세요.'); return; }
                download(filename(mode === 'blank' ? '빈-작업본.hwpx' : '보고서-초안.hwpx'), data.native.bytes, 'application/octet-stream');
                download(filename('초안-검토사항.json'), toJson(data.native.review));
            };
            writer.onerror = () => { writer.terminate(); worker.current = null; if (alive.current && currentJob === job.current) { setBusy(false); setError('한글 작성기를 실행하지 못했습니다.'); } };
            writer.postMessage({ action: 'write-native', bytes, workspace: snapshot, mode }, [bytes]);
        } catch (err) { if (alive.current && currentJob === job.current) setBusy(false); throw err; }
    });
    const confirmed = workspace?.confirmedRevision === workspace?.revision;
    const validation = workspace ? validateData(workspace) : null;
    const readiness = draftReadiness(workspace);
    const createLocalDraft = () => run(() => {
        if (!readiness.ready) { setStep(2); throw new Error(readiness.errors.join('\n')); }
        change(buildDraft(workspace)); setStep(3);
    });
    return <>
        <ReportWorkflowPanel workspace={workspace} busy={busy} aiEnabled={!!aiStatus?.configured} change={change} onAnalyze={() => runAi('analysis')} onApplyAnalysis={applyAnalysisPlan}
            onConfirm={() => run(() => { change(confirmSchema(workspace)); setStep(2); })} onExportForm={() => nativeCollection('export-collection')}
            onData={() => setStep(2)} onGenerate={() => runAi('interpretation')} onViewDraft={() => setStep(3)} onOpenSource={openSource} onCollect={collectSource} analysisProgress={analysisProgress} />
        <div className="report-overview" aria-label={`${section.label} 보고서 작업 현황`}>
            <section className="report-card"><small>01 · 기존 보고서</small><h2>{section.label} 보고서 등록</h2>
                <p className="report-source-name">{loadingSaved ? '저장된 작업 확인 중…' : workspace?.source.filename || '이 분야의 기존 보고서를 올려주세요.'}</p>
                {workspace && <p className="report-muted">표 {workspace.document.tables.length}개 · 문단 {workspace.document.paragraphs.length}개</p>}
                <label className="report-file">기존 보고서 올리기<input type="file" accept=".hwp,.hwpx" disabled={!!busy || loadingSaved} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
                <button disabled={!workspace || !!busy} onClick={() => setStep(1)}>보고서 · 분석 내용 보기</button>
            </section>
            <section className="report-card"><small>02 · 조사 양식</small><h2>빈 양식 내보내기</h2>
                <p>{workspace ? `조사 항목 ${readiness.total}개 · ${confirmed ? '양식 확정됨' : '분석·양식 확인 필요'}` : '기존 보고서를 분석하면 조사 항목을 만들 수 있습니다.'}</p>
                <button disabled={!workspace || !confirmed || !!busy || workspace.document.format !== 'hwpx'} onClick={() => nativeCollection('export-collection')}>빈 한글 양식 내보내기 · HWPX</button>
                <label className="report-file">작성한 한글 양식 불러오기<input type="file" accept=".hwpx" disabled={!workspace || !confirmed || !!busy || workspace.document.format !== 'hwpx'} onChange={event => { nativeCollection('import-collection', event.target.files?.[0]); event.target.value = ''; }} /></label>
                <small>선택한 표를 한 파일로 묶고 입력 칸만 비웁니다. 한글에서 작성·저장한 HWPX를 다시 불러오세요.</small>
                {workspace?.document.format === 'hwp' && <small>기존 HWP 보고서를 한글에서 HWPX 사본으로 저장해 등록하세요.</small>}
            </section>
            <section className="report-card"><small>03 · 데이터 확인 및 작성</small><h2>보고서 초안 작성</h2>
                <p className={`report-status ${readiness.ready ? 'ready' : ''}`}>{readiness.ready ? '입력 확인 완료 · 초안 작성 가능' : '입력 데이터 확인 필요'}</p>
                <p>전체 {readiness.filled}/{readiness.total}개 작성 · 필수 {readiness.requiredFilled}/{readiness.required}개 작성</p>
                <button disabled={!workspace || !!busy} onClick={() => setStep(2)}>작성 데이터 확인 · 입력</button>
                <button className="primary" disabled={!readiness.ready || !aiStatus?.configured || !!busy} onClick={() => runAi('interpretation')}>AI 보고서 초안 작성</button>
                {!aiStatus?.configured && <small>상단 ‘보고서 AI 설정’에서 연결을 설정하세요.</small>}
                {!readiness.ready && <small>{readiness.errors[0]}</small>}
            </section>
            <section className="report-card"><small>04 · 결과물</small><h2>초안 내려받기</h2>
                <p>{workspace?.draft ? `초안 작성됨 · ${new Date(workspace.draft.generatedAt).toLocaleString('ko-KR')}` : '데이터 확인 후 초안을 작성하세요.'}</p>
                <button className="primary" disabled={!workspace?.draft || !!busy || workspace.document.format !== 'hwpx'} onClick={() => exportNative('draft')}>한글 초안 내려받기 · HWPX</button>
                <button disabled={!workspace?.draft || !!busy} onClick={() => download(filename('보고서-초안.html'), draftHtml(workspace.draft), 'text/html')}>검토용 HTML 내려받기</button>
                <button disabled={!workspace || !!busy} onClick={() => setStep(3)}>초안 내용 보기</button>
                {workspace?.document.format === 'hwp' && <small>한글 초안 출력에는 HWPX 사본을 등록해 사용하세요.</small>}
                <small>그림·쪽 배치·최종 결론은 내려받은 한글 초안에서 수정합니다.</small>
            </section>
        </div>
        {workspace && <section className="report-card report-analysis-summary"><div className="report-toolbar"><h2>{section.label} 보고서 분석 현황</h2><button disabled={!!busy} onClick={() => setStep(1)}>분석 내용 · 양식 편집</button></div>
            <p>교체·작성 항목 {workspace.fields.length}개 · 계산 규칙 {workspace.rules.length}개 · 확인할 자료 {workspace.analysisRequests?.length || 0}건</p>
            {!workspace.fields.length && <p>‘분석 내용 · 양식 편집’에서 AI 분석을 실행하고 조사 항목을 확인하세요.</p>}
            {analysisProposal && <p>분석 후보 {analysisProposal.fields.length}개가 도착했습니다. 양식에 반영할 후보를 확인하세요.</p>}
            {!!workspace.analysisRequests?.length && <details><summary>분석에서 요청한 자료 확인</summary><ul>{workspace.analysisRequests.map((question, index) => <li key={index}>{question}</li>)}</ul></details>}
            {workspace.draft?.results?.length > 0 && <details><summary>진단 데이터 계산 결과 보기</summary>{workspace.draft.results.map(result => <p key={result.id}>{result.text}</p>)}</details>}
        </section>}
        <div className="report-steps">{['기존 보고서', '입력 양식', '진단 데이터', '보고서 초안'].map((label, index) => <button key={label} className={index === step ? 'active' : ''} disabled={index > 0 && !workspace} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</div>
        {error && <p className="report-error" role="alert">{error}</p>}
        {externalProposal && <section className="report-card report-collection-preview"><h2>수집 자료 · 보고서 입력 연결 확인</h2><p>{externalProposal.capture.title} · {externalProposal.capture.capturedAt}</p><p>원본 조회 화면의 고객·연도·월·단위를 확인하세요. 기존 입력값과 다른 값은 아래 덮어쓰기 선택 전에는 교체하지 않습니다.</p>
            <div className="report-table-scroll"><table><thead><tr><th>설비·기간</th><th>입력항목</th><th>현재 값</th><th>수집 값</th><th>단위</th><th>원본 셀·제목</th></tr></thead><tbody>{externalProposal.cells.map(item => <tr key={item.fieldId}><td>{item.group}</td><td>{item.label}</td><td>{item.previous}</td><td>{item.value}</td><td>{item.unit}</td><td>{item.quotedText}<small>{item.sourceHeaders}</small></td></tr>)}</tbody></table></div>
            {!externalProposal.cells.length && <p>현재 표와 확실히 연결할 수 있는 입력항목이 없습니다. 아래 확인사항을 검토하고 해당 기간의 조회 표를 다시 선택하세요.</p>}
            <ul>{externalProposal.questions.map((question, i) => <li key={i}>{question}</li>)}</ul><label className="report-check"><input type="checkbox" checked={overwriteExternal} onChange={event => setOverwriteExternal(event.target.checked)} />현재 입력된 값과 다르더라도 확인한 수집 값으로 교체</label>
            <button className="primary" disabled={!!busy} onClick={applyExternal}>확인한 수집 값과 출처 적용</button><button onClick={() => setExternalProposal(null)}>적용하지 않고 닫기</button>
        </section>}
        {collectionPreview && <section ref={collectionPreviewElement} className="report-card report-collection-preview"><h2>작성한 한글 양식 · 데이터 확인</h2><p>{collectionPreview.collection.collectedFrom.filename} · {collectionPreview.rows.length}개 입력항목을 읽었습니다. 새 값을 확인하고 적용하면 원래 보고서의 연결된 판정·측정 칸에 반영됩니다.</p>
            {!!collectionPreview.errors.length && <div className="report-error"><strong>입력 확인 {collectionPreview.errors.length}건</strong><ul>{collectionPreview.errors.slice(0, 10).map((error, i) => <li key={i}>{error}</li>)}</ul><p>일부 데이터만 적용할 수 있으며, 필수값·입력 오류를 해결한 뒤 초안을 작성할 수 있습니다.</p></div>}
            {!!collectionPreview.warnings.length && <ul>{collectionPreview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
            <div className="report-table-scroll"><table><thead><tr><th>분류·설비</th><th>입력항목</th><th>현재 값</th><th>불러온 새 값</th><th>단위</th></tr></thead><tbody>{collectionPreview.rows.map(row => <tr key={row.id}><td>{row.group}</td><td>{row.label}</td><td>{String(row.previous ?? '').trim() ? row.previous : '미입력'}</td><td className="report-prewrap">{row.value || '미입력'}</td><td>{row.unit}</td></tr>)}</tbody></table></div>
            <div className="report-toolbar"><button className="primary" disabled={!!busy} onClick={applyCollectionPreview}>확인한 데이터를 보고서에 적용</button><button onClick={() => setCollectionPreview(null)}>적용하지 않고 닫기</button></div>
        </section>}
        {busy && <p role="status">{busy === 'ai' ? 'AI가 보고서 초안을 분석·작성 중…' : busy === 'form-import' ? '작성한 한글 양식에서 새 데이터 읽는 중…' : busy === 'form-export' ? '필요한 표를 한글 조사 양식으로 모으는 중…' : busy === 'write' ? '한글 원본에 새 내용 적용 중…' : '보고서 구조 분석 중…'} 잠시 걸릴 수 있습니다. <button onClick={() => { job.current++; worker.current?.terminate(); worker.current = null; activeAi.current?.cancel().catch(() => {}); activeAi.current = null; setBusy(false); setAnalysisProgress(null); }}>취소</button></p>}
        {step === 0 && <div className="report-card"><h2>{project.title} · {section.label} 기존 보고서</h2><p>HWP 5 또는 HWPX 원본을 등록하세요. 이 분야의 보고서·분석·조사 데이터는 따로 보관합니다. 원본 한글 파일은 계속 보관해 주세요.</p>
            <label className="report-file">엔진 백업 불러오기<input type="file" accept=".json" disabled={busy} onChange={event => { importBackup(event.target.files?.[0]); event.target.value = ''; }} /></label>
            <h3>이 분야에 저장한 보고서별 작업</h3>{saved.map(item => <button disabled={!!busy} className={`report-saved ${workspace?.source.sha256 === item.source.sha256 ? 'primary' : ''}`} key={item.source.sha256} onClick={() => { change(item); setStep(1); }}>{item.source.filename} · 항목 {item.fields.length}개 · {item.updatedAt.slice(0, 10)}</button>)}{!saved.length && <p>저장한 작업이 없습니다.</p>}
        </div>}
        {workspace && <div className="report-toolbar report-meta"><span>{workspace.source.filename} · {workspace.document.tables.length}개 표 · {workspace.fields.length}개 입력항목 · 양식 {confirmed ? '확정됨' : '확인 필요'}<small>원본: {workspace.source.sha256.slice(0, 16)}… · {saveStatus}</small></span><button onClick={() => download(filename('보고서-작업백업.json'), toJson(workspace))}>전체 작업 백업</button><button onClick={() => { change(startNewRun(workspace)); setStep(2); }}>양식 재사용 · 새 진단 시작</button>{workspace.runs?.length > 0 && <button onClick={() => run(() => { change(restoreLastRun(workspace)); setStep(2); })}>직전 진단 데이터 복원</button>}</div>}
        {workspace?.lastAi && <p className="report-muted">최근 AI 작업: {workspace.lastAi.model} · {workspace.lastAi.cacheHit ? '같은 요청의 저장 결과 재사용' : '새로 생성한 초안'}</p>}
        {workspace?.lastCollectionImport && <p className="report-muted">최근 불러온 한글 조사 양식: {workspace.lastCollectionImport.filename} · 새 측정값·판정을 적용했습니다.</p>}
        {workspace && step === 1 && <div className="report-card"><h2>현장별 입력 양식 분석</h2><p>기존 보고서에서 새로 조사할 항목과 진단 문단의 위치를 AI가 제안합니다. 후보를 확인한 뒤 빈 조사 양식을 만드세요.</p><button className="primary" disabled={!aiStatus?.configured || !!busy} onClick={() => runAi('analysis')}>AI 보고서 분석 · 입력항목 후보 만들기</button>{analysisProposal?.needsTableIds?.length > 0 && <><p>추가로 확인할 표: {analysisProposal.needsTableIds.map(id => workspace.document.tables.find(table => table.id === id)?.title || id).join(', ')}</p><button disabled={!aiStatus?.configured || !!busy} onClick={() => runAi('analysis', analysisProposal.needsTableIds)}>요청한 표를 이어서 분석</button></>}</div>}
        {workspace && step === 1 && <><details className="report-card" open={!!analysisProposal}><summary>입력항목 후보 확인 · 파일 연결 (고급)</summary><p>AI가 제안한 입력항목과 자료 요청을 확인하세요. 필요한 표만 이어서 분석할 수 있으며, 요청·결과 파일로 연결하는 방식도 사용할 수 있습니다.</p><button onClick={() => exportAnalysis([])}>보고서 구조 분석 요청 저장</button><label>분석 결과 가져오기<input type="file" accept=".json" onChange={event => { importAnalysis(event.target.files?.[0]); event.target.value = ''; }} /></label>{analysisProposal && <><p>입력항목 후보 {analysisProposal.fields.length}개 · 자료 요청 {analysisProposal.questions.length}개</p><div className="report-table-scroll"><table><thead><tr><th>분류</th><th>입력·작성 항목</th><th>단위</th></tr></thead><tbody>{analysisProposal.fields.map((field, index) => <tr key={index}><td>{field.group}</td><td>{field.label}</td><td>{field.unit}</td></tr>)}</tbody></table></div><ul>{analysisProposal.questions.map((question, index) => <li key={index}>{question}</li>)}</ul><button onClick={applyAnalysisPlan}>분석 후보를 양식에 추가 · 확인</button></>}{Array.isArray(workspace.analysisRequests) && !!workspace.analysisRequests.length && <><h3>양식 확인에 필요한 자료</h3><ul>{workspace.analysisRequests.map((question, index) => <li key={index}>{question}</li>)}</ul></>}</details><SchemaEditor key={workspace.source.sha256} workspace={workspace} change={change} onAnalysisRequest={exportAnalysis} onAnalyze={tableIds => runAi('analysis', tableIds)} aiEnabled={!!aiStatus?.configured && !busy} /><div className="report-toolbar"><p>확정한 항목·단위·규칙은 이 원본 버전에서 재사용됩니다. 변경하면 다시 확인해야 합니다.</p><button className="primary" onClick={() => run(() => { const next = confirmSchema(workspace); change(next); setStep(2); })}>양식 확정 · 데이터 입력</button></div></>}
        {workspace && step === 2 && <><div className="report-card"><h2>새 진단 데이터 입력</h2><p>측정값에 단위를 붙이지 말고 숫자만 입력하세요. 그림 교체·쪽 넘김·최종 결론은 출력한 한글 초안에서 담당자가 수정합니다.</p>{!confirmed && <p className="report-error">양식이 확정되지 않았습니다. 입력 양식 탭에서 확인하세요.</p>}
            <div className="report-toolbar"><button disabled={!confirmed || !!busy || workspace.document.format !== 'hwpx'} onClick={() => nativeCollection('export-collection')}>빈 한글 양식 내보내기 · HWPX</button></div><label className="report-file">작성한 한글 양식 불러오기 (.hwpx)<input type="file" accept=".hwpx" disabled={!confirmed || !!busy || workspace.document.format !== 'hwpx'} onChange={event => { nativeCollection('import-collection', event.target.files?.[0]); event.target.value = ''; }} /></label><p className="report-muted">장비명·규격 등 고정 내용은 유지하고 선택한 판정·측정 칸만 비웁니다. 작성한 파일을 불러온 뒤 아래 미리보기에서 새 값을 확인·적용하세요. 표·셀을 삭제하거나 입력 셀의 필드 이름을 지우면 해당 위치를 찾을 수 없습니다.</p>
            <details><summary>다른 조사 양식 · 데이터 연결</summary><button disabled={!confirmed || !!busy} onClick={exportForm}>HTML 조사 양식 내보내기</button><label>HTML 조사 데이터 가져오기 (JSON)<input type="file" accept=".json" disabled={!!busy} onChange={event => { importData(event.target.files?.[0]); event.target.value = ''; }} /></label><button disabled={!confirmed || !!busy || workspace.document.format !== 'hwpx'} onClick={() => exportNative('blank')}>보고서 전체의 지정 구간을 비운 작업본</button><small>전체 작업본에는 조사 대상 밖의 과거 내용이 남습니다. 다시 불러올 조사 양식은 ‘빈 한글 양식 내보내기’를 사용하세요.</small></details>
            {Array.isArray(workspace.interpretation?.questions) && !!workspace.interpretation.questions.length && <><h3>평가에 필요한 추가 자료</h3><ul>{workspace.interpretation.questions.map((question, index) => <li key={index}>{question}</li>)}</ul><p>답변은 관련 입력항목 또는 현장 메모에 기록한 뒤 다시 평가하세요.</p></>}
            {workspace.interpretationStale && <div className="report-error">이전 평가 이후 데이터·양식이 변경되었습니다. 초안에서 최신 데이터로 AI 해석을 다시 요청하거나, 아래 진단 문구를 직접 재검토하세요.<button onClick={() => change(confirmManualNotes(workspace))}>현재 데이터에 대한 진단 문구 수동 재검토 완료</button></div>}
            {inputFields(workspace).map(field => <label className="report-data-field" key={field.id}><span>{field.group} / {field.label} {field.required ? '*' : ''}<small>원본 참고: {field.reference || '없음'} · {field.unit || '단위 미지정'}</small></span><input type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : 'text'} value={workspace.values[field.id] ?? ''} onChange={event => change(value => setValue(value, field.id, event.target.value))} /></label>)}
            <p>누락·형식 확인 {validation.errors.length}건{validation.errors.length > 0 ? `: ${validation.errors.slice(0, 5).join(' / ')}` : ''}</p></div>
            <div className="report-card"><h2>진단 내용과 개선 의견</h2><p>계산 결과는 초안에 자동 포함됩니다. 현장 관찰·협의 결과·근거·개선공사 및 예산은 아래에 작성하세요. 비어 있는 의견을 임의로 생성하지 않습니다.</p>{Object.entries({ diagnosis: '데이터 해석·현장 진단 내용', conclusion: '최종 진단 의견', improvements: '개선 방향·공사 목록·예산 및 근거' }).map(([key, label]) => <label key={key}>{label}<textarea rows={5} value={workspace.notes[key] || ''} onChange={event => change(value => setNotes(value, { [key]: event.target.value }))} /></label>)}</div>
            {workspace.fields.some(field => field.valueSource && field.valueSource !== 'input') && <details className="report-card"><summary>원본 위치별 진단 문단 편집</summary><p>설비·분야별 본문은 각각 작성합니다. AI 작성 후에도 이곳에서 수정하거나 출력한 한글에서 편집할 수 있습니다.</p>{workspace.fields.filter(field => field.valueSource && field.valueSource !== 'input').map(field => <label key={field.id}>{field.group} / {field.label}<textarea rows={4} value={narrativeValue(workspace, field)} onChange={event => change(value => setNarrativeValue(value, field.id, event.target.value))} /></label>)}</details>}
            <div className="report-toolbar"><button className="primary" disabled={!aiStatus?.configured || !!busy || !readiness.ready} onClick={() => runAi('interpretation')}>AI 보고서 초안 작성</button><button disabled={!!busy || !readiness.ready} onClick={createLocalDraft}>입력 내용으로 초안 구성</button></div></>}
        {workspace && step === 3 && <div className="report-card"><h2>진단보고서 초안</h2>{workspace.draft ? <><p>담당자 검토가 필요한 초안입니다. 데이터나 양식을 변경하면 다시 생성해야 합니다.</p><div className="report-toolbar"><button className="primary" onClick={() => download(filename('보고서-초안.html'), draftHtml(workspace.draft), 'text/html')}>초안 HTML 저장</button><button onClick={() => download(filename('초안-근거데이터.json'), toJson(workspace.draft))}>근거 데이터 JSON</button><button onClick={() => runAsync(async () => download('ai-review-request.json', toJson(await createInterpretationRequest(workspace))))}>AI 해석 요청 데이터 저장</button><button disabled={!!busy || workspace.document.format !== 'hwpx'} onClick={() => exportNative('draft')}>원본 서식 HWPX 검토용 초안</button></div>
            {workspace.draft.groups.map(group => <section key={group.title}><h3>{group.title}</h3><table><thead><tr><th>입력항목</th><th>새 데이터</th><th>단위</th></tr></thead><tbody>{group.entries.map(item => <tr key={item.id}><td>{item.label}</td><td>{item.value ?? '미입력'}</td><td>{item.unit}</td></tr>)}</tbody></table></section>)}<h3>데이터 분석</h3>{workspace.draft.results.map(result => <p key={result.id}>{result.text}</p>)}{!workspace.draft.results.length && <p>계산 규칙이 없어 자동 분석 결과는 없습니다.</p>}{Object.entries({ diagnosis: '진단 내용', conclusion: '최종 진단 의견', improvements: '개선 내용' }).map(([key, label]) => <section key={key}><h3>{label}</h3><p className="report-prewrap">{workspace.draft.notes[key] || '작성·검토 필요'}</p></section>)}<h3>검토 사항</h3><ul>{workspace.draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></> : <p>데이터를 입력하고 검증한 뒤 초안을 작성하세요.</p>}
            <label className="report-file">AI 해석 결과 가져오기 (JSON)<input type="file" accept=".json" onChange={event => { importProposal(event.target.files?.[0]); event.target.value = ''; }} /></label>
            {workspace.draft?.narratives?.length > 0 && <details className="report-card"><summary>원본 문단별 진단 초안 보기</summary>{workspace.draft.narratives.map(item => <section key={item.id}><h3>{item.group} / {item.label}</h3><p className="report-prewrap">{item.text || '담당자 작성·검토 필요'}</p></section>)}</details>}
            {proposal && <div className="report-card"><h3>진단 평가 제안 검토</h3>{Object.entries(proposal.notes).map(([key, text]) => <p className="report-prewrap" key={key}>{({ diagnosis: '진단 내용', conclusion: '종합 의견', improvements: '개선 내용' })[key]}: {text}</p>)}{!!proposal.questions.length && <><h3>추가 자료 요청</h3><ul>{proposal.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}<button onClick={() => runAsync(async () => { const snapshot = latest.current; const next = await applyInterpretation(snapshot, proposal); if (!alive.current) return; if (latest.current !== snapshot) throw new Error('작업이 변경되었습니다. 해석 결과를 다시 확인하세요.'); change(next); setProposal(null); setStep(2); })}>검토한 제안을 진단 문구에 적용</button></div>}
            <p className="report-muted">앱은 새 데이터와 AI 진단 내용을 반영한 편집 가능한 HWPX 초안을 만듭니다. 담당자가 한글에서 그림·표·쪽 배치·최종 진단 결론을 수정해 보고서를 완성합니다. HWP 원본은 HWPX 사본으로 변환한 후 사용하세요.</p>
        </div>}
    </>;
}

export default function ReportWorkspace({ currentUser, discipline = 'electrical' }) {
    const [projects] = useState(() => dbService.getAll('프로젝트관리').filter(project => project.id));
    const [projectId, setProjectId] = useState('');
    const [aiStatus, setAiStatus] = useState(null);
    const section = reportSection(discipline);
    const project = projects.find(item => String(item.id) === projectId);
    const userId = currentUser.firebaseUid || currentUser.uid || currentUser.person_id;
    return <div className="report-workspace"><header className="report-page-heading"><small>보고서 작성 / {section.label}</small><h1>{section.label} 보고서 작성</h1><p>기존 보고서 등록 → 빈 양식 내보내기 → 작성 데이터 확인 → 초안 작성 · 내려받기</p></header><ReportAiSettings onChange={setAiStatus} /><label className="report-project">기술진단 프로젝트<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">프로젝트를 선택하세요.</option>{projects.map(item => <option key={item.id} value={String(item.id)}>{item.title || item.id}</option>)}</select></label>{!projects.length && <p>프로젝트관리에서 기술진단 프로젝트를 먼저 등록하세요.</p>}{project && userId && <ReportProject key={`${userId}:${project.id}:${discipline}`} project={project} userId={userId} aiStatus={aiStatus} discipline={discipline} />}
        <footer className="report-muted">보고서 작업은 사용자·프로젝트·분야·원본 버전별로 이 PC에 저장됩니다. 다른 PC로 옮길 때는 전체 작업 백업을 사용하세요.<br />본 제품은 (주)한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.</footer>
    </div>;
}
