[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,
    [string]$TaskName = "Codex Confirmation Overlay Recovery",
    [string]$Arguments = "--confirmation-overlay",
    [string]$BackgroundTaskHostPath = (Join-Path $PSScriptRoot "BackgroundTaskHost.exe"),
    [switch]$Describe
)

$ErrorActionPreference = "Stop"
$resolvedExecutable = [System.IO.Path]::GetFullPath($ExecutablePath)
$workingDirectory = Split-Path -Parent $resolvedExecutable
$diagnosticsPath = Join-Path $workingDirectory "CodexConfirmationBar-lifecycle.log"
$taskActionExecutable = Join-Path `
    $env:SystemRoot `
    "System32\WindowsPowerShell\v1.0\powershell.exe"
$escapedExecutable = $resolvedExecutable.Replace("'", "''")
$escapedArguments = $Arguments.Replace("'", "''")
$escapedDiagnostics = $diagnosticsPath.Replace("'", "''")
$launcher = @"
`$env:CODEX_CONFIRMATION_DIAGNOSTICS = '$escapedDiagnostics'
& '$escapedExecutable' '$escapedArguments'
exit `$LASTEXITCODE
"@
$encodedLauncher = [Convert]::ToBase64String(
    [Text.Encoding]::Unicode.GetBytes($launcher))
$taskActionArguments = `
    "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand $encodedLauncher"
$childExecutable = $taskActionExecutable
$childArguments = $taskActionArguments
$hostPath = [System.IO.Path]::GetFullPath($BackgroundTaskHostPath)
$hostConfigPath = Join-Path $workingDirectory "CodexConfirmationBar-recovery.xml"
$config = New-Object System.Xml.XmlDocument
$root = $config.CreateElement("Task")
[void]$config.AppendChild($root)
foreach ($entry in @{
    Executable = $childExecutable
    Arguments = $childArguments
    WorkingDirectory = $workingDirectory
    LogPath = (Join-Path $workingDirectory "CodexConfirmationBar-recovery-host.log")
}.GetEnumerator()) {
    $element = $config.CreateElement($entry.Key)
    $element.InnerText = $entry.Value
    [void]$root.AppendChild($element)
}
$taskActionExecutable = $hostPath
$taskActionArguments = '"' + $hostConfigPath + '"'
$definition = [pscustomobject]@{
    HostConfigXml = $config.OuterXml
    HostConfigPath = $hostConfigPath
    TaskName = $TaskName
    ExecutablePath = $resolvedExecutable
    Arguments = $Arguments
    RepetitionMinutes = 1
    RestartMinutes = 1
    RestartCount = 999
    MultipleInstances = "IgnoreNew"
    DiagnosticsPath = $diagnosticsPath
    TaskActionExecutable = $taskActionExecutable
    TaskActionArguments = $taskActionArguments
}

if ($Describe) {
    $definition | ConvertTo-Json
    return
}

if (-not (Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
    throw "Codex confirmation executable was not found: $resolvedExecutable"
}

if (-not (Test-Path -LiteralPath $hostPath -PathType Leaf)) {
    throw "Console-free BackgroundTaskHost was not found: $hostPath. Supply a trusted GUI-subsystem host; no task has been changed."
}
$config.Save($hostConfigPath)
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
    -Execute $taskActionExecutable `
    -Argument $taskActionArguments `
    -WorkingDirectory $workingDirectory
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$recoveryTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries
$principal = New-ScheduledTaskPrincipal `
    -UserId $userId `
    -LogonType Interactive `
    -RunLevel Limited
$task = New-ScheduledTask `
    -Action $action `
    -Trigger @($logonTrigger, $recoveryTrigger) `
    -Settings $settings `
    -Principal $principal `
    -Description "Keeps the Codex confirmation overlay running for the current user."

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
$definition | ConvertTo-Json
