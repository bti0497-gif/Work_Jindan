export async function prepareRestorationPicture(blob,material,mime){
    const bytes=await blob.arrayBuffer(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(sha!==material.sha256)throw new Error('교체 그림의 원본 버전이 다릅니다.');
    if(!['image/png','image/jpeg'].includes(mime))throw new Error('교체할 원본 그림의 형식을 확인하세요.');
    const bitmap=await createImageBitmap(blob);
    try{
        if(bitmap.width*bitmap.height>16000000)throw new Error('교체 그림은 1,600만 화소 이하로 조정하세요.');
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d');if(mime==='image/jpeg'){ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(bitmap,0,0);
        const result=await new Promise(resolve=>canvas.toBlob(resolve,mime,.95));canvas.width=canvas.height=0;
        if(!result||result.size>16*1024*1024)throw new Error('변환한 교체 그림은 16MB 이하로 조정하세요.');
        return {bytes:new Uint8Array(await result.arrayBuffer()),mime,materialId:material.id,sourceSha256:sha};
    }finally{bitmap.close();}
}
