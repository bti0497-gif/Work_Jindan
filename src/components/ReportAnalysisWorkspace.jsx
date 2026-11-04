import ReportListPaging from './ReportListPaging.jsx';
import {useMemo,useState} from 'react';
import {CONTENT_ROLES,FORMAT_ROLES} from '../services/report/workflowAnalysis.js';
import ReportFigurePreview from './ReportFigurePreview.jsx';
import ReportChapterSummary from './ReportChapterSummary.jsx';
import ReportReproductionReview from './ReportReproductionReview.jsx';
import ReportDraftPreparation from './ReportDraftPreparation.jsx';
import {buildDraftPreparation} from '../services/report/draftPreparation.js';

export default function ReportAnalysisWorkspace({analysis,value={},onChange,onLocate,userId,material,pdf,materials=[],selectedChapter,onSelectChapter,chapterReviews,locatedItemId,reproductionReview,onReproductionReview,onDownload,onSavePreparation,onExportPreparation,onWriteDraft,onExportCollection,onImportCollection,collectionPreview,onApplyCollection,onCancelCollection,disabled}){
    const [tab,setTab]=useState('summary'),[chapter,setChapter]=useState('all'),[pages,setPages]=useState({});
    const [pictureId,setPictureId]=useState('');
    const rows=tab==='tables'?analysis.tables:tab==='pictures'?analysis.pictures:analysis.sections;
    const chapters=useMemo(()=>[...new Set([...analysis.chapters.map(c=>c.title),...rows.map(r=>r.chapter)])],[analysis,rows]);
    const filtered=rows.filter(row=>chapter==='all'||row.chapter===chapter),edits=value.sourceSha256===analysis.sourceSha256?value.items||{}:{};
    const page=Math.min(pages[tab]||1,Math.max(1,Math.ceil(filtered.length/200)));
    const patch=(id,change)=>onChange({sourceSha256:analysis.sourceSha256,items:{...edits,[id]:{...edits[id],...change}}});
    const blankPreparation=analysis.purpose==='authoring'?buildDraftPreparation({material,analysis,projectId:analysis.projectId,review:value.sourceSha256?value:undefined,materials,reproductionReview,draftMode:'blank'}):null;
    const preparation=analysis.purpose==='authoring'?buildDraftPreparation({material,analysis,projectId:analysis.projectId,review:value.sourceSha256?value:undefined,materials,reproductionReview}):null;
    return <section className="studio-analysis-workspace" aria-label="보고서 분석결과">
        <h2>{analysis.purpose==='restoration'?'1단계 · PDF 복원 분석':'새 보고서 작성 분석'}</h2>
        <div className="studio-analysis-tabs" role="tablist" aria-label="분석 관리 종류">{[['summary','챕터 요약',analysis.chapters.length],['tables','표 관리',analysis.tables.length],['pictures','그림 관리',analysis.pictures.length],['data',analysis.purpose==='restoration'?'추출 문단':'데이터 관리',analysis.sections.length],...(preparation?[['review','재현 검토',preparation.layout.passed],['draft','금회 초안 준비',preparation.summary.pending]]:[])].map(([id,label,count])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label} <small>{count}</small></button>)}</div>
        {tab==='summary'?<ReportChapterSummary analysis={analysis} selected={selectedChapter} onSelect={onSelectChapter} reviews={chapterReviews}/>:tab==='review'&&preparation?<ReportReproductionReview material={material} value={reproductionReview} onChange={onReproductionReview} onDownload={onDownload} disabled={disabled}/>:tab==='draft'&&preparation?<ReportDraftPreparation plan={preparation} blankPlan={blankPreparation} review={value} materials={materials} onChange={onChange} onLocate={onLocate} onSave={()=>onSavePreparation(preparation)} onExport={()=>onExportPreparation(preparation)} onWrite={()=>onWriteDraft('current')} onWriteBlank={()=>onWriteDraft('blank')} onExportCollection={onExportCollection} onImportCollection={onImportCollection} collectionPreview={collectionPreview} onApplyCollection={onApplyCollection} onCancelCollection={onCancelCollection} disabled={disabled}/>:<>
        <p className="studio-note">원문 위치와 연결한 분석 후보입니다. 내용 역할·교체 여부를 검토하세요. 이 화면의 결정은 원문을 바로 바꾸지 않습니다.</p>
        <label className="studio-analysis-filter">챕터<select aria-label="분석결과 챕터" value={chapter} onChange={e=>{setChapter(e.target.value);setPages({});}}><option value="all">전체 챕터</option>{chapters.map(c=><option key={c}>{c}</option>)}</select></label>
        {!!analysis.warnings.length&&<details className="studio-analysis-warnings"><summary>확인할 분석 항목 {analysis.warnings.length}개</summary><ul>{analysis.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>}
        <ReportListPaging label="분석 목록" total={filtered.length} size={200} page={page} onPage={n=>setPages(v=>({...v,[tab]:n}))}/><div className="studio-analysis-items">{filtered.slice((page-1)*200,page*200).map(row=><article key={row.id} data-analysis-item={row.id} className={`studio-analysis-item ${locatedItemId===row.id?'is-located':''}`}>
            <div><small>{row.chapter} {row.page?`· PDF ${row.page}쪽`:''}</small><strong>{tab==='tables'?`${row.title||'표'} · ${row.rows}행 × ${row.columns}열`:tab==='pictures'?row.title:FORMAT_ROLES[row.formatRole]}</strong>
                {tab==='tables'?<div className="studio-analysis-table"><table><tbody>{Array.from({length:Math.min(row.rows,15)},(_,r)=><tr key={r}>{row.cells.filter(c=>c.row===r).map(c=><td key={c.id} rowSpan={c.rowSpan} colSpan={c.colSpan}>{c.text}</td>)}</tr>)}</tbody></table>{row.rows>15&&<small>앞 15행 표시 · 원문 위치에서 전체 표를 확인하세요.</small>}</div>:<p>{row.text||`${row.kind==='text-raster'?'편집 글자 확인 필요 · ':''}원본 그림과 배치 확인`}</p>}
            </div>
            <div className="studio-analysis-item-actions"><button className="studio-secondary" aria-label={`${row.id} 원문 위치 보기`} onClick={e=>onLocate({...row.target,page:row.target?.page||row.page,tableId:row.target?.tableId||(tab==='tables'?row.id:undefined),objectId:row.target?.objectId||(tab==='pictures'?row.id:undefined),bbox:row.bbox},row.id,e.currentTarget)}>원문 위치 보기</button>
                {tab==='pictures'&&<button className="studio-secondary" onClick={()=>setPictureId(pictureId===row.id?'':row.id)}>그림 미리보기</button>}
                {tab==='data'&&analysis.purpose==='authoring'&&<label>내용 역할<select aria-label={`${row.id} 내용 역할`} value={edits[row.id]?.contentRole||row.contentRole} onChange={e=>patch(row.id,{contentRole:e.target.value})}>{Object.entries(CONTENT_ROLES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
                {analysis.purpose==='authoring'&&<label>금회 작성 처리<select aria-label={`${row.id} 작성 처리`} value={edits[row.id]?.decision||'pending'} onChange={e=>patch(row.id,{decision:e.target.value})}><option value="pending">검토 전</option><option value="replace">금회 자료로 교체</option><option value="rewrite">연결 데이터로 재작성</option><option value="keep">확인 후 유지</option><option value="exclude">작성 대상 제외</option></select></label>}
                {tab==='data'&&<label>연결 근거·검토 메모<textarea aria-label={`${row.id} 분석 메모`} rows={2} maxLength={2000} value={edits[row.id]?.note||''} onChange={e=>patch(row.id,{note:e.target.value})}/></label>}
                {tab==='data'&&analysis.purpose==='authoring'&&<label>연결할 금회 근거자료<select multiple size={Math.min(3,Math.max(1,materials.length))} aria-label={`${row.id} 근거자료`} disabled={!materials.length} value={edits[row.id]?.materialIds||[]} onChange={e=>patch(row.id,{materialIds:[...e.target.selectedOptions].map(o=>o.value)})}>{materials.map(m=><option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>}
            </div>{tab==='pictures'&&pictureId===row.id&&<ReportFigurePreview userId={userId} material={material} pdf={pdf} figure={row}/>}</article>)}</div>
        {!filtered.length&&<p className="studio-empty">이 범위에 분석한 항목이 없습니다.</p>}
        </>}
    </section>;
}
