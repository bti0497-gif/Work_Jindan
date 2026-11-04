import {useEffect,useRef,useState} from 'react';

const defaults={left:218,right:270},clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const storageKey=userId=>`jindan-studio-layout:${JSON.stringify(String(userId))}`;
function readWidths(userId){
    try{const saved=JSON.parse(localStorage.getItem(storageKey(userId)));return {left:clamp(Number.isFinite(saved?.left)?saved.left:defaults.left,160,480),right:clamp(Number.isFinite(saved?.right)?saved.right:defaults.right,220,560)};}catch{return {...defaults};}
}
function fitWidths(preferred,width){
    if(width<900){const left=clamp(preferred.left,Math.min(160,Math.max(100,width-201)),Math.max(100,Math.min(480,width-241)));return {left,right:Math.min(preferred.right,Math.max(220,width-left-1))};}
    const spare=Math.max(0,width-322-160-220),wanted=preferred.left-160+preferred.right-220;
    const ratio=wanted?Math.min(1,spare/wanted):1;
    return {left:Math.round(160+(preferred.left-160)*ratio),right:Math.round(220+(preferred.right-220)*ratio)};
}

export function useStudioLayout(userId){
    const ref=useRef(null),drag=useRef(null),[preferred,setPreferred]=useState(()=>readWidths(userId)),[width,setWidth]=useState(()=>window.innerWidth),[dragging,setDragging]=useState('');
    useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.round(entry.contentRect.width)));observer.observe(ref.current);return()=>observer.disconnect();},[]);
    useEffect(()=>{try{localStorage.setItem(storageKey(userId),JSON.stringify(preferred));}catch{/* Keep the current layout when browser storage is unavailable. */}},[userId,preferred]);
    const compact=width<900,effective=fitWidths(preferred,width);
    const bounds=side=>({min:side==='left'?(compact?Math.min(160,Math.max(100,width-201)):160):220,max:side==='left'?Math.max(compact?100:160,Math.min(480,width-(compact?241:322+effective.right))):Math.max(220,Math.min(560,compact?width-effective.left-1:width-322-effective.left))});
    const change=(side,value)=>{const {min,max}=bounds(side);setPreferred(current=>({...current,[side]:Math.round(clamp(value,min,max))}));};
    const handle=side=>{
        const {min,max}=bounds(side);
        return {side,value:effective[side],min,max,
            onPointerDown:event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={side,pointerId:event.pointerId,x:event.clientX,width:effective[side],preferred};setDragging(side);},
            onPointerMove:event=>{const current=drag.current;if(current?.side===side&&current.pointerId===event.pointerId)change(side,current.width+(event.clientX-current.x)*(side==='left'?1:-1));},
            onPointerUp:event=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=null;setDragging('');if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);},
            onPointerCancel:()=>{if(drag.current)setPreferred(drag.current.preferred);drag.current=null;setDragging('');},
            onLostPointerCapture:()=>{drag.current=null;setDragging('');},
            onDoubleClick:()=>change(side,defaults[side]),
            onKeyDown:event=>{if(event.key==='Escape'&&drag.current){setPreferred(drag.current.preferred);drag.current=null;setDragging('');event.preventDefault();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();change(side,event.key==='Home'?min:event.key==='End'?max:effective[side]+(event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1)*(event.shiftKey?40:10));}};
    };
    return {ref,compact,dragging,style:{'--studio-left-width':`${effective.left}px`,'--studio-right-width':`${effective.right}px`},handle};
}

export function StudioResizeHandle({side,value,min,max,...events}){
    const name=side==='left'?'왼쪽':'오른쪽';
    return <div className={`studio-resize-handle resize-${side}`} role="separator" tabIndex={0} aria-label={`${name} 사이드바 너비 조절`} aria-orientation="vertical" aria-controls={`studio-${side}-sidebar`} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)}픽셀`} title={`${name} 너비 조절 · 드래그 또는 방향키 · 두 번 클릭하면 기본 너비`} {...events}/>;
}
