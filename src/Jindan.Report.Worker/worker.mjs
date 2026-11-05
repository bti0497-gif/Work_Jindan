import {readFile,writeFile,rename,mkdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {XMLValidator} from 'fast-xml-parser';

// This process is disposable and owns no GUI, credential, network or cloud state.
// Library diagnostics may contain document text: only our bounded envelopes may
// cross stdout, and no library diagnostic is forwarded to stderr or a log.
for(const method of ['log','warn','error','info','debug'])console[method]=()=>{};
const PROTOCOL='jindan-worker/1',MAX_METADATA=64*1024,MAX_FILE=160*1024*1024,MAX_BUNDLE=192*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code)=>{const error=new Error('Local worker request was rejected.');error.code=code;throw error;};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
let request=null,session=null,output=null,outputIndex=0;
const ids=()=>({protocol:PROTOCOL,requestId:request?.requestId||'',projectId:request?.projectId||'',sourceSha256:request?.sourceSha256||'',operation:request?.operation||'',reportReady:false});
const emit=value=>process.stdout.write(JSON.stringify({...ids(),...value})+'\n');
const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value)?value:'WORKER_ERROR';
function boundedPictureDimensions(input){
    const b=Buffer.from(input.buffer,input.byteOffset,input.byteLength);let w=0,h=0;
    if(b.length<32||b.length>16*1024*1024)fail('PICTURE_LIMIT');
    if(b[0]===137&&b.toString('ascii',1,4)==='PNG'){w=b.readUInt32BE(16);h=b.readUInt32BE(20);}
    else if(b[0]===255&&b[1]===216){for(let p=2;p+9<b.length;){if(b[p++]!==255)fail('INVALID_PICTURE');while(b[p]===255)p++;const marker=b[p++];if([0xd8,0x01,...Array.from({length:8},(_,i)=>0xd0+i)].includes(marker))continue;if(marker===0xd9||marker===0xda)break;if(p+2>b.length)break;const size=b.readUInt16BE(p);if(size<2||p+size>b.length)fail('INVALID_PICTURE');if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){h=b.readUInt16BE(p+3);w=b.readUInt16BE(p+5);break;}p+=size;}}
    else if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
        const kind=b.toString('ascii',12,16);if(kind==='VP8X'){w=1+b.readUIntLE(24,3);h=1+b.readUIntLE(27,3);}else if(kind==='VP8L'&&b[20]===0x2f){const bits=b.readUInt32LE(21);w=(bits&0x3fff)+1;h=((bits>>>14)&0x3fff)+1;}else if(kind==='VP8 '&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a){w=b.readUInt16LE(26)&0x3fff;h=b.readUInt16LE(28)&0x3fff;}
    }
    if(!w||!h||w*h>16000000)fail('PICTURE_LIMIT');return {width:w,height:h};
}
function safeJson(value,depth=0){
    if(depth>64)fail('INVALID_INPUT');
    if(value===null||typeof value!=='object')return;
    if(!Array.isArray(value)&&!record(value))fail('INVALID_INPUT');
    for(const key of Object.keys(value)){
        if(['__proto__','constructor','prototype'].includes(key))fail('INVALID_INPUT');
        safeJson(value[key],depth+1);
    }
}
async function readRequest(){
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;if(size>MAX_METADATA)fail('REQUEST_TOO_LARGE');chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_REQUEST');}
    if(!record(input)||input.protocol!==PROTOCOL||typeof input.requestId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestId)
        ||typeof input.projectId!=='string'||!/^project:[A-Za-z0-9_.:%-]{1,160}$/.test(input.projectId)
        ||typeof input.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceSha256)
        ||typeof input.operation!=='string'||!record(input.files))fail('INVALID_REQUEST');
    safeJson(input);request=input;
    const supplied=process.argv[2];if(!supplied||!path.isAbsolute(supplied))fail('INVALID_SESSION');
    session=await realpath(supplied);if(!(await stat(session)).isDirectory())fail('INVALID_SESSION');
    output=path.join(session,'output');
    // Unique session required: never overwrite earlier results, and refuse an
    // attacker-prepared symlink/junction instead of following it for output.
    try{await mkdir(output);}catch{fail('SESSION_ALREADY_USED');}
    if(await realpath(output)!==output)fail('INVALID_SESSION');
}
const descriptorKeys=new Set(['path','sha256','id','filename','role','parentIds']);
async function loadDescriptor(descriptor,name){
    if(!record(descriptor)||Object.keys(descriptor).some(k=>!descriptorKeys.has(k))||typeof descriptor.path!=='string'||descriptor.path.length>4000
        ||typeof descriptor.sha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptor.sha256))fail('INVALID_FILE');
    const candidate=path.resolve(session,descriptor.path),resolved=await realpath(candidate);
    if(!inside(session,resolved)||inside(output,resolved)||resolved===output)fail('PATH_OUTSIDE_SESSION');
    const limit=/bundle/i.test(name)?MAX_BUNDLE:MAX_FILE,info=await stat(resolved);
    if(!info.isFile()||info.size<=0||info.size>limit)fail('FILE_SIZE_LIMIT');
    const bytes=await readFile(resolved);if(bytes.length!==info.size||hash(bytes)!==descriptor.sha256)fail('FILE_HASH_MISMATCH');
    return new Uint8Array(bytes);
}
async function loadFiles(){
    const loaded={};let total=0;
    if(Object.keys(request.files).length>1000)fail('FILE_COUNT_LIMIT');
    for(const [name,descriptor]of Object.entries(request.files)){
        if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(name))fail('INVALID_FILE');
        if(name==='evidence'){
            if(!Array.isArray(descriptor)||descriptor.length>1000)fail('INVALID_FILE');
            const seen=new Set();loaded.evidence=[];
            for(const item of descriptor){
                if(typeof item.id!=='string'||!/^[A-Za-z0-9_.:-]{1,180}$/.test(item.id)||seen.has(item.id))fail('INVALID_FILE');seen.add(item.id);
                const bytes=await loadDescriptor(item,'evidence');total+=bytes.length;if(total>512*1024*1024)fail('FILE_TOTAL_LIMIT');loaded.evidence.push({id:item.id,bytes});
            }
        }else{loaded[name]=await loadDescriptor(descriptor,name);total+=loaded[name].length;}
        if(total>512*1024*1024)fail('FILE_TOTAL_LIMIT');
    }
    const primary=request.files.source||request.files.archive;
    if(!primary&&!request.operation.startsWith('test:'))fail('INVALID_FILE');
    if(primary&&primary.sha256!==request.sourceSha256)fail('BINDING_MISMATCH');
    return loaded;
}
function jsonFile(bytes,fallback={}){
    if(!bytes)return fallback;
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('INVALID_JSON_FILE');}
    safeJson(value);return value;
}
function progress(event){
    const stage=typeof event?.stage==='string'&&/^[a-z][a-z0-9/-]{0,79}$/.test(event.stage)?event.stage:'working';
    emit({type:'progress',stage,...Object.fromEntries(['page','total','current'].filter(key=>Number.isFinite(event?.[key])&&event[key]>=0&&event[key]<=1000000).map(key=>[key,event[key]]))});
}
async function writeOutput(bytes,extension,mediaType){
    const filename=`result-${String(++outputIndex).padStart(4,'0')}.${extension}`,destination=path.join(output,filename),temporary=destination+'.tmp';
    await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,destination);
    return {path:destination,sha256:hash(bytes),size:bytes.length,mediaType};
}
async function serialize(value,depth=0,keyHint=''){
    if(depth>80)fail('OUTPUT_LIMIT');
    if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)){
        const bytes=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
        const binaryLimit=request?.operation==='test:binary-limit'&&process.env.JINDAN_WORKER_TEST==='1'?1024:MAX_FILE;
        if(bytes.byteLength>binaryLimit)fail('OUTPUT_LIMIT');
        return {$workerFile:await writeOutput(bytes,keyHint==='pngBytes'?'png':'bin',keyHint==='pngBytes'?'image/png':'application/octet-stream')};
    }
    if(Array.isArray(value)){const result=[];for(const item of value)result.push(await serialize(item,depth+1));return result;}
    if(record(value)){const result={};for(const [key,item]of Object.entries(value))if(item!==undefined)result[key]=await serialize(item,depth+1,key);return result;}
    if(typeof value==='bigint'||typeof value==='function'||typeof value==='symbol')fail('OUTPUT_LIMIT');
    return value;
}
function validatePreviewSvg(svg){
    if(typeof svg!=='string'||Buffer.byteLength(svg)>16*1024*1024||/<!DOCTYPE|<!ENTITY|<\s*(?:[\w.-]+:)?(?:script|style|foreignObject|iframe|object|embed|audio|video)\b|\bon[a-z]+\s*=|\bxml:base\s*=|@import/i.test(svg)||XMLValidator.validate(svg)!==true)fail('UNSAFE_PREVIEW');
    for(const match of svg.matchAll(/\b(?:[\w.-]+:)?href\s*=\s*(["'])(.*?)\1/gi))if(!/^#[A-Za-z0-9_.:-]+$/.test(match[2])&&!/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(match[2]))fail('UNSAFE_PREVIEW');
    const withoutComments=svg.replace(/\/\*[\s\S]*?\*\//g,'');
    for(const match of withoutComments.matchAll(/url\s*\((.*?)\)/gi))if(!/^\s*["']?#[A-Za-z0-9_.:-]+["']?\s*$/.test(match[1]))fail('UNSAFE_PREVIEW');
    for(const match of svg.matchAll(/\bstyle\s*=\s*(["'])(.*?)\1/gi))if(/\\|@/.test(match[2]))fail('UNSAFE_PREVIEW');
    if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/.test(svg))fail('UNSAFE_PREVIEW');
}
async function previewFile(bytes,parameters){
    const pageNumber=Number(parameters.page||1),scale=Number(parameters.scale||1.5);
    if(!Number.isInteger(pageNumber)||pageNumber<1||!Number.isFinite(scale)||scale<.5||scale>2)fail('INVALID_PAGE');
    const {createCanvas,loadImage}=await import('@napi-rs/canvas');
    const png=(canvas)=>{const bytes=canvas.toBuffer('image/png');if(bytes.length>20*1024*1024)fail('PREVIEW_LIMIT');return new Uint8Array(bytes);};
    const size=(width,height)=>{if(![width,height].every(v=>Number.isFinite(v)&&v>0&&v<=20000)||width*height>16000000)fail('PREVIEW_LIMIT');};
    const sourceSha256=hash(bytes),isPdf=new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-';
    if(isPdf){
        const require=createRequire(import.meta.url),root=path.dirname(require.resolve('pdfjs-dist/package.json'));
        const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist/legacy/build/pdf.mjs');GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(root,'legacy/build/pdf.worker.mjs')).href;
        const task=getDocument({data:bytes.slice(),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,enableXfa:false,cMapUrl:path.join(root,'cmaps')+'/',cMapPacked:true,standardFontDataUrl:path.join(root,'standard_fonts')+'/',wasmUrl:path.join(root,'wasm')+'/'});
        try{
            const doc=await task.promise;if(doc.numPages<1||doc.numPages>1000||pageNumber>doc.numPages)fail('INVALID_PAGE');const page=await doc.getPage(pageNumber),viewport=page.getViewport({scale});size(viewport.width,viewport.height);
            const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport}).promise;const out={sourceSha256,pageNumber,pageCount:doc.numPages,width:canvas.width,height:canvas.height,engine:'pdfjs/5.4.624',layoutVerified:false,pngBytes:png(canvas)};canvas.width=1;canvas.height=1;page.cleanup();return out;
        }finally{await task.destroy();}
    }
    const require=createRequire(import.meta.url),core=await import('@rhwp/core'),measuring=createCanvas(1,1),measure=measuring.getContext('2d');
    globalThis.measureTextWidth=(font,text)=>{if(typeof font!=='string'||font.length>500||typeof text!=='string'||text.length>50000)fail('PREVIEW_LIMIT');measure.font=font;const width=measure.measureText(text).width;if(!Number.isFinite(width))fail('PREVIEW_LIMIT');return width;};
    await core.default({module_or_path:await readFile(require.resolve('@rhwp/core/rhwp_bg.wasm'))});
    // HWPX parser/package guards remain independent from the renderer. The page
    // always comes from selected native bytes, never a paired or nearby PDF.
    if(bytes[0]===0x50&&bytes[1]===0x4b)(await import('./engine/src/services/report/hwpxPackage.js')).readHwpxPackage(bytes);
    const document=new core.HwpDocument(bytes);
    try{
        const pageCount=document.pageCount();if(pageCount<1||pageCount>1000||pageNumber>pageCount)fail('INVALID_PAGE');const info=JSON.parse(document.getPageInfo(pageNumber-1));size(info.width,info.height);
        let svg=document.renderPageSvg(pageNumber-1);validatePreviewSvg(svg);const width=Math.ceil(info.width*scale),height=Math.ceil(info.height*scale);size(width,height);
        svg=svg.replace(/<svg\b[^>]*>/,root=>root.replace(/\bwidth="[^"]*"/,`width="${width}"`).replace(/\bheight="[^"]*"/,`height="${height}"`));
        let image;try{image=await loadImage(Buffer.from(svg));}catch{fail('PREVIEW_RENDER_UNSUPPORTED');}
        const canvas=createCanvas(width,height);canvas.getContext('2d').fillStyle='#ffffff';canvas.getContext('2d').fillRect(0,0,width,height);canvas.getContext('2d').drawImage(image,0,0,width,height);
        const result={sourceSha256,pageNumber,pageCount,width,height,engine:'rhwp/0.8.7',layoutVerified:false,nativeHancomApproval:false,measurement:'napi-canvas-font-metrics',pngBytes:png(canvas)};canvas.width=1;canvas.height=1;return result;
    }finally{document.free();measuring.width=1;measuring.height=1;delete globalThis.measureTextWidth;}
}
async function execute(files){
    if(request.operation.startsWith('test:')){
        if(process.env.JINDAN_WORKER_TEST!=='1')fail('UNSUPPORTED_OPERATION');
        switch(request.operation){
            case 'test:hang':progress({stage:'test-hang'});await new Promise(()=>{setInterval(()=>{},1000);});break;
            case 'test:cpu':progress({stage:'test-cpu'});for(;;){} // owned process cancellation proves interruption.
            case 'test:crash':process.exit(71);break;
            case 'test:echo':return {ok:true,value:{testOnly:true},reportReady:false};
            case 'test:binary-limit':{const length=Number(request.parameters?.length);if(!Number.isInteger(length)||length<1||length>2048)fail('INVALID_INPUT');return {ok:true,value:{bytes:new Uint8Array(length)},reportReady:false};}
            case 'test:validate-svg':validatePreviewSvg(new TextDecoder().decode(files.source));return {ok:true,value:{testOnly:true},reportReady:false};
            case 'test:wrong-id':emit({type:'progress',requestId:'not-the-request',stage:'working'});await new Promise(()=>{});break;
            default:fail('UNSUPPORTED_OPERATION');
        }
    }
    const {createReportEngine}=await import('./engine/src/services/report/engineFacade.js');
    const require=createRequire(import.meta.url),runtimeRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
    const engine=createReportEngine({
        async analyzePdf(bytes,filename,projectId,options){
            const {analyzePdfReport}=await import('./engine/src/services/report/pdfAnalysis.js');
            const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(runtimeRoot,'legacy/build/pdf.worker.mjs')).href;
            // All resources are local filesystem paths; no external resource URL.
            return analyzePdfReport(bytes,filename,projectId,{...options,runtimeBase:undefined});
        },
        async extractPictures(bytes,analysis,pages,options){
            let adapter;try{adapter=await import('./node-pictures.mjs');}catch{fail('ADAPTER_REQUIRED');}
            return adapter.extractNodePdfPictures(bytes,analysis,pages,options);
        }
    });
    const parameters=request.parameters||{},context=jsonFile(files.context),bundle=jsonFile(files.bundle,null),options={onProgress:progress};
    if(!record(parameters)||!record(context))fail('INVALID_INPUT');
    const input={bytes:files.source,projectId:request.projectId,filename:parameters.filename||'source.hwpx',bundle,context,evidenceFiles:files.evidence||[]};
    async function requireBundle(){
        const {engineJson,engineHash}=await import('./engine/src/services/report/engineContract.js');
        if(bundle?.schema!=='jindan-engine-analysis/1'||bundle.projectId!==request.projectId||bundle.material?.sha256!==request.sourceSha256||bundle.fingerprint!==await engineHash(new TextEncoder().encode(engineJson({...bundle,fingerprint:undefined},MAX_BUNDLE))))fail('BINDING_MISMATCH');
        return bundle;
    }
    switch(request.operation){
        case 'preview':return {ok:true,operation:'preview',contractVersion:engine.contractVersion,value:await previewFile(files.source,parameters),reportReady:false};
        case 'locate':{
            await requireBundle();const row=bundle.analysis.sections?.find(row=>row.id===parameters.rowId)||bundle.analysis.pictures?.find(row=>row.id===parameters.rowId)||bundle.analysis.imageTextRegions?.find(row=>row.id===parameters.rowId);if(!row)fail('BINDING_MISMATCH');
            if(bundle.material.format==='pdf')return {ok:true,operation:'locate',contractVersion:engine.contractVersion,value:{sourceSha256:request.sourceSha256,rowId:row.id,pages:[row.target?.page||row.page],method:'source-pdf-page-anchor',nativeHancomApproval:false},reportReady:false};
            const needle=String(row.text||'').replace(/\s+/g,'').slice(0,3000);if(!needle)fail('LOCATION_UNAVAILABLE');
            const require=createRequire(import.meta.url),core=await import('@rhwp/core'),canvas=await import('@napi-rs/canvas'),measure=canvas.createCanvas(1,1).getContext('2d');globalThis.measureTextWidth=(font,text)=>{measure.font=font;return measure.measureText(text).width;};
            await core.default({module_or_path:await readFile(require.resolve('@rhwp/core/rhwp_bg.wasm'))});const doc=new core.HwpDocument(files.source);
            try{const count=doc.pageCount(),pages=[];if(count<1||count>1000)fail('PREVIEW_LIMIT');for(let page=0;page<count;page++){const layout=doc.getPageTextLayout(page);if(Buffer.byteLength(layout)>8*1024*1024)fail('PREVIEW_LIMIT');const text=JSON.parse(layout).runs.map(run=>String(run.text||'')).join('');if(text.replace(/\s+/g,'').includes(needle))pages.push(page+1);}if(!pages.length)fail('LOCATION_UNAVAILABLE');return {ok:true,operation:'locate',contractVersion:engine.contractVersion,value:{sourceSha256:request.sourceSha256,rowId:row.id,pages,method:'independent-renderer-layout-text-match',ambiguous:pages.length>1,nativeHancomApproval:false},reportReady:false};}finally{doc.free();delete globalThis.measureTextWidth;}
        }
        case 'cadPreview':{
            let adapter;try{adapter=await import('./node-cad.mjs');}catch{fail('ADAPTER_REQUIRED');}
            const value=await adapter.renderNodeCad(String(parameters.filename||''),files.source,{onProgress:progress});
            if(value.sourceSha256!==request.sourceSha256)fail('BINDING_MISMATCH');const {bytes,...metadata}=value;
            return {ok:true,operation:'cadPreview',contractVersion:engine.contractVersion,value:{...metadata,pngBytes:bytes,layoutVerified:false},reportReady:false};
        }
        case 'analyze':return engine.analyze(input,options);
        case 'nativeSaveAudit':{
            await requireBundle();if(bundle.material.format!=='hwpx'||!files.filled)fail('UNSUPPORTED_FORMAT');
            const {auditNativeSave}=await import('./engine/src/services/report/nativeSaveAudit.js');
            return {ok:true,operation:'nativeSaveAudit',contractVersion:engine.contractVersion,value:await auditNativeSave(files.source,files.filled,{expectedBeforeSha256:request.sourceSha256,expectedAfterSha256:hash(files.filled)}),reportReady:false};
        }
        case 'inspectLegacyProject':{
            const library=await import('./engine/src/services/report/projectArchive.js'),parsed=await library.readProjectArchive(files.source);let total=0;const restored=[];
            for(const {material,blob}of parsed.restored){if(material.size>MAX_FILE||(total+=material.size)>512*1024*1024)fail('FILE_TOTAL_LIMIT');const bytes=new Uint8Array(await blob.arrayBuffer());if(hash(bytes)!==material.sha256)fail('BINDING_MISMATCH');restored.push({legacyId:material.id,role:material.role,filename:material.filename,format:material.format,size:material.size,sha256:material.sha256,metadata:material,bytes});}
            const old=parsed.manifest,book=old.book;
            // Explicit allowlist: no old actor, permissions, executable analysis,
            // acknowledgment, review, field values or current-state adoption.
            const receipt={schema:'jindan-legacy-project-context/1',sourceArchiveSha256:request.sourceSha256,originSchema:old.schema,title:book.title,projectName:old.projectName||'',chapters:book.chapters.map(({id,kind,title,text})=>({id,kind,title,text})),documentSettings:Object.fromEntries(['header','footer','titleAlign','titlePosition','projectName'].filter(key=>typeof book[key]==='string').map(key=>[key,book[key]])),referenceFolderCount:old.referenceProjects.length,referenceEntryCount:old.referenceEntries.length,requiresFreshAnalysis:true,readOnlyHistoricalContext:true,reportReady:false};
            return {ok:true,operation:'inspectLegacyProject',contractVersion:engine.contractVersion,value:{archiveSha256:request.sourceSha256,archiveSize:files.source.length,files:restored,receipt,summary:{files:restored.length,referenceReports:restored.filter(item=>item.role==='reference').length,materials:restored.filter(item=>item.role!=='reference').length,totalBytes:total,chapters:book.chapters.length},requiresFreshReview:true,reportReady:false},reportReady:false};
        }
        case 'pairReference':return engine.pairReference({projectId:request.projectId,pdf:{bytes:files.source,bundle},reference:{bytes:files.referenceSource,bundle:jsonFile(files.referenceBundle,null)},textReview:jsonFile(files.textReview,null)},options);
        case 'restore':return engine.restore({...input,chapterId:parameters.chapterId,settings:context.settings||{},spec:context.spec||{}},options);
        case 'specification':{
            await requireBundle();if(bundle.material.format!=='hwpx'||!bundle.profile)fail('UNSUPPORTED_FORMAT');
            const library=await import('./engine/src/services/report/reportSpecification.js'),restoration=await import('./engine/src/services/report/restoration.js');
            const section=bundle.profile.sections?.find(item=>item.section===parameters.section&&String(item.position??'')===String(parameters.position??''))||bundle.profile.sections?.[0];
            const action=String(parameters.action||'inspect');if(action==='inspect')return {ok:true,operation:'specification',contractVersion:engine.contractVersion,value:{spec:library.specificationFromProfile(bundle.profile,section),profile:bundle.profile,restoration:bundle.restoration,reportReady:false},reportReady:false};
            const spec=library.validateSpecification(context.spec);if(spec.sourceSha256!==request.sourceSha256||!bundle.profile.sections.some(item=>item.section===spec.section))fail('BINDING_MISMATCH');
            if(action==='validate')return {ok:true,operation:'specification',contractVersion:engine.contractVersion,value:{spec,reportReady:false},reportReady:false};
            if(action!=='apply')fail('INVALID_OPERATION');const pictures={};
            for(const replacement of spec.pictureReplacements||[]){
                const evidence=files.evidence?.find(item=>item.id===replacement.materialId&&hash(item.bytes)===replacement.sha256),object=bundle.restoration?.objects.find(item=>item.id===replacement.objectId);if(!evidence||!object?.image||!['image/png','image/jpeg'].includes(object.image.mime))fail('BINDING_MISMATCH');
                const dimensions=boundedPictureDimensions(evidence.bytes),canvas=await import('@napi-rs/canvas'),image=await canvas.loadImage(evidence.bytes);if(image.width!==dimensions.width||image.height!==dimensions.height)fail('INVALID_PICTURE');
                const originalMime=evidence.bytes[0]===137&&evidence.bytes[1]===80?'image/png':evidence.bytes[0]===255&&evidence.bytes[1]===216?'image/jpeg':null;let bytes=evidence.bytes;
                if(originalMime!==object.image.mime){const surface=canvas.createCanvas(image.width,image.height);surface.getContext('2d').drawImage(image,0,0);bytes=surface.toBuffer(object.image.mime);}
                pictures[replacement.objectId]={bytes,mime:object.image.mime,sourceSha256:replacement.sha256,materialId:replacement.materialId};
            }
            return {ok:true,operation:'specification',contractVersion:engine.contractVersion,value:await restoration.applyRestorationSpecification(files.source,spec,{pictures}),reportReady:false};
        }
        case 'prepareDraft':return engine.prepareDraft(input,options);
        case 'writeDraft':return engine.writeDraft(input,options);
        case 'exportCollection':return engine.exportCollection(input,options);
        case 'importCollection':return engine.importCollection({...input,filledBytes:files.filled},options);
        case 'exportArtifact':return engine.exportArtifact({...input,expectedSha256:request.sourceSha256},options);
        case 'createRecovery':{
            if(!Array.isArray(context.files))fail('INVALID_RECOVERY');
            return engine.createRecovery({projectId:request.projectId,state:context.state||{},files:context.files.map(item=>({...item,bytes:String(item.fileKey).startsWith('evidence:')?files.evidence?.find(file=>file.id===item.fileKey.slice(9))?.bytes:files[item.fileKey]}))},options);
        }
        case 'recover':return engine.recover({bytes:files.archive||files.source,projectId:request.projectId,expectedSha256:request.sourceSha256},options);
        case 'discipline':{
            await requireBundle();if(bundle.material.format!=='hwpx'||!bundle.document)fail('UNSUPPORTED_FORMAT');
            const library=await import('./engine/src/services/report/reportEngine.js'),collection=await import('./engine/src/services/report/collectionForms.js');
            let workspace=context.workspace;
            if(workspace){if(workspace.projectId!==request.projectId||workspace.source?.sha256!==request.sourceSha256)fail('BINDING_MISMATCH');workspace={...workspace,source:bundle.document.source,document:bundle.document};}
            else workspace=library.createWorkspace({id:request.projectId,title:String(parameters.projectTitle||request.projectId)},bundle.document);
            workspace.discipline=String(parameters.discipline||workspace.discipline||'electrical');if(!['process','mechanical','electrical'].includes(workspace.discipline))fail('INVALID_INPUT');
            const data=context.payload||{},action=String(parameters.action||'inspect');let extra={};
            switch(action){
                case 'inspect':break;
                case 'mapInputCell70':{
                    const evidence=files.evidence?.find(item=>item.id===data.materialId);if(!evidence||hash(evidence.bytes)!==data.sha256)fail('BINDING_MISMATCH');
                    workspace=await (await import('./engine/src/services/report/inputCell70.js')).mapInputCell70(workspace,evidence.bytes,data);break;
                }
                case 'proposalRequest':case 'proposalInspect':case 'proposalApply':{
                    const proposals=await import('./engine/src/services/report/proposalExchange70.js'),mode=String(data.mode||'analysis');
                    if(action==='proposalRequest')extra={proposalRequest:await proposals.prepareProposal(workspace,mode)};
                    else if(action==='proposalInspect')extra={proposalReview:await proposals.inspectProposal(workspace,mode,data.envelope)};
                    else workspace=await proposals.applyProposal(workspace,mode,data.envelope,{explicitApply:data.explicitApply});break;
                }
                case 'addTableFields':{
                    const table=bundle.document.tables.find(table=>table.id===data.tableId);if(!table)fail('BINDING_MISMATCH');workspace=library.addFields(workspace,data.judgmentsOnly?library.proposeJudgmentFields(bundle.document,table,Number(data.headerRows??1),Number(data.labelColumns??1)):library.proposeTableFields(bundle.document,table,Number(data.headerRows??1),Number(data.labelColumns??1)));break;
                }
                case 'addCellField':{
                    const table=bundle.document.tables.find(table=>table.id===data.tableId),cell=table?.cells.find(cell=>cell.id===data.cellId);if(!cell)fail('BINDING_MISMATCH');workspace=library.addFields(workspace,[library.proposeCellField(bundle.document,table,cell)]);break;
                }
                case 'setField':workspace=library.setField(workspace,data.field);break;
                case 'removeField':workspace=library.removeField(workspace,data.id);break;
                case 'setValue':workspace=library.setValue(workspace,data.id,data.value);break;
                case 'setRule':workspace=library.setRule(workspace,data.rule);break;
                case 'removeRule':workspace=library.removeRule(workspace,data.id);break;
                case 'replaceEditor':{
                    if(!Array.isArray(data.fields)||!Array.isArray(data.rules)||data.fields.length>10000||data.rules.length>1000)fail('INVALID_INPUT');
                    const {engineJson}=await import('./engine/src/services/report/engineContract.js');
                    for(const field of [...workspace.fields])if(!data.fields.some(item=>item.id===field.id))workspace=library.removeField(workspace,field.id);
                    for(const field of data.fields){const old=workspace.fields.find(item=>item.id===field.id);if(!old||engineJson(old)!==engineJson(field))workspace=library.setField(workspace,field);}
                    for(const rule of [...workspace.rules])if(!data.rules.some(item=>item.id===rule.id))workspace=library.removeRule(workspace,rule.id);
                    for(const rule of data.rules){const old=workspace.rules.find(item=>item.id===rule.id);if(!old||engineJson(old)!==engineJson(rule))workspace=library.setRule(workspace,rule);}
                    for(const [id,value]of Object.entries(data.values||{}))if(workspace.values[id]!==value)workspace=library.setValue(workspace,id,value);
                    if(engineJson(workspace.notes)!==engineJson({...workspace.notes,...data.notes}))workspace=library.setNotes(workspace,data.notes||{});break;
                }
                case 'confirmSchema':workspace=library.confirmSchema(workspace);break;
                case 'setNotes':workspace=library.setNotes(workspace,data.notes||{});break;
                case 'confirmManualNotes':workspace=library.confirmManualNotes(workspace);break;
                case 'newRun':workspace=library.startNewRun(workspace);break;
                case 'restoreRun':workspace=library.restoreLastRun(workspace);break;
                case 'buildSummary':extra={draft:library.buildDraft(workspace)};break;
                case 'exportCollection':extra={collection:await collection.createCollectionForm(workspace)};break;
                case 'importCollection':workspace=await collection.importCollectionData(workspace,jsonFile(files.filled));break;
                default:fail('UNSUPPORTED_OPERATION');
            }
            return {ok:true,operation:'discipline',contractVersion:engine.contractVersion,value:{workspace,validation:library.validateData(workspace),results:workspace.rules.map(rule=>library.evaluateRule(workspace,rule)),operations:library.OPERATIONS,...extra,scope:'selected-input-schema-and-calculation-not-a-company-report',reportReady:false},reportReady:false};
        }
        case 'electrical':{
            await requireBundle();const library=await import('./engine/src/services/report/electricalPreparation.js'),thermal=await import('./engine/src/services/report/thermalDelivery.js');
            for(const material of context.materials||[]){const match=files.evidence?.find(file=>file.id===material.id);if(!match||hash(match.bytes)!==material.sha256)fail('BINDING_MISMATCH');}
            const candidates=bundle.pdf?library.electricalPdfCandidates(bundle.pdf,request.projectId,context.settings||{}):library.electricalCandidates(bundle.document);
            const state={...(context.state||{}),plan:{files:[candidates],failures:[]}};
            for(const [sectionId,links]of Object.entries(state.inputs||{})){
                if(!Array.isArray(links)||links.length>1000)fail('INVALID_INPUT');
                for(const link of links){const material=(context.materials||[]).find(item=>item.id===link.materialId&&item.sha256===link.sha256);if(!material)fail('BINDING_MISMATCH');library.linkElectricalInput(material,sectionId);}
            }
            return {ok:true,operation:'electrical',contractVersion:engine.contractVersion,value:{sections:library.ELECTRICAL_SECTIONS.map(({pattern,...section})=>section),candidates,boundInputs:state.inputs||{},kepco:library.resolveKepcoScope(state,true),deliveries:(context.deliveries||[]).map(delivery=>({id:delivery.id,...thermal.thermalDeliveryStatus(delivery,context.materials||[])})),reportReady:false},reportReady:false};
        }
        case 'inspectMaterial':case 'readThermalBmt':case 'readPowerView':{
            const filename=String(parameters.filename||'source'),extension=filename.split('.').at(-1).toLowerCase();let value;
            if(request.operation==='readThermalBmt'||extension==='bmt'){
                value={thermal:await(await import('./engine/src/services/report/thermalBmt.js')).inspectThermalBmt(files.source,filename,{includeImages:parameters.includeImages==='true'})};
                for(const [name,bytes]of Object.entries(value.thermal.images||{})){if(!bytes?.length){delete value.thermal.images[name];continue;}try{boundedPictureDimensions(bytes);}catch(error){delete value.thermal.images[name];(value.thermal.previewLimitations||=[]).push({image:name,code:safeCode(error.code),reason:'Embedded image is not a bounded directly displayable source image; original BMT is unchanged.'});}}
            }
            else if(request.operation==='readPowerView'||extension==='pwv')value={powerView:await(await import('./engine/src/services/report/powerView.js')).inspectPowerView(files.source,filename)};
            else if(extension==='csv'||extension==='xlsx'){
                if(extension==='xlsx'){
                    const {unzipSync}=await import('fflate'),names=new Set();let count=0,total=0;
                    unzipSync(files.source,{filter:entry=>{if(++count>20000||(total+=entry.originalSize)>128*1024*1024||entry.originalSize>24*1024*1024||names.has(entry.name)||!entry.name||/[\\\u0000]/.test(entry.name)||/^(?:\/|[A-Za-z]:)/.test(entry.name)||entry.name.split('/').includes('..'))fail('INVALID_PACKAGE');names.add(entry.name);return false;}});
                }
                value={tables:(await import('./engine/src/services/report/applicationData.js')).readInputTables(files.source,filename)};
            }else if(['pdf','hwpx','hwp'].includes(extension))return engine.analyze(input,options);
            else fail('UNSUPPORTED_FORMAT');
            return {ok:true,operation:request.operation,contractVersion:engine.contractVersion,value,reportReady:false};
        }
        default:fail('UNSUPPORTED_OPERATION');
    }
}
try{
    await readRequest();const files=await loadFiles(),result=await execute(files);
    if(!result?.ok){emit({type:'result',ok:false,error:{code:safeCode(result?.error?.code),message:'The local engine rejected this operation. Inspect the bound source and review context.'}});}
    else{
        const serialized=await serialize(result),bytes=Buffer.from(JSON.stringify(serialized));if(bytes.length>MAX_BUNDLE)fail('OUTPUT_LIMIT');
        const resultFile=await writeOutput(bytes,'json','application/json');
        emit({type:'result',ok:true,resultFile,result_value:{contractVersion:result.contractVersion||null,resultBytes:bytes.length,sourceSha256:request.sourceSha256}});
    }
}catch(error){
    emit({type:'result',ok:false,error:{code:safeCode(error?.code),message:'The isolated local worker rejected the request or input file.'}});
}
