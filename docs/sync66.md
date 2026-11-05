# Native isolated sync boundary66

## Scope and status

`Jindan.Core/Sync*.cs` is a reusable UI-independent local sync algorithm and durable outbox. It is not connected to feature UI, LocalWorkspace, Firebase, Drive or a live account. Production is the explicit `NotConfiguredSyncAdapter`, which rejects rather than silently starting a fake or contacting a service. `IsolatedLoopbackSyncAdapter` needs a deliberate test-enable constructor flag and allowed synthetic namespaces. Its successful acknowledgements do not verify real server authorization. No live network write, token, paid API, existing cloud state or company source document is used.

Read-only source behavior references are F:/jindan/src/services/syncService.js, workModel.js and dbService.js. The corresponding native tables are Projects (프로젝트관리/jindan_projects), Processes (공정관리/jindan_processes) and Tasks (할일관리/jindan_tasks). This new component is algorithm parity for those queue/merge boundaries, not automatic production data migration or a replacement for work-record field validation and server ACLs.

## Public contracts

- `SyncScope(UserId, ProjectId)` identifies a required bounded user/project namespace. A SHA256 of its canonical JSON selects the independent new state file; namespace components cannot collide by simple concatenation. Passing an identifier is not authentication.
- `SyncStore(isolatedDirectory, scope)` persists cache plus outbox together. `UpsertAsync`, explicit `DeleteAsync`, `SnapshotAsync`, `MergePullAsync` and revision-bound `AcknowledgeAsync` operate only that scope. `QueueLegacyMissingUpsertAsync` is an explicit migration/problem-state representation; it does not infer deletion.
- `ISyncRemoteAdapter` separates push acknowledgement and fetch, with explicit adapter/configured/synthetic metadata. The provided production adapter is NotConfigured. A future real adapter must authenticate on the server and enforce owner/project ACLs, version/idempotency policy, complete-snapshot semantics and bounded transport. Client identity text or loopback scope membership cannot substitute for that requirement.
- `SyncCoordinator(store, explicitAdapter)` exposes coalesced `PushAsync` and push-first `SyncAllAsync`. No timer/autostart or product feature reference is added. Programmatic callers must obtain data/identity from the authorized business service; the queue is not the authorization authority.

The project targets net10.0 and uses BCL only. It has no UI, DB library, HTTP client, Firebase SDK or credential schema. Its public record fields carry cloned bounded JsonObject payloads, not implementation types from another feature DLL.

## Queue and merge rules

Local record and outbox revision commit in the same schema1 file. An edit coalesces the previous entry for that table/id to a new GUID revision. Delete is explicit and remains queued even though the cache row is removed. A missing local upsert is reported as MISSING_LOCAL_RECORD and retained for review; it never becomes a delete or a successful acknowledgement.

Push uses a snapshot, releases the store lease during the remote await, then removes an entry only if acknowledgement scope/table/id/revision match the sent revision and that exact revision remains current. A local edit racing an old acknowledgement stays pending. Partial failures preserve the failed entry while independently acknowledged entries stay committed. Retry sends only still-pending entries. The isolated server simulation retains revision receipts so a lost acknowledgement can be retried without applying the same mutation twice; this is test idempotency evidence, not a live Firebase receipt guarantee.

Pull protects every pending local edit/delete against a cloud overwrite or tombstone. Explicit remote tombstones remove non-pending rows. Missing Projects/Processes records are retained as possible legacy migration data. Missing Tasks rows are pruned only for an explicitly complete scoped snapshot, an existing ownerUid and no pending local entry; legacy rows without ownerUid survive. An incomplete/paginated pull does not imply deletion. Pulls do not re-enqueue upload work. The last-success time advances only after push and all three pulls have no issue and no pending entry remains.

Concurrent push/sync calls share the in-flight operation. The first caller owns transport cancellation; a later waiter's cancellation cancels only its wait. Owner cancellation is cooperatively propagated and the owner task finishes before returning cancellation. This in-process adapter boundary cannot force an arbitrary third-party provider to stop; no process termination claim is made. The separately implemented report worker owns/terminates its own processes under its transport contract.

## Durable state and limits

State files are separate from product LocalWorkspace/production DB. Per-instance asynchronous serialization plus a cross-instance exclusive file lease protects one namespace. Writes use a unique temporary file, flush, previous-valid backup and same-directory replacement. Corrupt primary recovery retains a corrupt copy and exposes RecoveredFromBackup; newer schema or mismatched namespace never silently falls back to an older schema/identity. This is recoverable atomic-file logic, not a universal guarantee against every device power failure.

Limits are10000 cached records/entries,32MiB serialized state,600000 UTF8 bytes per record payload,32 JSON nesting levels, bounded IDs and no reparse-point paths. Incoming pulls have bounded count/aggregate payload and duplicate remote IDs are rejected. The isolated loopback also caps100 namespaces,10000 stored records/32MiB and20000 revision receipts. It is a bounded test simulator, not a production retention policy. Errors expose stable safe codes; arbitrary remote exception text is not copied into result codes or logs. Source/evidence data and input objects are cloned to prevent mutation across awaits.

## Reproduce the tests

Use isolated build outputs to avoid concurrent workbench builds overwriting the shared Core output:

```powershell
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_CLI_HOME='F:/jindan-dotnet/.tools/cli-home'
& .tools/dotnet/dotnet.exe run --project tests/Jindan.Sync.Tests/Jindan.Sync.Tests.csproj --artifacts-path artifacts/sync-build-isolated -p:UseSharedCompilation=false -v quiet
```

The current result path/count is recorded in `artifacts/sync-tests/SYNC66_HANDOFF.json`. Tests cover persisted coalescing and explicit deletes, pending local wins, missing/tombstone/task distinctions, wrong/racing ACKs, independent partial retry, lost-ACK replay, actual owned child-process exit after committed enqueue and fresh store reopening, parallel/coalesced requests, owner/waiter cancellation, user/project namespace isolation, malformed/future/corrupt stores, cross-instance leases, partial pulls and input bounds. All inputs are synthetic. The earlier first shared-output run18/20 is preserved; isolated recompilation resolved the observed stale binary mismatch, and the actual new isolated result is reported separately rather than rewriting that failed log.

## Remaining external gate

Real server authentication/authorization, cloud API/rules adapter, live conflict behavior, real credentials, source data import/mapping, service rate limits and end-user sync UI are not implemented/verified here and are not silently called done. Feature modules do not invoke this boundary before an explicitly configured real integration gate. The native algorithm makes local maintenance/testing executable while production connectivity remains blocked under the user's no-live-write instruction. `reportReady=false`, `supervisorAccepted=false`, production verification false.
