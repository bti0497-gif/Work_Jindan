import {analyzeReport} from './sourceParser.js';
import {buildDraftPreparation} from './draftPreparation.js';
import {draftTextTarget} from './draftSourceBindings.js';
import {createWorkspace,setField,confirmSchema} from './reportEngine.js';
import {exportNativeCollection,readNativeCollection} from './nativeCollection.js';
import {inspectPdfProvenance,needsPdfNativeRegeneration} from './pdfProvenance.js';

async function workspaceFor(bytes,context){
    if(needsPdfNativeRegeneration(inspectPdfProvenance(bytes)?.engineVersion))throw new Error('한글 열기 호환성 보강 전의 복원 후보입니다. 원본 PDF에서 다시 한글화하세요.');
    const plan=buildDraftPreparation(context),document=await analyzeReport(bytes,context.material.filename);
    if(document.format!=='hwpx'||document.source.sha256!==plan.sourceSha256||context.analysis.limited||context.analysis.provenance?.missingPictures?.length)throw new Error('완전한 HWPX 원본 분석이 필요합니다.');
    const cells=plan.items.filter(i=>i.kind==='cell'),selectedTables=new Set(cells.filter(i=>['replace','rewrite'].includes(i.decision)).map(i=>i.target.tableId));
    if(!selectedTables.size)throw new Error('조사할 표 셀을 금회 자료로 교체·재작성 대상으로 먼저 지정하세요.');
    const rows=cells.filter(i=>selectedTables.has(i.target.tableId));
    if(rows.some(i=>i.decision==='pending'||i.decision==='keep'&&i.blockers.length))throw new Error('조사할 표의 모든 셀을 라벨 유지·입력·제외로 검토하세요.');
    let workspace=createWorkspace({id:plan.projectId,title:context.projectName||'금회 진단'},document);workspace.discipline='common';
    for(const item of rows){
        const cell=draftTextTarget(document,item);if(item.decision==='keep')continue;
        workspace=setField(workspace,{id:item.id,type:'text',unit:'',required:false,label:`${cell.row+1}행 ${cell.column+1}열${item.decision==='exclude'?' · 제외 칸, 비워 둠':''}`,group:item.tableTitle||item.chapter,valueSource:'input',binding:{sourceSha256:plan.sourceSha256,tableId:item.target.tableId,cellId:item.target.cellId,scope:'cell'},reviewDecision:item.decision,contentRole:item.contentRole,expectedSlots:item.textRuns,expectedSourceText:item.sourceText});
    }
    return {workspace:confirmSchema(workspace),plan};
}
export async function exportDraftCollection(bytes,context){
    const {workspace}=await workspaceFor(bytes,context),output=await exportNativeCollection(workspace,bytes);
    return {...output,sourceSha256:workspace.source.sha256,projectId:workspace.projectId};
}
export async function importDraftCollection(bytes,filledBytes,filename,context){
    const {workspace,plan}=await workspaceFor(bytes,context),preview=await readNativeCollection(workspace,bytes,filledBytes,filename),edits={...(context.review?.items||{})};
    for(const row of preview.rows){
        const item=plan.items.find(i=>i.id===row.id);if(item.decision==='exclude'){if(row.value.trim())throw new Error('제외 칸에 새 값이 있습니다. 작성 처리 결정을 먼저 바꾸세요.');continue;}
        edits[row.id]={...edits[row.id],draftText:row.value,slotValues:row.slotValues,clearValue:false};
    }
    return {review:{sourceSha256:plan.sourceSha256,items:edits},rows:preview.rows,warnings:preview.warnings,sourceSha256:plan.sourceSha256,projectId:plan.projectId,collectedFrom:preview.collection.collectedFrom};
}
