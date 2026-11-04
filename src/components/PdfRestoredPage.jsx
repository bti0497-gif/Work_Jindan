import {useEffect,useMemo,useState} from 'react';
import {pdfAuthoringPlan} from '../services/report/pdfHwpxWriter.js';
import {loadMaterial} from '../services/report/reportLibrary.js';
import {cropPdfPictures} from '../services/report/pdfOcr.js';
import StudioFitPage from './StudioFitPage.jsx';

export default function PdfRestoredPage({userId,projectId,material,analysis,page,settings,onEdit}){
    const [pictures,setPictures]=useState({}),[pictureError,setPictureError]=useState('');
    const model=useMemo(()=>{try{return pdfAuthoringPlan(analysis,{...settings,pages:[page.number]},projectId,'reference');}catch{return null;}},[analysis,settings,projectId,page.number]);
    useEffect(()=>{
        const controller=new AbortController(),urls=[];let mounted=true;setPictures({});setPictureError('');
        if(!page.images.length)return()=>controller.abort();
        loadMaterial(userId,material.id).then(b=>b.arrayBuffer()).then(bytes=>cropPdfPictures(bytes,analysis,[page.number],{signal:controller.signal,includeTextImages:true})).then(images=>{
            if(!mounted)return;const result={};for(const [id,image]of Object.entries(images)){const url=URL.createObjectURL(new Blob([image.bytes],{type:'image/png'}));urls.push(url);result[id]=url;}setPictures(result);
        }).catch(reason=>{if(mounted&&!controller.signal.aborted)setPictureError(reason.message||'그림 추출을 확인하세요.');});
        return()=>{mounted=false;controller.abort();urls.forEach(url=>URL.revokeObjectURL(url));};
    },[userId,material.id,analysis.source.sha256,page.number,page.images.map(i=>i.id+':'+i.kind).join('|')]);
    if(!model)return <p className="studio-note">선택 쪽을 전기 또는 공통으로 분류하면 복원 구조를 확인할 수 있습니다.</p>;
    const spec=settings.outputSpec||{};
    const table=t=><table className="studio-restored-table"><tbody>{Array.from({length:t.rows},(_,r)=><tr key={r}>{t.cells.filter(c=>c.row===r).map(c=><td key={c.id} rowSpan={c.rowSpan} colSpan={c.colSpan}><textarea aria-label={`${c.id} 복원 셀 편집`} value={c.text} rows={Math.min(5,Math.max(1,c.text.split('\n').length))} onChange={e=>onEdit({tableId:t.id,cellId:c.id,value:e.target.value})}/></td>)}</tr>)}</tbody></table>;
    const area=kind=>model.furniture?.filter(a=>a.kind===kind).map(a=><div key={kind} className={`studio-restored-furniture furniture-${kind}`}><small>{kind==='header'?'머리말':'꼬리말'} · 위치에서 추정</small>{a.lines.filter(l=>!/^\s*[-–—]?\s*\d+\s*[-–—]?\s*$/.test(l.text)).map((l,i)=><p key={i}>{l.text}</p>)}{a.tables.map(t=><div key={t.id}>{table(t)}</div>)}{a.images.map(i=>pictures[i.id]?<img alt="복원 머리말·꼬리말 그림" key={i.id} src={pictures[i.id]}/>:<span key={i.id}>그림 영역 · 원문 대조</span>)}</div>);
    return <StudioFitPage width={(spec.widthMm||210)*96/25.4} label="PDF 복원본"><section className="studio-restored-page" aria-label={`PDF ${page.number}쪽 복원 구조`} style={{fontFamily:spec.fontFamily||'함초롬바탕',fontSize:`${spec.fontSizePt||10}pt`,letterSpacing:`${(spec.spacingPercent||0)/100}em`,lineHeight:(spec.lineSpacingPercent||160)/100}}>
        <div className="studio-restoration-preview-label">편집 가능한 복원 구조 · 실제 한글 조판 대조 전</div>{pictureError&&<p className="studio-error" role="status">{pictureError}</p>}{area('header')}
        {model.blocks.filter(b=>b.source?.page===page.number).map(block=><div className={`studio-restored-block ${block.kind}`} key={block.id}>
            {block.kind==='table'?<><strong>{block.caption}</strong>{table(block.table)}</>:block.kind==='picture'?<><div className="studio-restored-pictures">{(block.images||[]).map(i=>pictures[i.id]?<img alt={`PDF ${page.number}쪽 추출 그림`} key={i.id} src={pictures[i.id]}/>:<span key={i.id}>그림 추출 중 · 원문 대조</span>)}</div><small>{block.caption}</small></>:<textarea aria-label={`PDF ${page.number}쪽 복원 문장 ${block.source?.line}`} value={block.text} rows={Math.max(1,Math.ceil(block.text.length/42))} onChange={e=>onEdit({line:block.source.line,value:e.target.value})}/>}
        </div>)}{area('footer')}<p className="studio-note">글자·표 셀을 수정하면 프로젝트에 저장되고 다음 HWPX 생성에 반영됩니다. 도형·배치·OCR은 원문과 대조하세요.</p>
    </section></StudioFitPage>;
}
