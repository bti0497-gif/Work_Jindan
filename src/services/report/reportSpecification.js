import {PARAGRAPH_FIELDS,PARAGRAPH_NUMBERS,PARAGRAPH_FLAGS} from './paragraphFormatting.js';
export function specificationFromProfile(profile,selectedPage=profile?.sections?.[0]) {
    const page=selectedPage,headers=(profile?.headers||[]).filter(v=>v.section===page?.section),footers=(profile?.footers||[]).filter(v=>v.section===page?.section),numbers=(profile?.pageNumbers||[]).filter(v=>v.section===page?.section),font=profile?.bodyTypography?.[0]?.value||profile?.typography?.[0]?.value,paragraph=profile?.bodyParagraphFormats?.[0]?.value||profile?.paragraphFormats?.[0]?.value;
    return { sourceSha256:profile?.source?.sha256 || '', section:page?.section || '', widthMm:page?.widthMm ?? 210,heightMm:page?.heightMm ?? 297,
        margins:{left:page?.marginsMm?.left ?? 20,right:page?.marginsMm?.right ?? 20,top:page?.marginsMm?.top ?? 20,bottom:page?.marginsMm?.bottom ?? 20,header:page?.marginsMm?.header??10,footer:page?.marginsMm?.footer??10,gutter:page?.marginsMm?.gutter??0},
        ...Object.fromEntries(PARAGRAPH_FIELDS.filter(k=>paragraph?.[k]!=null).map(k=>[k,paragraph[k]])),
        fontFamily:font?.font || '바탕',fontSizePt:font?.sizePt || 11,header:headers[0]?.text || '',footer:footers[0]?.text || '',
        pagePropertyPosition:page?.position,widthPercent:font?.widthPercent??100,spacingPercent:font?.spacingPercent??0,lineSpacingPercent:paragraph?.lineSpacing?.type==='PERCENT'?Number(paragraph.lineSpacing.value):160,applyBodyStyle:false,includeTables:false,
        headerVisible:!!headers.length,footerVisible:!!footers.length,chapterTitleVisible:!!profile?.chapters?.length,
        pageNumberVisible:!!numbers.length,pageNumberFormat:numbers[0]?.formatType || 'DIGIT',pageNumberPosition:numbers.find(v=>v.pos)?.pos,
        origin:page?'source':'preview-defaults',chapterStartsOdd:true,blankPageFurniture:false };
}
export function validateSpecification(spec) {
    if(!spec||!/^[a-f0-9]{64}$/.test(spec.sourceSha256||''))throw new Error('보고서 원본과 서식 연결을 확인하세요.');
    for(const name of ['widthMm','heightMm'])if(!Number.isFinite(spec[name])||spec[name]<50||spec[name]>1200)throw new Error('용지 크기는 50~1200mm로 입력하세요.');
    for(const name of ['left','right','top','bottom'])if(!Number.isFinite(spec.margins?.[name])||spec.margins[name]<0||spec.margins[name]>300)throw new Error('여백은 0~300mm로 입력하세요.');
    if(spec.margins.left+spec.margins.right>=spec.widthMm||spec.margins.top+spec.margins.bottom>=spec.heightMm)throw new Error('여백이 용지 크기보다 큽니다.');
    if(typeof spec.fontFamily!=='string'||!spec.fontFamily.trim()||spec.fontFamily.length>150||!Number.isFinite(spec.fontSizePt)||spec.fontSizePt<5||spec.fontSizePt>72)throw new Error('글꼴과 크기(5~72pt)를 확인하세요.');
    for(const name of ['header','footer'])if(typeof spec[name]!=='string'||spec[name].length>4000)throw new Error('머리말·바닥글은 4,000자 이하로 입력하세요.');
    for(const [key,min,max] of [['widthPercent',50,200],['spacingPercent',-50,50],['lineSpacingPercent',50,400]])if(spec[key]!=null&&(!Number.isFinite(spec[key])||spec[key]<min||spec[key]>max))throw new Error('장평(50~200%), 자간(-50~50%), 줄간격(50~400%)을 확인하세요.');
    for(const [key,{min,max,label}]of Object.entries(PARAGRAPH_NUMBERS))if(spec[key]!=null&&(!Number.isFinite(spec[key])||spec[key]<min||spec[key]>max))throw new Error(`${label} 범위를 확인하세요.`);
    for(const key of Object.keys(PARAGRAPH_FLAGS))if(spec[key]!=null&&typeof spec[key]!=='boolean')throw new Error('문단 줄 나눔 설정을 확인하세요.');
    if(spec.paragraphAlign!=null&&!['','LEFT','RIGHT','CENTER','JUSTIFY','DISTRIBUTE','DISTRIBUTE_SPACE'].includes(spec.paragraphAlign))throw new Error('문단 정렬을 확인하세요.');
    for(const name of ['header','footer','gutter'])if(spec.margins[name]!=null&&(!Number.isFinite(spec.margins[name])||spec.margins[name]<0||spec.margins[name]>100))throw new Error('머리말·꼬리말·제본 여백을 확인하세요.');
    if(spec.pageNumberFormat&&!['DIGIT','ROMAN_CAPITAL','ROMAN_SMALL'].includes(spec.pageNumberFormat))throw new Error('쪽 번호 형식을 확인하세요.');
    if(spec.pageNumberPosition&&!['TOP_LEFT','TOP_CENTER','TOP_RIGHT','BOTTOM_LEFT','BOTTOM_CENTER','BOTTOM_RIGHT','OUTSIDE_TOP','OUTSIDE_BOTTOM','INSIDE_TOP','INSIDE_BOTTOM'].includes(spec.pageNumberPosition))throw new Error('쪽 번호 위치를 확인하세요.');
    for(const key of ['furnitureEdits','furnitureAlignments','objectPositions'])if(spec[key]!=null&&(!spec[key]||Array.isArray(spec[key])||typeof spec[key]!=='object'||Object.keys(spec[key]).length>2000))throw new Error('복원 개체 편집 목록을 확인하세요.');
    for(const value of Object.values(spec.furnitureEdits||{}))if(typeof value!=='string'||value.length>4000)throw new Error('머리말·꼬리말 편집은 구간마다 4,000자 이하로 입력하세요.');
    for(const value of Object.values(spec.furnitureAlignments||{}))if(!['','LEFT','CENTER','RIGHT','JUSTIFY'].includes(value))throw new Error('머리말·꼬리말 정렬을 확인하세요.');
    if(spec.pictureReplacements!=null&&(!Array.isArray(spec.pictureReplacements)||spec.pictureReplacements.length>30||spec.pictureReplacements.some(r=>!r||typeof r.objectId!=='string'||typeof r.materialId!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256||''))))throw new Error('그림 교체 목록과 원본 연결을 확인하세요.');
    if(spec.roleStyles!=null){if(typeof spec.roleStyles!=='object'||Array.isArray(spec.roleStyles)||Object.keys(spec.roleStyles).some(key=>!['chapterTitle','subheading','body','tableCaption','tableBody'].includes(key)))throw new Error('역할별 글자 서식을 확인하세요.');for(const style of Object.values(spec.roleStyles)){if(!style||typeof style!=='object'||Array.isArray(style)||Object.keys(style).some(key=>!['fontFamily','fontSizePt','widthPercent','spacingPercent','lineSpacingPercent',...PARAGRAPH_FIELDS].includes(key)))throw new Error('역할별 서식 항목을 확인하세요.');validateSpecification({...spec,...style,roleStyles:undefined});}}
    if(spec.typographyScope!=null&&(!Array.isArray(spec.typographyScope)||!spec.typographyScope.length||spec.typographyScope.length>20000||spec.typographyScope.some(p=>!p||!/^Contents\/section\d+\.xml$/.test(p.section)||!Number.isInteger(p.index)||p.index<0)||new Set(spec.typographyScope.map(p=>`${p.section}:${p.index}`)).size!==spec.typographyScope.length))throw new Error('챕터의 원본 문단 범위를 확인하세요.');
    return {...spec,chapterStartsOdd:true,blankPageFurniture:false};
}
