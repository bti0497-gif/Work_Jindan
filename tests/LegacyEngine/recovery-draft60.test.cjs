const {test}=require('node:test'),assert=require('node:assert/strict'),{strFromU8,strToU8}=require('fflate');
const projectId='project:recovery60-synthetic',sha=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
async function fixture(){
 const {createReportEngine}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/engineFacade.js'),{pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js'),{readHwpxPackage,packHwpxPackage}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js'),engine=createReportEngine();
 const pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',discipline:'process',chapter:'제3장 공정',images:[],tables:[],lines:[{text:'제3장 공정',bbox:[50,80,300,100],size:16},{text:'BOD 12.3 mg/L',bbox:[50,130,400,145],size:11}]}]},original=writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes,oldBundle=(await engine.analyze({bytes:original,filename:'source.hwpx',projectId})).value;
 const entries=readHwpxPackage(original);delete entries['Contents/jindan-source.json'];entries['Contents/section0.xml']=strToU8(strFromU8(entries['Contents/section0.xml']).replace('제3장','제4장'));const saved=packHwpxPackage(entries);
 const oldReview={sourceSha256:sha(original),items:Object.fromEntries(oldBundle.analysis.sections.map(row=>[row.id,{decision:'keep',contentRole:row.contentRole,retentionPurpose:'static-label'}]))},archive=(await engine.createRecovery({projectId,files:[{id:'original',role:'source',filename:'source.hwpx',bytes:original},{id:'saved',role:'native-saved',filename:'native-saved.hwpx',bytes:saved,parentIds:['original']}],state:{bundle:oldBundle,review:oldReview,reportReady:true,currentEvidenceApproved:true}})).value;
 const recovered=(await engine.recover({bytes:archive.bytes,expectedSha256:archive.sha256,projectId})).value;return {engine,original,saved,oldBundle,oldReview,recovered,record:recovered.files.find(f=>f.id==='saved')};
}
test('actually recovered native-saved record rejects an old bundle, old review and metadata-only current evidence on the existing facade',async()=>{
 const f=await fixture(),before=f.record.bytes.slice();assert.equal(f.record.requiresReanalysis,true);assert.equal(f.recovered.state.currentEvidenceApproved,true);assert.equal(f.recovered.reportReady,false);
 const old=await f.engine.writeDraft({bytes:f.record.bytes,bundle:f.recovered.state.bundle,projectId,context:{review:f.recovered.state.review}});assert.equal(old.ok,false);assert.equal(old.error.code,'BINDING_MISMATCH');
 const fresh=(await f.engine.analyze({bytes:f.record.bytes,filename:f.record.filename,projectId})).value;
 const stale=await f.engine.prepareDraft({bytes:f.record.bytes,bundle:fresh,projectId,context:{review:f.recovered.state.review}});assert.equal(stale.ok,false);assert.match(stale.error.message,/다른 원본/);
 const metadata={id:'claimed-current',sha256:'c'.repeat(64),filename:'asserted.txt'},claim=await f.engine.prepareDraft({bytes:f.record.bytes,bundle:fresh,projectId,context:{materials:[metadata],review:{sourceSha256:f.record.sha256,items:{}}}});assert.equal(claim.error.code,'BINDING_MISMATCH');
 const review={sourceSha256:f.record.sha256,items:Object.fromEntries(fresh.analysis.sections.map(row=>[row.id,{decision:'keep',contentRole:'measurement',retentionPurpose:'static-label'}]))},plan=await f.engine.prepareDraft({bytes:f.record.bytes,bundle:fresh,projectId,context:{review}});assert.equal(plan.ok,true);assert.equal(plan.value.canWriteDraft,false);assert.equal((await f.engine.writeDraft({bytes:f.record.bytes,bundle:fresh,projectId,context:{review}})).ok,false);
 assert.deepEqual(f.record.bytes,before);assert.equal(sha(f.original),f.oldBundle.material.sha256);
});
test('optional recovered-draft host guard requires fresh analysis and an exact explicit review acknowledgement without trusting recovered state',async()=>{
 const f=await fixture(),{createRecoveredDraftSession}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/recoveredDraftSession.js'),session=await createRecoveredDraftSession(f.engine,f.recovered,'saved');
 assert.equal(session.status().hostAcknowledged,false);assert.equal((await session.writeDraft({context:{review:f.oldReview}})).error.code,'REANALYSIS_REQUIRED');
 const analyzed=await session.reanalyze();assert.equal(analyzed.ok,true);const bundle=analyzed.value;
 assert.equal((await session.writeDraft()).error.code,'ACKNOWLEDGEMENT_REQUIRED');
 assert.equal((await session.acknowledgeReview({acknowledged:true,sourceSha256:f.record.sha256,analysisFingerprint:bundle.fingerprint,context:{review:f.oldReview}})).error.code,'BINDING_MISMATCH');
 const context={draftMode:'blank',materials:[],review:{sourceSha256:f.record.sha256,items:Object.fromEntries(bundle.analysis.sections.map(row=>[row.id,{decision:'replace',contentRole:row.contentRole,clearValue:true}]))}};
 assert.equal((await session.acknowledgeReview({acknowledged:false,sourceSha256:f.record.sha256,analysisFingerprint:bundle.fingerprint,context})).error.code,'ACKNOWLEDGEMENT_REQUIRED');
 const ack=await session.acknowledgeReview({acknowledged:true,sourceSha256:f.record.sha256,analysisFingerprint:bundle.fingerprint,context});assert.equal(ack.ok,true);assert.equal(ack.value.nativeOrSemanticApproval,false);
 assert.equal((await session.writeDraft({context,bytes:f.original})).error.code,'INVALID_INPUT');
 assert.equal((await session.writeDraft({context:{...context,draftMode:'current'}})).error.code,'REVIEW_CHANGED');
 const blank=await session.writeDraft({context});assert.equal(blank.ok,true,JSON.stringify(blank.error));const read=await f.engine.analyze({bytes:blank.value.bytes,filename:'blank.hwpx',projectId});assert.ok(!read.value.document.paragraphs.some(p=>p.text.includes('12.3')));assert.equal(blank.reportReady,false);
 await session.reanalyze();assert.equal(session.status().hostAcknowledged,false);assert.equal((await session.writeDraft({context})).error.code,'ACKNOWLEDGEMENT_REQUIRED');
 const altered={...f.recovered,files:f.recovered.files.map(r=>r.id==='saved'?{...r,bytes:f.original}:r)};await assert.rejects(createRecoveredDraftSession(f.engine,altered,'saved'),/bytes differ/);
});
test('fresh analysis and acknowledged host review still cannot promote historical measurements or fabricated evidence claims',async()=>{
 const f=await fixture(),{createRecoveredDraftSession}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/recoveredDraftSession.js'),session=await createRecoveredDraftSession(f.engine,f.recovered,'saved'),bundle=(await session.reanalyze()).value;
 const context={review:{sourceSha256:f.record.sha256,items:Object.fromEntries(bundle.analysis.sections.map(row=>[row.id,{decision:'keep',contentRole:'measurement',retentionPurpose:'static-label'}]))}};
 assert.equal((await session.acknowledgeReview({acknowledged:true,sourceSha256:f.record.sha256,analysisFingerprint:bundle.fingerprint,context})).ok,true);
 const plan=await session.prepareDraft({context});assert.equal(plan.ok,true);assert.equal(plan.value.canWriteDraft,false);assert.equal((await session.writeDraft({context})).ok,false);
 const claimed={materials:[{id:'current',sha256:'a'.repeat(64)}],review:{sourceSha256:f.record.sha256,items:{}}};await session.acknowledgeReview({acknowledged:true,sourceSha256:f.record.sha256,analysisFingerprint:bundle.fingerprint,context:claimed});assert.equal((await session.writeDraft({context:claimed})).error.code,'BINDING_MISMATCH');
 const localEvidence=new TextEncoder().encode('Synthetic local file, no current measurement'),metadata={id:'synthetic',sha256:sha(localEvidence)},withBytes={...context,materials:[metadata],review:{sourceSha256:f.record.sha256,items:Object.fromEntries(bundle.analysis.sections.map(row=>[row.id,{decision:'keep',contentRole:'measurement',retentionPurpose:'static-label',materialIds:[metadata.id]}]))}};
 await session.acknowledgeReview({acknowledged:true,sourceSha256:f.record.sha256,analysisFingerprint:bundle.fingerprint,context:withBytes});const stillBlocked=await session.prepareDraft({context:withBytes,evidenceFiles:[{id:metadata.id,bytes:localEvidence}]});assert.equal(stillBlocked.ok,true);assert.equal(stillBlocked.value.canWriteDraft,false);assert.equal((await session.writeDraft({context:withBytes,evidenceFiles:[{id:metadata.id,bytes:localEvidence}]})).ok,false);
});
test('a slow superseded recovery analysis cannot restore an old session acknowledgement or publish a stale result',async()=>{
 const f=await fixture(),{createRecoveredDraftSession}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/recoveredDraftSession.js');let release,calls=0;
 const hostEngine={...f.engine,analyze:(...args)=>++calls===1?new Promise(resolve=>{release=()=>f.engine.analyze(...args).then(resolve);}):f.engine.analyze(...args)},session=await createRecoveredDraftSession(hostEngine,f.recovered,'saved');
 const slow=session.reanalyze(),fresh=await session.reanalyze();assert.equal(fresh.ok,true);const fingerprint=session.status().analysisFingerprint;await release();assert.equal((await slow).error.code,'CANCELLED');assert.equal(session.status().analysisFingerprint,fingerprint);assert.equal(session.status().hostAcknowledged,false);
 const context={draftMode:'blank',materials:[],review:{sourceSha256:f.record.sha256,items:{}}};fresh.value.material.sha256='mutated-return-object';
 const ack=await session.acknowledgeReview({acknowledged:true,sourceSha256:f.record.sha256,analysisFingerprint:fingerprint,context});assert.equal(ack.ok,true);assert.equal((await session.prepareDraft({context})).value.canWriteDraft,false);
});
