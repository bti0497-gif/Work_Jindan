import {pdfColor} from './pdfAppearance.js';
const hu=n=>Math.round(n*100);
const matrix='<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';
export const paperPosition=(x,y)=>`<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${hu(y)}" horzOffset="${hu(x)}"/>`;
export function pdfHwpxShape({id,bbox,fill,line,points,text='',zOrder=0,strokeEnvelope=false}){
    let [x,y,right,bottom]=bbox,w=hu(right-x),h=hu(bottom-y),lineX=0,lineY=0,endX=w,endY=h;
    if(!bbox.every(Number.isFinite)||w<0||h<0)throw new Error('복원 도형의 좌표를 확인하세요.');
    // Native Hancom can clip a stroked line whose frame has zero area. Keep
    // its exact source centreline while giving the stroke a physical envelope.
    if(strokeEnvelope&&['FLAT','ROUND','SQUARE'].includes(line?.cap)&&Number.isFinite(line.widthPt)&&line.widthPt>0&&line.widthPt<=6){const weight=Math.max(1,hu(line.widthPt)),half=Math.round(weight/2);if(h===0&&w>0){h=weight;lineY=endY=half;y-=half/100;if(line.cap!=='FLAT'){lineX=half;endX+=half;w+=weight;x-=half/100;}}else if(w===0&&h>0){w=weight;lineX=endX=half;x-=half/100;if(line.cap!=='FLAT'){lineY=half;endY+=half;h+=weight;y-=half/100;}}}
    const kind=points?'polygon':line?'line':'rect',color=pdfColor(line?.color)||'#000000';
    if(points&&(points.length<3||points.length>1000||points.some(p=>p.length!==2||!p.every(Number.isFinite))))throw new Error('복원 다각형의 원본 꼭짓점을 확인하세요.');
    const component=`<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(w/2)}" centerY="${Math.round(h/2)}" rotateimage="0"/><hp:renderingInfo>${matrix}</hp:renderingInfo>`;
    const appearance=`<hp:lineShape color="${color}" width="${line?Math.max(1,hu(line.widthPt||.34)):0}" style="${line?(line.dash?.length?'DASH':'SOLID'):'NONE'}" endCap="${['FLAT','ROUND','SQUARE'].includes(line?.cap)?line.cap:'FLAT'}" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="MEDIUM_MEDIUM" tailSz="MEDIUM_MEDIUM" outlineStyle="NORMAL" alpha="0"/>${pdfColor(fill)?`<hc:fillBrush><hc:winBrush faceColor="${pdfColor(fill)}" hatchColor="#000000" alpha="0"/></hc:fillBrush>`:''}`;
    const drawText=text?`<hp:drawText lastWidth="${w}" name="" editable="0"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="${w}" textHeight="${h}" hasTextRef="0" hasNumRef="0">${text}</hp:subList><hp:textMargin left="0" right="0" top="0" bottom="0"/></hp:drawText>`:'';
    const geometry=points?points.map(p=>`<hc:pt x="${hu(p[0]-x)}" y="${hu(p[1]-y)}"/>`).join(''):line?`<hc:startPt x="${lineX}" y="${lineY}"/><hc:endPt x="${endX}" y="${endY}"/>`:`<hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/>`;
    // Hancom-authored shapes place component/appearance/text/geometry before the outer size and position.
    return `<hp:${kind} id="${id}" zOrder="${zOrder}" numberingType="PICTURE" textWrap="${text?'IN_FRONT_OF_TEXT':'BEHIND_TEXT'}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" ${kind==='line'?'isReverseHV="0"':kind==='rect'?'ratio="0"':''}>${component}${appearance}${drawText}<hp:shadow type="NONE" color="#000000" offsetX="0" offsetY="0" alpha="0"/>${geometry}<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>${paperPosition(x,y)}<hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:${kind}>`;
}
