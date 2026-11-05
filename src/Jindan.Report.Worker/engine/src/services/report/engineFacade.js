import {ENGINE_CONTRACT_VERSION,ReportEngineError,engineBytes,engineHash,engineJson,engineClone,engineProject,engineCheckCancelled,requireEngine} from './engineContract.js';
import {createEngineRecovery,readEngineRecovery} from './engineRecovery.js';
import {engineFailure} from './engineFailure.js';

const defaults={
    async analyzePdf(bytes,filename,projectId,options){return (await import('./pdfAnalysis.js')).analyzePdfReport(bytes,filename,projectId,options);},
    async extractPictures(bytes,analysis,pages,options){
        if(!analysis.pages.filter(p=>pages.includes(p.number)).some(p=>p.images?.length))return {};
        requireEngine(typeof document!=='undefined','ADAPTER_REQUIRED','A local image extraction adapter is required outside the browser.');
        return (await import('./pdfOcr.js')).cropPdfPictures(bytes,analysis,pages,{...options,includeTextImages:true});
    }
};
const bundleSchema='jindan-engine-analysis/1';
// Real129-page PDF geometry exceeds32MB; keep a separate bounded analysis limit.
export const ENGINE_ANALYSIS_LIMIT=192*1024*1024;
const fingerprint=async bundle=>engineHash(new TextEncoder().encode(engineJson({...bundle,fingerprint:undefined},ENGINE_ANALYSIS_LIMIT)));

// Adapter functions must run locally. No API key, cloud, Electron, DOM or
// IndexedDB dependency is required to import or use the native/sidecar boundary.
export function createReportEngine(adapters={}){
    const local={...defaults,...adapters};
    async function run(operation,options,action){
        try{
            engineCheckCancelled(options?.signal);
            const progress=event=>{engineCheckCancelled(options?.signal);options?.onProgress?.({operation,...event});};
            progress({stage:'start'});const value=await action(progress);engineCheckCancelled(options?.signal);progress({stage:'complete'});engineCheckCancelled(options?.signal);
            return {ok:true,operation,contractVersion:ENGINE_CONTRACT_VERSION,value,reportReady:false};
        }catch(error){return {ok:false,operation,contractVersion:ENGINE_CONTRACT_VERSION,error:engineFailure(error,{cancelled:!!options?.signal?.aborted}),reportReady:false};}
    }
    async function bind(input,progress){
        const bytes=engineBytes(input.bytes),bundle=engineClone(input.bundle,ENGINE_ANALYSIS_LIMIT);engineProject(input.projectId);
        requireEngine(bundle.schema===bundleSchema&&bundle.projectId===input.projectId&&bundle.material?.sha256===await engineHash(bytes)&&bundle.fingerprint===await fingerprint(bundle),'BINDING_MISMATCH','Analysis, project, or exact source version differs.');
        progress({stage:'source-bound',sourceSha256:bundle.material.sha256});return {bytes,bundle};
    }
    async function context(input,bundle){
        const value={...engineClone(input.context||{}),material:bundle.material,analysis:bundle.analysis,projectId:bundle.projectId};
        requireEngine(Array.isArray(value.materials||[]),'INVALID_INPUT','Evidence metadata must be an array.');
        const provided=input.evidenceFiles||[];requireEngine(Array.isArray(provided),'INVALID_INPUT','Evidence files must be an array.');
        const ids=new Set();
        for(const material of value.materials||[]){
            requireEngine(typeof material.id==='string'&&!ids.has(material.id),'BINDING_MISMATCH','Evidence identities are duplicated or invalid.');ids.add(material.id);
            const matches=provided.filter(f=>f.id===material.id);
            requireEngine(matches.length===1&&await engineHash(engineBytes(matches[0].bytes))===material.sha256,'BINDING_MISMATCH','Every evidence material requires its exact local file bytes.');
        }
        return value;
    }
    return Object.freeze({
        contractVersion:ENGINE_CONTRACT_VERSION,
        analyze(input,options={}){return run('analyze',options,async progress=>{
            const bytes=engineBytes(input.bytes),projectId=engineProject(input.projectId),sha256=await engineHash(bytes),filename=String(input.filename||'source').slice(0,1000),isPdf=new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-';
            const {buildWorkflowAnalysis}=await import('./workflowAnalysis.js');
            let pdf,document,profile,restoration,provenance,format;
            if(isPdf){format='pdf';pdf=await local.analyzePdf(bytes,filename,projectId,{...options,onProgress:event=>progress({stage:'pdf-analysis',...event})});
                requireEngine(pdf.source?.sha256===sha256&&pdf.projectId===projectId,'BINDING_MISMATCH','PDF adapter returned a different source or project.');
            }else{
                document=await (await import('./sourceParser.js')).analyzeReport(bytes,filename);format=document.format;
                if(format==='hwpx'){
                    profile=await (await import('./referenceAnalyzer.js')).analyzeReferenceSource(bytes,filename);
                    restoration=(await import('./restoration.js')).inspectRestoration(bytes,sha256);
                    provenance=(await import('./pdfProvenance.js')).inspectPdfProvenance(bytes);
                }
            }
            const material={id:`reference-${sha256}`,sha256,filename,format,size:bytes.length,role:'reference'};
            const analysis=buildWorkflowAnalysis({material,projectId,pdf,document,profile,restoration,provenance});
            const bundle=engineClone({schema:bundleSchema,projectId,material,analysis,pdf,document,profile,restoration,provenance},ENGINE_ANALYSIS_LIMIT);bundle.fingerprint=await fingerprint(bundle);
            return bundle;
        });},
        pairReference(input,options={}){return run('pair-reference',options,async progress=>{
            const {bundle:pdfBundle}=await bind({...input.pdf,projectId:input.projectId},progress),{bundle:nativeBundle}=await bind({...input.reference,projectId:input.projectId},progress);
            requireEngine(pdfBundle.material.format==='pdf'&&nativeBundle.material.format==='hwpx','UNSUPPORTED_FORMAT','Pair learning requires PDF and original HWPX inputs.');
            const {learnPairedReference,applyPairedReference}=await import('./pairedReferenceLearning.js');
            let pdf=pdfBundle.pdf;
            if(input.textReview)pdf=(await import('./pairedTextReview.js')).applyPairedTextReview(pdf,nativeBundle.document,nativeBundle.profile,nativeBundle.material,engineClone(input.textReview));
            pdf=applyPairedReference(pdf,learnPairedReference(pdf,nativeBundle.document,nativeBundle.profile,nativeBundle.material));
            const {buildWorkflowAnalysis}=await import('./workflowAnalysis.js'),bundle={...pdfBundle,pdf,analysis:buildWorkflowAnalysis({material:pdfBundle.material,projectId:input.projectId,pdf})};
            bundle.fingerprint=await fingerprint(bundle);return bundle;
        });},
        restore(input,options={}){return run('restore',options,async progress=>{
            const {bytes,bundle}=await bind(input,progress);
            requireEngine(bundle.material.format==='pdf','UNSUPPORTED_FORMAT','Faithful PDF restoration requires a PDF analysis; existing HWPX stays an immutable source.');
            const {chapterConversionPlan}=await import('./chapterConversion.js');
            const plan=chapterConversionPlan({material:bundle.material,analysis:bundle.analysis,pdf:bundle.pdf,projectId:bundle.projectId,chapterId:input.chapterId},engineClone(input.settings||{}));
            const {extractPdfEmbeddedFonts,verifyPdfEmbeddedFonts}=await import('./pdfEmbeddedFonts.js');
            const pages=plan.sourcePages.map(p=>p.number),fonts=await extractPdfEmbeddedFonts(bytes,bundle.pdf,pages,options);engineCheckCancelled(options.signal);
            progress({stage:'extract-pictures'});const pictures=await local.extractPictures(bytes,bundle.pdf,pages,{...options,onProgress:event=>progress({stage:'extract-pictures',...event})});
            await verifyPdfEmbeddedFonts(plan,fonts);engineCheckCancelled(options.signal);progress({stage:'package-hwpx'});
            return (await import('./pdfHwpxWriter.js')).writePdfHwpx(plan,{spec:engineClone(input.spec||{}),pictures,fonts});
        });},
        prepareDraft(input,options={}){return run('prepare-draft',options,async progress=>{
            const {bundle}=await bind(input,progress);
            return (await import('./draftPreparation.js')).buildDraftPreparation(await context(input,bundle));
        });},
        writeDraft(input,options={}){return run('write-draft',options,async progress=>{
            const {bytes,bundle}=await bind(input,progress);return (await import('./draftWriter.js')).writePreparedDraft(bytes,await context(input,bundle));
        });},
        exportCollection(input,options={}){return run('export-collection',options,async progress=>{
            const {bytes,bundle}=await bind(input,progress);return (await import('./draftCollection.js')).exportDraftCollection(bytes,await context(input,bundle));
        });},
        importCollection(input,options={}){return run('import-collection',options,async progress=>{
            const {bytes,bundle}=await bind(input,progress),filled=engineBytes(input.filledBytes);return (await import('./draftCollection.js')).importDraftCollection(bytes,filled,input.filename||'returned.hwpx',await context(input,bundle));
        });},
        exportArtifact(input,options={}){return run('export',options,async()=>{
            const bytes=engineBytes(input.bytes),sha256=await engineHash(bytes);engineProject(input.projectId);
            requireEngine(!input.expectedSha256||input.expectedSha256===sha256,'BINDING_MISMATCH','Export file version differs.');
            const filename=[...String(input.filename||'candidate.hwpx')].map(c=>c.charCodeAt(0)<32||/[<>:"/\\|?*]/.test(c)?' ':c).join('').slice(0,180);
            return {bytes,sha256,size:bytes.length,filename,projectId:input.projectId,reportReady:false};
        });},
        createRecovery(input,options={}){return run('create-recovery',options,()=>createEngineRecovery(input));},
        recover(input,options={}){return run('recover',options,()=>readEngineRecovery(input.bytes,{projectId:input.projectId,expectedSha256:input.expectedSha256}));}
    });
}
export {ReportEngineError,ENGINE_CONTRACT_VERSION};
