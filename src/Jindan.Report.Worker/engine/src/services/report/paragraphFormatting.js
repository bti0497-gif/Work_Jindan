// HWPX paragraph margins use child elements, including the schema's "intent" spelling.
export const PARAGRAPH_NUMBERS={leftIndentMm:{label:'왼쪽 들여쓰기(mm)',tag:'left',min:0,max:300,scale:7200/25.4},rightIndentMm:{label:'오른쪽 들여쓰기(mm)',tag:'right',min:0,max:300,scale:7200/25.4},firstLineIndentMm:{label:'첫 줄 들여쓰기·내어쓰기(mm)',tag:'intent',min:-300,max:300,scale:7200/25.4},spaceBeforePt:{label:'문단 위 간격(pt)',tag:'prev',min:0,max:300,scale:100},spaceAfterPt:{label:'문단 아래 간격(pt)',tag:'next',min:0,max:300,scale:100}};
export const PARAGRAPH_FLAGS={keepWithNext:'다음 문단과 함께',keepLines:'문단을 한 쪽에 유지',widowOrphan:'외톨이줄 보호'};
export const PARAGRAPH_FIELDS=[...Object.keys(PARAGRAPH_NUMBERS),...Object.keys(PARAGRAPH_FLAGS),'paragraphAlign'];
export const hasParagraphChanges=style=>style&&(['lineSpacingPercent',...PARAGRAPH_FIELDS].some(k=>style[k]!=null));
export function paragraphStyleValues(shape,find){
    if(!shape)return {};
    const fallback=shape.switch?.default||shape,margin=find(fallback,'margin')[0]||{},spacing=find(fallback,'lineSpacing')[0],breaking=shape.breakSetting||{},result={};
    for(const [key,{tag,scale}]of Object.entries(PARAGRAPH_NUMBERS)){const item=margin[tag];if(item?.unit==='HWPUNIT'&&Number.isFinite(Number(item.value)))result[key]=Math.round(Number(item.value)/scale*10000)/10000;}
    for(const key of Object.keys(PARAGRAPH_FLAGS))if(['0','1'].includes(String(breaking[key])))result[key]=String(breaking[key])==='1';
    const cases=shape.switch?.case,branches=[...(cases?(Array.isArray(cases)?cases:[cases]).map(c=>({type:'case',requiredNamespace:c['required-namespace'],margin:c.margin,spacing:c.lineSpacing})):[]),...(shape.switch?.default?[{type:'default',margin:shape.switch.default.margin,spacing:shape.switch.default.lineSpacing}]:[])];
    return {...result,paragraphAlign:shape.align?.horizontal||'',lineSpacing:spacing||null,breakSetting:breaking,rawMargins:margin,layoutBranches:branches,autoSpacing:shape.autoSpacing||{},snapToGrid:shape.snapToGrid,...(shape.condense!=null?{condense:shape.condense}:{})};
}
