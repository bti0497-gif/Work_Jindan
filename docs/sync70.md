# Feature outbox, source mapping and opt-in scheduler70

`reportReady=false`, `supervisorAccepted=false`. This closes the local save/delete,
queue, status-command and bounded scheduling gap described in EXECUTE_REMAINING70.
It does not claim a configured Firebase provider or company workflow approval.

## Actual feature integration

`LocalWorkspace.SaveAsync` / confirmed logical `DeleteAsync` now commit the
projects/processes/tasks row and exact-revision `SyncOutbox` entry together inside
the existing leased atomic workspace transaction. Editing coalesces the previous
entry; delete is a distinct operation. Non-work kinds do not enqueue. Existing
schema1 files without the optional outbox load with an empty queue; previously
persisted rows and new-copy/legacy imports are never retroactively uploaded.
Import rollback restores its prior queue together with its business records.
The old `Core/SyncStore` remains the separately tested isolated pull/merge engine;
it is not a second queue silently populated by feature UI.

`WorkspaceSyncService` binds a real local session object. Every read, send and ACK
rechecks persisted user state, current project membership and role. Administrator
status does not upload another local user's queue. Linked project filters are
captured by the status window; personal tasks use a separate personal namespace.
A pending row revision must match its actual work row before transport. A stale,
foreign or mismatched ACK cannot remove a newer edit. Partial errors retain the
unacknowledged entry, and arbitrary remote exception text becomes a stable code.
Disable/revoke during an awaited send prevents ACK removal; remote side effects
already committed cannot be undone by a local cancellation claim.

The actual `WorkspaceServices` and main workbench expose **동기화 → 대기 목록·연결
상태**. The window shows work kind/ID/operation/revision/time, connection state,
manual refresh, explicit send and cancellation. The normal app injects only
`NotConfiguredSyncAdapter`; send and scheduling are disabled there. A successful
local save is described as local, never as a successful cloud synchronization.

## Explicit scheduler

`WorkspaceSyncScheduler70` schedules the same feature service/outbox, with an
injected clock and online signal. The UI checkbox opts in to one-minute upward
pushes only for this window/session's captured project. There is no startup timer
and no default real transport. Closing the window stops its owned timer. Starting
another context cancels and awaits the old cooperative task; generation checks
prevent the old result from publishing into the new state. The per-service gate
serializes manual and scheduled sends against the current queue. Empty/offline
ticks do not call transport. Transient failures use bounded exponential retries
(one-minute default → two → four → five minutes), while disabled identity,
forbidden access or missing configuration stops the loop. Scheduling opt-in is
not persisted across logout/restart. Cancellation cannot force an arbitrary
provider that ignores its cancellation contract to stop.

## Confirmed legacy mapping, separate from a real provider

Read-only sources: `F:/jindan/src/services/firebaseWorkService.js`, `workModel.js`,
`firebaseBoardAuth.js`, `F:/jindan/firestore.rules`, and the sync effect in
`F:/jindan/src/App.jsx`. The old app pushes each minute, pulls each five minutes,
and reacts to work changes; the new safe scheduler implements upward scheduling
only, rather than reporting an unconnected native pull as complete.

`SourceWorkAdapter70` and injected `ISourceWorkTransport70` express the confirmed
collections (`jindan_projects`, `jindan_processes`, `jindan_tasks`), transactional
read/transform/write and exact receipt binding. The provider must supply a fresh
externally authenticated uid/person_id, active membership-derived admin/user role,
expiry and explicit local-user/project link. Native admin/editor/viewer labels and
native IDs are never substituted for that external identity. The injected record
is a provider contract, not a self-authenticating credential or a server ACL proof.
No Firebase HTTP/SDK provider, token/session store or guessed REST protocol exists.

The adapter preserves server author/owner/created fields, rejects deleted upserts,
honors project owner/admin and shared-process rules, preserves process parent,
requires task author identity, and uses explicit tombstones. Missing/already
deleted rows produce a transaction no-op, represented by a null transform result,
not a fabricated source record. Tasks fetch the public-or-own query boundary.
Reads are bounded and cloned; duplicate IDs, foreign task visibility, wrong source
IDs and wrong ACK collection/ID/revision fail closed.

Native fields are richer than the source schema. Project facility/status/RTF and
other nonempty unmapped fields are rejected, not silently discarded. Native tasks
must be one day and have a title matching the preserved content's display line;
independent title/range/status data requires an explicit mapping policy. Native
process content is refused because `firestore.rules.validProcess` does **not**
allow `content`, even though the old JavaScript `makeWorkRecord` currently emits
it. The mapper emits the confirmed rule-compatible process field set only. This
source contradiction is disclosed; no live rules or old source was modified.

## Reproduce local checks

```powershell
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_CLI_HOME='F:/jindan-dotnet/.tools/cli-home'
& .tools/dotnet/dotnet.exe run --project tests/Jindan.WorkspaceSync.Tests/Jindan.WorkspaceSync.Tests.csproj --artifacts-path artifacts/workspace-sync70-build -p:UseSharedCompilation=false -v quiet -- F:/jindan-dotnet
```

Latest synthetic evidence and exact hashes are in
`artifacts/workspace-sync70/SYNC70_HANDOFF.json`. The integration suite covers
atomic feature edits/deletes, persistence/reopen, permissions/revocation,
coalescing/racing ACKs, confirmation, bounded mapping/negative source bindings,
explicit fixture opt-in, repeated disposal, deterministic offline clock/retries
and cancellation/session generations. Source-provider fixtures do not contact a
network or establish a real Firebase session. GUI validation is performed by the
root handoff separately; this console suite is not a GUI or company-data claim.

## Remaining gates and implementation boundary

- A real Firebase SDK/transport provider is **not implemented**. It requires an
  approved externally authenticated membership/session source, server endpoint
  and deployed-rule confirmation, account/ID link, and allowed live integration.
  Existing local credentials are not copied. This is an explicit missing provider,
  not merely a successful provider awaiting a live test.
- Native pull/apply is **not connected**. The bounded source fetch and isolated
  merge algorithm exist, but importing source rows into an existing native
  workspace requires approved external-person/native-user and source/native
  project/record-ID mapping, richer-field conflict policy and review/rollback.
  Old migration intentionally remaps IDs and omits identity, so inferring this
  binding from matching text or native IDs would be unsafe. The app does not mark
  an upward ACK time as full pull/sync success.
- Rich native fields that the deployed legacy schema cannot represent need a
  documented, approved schema/mapping decision; there is no silent field deletion
  or arbitrary company metadata invention.
- Live ACL behavior, rate limits, service failures and company data remain
  unverified. Independent supervisor/native review is separate. No external
  upload, paid API, Hancom/UI/settings operation or Git operation was performed
  by this work item.
