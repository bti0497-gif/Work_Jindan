import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCanvas,ImageData} from '@napi-rs/canvas';
import {pdfGraphics} from './engine/src/services/report/pdfStructure.js';
import {pdfImageRgba,loadPdfImageObject} from './engine/src/services/report/pdfImagePixels.js';
import {MAX_PDF_IMAGE_PIXELS,MAX_HWPX_PNG_BYTES,MAX_PDF_PICTURES_BYTES} from './engine/src/services/report/pdfImageLimits.js';

const require=createRequire(import.meta.url),pdfRoot=dirname(require.resolve('pdfjs-dist/package.json'));
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Local PDF picture extraction was cancelled.');};
const vector=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b[i])&&Math.abs(v-b[i])<1e-6);
const limit=(value,max)=>{if(value===undefined)return max;if(!Number.isSafeInteger(value)||value<1||value>max)fail('INVALID_INPUT','Picture limit must be a positive bounded integer.');return value;};

// The source is decoded locally; page rendering and OCR are deliberately absent.
export async function extractNodePdfPictures(input,analysis,numbers,{onProgress=()=>{},signal,includeTextImages=true,maxImagePixels,maxPngBytes,maxTotalBytes}={}){
    check(signal);
    if(!(input instanceof Uint8Array)&&!(input instanceof ArrayBuffer))fail('INVALID_INPUT','PDF bytes are required.');
    const bytes=new Uint8Array(input instanceof Uint8Array?input:new Uint8Array(input)).slice();
    if(bytes.length<8||bytes.length>160*1024*1024||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')fail('INVALID_INPUT','A bounded local PDF source is required.');
    if(analysis?.schema!=='jindan-pdf-analysis/1'||!Array.isArray(analysis.pages)||!Array.isArray(numbers)||numbers.length>300||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isInteger(n)||n<1||!analysis.pages.some(p=>p.number===n)))fail('INVALID_INPUT','PDF analysis and unique selected page numbers are required.');
    const sourceSha256=createHash('sha256').update(bytes).digest('hex');
    if(sourceSha256!==analysis.source?.sha256)fail('BINDING_MISMATCH','PDF bytes differ from the analyzed source.');
    const pixelLimit=limit(maxImagePixels,MAX_PDF_IMAGE_PIXELS),pngLimit=limit(maxPngBytes,MAX_HWPX_PNG_BYTES),totalLimit=limit(maxTotalBytes,MAX_PDF_PICTURES_BYTES);
    const {getDocument,GlobalWorkerOptions,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    check(signal);
    GlobalWorkerOptions.workerSrc=pathToFileURL(join(pdfRoot,'legacy/build/pdf.worker.mjs')).href;
    const task=getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,useWorkerFetch:false,disableAutoFetch:true,cMapUrl:join(pdfRoot,'cmaps')+'/',cMapPacked:true,standardFontDataUrl:join(pdfRoot,'standard_fonts')+'/',wasmUrl:join(pdfRoot,'wasm')+'/'});
    const abort=()=>{void task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
    const pictures=Object.create(null);let totalBytes=0;
    try{
        const doc=await task.promise;check(signal);
        for(const [index,number] of numbers.entries()){
            check(signal);onProgress({stage:'node-original-picture-extraction',page:number,index,total:numbers.length});check(signal);
            const source=analysis.pages.find(p=>p.number===number),page=await doc.getPage(number);
            try{
                const viewport=page.getViewport({scale:1});
                if(![source.widthPt,source.heightPt].every(v=>Number.isFinite(v)&&v>0)||Math.abs(viewport.width-source.widthPt)>1e-6||Math.abs(viewport.height-source.heightPt)>1e-6||page.rotate!==source.rotation)fail('BINDING_MISMATCH','PDF page geometry differs from analysis.');
                const operators=await page.getOperatorList();check(signal);
                const unsupported=['paintImageXObjectRepeat','paintInlineImageXObjectGroup','paintImageMaskXObject','paintImageMaskXObjectRepeat','paintImageMaskXObjectGroup','paintSolidColorImageMask'];
                if(unsupported.some(name=>Number.isInteger(OPS[name])&&operators.fnArray.includes(OPS[name])))fail('UNSUPPORTED_PDF_IMAGE','Repeated, grouped, or masked PDF images require a separately validated adapter.');
                const graphics=pdfGraphics(operators,OPS,viewport);
                if(!Array.isArray(source.images)||source.images.length!==graphics.images.length)fail('BINDING_MISMATCH','PDF picture list differs from analysis.');
                for(const [imageIndex,image] of source.images.entries()){
                    const found=graphics.images[imageIndex];
                    if(image.id!==`pdf:p${number}:image${imageIndex}`||image.operator!==found.operator||image.kind!==found.kind||!vector(image.bbox,found.bbox)||!vector(image.transform,found.transform))fail('BINDING_MISMATCH','PDF picture operator or position differs from analysis.');
                    if(!includeTextImages&&image.kind!=='figure')continue;
                    check(signal);
                    const arg=operators.argsArray[image.operator]?.[0],original=typeof arg==='string'?await loadPdfImageObject(arg.startsWith('g_')?page.commonObjs:page.objs,arg,signal):arg;
                    check(signal);
                    if(!original||!Number.isInteger(original.width)||!Number.isInteger(original.height)||original.width<1||original.height<1||original.width*original.height>pixelLimit)fail('PICTURE_LIMIT','PDF original picture exceeds the pixel budget.');
                    const decoded=createCanvas(original.width,original.height);let part;
                    try{
                        if(original.bitmap){try{decoded.getContext('2d').drawImage(original.bitmap,0,0);}catch{fail('UNSUPPORTED_BITMAP','PDF image bitmap cannot be decoded by the local canvas backend.');}}
                        else decoded.getContext('2d').putImageData(new ImageData(pdfImageRgba(original),original.width,original.height),0,0);
                        const [a,b,c,d,e,f]=found.transform,[x,y,right,bottom]=image.bbox,width=right-x,height=bottom-y,axisX=Math.hypot(a,b),axisY=Math.hypot(c,d),area=width*height;
                        if(![width,height,axisX,axisY,area].every(v=>Number.isFinite(v)&&v>0)||Math.abs(a*d-b*c)<1e-12)fail('UNSUPPORTED_PDF_IMAGE','PDF image transform is singular or empty.');
                        const scale=Math.min(Math.max(original.width/axisX,original.height/axisY),Math.sqrt(pixelLimit/area));
                        let outWidth=Math.max(1,Math.ceil(width*scale)),outHeight=Math.max(1,Math.ceil(height*scale));
                        if(outWidth*outHeight>pixelLimit){const correction=Math.sqrt(pixelLimit/(outWidth*outHeight));outWidth=Math.max(1,Math.floor(outWidth*correction));outHeight=Math.max(1,Math.floor(outHeight*correction));}
                        if(outWidth*outHeight>pixelLimit)fail('PICTURE_LIMIT','Transformed PDF picture exceeds the pixel budget.');
                        part=createCanvas(outWidth,outHeight);const context=part.getContext('2d'),sx=outWidth/width,sy=outHeight/height;
                        context.setTransform(sx*a/original.width,sy*b/original.width,-sx*c/original.height,-sy*d/original.height,sx*(c+e-x),sy*(d+f-y));context.drawImage(decoded,0,0);
                        check(signal);const png=part.toBuffer('image/png');check(signal);
                        if(png.byteLength>pngLimit)fail('PICTURE_LIMIT','PNG exceeds the bounded HWPX picture limit.');
                        totalBytes+=png.byteLength;if(totalBytes>totalLimit)fail('PICTURE_LIMIT','Selected PDF pictures exceed the total byte budget.');
                        pictures[image.id]={bytes:new Uint8Array(png),width:outWidth,height:outHeight,method:'pdf-image-object',originalWidth:original.width,originalHeight:original.height,sourceSha256,page:number,operator:image.operator,bbox:[...image.bbox],transform:[...image.transform],sha256:createHash('sha256').update(png).digest('hex')};
                    }finally{decoded.width=decoded.height=0;if(part)part.width=part.height=0;}
                }
            }finally{page.cleanup();}
        }
        check(signal);return pictures;
    }catch(error){if(signal?.aborted)fail('CANCELLED','Local PDF picture extraction was cancelled.');throw error;}
    finally{signal?.removeEventListener('abort',abort);await task.destroy().catch(()=>{});}
}
