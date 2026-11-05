const key=s=>[...String(s).normalize('NFKC').replace(/\s/g,'')].sort().join('');
const near=(a,b)=>Math.abs(a.baseline-b.baseline)<=Math.max(1.2,Math.min(a.size||10,b.size||10)*.18);
// Replace only a complete, horizontal LTR source row, with exactly the same
// character multiplicities. Glyph positions may interleave inside PDF.js items.
export function observedPdfItems(items,glyphs,styles){
    const rows=[];for(const item of items.filter(i=>i.bbox[3]>=75&&!i.vertical).sort((a,b)=>a.baseline-b.baseline||a.x-b.x)){let row=rows.at(-1);if(!row||!near(row,item)){row={baseline:item.baseline,size:item.size,items:[]};rows.push(row);}row.items.push(item);}
    const replaced=new Set(),result=[],evidence={matchedRows:0,unresolvedRows:0,unresolved:[],identicalOverprints:[]};
    for(const row of rows){
        if(row.items.some(i=>i.dir==='rtl'))continue;
        const left=Math.min(...row.items.map(i=>i.bbox[0])),right=Math.max(...row.items.map(i=>i.bbox[2]));
        let candidates=glyphs.filter(g=>g.bbox[3]>=75&&Math.abs(g.baseline-row.baseline)<=Math.max(1.2,Math.min(g.size,row.size)*.18)&&g.x>=left-.5&&g.bbox[2]<=right+.5);
        // Collapse coincident equal-ink glyphs only if the full distinct row
        // then matches the original text items. Genuine repeated characters,
        // shadows, different faces/scales or tracking are never removed.
        if(candidates.length&&candidates.every(g=>/^#[0-9a-f]{6}$/i.test(g.color||'')&&g.font&&Number.isInteger(g.paintOrder))&&key(candidates.map(g=>g.text).join(''))!==key(row.items.map(i=>i.text).join(''))){
            const groups=new Map();
            for(const g of candidates){const signature=JSON.stringify([g.text,g.x,g.baseline,g.size,g.widthPercent,g.bbox,g.font,g.color,g.spacingPercent,g.trackingSource?.charSpace,g.trackingSource?.tjAdjustment]),group=groups.get(signature)||[];group.push(g);groups.set(signature,group);}
            const distinct=[...groups.values()].map(group=>group[0]);
            if(distinct.length<candidates.length&&[...groups.values()].every(group=>new Set(group.map(g=>g.paintOrder)).size===group.length)&&key(distinct.map(g=>g.text).join(''))===key(row.items.map(i=>i.text).join(''))){
                evidence.identicalOverprints.push({baseline:row.baseline,sourceGlyphs:candidates.length,distinctGlyphs:distinct.length,duplicates:[...groups.values()].filter(g=>g.length>1).map(group=>({text:group[0].text,bbox:group[0].bbox,font:group[0].font,color:group[0].color,operators:group.map(g=>g.paintOrder)}))});candidates=distinct;
            }
        }
        if(!candidates.length||key(candidates.map(g=>g.text).join(''))!==key(row.items.map(i=>i.text).join(''))){evidence.unresolvedRows++;evidence.unresolved.push({baseline:row.baseline,sourceItems:row.items.map(i=>({text:i.text,bbox:i.bbox})),reason:'glyph multiplicities do not fully match source items; row not reordered'});continue;}
        evidence.matchedRows++;row.items.forEach(i=>replaced.add(i));
        result.push(...candidates.map(g=>({...g,font:styles[g.font]?.sourceFont||styles[g.font]?.fontFamily||g.font,fontInfo:styles[g.font]?.sourceInfo,ascent:styles[g.font]?.ascent,effectLayer:'body',dir:'ltr',glyphEvidence:true})));
    }
    return {items:[...items.filter(i=>!replaced.has(i)),...result],evidence};
}
