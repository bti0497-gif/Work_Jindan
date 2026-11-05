import {studioMaterialIds} from './studioProjects.js';

// Removal is project-local. Keep files and evidence available to dependent reports.
export function studioReportIds(book,materials=[],entries=[]){
    const removed=new Set(book.removedReportIds||[]),scope=studioMaterialIds(book);
    return [...new Set([...(book.reportIds||[]),...entries.filter(e=>/\.(pdf|hwpx|hwp)$/i.test(e.relativePath||e.filename||'')).map(e=>e.materialId),...materials.filter(m=>m.role==='reference'&&scope.has(m.id)).map(m=>m.id)])].filter(id=>id&&!removed.has(id));
}

export function addStudioReports(book,ids){
    const added=new Set(ids);
    return {...book,reportIds:[...new Set([...(book.reportIds||[]),...ids])],removedReportIds:(book.removedReportIds||[]).filter(id=>!added.has(id))};
}

export function removeStudioReport(book,id){
    const previous=book.reportIds||[],index=previous.indexOf(id);
    if(index<0)throw new Error('목록에서 제거할 보고서를 찾을 수 없습니다.');
    const reportIds=previous.filter(item=>item!==id),runs=[...(book.pdfWritingRuns||[]),...(book.restorationRuns||[]),...(book.applicationChanges||[])];
    const source=runs.findLast(run=>run.candidateMaterialId===id)?.sourceMaterialId||book.reportMetadata?.[id]?.chapterSource?.sourceMaterialId;
    const next=reportIds.includes(source)?source:reportIds[Math.min(index,reportIds.length-1)]||'';
    return {...book,reportIds,removedReportIds:[...new Set([...(book.removedReportIds||[]),id])],activeReportId:book.activeReportId===id?next:book.activeReportId};
}
