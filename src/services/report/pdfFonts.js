// Names observed in the PDF/HWPX reference pair. Keep unknown names as evidence.
const aliases={MalgunGothicRegular:'맑은 고딕',H2hdrM:'HY헤드라인M',H2wulM:'HY울릉도M',HYwulM:'HY울릉도M',HYgtrE:'HY견고딕',Gulim:'굴림',GulimChe:'굴림체',Dotum:'돋움',DotumChe:'돋움체',Batang:'바탕',BatangChe:'바탕체',HaansoftBatang:'한컴바탕',HCRBatang:'함초롬바탕',HCRDotum:'함초롬돋움'};
export function pdfFontFamily(name){
    const source=String(name||'').replace(/^[A-Z]{6}\+/,'');
    if(!source||/^(?:g_\w+|serif|sans-serif|monospace|CIDFont\+F\d+|TT[A-F0-9]+tCID)$/i.test(source))return '';
    return aliases[source]||source;
}

// Read family names from embedded SFNT bytes; an opaque CID name is not a font identity.
export function pdfEmbeddedFontProfile(bytes){
    if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>32*1024*1024)return '';
    try{const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint16(4),names=[];
        if(count>256||12+count*16>bytes.length)return '';
        for(let i=0;i<count;i++){const row=12+i*16;if(String.fromCharCode(...bytes.subarray(row,row+4))!=='name')continue;
            const offset=view.getUint32(row+8),length=view.getUint32(row+12);if(offset+length>bytes.length||length<6)return '';
            const records=view.getUint16(offset+2),storage=offset+view.getUint16(offset+4);if(records>4096||6+records*12>length||storage<offset+6+records*12||storage>offset+length)return '';
            for(let n=0;n<records;n++){const r=offset+6+n*12,platform=view.getUint16(r),language=view.getUint16(r+4),id=view.getUint16(r+6),size=view.getUint16(r+8),start=storage+view.getUint16(r+10);
                if(![1,16].includes(id)||!size||size>600||start+size>offset+length)continue;
                const data=bytes.subarray(start,start+size);let name=platform===0||platform===3?new TextDecoder('utf-16be').decode(data):platform===1&&data.every(b=>b<128)?new TextDecoder().decode(data):'';
                // Some legacy Korean SFNT records zero-extend EUC-KR octets,
                // despite platform3. Decode only that explicit encoding5 case.
                if(platform===3&&view.getUint16(r+2)===5&&language===0x412&&[...name].every(c=>c.charCodeAt(0)<=255)&&[...name].some(c=>c.charCodeAt(0)>127))try{name=new TextDecoder('euc-kr',{fatal:true}).decode(Uint8Array.from(name,c=>c.charCodeAt(0)));}catch{/* retain the uninterpreted source record */}
                const family=pdfFontFamily(name.replace(/\0/g,'').trim());if(family&&!/^pdfjs/i.test(family))names.push({family,score:(language===0x412&&/[가-힣]/.test(family)?10:0)+(platform===3?3:0)+(id===16?1:0),nameEncoding:view.getUint16(r+2),language});
            }
        }const selected=names.sort((a,b)=>b.score-a.score)[0];return selected?{family:selected.family,nameEncoding:selected.nameEncoding,language:selected.language}:null;
    }catch{return '';}
}
export function pdfEmbeddedFontFamily(bytes){return pdfEmbeddedFontProfile(bytes)?.family||'';}
