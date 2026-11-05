# Project-local .NET SDK66

Acquired 2026-11-05 KST for ROADMAP66. The existing machine SDK9.0.308 remains untouched.

- Pinned SDK: **10.0.403**, Windows x64; release10.0.14 dated2026-10-25.
- SDK executable: `F:/jindan-dotnet/.tools/dotnet/dotnet.exe`.
- Install scope: archive extraction into this new workspace only. No MSI, administrator elevation, global PATH, registry, font, security, or existing-project changes.
- Official release metadata: https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json
- Official download: https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.403/dotnet-sdk-10.0.403-win-x64.zip
- Official support policy: https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core
- Official version page: https://dotnet.microsoft.com/en-us/download/dotnet/10.0

The cached official metadata and selection/verification records are `artifacts/sdk66/releases-10.0.json`, `sdk-selection.json`, and `sdk-verification.json`. The 300,745,255-byte ZIP passed the SHA512 from Microsoft's release metadata before extraction:

```text
7a114c318fa7f1d9822991b534b2814d0e78386ceda816b371f5141acefe741d87ccb606ede06cadac8f9ac5070e32b708a67bbd1619ff5e5a7858a27874ef48
```

Use the explicit executable; SDK selection by machine PATH remains9.0.308. For build processes, set only process-local environment variables:

```powershell
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_CLI_HOME = 'F:/jindan-dotnet/.tools/cli-home'
& 'F:/jindan-dotnet/.tools/dotnet/dotnet.exe' --info
& 'F:/jindan-dotnet/.tools/dotnet/dotnet.exe' build
```

Reverify the archive and SDK with `powershell -NoProfile -File artifacts/sdk66/verify-local-sdk.ps1`. The SDK's bundled runtime/reference packs and licenses are retained in `.tools/dotnet`. These local caches are not product source or redistribution approval. No .NET business implementation was performed by the SDK acquisition task; root enforces M1 before migration.

For a clean workspace without `.tools/dotnet`, the pinned `artifacts/sdk66/acquire-local-sdk.ps1` downloads/verifies/extracts the same official archive; it refuses to overwrite an existing SDK directory. Its acquisition side effects stay under the new workspace.

Verification completed: official archive SHA512 and `--info` both exit0. SDK contains5,577 files, MSBuild18.9.15, WindowsDesktop/Core/AspNet runtimes10.0.14 and corresponding reference packs; no separate WindowsDesktop runtime download is required. Full executable/runtime/pack facts and executable SHA256 are in `artifacts/sdk66/SDK66_READY.json`; command logs are adjacent. Extraction elapsed322.389seconds. No workload install/restore was executed; any workload registration listed by `--info` is environmental discovery, not an action performed here.
