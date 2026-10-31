export function specificationFromProfile(profile) {
    const page=profile?.sections?.[0],font=profile?.typography?.[0]?.value;
    return { sourceSha256:profile?.source?.sha256 || '', section:page?.section || '', widthMm:page?.widthMm ?? 210,heightMm:page?.heightMm ?? 297,
        margins:{left:page?.marginsMm?.left ?? 20,right:page?.marginsMm?.right ?? 20,top:page?.marginsMm?.top ?? 20,bottom:page?.marginsMm?.bottom ?? 20},
        fontFamily:font?.font || '바탕',fontSizePt:font?.sizePt || 11,header:profile?.headers?.[0]?.text || '',footer:profile?.footers?.[0]?.text || '',
        headerVisible:!!profile?.headers?.length,footerVisible:!!profile?.footers?.length,chapterTitleVisible:!!profile?.chapters?.length,
        pageNumberVisible:!!profile?.pageNumbers?.length,pageNumberFormat:profile?.pageNumbers?.[0]?.formatType || 'DIGIT',
        origin:page?'source':'preview-defaults',chapterStartsOdd:true,blankPageFurniture:false };
}
export function validateSpecification(spec) {
    if(!spec||!/^[a-f0-9]{64}$/.test(spec.sourceSha256||''))throw new Error('보고서 원본과 서식 연결을 확인하세요.');
    for(const name of ['widthMm','heightMm'])if(!Number.isFinite(spec[name])||spec[name]<50||spec[name]>1200)throw new Error('용지 크기는 50~1200mm로 입력하세요.');
    for(const name of ['left','right','top','bottom'])if(!Number.isFinite(spec.margins?.[name])||spec.margins[name]<0||spec.margins[name]>300)throw new Error('여백은 0~300mm로 입력하세요.');
    if(spec.margins.left+spec.margins.right>=spec.widthMm||spec.margins.top+spec.margins.bottom>=spec.heightMm)throw new Error('여백이 용지 크기보다 큽니다.');
    if(typeof spec.fontFamily!=='string'||!spec.fontFamily.trim()||spec.fontFamily.length>150||!Number.isFinite(spec.fontSizePt)||spec.fontSizePt<5||spec.fontSizePt>72)throw new Error('글꼴과 크기(5~72pt)를 확인하세요.');
    for(const name of ['header','footer'])if(typeof spec[name]!=='string'||spec[name].length>4000)throw new Error('머리말·바닥글은 4,000자 이하로 입력하세요.');
    return {...spec,chapterStartsOdd:true,blankPageFurniture:false};
}
