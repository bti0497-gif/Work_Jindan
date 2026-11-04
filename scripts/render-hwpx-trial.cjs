// Isolated, local rendering of the candidate bytes. Never supplies the source PDF.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');

async function browser(){
    const {app,BrowserWindow}=require('electron');app.setPath('userData',process.env.HWPX_TRIAL_DATA);await app.whenReady();
    const win=new BrowserWindow({show:false,width:1100,height:1400,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
    win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(request,done)=>done({cancel:new URL(request.url).hostname!=='127.0.0.1'}));
    win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error(message);});
    try{
        await win.loadURL(process.env.HWPX_TRIAL_URL);
        const result=await win.webContents.executeJavaScript('window.trialReady');
        if(result.pages!==1&&!process.env.HWPX_TRIAL_PREVIEW_ONLY)throw new Error('The candidate lays out as '+result.pages+' pages, expected one.');
        const folder=path.dirname(process.env.HWPX_TRIAL_SOURCE);
        if(process.env.HWPX_TRIAL_PREVIEW_ONLY){
            const prefix='preview-page'+result.info.pageNumber;await fs.writeFile(path.join(folder,prefix+'.svg'),result.svg);
            win.setContentSize(Math.ceil(result.info.width),Math.ceil(result.info.height));await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
            await fs.writeFile(path.join(folder,prefix+'.png'),(await win.webContents.capturePage()).toPNG());delete result.svg;await fs.writeFile(path.join(folder,prefix+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return;
        }
        await fs.writeFile(path.join(folder,'candidate.svg'),result.svg);
        const pdf=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:false,pageSize:{width:result.info.width/96,height:result.info.height/96},margins:{top:0,bottom:0,left:0,right:0}});
        await fs.writeFile(path.join(folder,'candidate.pdf'),pdf);
        delete result.svg;await fs.writeFile(path.join(folder,'render-evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    }finally{win.destroy();app.exit(process.exitCode||0);}
}

async function main(){
    const args=process.argv.slice(2),positional=args.filter(a=>!a.startsWith('--')),previewOnly=args.includes('--preview-only'),printedPage=Number(args.find(a=>a.startsWith('--printed-page='))?.split('=')[1]||0);
    const source=path.resolve(positional[0]),fontConfig=positional[1]?JSON.parse(await fs.readFile(positional[1],'utf8')):[],temp=await fs.mkdtemp(path.join(os.tmpdir(),'jindan-onepage-'));
    const {createServer}=await import('vite'),{reportRuntimeAssets}=await import('./report-runtime-assets.mjs');
    const fonts=await Promise.all(fontConfig.map(async item=>({family:item.family,data:Buffer.from(await fs.readFile(item.file)).toString('base64')})));
    const entry=`import init,{HwpDocument}from'@rhwp/core';import wasm from'@rhwp/core/rhwp_bg.wasm?url';window.trialReady=(async()=>{
        const fonts=${JSON.stringify(fonts)};for(const font of fonts){const f=new FontFace(font.family,'url(data:font/ttf;base64,'+font.data+')');await f.load();document.fonts.add(f);}await document.fonts.ready;
        const canvas=document.createElement('canvas'),context=canvas.getContext('2d');globalThis.measureTextWidth=(font,text)=>{context.font=font;return context.measureText(text).width;};
        await init({module_or_path:wasm});const bytes=new Uint8Array(await(await fetch('/__candidate')).arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''),doc=new HwpDocument(bytes);
        const pages=doc.pageCount();let pageIndex=0;if(${printedPage}){pageIndex=Array.from({length:pages},(_,i)=>JSON.parse(doc.getPageInfo(i))).findIndex(p=>p.pageNumber===${printedPage});if(pageIndex<0)throw new Error('Requested printed page not found');}const info=JSON.parse(doc.getPageInfo(pageIndex));let svg=doc.renderPageSvg(pageIndex);doc.free();
        const styles=fonts.map(font=>'@font-face{font-family:'+JSON.stringify(font.family)+';src:url(data:font/ttf;base64,'+font.data+')}').join('');svg=svg.replace('<defs>','<defs><style>'+styles+'</style>');
        const css=document.createElement('style');css.textContent='@page{size:'+info.width*.75+'pt '+info.height*.75+'pt;margin:0}html,body{margin:0;padding:0;width:'+info.width*.75+'pt;height:'+info.height*.75+'pt;background:white}svg{display:block;width:100%;height:100%}';document.head.append(css);document.body.innerHTML=svg;await document.fonts.ready;await Promise.all(Array.from(document.images,i=>i.decode()));
        return {pages,pageIndex,info,svg,sourceSha256:hash,renderer:'rhwp/0.8.7',loadedFonts:fonts.map(font=>font.family),hancomOutputVerified:false};})();`;
    const server=await createServer({configFile:false,root:path.resolve(__dirname,'..'),envDir:temp,cacheDir:path.join(temp,'vite-cache'),worker:{format:'es'},optimizeDeps:{include:['@rhwp/core']},server:{host:'127.0.0.1',port:0},plugins:[reportRuntimeAssets(),{name:'hwpx-trial',resolveId:id=>id==='/__trial.js'?'\0trial':undefined,load:id=>id==='\0trial'?entry:undefined,configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url==='/__candidate'){res.setHeader('Content-Type','application/octet-stream');require('node:fs').createReadStream(source).pipe(res);return;}if(req.url!=='/__trial')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><head></head><body><script type="module" src="/__trial.js"></script></body></html>'));});}}]});
    await server.listen();
    const electron=require('electron'),env={...process.env,HWPX_TRIAL_SOURCE:source,HWPX_TRIAL_URL:server.resolvedUrls.local[0]+'__trial',HWPX_TRIAL_DATA:path.join(temp,'user'),...(previewOnly?{HWPX_TRIAL_PREVIEW_ONLY:'1'}:{})};delete env.ELECTRON_RUN_AS_NODE;
    try{
        const run=(command,args)=>new Promise((resolve,reject)=>{const child=require('node:child_process').spawn(command,args,{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Trial command exit '+code)));});
        await run(electron,[__filename]);
        if(previewOnly)return;
        const folder=path.dirname(source),pdf=path.join(folder,'candidate.pdf'),normalized=path.join(folder,'candidate-paper.pdf');
        await run('python',[path.join(__dirname,'../skills/technical-report-hwpx/scripts/normalize-trial-paper.py'),'--hwpx',source,'--pdf',pdf,'--output',normalized]);await fs.rename(normalized,pdf);
        const reportFile=path.join(folder,'render-evidence.json'),report=JSON.parse(await fs.readFile(reportFile,'utf8'));report.pdfPaperNormalizedFromCandidateXml=true;report.pdfPaperUpperLeftOriginPreserved=true;await fs.writeFile(reportFile,JSON.stringify(report,null,2));
    }finally{await server.close();}
}
if(process.versions.electron)browser().catch(error=>{console.error(error);require('electron').app.exit(1);});else main().catch(error=>{console.error(error);process.exitCode=1;});
