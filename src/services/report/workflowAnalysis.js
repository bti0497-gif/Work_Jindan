import {paragraphRole} from './paragraphRole.js';
import {replacementInventory} from './restoration.js';
import {pdfFurniture,pdfFurnitureRegion} from './pdfRestoration.js';

export const WORKFLOW_ANALYZER_VERSION='report-workflow/4';
export const CONTENT_ROLES={label:'고정 라벨·양식 문구',measurement:'측정·운영 데이터',diagnosis:'데이터 분석·진단',improvement:'문제점·개선대책',management:'일반 관리포인트',context:'현황·설명',heading:'제목·캡션'};
export const FORMAT_ROLES={chapterTitle:'장 제목',subheading:'중간·소제목',body:'본문',tableCaption:'표 제목',tableBody:'표 내용'};
export {paragraphRole} from './paragraphRole.js';
export function contentRole(text){
    if(paragraphRole(text)!=='body'||/^\s*[<〈[]?그림\s*\d/.test(text))return 'heading';
    if(/개선|공사비|교체할|문제점|보완|증설/.test(text))return 'improvement';
    if(/판단|판정|분석|진단\s*결과|부적합|과부하|양호|불량|처리효율/.test(text))return 'diagnosis';
    if(/주기적|정기적|관리\s*(?:방안|요령|포인트)|점검할|청소|유지관리|점검이\s*필요/.test(text))return 'management';
    if(/측정|운전|유량|부하|전압|전류|수질|농도|효율|(?:\d[\d.,]*\s*(?:%|℃|kW|mg\/L|m³|A\b|V\b))/.test(text))return 'measurement';
    return 'context';
}
const discipline=text=>/전기|계측제어/.test(text)?'electrical':/기계|배관/.test(text)?'mechanical':/공정|처리시설|처리공법/.test(text)?'process':'common';
export function isWorkflowAnalysisCurrent(analysis,material,projectId,purpose){return !!analysis&&analysis.version===WORKFLOW_ANALYZER_VERSION&&analysis.sourceSha256===material?.sha256&&analysis.projectId===projectId&&(!purpose||analysis.purpose===purpose);}
const ownText=p=>p.textSlots?p.textSlots.map(s=>s.text).join(''):p.text;
const inside=(a,b)=>a&&b&&a[0]>=b[0]-2&&a[1]>=b[1]-2&&a[2]<=b[2]+2&&a[3]<=b[3]+2;

// Structural candidates carry source anchors. Actual pagination and fidelity need separate evidence.
export function buildWorkflowAnalysis({material,projectId,pdf,document,profile,restoration,provenance}){
    const purpose=pdf?'restoration':'authoring',chapters=[],tables=[],pictures=[],sections=[],pageTypes=[],formats={},furniture=[],imageTextRegions=[];
    const byChapter=new Map(),paragraphChapters=new Map();let chapter;
    const ensure=(title='장 미분류',target={})=>{const match=title.match(/제\s*(\d+)\s*장/),id=match?`chapter:${Number(match[1])}`:'chapter:unassigned';let current=byChapter.get(id);
        if(!current){current={id,title,number:match?Number(match[1]):null,target,discipline:discipline(title),paragraphScope:[],pages:[],fonts:[],counts:{},roleFonts:{}};byChapter.set(id,current);chapters.push(current);}return current;};
    const addText=(id,text,target,extra={})=>{if(!text?.trim())return;if(!target.cellId&&/^\s*제\s*\d+\s*장/.test(text))chapter=ensure(text.trim().slice(0,160),target);chapter||=ensure();if(sections.length>=10000)return;
        const formatRole=paragraphRole(text,!!target.cellId);formats[formatRole]=(formats[formatRole]||0)+1;
        sections.push({id,text:text.slice(0,3000),target,chapterId:chapter.id,chapter:chapter.title,discipline:chapter.discipline,formatRole,contentRole:contentRole(text),reviewRequired:true,...extra});};
    if(pdf){for(const page of pdf.pages){
        if(page.chapter)chapter=ensure(page.chapter,{page:page.number});chapter||=ensure();chapter.pages.push(page.number);
        pageTypes.push({page:page.number,chapterId:chapter.id,kind:page.kind,widthPt:page.widthPt,heightPt:page.heightPt,discipline:page.discipline,warnings:page.warnings||[]});
        const bodyTables=page.tables.filter(t=>!pdfFurnitureRegion(t.bbox,page));
        for(const [i,line]of page.lines.entries())if(!pdfFurnitureRegion(line.bbox,page,line.text)&&!page.tables.some(t=>inside(line.bbox,t.bbox)))addText(`pdf:p${page.number}:line${i}`,line.text,{page:page.number,line:i},{bbox:line.bbox,sizePt:line.size,fonts:line.fonts||[]});
        for(const table of bodyTables){tables.push({...table,page:page.number,chapterId:chapter.id,chapter:chapter.title,discipline:page.discipline,title:page.lines.filter(l=>/^[<〈[]?\s*표\s*\d/.test(l.text)&&l.bbox[3]<=table.bbox[1]+3&&table.bbox[1]-l.bbox[3]<50).at(-1)?.text||`표 ${tables.length+1}`});for(const cell of table.cells)addText(cell.id,cell.text,{page:page.number,tableId:table.id,cellId:cell.id});}
        for(const image of page.images){const row={...image,page:page.number,chapterId:chapter.id,chapter:chapter.title,discipline:page.discipline,title:`그림 ${pictures.length+1}`,reviewRequired:true};if(image.kind==='text-raster')imageTextRegions.push(row);else if(!pdfFurnitureRegion(image.bbox,page))pictures.push(row);}
        for(const area of pdfFurniture(page))if(area.lines.length||area.tables.length||area.images.length||area.rules.length||area.fills.length)furniture.push({...area,id:`pdf:p${page.number}:${area.kind}`,chapterId:chapter.id});
    }}else if(document){
        const seen=new Set();for(const p of document.paragraphs){if(p.area&&p.area!=='body')continue;const text=ownText(p);if(!p.tableId)addText(p.id,text,{paragraphId:p.id},{charShapeIds:[...new Set((p.textSlots||[]).map(s=>s.charShapeId))],paragraphShapeId:p.paragraphShapeId,textRuns:(p.textSlots||[]).map(s=>({slotId:s.id,text:s.text,charShapeId:s.charShapeId,paragraphIndex:s.paragraphIndex}))});chapter||=ensure();
            if(Number.isInteger(p.index)){chapter.paragraphScope.push({section:p.anchor.section,index:p.index});paragraphChapters.set(`${p.anchor.section}:${p.index}`,chapter);}
            if(p.tableId&&!seen.has(p.tableId)){seen.add(p.tableId);const table=document.tables.find(t=>t.id===p.tableId);if(table){tables.push({...table,chapterId:chapter.id,chapter:chapter.title,discipline:chapter.discipline});for(const cell of table.cells)addText(cell.id,cell.text,{tableId:table.id,cellId:cell.id},{charShapeIds:[...new Set((cell.textSlots||[]).map(s=>s.charShapeId))],textRuns:(cell.textSlots||[]).map(s=>({slotId:s.id,text:s.text,charShapeId:s.charShapeId,paragraphIndex:s.paragraphIndex}))});}}
        }
        // A page anchor can contain positioned text boxes but no text of its own.
        // Its pictures belong with the first actual descendant body paragraph.
        const descendantOwners=new Map();
        for(const p of document.paragraphs.filter(p=>(!p.area||p.area==='body')&&!p.tableId&&ownText(p).trim()&&p.anchor?.path)){
            const owner=paragraphChapters.get(`${p.anchor.section}:${p.index}`);let path=p.anchor.path;
            while(path.lastIndexOf('/')>0){path=path.slice(0,path.lastIndexOf('/'));const key=`${p.anchor.section}:${path}`;if(!descendantOwners.has(key))descendantOwners.set(key,owner);}
        }
        for(const p of document.paragraphs.filter(p=>(!p.area||p.area==='body')&&!ownText(p).trim()&&p.anchor?.path)){
            const owner=descendantOwners.get(`${p.anchor.section}:${p.anchor.path}`),key=`${p.anchor.section}:${p.index}`,previous=paragraphChapters.get(key);
            if(owner&&owner!==previous){if(previous)previous.paragraphScope=previous.paragraphScope.filter(s=>s.section!==p.anchor.section||s.index!==p.index);owner.paragraphScope.push({section:p.anchor.section,index:p.index});paragraphChapters.set(key,owner);}
        }
        const assets=new Map((provenance?.assets||[]).map(a=>[a.binaryItemId,a]));
        for(const object of restoration?.objects||[])if(object.kind==='pic'&&object.area==='body'){const owner=paragraphChapters.get(`${object.section}:${object.paragraphIndex}`)||ensure(),asset=assets.get(object.image?.binaryId),row={...object,chapterId:owner.id,chapter:owner.title,discipline:owner.discipline,title:asset?.kind==='text-raster'?'이미지로 저장된 본문':`그림 ${pictures.length+1}`,sourcePage:asset?.sourcePage,sourceBbox:asset?.bbox,reviewRequired:true};if(asset?.kind==='text-raster')imageTextRegions.push({...row,kind:'text-raster'});else pictures.push(row);}
        furniture.push(...(restoration?.furniture||[]).map(area=>({...area,shared:true})));
    }
    for(const current of chapters){const rows=sections.filter(row=>row.chapterId===current.id),chapterPages=pageTypes.filter(p=>p.chapterId===current.id),sectionNames=new Set(current.paragraphScope.map(p=>p.section));
        const areas=furniture.filter(area=>area.chapterId===current.id||area.shared&&sectionNames.has(area.section));
        current.counts={tables:tables.filter(t=>t.chapterId===current.id).length,pictures:pictures.filter(p=>p.chapterId===current.id).length,headers:areas.filter(a=>a.kind==='header').length,footers:areas.filter(a=>a.kind==='footer').length,
            bodyParagraphs:rows.filter(r=>r.formatRole==='body').length,chapterTitles:rows.filter(r=>r.formatRole==='chapterTitle').length,subheadings:rows.filter(r=>r.formatRole==='subheading').length,tableCaptions:rows.filter(r=>r.formatRole==='tableCaption').length,
            totalPages:pdf?chapterPages.length:null,bodyPages:pdf?chapterPages.filter(p=>p.kind==='body').length:null,blankPages:pdf?chapterPages.filter(p=>p.kind==='blank').length:null,dividerPages:pdf?chapterPages.filter(p=>p.kind==='divider').length:null,imageTextRegions:imageTextRegions.filter(p=>p.chapterId===current.id).length};
        current.furniture=areas.map(area=>({id:area.id,kind:area.kind,shared:!!area.shared,section:area.section,applyPageType:area.applyPageType,text:area.lines?.map(l=>l.text).join(' ')||area.slots?.map(s=>s.text).join(' ')||''}));
        const fontSet=new Set();for(const row of rows){const fonts=row.fonts||row.charShapeIds?.map(id=>profile?.characterStyles?.[id]?.font).filter(Boolean)||[];for(const font of fonts){fontSet.add(font);const list=current.roleFonts[row.formatRole]||=[];if(!list.includes(font))list.push(font);}}
        current.fonts=[...fontSet];current.pageEvidence=pdf?'pdf-pages':'unverified';current.reproductionVerified=false;
    }
    const warnings=[...new Set([...(pdf?.pages.flatMap(p=>p.warnings||[])||[]),...(provenance?.warnings||[]),...(imageTextRegions.length?['텍스트가 추출되지 않은 이미지 영역이 있습니다. OCR 없이 원문 그림으로 보존하며 편집 글자는 확인이 필요합니다.']:[]),...(!pdf?['HWPX 구조만으로 실제 본문 페이지 수를 확정하지 않습니다. 머리말·꼬리말은 같은 구역의 여러 챕터에서 공유할 수 있습니다.']:[])])];
    return {schema:'jindan-workflow-analysis/1',version:WORKFLOW_ANALYZER_VERSION,purpose,projectId,sourceSha256:material.sha256,createdAt:new Date().toISOString(),chapters:chapters.filter(c=>sections.some(r=>r.chapterId===c.id)||c.counts.tables||c.counts.pictures||c.counts.imageTextRegions||c.pages.length||c.number!=null&&c.paragraphScope.length),tables,pictures,sections,pageTypes,formats,furniture,imageTextRegions,provenance:provenance||null,profile:profile||null,inventory:replacementInventory(document,pdf,restoration),warnings,limited:sections.length>=10000,status:'review-required',reportReady:false,layoutVerified:false};
}
