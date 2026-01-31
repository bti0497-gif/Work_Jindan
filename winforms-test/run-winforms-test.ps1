# Run WinForms WebView2 test script
# Usage: Right-click -> Run with PowerShell (run as regular user). Requires Node.js and .NET runtime installed.

$repoRoot = Resolve-Path ".." | Select-Object -ExpandProperty Path
$serverPort = 3000
$serverUrl = "http://127.0.0.1:$serverPort"
$healthUrl = "$serverUrl/api/health"
$webviewExe = Join-Path $repoRoot "winforms-test\bin\Release\net7.0-windows\WinFormsWebViewTest.exe"
$statusFile = Join-Path $env:TEMP 'winforms-webview-status.txt'
$startupFile = Join-Path $env:TEMP 'winforms-startup.txt'

Write-Output "Starting local Next server on port $serverPort..."
$nodeExe = "C:\Program Files\nodejs\node.exe"
$nextBin = "node_modules/next/dist/bin/next"
$serverProc = Start-Process -FilePath $nodeExe -ArgumentList $nextBin, 'start', '-p', $serverPort -WorkingDirectory $repoRoot -PassThru
Write-Output "Started server PID: $($serverProc.Id)"

# Wait for health
Write-Output "Waiting for $healthUrl to respond..."
$maxMs = 30000; $sw = [Diagnostics.Stopwatch]::StartNew(); $up = $false
while ($sw.ElapsedMilliseconds -lt $maxMs) {
    try {
        $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { Write-Output "Health OK: $($r.Content)"; $up = $true; break }
    } catch { Start-Sleep -Milliseconds 300 }
}
if (-not $up) { Write-Output "Server health check timed out after $($maxMs/1000) seconds."; exit 1 }

# Remove old status files
if (Test-Path $statusFile) { Remove-Item $statusFile -Force }
if (Test-Path $startupFile) { Remove-Item $startupFile -Force }

# Launch WinForms test app
Write-Output "Launching WinForms test app: $webviewExe"
$wfProc = Start-Process -FilePath $webviewExe -PassThru
Write-Output "WinForms PID: $($wfProc.Id)"

# Poll status file
$maxMs = 30000; $sw = [Diagnostics.Stopwatch]::StartNew(); $found = $false
while ($sw.ElapsedMilliseconds -lt $maxMs) {
    if (Test-Path $statusFile) { Write-Output "Status file content:`n$(Get-Content $statusFile -Raw)"; $found = $true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $found) { Write-Output "Status file not created within timeout. Check WebView2 runtime and event logs." }

Write-Output "Test complete. Server PID: $($serverProc.Id), WinForms PID: $($wfProc.Id)"
Write-Output "You may terminate the processes if desired."