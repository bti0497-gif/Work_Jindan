export function draftTextTarget(document,item){
    const target=item.target?.cellId?document.tables.find(t=>t.id===item.target.tableId)?.cells.find(c=>c.id===item.target.cellId):document.paragraphs.find(p=>p.id===item.target?.paragraphId&&(!p.area||p.area==='body')&&!p.tableId);
    if(!target?.textSlots?.length||target.textSlots.some(s=>!s.plain&&!s.textOnly))throw new Error('금회 반영 대상의 편집 가능한 글자 구간을 확인하세요.');
    const expected=item.textRuns,actualText=item.target?.cellId?target.text:target.textSlots.map(s=>s.text).join('');
    if(item.id!==target.id||!Array.isArray(expected)||expected.length!==target.textSlots.length||expected.some((s,i)=>s.slotId!==target.textSlots[i].id||s.text!==target.textSlots[i].text||s.charShapeId!==target.textSlots[i].charShapeId||s.paragraphIndex!==target.textSlots[i].paragraphIndex)||item.sourceText!==String(actualText||'').slice(0,3000))throw new Error('분석의 기대 원문·글자 구간과 실제 대상이 다릅니다. 원본을 다시 분석하세요.');
    return target;
}
