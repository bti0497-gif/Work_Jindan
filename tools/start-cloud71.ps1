$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runRoot = Join-Path $projectRoot 'artifacts/product-patch66-cloud71-session/application'
$receiptPath = Join-Path $projectRoot 'artifacts/product-patch66-cloud71-session/COPY_RESULT.json'
if (!(Test-Path -LiteralPath $receiptPath)) { throw 'Verified development copy is not ready.' }
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if (!$receipt.allTargetFilesMatch -or [IO.Path]::GetFullPath($receipt.target) -ne [IO.Path]::GetFullPath($runRoot)) { throw 'Development copy receipt does not match.' }
$environmentNames = @('DOTNET_ROOT','DOTNET_ROOT_X64','DOTNET_MULTILEVEL_LOOKUP','DOTNET_GENERATE_ASPNET_CERTIFICATE','DOTNET_CLI_TELEMETRY_OPTOUT')
$previousValues = @{}
foreach($name in $environmentNames) { $previousValues[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $env:DOTNET_ROOT = Join-Path $runRoot '.runtime'
    $env:DOTNET_ROOT_X64 = $env:DOTNET_ROOT
    $env:DOTNET_MULTILEVEL_LOOKUP = '0'
    $env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $runtimePath = Join-Path $env:DOTNET_ROOT 'dotnet.exe'
    $hostAssembly = Join-Path $runRoot 'Jindan.Desktop.dll'
    & $runtimePath $hostAssembly --installation-root $runRoot --healthcheck
    if ($LASTEXITCODE -ne 0) { throw 'Module validation failed; the app was not started.' }
    $appProcess = Start-Process -FilePath (Join-Path $runRoot 'Jindan.Desktop.exe') -ArgumentList ('--installation-root "{0}"' -f $runRoot) -WorkingDirectory $runRoot -PassThru
    Write-Output "Native .NET workbench PID: $($appProcess.Id)"
    Write-Output "Diagnostics: $runRoot/diagnostics"
} finally {
    foreach($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name,$previousValues[$name],'Process') }
}
