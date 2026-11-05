import {draftTextTarget} from './draftSourceBindings.js';
import {analyzeReport} from './sourceParser.js';
import {replaceHwpxSlots,readHwpxPackage,packHwpxPackage} from './hwpxPackage.js';
import {inspectRestoration} from './restoration.js';
import {buildDraftPreparation,draftPreparationFingerprint} from './draftPreparation.js';
import {strToU8} from 'fflate';
import {planStyledTextReplacement} from './styledTextReplacement.js';
import {inspectPdfProvenance,needsPdfNativeRegeneration} from './pdfProvenance.js';

export async function writePreparedDraft(bytes,context){
    if(needsPdfNativeRegeneration(inspectPdfProvenance(bytes)?.engineVersion))throw new Error('한글 열기 호환성 보강 전의 복원 후보입니다. 원본 PDF에서 다시 한글화하세요.');
    const plan=buildDraftPreparation(context);if(!plan.canWriteDraft)throw new Error('미검토 항목과 금회 자료·반영 문안을 먼저 확인하세요.');
    const document=await analyzeReport(bytes,context.material.filename);if(document.format!=='hwpx'||document.source.sha256!==plan.sourceSha256)throw new Error('초안 양식의 한글 원본 버전이 다릅니다.');
    const replacements=[],removeObjects=[],used=new Set(),covered=new Set(),coveredPictures=new Set(),objects=inspectRestoration(bytes,plan.sourceSha256).objects;
    for(const item of plan.items){
        if(item.kind==='picture'){if(!['keep','exclude'].includes(item.decision)||!objects.some(o=>o.id===item.target.objectId&&o.kind==='pic'&&o.area==='body'))throw new Error('초안 그림의 원본 위치와 결정을 확인하세요.');coveredPictures.add(item.target.objectId);if(item.decision==='exclude')removeObjects.push(item.target.objectId);continue;}
        const target=draftTextTarget(document,item);
        target.textSlots.forEach(s=>covered.add(s.id));if(item.decision==='keep'){
            if(item.retentionPurpose==='historical-comparison'){const s=target.textSlots[0];replacements.push({section:s.section,slotId:s.id,expectedText:s.text,wholeText:true,value:'[전회 비교자료] '+s.text});used.add(s.id);}
            continue;
        }
        const edits=planStyledTextReplacement(target.textSlots,item.value||'',{slotValues:item.slotValues});for(const edit of edits){if(used.has(edit.slotId))throw new Error('초안 반영 위치가 서로 겹칩니다.');used.add(edit.slotId);replacements.push(edit);}
    }
    const bodySlots=document.paragraphs.filter(p=>(!p.area||p.area==='body')).flatMap(p=>p.textSlots||[]).filter(s=>s.text.trim());
    if(bodySlots.some(s=>!covered.has(s.id))||objects.some(o=>o.kind==='pic'&&o.area==='body'&&!coveredPictures.has(o.id)))throw new Error('분석 목록에 없는 본문·그림이 있습니다. 전체 원본을 다시 분석하세요.');
    const changed=replacements.length||removeObjects.length?await replaceHwpxSlots(bytes,plan.sourceSha256,replacements,{removeObjects,clearTextControls:true,clearEmptyCaptionFields:true}):{bytes:new Uint8Array(bytes),changedSections:[],replacedSlots:0};
    const entries=readHwpxPackage(changed.bytes),fingerprint=await draftPreparationFingerprint(plan),review={schema:'jindan-prepared-draft/1',draftMode:plan.draftMode,projectId:plan.projectId,sourceMaterialId:plan.sourceMaterialId,sourceSha256:plan.sourceSha256,inputFingerprint:fingerprint,createdAt:new Date().toISOString(),summary:plan.summary,changes:plan.items.map(({id,target,decision,retentionPurpose,clearValue,note,evidence,contentRole})=>({id,target,decision,retentionPurpose,clearValue,note,evidence,contentRole})),status:plan.draftMode==='blank'?'blank-working-draft':'working-draft',reportReady:false,requiresLayoutReview:true};
    entries['Contents/jindan-draft.json']=strToU8(JSON.stringify(review));
    return {bytes:packHwpxPackage(entries),review};
}
