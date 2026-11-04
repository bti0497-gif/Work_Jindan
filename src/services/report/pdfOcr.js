import {MAX_PDF_IMAGE_PIXELS,MAX_HWPX_PNG_BYTES,MAX_PDF_PICTURES_BYTES} from './pdfImageLimits.js';
// OCR and original image extraction run locally. No document pixels are sent to a server.
const inside=(box,x,y,margin=0)=>x>=box[0]-margin&&x<=box[2]+margin&&y>=box[1]-margin&&y<=box[3]+margin;
const bundledFolder=folder=>new URL(`${folder}/`,new URL(import.meta.env?.BASE_URL||'./',document.baseURI)).href;
export const reportRuntimeBase=()=>bundledFolder('report-runtime');
export async function openPdfForRendering(bytes) {
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{default:workerUrl}=await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
    const root=reportRuntimeBase();
    return pdfjs.getDocument({data:new Uint8Array(bytes).slice(),isEvalSupported:false,useSystemFonts:true,enableXfa:false,cMapUrl:root+'pdf/cmaps/',cMapPacked:true,standardFontDataUrl:root+'pdf/standard_fonts/',wasmUrl:root+'pdf/wasm/'});
}
function validateSelection(analysis,numbers){
    if(analysis?.schema!=='jindan-pdf-analysis/1'||!Array.isArray(numbers)||numbers.length>300||numbers.some(n=>!analysis.pages.some(p=>p.number===n)))throw new Error('PDF 쪽 선택을 확인하세요.');
}
export function mergePdfOcr(page,tsv,scale) {
    const rows=new Map(),words=[];
    for(const row of tsv.split(/\r?\n/).slice(1)){
        const fields=row.split('\t');if(fields.length<12||fields[0]!=='5')continue;
        const text=fields.slice(11).join('\t').trim(),[x,y,w,h,confidence]=fields.slice(6,11).map(Number);
        if(!text||![x,y,w,h,confidence].every(Number.isFinite)||confidence<0)continue;
        const word={text,bbox:[x/scale,y/scale,(x+w)/scale,(y+h)/scale],confidence},cx=(x+w/2)/scale,cy=(y+h/2)/scale;
        if(page.tables.some(t=>inside(t.bbox,cx,cy)))continue; // Never overwrite parsed numeric cells.
        const strips=page.images.filter(i=>i.kind==='text-raster');
        if(page.kind!=='scan'&&!strips.some(i=>inside(i.bbox,cx,cy,3)))continue;
        if(page.kind!=='scan'&&page.images.some(i=>i.kind==='figure'&&inside(i.bbox,cx,cy)))continue;
        if(page.lines.some(l=>inside(l.bbox,cx,cy,1.5)))continue;
        const key=fields.slice(1,5).join(':');if(!rows.has(key))rows.set(key,[]);rows.get(key).push(word);words.push(word);
    }
    const lines=[...rows.values()].map(group=>({text:group.map(w=>w.text).join(' '),bbox:[Math.min(...group.map(w=>w.bbox[0])),Math.min(...group.map(w=>w.bbox[1])),Math.max(...group.map(w=>w.bbox[2])),Math.max(...group.map(w=>w.bbox[3]))],size:Math.max(8,Math.min(14,group.reduce((n,w)=>n+w.bbox[3]-w.bbox[1],0)/group.length)),confidence:group.reduce((n,w)=>n+w.confidence,0)/group.length,ocr:true}));
    const mergedLines=[...page.lines,...lines].sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
    return {...page,ocr:{engine:'tesseract.js/kor+eng',createdAt:new Date().toISOString(),lines,mergedLines,words:words.length,lowConfidence:lines.filter(l=>l.confidence<75).length,reviewed:false},warnings:[...page.warnings,`OCR ${lines.length}줄 추가 · 원문 대조 필요`],textVerified:false};
}
export async function enrichPdfOcr(bytes,analysis,numbers,{onProgress=()=>{},signal}={}) {
    validateSelection(analysis,numbers);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==analysis.source.sha256)throw new Error('OCR 대상 PDF 원본이 분석 때와 다릅니다.');
    const {createWorker}=await import('tesseract.js'),root=reportRuntimeBase();
    let worker,task,cancelled=false;
    const cancel=()=>{cancelled=true;worker?.terminate();task?.destroy();};
    signal?.addEventListener('abort',cancel,{once:true});
    try{
        if(signal?.aborted)throw new Error('OCR을 취소했습니다.');
        onProgress({stage:'한국어 인식 엔진 준비',index:0,total:numbers.length});
        worker=await createWorker(['kor','eng'],1,{workerPath:root+'ocr/worker.min.js',workerBlobURL:false,corePath:root+'ocr',langPath:bundledFolder('report-ocr').replace(/\/$/,''),cacheMethod:'none',gzip:true,errorHandler:error=>console.error('Local OCR worker error:',error),logger:event=>{if(!cancelled)onProgress({stage:`한국어 인식 엔진 · ${event.status} ${Math.round((event.progress||0)*100)}%`,index:0,total:numbers.length});}});
        if(cancelled)throw new Error('OCR을 취소했습니다.');
        await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});
        task=await openPdfForRendering(bytes);const doc=await task.promise,pages=[...analysis.pages];
        for(const [index,number]of numbers.entries()){
            if(cancelled)throw new Error('OCR을 취소했습니다.');
            onProgress({stage:`PDF ${number}쪽 본문 인식`,index,total:numbers.length});
            const p=await doc.getPage(number),scale=Math.min(2.5,Math.sqrt(8000000/(p.view[2]*p.view[3]))),viewport=p.getViewport({scale});
            const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            try{
                await p.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
                const {data}=await worker.recognize(canvas,{}, {tsv:true,text:true});
                const i=pages.findIndex(p=>p.number===number);pages[i]=mergePdfOcr(pages[i],data.tsv||'',scale);
            }finally{canvas.width=canvas.height=0;p.cleanup();}
        }
        return {...analysis,pages,ocrUpdatedAt:new Date().toISOString(),status:'review-required',reportReady:false};
    }finally{signal?.removeEventListener('abort',cancel);if(worker)await worker.terminate().catch(()=>{});if(task)await task.destroy().catch(()=>{});}
}
export async function cropPdfPictures(bytes,analysis,numbers,{onProgress=()=>{},signal,includeTextImages=false}={}) {
    validateSelection(analysis,numbers);const task=await openPdfForRendering(bytes),pictures={};let totalBytes=0;
    const cancel=()=>task.destroy();signal?.addEventListener('abort',cancel,{once:true});
    try{
        if(signal?.aborted)throw new Error('그림 추출을 취소했습니다.');
        const doc=await task.promise,{pdfGraphics}=await import('./pdfStructure.js'),{pdfImageRgba,loadPdfImageObject}=await import('./pdfImagePixels.js'),{OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
        for(const [index,number]of numbers.entries()){
            if(signal?.aborted)throw new Error('그림 추출을 취소했습니다.');
            const source=analysis.pages.find(p=>p.number===number),images=source.images.filter(i=>includeTextImages||i.kind==='figure');if(!images.length)continue;
            onProgress({stage:`PDF ${number}쪽 원문 그림 추출`,index,total:numbers.length});
            const p=await doc.getPage(number),viewport=p.getViewport({scale:1}),operators=await p.getOperatorList(),graphics=pdfGraphics(operators,OPS,viewport);
            try{
                for(const image of images){
                    if(signal?.aborted)throw new Error('그림 추출을 취소했습니다.');
                    const found=graphics.images.find(g=>g.operator===image.operator&&g.bbox.every((v,i)=>Math.abs(v-image.bbox[i])<1));
                    if(!found||operators.fnArray[image.operator]===OPS.paintImageXObjectRepeat)throw new Error('PDF 그림의 위치가 분석 결과와 다릅니다. 보고서를 다시 분석하세요.');
                    const arg=operators.argsArray[image.operator]?.[0],original=typeof arg==='string'?await loadPdfImageObject(arg.startsWith('g_')?p.commonObjs:p.objs,arg,signal):arg;
                    if(!original||!Number.isInteger(original.width)||!Number.isInteger(original.height)||original.width*original.height>MAX_PDF_IMAGE_PIXELS)throw new Error('PDF 원본 그림의 크기를 확인하세요.');
                    const decoded=document.createElement('canvas'),part=document.createElement('canvas');decoded.width=original.width;decoded.height=original.height;
                    try{
                        if(original.bitmap)decoded.getContext('2d').drawImage(original.bitmap,0,0);else decoded.getContext('2d').putImageData(new ImageData(pdfImageRgba(original),original.width,original.height),0,0);
                        const [a,b,c,d,e,f]=found.transform,[x,y,right,bottom]=image.bbox,area=(right-x)*(bottom-y),scale=Math.min(Math.max(original.width/Math.hypot(a,b),original.height/Math.hypot(c,d)),Math.sqrt(MAX_PDF_IMAGE_PIXELS/area));
                        part.width=Math.max(1,Math.ceil((right-x)*scale));part.height=Math.max(1,Math.ceil((bottom-y)*scale));
                        const sx=part.width/(right-x),sy=part.height/(bottom-y),context=part.getContext('2d');context.setTransform(sx*a/original.width,sy*b/original.width,-sx*c/original.height,-sy*d/original.height,sx*(c+e-x),sy*(d+f-y));context.drawImage(decoded,0,0);
                        const blob=await new Promise(resolve=>part.toBlob(resolve,'image/png'));if(!blob)throw new Error('원문 그림을 추출하지 못했습니다.');
                        if(blob.size>MAX_HWPX_PNG_BYTES)throw new Error('PNG image exceeds the shared HWPX limit.');totalBytes+=blob.size;if(totalBytes>MAX_PDF_PICTURES_BYTES)throw new Error('그림은 한 번에 80MB 이하로 나누어 작성하세요.');
                        pictures[image.id]={bytes:new Uint8Array(await blob.arrayBuffer()),width:part.width,height:part.height,method:'pdf-image-object',originalWidth:original.width,originalHeight:original.height};
                    }finally{decoded.width=decoded.height=part.width=part.height=0;}
                }
            }finally{p.cleanup();}
        }
        return pictures;
    }finally{signal?.removeEventListener('abort',cancel);await task.destroy().catch(()=>{});}
}
