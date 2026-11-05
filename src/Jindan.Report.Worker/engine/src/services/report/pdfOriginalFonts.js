import {pdfEmbeddedFontProfile} from './pdfFonts.js';
import {sfntSpaceAdvance} from './sfntFonts.js';
// PDF.js sanitizes away legacy encoding5 name records. Read original embedded
// font streams locally, bound to this page's BaseFont and the actual stream SHA.
// No font substitution, source PDF writing, or font embedding is performed here.
export function originalPdfFonts(bytes,{includeBytes=false}={}){
    let loaded;const cache=new Map();
    return async(number,baseFont)=>{
        if(!loaded)loaded=(async()=>{const lib=await import('pdf-lib');return {lib,doc:await lib.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true})};})();
        const {lib,doc}=await loaded,{PDFName,PDFDict,PDFArray,PDFRawStream,decodePDFRawStream}=lib,profiles=[],visited=new Set();let resourcesCount=0;
        const read=async resources=>{
            if(!(resources instanceof PDFDict)||visited.has(resources)||++resourcesCount>100)return;visited.add(resources);
            const fonts=resources.lookupMaybe(PDFName.of('Font'),PDFDict);
            for(const [,ref]of fonts?.entries()||[]){
                const font=doc.context.lookup(ref);if(!(font instanceof PDFDict))continue;
                const name=font.lookupMaybe(PDFName.of('BaseFont'),PDFName)?.decodeText();if(name!==baseFont)continue;
                const descendants=font.lookupMaybe(PDFName.of('DescendantFonts'),PDFArray),face=descendants?.lookupMaybe(0,PDFDict)||font,descriptor=face.lookupMaybe(PDFName.of('FontDescriptor'),PDFDict);
                if(!descriptor)continue;const streamRef=descriptor.get(PDFName.of('FontFile2'))||descriptor.get(PDFName.of('FontFile3')),key=streamRef?.toString();
                if(!key)continue;if(!cache.has(key)){
                    const stream=doc.context.lookup(streamRef);let profile=null;
                    if(stream instanceof PDFRawStream&&stream.getContentsSize()<=16*1024*1024){const raw=decodePDFRawStream(stream).getBytes(32*1024*1024+1);if(raw.length<=32*1024*1024){const info=pdfEmbeddedFontProfile(raw);if(info)profile={...info,embeddedStreamSha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join(''),baseFont:name,method:'original-page-font-stream-sfnt-name',fontInstalledVerified:false,...(includeBytes?{bytes:new Uint8Array(raw)}:{})};}}
                    if(profile)try{const raw=decodePDFRawStream(doc.context.lookup(streamRef)).getBytes(32*1024*1024+1);profile.spaceAdvance=sfntSpaceAdvance(raw);}catch{/* Unknown space width is not guessed. */}
                    cache.set(key,profile);
                }if(cache.get(key))profiles.push(cache.get(key));
            }
            const forms=resources.lookupMaybe(PDFName.of('XObject'),PDFDict);for(const [,ref]of forms?.entries()||[]){const obj=doc.context.lookup(ref);if(obj instanceof PDFRawStream)await read(obj.dict.lookupMaybe(PDFName.of('Resources'),PDFDict));}
        };
        await read(doc.getPage(number-1).node.Resources());const unique=[...new Map(profiles.map(p=>[p.embeddedStreamSha256,p])).values()];return unique.length===1?unique[0]:null;
    };
}
