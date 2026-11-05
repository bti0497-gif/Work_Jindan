import {ENGINE_CONTRACT_VERSION,engineBytes,engineHash,engineJson,engineClone,engineProject,requireEngine} from './engineContract.js';
import {engineFailure} from './engineFailure.js';
export const RECOVERED_DRAFT_SESSION_VERSION='jindan-recovered-draft-session/1';

// Optional host workflow guard. This does not authenticate archives, prove a
// human review, or change the underlying engine API. Recovered state is never
// imported as an executable drafting context.
export async function createRecoveredDraftSession(engine,recovered,recordId,{projectId=recovered?.manifest?.projectId}={}){
    engineProject(projectId);
    requireEngine(engine?.contractVersion===ENGINE_CONTRACT_VERSION&&['analyze','prepareDraft','writeDraft','exportCollection','importCollection'].every(k=>typeof engine[k]==='function'),'INVALID_INPUT','Use a compatible local report-engine instance.');
    requireEngine(recovered?.recoveryMode==='project-assisted'&&recovered.manifest?.projectId===projectId&&Array.isArray(recovered.files),'BINDING_MISMATCH','Use a recovered project matching this host session.');
    const matches=recovered.files.filter(f=>f.id===recordId);requireEngine(matches.length===1,'INVALID_RECOVERY','Select one explicit recovered document.');
    const record=matches[0],bytes=engineBytes(record.bytes),sourceSha256=await engineHash(bytes);
    requireEngine(sourceSha256===record.sha256,'BINDING_MISMATCH','Recovered document bytes differ from their recorded version.');
    const filename=record.filename,archiveSha256=recovered.sha256;
    let bundle=null,acknowledgedContext=null,generation=0;
    const result=(operation,value)=>({ok:true,operation,contractVersion:ENGINE_CONTRACT_VERSION,value,reportReady:false});
    async function run(operation,action){try{return await action();}catch(error){return {ok:false,operation,contractVersion:ENGINE_CONTRACT_VERSION,error:engineFailure(error),reportReady:false};}}
    const requireAnalysis=()=>requireEngine(bundle,'REANALYSIS_REQUIRED','Analyze the selected recovered bytes in this session first.');
    const unchanged=g=>requireEngine(g===generation,'CANCELLED','A newer analysis superseded this recovered-document operation.');
    function input(context,evidenceFiles=[]){return {bytes,bundle,projectId,context,evidenceFiles};}
    async function draftAction(operation,method,{context={},evidenceFiles=[],...extra}={},options){
        return run(operation,async()=>{
            requireAnalysis();const g=generation,snapshot=engineClone(context);
            requireEngine(acknowledgedContext!==null,'ACKNOWLEDGEMENT_REQUIRED','Explicitly acknowledge the fresh analysis and review context before writing or collecting.');
            requireEngine(engineJson(snapshot)===acknowledgedContext,'REVIEW_CHANGED','The review context changed after acknowledgement; inspect and acknowledge it again.');
            requireEngine(Object.keys(extra).every(k=>method==='importCollection'&&['filledBytes','filename'].includes(k)),'INVALID_INPUT','A recovered session owns its bytes, project and analysis; these cannot be overridden.');
            const evidence=evidenceFiles.map(f=>({id:f.id,bytes:engineBytes(f.bytes)})),returned=method==='importCollection'?{filledBytes:engineBytes(extra.filledBytes),filename:extra.filename}:{};
            const output=await engine[method]({...input(snapshot,evidence),...returned},options);unchanged(g);return output;
        });
    }
    return Object.freeze({
        status:()=>({sessionVersion:RECOVERED_DRAFT_SESSION_VERSION,recordId,projectId,archiveSha256,sourceSha256,requiresReanalysis:!bundle,analysisFingerprint:bundle?.fingerprint||null,hostAcknowledged:acknowledgedContext!==null,reportReady:false}),
        reanalyze(options={}){return run('recovered/reanalyze',async()=>{
            const g=++generation;bundle=null;acknowledgedContext=null;
            const output=await engine.analyze({bytes,filename,projectId},options);unchanged(g);if(output.ok){requireEngine(output.value.material.sha256===sourceSha256,'BINDING_MISMATCH','Fresh analysis returned a different source.');bundle=engineClone(output.value,192*1024*1024);}return output;
        });},
        prepareDraft({context={},evidenceFiles=[]}={},options={}){return run('recovered/prepare-draft',async()=>{
            requireAnalysis();const g=generation,output=await engine.prepareDraft(input(engineClone(context),evidenceFiles),options);unchanged(g);return output;
        });},
        acknowledgeReview({acknowledged,sourceSha256:expected,analysisFingerprint,context}={}){return run('recovered/acknowledge-review',async()=>{
            requireAnalysis();acknowledgedContext=null;
            requireEngine(acknowledged===true,'ACKNOWLEDGEMENT_REQUIRED','The host must explicitly acknowledge this fresh review context.');
            requireEngine(expected===sourceSha256&&analysisFingerprint===bundle.fingerprint&&context?.review?.sourceSha256===sourceSha256,'BINDING_MISMATCH','Acknowledgement or review refers to a different source/analysis version.');
            acknowledgedContext=engineJson(context);return result('recovered/acknowledge-review',{sourceSha256,analysisFingerprint,hostAcknowledged:true,nativeOrSemanticApproval:false});
        });},
        writeDraft:(input,options)=>draftAction('recovered/write-draft','writeDraft',input,options),
        exportCollection:(input,options)=>draftAction('recovered/export-collection','exportCollection',input,options),
        importCollection:(input,options)=>draftAction('recovered/import-collection','importCollection',input,options)
    });
}
