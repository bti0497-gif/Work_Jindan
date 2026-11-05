# Legacy work JSON migration (ROADMAP66 M3)

This is an explicit, local administrator operation. The preserved `F:/jindan` workspace is never rewritten. A selected JSON file is read, reviewed, converted into a separate canonical ZIP under the new workspace's `previews/<GUID>/`, and imported only after confirmation. There is no automatic localStorage, Firebase, Drive, user, or password migration.

## Supported source shapes

The exact table names come from the read-only legacy `src/services/dbService.js`, `workModel.js`, and `syncService.js`.

An exported localStorage object may use the exact keys below. Values may be arrays or JSON strings containing arrays. Korean table names without the `jindan_db_` prefix are also supported. Two aliases for one table are rejected.

```json
{
  "jindan_db_프로젝트관리": [{"id":"p1","title":"Synthetic project","content":"Original text","startDate":"2026-11-01","endDate":"2026-11-30","deleted":false}],
  "jindan_db_공정관리": [{"id":"c1","projectId":"p1","title":"Synthetic process","startDate":"2026-11-01","endDate":"2026-11-05","isCompleted":false}],
  "jindan_db_할일관리": [{"id":"t1","content":"Synthetic task","date":"2026-11-05","isPublic":false}]
}
```

An explicitly prepared envelope is also accepted:

```json
{"format":"jindan-legacy-work/1","tables":{"projects":[],"processes":[],"tasks":[]}}
```

English `projects`/`processes`/`tasks` keys are recognized only inside that versioned envelope. An unrelated object or an arbitrary array is rejected. Native `jindan-workspace-export/1` ZIP import remains a separate existing action.

## Mapping and validation

| Legacy data | New record behavior |
|---|---|
| Project title, content, startDate, endDate | Preserved as work fields; real ISO dates and ordered ranges required |
| Process title, optional content, date range | Preserved; referenced project must be present in the same import |
| Process isCompleted | Boolean converted to the registered boolean field text |
| Task content and date | Full content preserved; date becomes matching start/end dates; a first-line display title is derived |
| Task isPublic | Boolean converted to the registered boolean field text |
| deleted | Preserved; historical deleted entries are not revived |
| IDs/project links | Checked during preview, then remapped together into new IDs on confirmed import |
| Ownership | Assigned to the authenticated new local administrator, never an imported account |

Original business strings are not truncated. Only a task's derived display title is limited to 300 UTF-8 bytes without splitting Unicode code points; its full content remains unchanged. Legacy project/process titles are limited to 300 UTF-8 bytes, project/process content to 600,000 UTF-8 bytes, and task content to 20,000 UTF-8 bytes. Registered native schemas are also enforced; the corresponding feature modules must have registered them first.

Input is bounded to 32 MiB, depth 48, and 10,000 records. The canonical manifest is limited to 16 MiB. IDs must be nonblank, unique across selected tables, and free of path/control characters. Invalid dates, missing projects, duplicate JSON properties, ambiguous table aliases, malformed booleans, and undocumented business fields reject the preview. Unknown business fields are not silently discarded; an additional mapping must be implemented and reviewed first.

Identity/security metadata such as users, password hashes, roles, permissions, tokens, author/owner identities, and old sync timestamps are omitted. Unknown non-work top-level sections are counted in a warning without copying their contents. No assets are guessed from strings or fetched from external locations. This operation does not migrate report documents, report-engine contexts, photographs, board attachments, live cloud authorization, or company measurement data.

## Preview, confirmation, and rollback

`IWorkspaceData.PreviewLegacyImportAsync(actor, absoluteJsonPath, ct)` returns the existing `ImportPreview` with additional `OriginalSourcePath` and `OriginalSourceSha256` init properties. The original five-argument constructor is retained. Implementations that do not support legacy import fail explicitly through the interface default method.

The preview binds both the original JSON bytes and the generated canonical ZIP bytes by SHA-256. UTF-8 BOMs are accepted for parsing while the hash still covers the exact original bytes. Paths must be local absolute existing files without reparse-point ancestry. The preview does not change workspace records. The administrator should review the exact source SHA, record count, deleted-record warnings, and security omissions before confirming the existing `ImportAsync` operation.

The source binding is checked after confirmation and immediately before the final commit. A changed/missing original or changed canonical ZIP requires a new preview (`STALE_PREVIEW`). Confirmation creates new record IDs and rewrites project links consistently; existing records are preserved. `RollbackLastImportAsync(actor, true)` restores the pre-import state only while its workspace revision still matches. Subsequent business edits block automatic rollback so newer work cannot be overwritten.

The generated preview directory is retained for inspection; it is not a second original database or a live synchronization queue. Canceling the dialog performs no import. Original files and the legacy workspace remain untouched.

## Reproduction and evidence

From `F:/jindan-dotnet`, use the local SDK with process-only environment settings:

```powershell
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_CLI_HOME='F:/jindan-dotnet/.tools/cli-home'
& .tools/dotnet/dotnet.exe run --project tests/Jindan.LegacyImport.Tests/Jindan.LegacyImport.Tests.csproj --artifacts-path artifacts/legacy-import-build -p:UseSharedCompilation=false -v quiet
```

The current synthetic-only run passed 11/11 with exit code 0: `artifacts/legacy-import-tests/20261104T222914-12b82ed42d634e7fb8732fd4f843caf4/RESULT.json`. It tests credential omission and original/state immutability; actual confirmed new-copy remapping and rollback; both source shapes; stale original and canonical ZIP rejection; IDs, project links, dates, long text, unmapped fields, duplicate JSON; and viewer/forged-admin refusal. `LEGACY66_HANDOFF.json` records exact source/evidence hashes.

These tests establish the local importer boundary using synthetic inputs. Actual File Menu interaction is a separate root-owned integration check. No existing company database was imported or approved, and no company-wide migration, live cloud access, or report readiness is asserted. `reportReady=false` and `supervisorAccepted=false` remain in force.
