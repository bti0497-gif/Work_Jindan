const inBox=(a,b)=>a[0]>=b[0]-2&&a[1]>=b[1]-2&&a[2]<=b[2]+2&&a[3]<=b[3]+2;
export const isPdfPageNumber=text=>/^\s*[-–—−]?\s*\d{1,5}\s*[-–—−]?\s*$/.test(text||'');
export function pdfFurnitureRegion(bbox,page,text){
    if(text!=null&&page.tables.some(t=>inBox(bbox,t.bbox)))return null;
    if(bbox[3]<Math.min(65,page.heightPt*.085))return 'header';
    if(bbox[1]>page.heightPt-45)return 'footer';
    // Printed numbers can sit above the last 45pt; exclude numeric table cells.
    if(bbox[1]>page.heightPt-90&&isPdfPageNumber(text)&&!page.tables.some(t=>inBox(bbox,t.bbox)))return 'footer';
    return null;
}
export function pdfFurniture(page){
    return ['header','footer'].map(kind=>{
        const tables=page.tables.filter(t=>pdfFurnitureRegion(t.bbox,page)===kind);
        const images=page.images.filter(i=>pdfFurnitureRegion(i.bbox,page)===kind);
        const lines=(page.ocr?.mergedLines||page.lines).filter(l=>pdfFurnitureRegion(l.bbox,page,l.text)===kind&&!tables.some(t=>inBox(l.bbox,t.bbox)));
        const shapeRegion=b=>b[3]<Math.min(75,page.heightPt*.1)?'header':b[1]>page.heightPt-85?'footer':null;
        const ruleBox=s=>s.axis==='h'?[s.start,s.at,s.end,s.at]:[s.at,s.start,s.at,s.end];
        const rules=(page.decorationLines||[]).filter(s=>shapeRegion(ruleBox(s))===kind&&!page.tables.some(t=>inBox(ruleBox(s),t.bbox)));
        const fills=(page.decorationFills||[]).filter(s=>shapeRegion(s.bbox)===kind&&!page.tables.some(t=>inBox(s.bbox,t.bbox)));
        const paths=(page.vectorPaths||[]).filter(s=>shapeRegion(s.bbox)===kind&&!page.tables.some(t=>inBox(s.bbox,t.bbox)));
        const textEffects=[];
        for(const foreground of lines)for(const background of lines){
            const dx=background.bbox[0]-foreground.bbox[0],dy=background.baseline-foreground.baseline;
            if(foreground.paintOrder>background.paintOrder&&foreground.color&&background.color&&foreground.color!==background.color&&foreground.text===background.text&&Math.abs(foreground.size-background.size)<.05&&Math.hypot(dx,dy)>.05&&Math.hypot(dx,dy)<8)textEffects.push({kind:'offset-text-layers',text:foreground.text,fonts:foreground.fonts,foregroundColor:foreground.color,backgroundColor:background.color,offsetXPt:dx,offsetYPt:dy,sourceBboxes:[foreground.bbox,background.bbox],inferred:true});
        }
        return {kind,applyPageType:page.number%2?'ODD':'EVEN',sourcePage:page.number,lines,tables,images,rules,fills,paths,textEffects,
            inferred:true,reviewRequired:true};
    });
}
export function pdfPrintedPageNumber(page){
    const line=(page.ocr?.mergedLines||page.lines).find(l=>pdfFurnitureRegion(l.bbox,page,l.text)==='footer'&&isPdfPageNumber(l.text));
    return line?Number(line.text.match(/\d+/)[0]):null;
}
export function inferPdfTypography(analysis,pages){
    const selected=analysis.pages.filter(p=>pages.includes(p.number)),sizes=new Map();
    for(const page of selected)for(const line of page.ocr?.mergedLines||page.lines)if(!pdfFurnitureRegion(line.bbox,page,line.text)&&line.size>=5&&line.size<=24){const size=Math.round(line.size*2)/2;sizes.set(size,(sizes.get(size)||0)+line.text.length);}
    const first=selected[0];if(!first)throw new Error('서식을 읽을 PDF 쪽을 선택하세요.');
    return {fontSizePt:[...sizes].sort((a,b)=>b[1]-a[1])[0]?.[0]||10,widthMm:Math.round(first.widthPt*25.4/72*10)/10,heightMm:Math.round(first.heightPt*25.4/72*10)/10,
        startPageNumber:pdfPrintedPageNumber(first)||1};
}
