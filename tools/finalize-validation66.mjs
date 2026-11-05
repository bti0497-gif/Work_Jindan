import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const text=p=>{const b=fs.readFileSync(p);return (b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');};
const json=p=>JSON.parse(text(p));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const head='artifacts/checks66/2026-11-05T00-03-06-633Z/RESULT.json';
const baseline=json(head);
if(!baseline.complete||!baseline.passed||baseline.results.some(r=>r.exit!==0))throw Error('Headless gate failed');
const suites=[
 ['native-main','artifacts/final-r4-desktop-ui66-01/ui-result.json',23,'Exact-reference Desktop.UiTests main; see tests/Jindan.Desktop.UiTests/README.md'],
 ['native-fresh-process','artifacts/final-r4-desktop-ui66-01/ui-reopen-result.json',4,'Exact-reference Desktop.UiTests fresh-process reopen'],
 ['photo-thumbnails','artifacts/final-r4-photo-thumbnails66-01/ui-result.json',8,'Exact-reference Desktop.UiTests photo phase'],
 ['native-calendar','artifacts/final-r4-calendar66-01/ui-result.json',4,'Exact-reference Desktop.UiTests calendar phase'],
 ['report-ui','artifacts/report-ui66-packaged-r4/RESULT.json',60,'Exact-reference Report.GuiSmoke with bundled worker; see migration/report-parity66.json'],
 ['actual-product-patch','artifacts/product-patch66-r4/run-r4/RESULT.json',12,'tools/dotnet.ps1 run --project tests/Jindan.Patch.ProductTests/Jindan.Patch.ProductTests.csproj -c Release --no-build -- artifacts/product-patch66-r4/application artifacts/patches66/projects-v2-final66-r4 artifacts/product-patch66-r4/run-r4'],
 ['files-board','artifacts/final-r4-local-modules66/RESULT.json',14,'tools/dotnet.ps1 run --project tests/Jindan.LocalModules.Tests/Jindan.LocalModules.Tests.csproj -c Release --no-build -- artifacts/final-r4-local-modules66 artifacts/ready-for-review/final66-r4/application'],
 ['actual-program-entry','artifacts/final-r4-actual-entry66/RESULT.json',1,'tools/dotnet.ps1 run --project tests/Jindan.Launch.Tests/Jindan.Launch.Tests.csproj -c Release --no-build -- artifacts/product-patch66-r4/application artifacts/final-r4-actual-entry66'],
 ['launcher-health','artifacts/final-r4-healthcheck66.json',1,'artifacts/ready-for-review/final66-r4/Run.ps1 -HealthCheck'],
 ['immutable-after-all-gates','artifacts/final-r4-completed-verification66.json',1,'node tools/verify-review66.mjs artifacts/ready-for-review/final66-r4 artifacts/final-r4-completed-verification66.json']
].map(([kind,p,expected,command])=>{const r=json(p);if(r.pass!==expected||r.fail!==0)throw Error('Gate mismatch: '+kind);return {kind,path:p,sha256:hash(p),command,pass:r.pass,fail:0,skipped:0,startedAt:r.startedAt??r.results?.[0]?.startedAt??null,endedAt:r.endedAt??r.results?.at(-1)?.endedAt??r.observedAt??null};});
if(!/# pass 5/.test(text('artifacts/final-r4-cad66.log'))||!/# fail 0/.test(text('artifacts/final-r4-cad66.log')))throw Error('Bundled CAD5 failed');
const proof=json('artifacts/final-r4-completed-verification66.json'),pres=json('handoff/PRESERVATION66.json');
if(!pres.ok||pres.legacyFileCount!==626||!pres.headMatches||!pres.dirtyStatusMatches||pres.originalChecks.some(c=>!c.ok)||!pres.frozen63Zip.ok)throw Error('Preservation failed');
const result={schema:'jindan-final-validation66/1',recordedAt:new Date().toISOString(),selectedPackage:'artifacts/ready-for-review/final66-r4',artifactManifestSha256:proof.artifactManifestSha256,sourceCheckpointSha256:proof.sourceCheckpointSha256,hostSha256:proof.hostSha256,headless:{path:head,sha256:hash(head),complete:true,passed:true,commands:baseline.results},exactPackagedGates:suites,additionalBundledWorkerGate:{pass:5,fail:0,skipped:0,command:'application/modules/report-studio/worker/node.exe --require ./tools/offline-tests.cjs --test tests/NodeCad/node-cad.test.cjs with JINDAN_TEST_PACKAGED_WORKER set to exact R4 worker directory',log:'artifacts/final-r4-cad66.log',sha256:hash('artifacts/final-r4-cad66.log'),scope:'Overlaps offlineNode CAD coverage; do not sum as an independent unique regression count.'},preservation:{path:'handoff/PRESERVATION66.json',sha256:hash('handoff/PRESERVATION66.json'),baselineFiles:626,originals:3,frozen63ZipUnchanged:true,headAndDirtyUnchanged:true},visual:'handoff/VISUAL66.json',selfReview:'handoff/SELF_REVIEW66.json',countPolicy:'Counts are exact named suite assertions, not a grand unique-test or company-workflow count. Child patch UI PASS lines are not added to parent12. Earlier expected defects and failed prototypes remain separate retained history. Null timestamps mean the receipt did not record actual start/end; no timestamps are invented.',physicalDpi:[96,120],physical150And200DpiVerified:false,controlledScales:[1.5,2],scope:'New local native workbench and scoped hybrid engine with isolated synthetic data. Exact new company HWPX native fidelity, live services and current-company workflow remain independent gates.',reportReady:false,supervisorAccepted:false};
fs.writeFileSync('handoff/VALIDATION66.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({headlessCommands:baseline.results.length,exactGateGroups:suites.length,allPassed:true}));
