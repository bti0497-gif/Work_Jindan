const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const attrs=values=>Object.entries(values).map(([k,v])=>`${k}="${escape(v)}"`).join(' ');
const tags=values=>['intent','left','right','prev','next'].map(k=>{const v=values?.[k];if(!v||v.unit!=='HWPUNIT'||!Number.isFinite(Number(v.value))||Math.abs(Number(v.value))>200000)throw new Error('원본 문단 여백 단위·범위를 확인하세요.');return `<hc:${k} value="${Number(v.value)}" unit="HWPUNIT"/>`;}).join('');
const spacing=v=>{if(!v||!['PERCENT','FIXED','AT_LEAST','BETWEEN_LINES'].includes(v.type)||!Number.isFinite(Number(v.value))||Number(v.value)<0||Number(v.value)>200000||v.unit!=='HWPUNIT')throw new Error('원본 문단 줄간격을 확인하세요.');return `<hh:lineSpacing type="${v.type}" value="${Number(v.value)}" unit="HWPUNIT"/>`;};
export function pairedParagraphStyle(base,id,style){
    const branches=style.layoutBranches?.length?style.layoutBranches:[{type:'default',margin:style.rawMargins,spacing:style.lineSpacing}];
    if(branches.length>8||branches.filter(b=>b.type==='default').length!==1||branches.some(b=>!['case','default'].includes(b.type)||b.type==='case'&&b.requiredNamespace!=='http://www.hancom.co.kr/hwpml/2016/HwpUnitChar'))throw new Error('지원하는 원본 문단 분기인지 확인하세요.');
    const layout='<hp:switch>'+branches.map(b=>`<hp:${b.type}${b.type==='case'?` hp:required-namespace="${escape(b.requiredNamespace)}"`:''}><hh:margin>${tags(b.margin)}</hh:margin>${spacing(b.spacing)}</hp:${b.type}>`).join('')+'</hp:switch>';
    if(!['LEFT','CENTER','RIGHT','JUSTIFY','DISTRIBUTE','DISTRIBUTE_SPACE'].includes(style.paragraphAlign))throw new Error('원본 문단 정렬을 확인하세요.');
    const breaking={};for(const k of ['breakLatinWord','breakNonLatinWord','widowOrphan','keepWithNext','keepLines','pageBreakBefore','lineWrap']){const v=style.breakSetting?.[k];if(v!=null){if(!/^(?:KEEP_WORD|BREAK_WORD|BREAK|SQUEEZE|0|1)$/.test(v))throw new Error('원본 문단 줄 나눔 설정을 확인하세요.');breaking[k]=v;}}
    let copy=base.replace('id="0"',`id="${id}"`).replace(/snapToGrid="[01]"/,`snapToGrid="${style.snapToGrid==='1'?'1':'0'}"`).replace(/<hh:align\b[^>]*\/>/,`<hh:align horizontal="${style.paragraphAlign}" vertical="BASELINE"/>`).replace(/<hp:switch>[\s\S]*?<\/hp:switch>/,layout);
    if(style.condense!=null){const value=Number(style.condense);if(!Number.isInteger(value)||value<0||value>100)throw new Error('원본 문단의 최소 공백을 확인하세요.');copy=copy.replace(/condense="\d+"/,`condense="${value}"`);}
    if(Object.keys(breaking).length)copy=copy.replace(/<hh:breakSetting\b[^>]*\/>/,`<hh:breakSetting ${attrs(breaking)}/>`);
    if(style.autoSpacing)copy=copy.replace(/<hh:autoSpacing\b[^>]*\/>/,`<hh:autoSpacing eAsianEng="${style.autoSpacing.eAsianEng==='1'?'1':'0'}" eAsianNum="${style.autoSpacing.eAsianNum==='1'?'1':'0'}"/>`);
    return copy;
}
