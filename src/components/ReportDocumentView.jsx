import StudioFitPage from './StudioFitPage.jsx';
import {paragraphRole} from '../services/report/workflowAnalysis.js';

export default function ReportDocumentView({document,spec,onTarget,selection}) {
    const tables=new Map(document.tables.map(table=>[table.id,table]));
    const shown=new Set();
    const roleStyle=role=>{const value=spec.roleStyles?.[role]||{};return {fontFamily:value.fontFamily,fontSize:value.fontSizePt!=null?`${value.fontSizePt}pt`:undefined,letterSpacing:value.spacingPercent!=null?`${value.spacingPercent/100}em`:undefined,lineHeight:value.lineSpacingPercent!=null?value.lineSpacingPercent/100:undefined};};
    const renderTable=table=><section className="studio-source-table" key={table.id}><small style={roleStyle('tableCaption')}>{table.title}</small><table style={roleStyle('tableBody')}><tbody>{Array.from({length:Math.min(table.rows,250)},(_,row)=><tr key={row}>{table.cells.filter(cell=>cell.row===row).map(cell=><td key={cell.id} rowSpan={cell.rowSpan} colSpan={cell.colSpan} className={selection?.cellId===cell.id?'selected':''}><button title="표 셀 적용 위치 선택" aria-label={`${table.title} ${cell.row+1}행 ${cell.column+1}열 적용 위치`} onClick={()=>onTarget({tableId:table.id,cellId:cell.id})}>{cell.text||'빈 셀'}</button></td>)}</tr>)}</tbody></table>{table.rows>250&&<p>표의 앞 250행을 표시합니다. 전체 원본은 프로젝트 파일에 보관됩니다.</p>}</section>;
    return <div className="studio-source-document"><p className="studio-draft-note">HWPX 문단·표 구조 미리보기입니다. 화면의 줄바꿈·쪽 경계는 원본 조판과 다를 수 있습니다. 적용할 문단이나 셀을 선택하세요.</p>
        <StudioFitPage width={spec.widthMm*96/25.4} label="HWPX 복원본"><article className="studio-source-paper" style={{width:`${spec.widthMm}mm`,minHeight:`${spec.heightMm}mm`,padding:`${spec.margins.top}mm ${spec.margins.right}mm ${spec.margins.bottom}mm ${spec.margins.left}mm`,fontFamily:spec.fontFamily,fontSize:`${spec.fontSizePt}pt`,letterSpacing:`${(spec.spacingPercent??0)/100}em`,lineHeight:(spec.lineSpacingPercent??160)/100}}>
            {spec.headerVisible&&<header>{spec.header||'머릿글'}</header>}
            {document.paragraphs.slice(0,2000).map(p=>{
                if(p.area&&p.area!=='body')return null;
                if(p.tableId){if(shown.has(p.tableId)||!tables.has(p.tableId))return null;shown.add(p.tableId);return renderTable(tables.get(p.tableId));}
                const text=document.format==='hwpx'?p.textSlots.map(s=>s.text).join(''):p.text;
                if(!text||(!spec.chapterTitleVisible&&/^제\s*\d+\s*장/.test(text)))return null;
                return <p key={p.id} style={roleStyle(paragraphRole(text))} className={selection?.paragraphId===p.id?'selected':''}><button onClick={()=>onTarget({paragraphId:p.id})} title="본문 적용 위치 선택">{text}</button></p>;
            })}
            {document.paragraphs.length>2000&&<p>문단 앞 2,000개를 표시합니다. 원본은 프로젝트 파일에 보관됩니다.</p>}
            {spec.footerVisible&&<footer>{spec.footer}</footer>}{spec.pageNumberVisible&&<div className="studio-page-placeholder">〈쪽 번호 · 배치 후 확정〉</div>}
        </article></StudioFitPage>
    </div>;
}
