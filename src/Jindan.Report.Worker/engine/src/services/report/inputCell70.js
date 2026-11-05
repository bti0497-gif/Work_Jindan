import {readInputTables} from './applicationData.js';
import {setValue,parseNumber} from './reportEngine.js';
import {engineBytes,engineHash,engineClone,requireEngine} from './engineContract.js';
const need=(c,code)=>requireEngine(c,code,'Current material cell mapping was rejected.');
export async function mapInputCell70(workspace,bytes,input){
    need(input?.confirmedContext===true,'MATERIAL_CONTEXT_REVIEW_REQUIRED');
    need(input.role==='current'&&typeof input.materialId==='string'&&input.materialId.length<=180,'HISTORICAL_EVIDENCE_DENIED');
    need(/\.(?:csv|xlsx)$/i.test(input.filename),'UNSUPPORTED_FORMAT');
    const source=engineBytes(bytes,48*1024*1024);need(await engineHash(source)===input.sha256,'MATERIAL_HASH_MISMATCH');
    // readInputTables itself bounds count/expanded bytes; guard duplicate/unsafe
    // XLSX entries through the same package boundary as inspection.
    if(/\.xlsx$/i.test(input.filename)){const {unzipSync}=await import('fflate');const names=new Set();let count=0,total=0;unzipSync(source,{filter:e=>{need(++count<=20000&&(total+=e.originalSize)<=128*1024*1024&&e.originalSize<=24*1024*1024&&!names.has(e.name)&&e.name&&!/[\\\0]/.test(e.name)&&!e.name.split('/').includes('..')&&!/^(?:\/|[A-Za-z]:)/.test(e.name),'INVALID_ARCHIVE');names.add(e.name);return false;}});}
    need([input.table,input.row,input.column].every(n=>Number.isInteger(n)&&n>=0),'INVALID_SOURCE_CELL');
    const cell=readInputTables(source,input.filename).tables[input.table]?.rows[input.row]?.[input.column];
    need(cell&&cell.formula!==true,'INVALID_SOURCE_CELL');
    const field=workspace.fields.find(f=>f.id===input.fieldId);need(field&&(!field.valueSource||field.valueSource==='input'),'INVALID_TARGET_FIELD');
    const quoted=String(cell.value??'').trim();need(quoted.length>0&&quoted.length<=20000,'EMPTY_SOURCE_CELL');let value=quoted;
    if(field.type==='number'){
        const unit=String(field.unit||'').trim();if(unit&&value.endsWith(unit))value=value.slice(0,-unit.length).trim();
        const amount=parseNumber(value);need(Number.isFinite(amount),'SOURCE_NUMBER_REQUIRED');value=value.replaceAll(',','');
    }
    if(field.type==='date'){const date=new Date(value+'T00:00:00Z');need(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value,'SOURCE_DATE_REQUIRED');}
    const previous=workspace.values[field.id];need(input.overwrite===true||previous==null||String(previous).trim()===''||String(previous)===value,'VALUE_OVERWRITE_REVIEW_REQUIRED');
    const result=setValue(engineClone(workspace),field.id,value);
    result.valueOrigins={...result.valueOrigins,[field.id]:{kind:'file-cell',materialId:input.materialId,sha256:input.sha256,filename:input.filename,table:input.table,row:input.row,column:input.column,address:cell.address,quotedText:quoted,contextConfirmed:true}};
    result.confirmedRevision=null;delete result.notesReviewedAt;return result;
}
