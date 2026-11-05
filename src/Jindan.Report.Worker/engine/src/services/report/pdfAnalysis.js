import {buildPdfAnalysis,pdfTextItems,pdfLines,pdfGraphics,recoverPdfTables} from './pdfStructure.js';
import {pdfEmbeddedFontFamily} from './pdfFonts.js';
import {originalPdfFonts} from './pdfOriginalFonts.js';

export async function analyzePdfReport(input,filename,projectId,{materialId='',onProgress=()=>{},workerSrc,runtimeBase,signal}={}) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(bytes.length<8||bytes.length>160*1024*1024||!new TextDecoder().decode(bytes.subarray(0,8)).startsWith('%PDF-'))throw new Error('160MB 이하의 PDF 원본을 선택하세요.');
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const {getDocument,GlobalWorkerOptions,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    if(workerSrc)GlobalWorkerOptions.workerSrc=workerSrc;
    const task=getDocument({data:bytes.slice(),isEvalSupported:false,disableFontFace:true,fontExtraProperties:true,useSystemFonts:true,useWorkerFetch:false,disableAutoFetch:true,enableXfa:false,stopAtErrors:false,...(runtimeBase?{cMapUrl:runtimeBase+'pdf/cmaps/',cMapPacked:true,standardFontDataUrl:runtimeBase+'pdf/standard_fonts/',wasmUrl:runtimeBase+'pdf/wasm/'}:{})});
    const cancel=()=>task.destroy();signal?.addEventListener('abort',cancel,{once:true});
    const pages=[],readOriginalFont=originalPdfFonts(bytes);
    try{
        const doc=await task.promise;
        if(signal?.aborted)throw new Error('PDF 분석을 취소했습니다.');
        if(doc.numPages>1000)throw new Error('PDF는 한 번에 1,000쪽 이하로 분석하세요.');
        let totalItems=0;
        for(let number=1;number<=doc.numPages;number++){
            if(signal?.aborted)throw new Error('PDF 분석을 취소했습니다.');
            onProgress({page:number,total:doc.numPages});const page=await doc.getPage(number),viewport=page.getViewport({scale:1});
            if(Math.max(viewport.width,viewport.height)>4000)throw new Error('너무 큰 PDF 용지는 별도 파일로 분리하세요.');
            const content=await page.getTextContent(),operators=await page.getOperatorList();
            totalItems+=content.items.length;if(totalItems>500000||operators.fnArray.length>500000)throw new Error('PDF 내용이 분석 한도를 넘습니다.');
            // PDF.js fontFamily is often only "serif". Retain the PDF face name.
            const fontEvidence=[];
            for(const name of Object.keys(content.styles||{}))try{const font=page.commonObjs.get(name),info=await readOriginalFont(number,font?.name).catch(()=>null);content.styles[name].sourceFont=info?.family||pdfEmbeddedFontFamily(font?.data)||font?.name||'';content.styles[name].sourceInfo=info; if(info)fontEvidence.push({fontId:name,...info});}catch{/* Keep unresolved font IDs as evidence. */}
            const graphics=pdfGraphics(operators,OPS,viewport),items=pdfTextItems(content,viewport,graphics.textPaints,graphics.headerGlyphs,graphics.textGlyphs),lines=pdfLines(items,{splitGaps:true}),recovered=recoverPdfTables(items,graphics,number);
            for(const table of recovered.tables)for(const cell of table.cells)cell.geometrySource={pdfSourceSha256:sha256,page:number,tableId:table.id,cellId:cell.id,expectedText:cell.text,lineSignature:JSON.stringify(cell.lines),bbox:[...cell.bbox],row:cell.row,column:cell.column,rowSpan:cell.rowSpan,colSpan:cell.colSpan};
            const warnings=[...recovered.warnings];
            if(graphics.textGlyphs.some(g=>g.trackingSource&&!g.trackingSource.supported))warnings.push(`PDF ${number}쪽: 일부 글자 자간/합자 경계가 지원 범위와 달라 원문 조판 검토가 필요합니다.`);
            if(lines.some(l=>l.runs?.some(r=>r.trackingSources?.some(e=>e.representedAsSpace))))warnings.push(`PDF ${number}쪽: 원본 부분 글꼴의 공백 자폭이 없어 단어 간격을 공백 1개로 복원했습니다. 정확한 폭은 한글에서 원문과 대조하세요.`);
            if(items.geometryEvidence?.unresolvedRows)warnings.push(`PDF ${number}쪽: ${items.geometryEvidence.unresolvedRows}개 줄은 글자 좌표의 전체 대응을 확정하지 못해 순서를 변경하지 않았습니다. 원문 대조가 필요합니다.`);
            if(items.some(item=>item.vertical))warnings.push('세로쓰기 텍스트가 포함돼 읽기 순서를 확인해야 합니다.');
            if(lines.some(line=>/\uFFFD/.test(line.text)))warnings.push('해독하지 못한 글자가 있습니다. 원문과 대조하세요.');
            pages.push({number,widthPt:viewport.width,heightPt:viewport.height,rotation:page.rotate,lines,tables:recovered.tables,textGeometryEvidence:items.geometryEvidence,fontEvidence,images:graphics.images.map((image,i)=>({...image,id:`pdf:p${number}:image${i}`})),decorationLines:graphics.segments,decorationFills:graphics.fills,vectorPaths:graphics.paths,drawings:operators.fnArray.filter(op=>op===OPS.constructPath).length,warnings});
            page.cleanup();
        }
        return buildPdfAnalysis(pages,{sha256,filename,materialId,format:'pdf',size:bytes.length},projectId);
    }finally{signal?.removeEventListener('abort',cancel);await task.destroy();}
}
