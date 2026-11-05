// SVG images can be rasterized at their intrinsic size before CSS enlargement.
// Size the image for the actual display density; leave the document viewBox intact.
export function nativeSvgAtDisplaySize(svg,width,density=1){
    const root=svg.match(/<svg\b[^>]*>/)?.[0],box=root?.match(/\bviewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if(!box||!Number.isFinite(width)||width<=0)return svg;
    const factor=Math.min(3,Math.max(1,Number.isFinite(density)?density:1)),pixels=Math.max(1,Math.ceil(width*factor));
    const height=Math.max(1,Math.ceil(pixels*Number(box[2])/Number(box[1])));
    return svg.replace(root,root.replace(/\bwidth="[^"]*"/,`width="${pixels}"`).replace(/\bheight="[^"]*"/,`height="${height}"`));
}

// One isolated engine per open file. Only the selected HWP/HWPX bytes enter it.
export function createNativePreview(){
    const worker=new Worker(new URL('./nativePreview.worker.js',import.meta.url),{type:'module'}),pending=new Map();let sequence=0,closed=false;
    const fail=message=>{for(const {reject,timer}of pending.values()){clearTimeout(timer);reject(new Error(message));}pending.clear();};
    worker.onmessage=({data})=>{const request=pending.get(data.id);if(!request)return;clearTimeout(request.timer);pending.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data);};
    worker.onerror=()=>{closed=true;worker.terminate();fail('한글 미리보기 엔진을 불러오지 못했습니다.');};
    const request=(message,transfer=[])=>new Promise((resolve,reject)=>{if(closed)return reject(new Error('한글 미리보기를 닫았습니다.'));const id=++sequence,timer=setTimeout(()=>{worker.terminate();closed=true;fail('한글 미리보기 처리 시간이 초과되었습니다. 보고서를 다시 선택하세요.');},120000);pending.set(id,{resolve,reject,timer});worker.postMessage({...message,id},transfer);});
    return {open:(bytes,sha256)=>request({action:'open',bytes,sha256},[bytes]),page:number=>request({action:'page',number}),close:()=>{if(closed)return;closed=true;worker.terminate();fail('한글 미리보기를 닫았습니다.');}};
}
