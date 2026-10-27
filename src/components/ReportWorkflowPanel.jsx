import { COLLECTION_SOURCES, collectionFields, materialList, setCollectionSource, setMaterialReceipt, workflowProgress } from '../services/report/reportWorkflow.js';
import { draftReadiness } from '../services/report/reportSections.js';

export default function ReportWorkflowPanel({ workspace, busy, aiEnabled, change, onAnalyze, onApplyAnalysis, onConfirm, onExportForm, onData, onGenerate, onViewDraft, onOpenSource, onCollect, analysisProgress }) {
    const progress = workflowProgress(workspace), ready = draftReadiness(workspace);
    const materials = workspace ? materialList(workspace) : [], proposal = workspace?.analysisProposal;
    const next = proposal ? onApplyAnalysis : progress.current === 1 ? onAnalyze : progress.current === 2 ? onConfirm : progress.current < 4 || !ready.ready ? onData : progress.current === 4 ? onGenerate : onViewDraft;
    const label = proposal ? '분석한 자료 계획·입력항목 적용' : progress.current === 1 ? 'AI 보고서 분석 · 수집 계획 만들기' : progress.current === 2 ? '수집 계획·양식 확정' : progress.current < 4 || !ready.ready ? '자료 취합 · 누락 항목 확인' : progress.current === 4 ? '검증된 자료로 AI 초안 작성' : '초안 확인 · 내려받기';
    return <section className="report-card report-workflow"><h2>보고서 작성 워크플로우</h2><ol className="report-workflow-stages">{progress.labels.map((label, i) => <li key={label} className={i === progress.current ? 'current' : i < progress.current ? 'done' : ''}>{i + 1}. {label}</li>)}</ol>
        <p>{proposal ? `분석 결과: 입력·작성 위치 ${proposal.fields.length}개 · 필요 자료 ${proposal.materials?.length || 0}건. 후보를 확인하고 계획에 적용하세요.` : progress.message}</p>
        {analysisProgress && <p role="status">AI 분석 요청 {analysisProgress.requests}회 · 상세 표 {analysisProgress.tablesRead}개 확인 중</p>}
        <button className="primary" disabled={!workspace || !!busy || (!proposal && (progress.current === 1 || (progress.current === 4 && ready.ready)) && !aiEnabled)} onClick={next}>{label}</button>
        {workspace && <><h3>이 보고서에 필요한 자료 · 수집 상태</h3><p>사용자가 조사할 항목은 한글 빈 양식으로 보내고, 한전에서 받을 항목은 별도로 수집합니다. 수집 경로를 바꾸면 양식을 다시 확정하세요.</p>
            <div className="report-material-list">{materials.map(item => <article key={item.id} className="report-material"><div><strong>{item.label}</strong><small>{item.description || item.fields.map(field => field.label).slice(0, 4).join(' / ')}</small><span className={`report-status ${item.received ? 'ready' : ''}`}>{item.received ? '자료 있음' : item.required ? '필수 자료 대기' : '선택 자료 대기'}{item.fields.length ? ` · ${item.filled}/${item.fields.length}` : ''}</span></div>
                {item.fields.length ? <label>수집 경로<select disabled={!!busy} value={item.source || 'manual'} onChange={event => change(value => setCollectionSource(value, item.fieldIds, event.target.value))}>{Object.entries(COLLECTION_SOURCES).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label> : <label>자료·현장 협의 내용<textarea disabled={!!busy} rows={3} value={workspace.materialReceipts?.[item.id]?.text || ''} onChange={event => change(value => setMaterialReceipt(value, item.id, event.target.value))} placeholder="자료의 내용·출처·기준일 또는 현장 협의 내용을 기록하세요." /></label>}
            </article>)}</div>
            {!materials.length && <p>기존 보고서를 AI로 분석하거나 입력항목을 지정하면 필요 자료 목록이 만들어집니다.</p>}
            <div className="report-toolbar"><button disabled={!!busy || workspace.confirmedRevision !== workspace.revision || !collectionFields(workspace, 'manual').length || workspace.document.format !== 'hwpx'} onClick={onExportForm}>사용자 조사용 빈 한글 양식</button><button disabled={!!busy} onClick={onData}>작성한 양식 취합 · 직접 입력</button></div>
            {(workspace.discipline === 'electrical' || materials.some(item => item.source === 'kepco')) && <div className="report-source-collection"><h3>한전 자료 수집</h3><p>한전 조회 창에서 로그인하고 필요한 고객·연도·사용량/청구요금 표를 선택하세요. 조회한 표를 수집한 뒤 AI가 입력항목에 연결할 후보를 정리합니다. 여러 연도의 자료는 조회·수집을 반복해 누적합니다.</p><div className="report-toolbar"><button disabled={!!busy} onClick={onOpenSource}>한전 조회 창 열기 · 로그인</button><button disabled={!!busy || !aiEnabled || !workspace.fields.some(field => field.collectionSource === 'kepco')} onClick={onCollect}>현재 조회 표 수집 · AI 항목 연결</button></div><small>자료 수집 버튼으로 선택한 표를 AI에 보냅니다. 고객·조회 기간과 원본 값을 확인한 뒤 적용하세요.</small></div>}
            {!!workspace.collectedEvidence?.length && <details><summary>수집한 원자료 {workspace.collectedEvidence.length}건 · 출처 확인</summary>{workspace.collectedEvidence.map(item => <p key={item.contentHash}>{item.title} · {item.capturedAt}<br /><a href={item.url} target="_blank" rel="noreferrer">수집 출처</a></p>)}</details>}
            {!!workspace.collectionQuestions?.length && <ul>{workspace.collectionQuestions.map((question, i) => <li key={i}>{question}</li>)}</ul>}
        </>}
    </section>;
}
