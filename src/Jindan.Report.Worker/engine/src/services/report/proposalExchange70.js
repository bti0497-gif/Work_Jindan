// Local proposal interchange. No provider, credentials, model selection or network.
import {createAnalysisRequest,validateAnalysis,applyAnalysis} from './reportAnalyzer.js';
import {createInterpretationRequest,validateInterpretation,applyInterpretation} from './reportInterpreter.js';
import {buildDraft} from './reportEngine.js';
import {engineClone,engineJson,engineHash,engineCheckCancelled,requireEngine} from './engineContract.js';
const digest=value=>engineHash(new TextEncoder().encode(engineJson(value,2*1024*1024)));
const need=(condition,code)=>requireEngine(condition,code,'Local proposal was rejected; no workspace was changed.');
export async function prepareProposal(workspace,mode,{signal}={}){
    engineCheckCancelled(signal);need(['analysis','interpretation'].includes(mode),'INVALID_PROPOSAL_MODE');
    const snapshot=engineClone(workspace);
    const request=mode==='analysis'?await createAnalysisRequest(snapshot):await createInterpretationRequest(buildDraft(snapshot));
    const requestSha256=await digest({mode,request});engineCheckCancelled(signal);
    return {schema:'jindan-proposal-request/1',mode,requestSha256,request,providerStatus:'NotConfigured',reportReady:false,supervisorAccepted:false};
}
function requireCurrentEvidence(workspace,response){
    const refs=[...(response.evidenceFieldIds||[]),...(response.fieldNotes||[]).flatMap(n=>n.evidenceFieldIds||[])];
    for(const id of refs){
        const field=workspace.fields.find(f=>f.id===id),value=workspace.values[id],origin=workspace.valueOrigins?.[id];
        need(field&&(!field.valueSource||field.valueSource==='input')&&value!=null&&String(value).trim()!==''&&['user-input','user-form','file-cell'].includes(origin?.kind),'CURRENT_EVIDENCE_REQUIRED');
    }
}
export async function inspectProposal(workspace,mode,envelope,{signal}={}){
    const current=await prepareProposal(workspace,mode,{signal});
    const copy=engineClone(envelope,2*1024*1024);
    need(copy?.schema==='jindan-proposal-response/1'&&copy.mode===mode&&copy.requestSha256===current.requestSha256,'STALE_PROPOSAL');
    const proposal=mode==='analysis'?await validateAnalysis(workspace,copy.response):await validateInterpretation(workspace,copy.response);
    if(mode==='interpretation')requireCurrentEvidence(workspace,copy.response);
    engineCheckCancelled(signal);
    return {schema:'jindan-proposal-review/1',mode,requestSha256:current.requestSha256,proposal,requiresExplicitApply:true,providerExecuted:false,reportReady:false,supervisorAccepted:false};
}
export async function applyProposal(workspace,mode,envelope,{explicitApply=false,signal}={}){
    need(explicitApply===true,'PROPOSAL_REVIEW_REQUIRED');
    await inspectProposal(workspace,mode,envelope,{signal});
    const result=mode==='analysis'?await applyAnalysis(engineClone(workspace),envelope.response):await applyInterpretation(engineClone(workspace),envelope.response);
    // Existing human/source review and strict HWPX draft path stay independent.
    result.confirmedRevision=null;delete result.notesReviewedAt;engineCheckCancelled(signal);return result;
}
export async function requestOfflineProposal(workspace,mode,{provider,signal,currentWorkspace=()=>workspace,timeoutMs=1000}={}){
    need(provider?.mode==='offline-fixture'&&typeof provider.propose==='function','PROVIDER_NOT_CONFIGURED');
    need(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'INVALID_TIMEOUT');
    engineCheckCancelled(signal);const request=await prepareProposal(workspace,mode,{signal});
    const controller=new AbortController();let timer,onAbort;
    const rejected=new Promise((_,reject)=>{
        const stop=code=>{controller.abort();const error=new Error('Local provider stopped.');error.code=code;reject(error);};
        onAbort=()=>stop('CANCELLED');signal?.addEventListener('abort',onAbort,{once:true});
        if(signal?.aborted)onAbort();timer=setTimeout(()=>stop('PROVIDER_TIMEOUT'),timeoutMs);
    });
    try{
        const response=await Promise.race([Promise.resolve().then(()=>provider.propose(engineClone(request),{signal:controller.signal})),rejected]);
        engineCheckCancelled(signal);const current=await prepareProposal(currentWorkspace(),mode,{signal});need(current.requestSha256===request.requestSha256,'STALE_PROPOSAL');
        await inspectProposal(currentWorkspace(),mode,response,{signal});return engineClone(response,2*1024*1024);
    }catch(error){const code=['CANCELLED','PROVIDER_TIMEOUT','STALE_PROPOSAL','CURRENT_EVIDENCE_REQUIRED'].includes(error?.code)?error.code:'PROVIDER_ERROR';need(false,code);}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.abort();}
}
