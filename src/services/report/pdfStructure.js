// PDF coordinates are points in the displayed (rotated/cropped) page, top down.
// Classification and cell recovery are proposals, never current diagnosis data.
export const PDF_DISCIPLINES = { common: '공통', process: '공정', mechanical: '기계', electrical: '전기', unknown: '미분류' };
export const PDF_ANALYZER_VERSION = 'pdf-structure/1';
const compact = text => text.normalize('NFKC').replace(/\s+/g, '');
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
export const point = (matrix, x, y) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
export const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const bounds = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const inside = (box, x, y, margin = 0) => x >= box[0]-margin && x <= box[2]+margin && y >= box[1]-margin && y <= box[3]+margin;
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)] || 10;

export function pdfTextItems(content, viewport) {
    const seen = new Map(), result = [];
    for (const item of content.items) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const m=multiply(viewport.transform,item.transform), size=Math.hypot(m[2],m[3]) || item.height || 10;
        const x=m[4], baseline=m[5], width=Math.abs(item.width*viewport.scale);
        // Preserve vertical text separately; it is not silently read as horizontal.
        const vertical=Math.abs(m[1])>Math.abs(m[0]);
        const bbox=vertical?[x-size,baseline-width,x,baseline]:[x,baseline-size,x+width,baseline+size*.15];
        const previous=seen.get(item.str)||[];
        if(previous.some(p=>near(p[0],x,1.3)&&near(p[1],baseline,1.3)))continue;
        previous.push([x,baseline]);seen.set(item.str,previous);
        result.push({text:item.str,x,baseline,size,bbox,font:content.styles?.[item.fontName]?.fontFamily||item.fontName,vertical});
    }
    return result;
}
export function pdfLines(items) {
    const rows=[];
    for(const item of [...items].sort((a,b)=>a.baseline-b.baseline||a.x-b.x)){
        let row=rows.at(-1);
        if(!row||!near(row.baseline,item.baseline,Math.max(1.2,Math.min(row.size,item.size)*.18))){row={baseline:item.baseline,size:item.size,items:[]};rows.push(row);}
        row.items.push(item);row.size=Math.max(row.size,item.size);
    }
    return rows.map(row=>{
        const sorted=row.items.sort((a,b)=>a.x-b.x);let text='',right=-Infinity;
        for(const item of sorted){if(text&&item.x-right>Math.max(1.5,item.size*.2)&&!text.endsWith(' ')&&!item.text.startsWith(' '))text+=' ';text+=item.text;right=Math.max(right,item.bbox[2]);}
        return {text:text.trim(),bbox:bounds(sorted.flatMap(item=>[[item.bbox[0],item.bbox[1]],[item.bbox[2],item.bbox[3]]])),size:row.size,baseline:row.baseline,vertical:sorted.some(item=>item.vertical)};
    });
}

export function pdfGraphics(operatorList, OPS, viewport) {
    let matrix=viewport.transform.slice();const stack=[],segments=[],images=[];
    const line=(a,b,filled)=>{
        if(!a||!b)return;const p=point(matrix,...a),q=point(matrix,...b);
        if(near(p[1],q[1],.6)&&Math.abs(p[0]-q[0])>=18)segments.push({axis:'h',at:(p[1]+q[1])/2,start:Math.min(p[0],q[0]),end:Math.max(p[0],q[0]),filled});
        else if(near(p[0],q[0],.6)&&Math.abs(p[1]-q[1])>=10)segments.push({axis:'v',at:(p[0]+q[0])/2,start:Math.min(p[1],q[1]),end:Math.max(p[1],q[1]),filled});
    };
    for(let i=0;i<operatorList.fnArray.length;i++){
        const op=operatorList.fnArray[i],args=operatorList.argsArray[i];
        if(op===OPS.save)stack.push(matrix.slice());
        else if(op===OPS.restore)matrix=stack.pop()||viewport.transform.slice();
        else if(op===OPS.transform)matrix=multiply(matrix,args);
        else if([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageXObjectRepeat].includes(op)){
            const bbox=bounds([[0,0],[1,0],[0,1],[1,1]].map(p=>point(matrix,...p)));
            if(bbox[2]-bbox[0]>15&&bbox[3]-bbox[1]>8)images.push({bbox,operator:i,kind:bbox[3]-bbox[1]<32?'text-raster':'figure'});
        }else if(op===OPS.constructPath){
            const [paint,data,minMax]=args;
            if(paint===OPS.endPath||!data?.[0]||!ArrayBuffer.isView(data[0]))continue;
            const fill=[OPS.fill,OPS.eoFill].includes(paint);
            if(fill&&minMax){const b=bounds([[minMax[0],minMax[1]],[minMax[2],minMax[3]]].map(p=>point(matrix,...p)));if(Math.min(b[2]-b[0],b[3]-b[1])>1.8)continue;}
            const path=data[0];let current,start;
            for(let j=0;j<path.length;){const code=path[j++];if(code===0){current=[path[j++],path[j++]];start=current;}else if(code===1){const next=[path[j++],path[j++]];line(current,next,fill);current=next;}else if(code===4){line(current,start,fill);current=start;}else if(code===2){j+=6;current=null;}else if(code===3){j+=4;current=null;}else break;}
        }
        if(segments.length>12000||images.length>1000)throw new Error('PDF 쪽의 도형 수가 분석 한도를 넘습니다.');
    }
    const seen=new Set();return {images,segments:segments.filter(s=>{const key=[s.axis,...[s.at,s.start,s.end].map(v=>Math.round(v))].join(':');if(seen.has(key))return false;seen.add(key);return true;})};
}
const coordinates = values => {const sorted=[...values].sort((a,b)=>a-b),out=[];for(const v of sorted){if(!out.length||v-out.at(-1)>1.8)out.push(v);}return out;};
function wall(segments,axis,at,from,to){
    const spans=segments.filter(s=>s.axis===axis&&near(s.at,at,2)&&s.end>from&&s.start<to).sort((a,b)=>a.start-b.start);let covered=from;
    for(const s of spans){if(s.start>covered+2)return false;covered=Math.max(covered,s.end);if(covered>=to-2)return true;}return false;
}
export function recoverPdfTables(items, graphics, pageNumber) {
    const segments=graphics.segments,parents=segments.map((_,i)=>i),find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    const hs=[],vs=[];segments.forEach((s,i)=>(s.axis==='h'?hs:vs).push(i));
    if(hs.length*vs.length>4000000)return {tables:[],warnings:['도형이 복잡해 표 경계 자동 복원을 생략했습니다.']};
    for(const hi of hs)for(const vi of vs){const h=segments[hi],v=segments[vi];if(v.at>=h.start-2&&v.at<=h.end+2&&h.at>=v.start-2&&h.at<=v.end+2)parents[find(hi)]=find(vi);}
    const groups=new Map();segments.forEach((s,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(s);});
    const tables=[],warnings=[];
    for(const group of groups.values()){
        const xs=coordinates(group.filter(s=>s.axis==='v').map(s=>s.at)),ys=coordinates(group.filter(s=>s.axis==='h').map(s=>s.at));
        if(xs.length<2||ys.length<3||xs.at(-1)-xs[0]<50)continue;
        if(xs.length>41||ys.length>151){warnings.push('큰 표는 경계 한도를 넘어 원본에서 확인해야 합니다.');continue;}
        const bbox=[xs[0],ys[0],xs.at(-1),ys.at(-1)],within=items.filter(item=>inside(bbox,(item.bbox[0]+item.bbox[2])/2,item.baseline-item.size*.35));
        if(within.length<3)continue;
        const columns=xs.length-1,rows=ys.length-1,cellParents=Array.from({length:rows*columns},(_,i)=>i),root=i=>{while(cellParents[i]!==i){cellParents[i]=cellParents[cellParents[i]];i=cellParents[i];}return i;};
        for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
            const i=r*columns+c;
            if(c+1<columns&&!wall(group,'v',xs[c+1],ys[r],ys[r+1]))cellParents[root(i)]=root(i+1);
            if(r+1<rows&&!wall(group,'h',ys[r+1],xs[c],xs[c+1]))cellParents[root(i)]=root(i+columns);
        }
        const regions=new Map();for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const id=root(r*columns+c);if(!regions.has(id))regions.set(id,[]);regions.get(id).push([r,c]);}
        let irregular=false;const cells=[];
        for(const positions of regions.values()){
            const row=Math.min(...positions.map(p=>p[0])),column=Math.min(...positions.map(p=>p[1])),rowSpan=Math.max(...positions.map(p=>p[0]))-row+1,colSpan=Math.max(...positions.map(p=>p[1]))-column+1;
            if(rowSpan*colSpan!==positions.length){irregular=true;break;}
            const box=[xs[column],ys[row],xs[column+colSpan],ys[row+rowSpan]],contents=within.filter(item=>inside(box,(item.bbox[0]+item.bbox[2])/2,item.baseline-item.size*.35,-.1));
            cells.push({id:`pdf:p${pageNumber}:t${tables.length}:r${row}c${column}`,row,column,rowSpan,colSpan,bbox:box,text:pdfLines(contents).map(l=>l.text).join('\n')});
        }
        if(irregular){warnings.push(`PDF ${pageNumber}쪽의 불규칙 병합 표는 자동 복원하지 않았습니다.`);continue;}
        if(cells.length<3)continue;
        tables.push({id:`pdf:p${pageNumber}:t${tables.length}`,rows,columns,cells,bbox,columnWidths:xs.slice(1).map((x,i)=>x-xs[i]),rowHeights:ys.slice(1).map((y,i)=>y-ys[i]),reviewRequired:true});
    }
    return {tables:tables.sort((a,b)=>a.bbox[1]-b.bbox[1]),warnings};
}
export function disciplineFromHeading(text) {
    const value=compact(text);
    if(/전기|계측제어|전력/.test(value))return 'electrical';
    if(/기계|회전기기/.test(value))return 'mechanical';
    if(/공정|수질|처리공법|운영관리/.test(value))return 'process';
    if(/개요|총괄|종합|시설현황|결론|개선계획|부록/.test(value))return 'common';
    return 'unknown';
}
export function classifyPdfPages(pages) {
    let active='unknown',chapter='';
    return pages.map(page=>{
        const lines=page.lines,bodySize=median(lines.map(l=>l.size)),text=lines.map(l=>l.text).join('\n');
        const contents=/^(?:차례|목차|표목차|그림목차)$/.test(compact(lines.slice(0,4).map(l=>l.text).join('')))||lines.filter(l=>/[.…]{4}/.test(l.text)).length>=3;
        const candidates=lines.filter(l=>/제\s*\d+\s*장/.test(l.text)&&l.text.length<130&&(l.size>=bodySize*1.1||lines.length<=6));
        const heading=contents?null:candidates.find(l=>disciplineFromHeading(l.text)!=='unknown');
        if(heading){active=disciplineFromHeading(heading.text);chapter=heading.text;}
        let kind=contents?'contents':!lines.length?(page.images.length||page.drawings>2?'scan':'blank'):lines.length<=6&&heading?'divider':'body';
        const discipline=contents?'common':active;
        const headings=lines.filter(l=>/^(?:제\s*\d+\s*장|\d+(?:\.\d+){1,4}\.?\s|[가-힣]\s*\.)/.test(l.text)&&l.text.length<160&&!/^[-–]?\s*\d+\s*[-–]?$/.test(l.text));
        return {...page,discipline,chapter,kind,headings,classificationReason:heading?`장 제목: ${heading.text}`:contents?'차례 페이지':chapter?`앞 장 제목에서 이어짐: ${chapter}`:'장 제목 근거를 찾지 못했습니다.',warnings:[...page.warnings,...(kind==='scan'?['텍스트가 없는 이미지 쪽입니다. OCR 또는 수동 전사가 필요합니다.']:[]),...(discipline==='unknown'?['분야를 확인해 지정하세요.']:[])]};
    });
}
export function buildPdfAnalysis(rawPages,source,projectId) {
    if(!/^project:/.test(projectId))throw new Error('등록된 업무 프로젝트를 선택하세요.');
    const pages=classifyPdfPages(rawPages);
    return {schema:'jindan-pdf-analysis/1',parserVersion:PDF_ANALYZER_VERSION,projectId,source,pages,createdAt:new Date().toISOString(),status:'review-required',summary:{pages:pages.length,tables:pages.reduce((n,p)=>n+p.tables.length,0),images:pages.reduce((n,p)=>n+p.images.filter(i=>i.kind==='figure').length,0),rasterTextPages:pages.filter(p=>p.images.some(i=>i.kind==='text-raster')).map(p=>p.number),disciplines:Object.fromEntries(Object.keys(PDF_DISCIPLINES).map(key=>[key,pages.filter(p=>p.discipline===key).length])),scanPages:pages.filter(p=>p.kind==='scan').map(p=>p.number)},reportReady:false};
}
