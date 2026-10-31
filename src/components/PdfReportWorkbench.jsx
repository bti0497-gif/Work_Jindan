import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {loadMaterial} from '../services/report/reportLibrary.js';
import {PDF_DISCIPLINES} from '../services/report/pdfStructure.js';
import {pdfPageDiscipline,pdfElectricalChapterNumber} from '../services/report/pdfHwpxWriter.js';
import {reportRuntimeBase,enrichPdfOcr,cropPdfPictures} from '../services/report/pdfOcr.js';
import PdfOriginalPage from './PdfOriginalPage.jsx';

export default function PdfReportWorkbench({userId,projectId,material,analysis,settings={},onAnalysis,onSettings,onGenerate,inspectorTarget,onShowInspector}) {
    const [progress,setProgress]=useState(null),[error,setError]=useState(''),[filter,setFilter]=useState('electrical'),[pageNumber,setPageNumber]=useState(1);
    const [rangeStart,setRangeStart]=useState(null),[rangeEnd,setRangeEnd]=useState(null);
    const active=useRef(null),alive=useRef(true),attempted=useRef(false);
    const current=analysis?.source?.sha256===material.sha256&&analysis.projectId===projectId?analysis:null;
    const defaults=current?.pages.filter(page=>page.discipline==='electrical'&&['body','divider'].includes(page.kind)).map(page=>page.number)||[];
    const config={...settings,pages:settings.pages||defaults};
    const selected=new Set(config.pages),page=current?.pages.find(p=>p.number===pageNumber);
    const patch=change=>onSettings({...config,...change});
    const outputSpec={fontFamily:'함초롬바탕',fontSizePt:10,widthMm:210,heightMm:297,margins:{top:20,bottom:20,left:20,right:20},header:'',footer:'',headerVisible:false,footerVisible:false,pageNumberVisible:true,...config.outputSpec};
    const patchSpec=change=>patch({outputSpec:{...outputSpec,...change}});
    const cancel=()=>{active.current?.terminate?.();active.current?.abort?.();active.current=null;setProgress(null);};
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.terminate?.();active.current?.abort?.();};},[]);
    const analyze=async()=>{
        if(active.current)return;setError('');setProgress({stage:'PDF 분석 엔진 준비'});
        const controller=new AbortController();active.current=controller;
        try{
            const [{analyzePdfReport},{default:workerSrc}]=await Promise.all([import('../services/report/pdfAnalysis.js'),import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')]);
            const bytes=await(await loadMaterial(userId,material.id)).arrayBuffer();
            const result=await analyzePdfReport(bytes,material.filename,projectId,{materialId:material.id,workerSrc,runtimeBase:reportRuntimeBase(),signal:controller.signal,onProgress:p=>{if(alive.current)setProgress({stage:`PDF ${p.page}/${p.total}쪽 · 본문·표·그림 분석`});}});
            if(alive.current&&!controller.signal.aborted){
                if(result.source.sha256!==material.sha256||result.projectId!==projectId)throw new Error('분석 결과의 프로젝트·원본이 다릅니다.');
                onAnalysis(result);setPageNumber(result.pages.find(p=>p.discipline==='electrical')?.number||1);
            }
        }catch(reason){if(alive.current&&!controller.signal.aborted)setError(reason?.message||String(reason||'PDF 처리 엔진을 불러오지 못했습니다.'));}
        finally{if(active.current===controller)active.current=null;if(alive.current)setProgress(null);}
    };
    useEffect(()=>{if(!current&&!attempted.current){attempted.current=true;analyze();}else if(current&&pageNumber===1)setPageNumber(config.pages[0]||current.pages.find(p=>p.discipline==='electrical')?.number||1);},[current]);
    const ocr=async()=>{
        if(active.current||!current)return;const controller=new AbortController();active.current=controller;setError('');
        try{const bytes=await(await loadMaterial(userId,material.id)).arrayBuffer();const result=await enrichPdfOcr(bytes,current,config.pages.filter(n=>{const p=current.pages.find(p=>p.number===n);return p.kind==='scan'||p.images.some(i=>i.kind==='text-raster');}),{signal:controller.signal,onProgress:value=>{if(alive.current)setProgress(value);}});if(alive.current&&!controller.signal.aborted)onAnalysis(result);}
        catch(reason){if(alive.current&&!controller.signal.aborted)setError(reason?.message||String(reason||'PDF 처리 엔진을 불러오지 못했습니다.'));}
        finally{if(active.current===controller)active.current=null;if(alive.current)setProgress(null);}
    };
    const generate=async mode=>{
        if(progress||!current)return;setError('');setProgress({stage:'편집 가능한 한글 작성본 생성'});const controller=new AbortController();active.current=controller;
        try{
            let pictures={};
            if(mode==='reference'){const bytes=await(await loadMaterial(userId,material.id)).arrayBuffer();pictures=await cropPdfPictures(bytes,current,config.pages,{signal:controller.signal,onProgress:value=>{if(alive.current&&!controller.signal.aborted)setProgress(value);}});}
            if(alive.current&&!controller.signal.aborted)await onGenerate(mode,config,pictures,{signal:controller.signal});
        }catch(reason){if(alive.current&&!controller.signal.aborted)setError(reason?.message||String(reason||'PDF 처리 엔진을 불러오지 못했습니다.'));}
        finally{if(active.current===controller)active.current=null;if(alive.current)setProgress(null);}
    };
    const shown=current?.pages.filter(p=>filter==='all'||pdfPageDiscipline(p,config)===filter)||[];
    const controls=<div className="studio-pdf-inspector-controls">
        <div className="studio-pdf-actions"><button className="studio-secondary" disabled={!!progress} onClick={analyze}>PDF 전체 재분석</button>{progress&&<><span role="status">{progress.stage}{progress.total?` · ${progress.index+1}/${progress.total}`:''}</span><button className="studio-secondary" onClick={cancel}>분석 취소</button></>}</div>
        {error&&<p role="alert" className="studio-error">{error}</p>}
        {current&&<><div className="studio-pdf-summary">{Object.entries(PDF_DISCIPLINES).map(([key,name])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{name} {current.pages.filter(p=>pdfPageDiscipline(p,config)===key).length}쪽</button>)}<button onClick={()=>setFilter('all')}>전체 {current.pages.length}쪽</button><span>표 {current.summary.tables}개 · 그림 후보 {current.summary.images}개</span></div>
            <p className="studio-note">장 제목·표 경계로 나눈 분야 후보입니다. 선택한 쪽의 분류와 셀을 원문과 대조하세요. 공정·기계 분석은 분류까지만 제공하며 현재 작성 범위는 전기와 선택한 공통 쪽입니다.</p>
            <div className="studio-pdf-range"><label>시작 쪽<input aria-label="PDF 작성 시작 쪽" type="number" min="1" max={current.pages.length} value={rangeStart??defaults[0]??1} onChange={event=>setRangeStart(event.target.value)}/></label><label>끝 쪽<input aria-label="PDF 작성 끝 쪽" type="number" min="1" max={current.pages.length} value={rangeEnd??defaults.at(-1)??1} onChange={event=>setRangeEnd(event.target.value)}/></label><button className="studio-secondary" disabled={!!progress} onClick={()=>{const start=Number(rangeStart??defaults[0]??1),end=Number(rangeEnd??defaults.at(-1)??1);if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>current.pages.length){setError('PDF 쪽 범위를 확인하세요.');return;}patch({pages:current.pages.filter(p=>p.number>=start&&p.number<=end&&['electrical','common'].includes(pdfPageDiscipline(p,config))).map(p=>p.number),labelsReviewed:false});setPageNumber(start);}}>선택 범위 적용</button></div>
            <div className="studio-pdf-author-actions"><button className="studio-secondary" disabled={!!progress||!selected.size} onClick={ocr}>선택 쪽 이미지 본문 OCR 보강</button><button className="studio-secondary" disabled={!!progress||!selected.size} onClick={()=>generate('reference')}>전기 원문 HWPX 재구성</button><button className="studio-primary" disabled={!!progress||!selected.size||!config.labelsReviewed} onClick={()=>generate('draft')}>금회 전기 HWPX 양식 생성</button></div>
            <label className="studio-checkbox"><input type="checkbox" aria-label="PDF 양식 항목 열 검토 완료" checked={!!config.labelsReviewed} disabled={!!progress} onChange={event=>patch({labelsReviewed:event.target.checked})}/>유지할 표 항목 열을 검토함 · 나머지 값과 판정은 비우고 금회 자료로 작성</label>
            <p className="studio-note">선택 {selected.size}쪽. 원문 재구성에는 전회 값이 포함됩니다. 금회 양식은 표 첫 행·선택한 항목 열과 제목만 유지하며 본문 진단·수치·사진은 새로 채웁니다. OCR·병합 셀·번호·한글 쪽 배치는 최종 검토가 필요합니다.</p>
            <details className="studio-pdf-output-spec"><summary>출력 HWPX 서식</summary><p className="studio-note">이 PDF에서 새로 만드는 한글 작성본의 설정입니다. 변경 즉시 현재 프로젝트에 저장되며 다음 생성에 적용됩니다.</p>
                <label>전기 장 번호<input aria-label="PDF 전기 장 번호" type="number" min="1" max="999" value={config.chapterNumber??pdfElectricalChapterNumber(current)} disabled={!!progress} onChange={event=>patch({chapterNumber:event.target.value})}/></label><p className="studio-note">원문 장 번호를 기본값으로 사용합니다. 번호를 바꾼 경우 본문의 절 번호와 참조도 함께 검토하세요.</p>
                <label>기본 글꼴<input aria-label="PDF 출력 기본 글꼴" maxLength={100} value={outputSpec.fontFamily} disabled={!!progress} onChange={event=>patchSpec({fontFamily:event.target.value})}/></label>
                <label>본문 크기(pt)<input aria-label="PDF 출력 본문 크기" type="number" min="5" max="24" step=".5" value={outputSpec.fontSizePt} disabled={!!progress} onChange={event=>patchSpec({fontSizePt:Number(event.target.value)})}/></label>
                <div className="studio-property-row">{['widthMm','heightMm'].map((key,i)=><label key={key}>{i?'용지 높이':'용지 너비'}(mm)<input aria-label={`PDF 출력 ${i?'높이':'너비'}`} type="number" min="100" max={i?594:420} value={outputSpec[key]} disabled={!!progress} onChange={event=>patchSpec({[key]:Number(event.target.value)})}/></label>)}</div>
                <div className="studio-property-row">{Object.entries({top:'상',bottom:'하',left:'좌',right:'우'}).map(([key,label])=><label key={key}>{label} 여백(mm)<input aria-label={`PDF 출력 ${label} 여백`} type="number" min="0" max="150" value={outputSpec.margins[key]} disabled={!!progress} onChange={event=>patchSpec({margins:{...outputSpec.margins,[key]:Number(event.target.value)}})}/></label>)}</div>
                {Object.entries({header:'머릿글',footer:'바닥글'}).map(([key,label])=><label key={key}>{label}<textarea aria-label={`PDF 출력 ${label}`} maxLength={4000} value={outputSpec[key]} rows={2} disabled={!!progress} onChange={event=>patchSpec({[key]:event.target.value})}/></label>)}
                {Object.entries({headerVisible:'머릿글 표시',footerVisible:'바닥글 표시',pageNumberVisible:'쪽 번호 표시'}).map(([key,label])=><label className="studio-checkbox" key={key}><input type="checkbox" aria-label={`PDF 출력 ${label}`} checked={outputSpec[key]} disabled={!!progress} onChange={event=>patchSpec({[key]:event.target.checked})}/>{label}</label>)}
            </details>
            <details className="studio-pdf-page-controls"><summary>분야·쪽·표 항목 검토</summary><div className="studio-pdf-review-grid"><nav className="studio-pdf-pages" aria-label="PDF 분야별 쪽 목록">{shown.map(p=><div key={p.number} className={p.number===pageNumber?'active':''}><input type="checkbox" aria-label={`PDF ${p.number}쪽 작성에 포함`} checked={selected.has(p.number)} disabled={!!progress||!['electrical','common'].includes(pdfPageDiscipline(p,config))} onChange={event=>patch({pages:event.target.checked?[...selected,p.number]:config.pages.filter(n=>n!==p.number),labelsReviewed:false})}/><button onClick={()=>setPageNumber(p.number)} title={p.classificationReason}>{p.number}쪽 · {p.headings[0]?.text||p.kind==='blank'&&'빈 쪽'||p.chapter||'원문 확인'}</button></div>)}</nav>
                <div className="studio-pdf-page-review">{page&&<><div className="studio-pdf-page-label"><strong>PDF {page.number}쪽</strong><label>분야<select aria-label={`PDF ${page.number}쪽 분야`} value={pdfPageDiscipline(page,config)} disabled={!!progress} onChange={event=>patch({disciplines:{...config.disciplines,[page.number]:event.target.value},pages:config.pages.filter(n=>n!==page.number),labelsReviewed:false})}>{Object.entries(PDF_DISCIPLINES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label></div>
                    <p className="studio-note">{page.classificationReason}{page.ocr?` · OCR ${page.ocr.lines.length}줄 · 저신뢰 ${page.ocr.lowConfidence}줄`:page.images.some(i=>i.kind==='text-raster')?' · 이미지 본문 있음: OCR 보강 필요':''}</p>
                    <div className="studio-pdf-extracted"><details><summary>추출 문장·OCR 결과 ({(page.ocr?.mergedLines||page.lines).length}줄)</summary>{(page.ocr?.mergedLines||page.lines).map((line,i)=><div key={`${page.number}:${i}`} className={line.ocr?'ocr':''}>{line.ocr?<><small>OCR · {Math.round(line.confidence)}%</small><textarea key={line.text} disabled={!!progress} aria-label={`PDF ${page.number}쪽 OCR ${i+1}줄 수정`} defaultValue={line.text} rows={2} onBlur={event=>{const text=event.target.value;if(text===line.text)return;const edit=l=>({...l,originalText:l.originalText??l.text,text,editedByUser:true});onAnalysis({...current,pages:current.pages.map(p=>p.number===page.number?{...p,ocr:{...p.ocr,reviewed:false,mergedLines:p.ocr.mergedLines.map((l,j)=>j===i?edit(l):l),lines:p.ocr.lines.map(l=>l.text===line.text&&l.bbox.every((n,j)=>n===line.bbox[j])?edit(l):l)}}:p)});}}/></>:<p>{line.text}</p>}</div>)}</details>
                        {!!page.images.length&&<details><summary>이미지 역할 검토 ({page.images.length}개)</summary>{page.images.map((image,index)=><label className="studio-pdf-image-role" key={image.id}>이미지 {index+1} · {Math.round(image.bbox[2]-image.bbox[0])}×{Math.round(image.bbox[3]-image.bbox[1])}pt<select aria-label={`${image.id} 이미지 역할`} value={image.kind} disabled={!!progress} onChange={event=>onAnalysis({...current,pages:current.pages.map(p=>p.number===page.number?{...p,ocr:null,images:p.images.map(i=>i.id===image.id?{...i,kind:event.target.value}:i)}:p),status:'review-required'})}><option value="figure">사진·그림</option><option value="text-raster">이미지 본문 · OCR 대상</option></select></label>)}</details>}
                        {page.tables.map((table,index)=><details key={table.id}><summary>표 {index+1} · {table.rows}행 × {table.columns}열 · 병합 검토 필요</summary><div className="studio-pdf-label-columns">금회 양식에서 유지할 항목 열:{Array.from({length:table.columns},(_,column)=><label key={column}><input type="checkbox" aria-label={`${table.id} ${column+1}열 항목 유지`} checked={(config.labelColumns?.[table.id]||[0]).includes(column)} disabled={!!progress} onChange={event=>{const columns=config.labelColumns?.[table.id]||[0];patch({labelColumns:{...config.labelColumns,[table.id]:event.target.checked?[...columns,column]:columns.filter(c=>c!==column)},labelsReviewed:false});}}/>{column+1}열</label>)}</div><table><tbody>{Array.from({length:Math.min(table.rows,60)},(_,row)=><tr key={row}>{table.cells.filter(cell=>cell.row===row).map(cell=><td key={cell.id} rowSpan={cell.rowSpan} colSpan={cell.colSpan}><textarea key={cell.text} disabled={!!progress} aria-label={`${cell.id} PDF 추출 셀 수정`} defaultValue={cell.text} rows={Math.min(5,Math.max(1,cell.text.split('\n').length))} onBlur={event=>{const text=event.target.value;if(text===cell.text)return;onAnalysis({...current,pages:current.pages.map(p=>p.number===page.number?{...p,tables:p.tables.map(t=>t.id===table.id?{...t,cells:t.cells.map(c=>c.id===cell.id?{...c,originalText:c.originalText??c.text,text,editedByUser:true}:c)}:t)}:p)});patch({labelsReviewed:false});}}/></td>)}</tr>)}</tbody></table></details>)}</div>
                </>}</div></div></details>
        </>}
    </div>;
    return <section className="studio-pdf-workbench" aria-label="PDF 분석과 전기 한글 작성">
        {inspectorTarget?createPortal(controls,inspectorTarget):<details><summary>PDF 분석·작성 설정</summary>{controls}</details>}
        <div className="studio-pdf-viewer-status"><span>{progress?progress.stage:current?`전체 ${current.pages.length}쪽 · 작성 선택 ${selected.size}쪽 · 현재 PDF ${pageNumber}쪽`:'PDF 원문'}</span><button className="studio-secondary" onClick={onShowInspector}>분석·작성 설정</button></div>
        <PdfOriginalPage userId={userId} material={material} pageNumber={pageNumber} onPageChange={setPageNumber}/>
    </section>;
}
