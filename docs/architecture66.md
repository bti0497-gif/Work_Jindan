# Architecture66: native modular workbench and report engine boundary

The new implementation lives only in F:/jindan-dotnet. F:/jindan, its HEAD48daf3e, dirty/untracked files, original documents, frozen artifacts and supervisor evidence are read-only baselines. No production database or old credentials are imported automatically. Report/business approval remains `reportReady=false`, `supervisorAccepted=false`.

Current UI direction: [navigation73.md](navigation73.md) supersedes the original
top project-selector/document-tab chrome below. The shell now exposes one menu
row and composes module-declared sidebar navigation; Studio is a dedicated surface.

## Responsibility and dependency direction

- **Jindan.Contracts** is UI-independent: schema/version records, identity, document/project context, command/results/progress, workspace/data/asset/report service interfaces. It contains no WinForms controls, database implementation or feature DLL references.
- **Jindan.Core** supplies common validation/context rules and a separately executable Sync namespace. Sync has a durable scoped local outbox and an explicitly enabled loopback test adapter; production remains NotConfigured, with no feature UI auto-wiring or claim of real server authorization. **Jindan.Infrastructure** implements isolated local persistence, authentication/authorization, asset hashes, revision checks, logical deletion, atomic replacement/backup/recovery and explicit import preview/rollback. DTO-supplied roles are not authority; the storage service validates its own authenticated local session, role, owner/project membership and revision for each action.
- **Jindan.Desktop.Contracts** owns the WinForms document/panel lifecycle contract and reusable record editor, not a feature registry. An `IDesktopModule` implements Initialize/CreateDocument/CreateLeftPanel/CreateRightPanel/Activate/Deactivate/Dispose. An `IWorkspaceDocument` owns View, Context, dirty state, save and selection/title events.
- **Jindan.Desktop** is the MDI composition shell. It owns menus/tabs/panel frames/splitters/floating containers, active document context, layout and close/save flow. Actual lists, editors, report review logic and photo views belong to feature modules. It injects workspace services rather than passing database internals or global UI state.
- **Jindan.ModuleHost** verifies only explicit inventory packages against a separate trusted local manifest-hash allowlist; it validates payload paths, duplicate identities, compatibility, dependencies, sizes and hashes before isolated loading. Jindan.Contracts/Desktop.Contracts resolve from the host. Missing/invalid modules are errors of that package and do not require scanning or executing arbitrary folder DLLs.
- **Jindan.Update** and **Jindan.Update.Tool** implement stopped-app staging, durable journal states, whole-package directory replacement, health checks and explicit rollback/recovery. They do not overwrite running DLLs or terminate the normal application.
- Nine feature DLLs are Projects, Processes, Photos, Files, Tasks, Board, Members, Dashboard and ReportStudio. They reference Contracts/Desktop.Contracts and communicate through injected services. Projects/Processes/Dashboard additionally reference the stateless common Jindan.Core schedule helper; each package carries that exact Core.dll as declared payload, resolved inside its module context. This is not another feature DLL or ambient default-context dependency. They do not reference one another. Their resources/worker dependencies are part of the versioned package, not an assumption that a DLL can always be replaced alone.
- **Jindan.Report.Adapter** implements IReportService using an explicitly selected owned Node process for each local request. It enforces source/project/context/generation and review-byte bindings, limits, cancellation, timeout, result containment and output SHA. Reanalysis and explicit review acknowledgement are required after recovery; program acknowledgement is not human/native engineering approval.
- **Jindan.Report.Worker/engine** is the single repaired JS source, carried forward with regression evidence. PDF/HWPX structural/layout/asset algorithms remain Hybrid. **Engines/Jindan.Engine.Package** is a separate native C# promotion for bounded package/path/hash validation; this does not turn complex restoration into pure C#.

## UI and context ownership

The host is a native WinForms MDI form with an explicit document tab strip, multiple child documents, tile horizontal/vertical/cascade actions and independent per-document ContextId. Active document activation supplies the same context to both module-owned side panels. Project changes must respect dirty document state. The shell supports panel visibility/width, left/right swapping and bounded floating/re-docking containers, plus layout persistence. This is a specific built-in-control shell, not a general third-party docking framework.

Each document owns its controls and selection state; the shell moves/rebinds those controls when activation changes. Deactivate/dispose and owner-scoped event unsubscribe must prevent callbacks crossing into a closed or different document. Root owns actual STA/UI verification and its exact evidence, including keyboard, DPI, layout, memory/event and restart behavior. Implementation presence is not a claim that every monitor/DPI/user interaction has been independently accepted.

## Local data and authorization

The new LocalWorkspace stores a schema-versioned JSON state and separately hashed asset bytes in a new explicitly selected workspace. It uses a store lease, revisions, backups and atomic writes; corrupt/unsupported schemas fail closed or use the validated backup rather than silently downgrading. Imports are previewed and create a new local copy with rollback, not automatic production migration. Deletion is explicit logical deletion; source originals remain intact. Passwords use salted derivation, not copied old cloud sessions. Local authentication is not Firebase/Drive production authentication.

Legacy work JSON has a separate explicit importer for the documented project/process/task tables, including exact exported localStorage keys. It stages a sanitized canonical ZIP in the new workspace, binds both original JSON and candidate ZIP hashes, and reuses confirmed new-ID copying and revision-bound rollback. Imported users/passwords/roles are excluded; unmapped business fields reject instead of disappearing. Full formats, field mapping and synthetic regression evidence are in migration66.md. This is independent of report archive recovery and never imports an old authenticated cloud session.

Projects, process schedules, tasks, shared board records, users and assets have actual service-side role/owner/project validation. UI hiding is not authorization. Report host calls also authorize the active actor and project; transport SHA/context checks do not replace that authorization. Live Drive/Firebase writes, paid AI calls, external uploads and production adapters are separate blocked integrations; the local fake/standalone path does not impersonate a company cloud session.

## Report pipeline and preservation boundaries

The ReportStudio DLL owns report/discipline/slot selection, previews, analysis summaries, source-location navigation, review and artifact controls. The adapter stages immutable source/evidence copies into unique request sessions. Worker protocol is versioned and bounded; large documents use hashed file descriptors rather than unlimited base64 or document-text logs. Only the created worker process may be stopped; stale generations cannot return success. Malformed or duplicate HWPX ZIP entries are rejected in the repaired parser/facade path.

PDF preview is from that PDF; HWP/HWPX preview is from its native-format bytes using the local independent renderer, never substituted with the linked PDF. Preview fidelity is not native Hancom validation. Missing runtime/adapter/capability is a declared block. Restore and draft output are new candidates/copies. Current evidence and source-slot expectations must match; old measurements are not invented as current values. Recovery data remains untrusted until fresh analysis and review.

Exact earlier final28 tests preserved679 picture binaries/dimensions/pixels and51 native output pages only under the supervisor's confirmed save-time-reduction-off condition, with original settings restored afterwards. Original fonts, embedded-font retention, source JSON loss, three tab-property changes, all-object editing and real company current-data workflow remain distinct unapproved gates. The new workbench does not change Hancom settings or infer those approvals from a module/worker/UI test.

## Runtime packaging and local update trust

The review artifact uses a verified project-local .NET10.0.403 SDK at build time, bundles only .NET host/fxr+NETCore+WindowsDesktop10.0.14 at run time, and carries upstream .NET notices. Node is copied from the actually discovered installed executable with its license, not from the old workspace. Worker dependencies are explicit applicable non-dev package-lock entries with resources/native binaries/licenses. No SDK/build tools, raw company corpus or credentials are part of the product artifact. See run-review66.md and artifact manifests for exact hashes.

A trusted local manifest hash is integrity allowlisting by the explicit operator/test instruction; it is not a publisher signature or a sandbox. Production signing/key policy/distribution is not configured. Stop the owned app before applying a selected compatible module package; stage and verify, swap directories under journal, run an owned health process and restore the old package on failure. Incomplete transactions or unconfirmed health cleanup block normal startup. Schema rollback requires a snapshot and refuses later changed user data. Host and unrelated module hashes must stay unchanged for a one-feature patch.

## Recorded environment deviation

The first local SDK build emitted the SDK's automatic ASP.NET development-certificate installation message. No explicit trust/store-edit command was run, but the message is not proof that no certificate was created. No potentially unrelated certificate was removed. Later tools/launchers use process-only certificate generation false and telemetry opt-out; no global environment/security change is made by those tools. The complete disclosure is sdk-first-run-observation66.md.

## Evidence ownership

Module/update console fixtures currently pass37 tests against their recorded source checkpoint; actual product Projects patch/UI/restart evidence is root-owned and must be read from its own result, not inferred from fixtures. Intermediate A is an immutable older M6 baseline with sourceStable=false; final review preparation must follow the final source freeze. Feature parity, external blocks and final counts/hashes belong in the final handoff. No source/native/supervisor result is silently promoted into approval of another SHA or a broader workflow.


