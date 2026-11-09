# Development resumed on the native .NET project — 2026-11-09

The user confirmed that the prior `F:/jindan` edits should remain saved, and
authorized continued development in `F:/jindan-dotnet`. The old development app
was closed by the user. No source rollback or credential/workspace copy occurred.

## Current candidate

- Preserved build: `artifacts/ready-for-review/cloud71-r1`.
- Separate interactive copy: `artifacts/product-patch66-cloud71-session/application`.
- This is the .NET 10 WinForms MDI host with nine module DLLs, not the earlier
  .NET 8 WebView2 wrapper around the Electron/React screen.
- Connection implementation, limitations and official protocol sources:
  [cloud-read71.md](cloud-read71.md).
- Native host/common DLLs and Files/Board 1.0.1 must be used together. No existing
  installed app or immutable earlier candidate is patched by this run.

## Tests actually run

| Suite | Passed / failed |
| --- | --- |
| New native cloud/authentication/cancellation/compatibility/log tests | 28 / 0 |
| Migrated report/JS regressions | 274 / 0 |
| Shared JS/native goldens | 8 / 0 |
| Domain | 22 / 0 |
| Native package engine | 16 / 0 |
| Module/package/rollback | 81 / 0 |
| Existing sync | 24 / 0 |
| Legacy work import | 11 / 0 |
| Report adapter/owned worker lifecycle | 42 / 0 |
| Workspace outbox/scheduler | 41 / 0 |
| Existing offline Drive cache | 20 / 0 |
| Dashboard | 13 / 0 |
| Rich text/local board | 18 / 0 |

Feature tests total 598 passed. These are synthetic/local checks, not live cloud
or company report acceptance. Architecture inspection found nine modules and no
listed dependency issues. Packaging rebuilt successfully with zero warnings/errors.

The full `run-checks70.mjs` gate **did not pass**: its old-code preservation check
found 32 file differences plus a Git-status difference (33 findings) against the
historical66 baseline of `F:/jindan`. These correspond to the earlier retained
source/build changes. The baseline and checker were not changed to hide this.
Original report hashes (three) and frozen63 ZIP hash still match. Subsequent
independent checks were run directly and are reported above, without relabelling
the failed aggregate gate as passed.

Evidence: `artifacts/cloud71-tests.log`, `artifacts/cloud71-package.log`,
`artifacts/checks66/2026-11-09T03-47-09-304Z/RESULT.json`,
`artifacts/preservation66/RESULT.json`, `artifacts/cloud71-architecture.log`,
and the four `artifacts/cloud71-Jindan.*.Tests.log` files.

Diagnostics are emitted into the interactive copy's `diagnostics/` folder.
The application requires an independently established local workspace login;
company Firebase/Google authentication is then performed explicitly in the
connection dialog. No legacy password/token is silently reused. Live verification
remains pending until the user supplies the intended connection settings in the app.

`reportReady=false`, `supervisorAccepted=false`; no deployment, commit or push.

## Interactive launch — 2026-11-09

- Verified clone receipt: 3,216 files verified, all target files matched.
- `tools/start-cloud71.ps1` ran the native module health check successfully and
  launched the isolated .NET runtime (initial PID 33960).
- Observed native window: `진단 작업대 · 로컬 로그인`, with first-run local
  administrator setup. The old Electron/WebView2 app was not launched.
- Startup event verified in
  `artifacts/product-patch66-cloud71-session/application/diagnostics/session-20261109-035839-a40daa4dcdf44524b963a8dd1513869b.jsonl`.
- User completed local account setup directly. `login.success`, `modules.loaded`
  with `items=9`, and nine individual `module.load` successes were recorded.
- Observed the native MDI workbench and opened Files, Board and Report Studio.
  Both server-read dialogs opened successfully. Without cloud authentication,
  Drive refresh displayed `GOOGLE_SIGN_IN_REQUIRED` and board read displayed
  `FIREBASE_SIGN_IN_REQUIRED`; corresponding start/failure events were verified.
- Report Studio opened as an MDI child with project selection pending. Its status
  misleadingly displayed a work-list read failure. Source inspection confirmed
  `LoadAsync` calls profile authorization with a null project, which is rejected
  as `PROJECT_SCOPE`, then caught by the generic load-failure message. This is an
  existing empty-state UX issue, not evidence of damaged report files. It remains
  open for correction; no report was imported, analyzed or modified in this run.
- The native app remains open. Real cloud authentication, company data retrieval,
  upload/edit/delete and end-to-end project/process server sync remain unverified
  or unfinished as detailed in `cloud-read71.md`.
