# ADR66: implementation decisions and limits

## 001 — New independent tree and gated repair

Use F:/jindan-dotnet as a clean source boundary. Keep F:/jindan read-only, including dirty/untracked files and evidence. Repair the selected JS source in one new worker/engine location before .NET feature migration; retain exact source-map and before/after tests. Do not copy the old repository, node_modules, releases, secrets or company corpus. This preserves prior evidence and makes later regression attribution possible.

## 002 — .NET10 native shell, versioned Hybrid engine

Use Windows x64 .NET10 LTS and WinForms MDI with built-in controls. Obtain the official SDK in the project-local tools directory, verify its archive checksum and avoid global PATH changes. Keep the established PDF/HWPX algorithm implementation in an isolated local JS worker while promoting bounded package/path/hash work to C# under parity tests. Do not reimplement complex layout without golden/native evidence or call the result pure C# merely because the shell is native.

## 003 — Contracts and independent feature packages

Separate UI-independent Contracts from WinForms Desktop.Contracts. Feature DLLs reference these contracts and injected services, never another feature DLL. The shell coordinates menus/documents/panel frames, while modules own content and business interaction. Package a DLL with all required worker/resources and explicit identity/version/host/schema/files/dependencies metadata. No arbitrary folder discovery or ambient plugin loading. The three schedule consumers declare the pure common Core.dll inside each versioned payload; the loader policy is not expanded to arbitrary host implementation references.

## 004 — Trusted local integrity, no signing claim

Pin exact manifest SHA256 values in a separate explicit local policy. Packaging does not trust itself; generic CLI trust enrollment needs an explicit local approval flag. The ROADMAP66 package preparation instruction authorizes enrollment only of the selected local baseline builds and the Projects v2 test candidate. Hashes are not origin authentication, approved plugin code is not sandboxed, and production signatures/keys/distribution are not configured.

## 005 — Stop, stage, journal, health, rollback

Use a shared application/update lease and reject a running application. Validate compatibility and exact selected old version, copy into same-volume staging, verify again, then rename whole module directories under a durable journal. Health starts only an owned process. Cancellation awaits cleanup before rollback; unconfirmed cleanup records a pending state and blocks app restart. Explicit recovery restores known previous bytes. Directory operations are journaled recoverable changes, not a universal power-loss guarantee. Never kill by process name or overwrite loaded DLLs.

## 006 — Data schema and recovery are separate from binaries

Use schema versions and revision checks for local records. Schema changes require an explicit matching migration and data snapshot; rollback rejects data changed after migration rather than silently discarding it. Recovery of report archives restores bytes/provenance, not old approval flags. Reanalyze and review fresh before writing a draft. Program acknowledgement is a technical binding event and cannot certify human/native review.

## 007 — Isolated local identity and external integrations

Use a new explicit local workspace/account model for reversible development. Enforce roles, ownership and project membership in the service, not UI visibility or caller-supplied role text. No copied Firebase/Drive session or unconditional administrator fallback. Real cloud adapters and live write verification remain separate gates; do not send company data or paid API requests during this roadmap execution.

## 008 — Bounded local runtime closure

Bundle only .NET runtime host/fxr+NETCore+WindowsDesktop from the verified official SDK entries, with licenses/notices; omit the SDK and ASP.NET build tools. Include the discovered installed Node executable/license and the new applicable production dependency closure with explicit file hashes. Keep worker/parser/WASM/native resource compatibility visible. Missing capabilities fail clearly instead of silently using an old workspace or substituting a different preview format.

## 009 — Evidence is exact-scope

Console module fixtures, transport tests, STA UI tests, actual product patch tests, native Hancom tests and real current-company acceptance are different evidence. Reusing a successful old SHA/count for a new artifact is prohibited. Report/module tests keep reportReady=false and supervisorAccepted=false. Native font selection, metadata retention, every-object editability and real current data remain independent approval requirements.

## 010 — First SDK certificate message is disclosed

A first-run SDK build displayed automatic development-certificate installation. No explicit certificate-trust/store change command was run; this is not an independent store audit and no no-change claim is made. No automatic removal of potentially unrelated certificates was attempted. Subsequent commands use process-only DOTNET_GENERATE_ASPNET_CERTIFICATE=false and opt-out settings. See sdk-first-run-observation66.md; do not hide this deviation in a blanket statement that no settings could have changed.

