import {strFromU8} from 'fflate';
import {readHwpxPackage,indexHwpxSection} from './hwpxPackage.js';
import {engineBytes,engineHash,engineCheckCancelled,requireEngine} from './engineContract.js';

const local=node=>node.name.split(':').at(-1);
const descendants=(index,node)=>index.nodes.filter(n=>n.start>node.start&&n.end<=node.end);
function pngInfo(bytes){
    if(!bytes||bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return null;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),info={width:view.getUint32(16),height:view.getUint32(20),physicalDensity:null};
    for(let offset=8;offset+12<=bytes.length;){const length=view.getUint32(offset),type=new TextDecoder().decode(bytes.subarray(offset+4,offset+8));if(offset+length+12>bytes.length)break;
        if(type==='pHYs'&&length===9)info.physicalDensity={xPixelsPerUnit:view.getUint32(offset+8),yPixelsPerUnit:view.getUint32(offset+12),unit:bytes[offset+16]};offset+=length+12;
    }
    return info;
}
async function inventory(input,signal){
    const bytes=engineBytes(input),entries=readHwpxPackage(bytes),parts=Object.keys(entries).filter(n=>/^Contents\/section\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
    const manifest=entries['Contents/content.hpf']?indexHwpxSection(strFromU8(entries['Contents/content.hpf']),'hpf'):null;
    const refs=new Map(manifest?.nodes.filter(n=>local(n)==='item').map(n=>[n.attrs.id,n.attrs.href.replace(/^\.\//,'')])||[]),pictures=[],tabs=[],cells=[],text=[];
    for(const part of parts){engineCheckCancelled(signal);const index=indexHwpxSection(strFromU8(entries[part]),part);text.push(index.slots.map(s=>s.text).join(''));
        for(const node of index.nodes){
            if(local(node)==='tab')tabs.push({part,attrs:node.attrs});
            if(local(node)==='tc')cells.push({part,text:descendants(index,node).filter(n=>n.slot).map(n=>n.slot.text).join('')});
            if(local(node)!=='pic')continue;
            const children=descendants(index,node),img=children.find(n=>local(n)==='img'),entry=refs.get(img?.attrs.binaryItemIDRef),data=entry&&entries[entry];
            const attrs=name=>children.find(n=>n.parent===node&&local(n)===name)?.attrs||null;
            pictures.push({part,ordinal:pictures.length,binaryId:img?.attrs.binaryItemIDRef,entry,sha256:data?await engineHash(data):null,png:pngInfo(data),dimensions:attrs('imgDim'),size:attrs('sz'),position:attrs('pos'),originalSize:attrs('orgSz'),rendering:children.filter(n=>/Matrix$/.test(local(n))).map(n=>({name:local(n),attrs:n.attrs}))});
        }
    }
    const header=entries['Contents/header.xml']?indexHwpxSection(strFromU8(entries['Contents/header.xml']),'header'):null;
    const fonts=header?.nodes.filter(n=>local(n)==='font').map(n=>({lang:n.parent?.attrs.lang,face:n.attrs.face,isEmbedded:n.attrs.isEmbedded,binaryItemIDRef:n.attrs.binaryItemIDRef,substitute:header.nodes.find(s=>s.parent===n&&local(s)==='substFont')?.attrs||null}))||[];
    const assets=[];for(const [entry,data]of Object.entries(entries))if(entry.startsWith('BinData/')){engineCheckCancelled(signal);assets.push({entry,sha256:await engineHash(data),size:data.length,png:pngInfo(data)});}
    const metadata=await Promise.all(Object.keys(entries).filter(n=>/^Contents\/jindan-[^/]+\.json$/.test(n)).map(async entry=>({entry,sha256:await engineHash(entries[entry]),size:entries[entry].length})));
    return {sha256:await engineHash(bytes),size:bytes.length,sections:parts.length,textHash:await engineHash(new TextEncoder().encode(text.join(''))),textCharacters:text.join('').length,cells,tabs,pictures,fonts,assets,metadata};
}
export async function auditNativeSave(beforeInput,afterInput,{signal,expectedBeforeSha256,expectedAfterSha256}={}){
    const before=await inventory(beforeInput,signal),after=await inventory(afterInput,signal);
    requireEngine((!expectedBeforeSha256||before.sha256===expectedBeforeSha256)&&(!expectedAfterSha256||after.sha256===expectedAfterSha256),'BINDING_MISMATCH','Native-save audit input differs from its expected exact SHA.');
    const pictures=before.pictures.map((a,i)=>{const b=after.pictures[i];return {ordinal:i,before:a,after:b||null,ordinalCorrespondenceOnly:true,bytesEqual:!!b&&a.sha256!==null&&a.sha256===b.sha256,pixelDimensionsEqual:!!b&&a.png!==null&&b.png!==null&&a.png.width===b.png.width&&a.png.height===b.png.height};});
    const afterMetadata=new Map(after.metadata.map(m=>[m.entry,m]));
    return {schema:'jindan-native-save-audit/1',before,after,comparison:{textStreamEqual:before.textHash===after.textHash,cellTextEqual:before.cells.length===after.cells.length&&before.cells.every((c,i)=>c.text===after.cells[i].text),tabsEqual:JSON.stringify(before.tabs)===JSON.stringify(after.tabs),pictureCountEqual:before.pictures.length===after.pictures.length,pictures,metadata:before.metadata.map(m=>({...m,present:afterMetadata.has(m.entry),bytesEqual:afterMetadata.get(m.entry)?.sha256===m.sha256})),embeddedDefinitionsBefore:before.fonts.filter(f=>f.isEmbedded==='1').length,embeddedDefinitionsAfter:after.fonts.filter(f=>f.isEmbedded==='1').length,fontFilesBefore:before.assets.filter(a=>/\.(?:ttf|otf)$/i.test(a.entry)).length,fontFilesAfter:after.assets.filter(a=>/\.(?:ttf|otf)$/i.test(a.entry)).length},limitations:['Picture pairing uses section/document ordinal, not proof of semantic object identity.','PNG dimensions and encoded bytes do not prove decoded pixel identity or visible content.','Text/metadata comparisons do not establish layout, native font selection, editability or full numerical/cell meaning.','A native-saved file is a new source version; reanalyze it before binding slots or field returns.'],nativeSavePreservationVerified:false,reportReady:false};
}
