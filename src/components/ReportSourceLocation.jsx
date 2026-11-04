import ReportFigurePreview from './ReportFigurePreview.jsx';
import {useLayoutEffect,useRef} from 'react';

const text=p=>p?.textSlots?p.textSlots.map(s=>s.text).join(''):p?.text||'';

// Native anchors identify the actual source object, without inventing HWPX page numbers.
export default function ReportSourceLocation({userId,material,document,restoration,target,onTarget}){
    const surface=useRef(null);
    useLayoutEffect(()=>{const root=surface.current.closest('.studio-scroll');if(!root)return;
        const align=()=>{if(!surface.current?.isConnected)return;const anchor=surface.current.querySelector('.selected')||surface.current,heading=root.querySelector('.studio-report-heading')?.getBoundingClientRect().height||0;root.scrollTop+=anchor.getBoundingClientRect().top-root.getBoundingClientRect().top-heading-24;};
        const observer=new ResizeObserver(align);observer.observe(surface.current);align();return()=>observer.disconnect();
    },[target]);
    const table=document.tables.find(t=>t.id===target.tableId||target.cellId&&t.cells.some(c=>c.id===target.cellId));
    const picture=restoration?.objects.find(o=>o.id===target.objectId);
    const paragraph=document.paragraphs.find(p=>p.id===target.paragraphId)||document.paragraphs.find(p=>table?p.tableId===table.id:picture&&p.anchor.section===picture.section&&p.index===picture.paragraphIndex);
    const positions=new Map(document.paragraphs.map((p,i)=>[p.id,i])),index=positions.get(paragraph?.id)??-1,context=document.paragraphs.filter(p=>(!p.area||p.area==='body')&&!p.tableId&&text(p).trim());
    const before=context.filter(p=>positions.get(p.id)<index).slice(-2),after=context.filter(p=>positions.get(p.id)>index).slice(0,2);
    const kind=table?'table':picture?'picture':'paragraph';
    return <section className="studio-native-source-location" data-source-kind={kind} aria-label="한글 원문 위치" tabIndex={-1}>
        <p className="studio-note">원본 파일에서 연결한 {table?'표':picture?'그림·개체':'문단'} 위치입니다. 실제 한글 쪽 번호는 아직 확인되지 않았습니다.</p>
        <div className="studio-source-context">{before.map(p=><p key={p.id}>{text(p)}</p>)}</div>
        <article ref={surface} className="studio-source-location-target" aria-label="선택한 원문 항목">
            {table?<><h2>{table.title}</h2><div className="studio-analysis-table"><table><tbody>{Array.from({length:table.rows},(_,row)=><tr key={row}>{table.cells.filter(c=>c.row===row).map(cell=><td key={cell.id} rowSpan={cell.rowSpan} colSpan={cell.colSpan} className={cell.id===target.cellId?'selected':''}><button className="studio-source-cell" aria-label={`원문 표 ${cell.row+1}행 ${cell.column+1}열 선택`} onClick={()=>onTarget?.({tableId:table.id,cellId:cell.id})}>{cell.text||'빈 셀'}</button></td>)}</tr>)}</tbody></table></div></>:
                picture?<><h2>선택한 원문 그림</h2><ReportFigurePreview userId={userId} material={material} figure={picture}/></>:
                    paragraph?<p className="studio-source-paragraph">{text(paragraph)}</p>:<p role="alert">원문 연결 위치를 찾지 못했습니다. 보고서를 다시 분석하세요.</p>}
        </article>
        <div className="studio-source-context">{after.map(p=><p key={p.id}>{text(p)}</p>)}</div>
    </section>;
}
