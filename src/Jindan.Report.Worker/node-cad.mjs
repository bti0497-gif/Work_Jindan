import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {XMLParser,XMLBuilder,XMLValidator} from 'fast-xml-parser';
import {renderCadSvg,CAD_PREVIEW_MAX_EDGE} from './engine/src/services/cadRender.js';
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Local CAD preview was cancelled.');};
const budget=(value,max)=>{if(value===undefined)return max;if(!Number.isSafeInteger(value)||value<1||value>max)fail('INVALID_INPUT','CAD preview limits must be bounded positive integers.');return value;};
const tags=new Set(['svg','rect','g','path','circle','text']);
const numeric=new Set(['width','height','x','y','rx','ry','cx','cy','r','stroke-width','fill-opacity','opacity','font-size']);
const words={'stroke-linecap':['round','butt','square'],'stroke-linejoin':['round','miter','bevel'],'fill-rule':['evenodd','nonzero'],'text-anchor':['start','middle','end'],direction:['ltr','rtl'],'font-family':['sans-serif']};
const scalar=/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;
const numberList=value=>value.trim().split(/[\s,]+/).every(v=>scalar.test(v)&&Number.isFinite(Number(v)));
export function sanitizeCadSvg(svg,{maxBytes=16*1024*1024}={}){
    const limit=budget(maxBytes,16*1024*1024);
    if(typeof svg!=='string'||Buffer.byteLength(svg)>limit||/<!|<\?/i.test(svg)||XMLValidator.validate(svg)!==true)fail('UNSAFE_SVG','CAD SVG is malformed, too large, or contains prohibited declarations.');
    const parser=new XMLParser({preserveOrder:true,ignoreAttributes:false,attributeNamePrefix:'@_',parseAttributeValue:false,processEntities:true});
    const nodes=parser.parse(svg);let count=0,root;
    const visit=(rows,depth=0)=>{
        if(depth>64)fail('UNSAFE_SVG','CAD SVG nesting exceeds the local limit.');
        for(const node of rows){for(const [tag,children]of Object.entries(node)){
            if(tag===':@'||tag==='#text')continue;
            if(!tags.has(tag)||++count>200000)fail('UNSAFE_SVG','CAD SVG contains an unsupported element.');
            if(depth===0){if(root||tag!=='svg')fail('UNSAFE_SVG','CAD SVG requires one SVG root.');root=node;}
            for(const [key,raw]of Object.entries(node[':@']||{})){
                const name=key.slice(2),value=String(raw);
                if(name==='xmlns'){if(depth!==0||value!=='http://www.w3.org/2000/svg')fail('UNSAFE_SVG','CAD SVG namespace is invalid.');}
                else if(numeric.has(name)){if(!scalar.test(value)||!Number.isFinite(Number(value)))fail('UNSAFE_SVG','CAD SVG has a nonfinite numeric attribute.');}
                else if(name==='viewBox'){if(value.trim().split(/[\s,]+/).length!==4||!numberList(value))fail('UNSAFE_SVG','CAD SVG viewBox is invalid.');}
                else if(name==='fill'||name==='stroke'){if(value!=='none'&&!/^#[a-f0-9]{3,8}$/i.test(value))fail('UNSAFE_SVG','CAD SVG paint references are not allowed.');}
                else if(name==='stroke-dasharray'){if(!numberList(value))fail('UNSAFE_SVG','CAD SVG dash values are invalid.');}
                else if(name==='d'){if(!/^[-+0-9eE.,\sMmZzLlHhVvCcSsQqTtAa]*$/.test(value))fail('UNSAFE_SVG','CAD SVG path is invalid.');}
                else if(name==='transform'){if(!/^(?:rotate|matrix|translate|scale)\([-+0-9eE.,\s]+\)$/.test(value)||!numberList(value.slice(value.indexOf('(')+1,-1)))fail('UNSAFE_SVG','CAD SVG transform is invalid.');}
                else if(words[name]){if(!words[name].includes(value))fail('UNSAFE_SVG','CAD SVG enum attribute is invalid.');}
                else fail('UNSAFE_SVG','CAD SVG external links, scripts, styles and unsupported attributes are prohibited.');
            }
            if(!Array.isArray(children))fail('UNSAFE_SVG','CAD SVG nodes are malformed.');visit(children,depth+1);
        }}
    };visit(nodes);
    const attrs=root?.[':@'],width=Number(attrs?.['@_width']),height=Number(attrs?.['@_height']);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>CAD_PREVIEW_MAX_EDGE||height>CAD_PREVIEW_MAX_EDGE)fail('CAD_LIMIT','CAD preview dimensions exceed the1600-pixel bound.');
    return {svg:new XMLBuilder({preserveOrder:true,ignoreAttributes:false,attributeNamePrefix:'@_',processEntities:true}).build(nodes),width:Math.ceil(width),height:Math.ceil(height)};
}
export async function renderNodeCad(filename,input,{signal,onProgress=()=>{},maxInputBytes,maxSvgBytes,maxPngBytes}={}){
    check(signal);const inputLimit=budget(maxInputBytes,64*1024*1024),pngLimit=budget(maxPngBytes,16*1024*1024);budget(maxSvgBytes,16*1024*1024);
    if(typeof filename!=='string'||filename.length>1000||!/\.(?:dwg|dxf)$/i.test(filename))fail('UNSUPPORTED_FORMAT','Select a local DWG or DXF source.');
    if(!(input instanceof Uint8Array)&&!(input instanceof ArrayBuffer))fail('INVALID_INPUT','CAD preview requires local binary bytes.');
    const bytes=new Uint8Array(input instanceof Uint8Array?input:new Uint8Array(input)).slice();
    if(bytes.length<8||bytes.length>inputLimit)fail('CAD_LIMIT','CAD source size is outside the local preview limit.');
    const extension=filename.split('.').at(-1).toLowerCase();
    if(extension==='dwg'&&!/^AC\d{4}$/.test(new TextDecoder('ascii').decode(bytes.subarray(0,6))))fail('INVALID_CAD','DWG source signature is unsupported or malformed.');
    if(extension==='dxf'&&!/(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\s*\r?\n/.test(new TextDecoder().decode(bytes.subarray(0,Math.min(bytes.length,4096)))))fail('INVALID_CAD','An ASCII DXF SECTION header is required.');
    const sourceSha256=createHash('sha256').update(bytes).digest('hex');
    try{
        onProgress({stage:'cad-parse'});await setImmediate();check(signal);
        let result;try{result=renderCadSvg(filename,bytes);}catch{fail('INVALID_CAD','The local CAD library cannot parse or display this drawing.');}
        check(signal);const clean=sanitizeCadSvg(result.svg,{maxBytes:maxSvgBytes});onProgress({stage:'cad-rasterize'});await setImmediate();check(signal);
        let image;try{image=await loadImage(Buffer.from(clean.svg));}catch{fail('CAD_BACKEND','The local raster backend cannot decode the sanitized CAD SVG.');}check(signal);
        const canvas=createCanvas(clean.width,clean.height);
        try{canvas.getContext('2d').drawImage(image,0,0,clean.width,clean.height);check(signal);const png=canvas.toBuffer('image/png');if(png.length>pngLimit)fail('CAD_LIMIT','CAD preview PNG exceeds the bounded output limit.');await setImmediate();check(signal);return {bytes:new Uint8Array(png),width:clean.width,height:clean.height,sourceSha256,sha256:createHash('sha256').update(png).digest('hex'),method:'local-cad-svg',mediaType:'image/png',previewOnly:true,sourceModified:false};}
        finally{canvas.width=canvas.height=0;}
    }catch(error){if(signal?.aborted)fail('CANCELLED','Local CAD preview was cancelled.');throw error;}
}
