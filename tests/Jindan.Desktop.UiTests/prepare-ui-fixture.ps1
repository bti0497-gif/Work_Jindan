param([string]$OutputRoot)
$ErrorActionPreference='Stop'
$workspaceRoot= [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $OutputRoot) { $OutputRoot=Join-Path $workspaceRoot ('artifacts/ui-fixture66-'+[Guid]::NewGuid().ToString('N')) }
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
if (Test-Path -LiteralPath $OutputRoot) { throw 'Existing UI fixture is preserved; choose a fresh output.' }
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
$env:DOTNET_NOLOGO='1'
$env:DOTNET_CLI_HOME=Join-Path $workspaceRoot '.tools/cli-home'
$sdk=Join-Path $workspaceRoot '.tools/dotnet/dotnet.exe'
$log=Join-Path $OutputRoot 'fixture-build.log'
& $sdk build (Join-Path $workspaceRoot 'src/Jindan.Update.Tool/Jindan.Update.Tool.csproj') --nologo 2>&1 | Out-File -Encoding utf8 -Append $log
if($LASTEXITCODE -ne 0){throw 'Update tool build failed.'}
$tool=Join-Path $workspaceRoot 'src/Jindan.Update.Tool/bin/Debug/net10.0/Jindan.Update.Tool.dll'
$inventory=@()
$proof=@()
foreach($name in @('Projects','Processes','Photos','Files','Tasks','Board','Members','ReportStudio','Dashboard')){
 $project=Get-ChildItem -LiteralPath (Join-Path $workspaceRoot "src/Modules/$name") -Filter '*.csproj' | Select-Object -First 1
 & $sdk build $project.FullName --nologo 2>&1 | Out-File -Encoding utf8 -Append $log
 if($LASTEXITCODE -ne 0){throw "Module build failed: $name"}
 $id=if($name -eq 'ReportStudio'){'report-studio'}else{$name.ToLowerInvariant()}
 $dll=Join-Path $workspaceRoot "src/Modules/$name/bin/Debug/net10.0-windows/Jindan.Modules.$name.dll"
 $package=Join-Path $OutputRoot "modules/$id"
 $extra=@()
 if($name -in @('Projects','Processes','Dashboard')) { $extra=@('--file',((Join-Path $workspaceRoot 'src/Jindan.Core/bin/Debug/net10.0/Jindan.Core.dll')+'::Jindan.Core.dll')) }
 & $sdk $tool pack --entry $dll --entry-type "Jindan.Modules.$name.Module" --module-id $id --version '1.0.0' --out $package --schema 1 --host-major 1 @extra 2>&1 | Out-File -Encoding utf8 -Append $log
 if($LASTEXITCODE -ne 0){throw "Module pack failed: $name"}
 & $sdk $tool trust-add --package $package --trust (Join-Path $OutputRoot 'trusted-manifests.json') --approve-local-manifest 2>&1 | Out-File -Encoding utf8 -Append $log
 if($LASTEXITCODE -ne 0){throw "Module trust enrollment failed: $name"}
 $inventory+="modules/$id"
 $proof+=@{moduleId=$id;sourceDll=$dll;sourceDllSha256=(Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash.ToLowerInvariant();manifestSha256=(Get-FileHash -LiteralPath (Join-Path $package 'module.json') -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$inventory | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot 'module-inventory.json') -Encoding utf8
@{schema='jindan-ui-test-fixture/1';syntheticOnly=$true;reportRuntime='explicitly unavailable test adapter, not tested here';sourceModules=$proof;reportReady=$false;supervisorAccepted=$false} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $OutputRoot 'UI_FIXTURE.json') -Encoding utf8
Write-Output $OutputRoot
