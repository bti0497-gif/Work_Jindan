import init,{HwpDocument} from '@rhwp/core';
import wasmUrl from '@rhwp/core/rhwp_bg.wasm?url';

let document,ready;
const canvas=new OffscreenCanvas(1,1),context=canvas.getContext('2d');
globalThis.measureTextWidth=(font,text)=>{context.font=font;return context.measureText(text).width;};

self.onmessage=async({data})=>{
    try{
        if(data.action==='open'){
            ready||=init({module_or_path:wasmUrl});await ready;
            const bytes=new Uint8Array(data.bytes);
            const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
            if(hash!==data.sha256)throw new Error('미리보기 파일의 원본 버전이 다릅니다. 다시 선택하세요.');
            document?.free();document=new HwpDocument(bytes);
            const count=document.pageCount();if(!count||count>1000)throw new Error('한글 미리보기는 1~1,000쪽 문서를 지원합니다.');
            const pages=Array.from({length:count},(_,index)=>{const info=JSON.parse(document.getPageInfo(index));if(![info.width,info.height].every(n=>Number.isFinite(n)&&n>0&&n<20000))throw new Error('한글 문서의 용지 크기를 확인하세요.');return {number:index+1,width:info.width,height:info.height};});
            self.postMessage({id:data.id,pages,sourceSha256:hash,engine:'rhwp/0.8.7'});
        }else if(data.action==='page'){
            if(!document||!Number.isInteger(data.number)||data.number<1||data.number>document.pageCount())throw new Error('한글 미리보기 페이지를 확인하세요.');
            const svg=document.renderPageSvg(data.number-1);
            if(svg.length>16*1024*1024)throw new Error('이 페이지의 개체가 미리보기 한도를 넘습니다.');
            self.postMessage({id:data.id,svg});
        }else throw new Error('한글 미리보기 요청을 확인하세요.');
    }catch(reason){self.postMessage({id:data.id,error:reason?.message||String(reason)||'한글 미리보기를 만들지 못했습니다.'});}
};
