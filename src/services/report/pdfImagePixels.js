import {MAX_PDF_IMAGE_PIXELS} from './pdfImageLimits.js';
// Decode PDF.js image pixels, never a screenshot of the page containing them.
export function loadPdfImageObject(pool,key,signal){
    return new Promise((resolve,reject)=>{
        let settled=false;
        const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
        const abort=()=>finish(new Error('그림 추출을 취소했습니다.')),timer=setTimeout(()=>finish(new Error('PDF 원본 그림을 읽는 시간이 초과되었습니다. 보고서를 다시 분석하세요.')),15000);
        if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});
        try{pool.get(key,value=>finish(null,value));}catch(error){finish(error);}
    });
}

export function pdfImageRgba(image){
    const {width,height,kind,data}=image||{};
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_PDF_IMAGE_PIXELS||!ArrayBuffer.isView(data))throw new Error('PDF 원본 그림의 픽셀 정보를 확인하세요.');
    const channels=kind===3?4:kind===2?3:kind===1?0:null;
    if(channels===null||data.length<(channels?width*height*channels:Math.ceil(width/8)*height))throw new Error('PDF 원본 그림의 색상 형식을 확인하세요.');
    const rgba=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const pixel=y*width+x,out=pixel*4;
        if(channels){const start=pixel*channels;rgba[out]=data[start];rgba[out+1]=data[start+1];rgba[out+2]=data[start+2];rgba[out+3]=channels===4?data[start+3]:255;}
        else{const value=data[y*Math.ceil(width/8)+(x>>3)]&(128>>(x&7))?255:0;rgba[out]=rgba[out+1]=rgba[out+2]=value;rgba[out+3]=255;}
    }
    return rgba;
}
