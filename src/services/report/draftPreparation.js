import {retentionBlockers} from './draftRetention.js';
import {isWorkflowAnalysisCurrent,CONTENT_ROLES} from './workflowAnalysis.js';
import {reproductionStatus} from './reproductionReview.js';
import {planStyledTextReplacement} from './styledTextReplacement.js';
import {needsPdfNativeRegeneration} from './pdfProvenance.js';
export const DRAFT_PREPARATION_VERSION='report-draft-preparation/1';
const decisions=new Set(['pending','replace','rewrite','keep','exclude']);
export function buildDraftPreparation({material,analysis,projectId,review,materials=[],reproductionReview,draftMode='current'}){
    if(!['current','blank'].includes(draftMode))throw new Error('초안 작성 목적을 확인하세요.');
    if(!isWorkflowAnalysisCurrent(analysis,material,projectId,'authoring'))throw new Error('현재 프로젝트의 한글 보고서를 새 보고서 작성용으로 먼저 분석하세요.');
    if(review&&review.sourceSha256!==material.sha256)throw new Error('다른 원본에 대한 교체 결정을 사용할 수 없습니다. 다시 검토하세요.');
    const edits=review?.items||{},evidence=new Map(materials.map(m=>[m.id,m])),tables=new Map(analysis.tables.map(t=>[t.id,t])),items=[];
    const nativeRegeneration=needsPdfNativeRegeneration(analysis.provenance?.engineVersion);
    for(const row of [...analysis.sections,...[...analysis.pictures,...(analysis.imageTextRegions||[])].map(p=>({...p,text:p.kind==='text-raster'?'이미지 본문 · 글자 편집 불가':'',target:{objectId:p.id},contentRole:'measurement',formatRole:'picture'}))]){
        const inherited=row.target?.tableId?edits[row.target.tableId]:null,edit={...inherited,...edits[row.id],draftText:edits[row.id]?.draftText},decision=edit.decision||'pending',role=edit.contentRole||row.contentRole;
        if(!decisions.has(decision)||!Object.hasOwn(CONTENT_ROLES,role))throw new Error('금회 작성 결정과 내용 역할을 확인하세요.');
        const materialIds=edit.materialIds||[];if(!Array.isArray(materialIds)||materialIds.length>100||new Set(materialIds).size!==materialIds.length)throw new Error('금회 근거자료 연결을 확인하세요.');
        if(edit.draftText!=null&&(typeof edit.draftText!=='string'||edit.draftText.length>50000))throw new Error('금회 반영 문안은 50,000자 이하로 입력하세요.');
        const slotValues=edits[row.id]?.slotValues;if(slotValues!=null&&(typeof slotValues!=='object'||Array.isArray(slotValues)||Object.values(slotValues).some(v=>typeof v!=='string'||v.length>50000)))throw new Error('서식 구간별 반영 문안을 확인하세요.');
        const blockers=[];
        if(edit.clearValue!=null&&typeof edit.clearValue!=='boolean')throw new Error('빈 값 반영 여부를 확인하세요.');
        if(decision==='pending')blockers.push('작성 처리 검토 전');
        if(materialIds.some(id=>!evidence.has(id)))blockers.push('현재 프로젝트에서 연결 해제된 근거자료');
        if(materialIds.some(id=>evidence.has(id)&&!/^[a-f0-9]{64}$/.test(evidence.get(id).sha256||'')))blockers.push('근거자료 원본 해시 확인 필요');
        if(['replace','rewrite'].includes(decision)){
            if(draftMode==='current'&&!materialIds.length)blockers.push('금회 근거자료 연결 필요');
            if(draftMode==='blank'&&!edit.clearValue)blockers.push('빈 초안의 입력 칸은 값 비우기를 직접 확인하세요.');
            if(row.formatRole==='picture')blockers.push('서식·개체 관리에서 그림 교체 후 생성본을 다시 분석하세요.');
            else if(!edit.clearValue&&!edit.draftText?.trim()&&(!slotValues||Object.values(slotValues).every(v=>!v.trim())))blockers.push('금회 반영 문안 입력 필요');
            if(row.textRuns?.length&&row.formatRole!=='picture')try{planStyledTextReplacement(row.textRuns.map(r=>({...r,id:r.slotId,plain:true})),edit.clearValue?'':edit.draftText||'',{slotValues:edit.clearValue?undefined:slotValues});}catch(error){blockers.push(error.message);}
        }
        const previousText=row.text||'',kind=row.formatRole==='picture'?'picture':row.target?.cellId?'cell':'paragraph';
        const references=materialIds.map(id=>evidence.get(id)).filter(Boolean).map(m=>({materialId:m.id,sha256:m.sha256,filename:m.filename,format:m.format}));
        blockers.push(...retentionBlockers({decision,contentRole:role,kind,sourceText:previousText,retentionPurpose:edit.retentionPurpose,note:edit.note,evidence:references}));
        if(draftMode==='blank'&&kind!=='picture'&&decision==='keep'&&['measurement','diagnosis','improvement'].includes(role))blockers.push('빈 초안에는 측정값·판정·개선결론을 유지할 수 없습니다. 입력 칸 비우기를 검토하세요.');
        items.push({id:row.id,chapterId:row.chapterId,chapter:row.chapter,discipline:row.discipline,kind,formatRole:row.formatRole,contentRole:role,decision,target:row.target,sourceText:previousText,textRuns:row.textRuns,slotValues:edit.clearValue||decision==='exclude'?undefined:slotValues,clearValue:!!edit.clearValue,retentionPurpose:edit.retentionPurpose,tableTitle:tables.get(row.target?.tableId)?.title||'',value:['replace','rewrite'].includes(decision)?edit.clearValue?'':edit.draftText||'':decision==='exclude'?'':undefined,evidence:references,note:edit.note||'',blockers});
    }
    const chapters=analysis.chapters.map(c=>{const rows=items.filter(i=>i.chapterId===c.id),group=roles=>rows.filter(i=>roles.includes(i.contentRole));return {id:c.id,title:c.title,discipline:c.discipline,total:rows.length,pending:rows.filter(r=>r.blockers.length).length,diagnosisChain:{current:group(['measurement','context']),problems:group(['diagnosis']),improvements:group(['improvement']),management:group(['management'])},items:rows};});
    const blocked=items.filter(i=>i.blockers.length),layout=reproductionStatus(reproductionReview,material.sha256),missing=analysis.provenance?.missingPictures?.length||0,untrustedProvenance=analysis.provenance&&(analysis.provenance.status==='unreadable'||analysis.provenance.assetRolesRecorded!==true),warnings=[...(analysis.limited?['분석 한도에 도달해 전체 본문을 확인하지 못했습니다. 범위를 나누어 다시 분석하세요.']:[]),...(missing?[`원문 그림 ${missing}개가 없는 복원본으로 초안을 생성할 수 없습니다. 원문 자산을 복구해 다시 생성하세요.`]:[]),...(untrustedProvenance?['복원 출처·이미지 역할 기록을 확인할 수 없습니다. 원본 PDF를 최신 엔진으로 다시 한글화하세요.']:[]),...(material.format!=='hwpx'?['초안 서식 보존 작성에는 HWPX 원본이 필요합니다.']:[])],dataReady=items.length>0&&!blocked.length&&!analysis.limited&&!missing&&!untrustedProvenance;
    if(nativeRegeneration)warnings.unshift('한글 열기 호환성 보강 전의 복원 후보입니다. 원본 PDF에서 다시 생성한 뒤 초안을 준비하세요.');
    return {schema:DRAFT_PREPARATION_VERSION,draftMode,projectId,sourceMaterialId:material.id,sourceSha256:material.sha256,analysisVersion:analysis.version,createdAt:new Date().toISOString(),items,chapters,warnings,summary:{total:items.length,ready:items.length-blocked.length,pending:blocked.length,replacements:items.filter(i=>['replace','rewrite'].includes(i.decision)).length,excluded:items.filter(i=>i.decision==='exclude').length,kept:items.filter(i=>i.decision==='keep').length},layout,dataReady:dataReady&&!nativeRegeneration,canWriteDraft:material.format==='hwpx'&&dataReady&&!nativeRegeneration,status:dataReady&&!nativeRegeneration?'inputs-reviewed':'preparing',reportReady:false};
}

export async function draftPreparationFingerprint(plan){
    const value=JSON.stringify({schema:plan.schema,draftMode:plan.draftMode,projectId:plan.projectId,sourceSha256:plan.sourceSha256,analysisVersion:plan.analysisVersion,items:plan.items.map(({id,target,sourceText,textRuns,decision,value,slotValues,clearValue,retentionPurpose,note,evidence,contentRole})=>({id,target,sourceText,textRuns,decision,value,slotValues,clearValue,retentionPurpose,note,evidence,contentRole}))});
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
