// A TJ word gap and the inferred editable space represent the same advance.
// Deduct a measured original SFNT space with a matching raw TJ boundary. A
// known subset without that glyph uses one space with an explicit limitation.
// Unidentified fonts, explicit PDF spaces and other text matrices stay intact.
export function reconcilePdfWhitespace(items){
    const copies=items.map(item=>({...item}));let right=-Infinity,text='';
    for(let i=0;i+1<copies.length;i++){
        const a=copies[i],b=copies[i+1],e=a.trackingSource,next=b.trackingSource,sha=a.fontInfo?.embeddedStreamSha256,em=a.size*a.widthPercent/100;
        // A new text-show command may reset its origin. The preceding TJ is
        // then not the distance to that independently positioned next glyph.
        // Use only complete, same-font horizontal glyph evidence, never ink
        // estimates or a fitted width. Keep the raw operator values intact.
        if(!e?.supported||!Number.isInteger(e.operator)||!Number.isInteger(next?.operator)||e.operator===next.operator||!Number.isInteger(next.glyphIndex)||Array.from(a.text).length!==1||Array.from(b.text).length!==1||!/^[a-f0-9]{64}$/.test(sha||'')||sha!==b.fontInfo?.embeddedStreamSha256||a.font!==b.font||![a.size,b.size,a.widthPercent,b.widthPercent,a.baseline,b.baseline,em,...(a.bbox||[]),...(b.bbox||[])].every(Number.isFinite)||em<=0||Math.abs(a.size-b.size)>.001||Math.abs(a.widthPercent-b.widthPercent)>.001||Math.abs(a.baseline-b.baseline)>.05||Math.abs(a.bbox?.[1]-b.bbox?.[1])>.05||a.bbox?.length!==4||b.bbox?.length!==4||Math.abs(b.x-b.bbox[0])>.001)continue;
        const observed=(b.x-a.bbox[2])/em*100,raw=e.charSpace/e.fontSize*100-e.tjAdjustment/10;
        if(!Number.isFinite(observed)||observed< -50||observed>50||Math.abs(observed-raw)<.5)continue;
        const positionedBoundary={method:'independent-text-operator-origin',embeddedStreamSha256:sha,sourceBBox:[...a.bbox],followingBBox:[...b.bbox],horizontalEmPt:em,followingOperator:next.operator,followingGlyphIndex:next.glyphIndex};
        a.spacingPercent=Math.round(observed);a.trackingSource={...e,spacingPercent:a.spacingPercent,positionedBoundary};
    }
    for(let i=0;i<copies.length;i++){
        const item=copies[i],previous=copies[i-1],delta=item.x-right;
        const gap=text&&delta>Math.max(1.5,item.size*.2)&&!text.endsWith(' ')&&!item.text.startsWith(' ');
        if(gap&&previous&&delta<=Math.max(12,item.size*2)){
            const source=previous.trackingSource,metric=previous.fontInfo?.spaceAdvance,em=previous.size*previous.widthPercent/100;
            const raw=source?sourceTrackingPercent(source):NaN,percent=raw-(metric?.advanceUnits/metric?.unitsPerEm*100),rounded=Math.round(percent);
            if(source?.supported&&metric?.method==='original-sfnt-space-cmap-hmtx'&&metric.codePoint===32&&/^[a-f0-9]{64}$/.test(previous.fontInfo?.embeddedStreamSha256||'')&&previous.fontInfo.embeddedStreamSha256===item.fontInfo?.embeddedStreamSha256&&previous.font===item.font&&Math.abs(previous.size-item.size)<.001&&Number.isFinite(em)&&em>0&&Math.abs(previous.bbox[2]-right)<.001&&Math.abs(delta-raw*em/100)<.05&&Number.isInteger(metric.advanceUnits)&&metric.advanceUnits>0&&Number.isInteger(metric.unitsPerEm)&&metric.unitsPerEm>=16&&metric.advanceUnits<=metric.unitsPerEm&&rounded>=-50&&rounded<=50){
                const evidence={...metric,embeddedStreamSha256:previous.fontInfo.embeddedStreamSha256,sourceGapPt:delta,rawBoundaryGapPt:raw*em/100,followingOperator:item.trackingSource?.operator,followingGlyphIndex:item.trackingSource?.glyphIndex};
                previous.spacingPercent=rounded;previous.trackingSource={...source,spacingPercent:rounded,reconstructedWhitespace:evidence};item.inferredSpaceSource=evidence;
            }else if(source?.supported&&!metric&&/^[a-f0-9]{64}$/.test(previous.fontInfo?.embeddedStreamSha256||'')&&previous.fontInfo.embeddedStreamSha256===item.fontInfo?.embeddedStreamSha256&&previous.font===item.font&&Math.abs(previous.size-item.size)<.001&&Number.isFinite(em)&&em>0&&raw>0&&Math.abs(previous.bbox[2]-right)<.001&&Math.abs(delta-raw*em/100)<.05){
                // A source subset may omit its space glyph. Represent this
                // observed word gap once as an editable space, not as positive
                // glyph tracking PLUS a space. No missing font metric is guessed.
                const evidence={method:'source-word-gap-inferred-space-unmeasured',embeddedStreamSha256:previous.fontInfo.embeddedStreamSha256,sourceGapPt:delta,rawBoundaryGapPt:raw*em/100,horizontalEmPt:em};
                previous.spacingPercent=0;previous.trackingSource={...source,spacingPercent:0,representedAsSpace:evidence};item.inferredSpaceSource=evidence;
            }
        }
        text+=(gap?' ':'')+item.text;right=Math.max(right,item.bbox[2]);
    }
    return copies;
}

export function sourceTrackingPercent(e){
    let value=e.charSpace/e.fontSize*100-e.tjAdjustment/10;
    const p=e.positionedBoundary;
    if(p){
        if(p.method!=='independent-text-operator-origin'||!/^[a-f0-9]{64}$/.test(p.embeddedStreamSha256||'')||!Number.isInteger(e.operator)||!Number.isInteger(p.followingOperator)||e.operator===p.followingOperator||!Number.isInteger(p.followingGlyphIndex)||p.followingGlyphIndex<0||p.sourceBBox?.length!==4||p.followingBBox?.length!==4||![...p.sourceBBox,...p.followingBBox,p.horizontalEmPt].every(Number.isFinite)||p.horizontalEmPt<=0||Math.abs(p.sourceBBox[1]-p.followingBBox[1])>.051)throw new Error('PDF 독립 텍스트 명령의 원본 좌표 근거가 다릅니다.');
        value=(p.followingBBox[0]-p.sourceBBox[2])/p.horizontalEmPt*100;
        if(value< -50||value>50)throw new Error('PDF 독립 텍스트 명령의 원본 자간 범위를 확인하세요.');
    }
    const gap=e.representedAsSpace;
    if(gap){if(e.reconstructedWhitespace||gap.method!=='source-word-gap-inferred-space-unmeasured'||!/^[a-f0-9]{64}$/.test(gap.embeddedStreamSha256||'')||!Number.isFinite(gap.horizontalEmPt)||gap.horizontalEmPt<=0||value<=0||!Number.isFinite(gap.sourceGapPt)||Math.abs(gap.sourceGapPt-value*gap.horizontalEmPt/100)>=.05||Math.abs(gap.sourceGapPt-gap.rawBoundaryGapPt)>=.05)throw new Error('PDF 단어 간격의 원본 근거가 다릅니다.');return 0;}
    const s=e.reconstructedWhitespace;
    if(s){
        if(s.method!=='original-sfnt-space-cmap-hmtx'||s.codePoint!==32||!Number.isInteger(s.advanceUnits)||s.advanceUnits<=0||!Number.isInteger(s.unitsPerEm)||s.unitsPerEm<16||s.advanceUnits>s.unitsPerEm||!/^[a-f0-9]{64}$/.test(s.embeddedStreamSha256||'')||!Number.isFinite(s.sourceGapPt)||Math.abs(s.sourceGapPt-s.rawBoundaryGapPt)>=.05)throw new Error('PDF 공백 자폭의 원본 근거가 다릅니다.');
        value-=s.advanceUnits/s.unitsPerEm*100;
    }
    return value;
}
