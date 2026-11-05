import {strFromU8} from 'fflate';
import {indexHwpxSection} from './hwpxPackage.js';
import {sfntTables} from './sfntFonts.js';
const local=n=>n.name.split(':').at(-1);
const sequence={charPr:['fontRef','ratio','spacing','relSz','offset','italic','bold','underline','strikeout','outline','shadow','emboss','engrave','supscript','subscript'],rect:['offset','orgSz','curSz','flip','rotationInfo','renderingInfo','lineShape','fillBrush','drawText','shadow','pt0','pt1','pt2','pt3','sz','pos','outMargin','caption','shapeComment'],line:['offset','orgSz','curSz','flip','rotationInfo','renderingInfo','lineShape','fillBrush','drawText','shadow','startPt','endPt','sz','pos','outMargin','caption','shapeComment'],polygon:['offset','orgSz','curSz','flip','rotationInfo','renderingInfo','lineShape','fillBrush','drawText','shadow','pt','sz','pos','outMargin','caption','shapeComment']};
// Guard the supported generator's own invariants. This is not an XSD validator or a Hancom-open test.
export function validateGeneratedHwpx(entries,{requireFurnitureParagraphs=true}={}){
    const sections=Object.keys(entries).filter(f=>/^Contents\/section\d+\.xml$/.test(f));
    if(!entries['Contents/header.xml']||!entries['Contents/content.hpf']||!sections.length)throw Error('생성 HWPX의 기본 패키지 항목이 없습니다.');
    const header=indexHwpxSection(strFromU8(entries['Contents/header.xml']),'Contents/header.xml'),defs={};
    for(const type of ['charPr','paraPr','style','borderFill','tabPr']){const nodes=header.nodes.filter(n=>local(n)===type),ids=nodes.map(n=>n.attrs.id);if(ids.some(id=>!/^\d+$/.test(id))||new Set(ids).size!==ids.length)throw Error(`생성 HWPX ${type} ID가 중복되거나 잘못되었습니다.`);defs[type]=new Set(ids);}
    if(Number(header.nodes.find(n=>local(n)==='head')?.attrs.secCnt)!==sections.length)throw Error('생성 HWPX 구역 수가 맞지 않습니다.');
    const references={charPrIDRef:'charPr',paraPrIDRef:'paraPr',styleIDRef:'style',borderFillIDRef:'borderFill',tabPrIDRef:'tabPr',nextStyleIDRef:'style'},fonts={};
    for(const face of header.nodes.filter(n=>local(n)==='fontface')){const nodes=header.nodes.filter(n=>n.parent===face&&local(n)==='font'),ids=nodes.map(n=>n.attrs.id);if(Number(face.attrs.fontCnt)!==nodes.length||new Set(ids).size!==ids.length)throw Error('생성 HWPX 글꼴 수·ID가 맞지 않습니다.');fonts[face.attrs.lang.toLowerCase()]=new Set(ids);}
    for(const n of header.nodes){if(n.attrs.itemCnt!=null&&Number(n.attrs.itemCnt)!==header.nodes.filter(c=>c.parent===n).length)throw Error(`생성 HWPX ${local(n)} 항목 수가 맞지 않습니다.`);if(local(n)==='fontRef')for(const [lang,id]of Object.entries(n.attrs))if(!fonts[lang]?.has(id))throw Error('생성 HWPX의 글꼴 참조가 없습니다.');}
    const manifest=indexHwpxSection(strFromU8(entries['Contents/content.hpf']),'Contents/content.hpf'),items=manifest.nodes.filter(n=>local(n)==='item'),itemMap=new Map(items.map(n=>[n.attrs.id,n.attrs.href]));
    if(items.length!==itemMap.size||items.some(n=>!entries[n.attrs.href])||manifest.nodes.filter(n=>local(n)==='itemref').some(n=>!itemMap.has(n.attrs.idref)))throw Error('생성 HWPX 패키지 참조가 잘못되었습니다.');
    for(const font of header.nodes.filter(n=>local(n)==='font'&&n.attrs.isEmbedded==='1')){const file=itemMap.get(font.attrs.binaryItemIDRef);if(!file||!/^BinData\/[^/]+\.ttf$/.test(file)||!entries[file])throw Error('생성 HWPX 포함 글꼴 참조가 없습니다.');sfntTables(entries[file]);}
    for(const [filename,index]of [['Contents/header.xml',header],...sections.map(f=>[f,indexHwpxSection(strFromU8(entries[f]),f)])]){
        const children=new Map();for(const n of index.nodes){const list=children.get(n.parent)||[];list.push(n);children.set(n.parent,list);}
        for(const n of index.nodes){
            if(requireFurnitureParagraphs&&local(n)==='subList'&&['header','footer'].includes(n.parent&&local(n.parent))&&!(children.get(n)||[]).some(c=>local(c)==='p'))throw Error('생성 HWPX 머리말·꼬리말 목록에 빈 문단이 필요합니다.');
            for(const [attr,type]of Object.entries(references))if(n.attrs[attr]!=null&&!defs[type].has(n.attrs[attr])&&!(local(n)==='paraHead'&&attr==='charPrIDRef'&&n.attrs[attr]==='4294967295'))throw Error(`생성 HWPX ${filename}의 ${attr} 참조가 없습니다.`);
            if(local(n)==='img'&&!entries[itemMap.get(n.attrs.binaryItemIDRef)])throw Error('생성 HWPX 그림 참조가 없습니다.');
            const order=sequence[local(n)],direct=children.get(n)||[];if(order){const positions=direct.map(c=>order.indexOf(local(c)));if(positions.some((p,i)=>p<0||i>0&&p<positions[i-1]))throw Error(`생성 HWPX ${local(n)} 하위 요소 순서가 잘못되었습니다.`);}
        }
    }
    return {schema:'jindan-generated-hwpx-validation/1',sections:sections.length,structuralChecksPassed:true,scope:'generator invariants only',hancomVerified:false};
}
