# Jindan modular workbench — ROADMAP66

Windows x64 .NET 10 WinForms MDI workbench with nine explicitly loaded feature
packages. Native business modules use shared contracts and the local repository;
report layout and CAD currently use isolated, bounded Node workers. This is not
a pure C# PDF/HWPX renderer or approval for company report production.

The original `F:/jindan` is a read-only baseline. Work here, never in its backup.
No old credentials, session or user workspace is included. No cloud service or
paid AI provider is enabled. `reportReady=false`, `supervisorAccepted=false`.

## Development priorities

- [보고서 분석과 현장 조사 준비 개발 로드맵 초안](docs/future-report-workflow-roadmap-20261106.md)
  records the proposed registrant/discipline workflow for further review.
  The immediate priority is Drive file management and the Firebase board.
  AI API/login integration is deferred until the roadmap is agreed and needed.
  This planning document does not change frozen handoff evidence or enable cloud services.

## Review and build

- Current EXECUTE70 candidate, scoped implementation and exact self-tests:
  [handoff/FINAL70.md](handoff/FINAL70.md), [docs/run-review70.md](docs/run-review70.md).
  [handoff/REMAINING70.json](handoff/REMAINING70.json) separates missing real
  providers, native preservation and company acceptance from local test results.
  Complete source70 and a verified source ZIP are identified in that handoff.
- Historical REVIEW69 revision and exact evidence: [handoff/FINAL69.md](handoff/FINAL69.md).
  R4 and rejected R5 are preserved history; R6 received scoped synthetic
  independent review. Its result is not transferred to a new candidate, and
  company/native-report acceptance remains pending.
  Historical ROADMAP66 handoff: [handoff/FINAL66.md](handoff/FINAL66.md).
- Progress and machine-readable gates: [handoff/STATUS66.json](handoff/STATUS66.json).
- Run and local update instructions: [docs/run-review66.md](docs/run-review66.md).
- Feature coverage and deliberate native interaction changes:
  [docs/feature-parity66.md](docs/feature-parity66.md).
- Architecture and dependency rules: [docs/architecture66.md](docs/architecture66.md),
  [docs/adr66.md](docs/adr66.md).
- Contracts and report worker: [docs/report-adapter66.md](docs/report-adapter66.md),
  [docs/worker-protocol66.md](docs/worker-protocol66.md).
- New-copy migration and backup scopes: [docs/migration66.md](docs/migration66.md).
- Per-feature patch and rollback: [docs/module-patch66.md](docs/module-patch66.md).

From this folder, with the already verified project-local SDK:

```powershell
& ./tools/dotnet.ps1 build Jindan.sln -c Release
node tools/run-checks66.mjs
```

The headless command records actual command/time/count/exit/log receipts. Native
GUI and exact product patch checks have separate evidence; headless success must
not be represented as their success. SDK/runtime provenance, initial automatic
development-certificate message and process-only safeguards are documented in
[docs/sdk66.md](docs/sdk66.md) and
[docs/sdk-first-run-observation66.md](docs/sdk-first-run-observation66.md).

Dependencies are pinned in `package-lock.json`; .NET projects use local BCL/ref
packs and a NuGet configuration with no remote source. Do not copy the original
node_modules or regenerate frozen test goldens to hide a mismatch. Keep worker
implementation changes in `src/Jindan.Report.Worker/engine`; provenance and new
source hashes are recorded under `migration/` and `handoff/`.

## Independent acceptance still required

The supervisor owns native Hancom review. Exact generated file SHA, original font
selection/retention, source metadata loss, tab changes, object editability,
picture-save settings and real current measurements/engineering decisions remain
separate gates. Never treat retained historical measurements as current data or
programmatic review acknowledgement as human approval. No commit, push, upload,
deployment, font installation or security/paid-provider setting change is part
of this work.
