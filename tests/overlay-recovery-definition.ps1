param([string]$ScriptPath = (Join-Path $PSScriptRoot "../build/codex-thread-workbench/scripts/Install-WindowsRecoveryTask.ps1"))
$ErrorActionPreference='Stop'
$fixture=Join-Path ([System.IO.Path]::GetTempPath()) ('.verification-'+[Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $fixture)
$executable=Join-Path $fixture "sample dir\O'Neil\CodexThreadWorkbench.exe"
$hostPath=Join-Path $fixture "trusted host\O'Neil\BackgroundTaskHost.exe"
$arguments='--confirmation-overlay --label "with spaces" --note O''Neil'
$global:RecoveryAuditCalls=@{Register=0; Start=0; Action=0; Process=0}
function Start-Process { $global:RecoveryAuditCalls.Process++; throw 'Describe must not start a process' }
function Register-ScheduledTask { $global:RecoveryAuditCalls.Register++; throw 'Describe must not register a task' }
function Start-ScheduledTask { $global:RecoveryAuditCalls.Start++; throw 'Describe must not start a task' }
function New-ScheduledTaskAction { $global:RecoveryAuditCalls.Action++; throw 'Describe must not construct scheduler actions' }
$before=@(Get-ChildItem -LiteralPath $fixture -Recurse -Force | Select-Object -ExpandProperty FullName)
$definition = & $ScriptPath -ExecutablePath $executable -BackgroundTaskHostPath $hostPath -Arguments $arguments -Describe | ConvertFrom-Json
[xml]$config=$definition.HostConfigXml
$workingDirectory=Split-Path -Parent $executable
$diagnostics=Join-Path $workingDirectory 'CodexConfirmationBar-lifecycle.log'
$expectedCommand=@"
`$env:CODEX_CONFIRMATION_DIAGNOSTICS = '$($diagnostics.Replace("'", "''"))'
& '$($executable.Replace("'", "''"))' '$($arguments.Replace("'", "''"))'
exit `$LASTEXITCODE
"@
$encoded=($config.Task.Arguments -split '-EncodedCommand ')[1]
$command=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))
if ($command.Replace("`r`n","`n").Trim() -cne $expectedCommand.Replace("`r`n","`n").Trim()) { throw 'Encoded diagnostics, executable, arguments or exit-code command changed.' }
if ($definition.TaskActionExecutable -cne $hostPath) { throw 'Custom host path lost.' }
if ($definition.TaskActionArguments -cne ('"'+$definition.HostConfigPath+'"')) { throw 'Host XML path is not quoted exactly.' }
if ($definition.Arguments -cne $arguments) { throw 'Public arguments round trip failed.' }
if ($config.Task.WorkingDirectory -cne $workingDirectory) { throw 'XML working directory round trip failed.' }
if ($config.Task.LogPath -cne (Join-Path $workingDirectory 'CodexConfirmationBar-recovery-host.log')) { throw 'Host log path lost.' }
if ($definition.MultipleInstances -ne 'IgnoreNew' -or $definition.RepetitionMinutes -ne 1 -or $definition.RestartMinutes -ne 1 -or $definition.RestartCount -ne 999) { throw 'Recovery policy changed.' }
if ($config.Task.Executable -cne (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) { throw 'Child executable changed.' }
$after=@(Get-ChildItem -LiteralPath $fixture -Recurse -Force | Select-Object -ExpandProperty FullName)
if (($before -join "`n") -cne ($after -join "`n") -or (Test-Path -LiteralPath $definition.HostConfigPath)) { throw 'Describe wrote a file.' }
if (($global:RecoveryAuditCalls.Values | Measure-Object -Sum).Sum -ne 0) { throw 'Describe called the scheduler.' }
$tokens=$null; $parseErrors=$null
[void][System.Management.Automation.Language.Parser]::ParseInput($command,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Decoded command does not parse.' }
"PASS: 11 checks: exact decoded diagnostics/EXE/quoted arguments/exit command; custom host; host XML quoting; arguments; XML cwd; log; recovery policy; PowerShell child; zero file writes; zero scheduler calls; decoded syntax. Fixture: $fixture"

$defaultDefinition = & $ScriptPath -ExecutablePath $executable -Describe | ConvertFrom-Json
$expectedDefaultHost = Join-Path (Split-Path -Parent ([System.IO.Path]::GetFullPath($ScriptPath))) 'BackgroundTaskHost.exe'
if ($defaultDefinition.TaskActionExecutable -cne $expectedDefaultHost) { throw 'Default host is not script-local.' }
# Synthetic executable existence: do not create or launch any executable.
function Test-Path {
    param([string]$LiteralPath, [string]$Path, [string]$PathType)
    $candidate = if ($LiteralPath) { $LiteralPath } else { $Path }
    return $candidate -ceq $executable
}
$failedBeforeMutation = $false
try {
    & $ScriptPath -ExecutablePath $executable -BackgroundTaskHostPath $hostPath | Out-Null
} catch {
    if ($_.Exception.Message -notlike 'Console-free BackgroundTaskHost was not found:*') { throw }
    $failedBeforeMutation = $true
} finally {
    Remove-Item Function:\Test-Path
}
if (-not $failedBeforeMutation) { throw 'Missing host did not fail closed.' }
if (($global:RecoveryAuditCalls.Values | Measure-Object -Sum).Sum -ne 0) { throw 'Missing host reached scheduler or process launch.' }
$finalFiles = @(Get-ChildItem -LiteralPath $fixture -Recurse -Force | Select-Object -ExpandProperty FullName)
if (($before -join "`n") -cne ($finalFiles -join "`n")) { throw 'Missing host wrote a file.' }
'PASS: 2 additional checks: script-local default host; missing host fails before file writes, scheduler calls or process launch.'
