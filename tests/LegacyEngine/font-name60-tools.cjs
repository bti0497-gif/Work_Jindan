// Diagnostic only. Not imported by the production writer or font extractor.
const assert=require('node:assert/strict');
const checksum=bytes=>{let sum=0;for(let i=0;i<bytes.length;i+=4)sum=(sum+((bytes[i]||0)*0x1000000+(bytes[i+1]||0)*0x10000+(bytes[i+2]||0)*0x100+(bytes[i+3]||0)))>>>0;return sum;};
function recordsOf(data){const b=Buffer.from(data),count=b.readUInt16BE(2),storage=b.readUInt16BE(4);assert.equal(b.readUInt16BE(0),0,'Only bounded name version0 diagnostics are supported.');assert.ok(count<=4096&&6+count*12<=storage&&storage<=b.length);return {storage,records:Array.from({length:count},(_,index)=>{const at=6+index*12,platform=b.readUInt16BE(at),encoding=b.readUInt16BE(at+2),language=b.readUInt16BE(at+4),nameId=b.readUInt16BE(at+6),length=b.readUInt16BE(at+8),offset=b.readUInt16BE(at+10);assert.ok(storage+offset+length<=b.length);return {index,at,platform,encoding,language,nameId,bytes:b.subarray(storage+offset,storage+offset+length)};})};}
async function canonicalLegacyNames(input){
 const {sfntTables}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/sfntFonts.js'),source=Buffer.from(input);sfntTables(source);assert.equal(checksum(source),0xb1b0afba,'Diagnostic input checksum must already be valid.');
 const count=source.readUInt16BE(4),directory=new Map();for(let i=0;i<count;i++){const at=12+16*i;directory.set(source.toString('ascii',at,at+4),{at,offset:source.readUInt32BE(at+8),length:source.readUInt32BE(at+12)});}
 const entry=directory.get('name'),old=source.subarray(entry.offset,entry.offset+entry.length),{storage,records}=recordsOf(old),changes=[],next=Buffer.alloc(old.length);old.copy(next,0,0,storage);let cursor=0;
 for(const record of records){let data=record.bytes;
  if(record.platform===3&&record.encoding===5&&data.length>0&&data.length%2===0&&Array.from({length:data.length/2},(_,i)=>data[i*2]).every(b=>b===0)){
   const raw=Buffer.from(Array.from({length:data.length/2},(_,i)=>data[i*2+1]));let meaning;try{meaning=new TextDecoder('euc-kr',{fatal:true}).decode(raw);}catch{throw new Error('Zero-extended encoding5 record has no unambiguous CP949 decoding.');}
   assert.ok(!meaning.includes('\0'),'Embedded NUL is not a supported diagnostic name.');
   changes.push({index:record.index,platform:3,encoding:5,language:record.language,nameId:record.nameId,beforeBytes:data.length,afterBytes:raw.length,decodedCP949:meaning});data=raw;
  }
  assert.ok(storage+cursor+data.length<=next.length);next.writeUInt16BE(data.length,record.at+8);next.writeUInt16BE(cursor,record.at+10);data.copy(next,storage+cursor);cursor+=data.length;
 }
 const output=Buffer.from(source);next.copy(output,entry.offset);output.writeUInt32BE(checksum(next),entry.at+4);const head=directory.get('head');output.writeUInt32BE(0,head.offset+8);output.writeUInt32BE((0xb1b0afba-checksum(output))>>>0,head.offset+8);assert.equal(checksum(output),0xb1b0afba);
 const a=sfntTables(source),b=sfntTables(output);for(const [tag,data]of a)if(!['name','head'].includes(tag))assert.deepEqual(b.get(tag),data,tag+' changed');const headBefore=Buffer.from(a.get('head')),headAfter=Buffer.from(b.get('head'));headBefore.writeUInt32BE(0,8);headAfter.writeUInt32BE(0,8);assert.deepEqual(headBefore,headAfter);
 const after=recordsOf(b.get('name')).records;for(const record of records)if(!changes.some(c=>c.index===record.index))assert.deepEqual(after[record.index].bytes,record.bytes,'Untargeted name record changed');
 return {bytes:new Uint8Array(output),changes,nameRecordCount:records.length,onlyTablesChanged:['name','head.checkSumAdjustment'],glyphsMetricsCmapAndEmbeddingFlagsUnchanged:true};
}
module.exports={canonicalLegacyNames,recordsOf,checksum};
