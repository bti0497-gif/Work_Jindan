# EXECUTE70 local review runbook

The exact new candidate is identified in `handoff/FINAL70.md` and
`handoff/VALIDATION70.json`. R6 remains an immutable historical baseline with its
own scoped independent review. Do not transfer its approval/counts to this build.
The production provider, native font/save preservation and company-current-data
requirements in `handoff/REMAINING70.json` remain separate. Both approval flags
remain false. No paid call, external upload, commit/push/deployment or original
workspace/native-settings change is part of these commands.

Use a fresh disposable clone for every interactive or patch review; never reuse
an existing company workspace or write into the immutable review bundle:

```powershell
Set-Location F:/jindan-dotnet
node tools/prepare-product-clone66.mjs artifacts/ready-for-review/final70-r6 artifacts/product-patch66-independent70-NEW/application artifacts/product-patch66-independent70-NEW/COPY_RESULT.json
$app='F:/jindan-dotnet/artifacts/product-patch66-independent70-NEW/application'
$env:DOTNET_ROOT="$app/.runtime"
$env:DOTNET_ROOT_X64=$env:DOTNET_ROOT
$env:DOTNET_MULTILEVEL_LOOKUP='0'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app
```

Create only an explicitly consenting local account in that test clone. Local
credentials/roles are independent of company Firebase/Drive accounts. No real
service adapter or old token/session is automatically adopted. Close only the
owned test app normally before applying a patch. The update tool accepts exact
installation/data/module generations and enrolled package hashes; inspect its
`--help`/the recorded test command rather than changing a manifest to bypass a
refusal. `docs/snapshot-restore69.md` still defines data restoration safety.

The Files **Drive 목록 캐시 · 로컬 시험** accepts an explicitly synthetic listing
fixture and labels it as offline. The sync menu displays actual local pending
changes; production is NotConfigured and sending/scheduling is disabled. The
optional source mapper refuses richer native fields that the confirmed legacy
schema cannot represent. These are concrete missing production integrations,
not successful real services awaiting a screenshot.

Projects and Board now retain optional bounded native text/paragraph formatting.
Plain text remains authoritative and arbitrary historical HTML is not executed.
Dashboard supplies at most8 local image/CAD tiles with documented local ordering;
remote Drive modified-time ordering is not fabricated.

Report **저장본 보존 검사** checks two exact HWPX SHA identities, keeps a returned
copy and audit receipt, and compares known picture/font/tab/custom-JSON losses.
It neither changes native settings nor repairs invisible native font loss.
**제안 검토 · 오프라인** exports/validates source-bound JSON without an AI call;
explicit apply and fresh schema review are separate. Current CSV/XLSX cell
mapping records exact input SHA/coordinate/quote after explicit context review.
No absent current measurement or diagnosis is generated.

Reproduce the source gate with `node tools/run-checks70.mjs`. Exact UI, new-process
reopen and module patch commands plus hashes are recorded in VALIDATION70; every
output path must be fresh. Console and GUI assertions overlap and are not company
workflow counts. Physical150/200 DPI, native Hancom whole-company documents,
every editable object, original font/source JSON/tab SaveAs retention and real
current values require separately supplied evidence/authorization and human review.




The final audit preserved r5 findings: selection assertions passed but a normal-close UI exception was logged. The strengthened native harness fails post-scenario ThreadException, and final r6 is separately checked. Borrowed contribution panels hide while still attached before removal and become visible only after rebinding. Isolated diagnostic layout/hide overrides are never used for final acceptance.
