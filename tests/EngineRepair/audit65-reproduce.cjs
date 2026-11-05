const fs=require('node:fs'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const requireProject=createRequire('F:/jindan-dotnet/package.json');
const {zipSync,strToU8,strFromU8}=requireProject('fflate');
(async()=>{
 const {createReportEngine}=await import('file:///F:/jindan-dotnet/src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js');
 const {readHwpxPackage}=await import('file:///F:/jindan-dotnet/src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js');
 const findings=[];
 for(const thrown of [null,undefined]){
   try{const r=await createReportEngine({analyzePdf:async()=>{throw thrown;}}).analyze({bytes:strToU8('%PDF-1.7 synthetic'),projectId:'project:audit65'});findings.push({case:'non-error throw '+String(thrown),structuredResult:true,result:r});}
   catch(e){findings.push({case:'non-error throw '+String(thrown),structuredResult:false,rejection:e.message});}
 }
 const {buildPdfAnalysis}=await import('file:///F:/jindan-dotnet/src/Jindan.Report.Worker/engine/src/services/report/pdfStructure.js');
 let release,startedResolve;const started=new Promise(r=>startedResolve=r);const controller=new AbortController();let settled=false;
 const engine=createReportEngine({analyzePdf:async(bytes,filename,id)=>{startedResolve();await new Promise(r=>release=r);return buildPdfAnalysis([{number:1,widthPt:595,heightPt:842,lines:[],images:[],tables:[],warnings:[]}],{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),filename,format:'pdf'},id);}});
 const pending=engine.analyze({bytes:strToU8('%PDF-1.7 synthetic'),projectId:'project:audit65'},{signal:controller.signal}).then(r=>{settled=true;return r;});await started;controller.abort();await new Promise(r=>setTimeout(r,30));const settledBeforeRelease=settled;release();const cancelled=await pending;findings.push({case:'noncooperative adapter cancellation',settledBeforeRelease,result:cancelled});
 const first='<hp:section xmlns:hp="urn:test"><hp:p><hp:run><hp:t>FIRST</hp:t></hp:run></hp:p></hp:section>',last=first.replace('FIRST','LAST!');const zipped=zipSync({'Contents/section0.xml':strToU8(first),'Contents/section1.xml':strToU8(last)});
 const from=Buffer.from('Contents/section1.xml'),to=Buffer.from('Contents/section0.xml'),dup=Buffer.from(zipped);let replacements=0;for(let p=0;(p=dup.indexOf(from,p))>=0;p+=from.length){to.copy(dup,p);replacements++;}
 try{const entries=readHwpxPackage(dup);findings.push({case:'duplicate HWPX ZIP member',replacements,accepted:true,selected:strFromU8(entries['Contents/section0.xml'])});}catch(e){findings.push({case:'duplicate HWPX ZIP member',accepted:false,error:e.message});}
 const {pdfAuthoringPlan,writePdfHwpx}=await import('file:///F:/jindan-dotnet/src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
 const pdf={schema:'jindan-pdf-analysis/1',projectId:'project:audit65',source:{sha256:'a'.repeat(64)},pages:[{number:1,kind:'body',discipline:'process',chapter:'Chapter',widthPt:595,heightPt:842,images:[],tables:[],lines:[{text:'FIRST',bbox:[50,80,300,100],size:16}]}]};
 const normal=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},'project:audit65','reference')).bytes,normalEntries=readHwpxPackage(normal);
 normalEntries['Contents/section1.xml']=strToU8(strFromU8(normalEntries['Contents/section0.xml']).replace('FIRST','LAST!'));
 const fullDuplicate=Buffer.from(zipSync(normalEntries));for(let p=0;(p=fullDuplicate.indexOf(from,p))>=0;p+=from.length)to.copy(fullDuplicate,p);
 const baseline=await createReportEngine().analyze({bytes:normal,filename:'baseline.hwpx',projectId:'project:audit65'});
 const duplicated=await createReportEngine().analyze({bytes:fullDuplicate,filename:'duplicate.hwpx',projectId:'project:audit65'});
 findings.push({case:'full generated HWPX duplicate member through facade',baselineAccepted:baseline.ok,duplicateAccepted:duplicated.ok,baselineText:baseline.value?.document?.paragraphs?.map(p=>p.text),duplicateText:duplicated.value?.document?.paragraphs?.map(p=>p.text),error:duplicated.error});
 const all={scope:'offline synthetic audit only; source files unchanged; no native layout claims',findings};fs.writeFileSync(process.argv[2],JSON.stringify(all,null,2));console.log(JSON.stringify(all,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
