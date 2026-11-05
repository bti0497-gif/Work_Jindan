// Exact whole-table source matches alone may supplement PDF cell estimates.
// Mixed runs and native paragraph boundaries remain independently editable.
const canonical=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
export function nativeCellTextFormat(cell,document,profile){
    const paragraphs=cell.paragraphIds.map(id=>document.paragraphs.find(p=>p.id===id));
    if(!paragraphs.length||paragraphs.length>30||paragraphs.some(p=>!p||p.tableId==null||!p.textSlots.length||p.textSlots.some(s=>!s.plain||!s.textOnly)||p.textSlots.map(s=>s.text).join('').trim()!==p.text))return null;
    const result=paragraphs.map(p=>({referenceParagraphId:p.id,text:p.text,style:profile.paragraphStyles[p.paragraphShapeId],runs:p.textSlots.map(s=>({text:s.text,typography:profile.characterStyles[s.charShapeId]}))}));
    if(result.some(p=>!p.style?.paragraphAlign||p.runs.some(r=>!r.typography?.reconstructionSupported||/확인 필요/.test(r.typography.font))))return null;
    return {text:cell.text,paragraphs:result};
}
export function learnCellTextFormat(pdfCell,source){
    const format=source.textFormat;
    if(!format||canonical(pdfCell.text)!==canonical(format.text))return null;
    const aligns=new Set(format.paragraphs.map(p=>p.style.paragraphAlign)),align=aligns.size===1&&[...aligns][0]!==pdfCell.align?[...aligns][0]:null;
    // Repeated spaces in a uniquely matched native header are meaningful
    // character gaps, even when the PDF extractor collapsed them to one space.
    const headerGaps=pdfCell.row===0&&format.paragraphs.length===1&&format.paragraphs[0].style.paragraphAlign==='CENTER'&&/\S {2,}\S/.test(format.paragraphs[0].runs.map(r=>r.text).join(''))&&!/[\r\n\t]/.test(format.paragraphs[0].runs.map(r=>r.text).join(''))&&format.paragraphs[0].text!==pdfCell.text;
    const complex=headerGaps||format.paragraphs.length>1||format.paragraphs.some(p=>new Set(p.runs.map(r=>JSON.stringify(r.typography))).size>1);
    const compatible=format.paragraphs.every(p=>p.runs.every(r=>Math.abs(r.typography.sizePt-(pdfCell.size||r.typography.sizePt))<.4&&(!pdfCell.fonts?.length||pdfCell.fonts.includes(r.typography.font))));
    return align||complex&&compatible?{align,paragraphs:complex&&compatible?format.paragraphs:null}:null;
}
export function verifiedCellTextFormat(cell,plan){
    const s=cell.pairedMarginSource,format=cell.pairedTextFormat;
    if(plan.mode!=='reference'||!s||!format||JSON.stringify(format)!==JSON.stringify(s.textFormat)||s.pdfCellId!==cell.id||s.expectedText!==cell.text||['row','column','rowSpan','colSpan'].some(k=>s[k]!==cell[k])||s.pdfSourceSha256!==plan.source.sha256||s.referenceSha256!==plan.pairedReference?.referenceSha256||s.referenceTableId==null||s.referenceCellId==null)return null;
    if(format.paragraphs&&canonical(format.paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n'))!==canonical(cell.text))return null;
    return format;
}
