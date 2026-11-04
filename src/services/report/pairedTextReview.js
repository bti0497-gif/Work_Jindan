const compact=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
// Deliberate source comparison, not OCR or guessed content. Positions remain review evidence.
export function applyPairedTextReview(pdf,document,profile,material,review){
    if(review?.schema!=='jindan-paired-text-review/1'||review.pdfSha256!==pdf?.source?.sha256||review.hwpxSha256!==document?.source?.sha256||material?.sha256!==document.source.sha256||profile?.source?.sha256!==material.sha256||!Array.isArray(review.items)||review.items.length>1000)throw new Error('보완 문안의 PDF·원본 HWPX 해시와 검토 파일 형식을 확인하세요.');
    const base={...pdf,pages:pdf.pages.map(p=>({...p,lines:p.lines.filter(l=>!l.manualReference)}))},items=[],seen=new Set();
    for(const item of review.items){
        const page=base.pages.find(p=>p.number===item.page),p=document.paragraphs.find(p=>p.id===item.referenceParagraphId&&!p.tableId&&(!p.area||p.area==='body')),text=p?.textSlots.map(s=>s.text).join('').trim(),bbox=item.bbox;
        if(!page||!p||!text||text.length>4000||compact(item.text)!==compact(text)||item.confirmed!==true||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>2000||!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]<0||bbox[1]<0||bbox[2]>page.widthPt||bbox[3]>page.heightPt||bbox[2]<=bbox[0]||bbox[3]<=bbox[1])throw new Error('보완할 원본 문단·문구·쪽·위치와 대조 확인 근거를 확인하세요.');
        const key=`${page.number}:${p.id}`;if(seen.has(key))throw new Error('같은 쪽의 보완 문단이 중복되었습니다.');seen.add(key);
        const styles=p.textSlots.filter(s=>s.text.trim()).map(s=>profile.characterStyles?.[s.charShapeId]),style=styles[0];if(!style||styles.some(s=>!s||s.reconstructionSupported===false||JSON.stringify(s)!==JSON.stringify(style)))throw new Error('보완 문단의 혼합 글자 서식은 자동으로 합치지 않습니다. 구간별 복원이 필요합니다.');
        if(page.lines.some(l=>compact(l.text)===compact(text)&&l.bbox[0]<bbox[2]&&l.bbox[2]>bbox[0]&&l.bbox[1]<bbox[3]&&l.bbox[3]>bbox[1]))throw new Error('이 위치에는 같은 문장이 이미 추출되어 있습니다. 중복 보완을 하지 않습니다.');
        const baseline=item.baseline??bbox[3]-style.sizePt*.15;if(!Number.isFinite(baseline)||baseline<bbox[1]||baseline>bbox[3])throw new Error('보완 문안의 기준선을 확인하세요.');
        const appearance=item.appearanceOverride;
        if(appearance!=null&&(typeof appearance!=='object'||Array.isArray(appearance)||Object.keys(appearance).length!==1||typeof appearance.bold!=='boolean'||typeof item.appearanceReason!=='string'||!item.appearanceReason.trim()||item.appearanceReason.length>2000))throw new Error('PDF 표시 차이의 굵게 여부와 별도 대조 근거를 확인하세요.');
        const record={page:page.number,referenceParagraphId:p.id,text,bbox:[...bbox],baseline,reason:item.reason,confirmed:true,reviewer:typeof item.reviewer==='string'?item.reviewer.slice(0,200):'local-source-comparison',...(appearance?{appearanceOverride:{...appearance},appearanceReason:item.appearanceReason,referenceBold:style.bold}:{})};items.push(record);
        page.lines.push({text,bbox:[...bbox],baseline,size:style.sizePt,fonts:[style.font],color:style.color||'#000000',bold:appearance?.bold??style.bold,paintOrder:100000,vertical:false,manualReference:{referenceParagraphId:p.id,referenceSha256:material.sha256,reason:item.reason,...(appearance?{appearanceOverride:{...appearance},appearanceReason:item.appearanceReason,referenceBold:style.bold}:{})}});
    }
    return {...base,pairedTextReviews:{schema:review.schema,pdfSha256:pdf.source.sha256,hwpxSha256:material.sha256,referenceMaterialId:material.id,items,appliedAt:new Date().toISOString()},status:'review-required'};
}
