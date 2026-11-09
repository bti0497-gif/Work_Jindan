# Project chooser and .tzprj connections — 2026-11-09

## Accepted scope

The user clarified that .tzprj is a small connection/settings file, not an
offline backup or an export of work data. Personal tasks are explicitly excluded.
Opening an unknown project file registers a new project on the currently authenticated
company server, preserving original Firebase query scope, Drive and report references.
Refinement78 below reopens existing accessible projects without another registration.
No source project, process data, personal task, Drive file, or report bytes are
copied, overwritten, uploaded, or granted new sharing permissions.

## UI

Project picker remains 760 DIP wide with 34 DIP detail rows. Muted blue-grey
header, column headers and separate editor/list surfaces reduce the bright
white area. No row spacing or new tabs are added.

The same Projects DLL is used at startup and from the Project menu. Initial
Cancel/X/Escape confirms app exit. During project switching these actions
return to the existing project without an app-exit prompt. The host only
replaces the current project after a successful selection.

The dialog now contains `파일 열기…` (.tzprj) and `프로젝트 저장…` alongside the
existing server-list `열기`. File open validates first and shows a review modal
before registering a new server project. An uncertain registration response
retains the request ID for retry. Save uses a temporary file and atomic rename,
so cancellation does not replace an existing project file.

## Format v1

`.tzprj` is a ZIP containing exactly one UTF-8 `project.json`:

- `format: deojon.project`, `version: 1`.
- `project`: name, original ID, dates, description, created-at and created-by.
- `server`: Firebase project ID, supported project/process collection names,
  and business-project ID used to scope process queries.
- `drive`: Google Drive root folder ID and optional file ID/name references.
- `reports`: Drive report folder ID and report file ID/name/kind references.
- `settings`: bounded string settings, with credential-bearing keys rejected.

No task/process record arrays, document bytes, password, access token, cookie,
OAuth secret or server-account authority is serialized. File settings never
replace the host's login destination or grant access to another server/Drive.
The application uses current-user authorization when such links are consumed.
Workspace modules that follow these connections remain outside this startup UI
step; saving a link does not verify access to its target.

The JSON payload is limited to 256 KiB. The current synthetic example is 551 bytes
in `artifacts/wpf76-tests/fixture.tzprj`. Version, required fields, collection
names, ID shape, duplicate JSON properties, duplicate links and archive entry
names are validated; the archive is never extracted onto disk. Unknown future
schemas fail explicitly rather than silently dropping their fields.

## Server storage and deployed rules

Source: `src/Jindan.Infrastructure/ProjectFiles77.cs`, adapter in
`src/Wpf/Jindan.Startup.Server/FirebaseStartupServer.cs`.

File open performs one Firestore commit with two create-only writes:
`jindan_projects/{newId}` and `jindan_project_files/{newId}`. The second contains
only the connection manifest, current owner and source fingerprint. A retry
looks up the same fingerprint/owner before writing; conflicting requests fail.
The existing project's content/description is never repurposed for metadata.

Export reads the selected project and its connection manifest only. For a
project without a manifest, the file records the known Firebase query scope;
Drive/report links remain empty until those are configured. It must not invent
folder IDs from the old app's global configuration. The server's own created-at
and author populate project attribution. Imports preserve the original source
query scope even though the new registration has a different project ID.

`server/project-files77/add-project-files.rules` is the additive rule block
deployed to `work-jindan` on 2026-11-09 at 16:36 KST. It allows active members to get
the connection document, restricts creation to the authenticated owner of the
new parent project, and limits updates to metadata by that owner or an admin.
Existing project/process/task/member/Drive policies are not changed.

The user explicitly approved this deployment after reviewing the repository's
deployment restriction. The live rules were backed up and the block was inserted
before the existing deny-all match; removal of that block reproduced the original
source hash exactly. Existing gcloud authentication was used in memory; no token
was copied or printed. No company documents were created, changed or deleted.

The Rules API compiled the merged source without issues. All 32 synthetic
permission checks passed, including valid registration, missing-manifest reads,
inactive/anonymous access denial, owner and parent-project checks, bounded schema,
immutable attribution, restricted updates, denied listing/deletion, and existing
project/private-task access. Service lookups were mocked, not read from company
data. The active release and full source hash were verified after deployment.

- Previous ruleset: `36f57b70-fe22-461c-8bb1-2324cff8e7ad`.
- Active ruleset: `e68310f3-d94e-46fb-832a-07f0dcd14683`.
- Canonical source SHA-256: `55ffb4b36adf3a6a22d167b10dd72c91ba28118b5e7089366059728ad95c537e`.
- Backup: `artifacts/project-files77-rules/backup-2026-11-09T07-32-11-794Z.json`.
- Receipt: `artifacts/project-files77-rules/deployment-receipt.json`.
- Candidate, named test contexts and results: `artifacts/project-files77-rules/`.
- Reproducible test generator: `tools/project-files77-rule-tests.mjs`.
- Deployment guard and exact-source verification: `tools/project-files77-rules.mjs`.

Rollback can repoint `cloud.firestore` to the recorded previous ruleset after
checking that no newer deployment would be overwritten. No rollback was needed.
Live rule deployment and the real project UI save/import check below are complete.
Neither verifies source Drive/report access nor completes downstream workspace modules.

## Verification

56 synthetic startup/file/UI checks and 41 existing cloud regression checks pass.
They cover reference round trips, small file size, exclusion of task/process
content and credentials, archive traversal and duplicate-key rejection,
cancelled-save preservation, current-user registration, original query scope,
two-write atomic registration, lost-response retry, and permission denial
before any partial registration. No Firebase/Drive content transfer is invoked
by file open/save. Colors are visually inspected using native WPF renders;
the images use synthetic data, not a company project.

Logs: `artifacts/wpf77-tests.log`, `artifacts/wpf77-cloud-regression.log`.
Preview: `artifacts/wpf77-projects.png`.

No packaged EXE or installer was produced. Existing WinForms/report work and original Electron source are
preserved. reportReady=false; supervisorAccepted=false.

## Real project round trip — 2026-11-09

The user explicitly requested launching the existing development app and testing
save/import while preserving the original server project. The existing debug DLL
was launched with `tools/start-wpf76.ps1`; the user logged in personally.

Before the assistant began the controlled save step, the user had already
performed a real UI export and import. The current app's diagnostic log records
export success at 16:38:29 KST, import success at 16:38:44 KST and project selection
immediately afterward. Server inspection confirmed a separate imported project.
No additional import was performed solely to repeat that successful action.

The imported project was then exported again through the same project dialog.
The user entered the requested filename because the UI automation tool could
click the native save dialog but could not deliver keyboard text into it.
The native window displayed the successful `.tzprj` save notice.

- File: `artifacts/project-roundtrip77/옹진군_저장확인_20261109.tzprj`, 582 bytes.
- Source project: `48482544-f550-4136-95ea-4bde8130078b`.
- Imported project: `960ad05e9c164209970e587174957b12`.
- Source server update time remains `2026-10-31T05:29:00.904093Z`, before app launch.
- Server count is two: the source and the separately imported project. Both
  full document fingerprints remained unchanged during the assistant's checks.
- Imported business fields match the source; stored source attribution matches
  the original; re-exported attribution matches the selected imported project.
- Original Firebase process-query scope is preserved across import and re-export.
- Drive and report references match their stored manifest but are empty on this
  project. Real Drive/report access remains untested, not implied by this pass.
- All 15 read-only evidence checks passed in
  `artifacts/project-roundtrip77/roundtrip-receipt.json`.
- Evidence utility: `tools/verify-project-roundtrip77.mjs`; it performs GETs only
  and stores document hashes rather than copies of original server documents.

The development app remains open on the imported project. No original project,
process, personal task, Drive file or report was overwritten or deleted.

## File-location list and window controls78 — 2026-11-09

This refinement supersedes the earlier name/date list and switching title.
Startup and the Project menu both open a dialog titled `프로젝트 열기`.
The existing-project grid has only `프로젝트명` and `파일 경로` columns,
with the same 760 DIP window width and 34 DIP single-line rows. Long text is
ellipsized with a full-text tooltip; column dividers remain resizable. Dates
remain in new-project creation and project metadata, not in the opening list.

Save still uses the user's file dialog location, without restricting storage to
the app folder. Successful save/import/open records the full path in a local
catalog scoped by company server and signed-in user. Refresh/reopening the dialog
retains those paths; a saved path becomes the next Save dialog's suggested location.
Paths are not written into portable `.tzprj` manifests or company Firestore data.
Untracked server projects explicitly display `서버 · 파일 경로 미등록`.
Files saved before this catalog existed need to be opened/saved once to record
their location; the application does not scan disks or invent paths for them.

File opening first validates the file and lists currently accessible server
projects. A previously registered identical manifest resolves through the local
catalog even if the file was copied or renamed. A same-server project ID already
in that list also opens without another create operation. Name or path alone does
not merge unrelated projects. Current connection metadata is fetched from the
server when opening an existing project. Unknown files still use the review and
create-only registration flow. Existing duplicate server entries are untouched;
this does not promise cross-PC deduplication of previously imported foreign-server
files when no registration mapping exists on that PC.

The main shell retains initial maximization and reapplies it once after Loaded,
when the native window exists. Maximize/restore/minimize and edge resizing are
enabled; the previous StateChanged forced-maximize loop is removed. A new native
development launch showed the maximized shell with its restore button and login
dialog. Manual resize/multi-monitor movement remains a separate user check.

Build: zero warnings/errors. Startup/file/UI suite: 69 passed, including durable
file-location history, same-server and known imported-file reuse, copied-file
identity, account isolation, access revalidation, filename reuse, damaged catalog
preservation, two-column UI, and startup maximize versus later user restore.
Log: `artifacts/wpf78-tests.log`; synthetic native design render:
`artifacts/wpf78-projects.png`. No company writes, deletions, packaged EXE or
installer were performed for refinement78. The updated development login is open.
