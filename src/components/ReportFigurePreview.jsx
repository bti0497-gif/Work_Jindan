import {useEffect,useState} from 'react';
import {loadMaterial} from '../services/report/reportLibrary.js';
import {readHwpxPackage} from '../services/report/hwpxPackage.js';
import {cropPdfPictures} from '../services/report/pdfOcr.js';

export default function ReportFigurePreview({userId,material,pdf,figure}){
    const [url,setUrl]=useState(''),[error,setError]=useState('');
    useEffect(()=>{let alive=true,url;const controller=new AbortController();
        (async()=>{const source=await loadMaterial(userId,material.id),bytes=await source.arrayBuffer();if(!alive)return;let image;
            if(material.format==='pdf'){const pictures=await cropPdfPictures(bytes,pdf,[figure.page],{signal:controller.signal,includeTextImages:true});const target=pictures[figure.id];if(target)image=new Blob([target.bytes],{type:'image/png'});}
            else if(figure.image){const entries=readHwpxPackage(bytes),data=entries[figure.image.path];if(data)image=new Blob([data],{type:figure.image.mime});}
            if(!image)throw new Error('이 개체의 그림 자산은 원문 위치에서 확인하세요.');if(alive){url=URL.createObjectURL(image);setUrl(url);}
        })().catch(reason=>{if(alive&&!controller.signal.aborted)setError(reason.message);});return()=>{alive=false;controller.abort();if(url)URL.revokeObjectURL(url);};
    },[userId,material.id,material.format,pdf,figure]);
    return <div className="studio-analysis-figure-preview">{url?<img src={url} alt="선택한 원문 그림"/>:<p role="status">{error||'원문 그림을 읽고 있습니다…'}</p>}</div>;
}
