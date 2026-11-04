import {isWorkflowAnalysisCurrent} from './workflowAnalysis.js';
import {pdfAuthoringPlan} from './pdfHwpxWriter.js';
import {PDF_ANALYZER_VERSION} from './pdfStructure.js';

// The analyzed chapter owns the page range; manual output settings cannot widen it.
export function chapterConversionScope({material,projectId,analysis,pdf,chapterId,title}){
    if(material?.format!=='pdf'||!isWorkflowAnalysisCurrent(analysis,material,projectId,'restoration')||pdf?.source?.sha256!==material.sha256||pdf.projectId!==projectId)throw new Error('현재 PDF의 복원 분석을 먼저 완료하세요.');
    if(pdf.parserVersion!==PDF_ANALYZER_VERSION)throw new Error('표 서식과 페이지 설정을 다시 읽어야 합니다. PDF 복원 분석을 다시 실행하세요.');
    const chapter=analysis.chapters.find(item=>item.id===chapterId);
    if(!chapter)throw new Error('분석보기에서 한글화할 장 카드를 선택하세요.');
    const pages=chapter.pages;
    if(!Array.isArray(pages)||!pages.length||pages.length>300||new Set(pages).size!==pages.length||pages.some(n=>!Number.isInteger(n)||!pdf.pages.some(p=>p.number===n)||!analysis.pageTypes.some(p=>p.page===n&&p.chapterId===chapter.id)||analysis.chapters.some(c=>c.id!==chapter.id&&c.pages?.includes(n))))throw new Error('선택한 장의 페이지 범위를 확인하세요. 한 번에 300쪽까지 한글화할 수 있습니다.');
    return {sourceMaterialId:material.id,sourceSha256:material.sha256,sourceChapterId:chapter.id,sourceChapterTitle:String(title||chapter.title).trim().slice(0,160),sourcePages:[...pages].sort((a,b)=>a-b)};
}

export function chapterConversionPlan(input,settings={}){
    const scope=chapterConversionScope(input),plan=pdfAuthoringPlan(input.pdf,{...settings,pages:scope.sourcePages},input.projectId,'reference');
    return {...plan,chapterScope:scope};
}

export function chapterCandidateFilename(filename,title){
    // Keep the source recognizable while avoiding Windows path characters and long paths.
    const safe=value=>String(value).replace(/[<>:"/\\|?*]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
    return `${safe(filename.replace(/\.pdf$/i,'')).slice(0,90)}-${safe(title).slice(0,65)||'선택장'}-한글복원후보.hwpx`;
}
