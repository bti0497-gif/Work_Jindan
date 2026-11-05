import {readHwpxPackage} from './hwpxPackage.js';
import {strFromU8} from 'fflate';
export const needsPdfNativeRegeneration=version=>/^pdf-hwpx\/[1-9]$/.test(version||'');
export function inspectPdfProvenance(bytes){
    const value=readHwpxPackage(bytes)['Contents/jindan-source.json'];if(!value)return null;
    try{
        if(value.length>8*1024*1024)throw new Error();const data=JSON.parse(strFromU8(value));
        if(data.schema!=='jindan-pdf-provenance/1'||!/^[a-f0-9]{64}$/.test(data.source?.sha256||'')||!Array.isArray(data.sourcePages)||data.sourcePages.length>300||data.assets!=null&&(!Array.isArray(data.assets)||data.assets.length>20000))throw new Error();
        const assets=(data.assets||[]).map(a=>{if(typeof a.binaryItemId!=='string'||a.binaryItemId.length>100||!['text-raster','figure'].includes(a.kind)||!Array.isArray(a.bbox)||a.bbox.length!==4||!a.bbox.every(Number.isFinite))throw new Error();return {binaryItemId:a.binaryItemId,sourceImageId:String(a.sourceImageId||'').slice(0,200),sourcePage:a.sourcePage,kind:a.kind,bbox:a.bbox};});
        const missingPictures=Array.isArray(data.missingPictures)?data.missingPictures.filter(s=>typeof s==='string').slice(0,20000):[];
        return {status:missingPictures.length?'incomplete':'source-recorded',engineVersion:data.engineVersion,requiresNativeRegeneration:needsPdfNativeRegeneration(data.engineVersion),pdfSourceSha256:data.source.sha256,assets,sourcePages:data.sourcePages,missingPictures,warnings:[...(needsPdfNativeRegeneration(data.engineVersion)?['이전 복원 엔진의 한글 열기 호환성 결함이 확인됐습니다. 기존 후보는 보존하고 원본 PDF에서 다시 한글화하세요. 새 후보도 실제 한글 검증이 필요합니다.']:[]),...(Array.isArray(data.warnings)?data.warnings.filter(s=>typeof s==='string').slice(0,1000):[]),...(missingPictures.length?[`원문 그림 ${missingPictures.length}개가 누락되었습니다. 재생성 전에 원문 자산을 확인하세요.`]:[])],paragraphReconstruction:data.paragraphReconstruction||'unverified',assetRolesRecorded:Array.isArray(data.assets),verified:false};
    }catch{return {status:'unreadable',warnings:['PDF 복원 출처 정보를 확인할 수 없습니다. 원본과 대조하세요.'],assets:[],verified:false};}
}
