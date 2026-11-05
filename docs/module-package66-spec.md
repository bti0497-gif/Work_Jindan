# Module package and local update contract66

Implemented after the coordinator recorded M1 passed. This is a trusted-local development package mechanism, not production publisher authentication, a plugin sandbox, a live DLL replacement system, or company report approval. The prior F:/jindan remains read-only. All module/update source is new in F:/jindan-dotnet.

## Stable integration API

- `new ModuleTrustPolicy(IEnumerable<string> approvedManifestSha256)` pins exact manifest hashes enrolled outside a package.
- `ModuleCatalog.Verify(directory, trust, hostContractMajor: 1)` returns `VerifiedModule(Manifest, Directory, ManifestSha256, EntryAssemblyPath)` or a structured `PackageException.Code`.
- `ModuleCatalog.VerifyInventory(explicitPackageDirectories, trust, hostContractMajor: 1)` returns separate valid modules/errors. Duplicate identities are excluded; missing/incompatible transitive dependencies are excluded. Remaining modules can load.
- `new ModuleAssemblyScope(verifiedModule)` is a collectible context; `CreateEntry()` returns an object for the shell to cast to `IDesktopModule`. Shared Jindan.Contracts and Jindan.Desktop.Contracts resolve from the host default context. Declared local DLLs resolve in the package; other managed dependencies are restricted to platform assemblies/shared contracts. Unmanaged loading through the context is blocked. Approved plugin code still has normal .NET process permissions; this is not a sandbox.
- `WorkspaceLocation.Register(root, dataRoot)` atomically records the actual selected existing workspace after store creation, under the normal host lease. The host default is root/data. Schema changes reject custom locations, malformed descriptors and missing registered data; no external workspace is migrated implicitly. Same-schema patches preserve valid custom locations without moving data.
- Normal application lifetime holds `ApplicationLease.Acquire(installationRoot)`. It rejects incomplete update journals. Only coordinator recovery/apply uses `allowPendingUpdate: true`.
- `new UpdateCoordinator(trust).ApplyAsync(new PatchRequest(root,moduleId,candidate,expectedVersion,patchId), healthCheck, migration:null, healthTimeout:null, durableStageObserver:null, cancellationToken:default, dependencyDirectories:null)`.
- `RollbackLastAsync(root)` restores the latest committed whole module. `RecoverInterruptedAsync(root)` restores a pending transaction before application startup.

The shell owns Initialize/Activate/Deactivate/Dispose, dirty-close decisions, UI-thread marshaling, document/panel disposal and owner-scoped event unsubscribe. ModuleHost performs verification/loading and does not invent UI lifecycle approval. Feature DLLs must reference Contracts/Desktop.Contracts, not other feature DLLs. Module dependencies are package presence/version requirements; they do not authorize direct cross-feature calls.

## Manifest schema1

`module.json` uses camelCase, strict known properties and no duplicate JSON property names. Numeric version format is the .NET Version format (2 to 4 integer components), not arbitrary prerelease SemVer.

```json
{
  "schemaVersion": 1,
  "moduleId": "projects",
  "version": "1.0.0",
  "entryAssembly": "Jindan.Modules.Projects.dll",
  "entryType": "Jindan.Modules.Projects.Module",
  "minimumHostContractMajor": 1,
  "maximumHostContractMajor": 1,
  "dataSchemaVersion": 1,
  "dependencies": [],
  "files": [{"path":"Jindan.Modules.Projects.dll","size":123,"sha256":"exact-sha256"}]
}
```

An explicit inventory identifies package directories; the loader never discovers DLLs by scanning a folder. Every payload file is declared exactly once with size and SHA256; no undeclared payload is accepted. Manifest bytes are pinned separately because a manifest cannot hash itself. Limits: manifest8MiB, files1..10000, single file256MiB, aggregate512MiB. Paths are strict '/' relative paths, with no drive/UNC/backslash/colon, empty/dot/parent segments, trailing dot/space, invalid characters, case-insensitive collisions or reparse points. File hashes are checked again before loading. Cooperating application/update leases protect the normal workflow; hostile concurrent filesystem mutation is not a sandbox guarantee.

The local trust file is an explicit JSON string array of approved manifest SHA256 values, outside packages. A package hash proves integrity, not publisher identity. Neither pack nor apply implicitly enrolls a candidate. Production signatures, distribution, private keys and automatic remote updates are not configured.

## Transaction and recovery

The coordinator takes the same exclusive application lease; a running application or concurrent updater blocks it. It checks module identity, host compatibility, exact selected old version, monotonic new version, explicit compatible dependency inventory when dependencies exist, patch replay ledger and payload integrity. Current package files are checked for exclusive access before staging. A fresh sibling staging directory stays on the installation volume. Copied content is verified again before any installed directory rename.

Journal stages are `prepared`, `old-renamed`, `candidate-promoted`, `health-passed`, `committed`, or `rolled-back`. Each journal write uses a temporary file, flush and same-directory replacement. A whole package directory is renamed, keeping `previous` for rollback. Interruption recovery restores the known previous manifest/hash. Application startup blocks on any incomplete journal. Directory renames are each atomic filesystem operations; the two-directory replacement is a journaled recoverable transaction, not one globally atomic filesystem operation or a power-loss durability guarantee for all hardware/filesystems.

The health callback is bounded and owns any child process. Update.Tool starts only the explicitly requested health executable with `--healthcheck --installation-root ROOT`; cancellation stops that owned process tree and awaits its exit. The coordinator waits for cancellation cleanup before rollback. If an arbitrary callback fails to confirm cleanup within5s, it records `health-cleanup-pending`, blocks application restart and requires explicit owner cleanup followed by recovery; it does not overwrite potentially loaded DLLs. No process-name/global kill is used. `WaitAsync` alone is not described as process termination.

Successful apply keeps the old package. Explicit rollback restores it; replay of an already committed patchId is rejected even after rollback. Rollback/recover CLI results explicitly require restart and health verification. These tools never terminate a normal running application, never update loaded DLLs and never launch an interactive app automatically.

Schema changes require an explicit `IDataSchemaMigration` with matching FromSchema/ToSchema and a separate user-data snapshot before migration. Health/migration failure restores that snapshot. Explicit schema rollback only proceeds if data still equals the committed post-migration fingerprint; later edits cause DATA_CHANGED and require a separate reviewed data recovery strategy. No silent DB downgrade or overwriting later user changes. Same-schema feature patches preserve user data. Production data is never used by these tests.

## Reproducible command line

Use project-local SDK/runtime without changing global PATH or security settings:

```powershell
$env:DOTNET_CLI_HOME = 'F:/jindan-dotnet/.tools/cli-home'
$env:DOTNET_ROOT = 'F:/jindan-dotnet/.tools/dotnet'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
& .tools/dotnet/dotnet.exe build src/Jindan.Update.Tool/Jindan.Update.Tool.csproj
& .tools/dotnet/dotnet.exe run --project tests/Jindan.Package.Tests/Jindan.Package.Tests.csproj
```

Invoke the compiled tool as `dotnet src/Jindan.Update.Tool/bin/Debug/net10.0/Jindan.Update.Tool.dll COMMAND ...`:

- `pack --entry DLL --entry-type TYPE --module-id projects --version 1.0.0 --out FRESH_DIRECTORY`. Explicit resources may be repeated `--file ABSOLUTE_SOURCE::RELATIVE_TARGET` or supplied by `--files-json LIST.json`, an array of `{source,path}`. No arbitrary folder scan. Optional `--schema 1 --host-major 1`.
- `trust-add --package DIRECTORY --trust TRUST.json --approve-local-manifest`. This explicit local enrollment is not production signing or approval of report content.
- `verify --package DIRECTORY --trust TRUST.json`.
- After closing the owned test application: `apply --root INSTALLATION --module-id projects --candidate V2_DIRECTORY --expected 1.0.0 --patch-id projects-v2 --trust TRUST.json --health-exe DESKTOP.exe --health-timeout 60`.
- `rollback --root INSTALLATION --trust TRUST.json`, then separately restart/verify health.
- `recover --root INSTALLATION --trust TRUST.json` after confirming no update-owned health worker remains, then separately restart/verify health.

The CLI currently rejects schema changes without a migration rather than guessing one. Programmatic callers can pass an explicit tested migration. No production adapter, implicit download, cloud write, credentials or installation is performed.

## Evidence and limits

The console suite builds actual v1/v2 fixture DLLs with different observable Describe behavior. Fresh child processes load v1, apply/health-load v2 and verify explicit rollback to v1. Host/other module/user-data hashes stay unchanged. It also exercises trust separation, missing/tampered/incompatible/undeclared files, invalid/null manifests, traversal/case/property duplicates, transitive dependencies, mutation after verification, active app/file locks, health failure/exception/timeout, concurrent/replayed updates, stale version, owned-process interruption at both rename/promotion stages, schema migration/rollback and changed-data downgrade rejection. CLI packaging/explicit resource list/trust/apply/health timeout/rollback/recovery are exercised too.

F: is exFAT, so native reparse-point creation there fails (`Incorrect function`). The coordinator explicitly authorized a new isolated `%TEMP%/jindan66-reparse-<guid>` fixture on NTFS only for this test. Exact resolved owned roots are recorded in each RESULT.json and retained for independent inspection; no unrelated temp paths or settings are changed. No permission changes are used.

Test output is `artifacts/package-tests/<UTC-time>-<guid>/RESULT.json` and the actual module before/after proof.json. A suite pass is fixture update evidence, not the complete M6 product patch gate. The coordinator separately builds the actual Projects product v1/v2 and owns application UI/restart/patch verification. Native Hancom font/object fidelity, preserved document metadata, real current data and human/company workflow approval remain separate unresolved gates. `reportReady=false`, `supervisorAccepted=false`.

