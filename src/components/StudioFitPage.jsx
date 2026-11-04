import {useLayoutEffect,useRef,useState} from 'react';

// Scale the entire page, including its typography and margins, without changing document settings.
export default function StudioFitPage({width=794,label='페이지',children}){
    const host=useRef(null),sheet=useRef(null),[size,setSize]=useState({available:width,height:0});
    useLayoutEffect(()=>{
        const measure=()=>{const available=host.current.clientWidth,height=sheet.current.offsetHeight;setSize(previous=>previous.available===available&&previous.height===height?previous:{available,height});};
        const observer=new ResizeObserver(measure);observer.observe(host.current);observer.observe(sheet.current);measure();return()=>observer.disconnect();
    },[width]);
    const scale=Math.max(.05,Math.min(2,size.available/width||1));
    return <div className="studio-fit-page" ref={host} data-page-scale={scale}>
        <div className="studio-fit-caption">{label} · 너비 맞춤 <span>{Math.round(scale*100)}%</span></div>
        <div className="studio-fit-frame" style={{width:width*scale,height:size.height*scale}}><div ref={sheet} className="studio-fit-sheet" style={{width,transform:`scale(${scale})`}}>{children}</div></div>
    </div>;
}
