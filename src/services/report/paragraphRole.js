// Shared by analysis, source learning and the native style writer.
export function paragraphRole(text,inCell=false){
    if(inCell)return 'tableBody';
    text=String(text||'').trimStart();
    if(/^제\s*\d+\s*장/.test(text))return 'chapterTitle';
    if(/^[<〈[]?\s*표\s*\d/.test(text))return 'tableCaption';
    if(/^(?:\d+(?:\.\d+){1,4}\.?\s|[가-힣]\s*[.)]\s)/.test(text))return 'subheading';
    return 'body';
}
