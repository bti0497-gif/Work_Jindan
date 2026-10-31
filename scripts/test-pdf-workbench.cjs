// Opt-in real PDF check. The input stays outside the repository and test data is private.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function checks(){
    const lib=window.__lib,wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn,label)=>{for(let i=0;i<2400;i++){const value=await fn();if(value)return value;const alert=document.querySelector('[role="alert"]');if(alert)throw new Error(`${label}: ${alert.textContent}`);await wait(50);}throw new Error(`Timeout: ${label}`);};
    const named=name=>document.querySelector(`[aria-label="${name}"]`),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    const fill=(input,value)=>{const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const check=(condition,label)=>{if(!condition)throw new Error(label);};
    await until(()=>named('작성할 시설 보고서')&&!named('작성할 시설 보고서').disabled,'studio ready');
    fill(named('작성할 시설 보고서'),'project:pdf-project');await until(()=>document.querySelector('.studio-electrical'),'registered project');
    const bytes=window.__privatePdfBase64?Uint8Array.from(atob(window.__privatePdfBase64),c=>c.charCodeAt(0)).buffer:await(await fetch('/__private_pdf')).arrayBuffer(),picker=named('프로젝트 기존 보고서 파일 선택'),files=new DataTransfer();files.items.add(new File([bytes],'검증 전회 보고서.pdf'));picker.files=files.files;picker.dispatchEvent(new Event('change',{bubbles:true}));
    const book=await until(async()=>{const b=await lib.loadStudio('pdf-test','project:pdf-project');return b.pdfAnalyses?.[b.activeReportId]?b:null;},'actual PDF analysis through worker');
    const originalId=book.activeReportId,analysis=book.pdfAnalyses[originalId];
    check(analysis.summary.pages===129&&analysis.summary.disciplines.electrical>20,'Full actual report has electrical pages');
    check(analysis.pages[102].tables[0].columns===3,'Actual electrical checklist recovered');
    console.log('PASS real PDF page and table analysis');
    fill(named('PDF 작성 시작 쪽'),'103');fill(named('PDF 작성 끝 쪽'),'103');button('선택 범위 적용').click();
    await until(async()=>(await lib.loadStudio('pdf-test','project:pdf-project')).pdfAuthoring?.[originalId]?.pages.length===1,'single page selection');
    const canvas=await until(()=>document.querySelector('.studio-pdf-canvas canvas[data-rendered="true"][aria-label$="103쪽"]'),'original page canvas');
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<pixels.length;i+=64)if(pixels[i]<220||pixels[i+1]<220||pixels[i+2]<220)ink++;
    check(ink>100,'Original PDF visibly renders text and pictures');
    button('선택 쪽 이미지 본문 OCR 보강').click();
    const supplemented=await until(async()=>{const b=await lib.loadStudio('pdf-test','project:pdf-project');return b.pdfAnalyses[originalId].pages[102].ocr;},'bundled offline Korean OCR');
    check(supplemented.lines.some(line=>line.text.replace(/\s/g,'').includes('전기설비에대한현황')),'Raster paragraph becomes editable Korean text');
    console.log('PASS offline Korean OCR');
    const cell=named(`${analysis.pages[102].tables[0].cells.find(c=>c.text.includes('계약 종별')).id} PDF 추출 셀 수정`);
    fill(cell,'계약종별');cell.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
    await until(async()=>(await lib.loadStudio('pdf-test','project:pdf-project')).pdfAnalyses[originalId].pages[102].tables[0].cells.some(c=>c.editedByUser&&c.text==='계약종별'),'manual extraction correction saved');
    fill(named('PDF 출력 본문 크기'),'11');
    await until(async()=>(await lib.loadStudio('pdf-test','project:pdf-project')).pdfAuthoring[originalId].outputSpec?.fontSizePt===11,'project-bound output specification');
    button('전기 원문 HWPX 재구성').click();
    const reference=await until(async()=>{const b=await lib.loadStudio('pdf-test','project:pdf-project');return b.pdfWritingRuns?.some(r=>r.mode==='reference')?b:null;},'reference HWPX generation');
    const referenceId=reference.activeReportId,referenceBlob=await lib.loadMaterial('pdf-test',referenceId),referenceDoc=await window.__parser.analyzeReport(await referenceBlob.arrayBuffer(),'reference.hwpx');
    check(referenceDoc.tables.length===1&&referenceDoc.tables[0].cells.some(c=>c.text.includes('이상 없음')),'Reference has editable historical table');
    check(referenceDoc.paragraphs.some(p=>p.text.replace(/\s/g,'').includes('전기설비에대한현황')),'OCR text is written as HWPX text');
    console.log('PASS reference HWPX with pictures and editable text');
    const original=(await lib.listMaterials('pdf-test')).find(m=>m.id===originalId);named(`${original.filename} 보고서 작업 열기`).click();
    await until(()=>named('PDF 분석과 전기 한글 작성'),'source reopened');
    const reviewed=named('PDF 양식 항목 열 검토 완료');reviewed.click();await wait(60);
    button('금회 전기 HWPX 양식 생성').click();
    const draft=await until(async()=>{const b=await lib.loadStudio('pdf-test','project:pdf-project');return b.pdfWritingRuns?.some(r=>r.mode==='draft')?b:null;},'current blank HWPX generation');
    const draftBlob=await lib.loadMaterial('pdf-test',draft.activeReportId),draftDoc=await window.__parser.analyzeReport(await draftBlob.arrayBuffer(),'draft.hwpx');
    check(draftDoc.tables[0].cells.filter(c=>c.row>0&&c.column>0).every(c=>c.text===''),'Historical values and judgments are blanked');
    check(draftDoc.tables[0].cells.some(c=>c.text.includes('계약종별')),'Corrected left checklist labels remain');
    check((await lib.loadMaterial('pdf-test',originalId)).size===bytes.byteLength,'Original PDF remains unchanged');
    fill(named('작성할 시설 보고서'),'project:other-project');await until(()=>document.querySelector('.studio-electrical h1')?.textContent.includes('다른 프로젝트'),'switch project');
    check(!document.querySelector('.studio-report-sidebar li'),'Other project cannot see this report');
    fill(named('작성할 시설 보고서'),'project:pdf-project');await until(()=>named(`${original.filename} 보고서 작업 열기`),'return to source project');named(`${original.filename} 보고서 작업 열기`).click();await until(()=>document.querySelector('.studio-pdf-summary'),'source analysis restored');document.querySelector('.studio-pdf-page-controls').open=true;fill(named('PDF 원문 표시 쪽'),'103');await until(()=>document.querySelector('.studio-pdf-canvas canvas[data-rendered="true"][aria-label$="103쪽"]'),'restored source canvas');
    return {summary:analysis.summary,ocrLines:supplemented.lines.length,reference:Array.from(new Uint8Array(await referenceBlob.arrayBuffer())),draft:Array.from(new Uint8Array(await draftBlob.arrayBuffer()))};
}
async function browser(){
    const {app,BrowserWindow}=require('electron');app.setPath('userData',process.env.PDF_CHECK_USER_DATA);await app.whenReady();
    const window=new BrowserWindow({show:false,width:1560,height:1050,webPreferences:{contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>callback({cancel:new URL(details.url).hostname!=='127.0.0.1'}));
    window.webContents.on('console-message',(_e,level,message)=>{if(level>=3||message.startsWith('PASS'))console.error(message);});
    window.webContents.session.webRequest.onErrorOccurred(details=>console.error('Runtime resource failure:',details.error,details.url));
    const deadline=setTimeout(()=>{console.error('PDF workbench check exceeded four minutes');app.exit(1);},240000);
    try{if(process.env.PDF_CHECK_FILE){await window.loadFile(process.env.PDF_CHECK_FILE);await window.webContents.executeJavaScript(`window.__privatePdfBase64=${JSON.stringify((await fs.readFile(process.env.REPORT_PDF_CHECK_SOURCE)).toString('base64'))}`);}else await window.loadURL(process.env.PDF_CHECK_URL);const result=await window.webContents.executeJavaScript(`(${checks.toString()})()`);const output=path.resolve('.firebase/pdf-only');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'electrical-reference-real.hwpx'),Buffer.from(result.reference));await fs.writeFile(path.join(output,'electrical-draft-real.hwpx'),Buffer.from(result.draft));await fs.writeFile(path.join(output,'pdf-workbench.png'),(await window.webContents.capturePage()).toPNG());console.log(JSON.stringify({passed:true,packagedFileMode:!!process.env.PDF_CHECK_FILE,summary:result.summary,ocrLines:result.ocrLines,referenceBytes:result.reference.length,draftBytes:result.draft.length}));}
    catch(error){console.error(error);await fs.writeFile(path.resolve('.firebase/pdf-only/pdf-error.png'),(await window.webContents.capturePage()).toPNG());process.exitCode=1;}
    finally{clearTimeout(deadline);window.destroy();app.exit(process.exitCode||0);}
}
async function main(){
    if(!process.env.REPORT_PDF_CHECK_SOURCE)throw new Error('Set REPORT_PDF_CHECK_SOURCE to an authorized local full Daecheong PDF for the opt-in real-file check.');
    const source=path.resolve(process.env.REPORT_PDF_CHECK_SOURCE);assert.ok((await fs.stat(source)).isFile());
    const {createServer,build}=await import('vite'),{default:react}=await import('@vitejs/plugin-react'),{reportRuntimeAssets}=await import('./report-runtime-assets.mjs');
    const temporary=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'jindan-pdf-check-'));
    const entry=`import React from 'react';import{createRoot}from'react-dom/client';import ReportStudio from '/src/components/ReportStudio.jsx';import{dbService}from'/src/services/dbService.js';import*as lib from'/src/services/report/reportLibrary.js';import*as parser from'/src/services/report/sourceParser.js';import'/src/index.css';window.__lib=lib;window.__parser=parser;dbService.setTable('프로젝트관리',[{id:'pdf-project',title:'PDF 작성 검증 프로젝트'},{id:'other-project',title:'다른 프로젝트'}]);createRoot(document.getElementById('root')).render(React.createElement(ReportStudio,{currentUser:{person_id:'pdf-test'},onExit:()=>{},showConfirm:async()=>true,showPrompt:async()=>''}));`;
    const server=await createServer({configFile:false,root:path.resolve(__dirname,'..'),envDir:temporary,worker:{format:'es'},server:{host:'127.0.0.1',port:0},plugins:[react(),reportRuntimeAssets(),{name:'private-pdf-test',resolveId:id=>id==='/__pdf_entry.jsx'?'\0pdf-entry':undefined,load:id=>id==='\0pdf-entry'?entry:undefined,configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url==='/__private_pdf'){res.setHeader('Content-Type','application/pdf');require('node:fs').createReadStream(source).pipe(res);return;}if(req.url!=='/__pdf_check')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html lang="ko"><body><div id="root"></div><script type="module" src="/__pdf_entry.jsx"></script></body></html>'));});}}]});
    try{let builtFile;if(process.env.PDF_CHECK_PACKAGED){process.env.NODE_ENV='production';const html=path.resolve('.firebase/pdf-check-entry.html');await fs.writeFile(html,'<html lang="ko"><body><div id="root"></div><script type="module" src="/__pdf_entry.jsx"></script></body></html>');await build({configFile:false,root:path.resolve(__dirname,'..'),base:'./',envDir:temporary,logLevel:'error',worker:{format:'es'},plugins:[react(),reportRuntimeAssets(),{name:'pdf-private-build',resolveId:id=>id==='/__pdf_entry.jsx'?'\0pdf-entry':undefined,load:id=>id==='\0pdf-entry'?entry:undefined}],build:{outDir:path.join(temporary,'build'),emptyOutDir:true,rollupOptions:{input:html}}});builtFile=path.join(temporary,'build','index.html');await fs.writeFile(builtFile,(await fs.readFile(path.join(temporary,'build','.firebase','pdf-check-entry.html'),'utf8')).replaceAll('../assets/','./assets/'));}else await server.listen();const env={...process.env,...(builtFile?{PDF_CHECK_FILE:builtFile}:{PDF_CHECK_URL:server.resolvedUrls.local[0]+'__pdf_check'}),PDF_CHECK_USER_DATA:path.join(temporary,'user')};delete env.ELECTRON_RUN_AS_NODE;const child=require('node:child_process').spawn(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});}
    finally{await server.close();const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(require('node:os').tmpdir()));assert.ok(path.basename(resolved).startsWith('jindan-pdf-check-'));await fs.rm(resolved,{recursive:true,force:true});}
}
if(process.versions.electron)browser();else main().catch(error=>{console.error(error);process.exitCode=1;});
