import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {loadMaterial} from '../services/report/reportLibrary.js';
import {openPdfForRendering} from '../services/report/pdfOcr.js';

function PdfSheet({document,page,width,near,filename,location}){
    const surface=useRef(null),[error,setError]=useState('');
    useEffect(()=>{
        if(!near||!document||!width)return;
        let disposed=false,renderTask,source;const canvas=surface.current;
        (async()=>{
            source=await document.getPage(page.number);if(disposed){source.cleanup();return;}
            const natural=source.getViewport({scale:1}),fit=width/natural.width;
            const scale=Math.min(fit*Math.min(window.devicePixelRatio||1,2),Math.sqrt(8000000/(natural.width*natural.height)));
            const viewport=source.getViewport({scale});
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            canvas.setAttribute('aria-busy','true');
            renderTask=source.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});
            await renderTask.promise;if(disposed)return;
            canvas.dataset.rendered='true';canvas.setAttribute('aria-busy','false');setError('');
        })().catch(reason=>{if(!disposed)setError(reason?.message||'PDF 쪽을 표시하지 못했습니다.');});
        return()=>{disposed=true;renderTask?.cancel();delete canvas.dataset.rendered;canvas.width=0;canvas.height=0;if(renderTask)renderTask.promise.catch(()=>{}).finally(()=>source?.cleanup());else source?.cleanup();};
    },[document,page.number,width,near]);
    return <div className="studio-pdf-sheet studio-pdf-canvas" data-page-number={page.number} style={{height:width?width*page.height/page.width:undefined,aspectRatio:`${page.width}/${page.height}`}} aria-label={`보고서 ${page.number}쪽`}>
        {near&&<canvas ref={surface} aria-label={`${filename} 원문 ${page.number}쪽`} role="img"/>}
        {location?.page===page.number&&Array.isArray(location.bbox)&&location.bbox.length===4&&location.bbox.every(Number.isFinite)&&<div className="studio-pdf-location-marker" aria-label="선택한 원문 위치" style={{left:`${location.bbox[0]/page.width*100}%`,top:`${location.bbox[1]/page.height*100}%`,width:`${(location.bbox[2]-location.bbox[0])/page.width*100}%`,height:`${(location.bbox[3]-location.bbox[1])/page.height*100}%`}}/>}
        {error&&<p className="studio-error" role="alert">{error}</p>}
    </div>;
}

function PageNavigation({page,total,onJump,sourcePage}){
    const [draft,setDraft]=useState(null),typed=useRef(null);
    const commit=()=>{if(typed.current===null)return;const n=Number(typed.current);typed.current=null;setDraft(null);if(Number.isInteger(n)&&n>=1&&n<=total)onJump(n);};
    return <nav className="studio-pdf-navigation studio-report-page-navigation" aria-label="보고서 페이지 이동">
        <button className="studio-icon" title="이전 페이지" aria-label="이전 페이지" disabled={!total||page<=1} onClick={()=>onJump(page-1)}><ChevronLeft size={17}/></button>
        <label><input aria-label="PDF 원문 표시 쪽" title="페이지 번호 입력 후 Enter" type="number" min="1" max={total||1} value={draft??page} disabled={!total} onChange={e=>{typed.current=e.target.value;setDraft(e.target.value);}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();e.currentTarget.blur();}if(e.key==='Escape'){typed.current=null;setDraft(null);e.currentTarget.blur();}}}/><span aria-label="전체 페이지 수">/ {total||'…'}{sourcePage?` · 원본 ${sourcePage}쪽`:''}</span></label>
        <button className="studio-icon" title="다음 페이지" aria-label="다음 페이지" disabled={!total||page>=total} onClick={()=>onJump(page+1)}><ChevronRight size={17}/></button>
    </nav>;
}

// Keep every page in the scroll layout, but allocate canvases only near the viewport.
export default function PdfContinuousView({userId,material,initialPage=1,requestedPage,navigationTarget,onPageChange,visible=true,pageNumbers}){
    const host=useRef(null),active=useRef(initialPage),jumpRef=useRef(null),consumedRequest=useRef(null),callbacks=useRef({onPageChange});
    const [source,setSource]=useState(null),[error,setError]=useState(''),[width,setWidth]=useState(0),[near,setNear]=useState(new Set()),[page,setPage]=useState(initialPage);
    useEffect(()=>{callbacks.current={onPageChange};},[onPageChange]);
    const pageKey=JSON.stringify(pageNumbers||null);
    useEffect(()=>{let disposed=false,task;
        (async()=>{const blob=await loadMaterial(userId,material.id);if(disposed)return;setSource(null);setError('');setNear(new Set());task=await openPdfForRendering(await blob.arrayBuffer());if(disposed){task.promise.catch(()=>{});await task.destroy();return;}
            const document=await task.promise,pages=[],numbers=JSON.parse(pageKey)||Array.from({length:document.numPages},(_,i)=>i+1);
            if(!numbers.length||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isInteger(n)||n<1||n>document.numPages))throw new Error('장 미리보기의 원본 페이지 범위를 확인하세요.');
            for(let start=0;start<numbers.length;start+=12){const batch=await Promise.all(numbers.slice(start,start+12).map(async number=>{const proxy=await document.getPage(number),viewport=proxy.getViewport({scale:1});return {number,width:viewport.width,height:viewport.height};}));if(disposed)return;pages.push(...batch);}
            if(!disposed)setSource({document,pages});
        })().catch(reason=>{if(!disposed)setError(reason?.message||'PDF를 표시하지 못했습니다.');});
        return()=>{disposed=true;task?.destroy().catch(()=>{});};
    },[userId,material.id,material.sha256,pageKey]);
    useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.floor(entry.contentRect.width)));observer.observe(host.current);return()=>observer.disconnect();},[]);
    useEffect(()=>{
        if(!source||!visible||!width)return;
        const container=host.current;if(!container)return;
        const root=container.closest('.studio-scroll'),sheets=[...container.querySelectorAll('[data-page-number]')];if(!root)return;let disposed=false;
        const notify=number=>{if(active.current===number)return;active.current=number;setPage(number);callbacks.current.onPageChange?.(number);};
        const header=()=>container.closest('.studio-report-workspace')?.querySelector('.studio-report-heading')?.getBoundingClientRect().height||0;
        let frame;
        const update=()=>{frame=null;if(disposed||!container.offsetWidth)return;const bounds=root.getBoundingClientRect(),probe=bounds.top+header()+Math.min(120,Math.max(20,(bounds.height-header())*.2));let closest=1,distance=Infinity;
            for(const sheet of sheets){const rect=sheet.getBoundingClientRect(),gap=probe<rect.top?rect.top-probe:probe>rect.bottom?probe-rect.bottom:0;if(gap<distance){distance=gap;closest=Number(sheet.dataset.pageNumber);}if(rect.top>probe&&distance===0)break;}
            notify(closest);
        };
        const schedule=()=>{if(!disposed&&frame==null)frame=requestAnimationFrame(update);};
        const jump=(number,bbox)=>{const index=source.pages.findIndex(item=>item.number===number),target=sheets[index];if(!target)return;const offset=Array.isArray(bbox)&&bbox.length===4&&bbox.every(Number.isFinite)?target.getBoundingClientRect().height*bbox[1]/source.pages[index].height:0;root.scrollTo({top:root.scrollTop+target.getBoundingClientRect().top+offset-root.getBoundingClientRect().top-header()-(bbox?40:12),behavior:'instant'});notify(number);schedule();};
        jumpRef.current=jump;
        const observer=new IntersectionObserver(entries=>{setNear(previous=>{const next=new Set(previous);for(const entry of entries){const n=Number(entry.target.dataset.pageNumber);if(entry.isIntersecting)next.add(n);else next.delete(n);}return next;});},{root,rootMargin:'800px 0px'});
        sheets.forEach(sheet=>observer.observe(sheet));root.addEventListener('scroll',schedule,{passive:true});
        jump(source.pages.some(item=>item.number===active.current)?active.current:source.pages[0].number);
        return()=>{disposed=true;observer.disconnect();root.removeEventListener('scroll',schedule);if(frame!=null)cancelAnimationFrame(frame);jumpRef.current=null;};
    },[source,width,visible]);
    useEffect(()=>{if(requestedPage?.page&&consumedRequest.current!==requestedPage&&visible&&source&&width){jumpRef.current?.(requestedPage.page,requestedPage.bbox);consumedRequest.current=requestedPage;}},[requestedPage,visible,source,width]);
    const displayPage=source?Math.max(1,source.pages.findIndex(item=>item.number===page)+1):1;
    const navigation=<PageNavigation page={displayPage} total={source?.pages.length||0} sourcePage={pageNumbers?source?.pages[displayPage-1]?.number:undefined} onJump={number=>jumpRef.current?.(source?.pages[number-1]?.number)}/>;
    return <>{navigationTarget&&createPortal(navigation,navigationTarget)}<div className="studio-pdf-continuous" ref={host} aria-label="보고서 연속 페이지">
        {error&&<p role="alert" className="studio-error">{error}</p>}{!source&&!error&&<p className="studio-center" role="status">문서를 여는 중입니다…</p>}
        {source?.pages.map(item=><PdfSheet key={item.number} document={source.document} page={item} width={width} near={visible&&near.has(item.number)} filename={material.filename} location={requestedPage}/>)}
    </div></>;
}
