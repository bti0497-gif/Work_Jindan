$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:DOTNET_NOLOGO = '1'
$env:DOTNET_CLI_HOME = Join-Path $taskRoot '.tools/cli-home'
& (Join-Path $taskRoot '.tools/dotnet/dotnet.exe') @args
exit $LASTEXITCODE
