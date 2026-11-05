// PDF coordinates are points in the displayed (rotated/cropped) page, top down.
// Classification and cell recovery are proposals, never current diagnosis data.
export const PDF_DISCIPLINES = { common: '공통', process: '공정', mechanical: '기계', electrical: '전기', unknown: '미분류' };
import {applyPdfTextColors, pdfCellAppearance, pdfColor} from './pdfAppearance.js';
import {pdfFurnitureRegion} from './pdfRestoration.js';
import {observedPdfItems} from './pdfGlyphGeometry.js';
import {reconcilePdfWhitespace} from './pdfWhitespaceTracking.js';
export const PDF_ANALYZER_VERSION = 'pdf-structure/13';
const compact = text => text.normalize('NFKC').replace(/\s+/g, '');
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
export const point = (matrix, x, y) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
export const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const bounds = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const inside = (box, x, y, margin = 0) => x >= box[0]-margin && x <= box[2]+margin && y >= box[1]-margin && y <= box[3]+margin;
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)] || 10;

export function pdfTextItems(content, viewport, textPaints = [], headerGlyphs = [], textGlyphs = []) {
    const seen = new Map(), result = [];
    for (const item of content.items) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const m=multiply(viewport.transform,item.transform), size=Math.hypot(m[2],m[3]) || item.height || 10;
        const x=m[4], baseline=m[5], width=Math.abs(item.width*viewport.scale);
        // Preserve vertical text separately; it is not silently read as horizontal.
        const vertical=Math.abs(m[1])>Math.abs(m[0]);
        const bbox=vertical?[x-size,baseline-width,x,baseline]:[x,baseline-size,x+width,baseline+size*.15];
        const previous=seen.get(item.str)||[];
        if(previous.some(p=>near(p[0],x,.05)&&near(p[1],baseline,.05)))continue;
        previous.push([x,baseline]);seen.set(item.str,previous);
        result.push({text:item.str,x,baseline,size,bbox,font:content.styles?.[item.fontName]?.sourceFont||content.styles?.[item.fontName]?.fontFamily||item.fontName,fontInfo:content.styles?.[item.fontName]?.sourceInfo,ascent:content.styles?.[item.fontName]?.ascent,widthPercent:Math.abs(m[0])/size*100,dir:item.dir,vertical});
    }
    let painted=applyPdfTextColors(result,textPaints);
    const key=s=>[...s.normalize('NFKC').replace(/\s/g,'')].sort().join('');
    const originalHeader=painted.filter(i=>i.bbox[3]<75);
    // WordArt exports can interleave Korean and Latin runs across the whole line.
    // Use observed glyph positions only when they account for every header character.
    if(headerGlyphs.length&&key(originalHeader.map(i=>i.text).join(''))===key(headerGlyphs.map(i=>i.text).join(''))){
        painted=[...painted.filter(i=>i.bbox[3]>=75),...headerGlyphs.map(g=>({...g,color:pdfColor(g.color),font:content.styles?.[g.font]?.sourceFont||content.styles?.[g.font]?.fontFamily||g.font,fontInfo:content.styles?.[g.font]?.sourceInfo,ascent:content.styles?.[g.font]?.ascent,vertical:false}))];
    }
    painted=painted.map(item=>({...item,effectLayer:item.bbox[3]<75?item.color||'unknown':'body'}));
    if(textGlyphs.length){const resolved=observedPdfItems(painted,textGlyphs,content.styles||{});resolved.items.geometryEvidence=resolved.evidence;return resolved.items;}return painted;
}
export function pdfLines(items,{splitGaps=false}={}) {
    const rows=[];
    for(const item of [...items].sort((a,b)=>a.baseline-b.baseline||a.x-b.x)){
        let row=rows.at(-1);
        if(!row||row.effectLayer!==item.effectLayer||!near(row.baseline,item.baseline,Math.max(1.2,Math.min(row.size,item.size)*.18))){row={baseline:item.baseline,size:item.size,items:[],effectLayer:item.effectLayer};rows.push(row);}
        row.items.push(item);row.size=Math.max(row.size,item.size);
    }
    return rows.flatMap(row=>{
        const groups=[];let edge=-Infinity;for(const item of row.items.sort((a,b)=>a.x-b.x)){if(!groups.length||splitGaps&&item.x-edge>Math.max(12,row.size*2))groups.push([]);groups.at(-1).push(item);edge=Math.max(edge,item.bbox[2]);}
        return groups.map(sorted=>{let text='',right=-Infinity;const runs=[];
        for(const item of reconcilePdfWhitespace(sorted)){
            const delta=item.x-right,tabBeforePt=text&&delta>Math.max(12,row.size*2)?delta:undefined,gap=text&&delta>Math.max(1.5,item.size*.2)&&!text.endsWith(' ')&&!item.text.startsWith(' ')?' ':'';
            text+=gap+item.text;right=Math.max(right,item.bbox[2]);
            const style={font:item.font,size:item.size,color:item.color,widthPercent:item.widthPercent,spacingPercent:item.spacingPercent,ascent:item.ascent,fontInfo:item.fontInfo};
            // An inferred space has its own measured nominal advance; applying
            // the next glyph's tracking to it would charge the gap again.
            const separateSpace=gap&&item.inferredSpaceSource&&!tabBeforePt;
            if(separateSpace)runs.push({text:' ',style:{...style,spacingPercent:0},bbox:[item.x-delta,item.bbox[1],item.x,item.bbox[3]],inferredSpaceSource:item.inferredSpaceSource});
            const prefix=separateSpace?'':gap,prior=runs.at(-1);
            if(prior&&!prior.inferredSpaceSource&&!tabBeforePt&&JSON.stringify(prior.style)===JSON.stringify(style)){prior.text+=prefix+item.text;prior.bbox[2]=Math.max(prior.bbox[2],item.bbox[2]);if(item.trackingSource)(prior.trackingSources??=[]).push(item.trackingSource);}
            else runs.push({text:prefix+item.text,tabBeforePt,style,bbox:[...item.bbox],...(item.trackingSource?{trackingSources:[item.trackingSource]}:{})});
        }
        const colors=[...new Set(sorted.map(item=>item.color))];
        const orders=sorted.map(item=>item.paintOrder).filter(Number.isInteger);
        return {text:text.trim(),runs,bbox:bounds(sorted.flatMap(item=>[[item.bbox[0],item.bbox[1]],[item.bbox[2],item.bbox[3]]])),size:row.size,fonts:[...new Set(sorted.map(item=>item.font).filter(Boolean))],color:colors.length===1?colors[0]:undefined,paintOrder:orders.length?Math.min(...orders):undefined,baseline:row.baseline,vertical:sorted.some(item=>item.vertical)};});
    });
}

export function pdfGraphics(operatorList, OPS, viewport) {
    let matrix=viewport.transform.slice(),fillColor='#000000',strokeColor='#000000',lineWidth=1,lineCap=0,dash=[],fillAlpha=1,clipBox=null,pendingClip=false,activeOperator=0;const stack=[],segments=[],images=[],fills=[],paths=[],textPaints=[],headerGlyphs=[],textGlyphs=[];
    const text={matrix:[1,0,0,1,0,0],x:0,y:0,lineX:0,lineY:0,size:10,font:'',hScale:1,charSpace:0,wordSpace:0,rise:0,leading:0};
    const moveText=(x,y)=>{text.lineX+=x;text.lineY+=y;text.x=text.lineX;text.y=text.lineY;};
    const intersect=(a,b)=>b?[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])]:a;
    const line=(a,b,filled,filledWidth)=>{
        if(!a||!b)return;const p=point(matrix,...a),q=point(matrix,...b);
        const style={filled,color:filled?fillColor:strokeColor,widthPt:filledWidth??lineWidth*Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])),dash:filled?[]:[...dash],cap:filled?undefined:['FLAT','ROUND','SQUARE'][lineCap],operator:activeOperator};
        if(near(p[1],q[1],.6)&&Math.abs(p[0]-q[0])>=18)segments.push({axis:'h',at:(p[1]+q[1])/2,start:Math.min(p[0],q[0]),end:Math.max(p[0],q[0]),...style});
        else if(near(p[0],q[0],.6)&&Math.abs(p[1]-q[1])>=10)segments.push({axis:'v',at:(p[0]+q[0])/2,start:Math.min(p[1],q[1]),end:Math.max(p[1],q[1]),...style});
    };
    for(let i=0;i<operatorList.fnArray.length;i++){
        const op=operatorList.fnArray[i],args=operatorList.argsArray[i];activeOperator=i;
        if(op===OPS.save)stack.push({matrix:[...matrix],fillColor,strokeColor,lineWidth,lineCap,dash:[...dash],fillAlpha,clipBox:clipBox&&[...clipBox],textState:{...text,matrix:[...text.matrix]}});
        else if(op===OPS.restore){const saved=stack.pop();if(saved){({matrix,fillColor,strokeColor,lineWidth,lineCap,dash,fillAlpha,clipBox}=saved);Object.assign(text,saved.textState);}pendingClip=false;}
        else if(op===OPS.transform)matrix=multiply(matrix,args);
        else if(op===OPS.clip||op===OPS.eoClip)pendingClip=true;
        else if(op===OPS.setFillRGBColor)fillColor=args[0];
        else if(op===OPS.setStrokeRGBColor)strokeColor=args[0];
        else if(op===OPS.setFillColorN||op===OPS.setFillTransparent)fillColor=null;
        else if(op===OPS.setStrokeColorN||op===OPS.setStrokeTransparent)strokeColor=null;
        else if(op===OPS.setLineWidth)lineWidth=args[0];
        else if(op===OPS.setLineCap)lineCap=args[0];
        else if(op===OPS.setDash)dash=Array.from(args[0]||[]).filter(n=>n>0);
        else if(op===OPS.beginText){text.matrix=[1,0,0,1,0,0];text.x=text.y=text.lineX=text.lineY=0;}
        else if(op===OPS.setTextMatrix){text.matrix=Array.from(ArrayBuffer.isView(args[0])||Array.isArray(args[0])?args[0]:args);text.x=text.y=text.lineX=text.lineY=0;}
        else if(op===OPS.moveText)moveText(args[0],args[1]);
        else if(op===OPS.setLeadingMoveText){text.leading=-args[1];moveText(args[0],args[1]);}
        else if(op===OPS.nextLine)moveText(0,-text.leading);
        else if(op===OPS.setLeading)text.leading=args[0];
        else if(op===OPS.setFont){text.font=args[0];text.size=args[1];}
        else if(op===OPS.setHScale)text.hScale=args[0]/100;
        else if(op===OPS.setCharSpacing)text.charSpace=args[0];
        else if(op===OPS.setWordSpacing)text.wordSpace=args[0];
        else if(op===OPS.setTextRise)text.rise=args[0];
        else if(op===OPS.setGState){for(const [key,value] of args[0]||[]){if(key==='ca')fillAlpha=value;else if(key==='LC')lineCap=value;else if(key==='LW')lineWidth=value;}}
        else if(op===OPS.showText){
            const value=(args[0]||[]).map(g=>typeof g==='object'?g.unicode||'':'').join('');if(value)textPaints.push({text:value,color:fillColor,operator:i});
            const tm=multiply(matrix,text.matrix),size=Math.abs(text.size)*Math.hypot(tm[2],tm[3]);
            const glyphs=args[0]||[];
            for(const [glyphIndex,glyph]of glyphs.entries()){
                if(typeof glyph==='number'){text.x-=glyph*text.size*.001;continue;}
                const [x,baseline]=point(tm,text.x*text.hScale,text.y+text.rise),advance=(glyph.width||0)*text.size*.001+text.charSpace+(glyph.isSpace?text.wordSpace:0);
                if(glyph.unicode?.trim()&&Math.abs(tm[1])<.001&&size>0){
                    // TJ adjusts the next origin, independently of glyph width.
                    // Keep the exact operator evidence instead of silently
                    // replacing the source tracking with zero in HWPX runs.
                    let adjustment=0;for(let next=glyphIndex+1;next<glyphs.length&&typeof glyphs[next]==='number';next++)adjustment+=glyphs[next];
                    const percent=text.charSpace/text.size*100-adjustment/10,spacingPercent=Math.round(percent),supported=Array.from(glyph.unicode).length===1&&Number.isFinite(percent)&&percent>=-50&&percent<=50&&tm[0]>0&&text.hScale>0;
                    const trackingSource={operator:i,glyphIndex,character:glyph.unicode,fontSize:text.size,charSpace:text.charSpace,tjAdjustment:adjustment,exactPercent:percent,spacingPercent:supported?spacingPercent:null,supported};
                    const width=Math.abs((glyph.width||0)*text.size*.001*text.hScale*tm[0]),observed={text:glyph.unicode,x,baseline,size,widthPercent:Math.abs(tm[0]*text.hScale)/Math.hypot(tm[2],tm[3])*100,spacingPercent:supported?spacingPercent:undefined,trackingSource,bbox:[x,baseline-size,x+width,baseline+size*.15],font:text.font,color:fillColor,paintOrder:i};
                    textGlyphs.push(observed);if(baseline+size*.15<75)headerGlyphs.push(observed);
                }
                text.x+=advance;
            }
        }
        else if([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageXObjectRepeat].includes(op)){
            const bbox=intersect(bounds([[0,0],[1,0],[0,1],[1,1]].map(p=>point(matrix,...p))),clipBox);
            // Small punctuation/glyph images are still document content.
            if(bbox[2]-bbox[0]>.05&&bbox[3]-bbox[1]>.05)images.push({bbox,transform:matrix.slice(),operator:i,kind:bbox[3]-bbox[1]<32?'text-raster':'figure'});
        }else if(op===OPS.constructPath){
            const [paint,data,minMax]=args;
            if(!data?.[0]||!ArrayBuffer.isView(data[0]))continue;
            const path=Array.from(data[0]),points=[];let straight=true,explicitClose=false;
            for(let k=0;k<path.length;){const code=path[k++];if(code===0||code===1){points.push(point(matrix,path[k++],path[k++]));}else if(code===4){explicitClose=true;}else{straight=false;break;}}
            if(points.length===5&&near(points[0][0],points[4][0],.01)&&near(points[0][1],points[4][1],.01))points.pop();
            const fullBox=minMax?bounds([[minMax[0],minMax[1]],[minMax[2],minMax[1]],[minMax[2],minMax[3]],[minMax[0],minMax[3]]].map(p=>point(matrix,...p))):null;
            const rectangle=straight&&points.length===4&&fullBox&&points.every((p,k)=>(near(p[0],fullBox[0],.01)||near(p[0],fullBox[2],.01))&&(near(p[1],fullBox[1],.01)||near(p[1],fullBox[3],.01))&&(near(p[0],points[(k+1)%4][0],.01)||near(p[1],points[(k+1)%4][1],.01)))&&new Set(points.map(p=>p.map(v=>Math.round(v*100)).join(':'))).size===4;
            if(pendingClip){if(rectangle)clipBox=intersect(fullBox,clipBox);pendingClip=false;}
            if(paint===OPS.endPath)continue;
            const fill=[OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke].includes(paint),stroke=[OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke].includes(paint);
            const closed=explicitClose||fill||points.length>1&&near(points[0][0],points.at(-1)[0],.05)&&near(points[0][1],points.at(-1)[1],.05);
            // Hancom PDF rounded boxes are often already flattened into many
            // straight vertices. Keep the actual single closed contour, fill,
            // stroke and paint order rather than only its four long sides.
            let moveCount=0;for(let k=0;k<path.length;){const code=path[k++];if(code===0){moveCount++;k+=2;}else if(code===1)k+=2;else if(code===2)k+=6;else if(code===3)k+=4;else if(code!==4)break;}
            const clipped=clipBox&&fullBox&&!(fullBox[0]>=clipBox[0]-.05&&fullBox[1]>=clipBox[1]-.05&&fullBox[2]<=clipBox[2]+.05&&fullBox[3]<=clipBox[3]+.05);
            if(straight&&!rectangle&&closed&&moveCount===1&&points.length>=5&&points.length<=1000&&fullBox&&fullBox[2]-fullBox[0]>20&&fullBox[3]-fullBox[1]>8&&!clipped&&(!fill||fillAlpha===1)&&(fill||stroke)){
                paths.push({kind:'closed-polygon',bbox:fullBox,points,fill:fill?pdfColor(fillColor):null,line:stroke?{color:strokeColor,widthPt:lineWidth*Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])),dash:[...dash],cap:['FLAT','ROUND','SQUARE'][lineCap]}:null,operator:i});continue;
            }
            let filledWidth;
            if(fill&&fullBox){const b=intersect(fullBox,clipBox);
                // A solid axis-aligned rectangle is evidence of a cell/page fill; curves and patterns are not.
                if(fillAlpha===1&&rectangle&&b[2]>b[0]&&b[3]>b[1])fills.push({bbox:b,color:fillColor,operator:i});
                if(fill&&!stroke)filledWidth=Math.min(b[2]-b[0],b[3]-b[1]);
                if(!stroke&&Math.min(b[2]-b[0],b[3]-b[1])>1.8)continue;}
            let current,start;
            for(let j=0;j<path.length;){const code=path[j++];if(code===0){current=[path[j++],path[j++]];start=current;}else if(code===1){const next=[path[j++],path[j++]];line(current,next,fill&&!stroke,filledWidth);current=next;}else if(code===4){line(current,start,fill&&!stroke,filledWidth);current=start;}else if(code===2){j+=6;current=null;}else if(code===3){j+=4;current=null;}else break;}
        }
        if(segments.length>12000||images.length>1000||paths.length>1000)throw new Error('PDF 쪽의 도형 수가 분석 한도를 넘습니다.');
    }
    const seen=new Set();return {images,fills,paths,textPaints,headerGlyphs,textGlyphs,segments:segments.filter(s=>{const key=[s.axis,...[s.at,s.start,s.end].map(v=>Math.round(v))].join(':');if(seen.has(key))return false;seen.add(key);return true;})};
}
// PDF.js may join several adjacent table cells into one text item. Split only
// against actual grid walls and complete matching painted glyphs, never by
// dividing a string/width or distributing numbers by column count.
function tableTextItems(items,boxes,glyphs,warnings,pageNumber){
    return items.flatMap(item=>{
        const y=item.baseline-item.size*.35,touched=boxes.filter(box=>y>box[1]&&y<box[3]&&Math.min(item.bbox[2],box[2])-Math.max(item.bbox[0],box[0])>1);
        if(touched.length<2)return [item];
        const observed=(glyphs||[]).filter(g=>near(g.baseline,item.baseline,.7)&&near(g.size,item.size,.3)&&g.bbox[0]>=item.bbox[0]-.5&&g.bbox[2]<=item.bbox[2]+.5).sort((a,b)=>a.x-b.x);
        if(!observed.length||compact(observed.map(g=>g.text).join(''))!==compact(item.text)){
            warnings.push(`PDF ${pageNumber}쪽: 여러 셀에 걸친 글자의 좌표를 확정하지 못했습니다. 셀 내용을 원문과 대조하세요.`);return [item];
        }
        return observed.map(g=>({...item,text:g.text,x:g.x,bbox:g.bbox,baseline:g.baseline}));
    });
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
        const horizontal=group.filter(s=>s.axis==='h'),vertical=group.filter(s=>s.axis==='v');
        // Tables often omit their outside vertical rules. Their long horizontal rules still bound the first/last columns.
        const outer=horizontal.length?[Math.min(...horizontal.map(s=>s.start)),Math.max(...horizontal.map(s=>s.end))]:[];
        const xs=coordinates([...vertical.map(s=>s.at),...outer]),ys=coordinates(horizontal.map(s=>s.at));
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
            const box=[xs[column],ys[row],xs[column+colSpan],ys[row+rowSpan]];
            cells.push({id:`pdf:p${pageNumber}:t${tables.length}:r${row}c${column}`,row,column,rowSpan,colSpan,bbox:box});
        }
        if(irregular){warnings.push(`PDF ${pageNumber}쪽의 불규칙 병합 표는 자동 복원하지 않았습니다.`);continue;}
        const cellItems=tableTextItems(within,cells.map(c=>c.bbox),graphics.textGlyphs,warnings,pageNumber);
        for(const cell of cells){
            const box=cell.bbox,contents=cellItems.filter(item=>inside(box,(item.bbox[0]+item.bbox[2])/2,item.baseline-item.size*.35,-.1));
            const colors=[...new Set(contents.map(i=>i.color))];
            const lines=pdfLines(contents);
            Object.assign(cell,{text:lines.map(l=>l.text).join('\n'),lines:lines.map(l=>({...l,align:pdfCellAppearance(box,[{bbox:l.bbox}],graphics,wall).align})),size:median(contents.map(item=>item.size)),fonts:[...new Set(contents.map(item=>item.font).filter(Boolean))],color:colors.length===1?colors[0]:undefined,...pdfCellAppearance(box,contents,graphics,wall)});
        }
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
        const lines=page.lines,bodySize=median(lines.map(l=>l.size));
        const contents=/^(?:차례|목차|표목차|그림목차)$/.test(compact(lines.slice(0,4).map(l=>l.text).join('')))||lines.filter(l=>/[.…]{4}/.test(l.text)).length>=3;
        const candidates=lines.filter(l=>/제\s*\d+\s*장/.test(l.text)&&l.text.length<130&&(l.size>=bodySize*1.1||lines.length<=6)&&!(pdfFurnitureRegion(l.bbox,{...page,tables:page.tables||[]},l.text)==='header'&&l.size<16));
        const heading=contents?null:candidates.find(l=>disciplineFromHeading(l.text)!=='unknown');
        if(heading){active=disciplineFromHeading(heading.text);chapter=heading.text;}
        const bodyCaption=lines.some(l=>/^[<〈[]?\s*(?:표|그림)\s*\d/.test(l.text)&&!pdfFurnitureRegion(l.bbox,{...page,tables:page.tables||[]},l.text));
        let kind=contents?'contents':!lines.length?(page.images.length||page.drawings>2?'scan':'blank'):lines.length<=6&&heading&&!bodyCaption?'divider':'body';
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
