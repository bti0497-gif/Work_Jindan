# One-feature patch66 integration runbook

The implemented package/update contract is in module-package66-spec.md; the review launcher/CLI commands are in run-review66.md. Both describe trusted local hashes accurately, not production signing. This document separates fixture results from the root-owned actual product test.

## Existing fixture evidence

The current ModuleHost/Update/Update.Tool suite passed37/fail0/exit0:
`artifacts/package-tests/20261104T221929-746914f06dbf4db0b8197df743cce685/RESULT.json`.
`artifacts/package-tests/WORKSPACE66_HANDOFF.json` pins the tested source and result hashes. It includes real v1/v2 DLL behavior, fresh processes, host/other-module/data hashes, health failure/timeout cleanup, explicit rollback, two actual owned-process interruption stages, locks, replay, schema snapshots and downgrade refusal after user data changes. These are isolated fixtures, not the actual Projects UI product gate.

## Actual product baseline and candidate

Intermediate A is `artifacts/integration-review66/application`, built Release before ten recorded concurrent source edits. It is immutable; `INTERMEDIATE_ARTIFACT_MANIFEST.json` pins3209 files/431269170 bytes and explicitly records sourceStable=false. The initial preparation source-stability gate failed honestly; this earlier baseline is suitable for root-owned exact-build patch testing, not the latest product release or full-source approval.

The candidate is `artifacts/patches66/projects-v2-integration-review66`, version1.1.0, compiled with PATCH_V2 after baseline bytes were copied. It adds an actual active-project filtering control and retains the report guards. The candidate is enrolled in the explicit local baseline allowlist by this roadmap's operator instruction. The packager does not apply it.

To preserve A, root requested a byte-verified independent clone at `artifacts/product-patch66/application`. Its BASELINE_MANIFEST/COPY_RESULT record exact copied bytes and source-manifest hash. Root owns mutations in that clone, actual app/health UI, user data, update journals and product patch assertions. Never apply a patch directly to immutable A or edit the candidate after its hash is recorded.

## Required actual product sequence

1. Run the exact baseline host and explicit inventory from the clone. Open the actual Projects module, establish baseline1.0.0 behavior, and save new isolated synthetic user data.
2. Close only that owned app normally. Hold/reject the application lease test explicitly; the updater never kills the normal app.
3. Record host/common DLL and all non-Projects module hashes, data hashes and baseline Projects manifest/DLL hash. Candidate/hash/expected old version must match the explicit trust policy.
4. Apply Projects1.1.0 through UpdateCoordinator or the packaged Update.ps1 CLI, health-check using the packaged runtime and exact host, then restart and verify the visible active-project filter works. Do not infer behavior merely from a copied DLL filename.
5. Verify host and unrelated package bytes are unchanged and saved data remains available. Close the owned app, explicitly roll back and restart/health-check that Projects1.0.0 behavior returns with preserved data.
6. Exercise selected bad hash/compatibility/lock/replay/health/interruption cases without corrupting the preserved baseline or weakening report guards. Keep data-schema tests separate from same-schema UI feature patches.

Root's actual intermediate ProductPatchTests result is artifacts/product-patch66/run01/RESULT.json:12 passed,0 failed. It records the exact baseline host and visible Projects v1/v2/rollback processes, owned health checks and unchanged unrelated payload/data. This success applies to immutable intermediate A and its clone; it is not transferred to current-source final review bytes. A current-source final review package is prepared after the announced freeze/headless gate, followed by its own exact-package checks.

## Recovery and limits

A partial journal blocks normal startup; first confirm any update-owned health process has exited, then recover under the exclusive lease and run health again. Do not delete arbitrary journals/backup directories or overwrite a loaded DLL to make the app start. Schema migration rollback needs the verified snapshot and blocks if later user edits differ. Production signing, cloud deployment, external upload, paid APIs and real company data migration are not part of these commands.

F: is exFAT; logical rename/journal tests ran there, while one explicitly authorized isolated NTFS temp fixture exercised actual reparse-point rejection. No permission/security setting was changed to create that test. The disclosed first SDK development-certificate message remains a separate environment observation; later launch/build tools suppress generation via process environment only.

reportReady=false and supervisorAccepted=false remain in every package/test handoff. Native Hancom fonts/JSON/tabs, all-object editability and company current-data acceptance are not implied by a successful local module patch.

Managed-data correction: the new host defaults to root/data and registers its actual selected location through WorkspaceLocation.Register after local-store creation. Schema updates reject a custom location, malformed descriptor or missing registered data rather than snapshotting an unrelated empty folder. Same-schema custom-workspace patches retain their selected data without relocation. These four new regression cases are included in the37-test result; the historical33-test handoff remains unchanged.


