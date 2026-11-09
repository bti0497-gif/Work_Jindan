$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runRoot = Join-Path $projectRoot 'artifacts/product-patch66-navigation73-session/application'
$workspace = Join-Path $projectRoot 'artifacts/product-patch66-cloud71-session/application/data'
$receiptPath = Join-Path $projectRoot 'artifacts/product-patch66-navigation73-session/COPY_RESULT.json'
if (!(Test-Path -LiteralPath $receiptPath)) { throw 'Verified development copy is not ready.' }
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if (!$receipt.allTargetFilesMatch -or [IO.Path]::GetFullPath($receipt.target) -ne [IO.Path]::GetFullPath($runRoot)) { throw 'Development copy receipt does not match.' }
if (!(Test-Path -LiteralPath $workspace)) { throw 'Existing .NET workspace is missing.' }
foreach ($previous in @('product-patch66-cloud71-session','product-patch66-simple72-session')) {
    $previousLock = Join-Path $projectRoot "artifacts/$previous/application/.jindan.application.lock"
    if (Test-Path -LiteralPath $previousLock) {
        try { $probe = [IO.File]::Open($previousLock, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None); $probe.Dispose() }
        catch { throw 'Close the earlier development app before opening this workspace in the new version.' }
    }
}
$environmentNames = @('DOTNET_ROOT','DOTNET_ROOT_X64','DOTNET_MULTILEVEL_LOOKUP','DOTNET_GENERATE_ASPNET_CERTIFICATE','DOTNET_CLI_TELEMETRY_OPTOUT')
$previousValues = @{}
foreach($name in $environmentNames) { $previousValues[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $env:DOTNET_ROOT = Join-Path $runRoot '.runtime'
    $env:DOTNET_ROOT_X64 = $env:DOTNET_ROOT
    $env:DOTNET_MULTILEVEL_LOOKUP = '0'
    $env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    & (Join-Path $env:DOTNET_ROOT 'dotnet.exe') (Join-Path $runRoot 'Jindan.Desktop.dll') --installation-root $runRoot --healthcheck
    if ($LASTEXITCODE -ne 0) { throw 'Module validation failed.' }
    $appProcess = Start-Process -FilePath (Join-Path $runRoot 'Jindan.Desktop.exe') -ArgumentList ('--installation-root "{0}" --workspace "{1}"' -f $runRoot,$workspace) -WorkingDirectory $runRoot -PassThru
    Write-Output "Native GUI PID: $($appProcess.Id)"
} finally {
    foreach($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name,$previousValues[$name],'Process') }
}
