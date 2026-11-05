# Report local completion70

The new **저장본 보존 검사** tab exposes the previously library-only
`nativeSaveAudit` through the authorized C# adapter and disposable worker. Analyze
the selected HWPX first, choose a separate saved HWPX, then inspect/export the
result. Both exact byte SHA256 identities are checked. The returned file becomes
an immutable, project-scoped `native-saved` copy, not a replacement source or
current measurement. The JSON receipt and returned copy survive workspace save
and are included separately in portable recovery. Recovered copies require fresh
analysis/review before drafting. Audit JSON cannot become the generic HWPX
download by accidentally being the latest artifact.

The audit compares cell/text streams, tab attributes, font definitions and font
files, picture encoded bytes/PNG dimensions, and `Contents/jindan-*.json` hashes.
It does not repair loss, assert native font selection, or reinsert arbitrary
company metadata. Picture matching is ordinal and not proof of semantic object
identity. Encoded PNG identity/dimensions is not decoded pixel or visible-layout
verification. Native Hancom save, font selection, all-object editing and exact
company page comparison remain separate tests of exact SHA, not inferred passes.
No native application, font, save setting, density or picture geometry is changed.

The **제안 검토 · 오프라인** tab adds the missing local request/response workflow
around the retained analysis/interpretation validators. It exports a bounded JSON
request bound to the current project/source/schema/inputs and a deterministic
request hash. A separately supplied `jindan-proposal-response/1` JSON is validated
and previewed. Only explicit application updates the selected schema/notes;
values are never generated and human/schema confirmation is invalidated.
Interpretation references must name nonblank input fields with explicit
`user-input`, `user-form` or verified `file-cell` origins. Blank/historical/narrative-only references
cannot support a current opinion. Strict full-document draft gates are unchanged.

`proposalExchange70.js` supplies an injectable **offline-fixture-only** provider
contract for tests: bounded/canonical JSON, cooperative cancellation, timeout,
stale state rejection and redacted arbitrary thrown values. It cannot forcibly
stop a noncooperative provider in the same JS process; the worker transport owns
actual process interruption. There is no network/provider/model/key in this tab.
The production AI execution adapter, credentials, approved model/provider contract
and live validation are **not implemented/configured**, not relabeled as a tested
production adapter. API calls/keys/models/paid actions remain forbidden here.

Protocol additions retain `jindan-worker/1`: operation `nativeSaveAudit` requires
the current analyzed HWPX bundle and `files.filled`. Existing `discipline` accepts
`proposalRequest`, `proposalInspect` and `proposalApply` with payload `mode`,
`envelope` and (only for apply) `explicitApply:true`. Results retain false approval
flags. Source/response content is staged in hashed sidecars, never log messages.

The material inspector also has **원시셀 → 선택 입력칸**. Select an actual CSV/XLSX
cell and a discipline input field, then explicitly confirm equipment/period/unit
and replacement. The worker reopens the exact immutable file bytes, validates
its SHA and cell coordinates, rejects cached formula cells, blank/history inputs
and unconfirmed replacement, and records the original quote/address/hash as
`file-cell` provenance. It does not calculate a value, fetch KEPCO or infer units
or period. Numeric spelling is preserved after explicit unit/comma removal to
avoid rounding a large integer. This is deterministic local extraction and
mapping, separate from the unavailable paid AI extraction provider.

Reproduce the focused offline regressions:

```powershell
node --require ./tools/offline-tests.cjs --test tests/LegacyEngine/proposal-exchange70.test.cjs tests/WorkerProtocol/preservation70.test.cjs
```

The final70 handoff records exact aggregate commands, package and GUI receipts.
R6/FINAL69/source69/evidence remain historical, immutable and unmodified. Their
approval/counts are not transferred to the new candidate.
