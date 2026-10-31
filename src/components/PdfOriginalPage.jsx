import {useEffect,useRef,useState} from 'react';
import {loadMaterial} from '../services/report/reportLibrary.js';
import {openPdfForRendering} from '../services/report/pdfOcr.js';

// The original PDF is rendered for comparison. Editable output is a separate HWPX.
export default function PdfOriginalPage({userId,material,pageNumber,onPageChange}) {
    const [document,setDocument]=useState(null),[width,setWidth]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
    const host=useRef(null),surface=useRef(null);
    useEffect(()=>{
        const observer=new ResizeObserver(entries=>setWidth(Math.floor(entries[0].contentRect.width)));
        observer.observe(host.current);return()=>observer.disconnect();
    },[]);
    useEffect(()=>{
        let disposed=false,task;setDocument(null);setBusy(true);setError('');
        (async()=>{
            const blob=await loadMaterial(userId,material.id);
            if(disposed)return;
            task=await openPdfForRendering(await blob.arrayBuffer());
            if(disposed){await task.destroy();return;}
            const doc=await task.promise;if(!disposed)setDocument(doc);
        })().catch(reason=>{if(!disposed){setError(reason?.message||'PDF 원문을 표시하지 못했습니다.');setBusy(false);}});
        return()=>{disposed=true;task?.destroy().catch(()=>{});};
    },[userId,material.id,material.sha256]);
    useEffect(()=>{
        if(!document||width<1)return;
        let disposed=false,renderTask,page,canvas;
        setBusy(true);setError('');
        (async()=>{
            page=await document.getPage(Math.min(document.numPages,Math.max(1,pageNumber)));
            if(disposed)return;
            const natural=page.getViewport({scale:1}),fit=Math.max(.2,(width-32)/natural.width);
            const scale=Math.min(fit*Math.min(window.devicePixelRatio||1,2),Math.sqrt(8000000/(natural.width*natural.height)));
            const viewport=page.getViewport({scale});
            canvas=window.document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            canvas.style.width=`${natural.width*fit}px`;canvas.style.height=`${natural.height*fit}px`;
            canvas.setAttribute('aria-label',`${material.filename} 원문 ${pageNumber}쪽`);canvas.setAttribute('role','img');
            surface.current.replaceChildren(canvas);
            renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});
            await renderTask.promise;
            if(!disposed){canvas.dataset.rendered='true';setBusy(false);}
        })().catch(reason=>{if(!disposed){setError(reason?.message||'PDF 쪽을 표시하지 못했습니다.');setBusy(false);}});
        return()=>{disposed=true;renderTask?.cancel();};
    },[document,width,pageNumber,material.filename]);
    const total=document?.numPages||1;
    return <div className="studio-pdf-original" ref={host}>
        <div className="studio-pdf-navigation"><button className="studio-secondary" title="이전 쪽" disabled={pageNumber<=1} onClick={()=>onPageChange(pageNumber-1)}>←</button><label>원문 쪽 <input aria-label="PDF 원문 표시 쪽" type="number" min="1" max={total} value={pageNumber} disabled={!document} onChange={event=>{const n=Number(event.target.value);if(Number.isInteger(n)&&n>=1&&n<=total)onPageChange(n);}}/> / {document?.numPages||'…'}</label><button className="studio-secondary" title="다음 쪽" disabled={!document||pageNumber>=total} onClick={()=>onPageChange(pageNumber+1)}>→</button><span>{busy?'원문을 표시하고 있습니다…':'PDF 원문 대조 화면'}</span></div>
        {error&&<p className="studio-error" role="alert">{error}</p>}
        <div className="studio-pdf-canvas" ref={surface} aria-busy={busy}/>
    </div>;
}
