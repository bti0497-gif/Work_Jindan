import {buildPdfAnalysis,pdfTextItems,pdfLines,pdfGraphics,recoverPdfTables} from './pdfStructure.js';

export async function analyzePdfReport(input,filename,projectId,{materialId='',onProgress=()=>{},workerSrc,runtimeBase,signal}={}) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(bytes.length<8||bytes.length>160*1024*1024||!new TextDecoder().decode(bytes.subarray(0,8)).startsWith('%PDF-'))throw new Error('160MB 이하의 PDF 원본을 선택하세요.');
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const {getDocument,GlobalWorkerOptions,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    if(workerSrc)GlobalWorkerOptions.workerSrc=workerSrc;
    const task=getDocument({data:bytes.slice(),isEvalSupported:false,disableFontFace:true,useSystemFonts:true,useWorkerFetch:false,disableAutoFetch:true,enableXfa:false,stopAtErrors:false,...(runtimeBase?{cMapUrl:runtimeBase+'pdf/cmaps/',cMapPacked:true,standardFontDataUrl:runtimeBase+'pdf/standard_fonts/',wasmUrl:runtimeBase+'pdf/wasm/'}:{})});
    const cancel=()=>task.destroy();signal?.addEventListener('abort',cancel,{once:true});
    const pages=[];
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
            const items=pdfTextItems(content,viewport),lines=pdfLines(items),graphics=pdfGraphics(operators,OPS,viewport),recovered=recoverPdfTables(items,graphics,number);
            const warnings=[...recovered.warnings];
            if(items.some(item=>item.vertical))warnings.push('세로쓰기 텍스트가 포함돼 읽기 순서를 확인해야 합니다.');
            if(lines.some(line=>/\uFFFD/.test(line.text)))warnings.push('해독하지 못한 글자가 있습니다. 원문과 대조하세요.');
            pages.push({number,widthPt:viewport.width,heightPt:viewport.height,rotation:page.rotate,lines,tables:recovered.tables,images:graphics.images.map((image,i)=>({...image,id:`pdf:p${number}:image${i}`})),drawings:operators.fnArray.filter(op=>op===OPS.constructPath).length,warnings});
            page.cleanup();
        }
        return buildPdfAnalysis(pages,{sha256,filename,materialId,format:'pdf',size:bytes.length},projectId);
    }finally{signal?.removeEventListener('abort',cancel);await task.destroy();}
}
