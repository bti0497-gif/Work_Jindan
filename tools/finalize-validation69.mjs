import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Evidence aggregation only: no build, test, application, update, or settings action.
// Run only after the coordinator releases all final selected-package receipts. Output is fresh-only.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const options=new Map();
const accepted=new Set(['--package-version','--headless','--snapshot','--files','--preservation','--health','--cad','--verification','--output']);
for(let n=2;n<process.argv.length;n+=2){
  const key=process.argv[n],value=process.argv[n+1];
  if(!accepted.has(key)||!value||value.startsWith('--')||options.has(key))throw Error('Expected unique documented option/value pairs.');
  options.set(key,value);
}
const version=options.get('--package-version')??'r6';
if(!/^r[5-9][0-9]{0,2}$/.test(version))throw Error('Expected a bounded package suffix such as r6.');
if(!options.has('--headless'))throw Error('Provide --headless with the exact selected frozen product headless receipt.');
const rel=p=>path.relative(root,p).replaceAll('\\','/');
function owned(p,area){
  const full=path.resolve(root,p),base=path.join(root,area)+path.sep;
  if(!full.startsWith(base))throw Error('Evidence/output must remain in the declared new workspace area: '+p);
  for(let q=full;q!==root;q=path.dirname(q))if(fs.existsSync(q)&&fs.lstatSync(q).isSymbolicLink())throw Error('Linked evidence/output is not accepted: '+p);
  return full;
}
const text=p=>{const b=fs.readFileSync(p);return(b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');};
const json=p=>JSON.parse(text(p));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ref=p=>({path:rel(path.resolve(p)),sha256:hash(p),bytes:fs.statSync(p).size});
const falseApproval=r=>{assert.equal(r.reportReady,false,'reportReady must remain false');assert.equal(r.supervisorAccepted,false,'supervisorAccepted must remain false');};
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const review=`artifacts/ready-for-review/final66-${version}`,app=path.resolve(review,'application');
const out=owned(options.get('--output')??'handoff/VALIDATION69.json','handoff');
if(fs.existsSync(out))throw Error('Output already exists; preserve it and select a fresh --output.');
const head=options.get('--headless');owned(head,'artifacts');
const manifest=json(review+'/artifact-manifest.json'),source=json(review+'/source-checkpoint.json');
falseApproval(manifest);assert.equal(manifest.sourceStable,true);assert.equal(source.files.length,178);
assert.equal(hash(review+'/source-checkpoint.json'),manifest.sourceCheckpointSha256);
const declared=new Map(manifest.files.map(f=>[f.path,f]));
const declaredHash=p=>{const item=declared.get('application/'+p);assert(item,'Missing declared application payload: '+p);return item.sha256;};
const headless=json(head);assert(headless.complete&&headless.passed&&headless.results.length===12&&headless.results.every(r=>r.exit===0));falseApproval(headless);
assert.equal(headless.results.find(r=>r.name==='module-package').pass,81,'Headless source81 is separate from packaged82.');
assert.equal(headless.results.find(r=>r.name==='report-adapter').pass,42,'Source Adapter42 includes the twelve-trial race assertion.');
const sdkHandoff=`artifacts/final-${version}-desktop-ui66-01/FINAL_UI_HANDOFF.json`;
const sdk=json(sdkHandoff);assert.equal(sdk.passed??sdk.pass,51);assert.equal(sdk.failed??sdk.fail,0);falseApproval(sdk);
assert(samePath(sdk.package,app));assert.equal(sdk.hostSha256,declaredHash('Jindan.Desktop.dll'));
assert.equal(sdk.sourceCheckpointSha256,manifest.sourceCheckpointSha256);assert.equal(sdk.outerManifestSha256,hash(review+'/artifact-manifest.json'));
const suites=[
  ['native-main',`artifacts/final-${version}-desktop-ui66-01/ui-result.json`,23],
  ['native-fresh-process',`artifacts/final-${version}-desktop-ui66-01/ui-reopen-result.json`,4],
  ['photo-thumbnails',`artifacts/final-${version}-photo-thumbnails66-01/ui-result.json`,8],
  ['native-calendar',`artifacts/final-${version}-calendar66-01/ui-result.json`,4],
  ['selection-import-refresh',`artifacts/final-${version}-selection69-ui01/ui-result.json`,8],
  ['selection-fresh-process',`artifacts/final-${version}-selection69-ui01/selection69-reopen-result.json`,2],
  ['native-row-event-order',`artifacts/final-${version}-row-order69-ui01/ui-result.json`,2],
  ['report-ui',`artifacts/report-ui66-packaged-${version}/RESULT.json`,60],
  ['actual-product-patch',`artifacts/product-patch66-${version}/run-${version}/RESULT.json`,12],
  ['files-board',options.get('--files')??`artifacts/final-${version}-local-modules66-03/RESULT.json`,14],
  ['actual-program-entry',`artifacts/final-${version}-actual-entry66/RESULT.json`,1],
  ['launcher-health',options.get('--health')??`artifacts/final-${version}-healthcheck69.json`,1]
].map(([kind,p,expected])=>{
  owned(p,'artifacts');const r=json(p);assert.equal(r.pass,expected,kind);assert.equal(r.fail,0,kind);falseApproval(r);
  if(r.package)assert(samePath(r.package,app),kind+' package mismatch');
  if(r.hostSha256)assert.equal(r.hostSha256,declaredHash('Jindan.Desktop.dll'),kind+' host mismatch');
  if(r.packagedAssemblies)for(const entry of r.packagedAssemblies){
    const relative=path.relative(app,entry.packagedPath).replaceAll('\\','/');
    assert.equal(declaredHash(relative),entry.sha256,kind+' declared library mismatch');
    assert.equal(hash(entry.packagedPath),entry.sha256,kind+' package library changed');
  }
  if(kind==='actual-product-patch'){
    assert(samePath(r.candidate,manifest.patchCandidate.directory),'Wrong patch candidate');
    assert.equal(r.originalProjects,declaredHash('modules/projects/Jindan.Modules.Projects.dll'));
  }
  if(kind==='files-board')assert(!samePath(p,`artifacts/final-${version}-local-modules66/RESULT.json`),'Select the final visible-launcher Files rerun, not the unusable capture attempt.');
  const handoffEntry=sdk.results?.find(entry=>entry.path===p);if(handoffEntry)assert.equal(hash(p),handoffEntry.sha256,kind+' handoff binding');
  return{kind,...ref(p),pass:r.pass,fail:0,startedAt:r.startedAt??r.results?.[0]?.startedAt??null,endedAt:r.endedAt??r.results?.at(-1)?.endedAt??r.observedAt??null};
});
const snapshotPath=options.get('--snapshot')??`artifacts/review69-${version}-snapshot-tests01/RESULT.json`;owned(snapshotPath,'artifacts');
const snapshot=json(snapshotPath);falseApproval(snapshot);assert.equal(snapshot.passed,true);assert(samePath(snapshot.installation,app));
assert(snapshot.results.every(r=>r.exit===0&&!r.overflow));assert.equal(snapshot.tests?.pass,82);assert.equal(snapshot.tests?.fail,0);
const snapshotInnerPath=owned(path.join(snapshot.tests.evidence,'RESULT.json'),'artifacts');
const snapshotInner=json(snapshotInnerPath);assert.equal(snapshotInner.pass,82);assert.equal(snapshotInner.fail,0);falseApproval(snapshotInner);
const snapshotRun=snapshot.results.find(r=>r.name==='snapshot-regressions');assert(samePath(snapshotRun.command[0],path.join(app,'.runtime/dotnet.exe')));
assert(samePath(snapshot.runtimeEnvironment.DOTNET_ROOT,path.join(app,'.runtime')));
assert(samePath(snapshot.runtimeEnvironment.DOTNET_ROOT_X64,path.join(app,'.runtime')));
assert.equal(snapshot.runtimeEnvironment.DOTNET_MULTILEVEL_LOOKUP,'0');assert(samePath(snapshotInner.packagedRoot,app));
assert.equal(snapshotInner.packagedAssemblies.length,3);
assert.deepEqual(snapshotInner.packagedAssemblies.map(e=>e.name).sort(),['Jindan.ModuleHost.dll','update-tool/Jindan.Update.Tool.dll','update-tool/Jindan.Update.dll'].sort());
for(const entry of snapshotInner.packagedAssemblies){
  assert(samePath(entry.packaged,path.join(app,entry.name)));assert.equal(declaredHash(entry.name),entry.sha256);
  owned(entry.loaded,'artifacts');assert.equal(hash(entry.loaded),entry.sha256);assert.equal(hash(entry.packaged),entry.sha256);
}
for(const value of [snapshotInner.fixtureV1Sha256,snapshotInner.fixtureV2Sha256])assert(/^[a-f0-9]{64}$/.test(value));
const verifyPath=options.get('--verification')??`artifacts/final-${version}-completed-verification69-02.json`;owned(verifyPath,'artifacts');
const verify=json(verifyPath);assert.equal(verify.pass,1);assert.equal(verify.fail,0);falseApproval(verify);
assert(samePath(verify.review,review));assert.equal(verify.sourceInputs,178);assert.equal(verify.artifactFiles,manifest.files.length);
assert.equal(verify.artifactManifestSha256,hash(review+'/artifact-manifest.json'));assert.equal(verify.sourceCheckpointSha256,manifest.sourceCheckpointSha256);assert.equal(verify.hostSha256,declaredHash('Jindan.Desktop.dll'));
const preservationPath=options.get('--preservation')??'handoff/PRESERVATION69.json';owned(preservationPath,'handoff');
const preservation=json(preservationPath);assert(preservation.ok&&preservation.legacyFileCount===626&&preservation.headMatches&&preservation.dirtyStatusMatches);
assert(preservation.originalChecks.length===3&&preservation.originalChecks.every(c=>c.ok)&&preservation.frozen63Zip.ok);
const cadPath=options.get('--cad')??`artifacts/final-${version}-cad69.log`;owned(cadPath,'artifacts');const cad=text(cadPath);assert(/# pass 5\b/.test(cad)&&/# fail 0\b/.test(cad));
const legacyBefore='artifacts/review69-legacy-ab01/RESULT.json',uiBefore='artifacts/review69-r4-before-ui01/R4_BEFORE_HANDOFF.json';
const a=json(legacyBefore),b=json(uiBefore);assert.equal(a.cases.find(c=>c.mode==='exact-r4-before')?.expectedDefectConfirmed,true);assert.equal(a.cases.find(c=>c.mode==='exact-r4-before')?.livePreserved,false);assert.equal(a.cases.find(c=>c.mode==='new-source-legacy-rejection')?.livePreserved,true);assert.equal(b.expectedDefectReproduction,true);falseApproval(a);falseApproval(b);
const selfPath='handoff/SELF_REVIEW69.json',self=json(selfPath);falseApproval(self);
assert.equal(self.selectedPackage,review,'Self-review must be updated for the actual selected package before final aggregation.');
assert.equal(self.state,'complete-targeted-local-review-independent-acceptance-pending');assert.equal(self.pendingFinalEvidence.length,0);
const r5FailedPath='artifacts/final-r5-desktop-ui66-01/ui-result.json';
const r5Failed=json(r5FailedPath);assert.equal(r5Failed.pass,20);assert.equal(r5Failed.fail,3);assert.equal(r5Failed.freshProcessExitCode,null);falseApproval(r5Failed);
const rowBeforePath='artifacts/review69-row-r5-ui02/ui-result.json',rowFixedPath='artifacts/review69-row-fixed-ui01/ui-result.json';
const rowBefore=json(rowBeforePath),rowFixed=json(rowFixedPath);
assert.equal(rowBefore.pass,1);assert.equal(rowBefore.fail,1);assert.equal(rowFixed.pass,2);assert.equal(rowFixed.fail,0);falseApproval(rowBefore);falseApproval(rowFixed);
const r5SnapshotBindingPath='artifacts/review69-r5-snapshot-binding01.json',r5Binding=json(r5SnapshotBindingPath);
assert.equal(r5Binding.pass,1);assert.equal(r5Binding.fail,0);falseApproval(r5Binding);
for(const entry of [r5Binding.wrapper,r5Binding.inner,r5Binding.harness,r5Binding.runtime])assert.equal(hash(entry.path),entry.sha256);
for(const entry of r5Binding.entries){assert.equal(hash(entry.local),entry.sha256);assert.equal(hash(entry.packaged),entry.sha256);}
const failedHeadlessPath='artifacts/checks66/2026-11-05T02-19-00-861Z/RESULT.json',failedHeadless=json(failedHeadlessPath);
assert.equal(failedHeadless.complete,false);assert.equal(failedHeadless.passed,false);
const racePath='artifacts/review69-adapter-race-final01/RESULT.json',race=json(racePath);assert.equal(race.pass,1);assert.equal(race.fail,0);falseApproval(race);
for(const entry of [race.fullSourceGate,race.adapterLog,race.preservedBeforeFailure,race.trials])assert.equal(hash(entry.path),entry.sha256);
assert(samePath(race.fullSourceGate.path,head));assert.equal(race.adapterLog.pass,42);assert.equal(race.adapterLog.fail,0);assert.equal(race.trials.count,12);
const raceTrials=json(race.trials.path);falseApproval(raceTrials);assert.equal(raceTrials.trials.length,12);assert(raceTrials.trials.every(t=>t.exited&&t.activeWorkers===0));
assert.equal(race.sources.find(s=>s.path==='src/Jindan.Report.Adapter/ReportService.cs').sha256,source.files.find(s=>s.path==='src/Jindan.Report.Adapter/ReportService.cs').sha256);
const cleanPath='artifacts/packaging66/R6_PREPACK_CLEAN.json',clean=json(cleanPath);assert.equal(clean.exit,0);falseApproval(clean);assert.equal(hash(clean.log),clean.logSha256);assert.equal(fs.statSync(clean.log).size,clean.logBytes);
const deltaPath='artifacts/packaging66/FINAL_R6_VERIFICATION.json',delta=json(deltaPath);assert.equal(delta.ok,true);falseApproval(delta);
assert.equal(delta.artifactManifestSha256,hash(review+'/artifact-manifest.json'));assert.equal(delta.sourceCheckpointSha256,manifest.sourceCheckpointSha256);
assert.equal(delta.currentSourceHashesVerified,178);assert.equal(delta.artifactFilesVerified,manifest.files.length);
assert.equal(delta.modules.length,9);assert(delta.modules.every(m=>m.sameManifestAsR5));assert(delta.nativeAdapterMatchesApplication&&delta.nativeWorkerBindingVerified);
const firstFilesPath=`artifacts/final-${version}-local-modules66/RESULT.json`,firstFiles=json(firstFilesPath);
assert.equal(firstFiles.pass,14);assert.equal(firstFiles.fail,0);falseApproval(firstFiles);
const hiddenFilesPath=`artifacts/final-${version}-local-modules66-02/RESULT.json`,hiddenFiles=json(hiddenFilesPath);
assert.equal(hiddenFiles.pass,12);assert.equal(hiddenFiles.fail,2);falseApproval(hiddenFiles);
assert(hiddenFiles.checks.filter(c=>!c.ok).every(c=>c.error.includes('Owned native capture is uniform')));
const captureHarness=`artifacts/final-${version}-local-build02/Jindan.LocalModules.Tests.dll`;
assert.equal(hash(captureHarness),'bddc26d186759001490e5ba411289dc87ae86911155230181e256687b570abec');
const visualPath='handoff/VISUAL69.json',visual=json(visualPath);falseApproval(visual);
assert.equal(visual.reviewedCurrentImages,10);assert.equal(visual.nativeImagesReviewed,8);assert.equal(visual.controlledRendersReviewed,2);
assert.equal(visual.captureCorrection.productChanged,false);assert.equal(visual.captureCorrection.sameHarnessSha256,hash(captureHarness));
const result={
  schema:'jindan-final-validation69/1',recordedAt:new Date().toISOString(),selectedPackage:review,
  artifactManifestSha256:hash(review+'/artifact-manifest.json'),sourceCheckpointSha256:manifest.sourceCheckpointSha256,hostSha256:declaredHash('Jindan.Desktop.dll'),
  headless:{...ref(head),complete:true,passed:true,commands:headless.results},
  finalPrepackClean:{...ref(cleanPath),log:ref(clean.log),scope:'Owned clean Release solution exit0 followed by checked-in packager full19-project and UpdateTool Release rebuild. Minimal clean log is empty, not fabricated.'},
  sourceAdapter42RaceProof:{...ref(racePath),trials:ref(race.trials.path),assertions:42,actualCpuTrials:12,scope:'Twelve actual concurrent disposal/cleanup trials are one assertion inside source42, not12 additional independent tests or exact packaged Report60.'},
  packageAndPredecessorDeltaAudit:{...ref(deltaPath),scope:'All declared R4/R5/R6 payloads and current178 inputs rehashed. All9 feature packages/candidate unchanged fromR5; new sharedAdapter/native bundle is verified separately.'},
  supersededFilesCaptureAttempt:{...ref(firstFilesPath),unusableCapture:ref(`artifacts/final-${version}-local-modules66/files-list-native-window.png`),pass:14,fail:0,scope:'Functional14 passed. Coordinator review found the first image uniformly black despite PrintWindow success; unusable capture, not product-regression evidence.'},
  hiddenLauncherCaptureFailure:{...ref(hiddenFilesPath),pass:12,fail:2,harness:ref(captureHarness),scope:'Unchanged capture-guard harness rejected uniform frames with Node windowsHide=true. The same exact harness passed14/0 in fresh03 with only owned GUI launcher windowsHide=false. Root reviewed new Files/Board PrintWindow images. This is a test-launcher/capture causal qualification, not production code regression.'},
  visualEvidenceBoundary:'Coordinator VISUAL69 separately distinguishes owned PrintWindow captures from two ReportGuiSmoke DrawToBitmap controlled renders. A successful PrintWindow return alone is not usable-pixel proof. No company visual acceptance is inferred.',
  exactPackagedGates:suites,native51Handoff:ref(sdkHandoff),
  exactSnapshotGate:{...ref(snapshotPath),innerResult:ref(snapshotInnerPath),pass:82,fail:0,commands:snapshot.results,scope:'Actual exact-selected-package ApplyAsync/migration/corrupt snapshot/staging/swap/locked-file/child interruption/recovery tests. Packaged82 overlaps source81 and normal package cases; not82 unique business workflows.'},
  additionalBundledWorkerGate:{...ref(cadPath),pass:5,fail:0,scope:'Overlaps offline260 CAD coverage; not added into a unique total.'},
  finalImmutableAndSourceReverification:ref(verifyPath),preservation:ref(preservationPath),
  preservedRejectedR5:{...ref(r5FailedPath),pass:20,fail:3,freshProcessStarted:false,scope:'Rejected actual R5 CurrentCell/selection event-order regressions; not acceptance. Planned R5 Report60 was not executed.'},
  preservedFailedHeadless:{...ref(failedHeadlessPath),complete:false,passed:false,failedCommands:failedHeadless.results.filter(r=>r.exit!==0),scope:'Preserved R6 prefreeze ReportAdapter disposal/WaitForExit handle-race failure; not acceptance. Final selected-package headless receipt must independently pass.'},
  causalRowOrderEvidence:[{...ref(rowBeforePath),pass:1,fail:1,scope:'Exact old R5 shared/module fixture reproduces clean-row CurrentCell/SelectionChanged regression; not approval.'},{...ref(rowFixedPath),pass:2,fail:0,scope:'Single-common-DLL swap fixture causal positive; not the whole exact final package or independent company approval.'}],
  historicalR5SnapshotBinding:{...ref(r5SnapshotBindingPath),scope:'Post-run copied harness/runtime/receipt hash audit, not independent82 rerun or substitution for selected-package snapshot gate. Original inner JSON predates test-only trace additions.'},
  preRepairEvidence:[{...ref(legacyBefore),kind:'A expected-loss-before and source legacy-unbound rejection',acceptance:false},{...ref(uiBefore),kind:'B exactR4 expected-unbound-selection reproduction',acceptance:false}],
  sourceSelectionRepairGate:{...ref('artifacts/review69-selection-ui04/SELECTION69_HANDOFF.json'),scope:'Earlier source B/C10, separate from exact selected-package native51; no acceptance inherited.'},
  selfReview:ref(selfPath),selfReviewState:self.state,
  coordinatorVisualReview:ref(visualPath),
  countPolicy:'Counts are exact named suite assertions with deliberate overlap, not a grand unique-test count. Child patch UI assertions are not added to parent12. Source81, packaged82, earlier source selection10 and R4 expected-defect probes remain separate. Missing timestamps stay null; none are invented.',
  frozenProductAndLaterTests:'Selected source checkpoint178 covers frozen product/package inputs. Final test-only harness/aggregator/doc changes are captured separately by coordinator SOURCE69, not falsely added to that frozen178 checkpoint.',
  inheritedUnapprovedGates:['native Hancom source fonts/embedded-font retention','source JSON/company metadata and tab-property preservation','every object editability and all numerical/cell semantics','actual current-company measurement/judgment/report workflow','live Firebase/Drive/paid AI and production signing/distribution','physical150/200 DPI or arbitrary monitor arrangements'],
  scope:'Synthetic local native workbench and scoped hybrid engine; no new company HWPX native fidelity or live approval.',reportReady:false,supervisorAccepted:false
};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:rel(out),sha256:hash(out),allRequiredNamedGatesPassed:true,exactGateGroups:suites.length,uniqueGrandTotalAsserted:false,reportReady:false,supervisorAccepted:false}));
