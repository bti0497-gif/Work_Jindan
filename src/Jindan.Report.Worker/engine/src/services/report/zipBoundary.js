// Shared raw-entry policy. Called before extraction/filtering, including entries
// the parser does not consume. Duplicate ZIP names may never become last-wins.
export function createZipEntryGuard({maxEntries=20000,maxExpandedBytes=256*1024*1024}={}){
    const names=new Set();let total=0;
    return entry=>{
        const name=entry.name,parts=typeof name==='string'?name.split('/'):[];
        if(!name||name.startsWith('/')||name.includes('\\')||name.includes(':')||parts.some((p,i)=>p==='..'||p==='.'||p===''&&i!==parts.length-1)||names.has(name)||names.size>=maxEntries||!Number.isSafeInteger(entry.originalSize)||entry.originalSize<0||(total+=entry.originalSize)>maxExpandedBytes){
            const e=new Error('ZIP 패키지 항목의 중복·경로·크기 한도를 확인하세요.');e.code='INVALID_ARCHIVE';throw e;
        }
        names.add(name);return true;
    };
}
