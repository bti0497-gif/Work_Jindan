# ROADMAP66 local review application

The review build is a Windows x64 .NET10 WinForms MDI workbench. It uses explicit feature DLL packages and the repaired local JS report worker. It is not a pure-C# layout engine or approval of company reports. `reportReady=false` and `supervisorAccepted=false` remain fixed.

## REVIEW69 correction and target

R4 is preserved and **requires correction/review**, rather than accepted production: independent `handoff/SUPERVISOR_R4_REVIEW69.md` reproduced incomplete schema-snapshot rollback data loss, a visually selected first row with empty actual selection/preview, and navigation/context usability defects. Its exact independent findings and earlier successful scopes remain intact.

R5 introduced complete journal-bound snapshot inventories, staged restore verification, preserved current/displaced trees, strict generation/schema/restore-plan consistency and interruption recovery. Selection/import/refresh/reopen explicitly synchronize the visible row with actual values/preview; dirty-state/context/cancellation guards remain. Shell project access/automatic refresh and readable report captions are included in the correction scope. The source selection69 ten-case evidence and extended snapshot cases remain separate from the exact package tests. Root owns the final runtime/source evidence; no R4 acceptance is transferred to a new SHA.

R5 was prepared as the separate immutable `artifacts/ready-for-review/final66-r5` and passed its scoped exact snapshot82. Its actual native main run then failed **20 passed /3 failed**, with no fresh-process reopen: dirty project/save, Board save and selected-photo preview exposed a CurrentCell/SelectionChanged event-order regression. R5 Report60 was not run. These failed receipts are preserved; earlier source selection10 did not establish whole-package success.

The R6 row-binding correction subscribes/unsubscribes the existing synchronization handler to `CurrentCellChanged` as well as `SelectionChanged` in `RecordDocument`. The causal exact-R5 fixture failed1/1; replacing only its common DLL passed2/0. This limited before/after probe is not final R6 approval.

The later prefreeze headless run `artifacts/checks66/2026-11-05T02-19-00-861Z/RESULT.json` failed during the real ReportAdapter disposal/CPU-drain test with a closed-process-handle race. R6 also serializes owned-process exit/cleanup and request-finally disposal on the same exact `Process` lock, uses cached PID plus object identity, and lets repeated service disposal retry retained entries without permitting new workers. Failed kill/exit confirmation retains ownership rather than claiming zero active workers. The new focused adapter case exercises12 actual concurrent CPU cleanup trials as one assertion; it is not12 independent business workflows. The failed run is preserved. Root owns the final adapter42/new full-headless evidence and exact new-package tests; no successful result is inferred from this correction description.

**Target `final66-r6` may be prepared only after the new full headless/freeze gate.** Until a new immutable manifest and exact package reruns are recorded, R6 preparation/UI/patch approval is pending. The original R4 artifact, supervisor clone/evidence, protected old workspace and original documents remain read-only. `reportReady=false` and `supervisorAccepted=false`.

## Build and prepare

From F:/jindan-dotnet after product source is stable:

```powershell
node tools/prepare-review66.mjs --destination F:/jindan-dotnet/artifacts/ready-for-review/final66-r6
```

The new target output is `artifacts/ready-for-review/final66-r6/`; its delivery status is recorded in its new preparation receipt. The initial parent `ready-for-review/` attempt is retained as an incomplete diagnostic artifact: its packager assumed the previous Adapter output TFM/path, while the product correctly builds Adapter for net10.0-windows. This packaging-path error is not a product report failure. Use only the complete child final66-r6 manifests/launcher. On an entirely clean new workspace, `node tools/prepare-review66.mjs` without arguments still prepares a fresh default root. The command refuses an existing destination. A later intentional build can use a fresh child directory with `--destination F:/jindan-dotnet/artifacts/ready-for-review/NEW_NAME`; no existing artifact is replaced. The interim `artifacts/integration-review66/` is an earlier immutable M6 baseline with explicitly recorded source changes during preparation, not the final latest build. Its initial source-stability gate failed honestly; `INTERMEDIATE_ARTIFACT_MANIFEST.json` records all actual bytes and the differences.

Earlier complete packages remain immutable. `final66/` was superseded after an actual monitor DPI transition exposed owner/floating-window work-area overflow; production bounds handling was corrected in R2. Exact R2 controls/reopen/report/thumbnail semantics passed, but real visual review then found captions/headers hidden beneath docking surfaces. R3 contains minimal view-only docking changes in Photos, Board, Files and Tasks. Source-level Photos8 and Files/Board13 checks passed; exact R3 packaged UI/monitor/patch checks are separate and must target these new bytes. Earlier semantic passes do not erase the recorded visual defects. R3 semantic35 checks were preserved, but its native Tasks calendar clipped the Saturday column and could expand into multiple months. R4 added the measured single-month calendar correction and readable scope labels in common document controls (exact internal context remains in control metadata). REVIEW69 subsequently rejected its snapshot/selection behavior as described above. R5 retained those improvements but the later whole-package row-binding regression required R6; new exact-source/package checks remain mandatory.

The script builds Release through `tools/dotnet.ps1`, preserving process-only certificate/telemetry settings, and creates nine explicit module packages. Projects/Processes/Dashboard and the Projects v2 candidate explicitly carry their common Core.dll dependency; no loader allowlist relaxation is used. It verifies the existing official SDK ZIP SHA512, compares each selected runtime file against its ZIP entry, and bundles only dotnet host/fxr10.0.14, NETCore10.0.14, WindowsDesktop10.0.14 and notices. No SDK, build tools or ASP.NET runtime is copied. Installed Node's discovered executable and license, new worker source, engine source, applicable non-dev lockfile dependency packages and their upstream license files are included in the ReportStudio package. No old workspace, raw company documents, secrets or global SDK tree is copied.

`source-checkpoint.json` hashes actual product source/build configuration/package inputs; unrelated docs/tests/logs are excluded from the source-stability gate. The script checks those inputs again at the end. Concurrent changes fail preparation rather than claiming a frozen result. `artifact-manifest.json` hashes the prepared immutable payload; `PREPARATION_RESULT.json` identifies its SHA and source checkpoint SHA. Application data/workspace, workspace-location metadata, update journals/locks and logs are mutable and are excluded from baseline integrity comparisons.

## Run without global installation

Use a fresh disposable application clone for interactive review so the delivered baseline remains immutable. From `F:/jindan-dotnet`:

```powershell
node tools/prepare-product-clone66.mjs artifacts/ready-for-review/final66-r6 artifacts/product-patch66-interactive/application artifacts/product-patch66-interactive/COPY_RESULT.json
$app = 'F:/jindan-dotnet/artifacts/product-patch66-interactive/application'
$env:DOTNET_ROOT = "$app/.runtime"
$env:DOTNET_MULTILEVEL_LOOKUP = '0'
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app
```

These variables affect only the current/child process. Nothing installs or changes machine PATH, security settings, fonts or Hancom settings. The frozen package's `Run.ps1` targets its own application directory; use the direct clone command above for interactive operation. An isolated explicit workspace can also be selected for the clone:

```powershell
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app --workspace F:/jindan-dotnet/artifacts/review-workspace
```

Do not alter execution policy. The default new local workspace is the clone's `application/data`. The host atomically registers the selected location in the clone's `workspace-location.json`; custom locations are supported for normal/same-schema operation, while schema-changing updates to a custom location fail with CUSTOM_WORKSPACE_MIGRATION_REQUIRED until a separately reviewed migration exists.

The first local login/account bootstrap is explicit; no old cloud account, credentials or production data are copied. Existing local data must not be silently migrated. The new app and worker own their process IDs; other applications and hidden Hwp11908 remain untouched.

Read-only package/type health check:

```powershell
& F:/jindan-dotnet/artifacts/ready-for-review/final66-r6/Run.ps1 -HealthCheck
$LASTEXITCODE
```

Zero means inventory, integrity, compatibility and entry-type activation succeeded. It does not prove every business command, layout, report fidelity or human approval.

## One-feature local patch and rollback

Keep `artifacts/ready-for-review/final66-r6/application` immutable. This runbook retains the safe-clone override of earlier examples inside the immutable **R4** `RUN-REVIEW.md`, which targeted its baseline application directly. The new R6 copy uses a clone throughout. Create a **fresh disposable clone** with the checked-in helper; do not use a clone already owned by a test or containing user work. The helper verifies every declared application file and refuses unexpected files or executed workspaces. Choose new target/receipt names for each independent review:

```powershell
node tools/prepare-product-clone66.mjs artifacts/ready-for-review/final66-r6 artifacts/product-patch66-operator-review/application artifacts/product-patch66-operator-review/COPY_RESULT.json
```

Close the owned clone app first. A running app's lease blocks update. No normal application is killed by this tool. The locally built Projects v2 candidate is a separate immutable package in `artifacts/patches66/projects-v2-final66-r6`. Its code enables an additional active-project filter and declares module version1.1.0. Baseline remains1.0.0. The explicitly instructed local trust file enrolls both exact build manifests; this is integrity allowlisting, not publisher signing. Apply and launch only the clone:

```powershell
$review = 'F:/jindan-dotnet/artifacts/ready-for-review/final66-r6'
$app = 'F:/jindan-dotnet/artifacts/product-patch66-operator-review/application'
$env:DOTNET_ROOT = "$app/.runtime"
$env:DOTNET_MULTILEVEL_LOOKUP = '0'
& "$review/Update.ps1" apply --root $app --module-id projects --candidate F:/jindan-dotnet/artifacts/patches66/projects-v2-final66-r6 --expected 1.0.0 --patch-id projects-v2-review --trust "$app/trusted-manifests.json" --health-exe "$app/Jindan.Desktop.exe" --health-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Patch did not complete; inspect its receipt before continuing.' }
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app
```

After checking the visible new filter, close that owned app, then:

```powershell
& "$review/Update.ps1" rollback --root $app --trust "$app/trusted-manifests.json"
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --healthcheck --installation-root $app
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app
```

Rollback returns the previous whole package. A committed patchId cannot be reapplied. Host and unrelated module SHA values and user data should be checked against the recorded before/after evidence; a new patch record requires a distinct identity and a deliberately selected expected version. An incomplete transaction blocks normal app startup. After confirming any updater-owned health process has exited, use:

```powershell
& "$review/Update.ps1" recover --root $app --trust "$app/trusted-manifests.json"
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --healthcheck --installation-root $app
```

Health timeout stops only the newly created health process and awaits cleanup before rollback. Unknown/noncooperative cleanup leaves an explicit pending journal and requires recovery; it is not called successfully stopped. Schema changes require a tested migration/snapshot policy and are rejected by this basic CLI when none is supplied. Later changed data blocks automatic schema downgrade. See `docs/module-package66-spec.md` for full contract and negative tests.

## Review boundaries

The review root also contains `reusable-engine/native/`: actual Release `Jindan.Engine.Package.dll`, `Jindan.Contracts.dll` and `Jindan.Report.Adapter.dll`, reuse/protocol/adapter documentation, and the migration source map. Its `MANIFEST.json` hashes those files and references the exact single worker package under `application/modules/report-studio` by manifest and Node SHA. The DLLs provide native structural guards/contracts/transport; they are not a standalone complete PDF/HWPX renderer. The pure native package/Contracts target net10.0; the delivered Adapter targets net10.0-windows. Hybrid operations require Windows/.NET10, that declared worker/resource closure and Node. No second PDF application's source is changed by this handoff.

The packager does not run the application UI, apply the product patch, operate Hancom, change settings or approve reports. Root owns actual MDI/module/context/keyboard/DPI/restart/patch UI tests and their exact evidence. This packaging step preserves a runnable local artifact so independent review can target exact file hashes.

Earlier R4 named evidence (native39, Report60, disposable-clone product patch12, Files/Board14, Program login-entry1, launcher health1 and CAD5) remains recorded in `migration/parity66.json`; those successes did not cover the later REVIEW69 snapshot/selection defects. `artifacts/final-r4-after-ui-verification66.json` rechecked3226 declared immutable files and176 product inputs for that earlier artifact. R5 snapshot82 is recorded separately from its rejected native20/3/no-fresh result; it never reached Report60. R6 needs its own new manifest/source checkpoint, snapshot gate and exact native51 (39 baseline +10 selection +2 row order), Report60, patch and local-module/entry reruns. These counts overlap; pending checks are not promoted to successful receipts. Company report readiness and supervisor acceptance remain false.

Confirmed picture preservation in the earlier exact final28 Hancom tests depended on disabling save-time automatic picture reduction; the original setting was restored by the supervisor. That result does not resolve source JSON loss, original embedded fonts, tab-property changes, every object editability, all values/cell semantics or real current-company workflow. The new application does not change those settings, invent current values or mark unreviewed/stale material approved. Real current evidence, human review, native report fidelity and external service integration remain separate gates. Production cloud writes, paid APIs, uploads, deployment, commit and push are not part of this runbook.







