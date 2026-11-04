import {paragraphRole} from './paragraphRole.js';
import {strFromU8,strToU8} from 'fflate';
import {XMLValidator} from 'fast-xml-parser';
import {readHwpxPackage,packHwpxPackage,indexHwpxSection,removeStaleImagePreview} from './hwpxPackage.js';
import {validateSpecification} from './reportSpecification.js';
import {PARAGRAPH_FIELDS,PARAGRAPH_NUMBERS,PARAGRAPH_FLAGS,hasParagraphChanges} from './paragraphFormatting.js';

const local=n=>n.name.split(':').at(-1);
const ancestor=(node,name)=>{for(let p=node.parent;p;p=p.parent)if(local(p)===name)return p;return null;};
const descendant=(node,parent)=>{for(let p=node.parent;p;p=p.parent)if(p===parent)return true;return false;};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const unit=value=>Math.round(value*7200/25.4);
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const attrs=(tag,values)=>{
    for(const [key,value] of Object.entries(values)){
        const pattern=new RegExp(`(\\s${key}\\s*=\\s*)(["'])[^"']*\\2`);
        tag=pattern.test(tag)?tag.replace(pattern,(_,prefix)=>`${prefix}"${escape(value)}"`):tag.replace(/\s*\/?>$/,end=>` ${key}="${escape(value)}"${end}`);
    }
    return tag;
};
const updateTag=(xml,name,values)=>xml.replace(new RegExp(`<([\\w.-]+:)?${name}\\b[^<>]*>`,'g'),tag=>attrs(tag,values));
const languages=['hangul','latin','hanja','japanese','other','symbol','user'];
const numericId=nodes=>nodes.reduce((max,n)=>Number.isFinite(Number(n.attrs.id))?Math.max(max,Number(n.attrs.id)):max,-1)+1;
function applyPatches(xml,patches){
    const sorted=patches.sort((a,b)=>a.begin-b.begin||b.end-a.end),kept=[];
    for(const p of sorted){
        const previous=kept.at(-1);
        if(previous&&p.begin<previous.end){if(p.end<=previous.end&&previous.remove)continue;throw new Error('서식 변경 위치가 겹칩니다. 항목을 나누어 적용하세요.');}
        kept.push(p);
    }
    for(const p of kept.reverse())xml=xml.slice(0,p.begin)+p.value+xml.slice(p.end);
    if(XMLValidator.validate(xml)!==true)throw new Error('작성한 한글 XML 구조를 확인할 수 없습니다.');
    return xml;
}

export function inspectRestoration(input,sourceSha256){
    const entries=readHwpxPackage(input),furniture=[],objects=[],bodySlots=[];
    const manifest=entries['Contents/content.hpf']?indexHwpxSection(strFromU8(entries['Contents/content.hpf']),'Contents/content.hpf').nodes.filter(n=>local(n)==='item'):[];
    for(const [section,bytes] of Object.entries(entries).filter(([name])=>/^Contents\/section\d+\.xml$/.test(name))){
        const xml=strFromU8(bytes),native=indexHwpxSection(xml,section);
        for(const node of native.nodes.filter(n=>['header','footer'].includes(local(n)))){
            const children=native.nodes.filter(n=>descendant(n,node));
            furniture.push({id:`${section}:area:${node.start}`,section,kind:local(node),applyPageType:node.attrs.applyPageType||'BOTH',
                tables:children.filter(n=>local(n)==='tbl').length,pictures:children.filter(n=>local(n)==='pic').length,
                shapes:children.filter(n=>['line','rect','ellipse','polygon','curve','container','arc'].includes(local(n))).length,
                pageFields:children.filter(n=>local(n)==='autoNum'&&n.attrs.numType==='PAGE').length,
                slots:children.filter(n=>n.slot&&(n.slot.plain||n.slot.textOnly)&&n.slot.text.trim()).map(n=>({slotId:n.slot.id,text:n.slot.text,charShapeId:n.slot.charShapeId,inTable:!!ancestor(n,'tc')}))});
        }
        for(const node of native.nodes.filter(n=>['tbl','pic','line','rect','ellipse','polygon','curve','container','arc','ole','equation'].includes(local(n)))){
            const area=ancestor(node,'header')||ancestor(node,'footer');
            const size=native.nodes.find(n=>n.parent===node&&local(n)==='sz'),position=native.nodes.find(n=>n.parent===node&&local(n)==='pos');
            const image=native.nodes.find(n=>n.parent===node&&local(n)==='img'),resource=image&&manifest.find(n=>n.attrs.id===image.attrs.binaryItemIDRef);
            const imagePath=resource?.attrs.href,imageMime=resource?.attrs['media-type'];
            objects.push({id:`${section}:object:${node.start}`,section,paragraphIndex:ancestor(node,'p')?.paragraph?.index,kind:local(node),area:area?local(area):'body',
                widthMm:size?.attrs.width?Math.round(Number(size.attrs.width)*25.4/7200*10)/10:null,
                heightMm:size?.attrs.height?Math.round(Number(size.attrs.height)*25.4/7200*10)/10:null,
                position:position?{horizontalMm:Number(position.attrs.horzOffset||0)*25.4/7200,verticalMm:Number(position.attrs.vertOffset||0)*25.4/7200,treatAsChar:position.attrs.treatAsChar==='1',horizontalReference:position.attrs.horzRelTo,verticalReference:position.attrs.vertRelTo}:null,
                image:image&&/^BinData\/[\w. -]+\.(?:png|jpe?g)$/i.test(imagePath||'')&&entries[imagePath]&&['image/png','image/jpeg'].includes(imageMime)?{path:imagePath,mime:imageMime,binaryId:image.attrs.binaryItemIDRef}:null,status:'source-preserved'});
        }
        bodySlots.push(...native.nodes.filter(n=>n.slot&&!ancestor(n,'header')&&!ancestor(n,'footer')).map(n=>n.slot.id));
    }
    return {schema:'jindan-restoration/1',sourceSha256,furniture,objects,bodySlots,
        status:'structure-inspected',layoutVerified:false,reportReady:false};
}

/** Clone referenced source styles; never change a shared original style in place. */
export async function applyRestorationSpecification(input,spec,{pictures={}}={}){
    spec=validateSpecification(spec);
    const original=input instanceof Uint8Array?input:new Uint8Array(input);
    if(await hash(original)!==spec.sourceSha256)throw new Error('보고서 원본 버전이 다릅니다. 서식을 다시 분석하세요.');
    let bytes=original;
    const originalInfo=inspectRestoration(bytes,spec.sourceSha256),slots=new Map(originalInfo.furniture.flatMap(a=>a.slots.map(s=>[s.slotId,s])));
    const scope=spec.typographyScope?new Set(spec.typographyScope.map(p=>`${p.section}:${p.index}`)):null;
    if(scope&&(Object.keys(spec.furnitureEdits||{}).length||Object.keys(spec.furnitureAlignments||{}).length||Object.keys(spec.objectPositions||{}).length||spec.pictureReplacements?.length))throw new Error('챕터 글자 서식과 구역 공통 개체 설정은 나누어 적용하세요.');
    const textEdits=Object.entries(spec.furnitureEdits||{}).map(([slotId,value])=>{
        const slot=slots.get(slotId);if(!slot||typeof value!=='string'||value.length>4000)throw new Error('머리말·꼬리말의 원본 글자 위치를 확인하세요.');
        return {section:slotId.split(':text:')[0],slotId,expectedText:slot.text,value,wholeText:true};
    });
    if(textEdits.some(e=>e.section!==spec.section))throw new Error('선택한 구역의 머리말·꼬리말만 함께 적용하세요.');
    const objectMap=new Map(originalInfo.objects.map(o=>[o.id,o]));
    const pictureChanges=new Map(),seenPictures=new Set();let pictureBytes=0;
    if(!Array.isArray(spec.pictureReplacements||[])||(spec.pictureReplacements||[]).length>30)throw new Error('그림 교체 목록을 확인하세요.');
    for(const replacement of spec.pictureReplacements||[]){
        const target=objectMap.get(replacement.objectId),picture=pictures[replacement.objectId],data=picture?.bytes instanceof Uint8Array?picture.bytes:picture?.bytes?new Uint8Array(picture.bytes):null;
        if(!target?.image||target.section!==spec.section||seenPictures.has(target.id)||!data||data.length<32||data.length>16*1024*1024||picture.mime!==target.image.mime||picture.sourceSha256!==replacement.sha256||picture.materialId!==replacement.materialId)throw new Error('교체 그림의 원본·형식·연결을 확인하세요.');
        if(picture.mime==='image/png'?[137,80,78,71,13,10,26,10].some((n,i)=>data[i]!==n):data[0]!==255||data[1]!==216||data[2]!==255)throw new Error('교체 그림의 실제 파일 형식이 다릅니다.');
        if((pictureBytes+=data.length)>80*1024*1024)throw new Error('그림은 한 번에 80MB 이하로 나누어 교체하세요.');
        seenPictures.add(target.id);pictureChanges.set(target.id,{replacement,picture:{...picture,bytes:data},target});
    }
    for(const [id,edit]of Object.entries(spec.objectPositions||{})){
        const object=objectMap.get(id);if(!object?.position||object.section!==spec.section||!['source','page'].includes(edit.positioning)||!['horizontalMm','verticalMm'].every(k=>Number.isFinite(edit[k])&&Math.abs(edit[k])<=1200))throw new Error('원본 개체 위치와 이동 범위를 확인하세요.');
        if(object.position.treatAsChar&&edit.positioning==='source')throw new Error('글자처럼 배치한 개체는 쪽 기준 배치를 선택한 뒤 이동하세요.');
    }
    // Text replacement changes byte offsets. Apply style/area patches to original positions first.
    const entries=readHwpxPackage(bytes),header=entries['Contents/header.xml']&&strFromU8(entries['Contents/header.xml']);
    if(!header||!entries[spec.section])throw new Error('원본의 서식 정의와 구역을 확인하세요.');
    const index=indexHwpxSection(header,'Contents/header.xml'),charNodes=index.nodes.filter(n=>local(n)==='charPr'),paraNodes=index.nodes.filter(n=>local(n)==='paraPr');
    const charMap=new Map(charNodes.map(n=>[n.attrs.id,n])),paraMap=new Map(paraNodes.map(n=>[n.attrs.id,n]));
    let charId=numericId(charNodes),paraId=numericId(paraNodes);
    let manifest=entries['Contents/content.hpf']&&strFromU8(entries['Contents/content.hpf']);const imageChanges=[];
    for(const change of pictureChanges.values()){
        if(!manifest||!/<(?:[\w.-]+:)?manifest\b/.test(manifest))throw new Error('그림 자산을 연결할 패키지 목록이 없습니다.');
        let ordinal=imageChanges.length+1,id=`jindanReplacement${ordinal}`;while(new RegExp(`\\bid=["']${id}["']`).test(manifest)||entries[`BinData/${id}.png`]||entries[`BinData/${id}.jpg`])id=`jindanReplacement${++ordinal}`;
        const path=`BinData/${id}.${change.picture.mime==='image/png'?'png':'jpg'}`;
        entries[path]=change.picture.bytes;change.binaryId=id;
        manifest=manifest.replace(/<\/((?:[\w.-]+:)?manifest)>/,(_,tag)=>`<${tag.includes(':')?tag.split(':')[0]+':':''}item id="${id}" href="${path}" media-type="${change.picture.mime}" isEmbeded="1"/></${tag}>`);
        imageChanges.push({objectId:change.target.id,materialId:change.replacement.materialId,sha256:change.replacement.sha256,binaryId:id});
    }
    if(imageChanges.length){if(XMLValidator.validate(manifest)!==true)throw new Error('그림 패키지 목록 검증에 실패했습니다.');entries['Contents/content.hpf']=strToU8(manifest);}
    const headerPatches=[],newChars=[],newParas=[],charCopies=new Map(),paraCopies=new Map(),fontIds={};
    const families=[...new Set([...(spec.applyBodyStyle?[spec.fontFamily]:[]),...Object.values(spec.roleStyles||{}).map(style=>style.fontFamily).filter(Boolean)])];
    for(const group of index.nodes.filter(n=>families.length&&local(n)==='fontface')){
        const fonts=index.nodes.filter(n=>n.parent===group&&local(n)==='font');
        if(!fonts.length)throw new Error('글꼴 그룹의 서식 원본을 학습해야 합니다.');
        const additions=[];let nextId=numericId(fonts);
        for(const family of families){const existing=fonts.find(n=>n.attrs.face===family),next=existing?.attrs.id??String(nextId++);(fontIds[family]||=( {} ))[group.attrs.lang?.toLowerCase()]=next;
            if(!existing){let copy=header.slice(fonts[0].start,fonts[0].end);copy=copy.replace(/^<[^>]+>/,tag=>attrs(tag,{id:next,face:family,isEmbedded:'0'}));additions.push(copy);}}
        if(additions.length)headerPatches.push({begin:group.closeStart,end:group.closeStart,value:additions.join('')},{begin:group.start,end:group.openEnd,value:attrs(header.slice(group.start,group.openEnd),{fontCnt:fonts.length+additions.length})});
    }
    const cloneChar=(old,style)=>{
        const key=JSON.stringify([old,style.fontFamily,style.fontSizePt,style.widthPercent,style.spacingPercent]);if(charCopies.has(key))return charCopies.get(key);const node=charMap.get(old);if(!node)throw new Error('본문 글자 모양 참조가 없습니다.');
        const id=String(charId++);let copy=header.slice(node.start,node.end).replace(/^<[^>]+>/,tag=>attrs(tag,{id,...(style.fontSizePt!=null?{height:Math.round(style.fontSizePt*100)}:{})}));
        if(!/<(?:[\w.-]+:)?fontRef\b/.test(copy))throw new Error('이 글자 모양의 글꼴 연결 방법을 학습해야 합니다.');
        if(style.fontFamily)copy=updateTag(copy,'fontRef',Object.fromEntries(languages.filter(l=>fontIds[style.fontFamily]?.[l]!=null).map(l=>[l,fontIds[style.fontFamily][l]])));
        if(style.widthPercent!=null)copy=updateTag(copy,'ratio',Object.fromEntries(languages.map(l=>[l,style.widthPercent])));
        if(style.spacingPercent!=null)copy=updateTag(copy,'spacing',Object.fromEntries(languages.map(l=>[l,style.spacingPercent])));
        newChars.push(copy);charCopies.set(key,id);return id;
    };
    const clonePara=(old,alignment,style=spec)=>{
        const key=JSON.stringify([old,alignment,...['lineSpacingPercent',...PARAGRAPH_FIELDS].map(k=>style[k])]);if(paraCopies.has(key))return paraCopies.get(key);const node=paraMap.get(old);if(!node)throw new Error('문단 모양 참조가 없습니다.');
        const id=String(paraId++);let copy=header.slice(node.start,node.end).replace(/^<[^>]+>/,tag=>attrs(tag,{id}));
        if(alignment)copy=updateTag(copy,'align',{horizontal:alignment});
        else {
            if(style.lineSpacingPercent!=null)copy=updateTag(copy,'lineSpacing',{type:'PERCENT',value:style.lineSpacingPercent,unit:'HWPUNIT'});
            for(const [key,{tag,scale}]of Object.entries(PARAGRAPH_NUMBERS))if(style[key]!=null){
                if(!new RegExp(`<(?:[\\w.-]+:)?${tag}\\b`).test(copy))throw new Error('원본 문단의 들여쓰기·간격 구조를 추가로 학습해야 합니다.');
                copy=updateTag(copy,tag,{value:Math.round(style[key]*scale),unit:'HWPUNIT'});
            }
            if(style.paragraphAlign)copy=updateTag(copy,'align',{horizontal:style.paragraphAlign});
            const flags=Object.fromEntries(Object.keys(PARAGRAPH_FLAGS).filter(k=>style[k]!=null).map(k=>[k,style[k]?'1':'0']));
            if(Object.keys(flags).length){if(!/<(?:[\w.-]+:)?breakSetting\b/.test(copy))throw new Error('원본 문단의 줄 나눔 구조를 추가로 학습해야 합니다.');copy=updateTag(copy,'breakSetting',flags);}
        }
        newParas.push(copy);paraCopies.set(key,id);return id;
    };
    const changedSections=[],warnings=[];let styledRuns=0;
    for(const [section,data] of Object.entries(entries).filter(([name])=>/^Contents\/section\d+\.xml$/.test(name))){
        if(scope?!spec.typographyScope.some(p=>p.section===section):section!==spec.section)continue;
        let xml=strFromU8(data);const native=indexHwpxSection(xml,section),patches=[],editedParagraphs=new Set();
        if(scope)for(const item of spec.typographyScope.filter(p=>p.section===section)){const owner=native.nodes.find(n=>n.paragraph?.index===item.index);if(!owner||ancestor(owner,'header')||ancestor(owner,'footer'))throw new Error('챕터 문단의 원본 위치가 다릅니다. 다시 분석하세요.');}
        const textRuns=new Set(native.nodes.filter(n=>n.slot).map(n=>ancestor(n,'run')));
        if(!scope){
        const pageNodes=native.nodes.filter(n=>local(n)==='pagePr');
        const page=pageNodes.find(n=>n.start===spec.pagePropertyPosition)||pageNodes[0];
        if(!page)throw new Error('선택 구역에 용지 정보가 없습니다.');
        patches.push({begin:page.start,end:page.openEnd,value:attrs(xml.slice(page.start,page.openEnd),{width:unit(spec.widthMm),height:unit(spec.heightMm)})});
        const margin=native.nodes.find(n=>n.parent===page&&local(n)==='margin');
        if(margin)patches.push({begin:margin.start,end:margin.openEnd,value:attrs(xml.slice(margin.start,margin.openEnd),Object.fromEntries(Object.entries(spec.margins).filter(([k])=>['top','bottom','left','right','header','footer','gutter'].includes(k)).map(([k,v])=>[k,unit(v)])))});
        const ownerRun=ancestor(page,'run'),prefix=page.name.includes(':')?page.name.split(':')[0]+':':'';
        let newId=numericId(native.nodes);
        for(const kind of ['header','footer'])if(spec[`${kind}Visible`]&&spec[kind]&&!native.nodes.some(n=>local(n)===kind)){
            if(!ownerRun?.closeStart)throw new Error('새 머리말·꼬리말을 넣을 구역 제어 위치가 없습니다.');
            const text=String(spec[kind]).split(/\r?\n/).map(escape).join(`<${prefix}lineBreak/>`);
            const area=`<${prefix}ctrl><${prefix}${kind} id="${newId++}" applyPageType="BOTH"><${prefix}subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><${prefix}p id="${newId++}" paraPrIDRef="${escape(paraNodes[0]?.attrs.id||'0')}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><${prefix}run charPrIDRef="${escape(charNodes[0]?.attrs.id||'0')}"><${prefix}t>${text}</${prefix}t></${prefix}run></${prefix}p></${prefix}subList></${prefix}${kind}></${prefix}ctrl>`;
            patches.push({begin:ownerRun.closeStart,end:ownerRun.closeStart,value:area});
        }
        if(spec.pageNumberVisible&&!native.nodes.some(n=>local(n)==='pageNum')&&!originalInfo.furniture.some(a=>a.section===section&&a.pageFields)){
            if(!ownerRun?.closeStart)throw new Error('쪽 번호를 넣을 구역 제어 위치가 없습니다.');
            patches.push({begin:ownerRun.closeStart,end:ownerRun.closeStart,value:`<${prefix}ctrl><${prefix}pageNum pos="${escape(spec.pageNumberPosition||'BOTTOM_CENTER')}" formatType="${escape(spec.pageNumberFormat||'DIGIT')}" sideChar="-"/></${prefix}ctrl>`});
        }
        }
        for(const node of native.nodes){
            const type=local(node),area=ancestor(node,'header')||ancestor(node,'footer'),cell=ancestor(node,'tc');
            const owner=type==='p'?node:ancestor(node,'p');
            if(scope&&(!['p','run'].includes(type)||area||!scope.has(`${section}:${owner?.paragraph?.index}`)))continue;
            const positionEdit=spec.objectPositions?.[`${section}:object:${node.start}`];
            const pictureChange=pictureChanges.get(`${section}:object:${node.start}`);
            if(pictureChange){const image=native.nodes.find(n=>n.parent===node&&local(n)==='img');patches.push({begin:image.start,end:image.openEnd,value:attrs(xml.slice(image.start,image.openEnd),{binaryItemIDRef:pictureChange.binaryId})});if(owner)editedParagraphs.add(owner.paragraph);}
            if(positionEdit){
                const position=native.nodes.find(n=>n.parent===node&&local(n)==='pos');
                const values={horzOffset:unit(positionEdit.horizontalMm),vertOffset:unit(positionEdit.verticalMm),...(positionEdit.positioning==='page'?{treatAsChar:'0',horzRelTo:'PAPER',vertRelTo:'PAPER',horzAlign:'LEFT',vertAlign:'TOP'}:{})};
                patches.push({begin:position.start,end:position.openEnd,value:attrs(xml.slice(position.start,position.openEnd),values)});
                if(owner)editedParagraphs.add(owner.paragraph);
            }
            const text=owner?.paragraph?.textSlots.map(s=>s.text).join('')||'';
            const role=paragraphRole(text,!!cell);
            const style=!area&&(spec.roleStyles?.[role]||(spec.applyBodyStyle&&(role==='body'||cell&&spec.includeTables)?spec:null));
            if(style&&['fontFamily','fontSizePt','widthPercent','spacingPercent'].some(k=>style[k]!=null)&&type==='run'&&textRuns.has(node)){
                patches.push({begin:node.start,end:node.openEnd,value:attrs(xml.slice(node.start,node.openEnd),{charPrIDRef:cloneChar(node.attrs.charPrIDRef,style)})});styledRuns++;if(owner)editedParagraphs.add(owner.paragraph);
            }
            if(hasParagraphChanges(style)&&type==='p'&&node.paragraph.textSlots.length){
                patches.push({begin:node.start,end:node.openEnd,value:attrs(xml.slice(node.start,node.openEnd),{paraPrIDRef:clonePara(node.attrs.paraPrIDRef,null,style)})});editedParagraphs.add(node.paragraph);
            }
            if(type==='p'&&area&&!cell){
                const alignment=spec.furnitureAlignments?.[`${section}:area:${area.start}`];
                if(alignment){if(!['LEFT','CENTER','RIGHT','JUSTIFY'].includes(alignment))throw new Error('머리말·꼬리말 정렬을 확인하세요.');patches.push({begin:node.start,end:node.openEnd,value:attrs(xml.slice(node.start,node.openEnd),{paraPrIDRef:clonePara(node.attrs.paraPrIDRef,alignment)})});editedParagraphs.add(node.paragraph);}
            }
            if(type==='autoNum'&&node.attrs.numType==='PAGE'){
                if(!spec.pageNumberVisible){const parent=node.parent;const target=parent&&local(parent)==='ctrl'&&native.nodes.filter(n=>n.parent===parent).length===1?parent:node;patches.push({begin:target.start,end:target.end,value:'',remove:true});}
                else {const format=native.nodes.find(n=>n.parent===node&&local(n)==='autoNumFormat');if(format)patches.push({begin:format.start,end:format.openEnd,value:attrs(xml.slice(format.start,format.openEnd),{type:spec.pageNumberFormat||'DIGIT'})});else warnings.push('PAGE 필드 형식 정의가 없어 해당 필드는 원본 형식을 보존했습니다.');if(spec.pageNumberPosition)warnings.push('머리말·꼬리말 PAGE 필드의 위치는 원래 문단·표 배치를 보존합니다. 위치는 해당 개체에서 수정하세요.');}
            }
            if(type==='pageNum'){
                if(!spec.pageNumberVisible){const parent=node.parent;const target=parent&&local(parent)==='ctrl'&&native.nodes.filter(n=>n.parent===parent).length===1?parent:node;patches.push({begin:target.start,end:target.end,value:'',remove:true});}
                else patches.push({begin:node.start,end:node.openEnd,value:attrs(xml.slice(node.start,node.openEnd),{formatType:spec.pageNumberFormat,...(spec.pageNumberPosition?{pos:spec.pageNumberPosition}:{})})});
            }
            if(['header','footer'].includes(type)&&spec[`${type}Visible`]===false){const parent=node.parent;const siblings=native.nodes.filter(n=>n.parent===parent);const target=parent&&local(parent)==='ctrl'&&siblings.length===1?parent:node;patches.push({begin:target.start,end:target.end,value:'',remove:true});}
        }
        for(const p of editedParagraphs)for(const cache of p.layoutCaches)patches.push({...cache,value:'',remove:true});
        // Text slots use original offsets and are changed alongside styles, so mixed runs remain separate.
        for(const edit of textEdits.filter(e=>e.section===section)){
            const slot=native.slots.find(s=>s.id===edit.slotId);if(!slot||slot.text!==edit.expectedText)throw new Error('머리말·꼬리말 글자 구간이 바뀌었습니다.');
            // XML 1.0 forbids these control characters.
            // eslint-disable-next-line no-control-regex
            if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(edit.value))throw new Error('문서에 사용할 수 없는 제어 문자입니다.');
            const prefix=slot.tagName.includes(':')?slot.tagName.split(':')[0]+':':'';
            const value=edit.value.replace(/\r\n?/g,'\n').split('\n').map(escape).join(`<${prefix}lineBreak/>`);
            patches.push({begin:slot.begin,end:slot.end,value});
            for(const cache of native.paragraphs[slot.paragraphIndex].layoutCaches)if(!patches.some(p=>p.begin===cache.begin&&p.end===cache.end))patches.push({...cache,value:'',remove:true});
        }
        xml=applyPatches(xml,patches);entries[section]=strToU8(xml);changedSections.push(section);
    }
    if(scope&&spec.typographyScope.some(p=>!changedSections.includes(p.section)))throw new Error('챕터 구역의 원본 연결을 확인하세요.');
    for(const [name,addition,count] of [['charProperties',newChars,charNodes.length],['paraProperties',newParas,paraNodes.length]]){
        const node=index.nodes.find(n=>local(n)===name);if(!node)throw new Error('글자·문단 서식 목록이 없습니다.');
        headerPatches.push({begin:node.start,end:node.openEnd,value:attrs(header.slice(node.start,node.openEnd),{itemCnt:count+addition.length})},{begin:node.closeStart,end:node.closeStart,value:addition.join('')});
    }
    entries['Contents/header.xml']=strToU8(applyPatches(header,headerPatches));
    removeStaleImagePreview(entries);
    if(entries['Preview/PrvText.txt'])entries['Preview/PrvText.txt']=strToU8('서식 편집 후보입니다. 본문·표·그림과 실제 쪽 배치를 검토하세요.');
    warnings.push('원본 표·그림·도형은 개체로 보존합니다. 글자와 여백 변경 후 실제 줄바꿈·쪽 나눔·홀짝 배치를 대조해야 합니다.');
    if(Object.values(entries).reduce((sum,b)=>sum+b.length,0)>256*1024*1024)throw new Error('작성본 크기가 256MB를 넘습니다. 나누어 작업하세요.');
    const review={schema:'jindan-restoration-edit/1',sourceSha256:spec.sourceSha256,changedSections,styledRuns,preservedObjects:originalInfo.objects.length,imageChanges,requiresLayoutReview:true,reportReady:false,warnings};
    entries['Contents/jindan-restoration.json']=strToU8(JSON.stringify(review));
    bytes=packHwpxPackage(entries);
    return {bytes,review};
}

const categories=text=>{
    if(/개선|보완|교체|증설|공사비/.test(text))return '개선·협의';
    if(/판정|이상\s*없|양호|불량|정상|주의|문제점/.test(text))return '판정·진단';
    if(/(?:19|20)\d{2}\s*[년./-]|측정일|진단기간/.test(text))return '기간·날짜';
    if(/전압|전류|역률|절연|온도|전력|THD|kWh|MWh|\b[AVWΩ℃]\b|[\d.]\s*(?:V|A|kW|MΩ|℃|%)/i.test(text))return '측정·운전자료';
    return null;
};
export function replacementInventory(document,analysis,restoration){
    const items=[];const add=(id,text,target,context)=>{const category=categories(text);if(category&&items.length<1500)items.push({id,category,text:String(text).slice(0,700),target,context,status:'review-required'});};
    if(analysis){for(const page of analysis.pages){for(const table of page.tables)for(const cell of table.cells)if(cell.text)add(cell.id,cell.text,{page:page.number,tableId:table.id,cellId:cell.id},`PDF ${page.number}쪽 · ${cell.row+1}행 ${cell.column+1}열`);for(const [i,line]of(page.ocr?.mergedLines||page.lines).entries())add(`pdf:p${page.number}:line${i}`,line.text,{page:page.number,line:i},`PDF ${page.number}쪽 · 본문`);for(const image of page.images.filter(i=>i.kind==='figure'))if(items.length<1500)items.push({id:image.id,category:'사진·그래프',text:'원문 그림의 유지·금회 자료 교체 여부를 확인하세요.',target:{page:page.number,imageId:image.id},context:`PDF ${page.number}쪽 · 그림`,status:'review-required'});}}
    else if(document){for(const table of document.tables)for(const cell of table.cells)add(cell.id,cell.text,{tableId:table.id,cellId:cell.id},`${table.title||'표'} · ${cell.row+1}행 ${cell.column+1}열`);for(const p of document.paragraphs.filter(p=>!p.tableId))add(p.id,document.format==='hwpx'?p.textSlots.map(s=>s.text).join(''):p.text,{paragraphId:p.id},p.area==='header'?'머리말 문단':p.area==='footer'?'꼬리말 문단':'본문 문단');}
    for(const object of restoration?.objects||[])if(object.kind==='pic'&&items.length<1500)items.push({id:object.id,category:'사진·그래프',text:'원본 그림의 유지·교체 여부와 배치를 확인하세요.',target:{objectId:object.id},context:object.area==='body'?'본문 그림':'머리말·꼬리말 그림',status:'review-required'});
    return {schema:'jindan-replacement-inventory/1',sourceSha256:document?.source?.sha256||analysis?.source?.sha256,items,limited:items.length===1500,reportReady:false};
}
