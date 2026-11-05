# REVIEW69: complete snapshots and recoverable rollback

The R4 reviewer reproduced loss of the current data tree when an existing schema
snapshot was incomplete. R4 checked only that the snapshot directory existed,
then deleted current data before copying it. Missing snapshot directories already
failed safely; this correction does not claim that the missing-directory case was
the same defect. R4 and all supervisor evidence remain unchanged.

## Publication and binding

`DataSnapshot.Publish` inventories every relative file path, byte length and
SHA256, plus every directory including empty directories. It copies to a fresh
unpublished sibling, flushes copied bytes and a strict manifest, verifies the
copy and the source again, then renames the complete container to `data-before`.
The container has exactly `manifest.json` and `content/`. A prepared journal is
published only after that snapshot exists and has been verified. An interruption
before journal publication leaves the original module/data unchanged and retains
unpublished artifacts for inspection; it does not silently reuse an incomplete
transaction under the same patch identity.

The journal pins the exact snapshot-manifest SHA. The manifest binds patch ID,
module ID, before-module manifest SHA and canonical managed data root. Equivalent
Windows path casing is accepted. Unsafe/colliding paths, reparse points, duplicate
or unknown JSON properties, unexpected container entries, missing/extra payloads,
size/hash mismatches and changed empty directories fail before live mutation.
Limits are 100,000 entries and a 16MiB manifest. This is a local recovery integrity
contract; it is not authentication against a hostile writer with filesystem access.

R4 `dataSnapshot=true` journals have no verifiable complete-snapshot binding.
They fail closed with `DATA_BACKUP_UNVERIFIABLE` rather than manufacturing a new
manifest from possibly incomplete contents. Their files must be preserved for a
separately reviewed manual recovery. Same-schema journals are still evaluated
against their actual verified module generations and workspace policy.

## Restore transaction

Before touching either live tree, restore validates the full snapshot and the
trusted before/after module generations. The snapshot requirement is checked
against those modules' actual schema versions, rather than trusting only a journal
boolean. Strict journal checks reject duplicate properties, unknown stages,
inconsistent snapshot fields, invalid identities and aliased restore slots.

The old module and old data are copied into fresh restore staging trees and
verified. A durable `restore-prepared` journal records their identities and the
current live generation before the first rename, including an explicit rollback
that started from a previously committed transaction. Both module/data staging
are preflighted again on resumed recovery before any new data rename.

For data, then module, each swap records displacement intent, renames the current
tree to its own retained displaced path, records promotion intent and renames the
verified staging tree into place. No current-data tree is deleted. If promotion
fails while the destination is absent, the displaced original is moved back. If
a conflicting entry prevents that compensation, the original stays in its
retained displaced path and the nonterminal journal blocks normal startup.
Recovery checks identities and can continue a move that completed before the
next journal write. Only verified final module/data generations permit a durable
`rolled-back` state. Repeated recovery of a terminal transaction is a no-op.

The original snapshot, previous package, displaced current data/module and orphan
staging trees are retained. Automatic retention cleanup is deliberately absent;
a later explicit policy must not purge material needed for recovery. The updater
does not delete a blocking entry to make a failed transaction appear successful.
An operator must inspect retained paths/hashes and resolve the conflict before
retrying recovery. The CLI never labels that incomplete state a successful rollback.

Individual flushed writes and directory renames form a journaled recoverable
transaction. They are not one globally atomic module-plus-data operation or a
universal power-loss guarantee for exFAT/hardware. The manifest verifies file
bytes and directory inventory; it is not a forensic ACL/timestamp preservation
claim. Later user-data changes still block automatic schema downgrade, and
custom-workspace schema migrations remain blocked until separately reviewed.

## Reproduction and regression

```powershell
# New output names are required; existing evidence is never overwritten.
node tools/snapshot69-legacy-ab.mjs artifacts/review69-legacy-ab-NEW
node tools/run-snapshot69.mjs artifacts/review69-snapshot-tests-NEW
# Compile only the test harness against the immutable distribution and run its
# actual three update libraries using that distribution's bundled runtime.
node tools/run-snapshot69.mjs artifacts/review69-exact-snapshot-NEW F:/jindan-dotnet/artifacts/ready-for-review/final66-r6/application
```

The first command executes the exact immutable R4 CLI on an isolated synthetic
committed journal and records the two-file complete snapshot, deliberate removal
and resulting loss. It then verifies that the new source CLI rejects that old
unbound snapshot without changing current data. Those injected-journal cases are
explicitly separate from actual `ApplyAsync`/migration tests.

The package regression console executes real schema migration, snapshot creation,
corruption/read/write/publication failures, staged-copy corruption, policy/plan
inconsistency, blocked second renames, compensation and fresh child-process exits
at snapshot/apply/restore boundaries. It checks current or retained original data,
module identity, startup blocking, terminal recovery and repeated recovery. Old
same-schema patch, locks, timeout, interruption, custom workspace and later-data
guards remain in that suite. Fresh output contains exact commands, times, logs
and the complete suite RESULT. Expected CLI rejection stderr is captured through
Node as a separate stream; PowerShell `2>&1` plus `ErrorActionPreference=Stop`
is not used to turn intended negative cases into a wrapper abort.

The exact-installation mode checks the loaded ModuleHost, Update and Update.Tool
DLL hashes before the main suite and owned probe/interruption children. Its
wrapper pins the bundled dotnet command, while the inner result records loaded
paths/hashes and the two compiled fixture hashes. CLI health apphost children
inherit bundled DOTNET_ROOT and the same copied harness dependencies. Expected
counts are81 source assertions, or82 including one exact-installation binding
assertion; these overlap and must not be added as unique tests.

Final R6 package execution, product patch and exact native UI are separate gates
in the new handoff. Console or selection-source passes are not transferred to a
different binary SHA, real company documents or native Hancom fidelity approval.
`reportReady=false` and `supervisorAccepted=false` remain mandatory.
