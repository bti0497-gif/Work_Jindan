param(
    [Parameter(Mandatory = $true)]
    [string]$Destination
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd('\')
$backupRoot = (Resolve-Path -LiteralPath $Destination).Path.TrimEnd('\')

if ($workspaceRoot -eq $backupRoot -or
    $backupRoot.StartsWith($workspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $workspaceRoot.StartsWith($backupRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Workspace and backup must be separate folders, with neither inside the other.'
}
if ((Split-Path -Leaf $backupRoot) -ne 'jindan' -or
    -not (Test-Path -LiteralPath (Join-Path $backupRoot '.git') -PathType Container)) {
    throw 'Backup target must be the existing jindan repository folder.'
}
if ((Get-Item -LiteralPath $workspaceRoot).Attributes -band [IO.FileAttributes]::ReparsePoint -or
    (Get-Item -LiteralPath $backupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Workspace and backup roots must be direct folders, not links or junctions.'
}
$workspaceRemote = & git -C $workspaceRoot remote get-url origin
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify workspace repository.' }
$backupRemote = & git -C $backupRoot remote get-url origin
if ($LASTEXITCODE -ne 0 -or $workspaceRemote -ne $backupRemote) {
    throw 'Backup repository does not match the workspace origin.'
}

$backupLog = Join-Path $env:TEMP ('jindan-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Write-Output "Source: $workspaceRoot"
Write-Output "Backup: $backupRoot"
& robocopy $workspaceRoot $backupRoot /MIR /MT:16 /XJ /FFT /R:1 /W:1 /NP /NFL /NDL /XD node_modules "/LOG:$backupLog"
$copyCode = $LASTEXITCODE
if ($copyCode -gt 7) { throw "Backup failed (robocopy $copyCode). See $backupLog" }
Write-Output "Backup completed. Log: $backupLog"
