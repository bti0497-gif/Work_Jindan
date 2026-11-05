// Portable engine contracts: no UI, persistence, filesystem, or network access.
export const ENGINE_CONTRACT_VERSION='jindan-report-engine/1';
export class ReportEngineError extends Error {
    constructor(code,message){super(message);this.name='ReportEngineError';this.code=code;}
}
export function requireEngine(condition,code,message){if(!condition)throw new ReportEngineError(code,message);}
export function engineBytes(input,max=160*1024*1024){
    const view=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
    requireEngine(view?.length>0&&view.length<=max,'INVALID_INPUT','A nonempty, bounded binary input is required.');
    return view.slice(); // Never detach or mutate a caller's input.
}
export async function engineHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function engineJson(value,max=32*1024*1024){
    const seen=new Set();
    const normalize=(v,depth=0)=>{
        requireEngine(depth<=64,'INVALID_STATE','State nesting exceeds the contract limit.');
        if(v===null||typeof v==='string'||typeof v==='boolean')return v;
        if(typeof v==='number'){requireEngine(Number.isFinite(v),'INVALID_STATE','State numbers must be finite.');return v;}
        requireEngine(v&&typeof v==='object'&&!seen.has(v)&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null),'INVALID_STATE','State must be acyclic JSON data.');
        seen.add(v);let out;
        if(Array.isArray(v))out=v.map(item=>normalize(item,depth+1));
        else {out={};for(const key of Object.keys(v).sort()){
            requireEngine(!['__proto__','prototype','constructor'].includes(key),'INVALID_STATE','Unsafe state key.');
            if(v[key]!==undefined)out[key]=normalize(v[key],depth+1);
        }}
        seen.delete(v);return out;
    };
    const text=JSON.stringify(normalize(value));
    requireEngine(new TextEncoder().encode(text).length<=max,'INVALID_STATE','State exceeds the contract size limit.');
    return text;
}
export const engineClone=(value,max)=>JSON.parse(engineJson(value,max));
export function engineProject(projectId){requireEngine(typeof projectId==='string'&&/^project:[a-zA-Z0-9_.:%-]{1,160}$/.test(projectId),'INVALID_PROJECT','A stable project: identifier is required.');return projectId;}
export function engineCheckCancelled(signal){if(signal?.aborted)throw new ReportEngineError('CANCELLED','Operation cancelled; no output was published.');}
