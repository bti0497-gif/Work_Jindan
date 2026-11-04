import {indexHwpxSection} from './hwpxPackage.js';

// Source-local style discovery, never a cross-document numeric style ID.
// Supervisor16 proved the full neutral definition as a unit, not lineSpacing
// alone. Clone it for the two generated intro paragraphs; never mutate tables.
export function collectionIntroStyle(header,document){
    const index=indexHwpxSection(header,'Contents/header.xml'),local=n=>n.name.split(':').at(-1);
    const definitions=index.nodes.filter(n=>local(n)==='paraPr'),byId=new Map(definitions.map(n=>[n.attrs.id,n]));
    const used=[...new Set(document.paragraphs.filter(p=>p.area==='body'&&!p.tableId).map(p=>p.paragraphShapeId))].map(id=>byId.get(id)).filter(Boolean);
    const neutral=node=>{const children=index.nodes.filter(n=>{for(let p=n.parent;p;p=p.parent)if(p===node)return true;return false;}),find=name=>children.filter(n=>local(n)===name);return node.attrs.snapToGrid==='0'&&find('align').some(n=>n.attrs.horizontal==='LEFT'&&n.attrs.vertical==='BASELINE')&&find('heading').some(n=>n.attrs.type==='NONE')&&find('lineSpacing').length>0&&find('lineSpacing').every(n=>n.attrs.type==='PERCENT'&&n.attrs.value==='200')&&find('margin').length>0&&['intent','left','right','prev','next'].every(name=>find(name).length>0&&find(name).every(n=>n.attrs.value==='0'));};
    const preferred=used.find(neutral)||definitions.find(neutral);
    const complete=n=>{const xml=header.slice(n.start,n.end);return ['align','heading','lineSpacing','margin'].every(name=>new RegExp(`<[^> :]+:${name}\\b`).test(xml));};
    const source=preferred||used.find(complete)||definitions.find(complete);
    if(!source)throw new Error('조사 양식 안내에 사용할 유효한 문단 서식 정의를 원본에서 찾지 못했습니다. 서식을 확인하세요.');
    const parent=source.parent;if(!parent||local(parent)!=='paraProperties')throw new Error('문단 서식 목록의 정의와 개수를 확인하세요.');
    const ids=definitions.map(n=>Number(n.attrs.id));if(ids.some(id=>!Number.isInteger(id)||id<0)||new Set(ids).size!==ids.length||Number(parent.attrs.itemCnt)!==definitions.filter(n=>n.parent===parent).length)throw new Error('원본 문단 서식의 식별자/목록 개수를 확인하세요.');
    // References inside the cloned definition stay source-local and must exist.
    for(const n of [source,...index.nodes.filter(n=>{for(let p=n.parent;p;p=p.parent)if(p===source)return true;return false;})])for(const [attribute,kind]of [['tabPrIDRef','tabPr'],['borderFillIDRef','borderFill']])if(n.attrs[attribute]!=null&&!index.nodes.some(d=>local(d)===kind&&d.attrs.id===n.attrs[attribute]))throw new Error('안내 문단이 참조하는 원본 서식 정의를 확인하세요.');
    const id=String(Math.max(...ids)+1),fragment=header.slice(source.start,source.end),opening=header.slice(parent.start,parent.openEnd),newOpening=opening.replace(/\bitemCnt="[^"]*"/,`itemCnt="${Number(parent.attrs.itemCnt)+1}"`);
    let clone=fragment.replace(/\bid="[^"]*"/,`id="${id}"`);
    if(!preferred){
        const set=(tag,name,value)=>new RegExp(`\\b${name}="[^"]*"`).test(tag)?tag.replace(new RegExp(`\\b${name}="[^"]*"`),`${name}="${value}"`):tag.replace(/\/?\s*>$/,end=>` ${name}="${value}"${end}`);
        clone=clone.replace(/<hh:paraPr\b[^>]*>/,tag=>set(tag,'snapToGrid','0')).replace(/<hh:align\b[^>]*\/>/g,tag=>set(set(tag,'horizontal','LEFT'),'vertical','BASELINE')).replace(/<hh:heading\b[^>]*\/>/g,tag=>set(set(set(tag,'type','NONE'),'idRef','0'),'level','0')).replace(/<hh:lineSpacing\b[^>]*\/>/g,tag=>set(set(tag,'type','PERCENT'),'value','200')).replace(/<hc:(?:intent|left|right|prev|next)\b[^>]*\/>/g,tag=>set(tag,'value','0'));
    }
    let changed=header.slice(0,parent.closeStart)+clone+header.slice(parent.closeStart);changed=changed.slice(0,parent.start)+newOpening+changed.slice(parent.openEnd);
    const after=indexHwpxSection(changed,'Contents/header.xml');if(!after.nodes.some(n=>local(n)==='paraPr'&&n.attrs.id===id))throw new Error('전용 안내 문단 서식을 저장하지 못했습니다.');
    return {header:changed,paragraphShapeId:id,evidence:{method:'clone-source-neutral-intro-style/1',sourceParagraphShapeId:source.attrs.id,sourceDefinition:fragment,dedicatedParagraphShapeId:id,normalizedFallback:!preferred,onlyIntroParagraphsUseNewDefinition:true,lineCacheAdded:false,nativeVerified:false}};
}
