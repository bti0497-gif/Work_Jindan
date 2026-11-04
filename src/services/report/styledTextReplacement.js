// Change the smallest source text interval. Never guess a new distribution across different native styles.
export function planStyledTextReplacement(slots,value,{slotValues}={}){
    if(!Array.isArray(slots)||!slots.length||slots.some(s=>!s.plain&&!s.textOnly)||typeof value!=='string'||value.length>50000)throw new Error('교체할 원본 글자 구간과 새 문안을 확인하세요.');
    const make=(slot,text)=>({section:slot.section,slotId:slot.id,expectedText:slot.text,wholeText:true,value:text});
    if(slotValues){if(typeof slotValues!=='object'||Array.isArray(slotValues)||Object.keys(slotValues).length!==slots.length||slots.some(s=>typeof slotValues[s.id]!=='string'||slotValues[s.id].length>50000)||Object.keys(slotValues).some(id=>!slots.some(s=>s.id===id)))throw new Error('원본 서식 구간마다 반영할 문안을 지정하세요.');return slots.map(s=>make(s,slotValues[s.id]));}
    if(value==='')return slots.map(s=>make(s,''));
    const groups=[];for(const slot of slots){const key=`${slot.section}:${slot.paragraphIndex??0}`,last=groups.at(-1);if(last?.key===key)last.slots.push(slot);else groups.push({key,slots:[slot]});}
    if(groups.length>1){const lines=value.replace(/\r\n?/g,'\n').split('\n');if(lines.length!==groups.length)throw new Error('여러 문단의 서식을 보존하려면 문단 수에 맞춰 줄을 나누거나 구간별 문안을 지정하세요.');return groups.flatMap((g,i)=>planStyledTextReplacement(g.slots,lines[i]));}
    const old=slots.map(s=>s.text).join('');if(old===value)return [];
    let first=0,last=0;while(first<Math.min(old.length,value.length)&&old[first]===value[first])first++;while(last<old.length-first&&last<value.length-first&&old[old.length-1-last]===value[value.length-1-last])last++;
    const oldEnd=old.length-last,newMiddle=value.slice(first,value.length-last),ranges=[];let offset=0;
    for(const slot of slots){ranges.push({slot,start:offset,end:offset+slot.text.length});offset+=slot.text.length;}
    let affected=ranges.filter(r=>r.end>first&&r.start<oldEnd);if(first===oldEnd)affected=[ranges.find(r=>r.start<=first&&r.end>=first)||ranges.at(-1)];
    if(!affected.length)affected=[ranges[0]];
    if(new Set(affected.map(r=>r.slot.charShapeId)).size>1)throw new Error('서로 다른 글자 서식에 걸친 변경입니다. 구간별 문안을 지정하거나 변경할 글자 구간을 좁혀 주세요.');
    return affected.map((r,i)=>make(r.slot,r.slot.text.slice(0,Math.max(0,first-r.start))+(i===0?newMiddle:'')+r.slot.text.slice(Math.max(0,Math.min(r.slot.text.length,oldEnd-r.start))))).filter(e=>e.value!==e.expectedText);
}
