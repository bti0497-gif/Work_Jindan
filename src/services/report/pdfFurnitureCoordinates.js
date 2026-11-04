import {indexHwpxSection} from './hwpxPackage.js';
import {pdfHwpxShape} from './pdfHwpxShapes.js';
import {pdfColor} from './pdfAppearance.js';

// Scoped to this generator's PDF PAPER-positioned furniture under native
// header/footer lists. Supervisor native03 supports these container origins;
// this is not a rewrite of imported HWPX or a universal Hancom-version rule.
export function localizePdfFurniture(xml,{sourceSha256,sourcePage,pageWidth,pageHeight,margins}){
    if(!/^[a-f0-9]{64}$/.test(sourceSha256||'')||!Number.isInteger(sourcePage)||sourcePage<1||![pageWidth,pageHeight,margins.left,margins.top,margins.bottom,margins.footer].every(Number.isInteger)||pageWidth<=0||pageHeight<=0)throw new Error('머리말·꼬리말의 원본 쪽과 여백 근거를 확인하세요.');
    const prefix='<root>',index=indexHwpxSection(prefix+xml+'</root>','generated-furniture'),changes=[],patches=[];
    for(const node of index.nodes.filter(n=>n.name==='hp:pos')){
        let area;for(let parent=node.parent;parent;parent=parent.parent)if(['hp:header','hp:footer'].includes(parent.name)){area=parent.name.slice(3);break;}
        if(!area||node.attrs.horzRelTo!=='PAPER'||node.attrs.vertRelTo!=='PAPER')continue;
        const x=Number(node.attrs.horzOffset),y=Number(node.attrs.vertOffset),origin={x:margins.left,y:area==='header'?margins.top:pageHeight-margins.bottom-margins.footer};
        if(![x,y,origin.x,origin.y].every(Number.isInteger))throw new Error('머리말·꼬리말 개체의 좌표를 확인하세요.');
        const start=node.start-prefix.length,end=node.end-prefix.length,before=xml.slice(start,end),after=before.replace(/\bhorzOffset="[^"]*"/,`horzOffset="${x-origin.x}"`).replace(/\bvertOffset="[^"]*"/,`vertOffset="${y-origin.y}"`);
        patches.push({start,end,text:after});changes.push({area,objectId:node.parent.attrs.id,sourcePaperOffset:{x,y},containerOrigin:origin,localOffset:{x:x-origin.x,y:y-origin.y}});
    }
    for(const patch of patches.sort((a,b)=>b.start-a.start))xml=xml.slice(0,patch.start)+patch.text+xml.slice(patch.end);
    return {xml,evidence:{method:'generated-pdf-header-top-footer-body-end/1',sourceSha256,sourcePage,pageHwpUnit:{width:pageWidth,height:pageHeight},marginsHwpUnit:{...margins},changes,nativeScope:'supervisor11 single-page03 supports origin; new full output pending',verified:false}};
}

// Prefer the existing native line with a stroke-height frame, as supported by
// supervisor14's exact footer02. The optional strip is a diagnostic control.
// Other areas, dashed, vertical, diagonal or unknown caps retain their old form.
export function pdfFurnitureRule(rule,area,id,{representation='native-stroke-envelope'}={}){
    if(!['native-stroke-envelope','editable-solid-stroke-footprint'].includes(representation))throw new Error('꼬리말 선 표현을 확인하세요.');
    const eligible=area==='footer'&&rule.axis==='h'&&rule.cap==='FLAT'&&!rule.dash?.length&&Number.isFinite(rule.widthPt)&&rule.widthPt>0&&rule.widthPt<=6&&!!pdfColor(rule.color);
    const strip=eligible&&representation==='editable-solid-stroke-footprint';
    const bbox=strip?[rule.start,rule.at-rule.widthPt/2,rule.end,rule.at+rule.widthPt/2]:rule.axis==='h'?[rule.start,rule.at,rule.end,rule.at]:[rule.at,rule.start,rule.at,rule.end];
    let xml=pdfHwpxShape({id,bbox,...(strip?{fill:rule.color}:{line:rule}),zOrder:rule.operator||0});
    let strokeEnvelope;
    if(eligible&&!strip){
        const weight=Math.max(1,Math.round(rule.widthPt*100)),half=Math.round(weight/2),center=Math.round(rule.at*100);
        xml=xml.replace(/(<hp:(?:orgSz|curSz|sz)\b[^>]*\bheight=")0("[^>]*>)/g,`$1${weight}$2`).replace(/(<hp:rotationInfo\b[^>]*\bcenterY=")0("[^>]*>)/,`$1${half}$2`).replace(/(<hc:(?:startPt|endPt)\b[^>]*\by=")0("[^>]*>)/g,`$1${half}$2`).replace(/\bvertOffset="[^"]*"/,`vertOffset="${center-half}"`);
        strokeEnvelope={height:weight,localCenterlineY:half,paperTop:center-half,paperCenterlineY:center};
    }
    return {xml,evidence:{objectId:String(id),area,representation:eligible?representation:'native-line',sourceRule:{...rule},sourcePaperBbox:bbox,...(strokeEnvelope?{strokeEnvelopeHwpUnit:strokeEnvelope}:{}),nativeScope:'supervisor14 exact single footer line only; new outputs require native review',nativeVerified:false}};
}

// Only the three external partitions around an aligned pair of actual source
// figure images qualify. Internal plot grids, tables and unknown caps stay as-is.
export function pdfGraphPartition(rule,images=[]){
    if(!['h','v'].includes(rule.axis)||rule.cap!=='FLAT'||rule.dash?.length||!pdfColor(rule.color)||!Number.isFinite(rule.widthPt)||rule.widthPt<=0||rule.widthPt>1)return null;
    const figures=images.filter(i=>i.kind==='figure'&&i.bbox?.length===4&&i.bbox.every(Number.isFinite)&&i.bbox[2]-i.bbox[0]>50&&i.bbox[3]-i.bbox[1]>40);
    for(const left of figures)for(const right of figures){
        const a=left.bbox,b=right.bbox,gap=b[0]-a[2];if(a[0]>=b[0]||gap<-.5||gap>25||Math.abs(a[1]-b[1])>3||Math.abs(a[3]-b[3])>3)continue;
        const bounds=[a[0],Math.min(a[1],b[1]),b[2],Math.max(a[3],b[3])];
        const outerTop=v=>v<=bounds[1]+1&&v>=bounds[1]-10,outerBottom=v=>v>=bounds[3]-1&&v<=bounds[3]+10;
        const match=rule.axis==='h'?rule.start<=bounds[0]+1&&rule.start>=bounds[0]-10&&rule.end>=bounds[2]-1&&rule.end<=bounds[2]+10&&(outerTop(rule.at)||outerBottom(rule.at)):rule.at>=a[2]-2&&rule.at<=b[0]+2&&outerTop(rule.start)&&outerBottom(rule.end);
        if(match)return {sourceImageIds:[left.id,right.id],sourceImageBboxes:[a,b],sourceRule:{...rule}};
    }
    return null;
}
export function pdfGraphPartitionShape(rule,id,evidence){
    const bbox=rule.axis==='h'?[rule.start,rule.at,rule.end,rule.at]:[rule.at,rule.start,rule.at,rule.end];
    if(!evidence||JSON.stringify(evidence.sourceRule)!==JSON.stringify(rule))throw new Error('그래프 구획선의 원본 그림/좌표 근거를 확인하세요.');
    let xml=pdfHwpxShape({id,bbox,line:rule,zOrder:rule.operator||0});
    const dim=rule.axis==='h'?'height':'width',axis=rule.axis==='h'?'y':'x',centerAxis=rule.axis==='h'?'centerY':'centerX',offset=rule.axis==='h'?'vertOffset':'horzOffset',weight=Math.max(1,Math.round(rule.widthPt*100)),half=Math.round(weight/2),center=Math.round(rule.at*100);
    xml=xml.replace(new RegExp(`(<hp:(?:orgSz|curSz|sz)\\b[^>]*\\b${dim}=")0("[^>]*>)`,'g'),`$1${weight}$2`).replace(new RegExp(`(<hp:rotationInfo\\b[^>]*\\b${centerAxis}=")0("[^>]*>)`),`$1${half}$2`).replace(new RegExp(`(<hc:(?:startPt|endPt)\\b[^>]*\\b${axis}=")0("[^>]*>)`,'g'),`$1${half}$2`).replace(new RegExp(`\\b${offset}="[^"]*"`),`${offset}="${center-half}"`);
    return {xml,evidence:{...evidence,objectId:String(id),method:'source-graph-partition-native-stroke-envelope/1',frameHwpUnit:weight,localCenterline:half,paperTopOrLeft:center-half,nativeVerified:false}};
}
