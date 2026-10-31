import {unzipSync,strFromU8} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {analyzeReport} from './sourceParser.js';
import {replaceHwpxSlots} from './hwpxPackage.js';
import {repairReportNumbering} from './reportNumbering.js';

const array=value=>value==null?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false});
const xml=bytes=>{const text=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('엑셀 XML 구조를 확인하세요.');return parser.parse(text);};
const plain=value=>typeof value==='string'?value:String(value?.['#text']||'');
export function readInputTables(input,filename) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(bytes.length>48*1024*1024)throw new Error('표 입력자료는 48MB 이하로 나누어 등록하세요.');
    if(/\.csv$/i.test(filename)) {
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('euc-kr').decode(bytes);}
        const rows=[];let row=[],cell='',quoted=false,total=0;
        const push=()=>{row.push(cell);cell='';if(++total>50000)throw new Error('CSV 셀 개수 한도(50,000개)를 넘습니다.');};
        for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted)push();else if((c==='\n'||c==='\r')&&!quoted){push();rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}else cell+=c;}
        if(quoted)throw new Error('CSV 따옴표가 닫히지 않았습니다.');if(cell||row.length){push();rows.push(row);}
        return {kind:'tables',tables:[{name:filename,rows:rows.map((values,r)=>values.map((value,c)=>({address:`R${r+1}C${c+1}`,value,formula:false})))}],reportReady:false};
    }
    let total=0,count=0;const entries=unzipSync(bytes,{filter:entry=>{if(++count>20000||(total+=entry.originalSize)>128*1024*1024||entry.originalSize>24*1024*1024)throw new Error('엑셀 패키지 크기 한도를 넘습니다.');return /^xl\/(?:workbook\.xml|sharedStrings\.xml|_rels\/workbook.xml.rels|worksheets\/sheet\d+\.xml)$/.test(entry.name);}});
    if(!entries['xl/workbook.xml'])throw new Error('엑셀 워크북을 찾을 수 없습니다.');
    const book=xml(entries['xl/workbook.xml']).workbook,strings=entries['xl/sharedStrings.xml']?array(xml(entries['xl/sharedStrings.xml']).sst?.si).map(si=>si.t!=null?plain(si.t):array(si.r).map(r=>plain(r.t)).join('')):[];
    const rels=entries['xl/_rels/workbook.xml.rels']?array(xml(entries['xl/_rels/workbook.xml.rels']).Relationships?.Relationship):[];
    let cells=0;const tables=[];
    for(const sheet of array(book.sheets?.sheet)) {
        const relation=rels.find(r=>r.Id===sheet.id),target=relation?.Target?.replace(/^\/?xl\//,'');
        if(!target||!/^worksheets\/sheet\d+\.xml$/.test(target)||!entries[`xl/${target}`])throw new Error('엑셀 시트 연결을 확인하세요.');
        const rows=array(xml(entries[`xl/${target}`]).worksheet?.sheetData?.row).map(row=>array(row.c).map(cell=>{
            if(++cells>50000)throw new Error('엑셀 셀 개수 한도(50,000개)를 넘습니다.');
            const value=cell.t==='s'?strings[Number(cell.v)]??'':cell.t==='inlineStr'?plain(cell.is?.t)||array(cell.is?.r).map(r=>plain(r.t)).join(''):plain(cell.v);
            return {address:cell.r||'',value,formula:cell.f!=null};
        }));
        tables.push({name:sheet.name||'시트',rows});
    }
    if(!tables.length)throw new Error('읽을 수 있는 엑셀 시트가 없습니다.');
    return {kind:'tables',tables,reportReady:false};
}
export async function createReportTextCandidate(bytes,filename,sourceSha256,target,value) {
    const document=await analyzeReport(bytes,filename);
    if(document.format!=='hwpx'||document.source.sha256!==sourceSha256)throw new Error('HWPX 원본 버전과 적용 위치를 다시 확인하세요.');
    const cell=target.cellId?document.tables.find(table=>table.id===target.tableId)?.cells.find(cell=>cell.id===target.cellId):null;
    const paragraph=target.paragraphId?document.paragraphs.find(p=>p.id===target.paragraphId):null;
    const slots=(cell||paragraph)?.textSlots;
    if(!slots?.length||slots.some(slot=>!slot.plain&&!slot.textOnly))throw new Error('선택한 위치는 글자 구간을 보존해 교체할 수 없습니다.');
    if(typeof value!=='string'||value.length>50000)throw new Error('적용할 새 내용은 50,000자 이하로 입력하세요.');
    const replacements=slots.map((slot,index)=>({section:slot.section,slotId:slot.id,expectedText:slot.text,wholeText:true,value:index===0?value:''}));
    const output=await replaceHwpxSlots(bytes,sourceSha256,replacements),numbering=repairReportNumbering(output.bytes);
    return {bytes:numbering.bytes,review:{sourceSha256,target,previousText:cell?.text||paragraph?.text||'',value,numbering:numbering.report,status:'hancom-review-required',requiresLayoutReview:true}};
}
