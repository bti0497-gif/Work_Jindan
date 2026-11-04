import {indexHwpxSection} from './hwpxPackage.js';
import {strFromU8} from 'fflate';
import {learnCellTextFormat} from './pairedCellFormatting.js';
const local=n=>n.name.split(':').at(-1);
const canonical=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
const sides=['left','right','top','bottom'];
const margins=n=>n&&sides.every(k=>/^\d+$/.test(n.attrs[k]||'')&&Number(n.attrs[k])<=72000)?Object.fromEntries(sides.map(k=>[k,Number(n.attrs[k])])):null;
const nearest=(n,name)=>{for(let p=n.parent;p;p=p.parent)if(local(p)===name)return p;return null;};

// Native table/cell order is checked against the parsed source document. IDs are
// local to that exact source SHA; no styles or measurements are inferred here.
export function nativeTableMarginProfiles(document,files){
    const result={};
    for(const [part,bytes]of Object.entries(files).filter(([p])=>/^Contents\/section\d+\.xml$/.test(p))){
        const index=indexHwpxSection(strFromU8(bytes),part),nodes=index.nodes.filter(n=>local(n)==='tbl'),tables=document.tables.filter(t=>t.anchor.section===part),children=new Map();
        for(const n of index.nodes){const list=children.get(n.parent)||[];list.push(n);children.set(n.parent,list);}
        if(nodes.length!==tables.length)continue;
        for(const [i,table]of tables.entries()){
            const node=nodes[i],cells=index.nodes.filter(n=>local(n)==='tc'&&nearest(n,'tbl')===node),inMargin=margins((children.get(node)||[]).find(n=>local(n)==='inMargin'));
            if(cells.length!==table.cells.length)continue;
            const rows=table.cells.map((cell,j)=>{
                const n=cells[j],child=children.get(n)||[],address=child.find(v=>local(v)==='cellAddr'),span=child.find(v=>local(v)==='cellSpan'),effective=n.attrs.hasMargin==='1'?margins(child.find(v=>local(v)==='cellMargin')):inMargin;
                if(!effective||Number(address?.attrs.rowAddr)!==cell.row||Number(address?.attrs.colAddr)!==cell.column||Number(span?.attrs.rowSpan)!==cell.rowSpan||Number(span?.attrs.colSpan)!==cell.colSpan)return null;
                return {referenceCellId:cell.id,row:cell.row,column:cell.column,rowSpan:cell.rowSpan,colSpan:cell.colSpan,text:cell.text,marginsHwpUnit:effective,basis:n.attrs.hasMargin==='1'?'cellMargin':'table inMargin'};
            });
            if(rows.every(Boolean))result[table.id]={referenceTableId:table.id,section:part,rows:table.rows,columns:table.columns,cells:rows};
        }
    }
    return result;
}
// A native table can contain a column boundary crossed by every cell. Such an
// invisible cut is absent from PDF strokes. Fold only globally unused cuts;
// every visible cell boundary, merge and text must still agree for the table.
const topology=table=>{const cuts=[...new Set([0,table.columns,...table.cells.flatMap(c=>[c.column,c.column+c.colSpan])])].sort((a,b)=>a-b);return {columns:cuts.length-1,cells:table.cells.map(c=>({cell:c,row:c.row,column:cuts.indexOf(c.column),rowSpan:c.rowSpan,colSpan:cuts.indexOf(c.column+c.colSpan)-cuts.indexOf(c.column)}))};};
const sameGrid=(a,b)=>{const x=topology(a),y=topology(b);return a.rows===b.rows&&x.columns===y.columns&&a.cells.length===b.cells.length&&x.cells.every(c=>y.cells.some(d=>c.row===d.row&&c.column===d.column&&c.rowSpan===d.rowSpan&&c.colSpan===d.colSpan&&canonical(c.cell.text)===canonical(d.cell.text)));};
const correspondingCell=(table,reference,cell)=>{const target=topology(table).cells.find(c=>c.cell===cell);return topology(reference).cells.find(c=>c.row===target.row&&c.column===target.column)?.cell;};
export function learnTableMargins(pdf,profile){
    const tables=Object.values(profile.tableMarginProfiles||{}),matches=[];
    for(const page of pdf.pages)for(const table of page.tables){
        if(table.cells.filter(c=>canonical(c.text)).length<2||table.cells.map(c=>canonical(c.text)).join('').length<12)continue;
        const hits=tables.filter(t=>sameGrid(table,t));if(hits.length!==1)continue;const hit=hits[0];
        matches.push({page:page.number,pdfTableId:table.id,referenceTableId:hit.referenceTableId,cells:table.cells.map(c=>{const source=correspondingCell(table,hit,c);return {pdfCellId:c.id,expectedText:c.text,row:c.row,column:c.column,rowSpan:c.rowSpan,colSpan:c.colSpan,referenceCellId:source.referenceCellId,referenceGrid:{row:source.row,column:source.column,rowSpan:source.rowSpan,colSpan:source.colSpan},marginsHwpUnit:source.marginsHwpUnit,basis:source.basis,textFormat:learnCellTextFormat(c,source)};})});
    }
    return matches;
}
export function applyTableMargins(table,page,learning){
    table={...table,cells:table.cells.map(cell=>{const {pairedMargins,pairedMarginSource,pairedTextFormat,...clean}=cell;void pairedMargins;void pairedMarginSource;void pairedTextFormat;return clean;})};
    const match=learning.tables?.find(t=>t.page===page&&t.pdfTableId===table.id);
    if(!match||match.cells.length!==table.cells.length||!table.cells.every(c=>match.cells.some(s=>s.pdfCellId===c.id&&s.row===c.row&&s.column===c.column&&s.rowSpan===c.rowSpan&&s.colSpan===c.colSpan&&s.expectedText===c.text)))return table;
    return {...table,cells:table.cells.map(c=>{const source=match.cells.find(s=>s.pdfCellId===c.id);return {...c,pairedMargins:source.marginsHwpUnit,pairedTextFormat:source.textFormat,pairedMarginSource:{...source,referenceTableId:match.referenceTableId,referenceSha256:learning.referenceSha256,pdfSourceSha256:learning.pdfSourceSha256}};})};
}
export function verifiedCellMargins(cell,plan){
    const source=cell.pairedMarginSource,value=cell.pairedMargins;
    if(plan.mode!=='reference'||!source||source.pdfCellId!==cell.id||source.expectedText!==cell.text||['row','column','rowSpan','colSpan'].some(k=>source[k]!==cell[k])||source.pdfSourceSha256!==plan.source.sha256||source.referenceSha256!==plan.pairedReference?.referenceSha256||source.referenceTableId==null||source.referenceCellId==null)return null;
    return value&&sides.every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=72000&&value[k]===source.marginsHwpUnit?.[k])?value:null;
}
