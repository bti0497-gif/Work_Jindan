import {pdfFontFamily} from './pdfFonts.js';
import {sourceTrackingPercent} from './pdfWhitespaceTracking.js';
export function verifiedPdfCellLines(cell,plan){
    const source=cell.geometrySource,lines=cell.lines;
    if(plan.mode!=='reference'||!source||source.pdfSourceSha256!==plan.source.sha256||source.cellId!==cell.id||source.expectedText!==cell.text||source.lineSignature!==JSON.stringify(lines)||['row','column','rowSpan','colSpan'].some(k=>source[k]!==cell[k])||JSON.stringify(source.bbox)!==JSON.stringify(cell.bbox)||!Array.isArray(lines)||!lines.length||lines.length>300||lines.map(l=>l.text).join('\n')!==cell.text)return null;
    const [left,top,right,bottom]=cell.bbox;
    if(![left,top,right,bottom].every(Number.isFinite)||lines.some((l,i)=>!l.bbox?.every(Number.isFinite)||!Number.isFinite(l.baseline)||!Number.isFinite(l.size)||l.size<5||l.size>72||l.bbox[0]<left-1||l.bbox[2]>right+1||l.bbox[1]<top-1||l.baseline>bottom+1||i>0&&l.baseline-lines[i-1].baseline<1||!l.runs?.length||l.runs.map(r=>r.text).join('').trim()!==l.text))return null;
    return {lines,padding:{left:0,right:0,top:Math.max(0,Math.round((lines[0].baseline-top-lines[0].size*.85)*100)),bottom:0}};
}
export function pdfRunTypography(run,fallback={}){
    const s=run.style||{},width=Number.isFinite(s.widthPercent)&&s.widthPercent>=50&&s.widthPercent<=200?s.widthPercent:100;
    let spacing=0;
    for(const e of run.trackingSources||[])if(e.positionedBoundary&&e.positionedBoundary.embeddedStreamSha256!==s.fontInfo?.embeddedStreamSha256)throw new Error('PDF 독립 텍스트 명령과 원본 글꼴 근거가 다릅니다.');
    for(const e of run.trackingSources||[]){const w=e.reconstructedWhitespace;if(w&&(w.embeddedStreamSha256!==s.fontInfo?.embeddedStreamSha256||w.advanceUnits!==s.fontInfo?.spaceAdvance?.advanceUnits||w.unitsPerEm!==s.fontInfo?.spaceAdvance?.unitsPerEm))throw new Error('PDF 공백 자폭과 사용 글꼴의 원본 근거가 다릅니다.');}
    for(const e of run.trackingSources||[]){const w=e.representedAsSpace;if(w&&(w.embeddedStreamSha256!==s.fontInfo?.embeddedStreamSha256||s.fontInfo?.spaceAdvance))throw new Error('PDF 단어 간격과 원본 글꼴 근거가 다릅니다.');}
    if(run.inferredSpaceSource){
        const e=run.inferredSpaceSource,m=s.fontInfo?.spaceAdvance;
        if(run.text!==' '||s.spacingPercent!==0||!/^[a-f0-9]{64}$/.test(e.embeddedStreamSha256||'')||e.embeddedStreamSha256!==s.fontInfo?.embeddedStreamSha256||!['original-sfnt-space-cmap-hmtx','source-word-gap-inferred-space-unmeasured'].includes(e.method)||!Number.isFinite(e.sourceGapPt)||e.sourceGapPt<=0||!Number.isFinite(e.rawBoundaryGapPt)||Math.abs(e.sourceGapPt-e.rawBoundaryGapPt)>=.05||run.bbox?.length!==4||!run.bbox.every(Number.isFinite)||Math.abs(run.bbox[2]-run.bbox[0]-e.sourceGapPt)>.001||e.method==='original-sfnt-space-cmap-hmtx'&&(e.advanceUnits!==m?.advanceUnits||e.unitsPerEm!==m?.unitsPerEm)||e.method==='source-word-gap-inferred-space-unmeasured'&&(m||!Number.isFinite(e.horizontalEmPt)||Math.abs(e.horizontalEmPt-s.size*width/100)>.001))throw new Error('PDF의 추정 공백과 원본 글꼴·좌표 근거가 다릅니다.');
    }
    if(run.trackingSources?.length&&s.spacingPercent!=null){
        const sources=run.trackingSources;
        if(!Number.isInteger(s.spacingPercent)||s.spacingPercent< -50||s.spacingPercent>50||sources.some(e=>!e.supported||!Number.isFinite(e.fontSize)||e.fontSize<=0||!Number.isFinite(e.charSpace)||!Number.isFinite(e.tjAdjustment)||!Number.isInteger(e.operator)||!Number.isInteger(e.glyphIndex)||e.spacingPercent!==s.spacingPercent||Math.round(sourceTrackingPercent(e))!==s.spacingPercent))throw new Error('PDF 원본 자간과 글자 구간 근거가 다릅니다.');
        spacing=s.spacingPercent;
    }
    const tabBeforePt=Number.isFinite(run.tabBeforePt)&&run.tabBeforePt>0&&run.tabBeforePt<2000?run.tabBeforePt:undefined;
    // A source-bound inferred word gap already accounts for the original
    // font's nominal space advance. Do not force the template's half-em
    // whitespace policy on that isolated editable space. Other text and
    // native-paired styles keep their original policy.
    return {text:tabBeforePt?run.text.replace(/^ /,''):run.text,tabBeforePt,typography:{font:pdfFontFamily(s.font)||fallback.font,sizePt:s.size||fallback.sizePt||10,widthPercent:Math.round(width*10000)/10000,spacingPercent:spacing,...(run.inferredSpaceSource?{useFontSpace:true}:{}),bold:fallback.bold??(/bold|heavy|black/i.test(s.font||'')),italic:false,color:s.color||fallback.color||'#000000'}};
}
