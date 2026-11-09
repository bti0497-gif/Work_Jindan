$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $taskRoot '.tools/dotnet/dotnet.exe'
$entry = Join-Path $taskRoot 'src/Wpf/Jindan.Wpf.Desktop/bin/Debug/net10.0-windows/Jindan.Wpf.Desktop.dll'
if (!(Test-Path -LiteralPath $entry)) { throw 'WPF development DLL is not built. This launcher does not build or publish.' }
$existing = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $runtime -and $_.CommandLine -like ('*' + $entry.Replace('/', '\') + '*') })
if ($existing.Count -gt 0) { Write-Output 'The WPF development app is already running.'; exit 0 }
$logs = Join-Path $taskRoot 'artifacts'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$process = Start-Process -FilePath $runtime -ArgumentList ('"' + $entry + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'wpf76-dev-out.log') -RedirectStandardError (Join-Path $logs 'wpf76-dev-error.log')
$process.Id | Set-Content -LiteralPath (Join-Path $logs 'wpf76-owned-process.txt')
Write-Output ('WPF development app started. Process: ' + $process.Id)
