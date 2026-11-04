import {pairedParagraphStyle} from './pairedParagraphStyle.js';
import {validateGeneratedHwpx} from './generatedHwpxValidation.js';
import base from './assets/hwpxBase.json' with {type:'json'};
import {strToU8} from 'fflate';
import {packHwpxPackage} from './hwpxPackage.js';
import {repairReportNumbering} from './reportNumbering.js';
import {pdfFurniture,pdfFurnitureRegion,pdfPrintedPageNumber,isPdfPageNumber} from './pdfRestoration.js';
import {pdfFontFamily} from './pdfFonts.js';
import {pdfColor,hwpxBorderWidth,restoreDoublePdfBorders} from './pdfAppearance.js';
import {paperPosition,pdfHwpxShape} from './pdfHwpxShapes.js';
import {MAX_HWPX_PNG_BYTES,MAX_PDF_PICTURES_BYTES} from './pdfImageLimits.js';
import {verifiedCellMargins} from './pairedTableMargins.js';
import {verifiedCellTextFormat} from './pairedCellFormatting.js';
import {localizePdfFurniture,pdfFurnitureRule,pdfGraphPartition,pdfGraphPartitionShape} from './pdfFurnitureCoordinates.js';
import {literalPageNumberDecoration} from './pageNumberDecoration.js';
import {verifiedPdfCellLines,pdfRunTypography} from './pdfCellLayout.js';
import {editableFontEmbeddingFlags,missingFontGlyphs} from './sfntFonts.js';
import {pdfEmbeddedFontProfile} from './pdfFonts.js';
import {enclosingPdfTextContainer} from './pdfTextFrame.js';
export const PDF_HWPX_WRITER_VERSION='pdf-hwpx/28';

// XML 1.0 forbids these control characters.
// eslint-disable-next-line no-control-regex
const escape=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const pt=value=>Math.round(value*100),mm=value=>Math.round(value*7200/25.4);
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inBox=(a,b)=>a[0]>=b[0]-2&&a[1]>=b[1]-2&&a[2]<=b[2]+2&&a[3]<=b[3]+2;
const furniture=(line,page)=>!!pdfFurnitureRegion(line.bbox,page,line.text);
export function pdfPageDiscipline(page,settings={}){return settings.disciplines?.[page.number]||page.discipline;}
export function pdfElectricalChapterNumber(analysis){
    const chapter=analysis?.pages?.filter(p=>p.discipline==='electrical').map(p=>p.chapter||p.headings?.[0]?.text||'').find(text=>/제\s*\d+\s*장/.test(text));
    return Number(chapter?.match(/제\s*(\d+)\s*장/)?.[1])||5;
}

export function pdfAuthoringPlan(analysis,settings,projectId,mode='draft') {
    if(analysis?.schema!=='jindan-pdf-analysis/1'||analysis.projectId!==projectId||!/^project:/.test(projectId)||!validHash(analysis.source?.sha256))throw new Error('현재 프로젝트에 귀속된 PDF 분석 결과를 선택하세요.');
    if(!['draft','reference'].includes(mode))throw new Error('한글 작성 모드를 확인하세요.');
    const selected=new Set(settings?.pages||[]);
    if(!selected.size||selected.size>300||[...selected].some(n=>!analysis.pages.some(p=>p.number===n)))throw new Error('작성할 PDF 쪽을 1~300개 선택하세요.');
    const pages=analysis.pages.filter(p=>selected.has(p.number));
    if(mode==='draft'&&pages.some(p=>!['electrical','common'].includes(pdfPageDiscipline(p,settings))))throw new Error('금회 전기 양식에는 전기 또는 검토한 공통 쪽만 선택하세요.');
    if(mode==='draft'&&!settings.labelsReviewed)throw new Error('유지할 표 항목 열과 금회 입력 칸을 먼저 검토하세요.');
    const blocks=[],warnings=[],mapping=[],editedLocations=[],furnitureAreas=[],pageDecorations=[];let tableNumber=0,pictureNumber=0,lastTableCaption='';
    // Restoration follows observed page coordinates; draft composition keeps normal paragraph flow.
    // Native tables alone can also overflow when added after an artificial anchor paragraph.
    const positionedPages=mode==='reference'?pages.filter(p=>p.kind!=='blank').map(p=>p.number):[];
    const chapterNumber=Number(settings.chapterNumber??pdfElectricalChapterNumber(analysis));
    if(!Number.isInteger(chapterNumber)||chapterNumber<1||chapterNumber>999)throw new Error('전기 장 번호는 1~999로 입력하세요.');
    if(mode==='draft')blocks.push({kind:'heading',text:`제${chapterNumber}장 전기 및 계측제어 설비 분야`,size:18});
    for(const page of pages){
        if(mode==='reference')warnings.push(...(page.warnings||[]).filter(w=>/글자 좌표|해독하지 못한 글자/.test(w)));
        if(mode==='reference')for(const area of pdfFurniture(page))if(area.lines.length||area.tables.length||area.images.length||area.rules?.length||area.fills?.length||area.paths?.length)furnitureAreas.push(area);
        if(mode==='reference'){
            const used=new Set(pdfFurniture(page).flatMap(a=>[...a.rules,...a.fills,...a.paths])),ruleBox=r=>r.axis==='h'?[r.start,r.at,r.end,r.at]:[r.at,r.start,r.at,r.end];
            pageDecorations.push({sourcePage:page.number,paths:(page.vectorPaths||[]).filter(p=>!used.has(p)&&!page.tables.some(t=>inBox(p.bbox,t.bbox))),graphPartitions:(page.decorationLines||[]).map((rule,ruleIndex)=>({rule,evidence:pdfGraphPartition(rule,page.images),ruleIndex})).filter(e=>e.evidence),rules:(page.decorationLines||[]).filter(r=>!used.has(r)&&!page.tables.some(t=>inBox(ruleBox(r),t.bbox))),fills:(page.decorationFills||[]).filter(f=>!used.has(f)&&!page.tables.some(t=>inBox(f.bbox,t.bbox)))});
        }
        for(const [lineIndex,line]of page.lines.entries())if(line.editedByUser)editedLocations.push({page:page.number,lineIndex,bbox:line.bbox});
        for(const table of page.tables)for(const cell of table.cells)if(cell.editedByUser)editedLocations.push({page:page.number,tableId:table.id,cellId:cell.id});
        for(const [lineIndex,line]of(page.ocr?.mergedLines||[]).entries())if(line.editedByUser)editedLocations.push({page:page.number,lineIndex,bbox:line.bbox});
        if(page.kind==='blank'){if(mode==='reference')blocks.push({kind:'paragraph',text:'',pageBreak:blocks.length>0,source:{page:page.number},blankPage:true});continue;}
        if(page.kind==='scan'||page.images.some(i=>i.kind==='text-raster'))warnings.push(`PDF ${page.number}쪽: 편집 글자가 없는 이미지 영역을 원본 그림으로 보존합니다. 텍스트와 쪽 배치를 확인하세요.`);
        const entries=[];
        const lines=page.ocr?.mergedLines||page.lines;
        for(const [index,line]of lines.entries()){
            if(furniture(line,page)||page.tables.some(table=>inBox(line.bbox,table.bbox)))continue;
            if(mode==='draft'&&(/^제\s*\d+\s*장/.test(line.text)||/^\s*[<〈[]?\s*(?:표|그림)\s*\d/.test(line.text)))continue;
            const heading=/^(?:제\s*\d+\s*장|\d+(?:\.\d+){1,4}\.?\s|[가-힣]\s*\.)/.test(line.text)&&line.text.length<180;
            const pairedTypography=mode==='reference'&&analysis.pairedLearning?.pdfSourceSha256===analysis.source.sha256&&line.pairedEmphasisSource?.referenceSha256===analysis.pairedLearning?.referenceSha256?line.pairedTypography:undefined;
            if(mode==='reference'||heading)entries.push({y:line.bbox[1],kind:heading?'heading':'paragraph',text:line.text,runs:line.runs,pairedTypography,pairedTypographySource:pairedTypography?line.pairedTypographySource:undefined,size:Math.max(5,Math.min(72,line.size||10)),fontFamily:pairedTypography?.font||line.fonts?.map(pdfFontFamily).find(Boolean)||'',color:line.color,paintOrder:line.paintOrder,bold:line.bold??(line.fonts?.some(f=>/bold|heavy|black/i.test(f))||false),source:{page:page.number,line:index,bbox:line.bbox,baseline:line.baseline,ocr:!!line.ocr}});
        }
        for(const originalTable of page.tables){
            const table=mode==='reference'?restoreDoublePdfBorders(originalTable,page.decorationLines):originalTable;
            if(mode==='reference'&&pdfFurnitureRegion(table.bbox,page))continue;
            const keep=settings.labelColumns?.[table.id]||[0];
            if(!Array.isArray(keep)||keep.some(c=>!Number.isInteger(c)||c<0||c>=table.columns))throw new Error('표에서 유지할 항목 열을 확인하세요.');
            const headerRows=settings.headerRows?.[table.id]||[],roles=settings.cellRoles?.[table.id]||{};
            if(!Array.isArray(headerRows)||headerRows.some(r=>!Number.isInteger(r)||r<0||r>=table.rows)||new Set(headerRows).size!==headerRows.length||Object.entries(roles).some(([id,role])=>!table.cells.some(c=>c.id===id)||!['label','header','input'].includes(role)))throw new Error('검토한 표 머리행·셀 역할을 확인하세요.');
            const captionSource=page.lines.filter(l=>/표/.test(l.text)&&l.bbox[3]<=table.bbox[1]+3&&table.bbox[1]-l.bbox[3]<45).at(-1);
            const caption=captionSource?.text||(mode==='reference'?'':'전기 분야 조사표');
            const continued=/표\s*계속/.test(caption)&&lastTableCaption;
            const generated=continued?`${lastTableCaption} (계속)`:`<표 ${chapterNumber}-${++tableNumber}> ${caption.replace(/^[<〈[]?\s*표\s*(?:계속|\d+(?:\s*[-.]\s*\d+)*)?\s*[>〉\]]?\s*/,'')||'전기 분야 조사표'}`;
            if(!continued)lastTableCaption=generated;
            if(mode==='reference'&&caption)for(let i=entries.length-1;i>=0;i--)if(entries[i].text===caption)entries.splice(i,1);
            entries.push({y:table.bbox[1],kind:'table',table:{...table,cells:table.cells.map(cell=>({...cell,text:mode==='reference'||roles[cell.id]!=='input'&&(['label','header'].includes(roles[cell.id])||Array.from({length:cell.rowSpan},(_,i)=>cell.row+i).every(r=>headerRows.includes(r))||Array.from({length:cell.colSpan},(_,i)=>cell.column+i).every(c=>keep.includes(c)))?cell.text:''}))},caption:mode==='reference'?caption:generated,captionSource,source:{page:page.number,tableId:table.id,bbox:table.bbox}});
        }
        const groups=[];
        const overlap=(a,b)=>Math.min(a[2],b[2])-Math.max(a[0],b[0])>1&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>1;
        const underlays=new Set(mode==='reference'?page.images.filter(image=>positionedPages.includes(page.number)||lines.some(line=>overlap(line.bbox,image.bbox))):[]);
        // Hancom exports a large decoration as adjacent tiles; keep the whole grid together.
        for(let changed=true;changed;){changed=false;for(const image of page.images)if(!underlays.has(image)&&[...underlays].some(other=>{const a=image.bbox,b=other.bbox;return ((Math.abs(a[0]-b[2])<1||Math.abs(a[2]-b[0])<1)&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>8)||((Math.abs(a[1]-b[3])<1||Math.abs(a[3]-b[1])<1)&&Math.min(a[2],b[2])-Math.max(a[0],b[0])>8);})){underlays.add(image);changed=true;}}
        for(const image of page.images.filter(i=>mode==='reference'||i.kind!=='text-raster').sort((a,b)=>positionedPages.includes(page.number)?a.operator-b.operator:a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0])){
            if(furniture({bbox:image.bbox},page))continue;
            // A decoration/photo underneath live PDF text must remain behind that text.
            if(underlays.has(image)){entries.push({y:-1,kind:'picture',images:[image],background:true,source:{page:page.number,imageIds:[image.id],bbox:image.bbox}});continue;}
            const previous=groups.at(-1);
            if(previous&&Math.abs(previous[0].bbox[1]-image.bbox[1])<4&&Math.abs(previous[0].bbox[3]-image.bbox[3])<8)previous.push(image);else groups.push([image]);
        }
        for(const images of groups){
            const top=Math.min(...images.map(i=>i.bbox[1])),bottom=Math.max(...images.map(i=>i.bbox[3]));
            const captionLine=page.lines.find(l=>/^[<〈[]?\s*그림\s*\d/.test(l.text)&&l.bbox[1]>=bottom-2&&l.bbox[1]-bottom<60);
            const originalCaption=captionLine?.text;
            const labelLines=captionLine?page.lines.filter(l=>l.bbox[1]>=bottom-1&&l.bbox[3]<captionLine.bbox[1]&&!/^(?:제\s*\d+\s*장|\d+(?:\.\d+){1,4})/.test(l.text)):[];
            for(let i=entries.length-1;i>=0;i--)if(originalCaption&&entries[i].text===originalCaption||labelLines.some(l=>entries[i].text===l.text&&Math.abs(entries[i].y-l.bbox[1])<1))entries.splice(i,1);
            const label=`그림 ${chapterNumber}-${++pictureNumber}`;
            entries.push({y:top,kind:'picture',images,labels:labelLines.map(l=>l.text).join('\n'),captionSource:captionLine,caption:mode==='reference'?(originalCaption||''):`<${label}> ${originalCaption?.replace(/^[<〈[]?\s*그림\s*\d+(?:\s*[-.]\s*\d+)*\s*[>〉\]]?\s*/,'')||'전기 분야 사진·그래프'}`,source:{page:page.number,imageIds:images.map(i=>i.id)},placeholder:mode==='draft'?'금회 사진·그래프를 등록하고 검토하세요.':'원문 그림을 확인하세요.'});
        }
        if(mode==='reference'&&analysis.pairedLearning?.pdfSourceSha256===analysis.source.sha256){
            const compact=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
            for(const learned of analysis.pairedLearning.paragraphs.filter(p=>p.page===page.number)){
                const matched=learned.lineIndices.map(i=>entries.find(b=>b.source?.line===i&&['paragraph','heading'].includes(b.kind)));
                if(!matched.length||matched.some(b=>!b)||compact(matched.map(b=>b.text).join(''))!==compact(learned.text)||learned.runs&&compact(learned.runs.map(r=>r.text).join(''))!==compact(learned.text))continue;
                if(new Set(learned.lineIndices).size!==learned.lineIndices.length)throw new Error('원본 문단 대응 줄이 중복되었습니다.');
                const first=matched[0],last=matched.at(-1),bbox=[Math.min(...matched.map(b=>b.source.bbox[0])),first.source.bbox[1],Math.max(...matched.map(b=>b.source.bbox[2])),last.source.bbox[3]];
                for(const row of matched)entries.splice(entries.indexOf(row),1);
                entries.push({...first,text:learned.text,pairedParagraph:learned,size:learned.typography.sizePt,fontFamily:learned.typography.font,source:{...first.source,bbox,lines:learned.lineIndices}});
            }
        }
        entries.sort((a,b)=>a.y-b.y);
        if(mode==='draft'&&!entries.some(e=>e.kind==='paragraph'))entries.push({kind:'paragraph',text:'[금회 조사 결과·요약·진단·관리요점 및 개선사항 입력]',size:10});
        if(!entries.length&&page.kind!=='divider')entries.push({kind:'paragraph',text:mode==='reference'?'':`[PDF ${page.number}쪽의 내용을 원문과 대조하여 입력하세요.]`,size:10,source:{page:page.number}});
        if(mode==='reference'&&entries.length)entries[0].pageBreak=blocks.length>0;
        for(const entry of entries){const id=`block:${blocks.length}`;blocks.push({...entry,id});if(entry.source)mapping.push({blockId:id,...entry.source});}
    }
    if(blocks.length>20000)throw new Error('작성 내용이 한도를 넘습니다. PDF 쪽 범위를 나누세요.');
    if(mode==='reference'&&furnitureAreas.length)warnings.push('머리말·꼬리말은 원문 위치로 추정했습니다. 쪽별 내용과 개체 배치를 검토하세요.');
    if(mode==='reference'&&blocks.some(b=>b.text&&!b.fontFamily&&!b.blankPage))warnings.push('일부 PDF 글꼴을 특정하지 못했습니다. 글꼴 정보가 없는 이전 분석은 다시 분석하고, 해독하지 못한 글꼴은 원본 한글과 대조하세요.');
    if(mode==='reference'&&pages.some(p=>p.tables.some(t=>t.cells.some(c=>!c.fonts?.map(pdfFontFamily).find(Boolean)))))warnings.push('글꼴을 특정하지 못한 표 셀에는 기본 글꼴을 사용했습니다. 원본 한글의 표 서체를 확인해 지정하세요.');
    if(mode==='reference'&&blocks.some(b=>b.pairedParagraph))warnings.push('원본 쌍의 일치 문단은 원래 들여쓰기·줄간격·글자 서식으로 묶었습니다. 문단 사이 흐름과 길이 변경 후 쪽 재배치는 한글에서 확인해야 합니다.');
    if(mode==='reference')warnings.push('추출한 글자·표는 한글 개체로 작성하며 글자가 없는 이미지 영역은 그림으로 보존합니다. 편집 글자 복원과 실제 한글의 줄바꿈·배치는 별도 확인이 필요합니다.');
    if(mode==='reference'&&pages.some(p=>p.fontEvidence?.length))warnings.push('원본 PDF의 내장 글꼴명과 스트림 SHA를 연결했습니다. 한글의 실제 설치·대체 글꼴 및 표시 폭은 별도 검증해야 합니다.');
    return {schema:'jindan-pdf-authoring/1',projectId,mode,source:analysis.source,blocks,mapping,editedLocations,pageDecorations,fontEvidence:pages.flatMap(p=>(p.fontEvidence||[]).map(f=>({sourcePage:p.number,...f}))),furniture:furnitureAreas,positionedPages,imageSources:Object.fromEntries(pages.flatMap(p=>p.images.map(i=>[i.id,p.number]))),sourcePages:pages.map(p=>({number:p.number,kind:p.kind,widthPt:p.widthPt,heightPt:p.heightPt,printedPageNumber:pdfPrintedPageNumber(p),bodyTextRightPt:Math.max(0,...p.lines.filter(l=>!furniture(l,p)).map(l=>l.bbox[2]),...p.tables.map(t=>t.bbox[2]))})),dividerPages:pages.filter(p=>p.kind==='divider').map(p=>p.number),firstPageKind:pages[0].kind,sourcePageSize:{widthPt:pages[0].widthPt,heightPt:pages[0].heightPt},firstPrintedPageNumber:pdfPrintedPageNumber(pages[0]),reviewedReferenceText:analysis.pairedTextReviews||null,styleReference:settings.styleReference||null,pairedReference:analysis.pairedLearning?{referenceMaterialId:analysis.pairedLearning.referenceMaterialId,referenceSha256:analysis.pairedLearning.referenceSha256,pdfSourceSha256:analysis.source.sha256,matchedParagraphs:blocks.filter(b=>b.pairedParagraph).length,emphasisBindings:(analysis.pairedLearning.emphasis||[]).filter(e=>selected.has(e.page)),tableMarginBindings:blocks.filter(b=>b.kind==='table').flatMap(b=>b.table.cells.filter(c=>c.pairedMarginSource).map(c=>({pdfTableId:b.table.id,...c.pairedMarginSource,marginsHwpUnit:c.pairedMargins})))}:null,warnings,status:'review-required',reportReady:false};
}

export function writePdfHwpx(plan,{spec={},pictures={},fonts={assets:[],warnings:[]}}={}) {
    if(plan?.schema!=='jindan-pdf-authoring/1'||!validHash(plan.source?.sha256)||!/^project:/.test(plan.projectId))throw new Error('PDF 작성 계획을 확인하세요.');
    if(plan.blocks.length>20000)throw new Error('작성 내용이 한도를 넘습니다.');
    let id=100,header=base.header,totalPictureBytes=0;const chars=new Map(),extraChars=[],layoutParas=[],entries={},binaryItems=[],missingPictures=[],cellBorders=new Map(),assetMapping=[],cellLineEvidence=[],unresolvedCellLayout=[],vectorPathEvidence=[];
    const bodyFont=String(spec.fontFamily||'함초롬바탕').slice(0,100);
    const bodySize=spec.fontSizePt??10;
    if(!Number.isFinite(bodySize)||bodySize<5||bodySize>24)throw new Error('본문 글자 크기는 5~24pt로 입력하세요.');
    for(const [key,min,max]of[['widthPercent',50,200],['spacingPercent',-50,50],['lineSpacingPercent',50,400]])if(spec[key]!=null&&(!Number.isFinite(spec[key])||spec[key]<min||spec[key]>max))throw new Error('출력 장평·자간·줄간격을 확인하세요.');
    if(spec.pageNumberFormat&&!['DIGIT','ROMAN_CAPITAL','ROMAN_SMALL'].includes(spec.pageNumberFormat))throw new Error('쪽 번호 형식을 확인하세요.');
    if(spec.pageNumberPosition&&!['TOP_LEFT','TOP_CENTER','TOP_RIGHT','BOTTOM_LEFT','BOTTOM_CENTER','BOTTOM_RIGHT','OUTSIDE_TOP','OUTSIDE_BOTTOM','INSIDE_TOP','INSIDE_BOTTOM'].includes(spec.pageNumberPosition))throw new Error('쪽 번호 위치를 확인하세요.');
    const charBase=header.match(/<hh:charPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:charPr>/)?.[0];
    const paraBase=header.match(/<hh:paraPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:paraPr>/)?.[0];
    if(!charBase||!paraBase)throw new Error('한글 기본 서식이 없습니다.');
    const charStart=Number(header.match(/<hh:charProperties itemCnt="(\d+)"/)?.[1]),paraStart=Number(header.match(/<hh:paraProperties itemCnt="(\d+)"/)?.[1]),borderId=Number(header.match(/<hh:borderFills itemCnt="(\d+)"/)?.[1])+1;
    const sourceFonts=new Map(),sourceTabs=new Map(),tabStart=Math.max(...[...header.matchAll(/<hh:tabPr\b[^>]*id="(\d+)"/g)].map(m=>Number(m[1])))+1,fontStart=Math.max(...[...header.matchAll(/<hh:font\b[^>]*id="(\d+)"/g)].map(m=>Number(m[1])))+1;
    const char=(size,bold=false,family=bodyFont,color,typography)=>{color=pdfColor(color)||'#000000';const key=`${Math.round(size*100)}:${bold}:${family}:${color}:${typography?.widthPercent}:${typography?.spacingPercent}:${typography?.italic}:${typography?.useFontSpace===true?1:0}`;if(chars.has(key))return chars.get(key);const next=charStart+chars.size;chars.set(key,next);let xml=charBase.replace('id="0"',`id="${next}"`).replace(/height="\d+"/,`height="${Math.round(size*100)}"`).replace(/textColor="[^"]*"/,`textColor="${color}"`).replace(/<hh:bold\s*\/>/g,'');if(typography?.useFontSpace!==undefined){if(typeof typography.useFontSpace!=='boolean')throw new Error('글꼴 공백 사용 설정을 확인하세요.');xml=xml.replace(/useFontSpace="[01]"/,`useFontSpace="${typography.useFontSpace?1:0}"`);}for(const [tag,value]of[['ratio',typography?.widthPercent??spec.widthPercent??100],['spacing',typography?.spacingPercent??spec.spacingPercent??0]])xml=xml.replace(new RegExp(`<hh:${tag}\\b[^>]*\\/>`),`<hh:${tag} ${['hangul','latin','hanja','japanese','other','symbol','user'].map(l=>`${l}="${value}"`).join(' ')}/>`);if(family){if(!sourceFonts.has(family))sourceFonts.set(family,fontStart+sourceFonts.size);xml=xml.replace(/<hh:fontRef\b[^>]*\/>/,`<hh:fontRef ${['hangul','latin','hanja','japanese','other','symbol','user'].map(l=>`${l}="${sourceFonts.get(family)}"`).join(' ')}/>`);}if(typography?.italic||bold)xml=xml.replace('<hh:underline',`${typography?.italic?'<hh:italic/>':''}${bold?'<hh:bold/>':''}<hh:underline`);extraChars.push(xml);return next;};
    const widthMm=spec.widthMm??(plan.mode==='reference'&&plan.sourcePageSize?plan.sourcePageSize.widthPt*25.4/72:210),heightMm=spec.heightMm??(plan.mode==='reference'&&plan.sourcePageSize?plan.sourcePageSize.heightPt*25.4/72:297);
    if(!Number.isFinite(widthMm)||widthMm<100||widthMm>420||!Number.isFinite(heightMm)||heightMm<100||heightMm>594)throw new Error('출력 용지 크기를 확인하세요.');
    let width=mm(widthMm),height=mm(heightMm);
    const margins={left:mm(spec.margins?.left??20),right:mm(spec.margins?.right??20),top:mm(spec.margins?.top??20),bottom:mm(spec.margins?.bottom??20)};
    let usable=width-margins.left-margins.right;
    if(![width,height,...Object.values(margins)].every(Number.isFinite)||Object.values(margins).some(n=>n<0)||usable<mm(30)||height-margins.top-margins.bottom<mm(40))throw new Error('한글 용지 여백을 확인하세요.');
    const paragraph=(text,{size=10,bold=false,fontFamily=bodyFont,color,pageBreak=false,content='',tableCell=false,align,layout,pairedStyle,typography,runs}={})=>{
        const alignment={LEFT:0,CENTER:1,RIGHT:2,JUSTIFY:3}[align];
        let para=alignment==null?paraStart+(tableCell?1:0):paraStart+2+alignment;
        if(layout){para=paraStart+6+layoutParas.length;layoutParas.push(paraBase.replace('id="0"',`id="${para}"`).replace('snapToGrid="1"','snapToGrid="0"').replace(/<hh:align\b[^>]*\/>/,`<hh:align horizontal="${['LEFT','CENTER','RIGHT'].includes(layout.align)?layout.align:'LEFT'}" vertical="BASELINE"/>`).replace(/<hc:left\b[^>]*\/>/g,`<hc:left value="${pt(layout.left)}" unit="HWPUNIT"/>`).replace(/<hc:prev\b[^>]*\/>/g,`<hc:prev value="${pt(layout.before)}" unit="HWPUNIT"/>`).replace(/<hh:lineSpacing\b[^>]*\/>/g,`<hh:lineSpacing type="FIXED" value="${pt(layout.height)}" unit="HWPUNIT"/>`));}
        if(pairedStyle){para=paraStart+6+layoutParas.length;layoutParas.push(pairedParagraphStyle(paraBase,para,pairedStyle));}
        if(layout?.tabs?.length){const positions=[...new Set(layout.tabs.map(pt))].sort((a,b)=>a-b);if(positions.some(p=>!Number.isInteger(p)||p<0||p>200000)||positions.length>100)throw new Error('PDF 줄의 원본 탭 위치를 확인하세요.');const key=positions.join(':');if(!sourceTabs.has(key))sourceTabs.set(key,{id:tabStart+sourceTabs.size,positions});layoutParas[layoutParas.length-1]=layoutParas.at(-1).replace(/tabPrIDRef="\d+"/,`tabPrIDRef="${sourceTabs.get(key).id}"`);}
        const textXml=value=>String(value).split('\n').map((line,i)=>`${i?'<hp:lineBreak/>':''}<hp:t>${escape(line)}</hp:t>`).join('');
        const runXml=runs?runs.map(r=>{const t=r.typography;return `<hp:run charPrIDRef="${char(t.sizePt,t.bold,spec.fontFamily||t.font,t.color,t)}">${r.tabBeforePt?`<hp:t><hp:tab width="${pt(r.tabBeforePt)}" leader="0" type="0"/>${escape(r.text)}</hp:t>`:textXml(r.text)}</hp:run>`;}).join(''):`<hp:run charPrIDRef="${char(size,bold,fontFamily,color,typography)}">${content}${textXml(text)}</hp:run>`;
        return `<hp:p id="${id++}" paraPrIDRef="${para}" styleIDRef="0" pageBreak="${pageBreak?1:0}" columnBreak="0" merged="0">${runXml}</hp:p>`;
    };
    const subList=(text,options,paragraphs)=>`<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${options?.vertAlign==='TOP'?'TOP':'CENTER'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraphs?paragraphs.map(p=>paragraph(p.text,{...options,pairedStyle:p.style,layout:p.layout,runs:p.runs})).join(''):paragraph(text,options)}</hp:subList>`;
    let sourceBodyRight=width/100-5,sourceTextContainers=[],sourceContainerRules=[],currentSourcePage;
    const textFrameEvidence=[];
    const floatingText=(text,line,options={})=>{
        const typography=line.pairedTypography,size=options.size||typography?.sizePt||line.size||10,bbox=line.bbox||line.source?.bbox,baseline=line.baseline??line.source?.baseline??bbox[3]-size*.15;
        const container=options.body?enclosingPdfTextContainer(bbox,sourceTextContainers,width/100,sourceContainerRules,line.paintOrder):null;
        const x=options.body?Math.min(bbox[0],margins.left/100):bbox[0],y=Math.max(0,baseline-size*.85),right=options.body?container?.bbox[2]??Math.max(bbox[2],Math.min(width/100-5,sourceBodyRight+2)):Math.max(bbox[2],width/100-5),bottom=Math.min(height/100,y+size*2);
        if(container)textFrameEvidence.push({sourceSha256:plan.source.sha256,sourcePage:currentSourcePage,text,bbox,container:{bbox:container.bbox,operator:container.operator,borderOperators:container.borderOperators},nativeRightPt:right,method:'source-rectangle-available-edge-not-ink-bound',nativeVerified:false});
        const runs=!typography&&!options.content&&line.runs?.map(r=>r.text).join('').trim()===text?line.runs.map(r=>{const out=pdfRunTypography(r,{font:bodyFont,bold:line.bold,color:line.color});if(!options.body&&!options.sourceFontSpace)delete out.typography.useFontSpace;return out;}):undefined;
        const content=paragraph(text,{size,fontFamily:spec.fontFamily||typography?.font||line.fontFamily||line.fonts?.map(pdfFontFamily).find(Boolean)||bodyFont,color:typography?.color||line.color,bold:typography?.bold??(line.bold||line.fonts?.some(f=>/bold|heavy|black/i.test(f))||false),typography,...options,runs,layout:{left:bbox[0]-x,before:0,height:size*1.2}});
        return pdfHwpxShape({id:id++,bbox:[x,y,right,bottom],text:content,zOrder:1000000+(line.paintOrder||0)});
    };
    const cellBorder=cell=>{
        if(plan.mode!=='reference'||!cell.borders)return 'default-table';
        const key=JSON.stringify({borders:cell.borders,background:pdfColor(cell.background)});
        if(!cellBorders.has(key))cellBorders.set(key,{id:borderId+1+cellBorders.size,cell});
        return cellBorders.get(key).id;
    };
    const tableXml=(table,available=usable,onPaper=false)=>{
        if(!Number.isInteger(table.rows)||!Number.isInteger(table.columns)||table.rows<1||table.rows>150||table.columns<1||table.columns>40||table.columnWidths.length!==table.columns||table.rowHeights.length!==table.rows||![...table.columnWidths,...table.rowHeights].every(n=>Number.isFinite(n)&&n>0)||table.cells.length>6000)throw new Error('복원할 표의 행·열·크기를 확인하세요.');
        if(table.cells.some(c=>![c.row,c.column,c.rowSpan,c.colSpan].every(Number.isInteger)||c.row<0||c.column<0||c.rowSpan<1||c.colSpan<1||c.row+c.rowSpan>table.rows||c.column+c.colSpan>table.columns||typeof c.text!=='string'||c.text.length>100000))throw new Error('복원할 표의 셀 범위를 확인하세요.');
        const total=table.columnWidths.reduce((n,v)=>n+v,0),tableWidth=plan.mode==='reference'?(onPaper?pt(total):Math.min(available,pt(total))):available,scale=tableWidth/Math.max(1,total);
        const occupied=new Set();for(const c of table.cells)for(let r=c.row;r<c.row+c.rowSpan;r++)for(let k=c.column;k<c.column+c.colSpan;k++){const slot=r*table.columns+k;if(occupied.has(slot))throw new Error('복원할 표의 병합 셀이 겹칩니다.');occupied.add(slot);}if(occupied.size!==table.rows*table.columns)throw new Error('복원할 표에 누락된 셀이 있습니다.');
        let consumed=0,totalWidth=0;const widths=table.columnWidths.map(w=>{consumed+=w;const edge=Math.round(consumed*scale),value=edge-totalWidth;totalWidth=edge;return value;}),heights=table.rowHeights.map(h=>Math.max(plan.mode==='reference'?1:1400,pt(h)));
        if(widths.some(w=>w<1))throw new Error('복원할 표의 열 너비가 너무 작습니다.');
        let rows='';
        for(let row=0;row<table.rows;row++)rows+=`<hp:tr>${table.cells.filter(c=>c.row===row).sort((a,b)=>a.column-b.column).map(cell=>{
            const w=widths.slice(cell.column,cell.column+cell.colSpan).reduce((n,v)=>n+v,0),h=heights.slice(cell.row,cell.row+cell.rowSpan).reduce((n,v)=>n+v,0);
            const reference=plan.mode==='reference',family=spec.fontFamily||cell.fonts?.map(pdfFontFamily).find(Boolean)||bodyFont;
            const nativePadding=verifiedCellMargins(cell,plan),pdfLayout=!nativePadding?verifiedPdfCellLines(cell,plan):null,padding=nativePadding||pdfLayout?.padding||{left:Math.min(250,Math.floor(w/10)),right:Math.min(250,Math.floor(w/10)),top:Math.min(180,Math.floor(h/10)),bottom:Math.min(180,Math.floor(h/10))};
            const format=verifiedCellTextFormat(cell,plan);
            // Multiple observed source lines have individual x origins. A
            // nearly full-width line is not evidence of centred paragraphs.
            const pdfParagraphs=pdfLayout?.lines.map((l,i,all)=>{const tabs=l.runs.filter(r=>r.tabBeforePt).map(r=>r.bbox[0]-l.bbox[0]),positioned=all.length>1;return {text:l.text,runs:l.runs.map(r=>pdfRunTypography(r,{font:family})),layout:{align:tabs.length||positioned?'LEFT':l.align,left:!positioned&&!tabs.length&&['CENTER','RIGHT'].includes(l.align)?0:Math.max(0,l.bbox[0]-cell.bbox[0]),tabs,before:0,height:all[i+1]?all[i+1].baseline-l.baseline:l.size*1.2}};});
            if(pdfLayout)cellLineEvidence.push({source:cell.geometrySource,padding,lines:pdfLayout.lines.map(l=>({text:l.text,bbox:l.bbox,baseline:l.baseline,align:l.align,runs:l.runs})),nativeVerified:false});
            else if(!nativePadding&&cell.geometrySource&&cell.text.trim())unresolvedCellLayout.push({source:cell.geometrySource,reason:'Source line geometry did not satisfy supported complete/bounded cell layout; default layout retained for review.'});
            return `<hp:tc name="" header="${row===0?1:0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${cellBorder(cell)}">${subList(cell.text,{size:reference&&Number.isFinite(cell.size)?Math.max(5,Math.min(72,cell.size)):9,fontFamily:family,color:reference?cell.color:undefined,align:format?.align||(reference?cell.align:undefined),vertAlign:pdfLayout?'TOP':undefined,tableCell:true,bold:reference?cell.fonts?.some(f=>/bold|heavy|black/i.test(f))||false:row===0},format?.paragraphs||pdfParagraphs)}<hp:cellAddr colAddr="${cell.column}" rowAddr="${row}"/><hp:cellSpan colSpan="${cell.colSpan}" rowSpan="${cell.rowSpan}"/><hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="${padding.left}" right="${padding.right}" top="${padding.top}" bottom="${padding.bottom}"/></hp:tc>`;
        }).join('')}</hp:tr>`;
        return `<hp:tbl id="${id++}" zOrder="0" numberingType="TABLE" textWrap="${onPaper?'IN_FRONT_OF_TEXT':'TOP_AND_BOTTOM'}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${table.rows}" colCnt="${table.columns}" cellSpacing="0" borderFillIDRef="${plan.mode==='reference'&&table.cells.every(c=>c.borders)?1:'default-table'}" noAdjust="0"><hp:sz width="${tableWidth}" widthRelTo="ABSOLUTE" height="${heights.reduce((n,h)=>n+h,0)}" heightRelTo="ABSOLUTE" protect="0"/>${onPaper?paperPosition(table.bbox[0],table.bbox[1]):'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'}<hp:outMargin left="0" right="0" top="${onPaper?0:283}" bottom="${onPaper?0:283}"/><hp:inMargin left="250" right="250" top="180" bottom="180"/>${rows}</hp:tbl>`;
    };
    const pictureXml=(block,picture)=>{
        if(!picture?.bytes){missingPictures.push(block.image.id);return null;}
        if(picture.bytes.length>MAX_HWPX_PNG_BYTES||(totalPictureBytes+=picture.bytes.length)>MAX_PDF_PICTURES_BYTES)throw new Error(`원문 그림 ${block.image.id}의 크기 한도를 넘습니다. 그림이 빠진 작성본은 저장하지 않습니다. 범위를 나누어 변환하세요.`);
        if(![picture.width,picture.height].every(n=>Number.isInteger(n)&&n>0&&n<20000)||[137,80,78,71,13,10,26,10].some((n,i)=>picture.bytes[i]!==n))throw new Error('한글에 넣을 그림은 검증된 PNG여야 합니다.');
        const imageId=`image${binaryItems.length}`,ratio=picture.height/picture.width,w=block.background?pt(block.image.bbox[2]-block.image.bbox[0]):Math.min(usable,pt(block.image.bbox[2]-block.image.bbox[0])),h=plan.mode==='reference'?Math.round(pt(block.image.bbox[3]-block.image.bbox[1])*w/pt(block.image.bbox[2]-block.image.bbox[0])):Math.round(w*ratio);
        entries[`BinData/${imageId}.png`]=picture.bytes instanceof Uint8Array?picture.bytes:new Uint8Array(picture.bytes);binaryItems.push(imageId);
        assetMapping.push({binaryItemId:imageId,sourceImageId:block.image.id,sourcePage:plan.imageSources?.[block.image.id],kind:block.image.kind==='text-raster'?'text-raster':'figure',bbox:block.image.bbox,editableText:false,method:picture.method||'source-pixels'});
        const matrix='<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';
        const position=block.background?`treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${pt(block.image.bbox[1])}" horzOffset="${pt(block.image.bbox[0])}"`:'treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"';
        return `<hp:pic id="${id++}" zOrder="${Number.isInteger(block.image.operator)?block.image.operator:0}" numberingType="PICTURE" textWrap="${block.background?'BEHIND_TEXT':'TOP_AND_BOTTOM'}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id++}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(w/2)}" centerY="${Math.round(h/2)}" rotateimage="1"/><hp:renderingInfo>${matrix}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hc:img binaryItemIDRef="${imageId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos ${position}/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`;
    };
    const startPageNumber=spec.startPageNumber??plan.firstPrintedPageNumber??1;
    if(!Number.isInteger(startPageNumber)||startPageNumber<1||startPageNumber>99999)throw new Error('시작 쪽 번호를 확인하세요.');
    const controlText=(name,text,applyPageType='BOTH',content='')=>{
        const controlId=id++,body=(text?paragraph(text,{size:9,align:spec[`${name}Align`]||'LEFT'}):'')+content;
        // Retain the empty control that blocks inheritance, but give its list a valid empty paragraph.
        return `<hp:ctrl><hp:${name} id="${controlId}" applyPageType="${applyPageType}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${body||paragraph('')}</hp:subList></hp:${name}></hp:ctrl>`;
    };
    const perPage=plan.mode==='reference'&&Array.isArray(plan.sourcePages)&&plan.sourcePages.length>0;
    if(perPage&&(plan.sourcePages.length>300||new Set(plan.sourcePages.map(p=>p.number)).size!==plan.sourcePages.length||plan.blocks.some(b=>!plan.sourcePages.some(p=>p.number===b.source?.page))))throw new Error('복원 페이지와 본문의 연결을 확인하세요.');
    const headerMargin=spec.margins?.header==null?2000:mm(spec.margins.header),footerMargin=spec.margins?.footer==null?2000:mm(spec.margins.footer),gutter=mm(spec.margins?.gutter??0);
    if([headerMargin,footerMargin,gutter].some(n=>!Number.isFinite(n)||n<0||n>mm(100)))throw new Error('머리말·꼬리말·제본 여백을 확인하세요.');
    const pageGroups=perPage?plan.sourcePages.map(page=>({page,blocks:plan.blocks.filter(b=>b.source?.page===page.number)})):[{page:{kind:plan.firstPageKind,printedPageNumber:plan.firstPrintedPageNumber},blocks:plan.blocks}];
    const sectionBodies=[],furnitureCoordinateEvidence=[],furnitureRuleEvidence=[],furniturePageNumberEvidence=[],graphPartitionEvidence=[],sourceMarginEvidence=[];
    const defaultTopMargin=margins.top;
    const captionStyle=block=>plan.mode==='reference'&&block.captionSource?{sourceFontSpace:true,size:block.captionSource.size||10,fontFamily:spec.fontFamily||block.captionSource.fonts?.map(pdfFontFamily).find(Boolean)||bodyFont,color:block.captionSource.color,bold:block.captionSource.fonts?.some(f=>/bold|heavy|black/i.test(f))||false}:{size:10,bold:block.kind==='table'};
    for(const [sectionIndex,group]of pageGroups.entries()){
    currentSourcePage=group.page.number;sourceTextContainers=(plan.pageDecorations||[]).find(d=>d.sourcePage===currentSourcePage)?.fills||[];sourceContainerRules=(plan.pageDecorations||[]).find(d=>d.sourcePage===currentSourcePage)?.rules||[];
    const automaticPageNumber=spec.pageNumberVisible??(plan.mode!=='reference'||(perPage?group.page.printedPageNumber!=null:plan.firstPrintedPageNumber!=null));
    if(perPage){
        const w=spec.widthMm==null?pt(group.page.widthPt):mm(spec.widthMm),h=spec.heightMm==null?pt(group.page.heightPt):mm(spec.heightMm);
        if(![w,h].every(Number.isFinite)||w<mm(100)||w>mm(420)||h<mm(100)||h>mm(594))throw new Error('복원할 페이지의 용지 크기를 확인하세요.');
        width=w;height=h;usable=width-margins.left-margins.right;margins.top=defaultTopMargin;
        sourceBodyRight=Number.isFinite(group.page.bodyTextRightPt)?group.page.bodyTextRightPt:width/100-5;
        // Native header lists can clamp a negative PAPER offset. Only with an
        // automatic top margin, register their origin above all observed text
        // frames, without moving any source object or changing footer policy.
        if(spec.margins?.top==null){const tops=(plan.furniture||[]).filter(a=>a.kind==='header'&&a.sourcePage===group.page.number).flatMap(a=>a.lines||[]).map(l=>Math.floor(((l.baseline??l.bbox[3]-(l.size||10)*.15)-(l.size||10)*.85)*100)).filter(v=>Number.isFinite(v)&&v>=0);if(tops.length&&Math.min(...tops)<margins.top){margins.top=Math.min(...tops);sourceMarginEvidence.push({sourceSha256:plan.source.sha256,sourcePage:group.page.number,originalAutomaticTopHwpUnit:defaultTopMargin,topHwpUnit:margins.top,method:'observed-header-text-frame-nonnegative-origin',nativeVerified:false});}}
        if(usable<mm(30)||height-margins.top-margins.bottom<headerMargin+footerMargin+mm(10))throw new Error('복원 페이지의 용지 여백을 확인하세요.');
    }
    const pageNumber=spec.startPageNumber!=null?startPageNumber+sectionIndex:group.page.printedPageNumber??startPageNumber+sectionIndex;
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>99999)throw new Error('복원 페이지의 쪽 번호를 확인하세요.');
    let sectionProperties=base.sectionProperties.replace(/pageStartsOn="BOTH"/,`pageStartsOn="${sectionIndex===0?'ODD':'BOTH'}"`).replace(/(<hp:pagePr\b[^>]*width=")\d+(" height=")\d+/,`$1${width}$2${height}`).replace(/<hp:margin\b[^>]*\/>/,`<hp:margin header="${headerMargin}" footer="${footerMargin}" gutter="${gutter}" left="${margins.left}" right="${margins.right}" top="${margins.top}" bottom="${margins.bottom}"/>`).replace(/(<hp:startNum\b[^>]*\spage=")\d+/,`$1${pageNumber}`);
    const observedFurniture=(plan.furniture||[]).some(a=>(!perPage||a.sourcePage===group.page.number)&&(a.lines?.length||a.tables?.length||a.images?.length||a.rules?.length||a.fills?.length));
    if(plan.mode==='reference'&&(group.page.kind==='blank'||group.page.kind==='divider'&&!observedFurniture))sectionProperties=sectionProperties.replace('hideFirstHeader="0"','hideFirstHeader="1"').replace('hideFirstFooter="0"','hideFirstFooter="1"').replace('hideFirstPageNum="0"','hideFirstPageNum="1"');
    if(!automaticPageNumber)sectionProperties=sectionProperties.replace('hideFirstPageNum="0"','hideFirstPageNum="1"');
    // Keep the observed page-number position and typography; the value remains a native PAGE field.
    const sourceNumberLine=automaticPageNumber&&plan.mode==='reference'&&spec.footerVisible!==false&&!spec.footer&&!spec.pageNumberPosition&&!spec.pageNumberFormat?(plan.furniture||[]).filter(a=>a.kind==='footer'&&(!perPage||a.sourcePage===group.page.number)).flatMap(a=>a.lines).find(l=>isPdfPageNumber(l.text)):null;
    const sourceNumberField=line=>{const match=line.text.match(/^(.*?)(\d+)(.*?)$/),control=`<hp:ctrl><hp:autoNum num="${pageNumber}" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="${escape(match[1])}" suffixChar="${escape(match[3])}" supscript="0"/></hp:autoNum></hp:ctrl>`,decorated=literalPageNumberDecoration(control);furniturePageNumberEvidence.push({sourceSha256:plan.source.sha256,sourcePage:group.page.number,sourceText:line.text,...decorated.evidence});return decorated.xml;};
    let furnitureXml='';
    for(const name of ['header','footer']){
        if(spec[`${name}Visible`]===false){if(perPage)furnitureXml+=controlText(name,'');continue;}
        const areas=plan.mode==='reference'?(plan.furniture||[]).filter(a=>a.kind===name&&(!perPage||a.sourcePage===group.page.number)):[];
        if(!areas.length&&(spec[name]||perPage))furnitureXml+=controlText(name,spec[name]||'');
        for(const area of areas){
            let content='',floating='';
            if(!spec[name])for(const line of area.lines){
                if(automaticPageNumber&&isPdfPageNumber(line.text)){
                    if(line===sourceNumberLine)floating+=floatingText('',line,{content:sourceNumberField(line)});
                }else floating+=floatingText(line.text,line,{align:spec[`${name}Align`]||'LEFT'});
            }
            for(const fill of area.fills||[])floating+=pdfHwpxShape({id:id++,bbox:fill.bbox,fill:fill.color,zOrder:fill.operator||0});
            for(const shape of area.paths||[]){const objectId=id++;floating+=pdfHwpxShape({id:objectId,...shape,zOrder:shape.operator});vectorPathEvidence.push({sourcePage:area.sourcePage,sourceSha256:plan.source.sha256,objectId:String(objectId),...shape,nativeVerified:false});}
            for(const rule of area.rules||[]){const drawn=pdfFurnitureRule(rule,name,id++);floating+=drawn.xml;furnitureRuleEvidence.push({sourcePage:group.page.number,sourceSha256:plan.source.sha256,...drawn.evidence});}
            for(const table of area.tables)content+=paragraph('',{content:tableXml(table,usable,plan.mode==='reference')});
            for(const image of area.images){const pic=pictureXml({image,background:true},pictures[image.id]);floating+=pic||'';if(!pic)content+=paragraph('[원문 머리말·꼬리말 그림 확인 필요]');}
            if(floating)content+=paragraph('',{content:floating});
            if(content||spec[name])furnitureXml+=controlText(name,spec[name],perPage?'BOTH':area.applyPageType,content);
            else if(perPage)furnitureXml+=controlText(name,'');
        }
    }
    if(perPage){const localized=localizePdfFurniture(furnitureXml,{sourceSha256:plan.source.sha256,sourcePage:group.page.number,pageWidth:width,pageHeight:height,margins:{...margins,header:headerMargin,footer:footerMargin,gutter}});furnitureXml=localized.xml;if(localized.evidence.changes.length)furnitureCoordinateEvidence.push(localized.evidence);}
    furnitureXml+=automaticPageNumber&&!sourceNumberLine?`<hp:ctrl><hp:pageNum pos="${escape(spec.pageNumberPosition||'BOTTOM_CENTER')}" formatType="${escape(spec.pageNumberFormat||'DIGIT')}" sideChar="-"/></hp:ctrl>`:'';
    let body=paragraph('',{content:sectionProperties+base.columns+`<hp:ctrl><hp:newNum num="${pageNumber}" numType="PAGE"/></hp:ctrl>`+furnitureXml}),pendingPictures='',pendingBreak=false,layoutPage=null,cursor=0;
    const bodyParagraph=(text,options={})=>{const result=paragraph(text,{...options,pageBreak:options.pageBreak||pendingBreak,content:pendingPictures+(options.content||'')});pendingPictures='';pendingBreak=false;return result;};
    if(perPage&&plan.positionedPages?.includes(group.page.number)){
        let objects='';
        const decorations=plan.pageDecorations?.find(p=>p.sourcePage===group.page.number);
        if((decorations?.rules?.length||0)+(decorations?.fills?.length||0)>20000)throw new Error('쪽의 장식선·배경 개체가 한도를 넘습니다.');
        for(const fill of decorations?.fills||[])objects+=pdfHwpxShape({id:id++,bbox:fill.bbox,fill:fill.color,zOrder:fill.operator||0});
        for(const shape of decorations?.paths||[]){const objectId=id++;objects+=pdfHwpxShape({id:objectId,...shape,zOrder:shape.operator});vectorPathEvidence.push({sourcePage:group.page.number,sourceSha256:plan.source.sha256,objectId:String(objectId),...shape,nativeVerified:false});}
        for(const rule of decorations?.rules||[]){const partition=decorations.graphPartitions?.find(e=>JSON.stringify(e.rule)===JSON.stringify(rule));if(partition){const drawn=pdfGraphPartitionShape(rule,id++,partition.evidence);objects+=drawn.xml;graphPartitionEvidence.push({sourceSha256:plan.source.sha256,sourcePage:group.page.number,...drawn.evidence});}else objects+=pdfHwpxShape({id:id++,bbox:rule.axis==='h'?[rule.start,rule.at,rule.end,rule.at]:[rule.at,rule.start,rule.at,rule.end],line:rule,zOrder:rule.operator||0,strokeEnvelope:true});}
        for(const block of group.blocks){
            if(block.kind==='table'){
                if(block.caption&&block.captionSource)objects+=floatingText(block.caption,block.captionSource,captionStyle(block));
                objects+=tableXml(block.table,usable,true);
            }else if(block.kind==='picture'){
                for(const image of block.images||[block.image])objects+=pictureXml({image,background:true},pictures[image.id])||floatingText(`[원문 그림 누락: ${image.id}]`,{bbox:image.bbox,size:9,baseline:image.bbox[1]+9,color:'#BB0000'});
                if(block.caption&&block.captionSource)objects+=floatingText(block.caption,block.captionSource,captionStyle(block));
            }else if(block.pairedParagraph){
                const learned=block.pairedParagraph,size=learned.typography.sizePt,x=Number(learned.referenceMargins?.left)/100,right=width/100-Number(learned.referenceMargins?.right)/100,y=Math.max(0,(block.source.baseline??block.source.bbox[1]+size)-size*.85),bottom=Math.min(height/100,y+Math.max(size*2,block.source.bbox[3]-block.source.bbox[1]+size*2));
                if(![x,right,y,bottom].every(Number.isFinite)||right<=x||bottom<=y)throw new Error('원본 문단의 쪽 여백·범위를 확인하세요.');
                const text=paragraph(learned.text,{size,fontFamily:learned.typography.font,color:learned.typography.color,bold:learned.typography.bold,typography:learned.typography,pairedStyle:learned.paragraphStyle,runs:learned.runs});
                objects+=pdfHwpxShape({id:id++,bbox:[x,y,right,bottom],text,zOrder:1000000+(block.paintOrder||0)});
            }else if(block.text&&block.source?.bbox)objects+=floatingText(block.text,block,{body:true,size:spec.fontSizePt??block.size,fontFamily:spec.fontFamily||block.fontFamily||bodyFont});
        }
        // One native anchor paragraph; floating objects do not push the next source page down.
        body=body.replace(/<hp:t><\/hp:t><\/hp:run><\/hp:p>$/,`${objects}<hp:t></hp:t></hp:run></hp:p>`);
        sectionBodies.push(body);continue;
    }
    for(let block of group.blocks){
        if(perPage)block={...block,pageBreak:false};
        if(block.kind==='table'){if(block.caption)body+=bodyParagraph(block.caption,{...captionStyle(block),pageBreak:block.pageBreak});body+=bodyParagraph('',{content:tableXml(block.table),pageBreak:!block.caption&&block.pageBreak});}
        else if(block.kind==='picture'){
            const images=block.images||[block.image];
            const image=plan.mode==='reference'?images.map(image=>pictureXml({image,background:block.background},pictures[image.id])).filter(Boolean).join(''):null;
            if(block.background&&image){pendingPictures+=image;pendingBreak||=!!block.pageBreak;continue;}
            body+=image?bodyParagraph('',{content:image,pageBreak:block.pageBreak}):bodyParagraph(`[${block.caption} · ${block.placeholder}]`,{size:10,pageBreak:block.pageBreak});if(plan.mode==='reference'&&block.labels)body+=bodyParagraph(block.labels,{size:9});if(block.caption)body+=bodyParagraph(block.caption,captionStyle(block));
        }else{
            const size=plan.mode==='reference'&&spec.fontSizePt==null?(block.size||bodySize):block.kind==='heading'?(block.size||14):bodySize;let layout;
            if(plan.mode==='reference'&&(plan.dividerPages||[]).includes(block.source?.page)&&!spec.fontSizePt&&!spec.lineSpacingPercent&&block.source?.bbox){
                if(layoutPage!==block.source.page){layoutPage=block.source.page;if(pendingBreak||block.pageBreak){body+=bodyParagraph('',{pageBreak:true});block={...block,pageBreak:false};}cursor=margins.top/100+headerMargin/100+14;}
                const baseline=block.source.baseline??block.source.bbox[3]-size*.15,before=Math.max(0,baseline-cursor-size*.85);
                layout={left:Math.max(0,block.source.bbox[0]-margins.left/100),before,height:size};cursor+=before+size;
            }
            body+=bodyParagraph(block.text,{size,fontFamily:spec.fontFamily||block.fontFamily||bodyFont,color:plan.mode==='reference'?block.color:undefined,bold:plan.mode==='reference'?!!block.bold:block.kind==='heading',pageBreak:block.pageBreak,layout});
        }
    }
    if(!body||pendingPictures)body+=bodyParagraph('');
    sectionBodies.push(body);
    }
    header=header.replace(/\bsecCnt="\d+"/,`secCnt="${sectionBodies.length}"`);
    const newParas=Array.from({length:6},(_,i)=>paraBase.replace('id="0"',`id="${paraStart+i}"`).replace(/<hh:lineSpacing\b[^>]*\/>/,`<hh:lineSpacing type="PERCENT" value="${i===1?120:spec.lineSpacingPercent??140}" unit="HWPUNIT"/>`).replace(/<hh:align\b[^>]*\/>/,i<2?paraBase.match(/<hh:align\b[^>]*\/>/)?.[0]||'<hh:align horizontal="LEFT" vertical="BASELINE"/>':`<hh:align horizontal="${['LEFT','CENTER','RIGHT','JUSTIFY'][i-2]}" vertical="BASELINE"/>`));
    const embeddedFonts=[],fontItems=[],embeddedByFamily=new Map();let fontBytes=0;
    if(!Array.isArray(fonts.assets)||fonts.assets.length>32||!Array.isArray(fonts.warnings))throw new Error('원본 글꼴 패키지 구성을 확인하세요.');
    for(const font of fonts.assets){
        if(!sourceFonts.has(font.family))continue;
        if(typeof font.requiredCharacters!=='string'||font.requiredCharacters.length>20000||embeddedByFamily.has(font.family)||font.sourcePdfSha256!==plan.source.sha256||!validHash(font.sourceStreamSha256)||!validHash(font.sha256)||!plan.fontEvidence?.some(f=>f.family===font.family&&f.embeddedStreamSha256===font.sourceStreamSha256&&f.baseFont===font.baseFont&&f.sourcePage===font.sourcePage)||!(font.bytes instanceof Uint8Array)||font.bytes.length>16*1024*1024||pdfEmbeddedFontProfile(font.bytes)?.family!==font.family||!editableFontEmbeddingFlags(font.bytes).allowed||missingFontGlyphs(font.bytes,font.requiredCharacters).length)throw new Error('원본 글꼴과 선택 문서의 결합을 확인하세요.');
        fontBytes+=font.bytes.length;if(fontBytes>32*1024*1024)throw new Error('원본 글꼴 패키지가 한도를 넘습니다.');const id=`sourceFont${embeddedFonts.length}`,file=`BinData/${id}.ttf`;entries[file]=font.bytes;embeddedByFamily.set(font.family,id);fontItems.push(`<opf:item id="${id}" href="${file}" media-type="application/x-font-ttf" isEmbeded="1"/>`);const {bytes,sourceBytes,...evidence}=font;void bytes;void sourceBytes;embeddedFonts.push({...evidence,binaryItemId:id,path:file,byteLength:font.bytes.length,nativeVerified:false});
    }
    if(sourceFonts.size)header=header.replace(/(<hh:fontface\b[^>]*fontCnt=")(\d+)("[^>]*>)([\s\S]*?)(<\/hh:fontface>)/g,(_,prefix,count,end,definitions,close)=>prefix+(Number(count)+sourceFonts.size)+end+definitions+[...sourceFonts].map(([family,fontId])=>`<hh:font id="${fontId}" face="${escape(family)}" type="TTF" isEmbedded="${embeddedByFamily.has(family)?1:0}"${embeddedByFamily.has(family)?` binaryItemIDRef="${embeddedByFamily.get(family)}"`:''}/>`).join('')+close);
    if(sourceTabs.size)header=header.replace(/(<hh:tabProperties\b[^>]*itemCnt=")(\d+)("[^>]*>)/,(_,a,n,b)=>a+(Number(n)+sourceTabs.size)+b).replace('</hh:tabProperties>',[...sourceTabs.values()].map(t=>`<hh:tabPr id="${t.id}" autoTabLeft="0" autoTabRight="0">${t.positions.map(p=>`<hh:tabItem pos="${p}" type="LEFT" leader="NONE" unit="HWPUNIT"/>`).join('')}</hh:tabPr>`).join('')+'</hh:tabProperties>');
    header=header.replace(/<hh:charProperties itemCnt="(\d+)">/,(_,n)=>`<hh:charProperties itemCnt="${Number(n)+extraChars.length}">`).replace('</hh:charProperties>',extraChars.join('')+'</hh:charProperties>')
        .replace(/<hh:paraProperties itemCnt="(\d+)">/,(_,n)=>`<hh:paraProperties itemCnt="${Number(n)+newParas.length+layoutParas.length}">`).replace('</hh:paraProperties>',newParas.join('')+layoutParas.join('')+'</hh:paraProperties>');
    const border='<hh:borderFill id="1000" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'+['left','right','top','bottom'].map(side=>`<hh:${side}Border type="SOLID" width="0.12 mm" color="#444444"/>`).join('')+'<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>';
    const borderDefinitions=[border.replace('id="1000"',`id="${borderId}"`),...[...cellBorders.values()].map(({id,cell})=>`<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>${['left','right','top','bottom'].map(side=>{const edge=cell.borders[side];return `<hh:${side}Border type="${['NONE','SOLID','DASH','DOUBLE_SLIM'].includes(edge?.type)?edge.type:'NONE'}" width="${hwpxBorderWidth(edge?.widthPt)}" color="${pdfColor(edge?.color)||'#000000'}"/>`;}).join('')}<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>${pdfColor(cell.background)?`<hc:fillBrush><hc:winBrush faceColor="${pdfColor(cell.background)}" hatchColor="#000000" alpha="0"/></hc:fillBrush>`:''}</hh:borderFill>`)].join('');
    header=header.replace(/<hh:borderFills itemCnt="(\d+)">/,(_,n)=>`<hh:borderFills itemCnt="${Number(n)+1+cellBorders.size}">`).replace('</hh:borderFills>',borderDefinitions+'</hh:borderFills>');
    // Default references are resolved before styles can grow to the sentinel ID.
    const resolveBorders=xml=>xml.replaceAll('borderFillIDRef="default-table"',`borderFillIDRef="${borderId}"`);
    const outputWarnings=[...plan.warnings,...fonts.warnings,...(embeddedFonts.length?['원본 부분 글꼴 바이트를 문서에 포함했습니다. 실제 한글의 글꼴 선택·저장 후 포함 보존은 보장되지 않으며, 줄 배치와 새로 입력한 문자의 지원 범위도 별도 확인해야 합니다.']:[]),...(unresolvedCellLayout.length?[`원본 줄 배치가 지원 조건과 맞지 않는 표 셀 ${unresolvedCellLayout.length}개는 기본 배치를 유지했습니다. 원문 검토가 필요합니다.`]:[]),...(furnitureCoordinateEvidence.length?['머리말·꼬리말의 앱 미리보기 위치는 한글 출력과 다를 수 있습니다. 한글 실물 검토가 필요합니다.']:[])];
    const now=new Date().toISOString(),manifest=binaryItems.map(imageId=>`<opf:item id="${imageId}" href="BinData/${imageId}.png" media-type="image/png" isEmbeded="1"/>`).join('')+fontItems.join('');
    const xml=s=>strToU8(s);
    Object.assign(entries,{mimetype:strToU8('application/hwp+zip'),'version.xml':xml('<?xml version="1.0" encoding="UTF-8"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Jindan Report Studio" appVersion="1"/>'),
        'Contents/header.xml':xml(header),
        ...Object.fromEntries(sectionBodies.map((section,i)=>[`Contents/section${i}.xml`,xml(base.sectionOpen+resolveBorders(section)+'</hs:sec>')])),
        'Contents/content.hpf':xml(`<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="1.0" unique-identifier="" id=""><opf:metadata><opf:title>${escape(plan.blocks[0]?.text)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">기술진단팀</opf:meta><opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>${sectionBodies.map((_,i)=>`<opf:item id="section${i}" href="Contents/section${i}.xml" media-type="application/xml"/>`).join('')}${manifest}</opf:manifest><opf:spine><opf:itemref idref="header"/>${sectionBodies.map((_,i)=>`<opf:itemref idref="section${i}" linear="yes"/>`).join('')}</opf:spine></opf:package>`),
        'META-INF/container.xml':xml('<?xml version="1.0" encoding="UTF-8"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>'),
        'META-INF/manifest.xml':xml('<?xml version="1.0" encoding="UTF-8"?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'),
        'Preview/PrvText.txt':strToU8(plan.blocks.map(b=>b.text||b.caption||'').join('\r\n')),
        'Contents/jindan-source.json':strToU8(JSON.stringify({schema:'jindan-pdf-provenance/1',engineVersion:PDF_HWPX_WRITER_VERSION,projectId:plan.projectId,source:plan.source,mode:plan.mode,chapterScope:plan.chapterScope,sourcePages:plan.sourcePages,positionedPages:plan.positionedPages,sections:pageGroups.map((g,i)=>({section:`Contents/section${i}.xml`,sourcePage:g.page.number,kind:g.page.kind})),mapping:plan.mapping,editedLocations:plan.editedLocations,furniture:plan.furniture,sourceMargins:sourceMarginEvidence,fontEvidence:plan.fontEvidence,embeddedFonts,cellLines:cellLineEvidence,unresolvedCellLayout,textFrames:textFrameEvidence,vectorPaths:vectorPathEvidence,furnitureCoordinates:furnitureCoordinateEvidence,furnitureRules:furnitureRuleEvidence,furniturePageNumbers:furniturePageNumberEvidence,styleReference:plan.styleReference,pairedReference:plan.pairedReference,reviewedReferenceText:plan.reviewedReferenceText,pageDecorations:plan.pageDecorations,graphPartitions:graphPartitionEvidence,assets:assetMapping,missingPictures,warnings:outputWarnings,paragraphReconstruction:plan.mode==='reference'?(plan.pairedReference?.matchedParagraphs?'matched-native-paragraphs-and-positioned-lines':'positioned-pdf-lines'):'draft-flow',status:'review-required'}))});
    const structuralValidation=validateGeneratedHwpx(entries),packed=packHwpxPackage(entries),repaired=repairReportNumbering(packed);
    return {bytes:plan.mode==='draft'?repaired.bytes:packed,review:{engineVersion:PDF_HWPX_WRITER_VERSION,source:plan.source,projectId:plan.projectId,mode:plan.mode,status:'hancom-review-required',mapping:plan.mapping,warnings:[...outputWarnings,...(missingPictures.length?[`원문 그림 ${missingPictures.length}개는 위치 표시로 남겼습니다.`]:[])],missingPictures,structuralValidation,numbering:{...repaired.report,applied:plan.mode==='draft'},requiresLayoutReview:true,reportReady:false}};
}
