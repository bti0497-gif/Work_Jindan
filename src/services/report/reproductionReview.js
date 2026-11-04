export const REPRODUCTION_CHECKS={text:'글자 내용·잘림',fonts:'글꼴·글자 모양',paragraphs:'문단·들여쓰기·줄바꿈',tables:'표·병합·셀 서식',pictures:'그림·도형',furniture:'머리말·꼬리말·글맵시',pages:'용지·여백·쪽 나눔·쪽 번호'};
const hash=s=>/^[a-f0-9]{64}$/.test(s||'');
export function validateReproductionReview(review,sourceSha256){
    if(!review||!hash(sourceSha256)||review.sourceSha256!==sourceSha256||!review.items||Array.isArray(review.items)||typeof review.items!=='object'||Object.keys(review.items).some(k=>!Object.hasOwn(REPRODUCTION_CHECKS,k)))throw new Error('재현 검토의 원본과 항목을 확인하세요.');
    for(const item of Object.values(review.items))if(!item||!['pending','passed','needs-fix','not-applicable'].includes(item.status)||item.note!=null&&(typeof item.note!=='string'||item.note.length>2000))throw new Error('재현 검토의 상태와 메모를 확인하세요.');
    if(review.medium!=null&&!['native-preview','hancom'].includes(review.medium))throw new Error('재현 검토 방법을 확인하세요.');
    if(review.fileOpen!=null&&!['pending','opened','failed'].includes(review.fileOpen)||review.editSave!=null&&!['pending','saved','failed'].includes(review.editSave)||review.fileNote!=null&&(typeof review.fileNote!=='string'||review.fileNote.length>2000))throw new Error('한글 파일 열기·편집 저장 확인을 확인하세요.');
    return review;
}
export function reproductionStatus(review,sourceSha256){
    if(!review||review.sourceSha256!==sourceSha256)return {status:'pending',passed:0,total:7,hancomVerified:false};
    validateReproductionReview(review,sourceSha256);
    const items=Object.keys(REPRODUCTION_CHECKS).map(key=>review.items[key]?.status||'pending'),passed=items.filter(s=>['passed','not-applicable'].includes(s)).length;
    const fileFailed=review.medium==='hancom'&&(review.fileOpen==='failed'||review.editSave==='failed'),fileVerified=review.fileOpen==='opened'&&review.editSave==='saved',hasActualCheck=items.includes('passed');
    const hancomVerified=review.medium==='hancom'&&fileVerified&&hasActualCheck&&passed===items.length;
    return {status:items.includes('needs-fix')||fileFailed?'needs-fix':passed===items.length&&(review.medium!=='hancom'||hancomVerified)?'reviewed':'pending',passed,total:items.length,hancomVerified,fileFailed};
}
