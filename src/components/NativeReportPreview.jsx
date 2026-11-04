import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {loadMaterial} from '../services/report/reportLibrary.js';
import {createNativePreview,nativeSvgAtDisplaySize} from '../services/report/nativePreview.js';

function NativePageImage({engine,number,filename,width}){
    const surface=useRef(null),[svg,setSvg]=useState(''),[error,setError]=useState('');
    useEffect(()=>{let disposed=false;
        engine.page(number).then(({svg})=>{if(!disposed)setSvg(svg);}).catch(reason=>{if(!disposed)setError(reason.message);});
        return()=>{disposed=true;};
    },[engine,number]);
    useEffect(()=>{if(!svg||!width)return;const url=URL.createObjectURL(new Blob([nativeSvgAtDisplaySize(svg,width,window.devicePixelRatio||1)],{type:'image/svg+xml'}));delete surface.current.dataset.rendered;surface.current.src=url;return()=>URL.revokeObjectURL(url);},[svg,width]);
    return <><img ref={surface} hidden={!svg} alt={`${filename} ${number}쪽`} onLoad={e=>{e.currentTarget.dataset.rendered='true';}} onError={()=>setError('한글 페이지를 표시하지 못했습니다. 보고서를 다시 선택하세요.')}/>{!svg&&!error&&<span className="studio-native-page-loading">{number}쪽 표시 중…</span>}{error&&<p className="studio-error" role="alert">{error}</p>}</>;
}

function NativeSheet({engine,item,near,filename,width}){
    return <div className="studio-native-sheet" data-native-page={item.number} style={{aspectRatio:`${item.width}/${item.height}`}} aria-label={`한글 문서 ${item.number}쪽`}>
        {near&&width>0&&<NativePageImage engine={engine} number={item.number} filename={filename} width={width}/>}
    </div>;
}

function NativeNavigation({page,total,onJump}){
    const [draft,setDraft]=useState(null),typed=useRef(null);
    const commit=()=>{if(typed.current===null)return;const number=Number(typed.current);typed.current=null;setDraft(null);if(Number.isInteger(number)&&number>=1&&number<=total)onJump(number);};
    return <nav className="studio-pdf-navigation studio-report-page-navigation" aria-label="한글 페이지 이동">
        <button className="studio-icon" aria-label="한글 이전 페이지" title="이전 페이지" disabled={page<=1||!total} onClick={()=>onJump(page-1)}><ChevronLeft size={17}/></button>
        <label><input type="number" aria-label="한글 표시 쪽" title="페이지 번호 입력 후 Enter" min="1" max={total||1} value={draft??page} disabled={!total} onChange={e=>{typed.current=e.target.value;setDraft(e.target.value);}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();e.currentTarget.blur();}else if(e.key==='Escape'){typed.current=null;setDraft(null);e.currentTarget.blur();}}}/><span aria-label="한글 전체 페이지 수">/ {total||'…'}</span></label>
        <button className="studio-icon" aria-label="한글 다음 페이지" title="다음 페이지" disabled={!total||page>=total} onClick={()=>onJump(page+1)}><ChevronRight size={17}/></button>
    </nav>;
}

export default function NativeReportPreview({userId,material,navigationTarget,page:initialPage=1,onPageChange,visible=true}){
    const host=useRef(null),active=useRef(initialPage),jumpRef=useRef(null),callback=useRef(onPageChange);
    const [source,setSource]=useState(null),[error,setError]=useState(''),[near,setNear]=useState(new Set()),[page,setPage]=useState(initialPage),[width,setWidth]=useState(0);
    useEffect(()=>{callback.current=onPageChange;},[onPageChange]);
    useEffect(()=>{const engine=createNativePreview();let disposed=false;
        (async()=>{const blob=await loadMaterial(userId,material.id);if(disposed)return;const result=await engine.open(await blob.arrayBuffer(),material.sha256);if(!disposed)setSource({...result,engine});})().catch(reason=>{if(!disposed)setError(reason.message);});
        return()=>{disposed=true;engine.close();};
    },[userId,material.id,material.sha256]);
    useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.ceil(entry.contentRect.width)));observer.observe(host.current);return()=>observer.disconnect();},[]);
    useEffect(()=>{
        if(!source||!visible||!width)return;
        const container=host.current;if(!container)return;
        const root=container.closest('.studio-scroll'),sheets=[...container.querySelectorAll('[data-native-page]')];if(!root)return;let disposed=false;
        const header=()=>container.closest('.studio-report-workspace')?.querySelector('.studio-report-heading')?.getBoundingClientRect().height||0;
        const notify=number=>{if(active.current===number)return;active.current=number;setPage(number);callback.current?.(number);};let frame;
        const update=()=>{frame=null;if(disposed||!container.isConnected)return;const bounds=root.getBoundingClientRect(),probe=bounds.top+header()+Math.min(120,Math.max(20,(bounds.height-header())*.2));let closest=1,distance=Infinity;
            for(const sheet of sheets){const rect=sheet.getBoundingClientRect(),gap=probe<rect.top?rect.top-probe:probe>rect.bottom?probe-rect.bottom:0;if(gap<distance){distance=gap;closest=Number(sheet.dataset.nativePage);}if(rect.top>probe&&distance===0)break;}notify(closest);};
        const schedule=()=>{if(!disposed&&frame==null)frame=requestAnimationFrame(update);};
        const jump=number=>{const target=sheets[number-1];if(!target)return;root.scrollTo({top:root.scrollTop+target.getBoundingClientRect().top-root.getBoundingClientRect().top-header()-12,behavior:'instant'});notify(number);schedule();};jumpRef.current=jump;
        const observer=new IntersectionObserver(entries=>setNear(previous=>{const next=new Set(previous);for(const entry of entries){const n=Number(entry.target.dataset.nativePage);if(entry.isIntersecting)next.add(n);else next.delete(n);}return next;}),{root,rootMargin:'800px 0px'});
        sheets.forEach(sheet=>observer.observe(sheet));root.addEventListener('scroll',schedule,{passive:true});jump(Math.min(source.pages.length,Math.max(1,active.current)));
        return()=>{disposed=true;observer.disconnect();root.removeEventListener('scroll',schedule);if(frame!=null)cancelAnimationFrame(frame);jumpRef.current=null;};
    },[source,visible,width]);
    const navigation=<NativeNavigation page={page} total={source?.pages.length||0} onJump={number=>jumpRef.current?.(number)}/>;
    return <>{navigationTarget&&createPortal(navigation,navigationTarget)}<p className="studio-note" aria-label="한글 미리보기 기준">선택한 {material.format.toUpperCase()} 파일을 직접 조판한 미리보기입니다. 한글 프로그램과 글꼴·줄바꿈·쪽 배치에 차이가 있을 수 있습니다.</p><div className="studio-native-continuous" ref={host} aria-label="한글 문서 연속 페이지" data-source-sha256={source?.sourceSha256} data-renderer={source?'rhwp/0.8.7':undefined}>
        {error&&<p className="studio-error" role="alert">{error}</p>}{!source&&!error&&<p className="studio-center" role="status">한글 파일의 표·그림·서식과 페이지를 조판하고 있습니다…</p>}
        {source?.pages.map(item=><NativeSheet key={item.number} engine={source.engine} item={item} near={visible&&near.has(item.number)} filename={material.filename} width={width}/>)}
    </div></>;
}
