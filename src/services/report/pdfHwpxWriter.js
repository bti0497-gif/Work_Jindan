import base from './assets/hwpxBase.json' with {type:'json'};
import {strToU8} from 'fflate';
import {packHwpxPackage} from './hwpxPackage.js';
import {repairReportNumbering} from './reportNumbering.js';

const escape=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const pt=value=>Math.round(value*100),mm=value=>Math.round(value*7200/25.4);
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inBox=(a,b)=>a[0]>=b[0]-2&&a[1]>=b[1]-2&&a[2]<=b[2]+2&&a[3]<=b[3]+2;
const furniture=(line,page)=>line.bbox[1]<Math.min(65,page.heightPt*.085)||line.bbox[3]>page.heightPt-45;
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
    if(pages.some(p=>!['electrical','common'].includes(pdfPageDiscipline(p,settings))))throw new Error('전기 또는 검토한 공통 쪽만 선택하세요. 공정·기계는 이번 작성 범위에서 제외합니다.');
    if(mode==='draft'&&!settings.labelsReviewed)throw new Error('유지할 표 항목 열과 금회 입력 칸을 먼저 검토하세요.');
    const blocks=[],warnings=[],mapping=[],editedLocations=[];let tableNumber=0,pictureNumber=0,lastTableCaption='';
    const chapterNumber=Number(settings.chapterNumber??pdfElectricalChapterNumber(analysis));
    if(!Number.isInteger(chapterNumber)||chapterNumber<1||chapterNumber>999)throw new Error('전기 장 번호는 1~999로 입력하세요.');
    blocks.push({kind:'heading',text:`제${chapterNumber}장 전기 및 계측제어 설비 분야`,size:18});
    if(mode==='reference')blocks.push({kind:'paragraph',text:'전회 PDF에서 재구성한 참고본 · 금회 측정값과 판정은 별도 확인',size:10});
    for(const page of pages){
        for(const table of page.tables)for(const cell of table.cells)if(cell.editedByUser)editedLocations.push({page:page.number,tableId:table.id,cellId:cell.id});
        for(const [lineIndex,line]of(page.ocr?.mergedLines||[]).entries())if(line.editedByUser)editedLocations.push({page:page.number,lineIndex,bbox:line.bbox});
        if(page.kind==='blank')continue;
        if(page.kind==='scan'&&!page.ocr?.lines?.length)warnings.push(`PDF ${page.number}쪽: OCR이 필요한 이미지 쪽`);
        if(page.images.some(i=>i.kind==='text-raster')&&!page.ocr)warnings.push(`PDF ${page.number}쪽: 이미지 본문 OCR 보강 필요`);
        const entries=[];
        const lines=page.ocr?.mergedLines||page.lines;
        for(const [index,line]of lines.entries()){
            if(furniture(line,page)||page.tables.some(table=>inBox(line.bbox,table.bbox)))continue;
            if(/^제\s*\d+\s*장/.test(line.text)||/^\s*[<〈\[]?\s*(?:표|그림)\s*\d/.test(line.text))continue;
            const heading=/^(?:\d+(?:\.\d+){1,4}\.?\s|[가-힣]\s*\.)/.test(line.text)&&line.text.length<180;
            if(mode==='reference'||heading)entries.push({y:line.bbox[1],kind:heading?'heading':'paragraph',text:line.text,size:Math.max(8,Math.min(heading?14:12,line.size||10)),source:{page:page.number,line:index,bbox:line.bbox,ocr:!!line.ocr}});
        }
        for(const table of page.tables){
            const keep=settings.labelColumns?.[table.id]||[0];
            if(!Array.isArray(keep)||keep.some(c=>!Number.isInteger(c)||c<0||c>=table.columns))throw new Error('표에서 유지할 항목 열을 확인하세요.');
            const caption=page.lines.filter(l=>/표/.test(l.text)&&l.bbox[3]<=table.bbox[1]+3&&table.bbox[1]-l.bbox[3]<45).at(-1)?.text||'전기 분야 조사표';
            const continued=/표\s*계속/.test(caption)&&lastTableCaption;
            const generated=continued?`${lastTableCaption} (계속)`:`<표 ${chapterNumber}-${++tableNumber}> ${caption.replace(/^[<〈\[]?\s*표\s*(?:계속|\d+(?:\s*[-.]\s*\d+)*)?\s*[>〉\]]?\s*/,'')||'전기 분야 조사표'}`;
            if(!continued)lastTableCaption=generated;
            entries.push({y:table.bbox[1],kind:'table',table:{...table,cells:table.cells.map(cell=>({...cell,text:mode==='reference'||cell.row===0||Array.from({length:cell.colSpan},(_,i)=>cell.column+i).every(c=>keep.includes(c))?cell.text:''}))},caption:mode==='reference'?caption:generated,source:{page:page.number,tableId:table.id,bbox:table.bbox}});
        }
        const groups=[];
        for(const image of page.images.filter(i=>i.kind!=='text-raster').sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0])){
            if(furniture({bbox:image.bbox},page))continue;
            const previous=groups.at(-1);
            if(previous&&Math.abs(previous[0].bbox[1]-image.bbox[1])<4&&Math.abs(previous[0].bbox[3]-image.bbox[3])<8)previous.push(image);else groups.push([image]);
        }
        for(const images of groups){
            const top=Math.min(...images.map(i=>i.bbox[1])),bottom=Math.max(...images.map(i=>i.bbox[3]));
            const captionLine=page.lines.find(l=>/^[<〈\[]?\s*그림\s*\d/.test(l.text)&&l.bbox[1]>=bottom-2&&l.bbox[1]-bottom<60);
            const originalCaption=captionLine?.text;
            const labelLines=captionLine?page.lines.filter(l=>l.bbox[1]>=bottom-1&&l.bbox[3]<captionLine.bbox[1]&&!/^(?:제\s*\d+\s*장|\d+(?:\.\d+){1,4})/.test(l.text)):[];
            for(let i=entries.length-1;i>=0;i--)if(labelLines.some(l=>entries[i].text===l.text&&Math.abs(entries[i].y-l.bbox[1])<1))entries.splice(i,1);
            const label=`그림 ${chapterNumber}-${++pictureNumber}`;
            entries.push({y:top,kind:'picture',images,labels:labelLines.map(l=>l.text).join('\n'),caption:mode==='reference'&&originalCaption?originalCaption:`<${label}> ${originalCaption?.replace(/^[<〈\[]?\s*그림\s*\d+(?:\s*[-.]\s*\d+)*\s*[>〉\]]?\s*/,'')||'전기 분야 사진·그래프'}`,source:{page:page.number,imageIds:images.map(i=>i.id)},placeholder:mode==='draft'?'금회 사진·그래프를 등록하고 검토하세요.':'원문 그림을 확인하세요.'});
        }
        entries.sort((a,b)=>a.y-b.y);
        if(mode==='draft'&&!entries.some(e=>e.kind==='paragraph'))entries.push({kind:'paragraph',text:'[금회 조사 결과·요약·진단·관리요점 및 개선사항 입력]',size:10});
        if(!entries.length&&page.kind!=='divider')entries.push({kind:'paragraph',text:`[PDF ${page.number}쪽의 내용을 원문과 대조하여 입력하세요.]`,size:10});
        if(mode==='reference')blocks.push({kind:'paragraph',text:`전회 PDF ${page.number}쪽`,size:9,pageBreak:blocks.length>2});
        for(const entry of entries){const id=`block:${blocks.length}`;blocks.push({...entry,id});if(entry.source)mapping.push({blockId:id,...entry.source});}
    }
    if(blocks.length>20000)throw new Error('작성 내용이 한도를 넘습니다. PDF 쪽 범위를 나누세요.');
    return {schema:'jindan-pdf-authoring/1',projectId,mode,source:analysis.source,blocks,mapping,editedLocations,warnings,status:'review-required',reportReady:false};
}

export function writePdfHwpx(plan,{spec={},pictures={}}={}) {
    if(plan?.schema!=='jindan-pdf-authoring/1'||!validHash(plan.source?.sha256)||!/^project:/.test(plan.projectId))throw new Error('PDF 작성 계획을 확인하세요.');
    if(plan.blocks.length>20000)throw new Error('작성 내용이 한도를 넘습니다.');
    let id=100,header=base.header;const chars=new Map(),extraChars=[],entries={},binaryItems=[],missingPictures=[];
    const bodyFont=String(spec.fontFamily||'함초롬바탕').slice(0,100);
    const bodySize=spec.fontSizePt??10;
    if(!Number.isFinite(bodySize)||bodySize<5||bodySize>24)throw new Error('본문 글자 크기는 5~24pt로 입력하세요.');
    header=header.replace(/(<hh:font id="0" face=")[^"]*/g,(_,prefix)=>prefix+escape(bodyFont));
    const charBase=header.match(/<hh:charPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:charPr>/)?.[0];
    const paraBase=header.match(/<hh:paraPr\b[^>]*id="0"[^>]*>[\s\S]*?<\/hh:paraPr>/)?.[0];
    if(!charBase||!paraBase)throw new Error('한글 기본 서식이 없습니다.');
    const charStart=Number(header.match(/<hh:charProperties itemCnt="(\d+)"/)?.[1]),paraStart=Number(header.match(/<hh:paraProperties itemCnt="(\d+)"/)?.[1]),borderId=Number(header.match(/<hh:borderFills itemCnt="(\d+)"/)?.[1])+1;
    const char=(size,bold=false)=>{const key=`${Math.round(size*100)}:${bold}`;if(chars.has(key))return chars.get(key);const next=charStart+chars.size;chars.set(key,next);let xml=charBase.replace('id="0"',`id="${next}"`).replace(/height="\d+"/,`height="${Math.round(size*100)}"`).replace(/<hh:bold\s*\/>/g,'');if(bold)xml=xml.replace('</hh:charPr>','<hh:bold/></hh:charPr>');extraChars.push(xml);return next;};
    const widthMm=spec.widthMm??210,heightMm=spec.heightMm??297;
    if(!Number.isFinite(widthMm)||widthMm<100||widthMm>420||!Number.isFinite(heightMm)||heightMm<100||heightMm>594)throw new Error('출력 용지 크기를 확인하세요.');
    const width=mm(widthMm),height=mm(heightMm);
    const margins={left:mm(spec.margins?.left??20),right:mm(spec.margins?.right??20),top:mm(spec.margins?.top??20),bottom:mm(spec.margins?.bottom??20)};
    const usable=width-margins.left-margins.right;
    if(![width,height,...Object.values(margins)].every(Number.isFinite)||Object.values(margins).some(n=>n<0)||usable<mm(30)||height-margins.top-margins.bottom<mm(40))throw new Error('한글 용지 여백을 확인하세요.');
    const paragraph=(text,{size=10,bold=false,pageBreak=false,content='',tableCell=false}={})=>{
        const c=char(size,bold);return `<hp:p id="${id++}" paraPrIDRef="${paraStart+(tableCell?1:0)}" styleIDRef="0" pageBreak="${pageBreak?1:0}" columnBreak="0" merged="0"><hp:run charPrIDRef="${c}">${content}${String(text).split('\n').map((line,i)=>`${i?'<hp:lineBreak/>':''}<hp:t>${escape(line)}</hp:t>`).join('')}</hp:run></hp:p>`;
    };
    const subList=(text,options)=>`<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph(text,options)}</hp:subList>`;
    const tableXml=table=>{
        if(!Number.isInteger(table.rows)||!Number.isInteger(table.columns)||table.rows<1||table.rows>150||table.columns<1||table.columns>40||table.columnWidths.length!==table.columns||table.rowHeights.length!==table.rows||![...table.columnWidths,...table.rowHeights].every(n=>Number.isFinite(n)&&n>0)||table.cells.length>6000)throw new Error('복원할 표의 행·열·크기를 확인하세요.');
        if(table.cells.some(c=>![c.row,c.column,c.rowSpan,c.colSpan].every(Number.isInteger)||c.row<0||c.column<0||c.rowSpan<1||c.colSpan<1||c.row+c.rowSpan>table.rows||c.column+c.colSpan>table.columns||typeof c.text!=='string'||c.text.length>100000))throw new Error('복원할 표의 셀 범위를 확인하세요.');
        const total=table.columnWidths.reduce((n,v)=>n+v,0),scale=usable/Math.max(1,total);
        const widths=table.columnWidths.map(w=>Math.max(100,Math.round(w*scale))),heights=table.rowHeights.map(h=>Math.max(1400,pt(h)));
        let rows='';
        for(let row=0;row<table.rows;row++)rows+=`<hp:tr>${table.cells.filter(c=>c.row===row).sort((a,b)=>a.column-b.column).map(cell=>{
            const w=widths.slice(cell.column,cell.column+cell.colSpan).reduce((n,v)=>n+v,0),h=heights.slice(cell.row,cell.row+cell.rowSpan).reduce((n,v)=>n+v,0);
            return `<hp:tc name="" header="${row===0?1:0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="1000">${subList(cell.text,{size:9,tableCell:true,bold:row===0})}<hp:cellAddr colAddr="${cell.column}" rowAddr="${row}"/><hp:cellSpan colSpan="${cell.colSpan}" rowSpan="${cell.rowSpan}"/><hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="250" right="250" top="180" bottom="180"/></hp:tc>`;
        }).join('')}</hp:tr>`;
        return `<hp:tbl id="${id++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${table.rows}" colCnt="${table.columns}" cellSpacing="0" borderFillIDRef="1000" noAdjust="0"><hp:sz width="${usable}" widthRelTo="ABSOLUTE" height="${heights.reduce((n,h)=>n+h,0)}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="283" bottom="283"/><hp:inMargin left="250" right="250" top="180" bottom="180"/>${rows}</hp:tbl>`;
    };
    const pictureXml=(block,picture)=>{
        if(!picture?.bytes||picture.bytes.length>16*1024*1024){missingPictures.push(block.image.id);return null;}
        if(![picture.width,picture.height].every(n=>Number.isInteger(n)&&n>0&&n<20000)||[137,80,78,71,13,10,26,10].some((n,i)=>picture.bytes[i]!==n))throw new Error('한글에 넣을 그림은 검증된 PNG여야 합니다.');
        const imageId=`image${binaryItems.length}`,ratio=picture.height/picture.width,w=Math.min(usable,pt(block.image.bbox[2]-block.image.bbox[0])),h=Math.round(w*ratio);
        entries[`BinData/${imageId}.png`]=picture.bytes instanceof Uint8Array?picture.bytes:new Uint8Array(picture.bytes);binaryItems.push(imageId);
        const matrix='<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';
        return `<hp:pic id="${id++}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id++}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(w/2)}" centerY="${Math.round(h/2)}" rotateimage="1"/><hp:renderingInfo>${matrix}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hc:img binaryItemIDRef="${imageId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`;
    };
    let sectionProperties=base.sectionProperties.replace(/pageStartsOn="BOTH"/,'pageStartsOn="ODD"').replace(/(<hp:pagePr\b[^>]*width=")\d+(" height=")\d+/,`$1${width}$2${height}`).replace(/<hp:margin\b[^>]*\/>/,`<hp:margin header="2000" footer="2000" gutter="0" left="${margins.left}" right="${margins.right}" top="${margins.top}" bottom="${margins.bottom}"/>`);
    const controlText=(name,text)=>`<hp:ctrl><hp:${name} id="${id++}" applyPageType="BOTH">${subList(text,{size:9})}</hp:${name}></hp:ctrl>`;
    const furnitureXml=(spec.headerVisible&&spec.header?controlText('header',spec.header):'')+(spec.footerVisible&&spec.footer?controlText('footer',spec.footer):'')+(spec.pageNumberVisible===false?'':'<hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl>');
    let body=paragraph('',{content:sectionProperties+base.columns+furnitureXml});
    for(const block of plan.blocks){
        if(block.kind==='table'){body+=paragraph(block.caption,{size:10,bold:true});body+=paragraph('',{content:tableXml(block.table)});}
        else if(block.kind==='picture'){
            const images=block.images||[block.image];
            const image=plan.mode==='reference'?images.map(image=>pictureXml({image},pictures[image.id])).filter(Boolean).join(''):null;
            body+=image?paragraph('',{content:image}):paragraph(`[${block.caption} · ${block.placeholder}]`,{size:10});if(plan.mode==='reference'&&block.labels)body+=paragraph(block.labels,{size:9});body+=paragraph(block.caption,{size:10});
        }else body+=paragraph(block.text,{size:block.kind==='heading'?(block.size||14):bodySize,bold:block.kind==='heading',pageBreak:block.pageBreak});
    }
    const newParas=[paraStart,paraStart+1].map((n,i)=>paraBase.replace('id="0"',`id="${n}"`).replace(/<hh:lineSpacing\b[^>]*\/>/,`<hh:lineSpacing type="PERCENT" value="${i?120:140}" unit="HWPUNIT"/>`));
    header=header.replace(/<hh:charProperties itemCnt="(\d+)">/,(_,n)=>`<hh:charProperties itemCnt="${Number(n)+extraChars.length}">`).replace('</hh:charProperties>',extraChars.join('')+'</hh:charProperties>')
        .replace(/<hh:paraProperties itemCnt="(\d+)">/,(_,n)=>`<hh:paraProperties itemCnt="${Number(n)+2}">`).replace('</hh:paraProperties>',newParas.join('')+'</hh:paraProperties>');
    const border='<hh:borderFill id="1000" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'+['left','right','top','bottom'].map(side=>`<hh:${side}Border type="SOLID" width="0.12 mm" color="#444444"/>`).join('')+'<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>';
    header=header.replace(/<hh:borderFills itemCnt="(\d+)">/,(_,n)=>`<hh:borderFills itemCnt="${Number(n)+1}">`).replace('</hh:borderFills>',border.replace('id="1000"',`id="${borderId}"`)+'</hh:borderFills>');
    body=body.replaceAll('borderFillIDRef="1000"',`borderFillIDRef="${borderId}"`);
    const now=new Date().toISOString(),manifest=binaryItems.map(imageId=>`<opf:item id="${imageId}" href="BinData/${imageId}.png" media-type="image/png" isEmbeded="1"/>`).join('');
    const xml=s=>strToU8(s);
    Object.assign(entries,{mimetype:strToU8('application/hwp+zip'),'version.xml':xml('<?xml version="1.0" encoding="UTF-8"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Jindan Report Studio" appVersion="1"/>'),
        'Contents/header.xml':xml(header),'Contents/section0.xml':xml(base.sectionOpen+body+'</hs:sec>'),
        'Contents/content.hpf':xml(`<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="1.0" unique-identifier="" id=""><opf:metadata><opf:title>${escape(plan.blocks[0]?.text)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">기술진단팀</opf:meta><opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>${manifest}</opf:manifest><opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`),
        'META-INF/container.xml':xml('<?xml version="1.0" encoding="UTF-8"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>'),
        'META-INF/manifest.xml':xml('<?xml version="1.0" encoding="UTF-8"?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'),
        'Preview/PrvText.txt':strToU8(plan.blocks.map(b=>b.text||b.caption||'').join('\r\n')),
        'Contents/jindan-source.json':strToU8(JSON.stringify({schema:'jindan-pdf-provenance/1',projectId:plan.projectId,source:plan.source,mode:plan.mode,mapping:plan.mapping,editedLocations:plan.editedLocations,status:'review-required'}))});
    const packed=packHwpxPackage(entries),repaired=repairReportNumbering(packed);
    return {bytes:plan.mode==='draft'?repaired.bytes:packed,review:{source:plan.source,projectId:plan.projectId,mode:plan.mode,status:'hancom-review-required',mapping:plan.mapping,warnings:[...plan.warnings,...(missingPictures.length?[`원문 그림 ${missingPictures.length}개는 위치 표시로 남겼습니다.`]:[])],missingPictures,numbering:{...repaired.report,applied:plan.mode==='draft'},requiresLayoutReview:true,reportReady:false}};
}
