param(
    [string]$ExpectedArchiveSha256
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$distRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $repositoryRoot "dist/windows"))
$finalDirectory = Join-Path $distRoot "CodexQuotaBar-Windows-x64"
$archivePath = Join-Path $distRoot "CodexQuotaBar-Windows-x64.zip"
$token = [Guid]::NewGuid().ToString("N")
$stagingRoot = Join-Path $distRoot ".replace-$token"
$backupDirectory = Join-Path $distRoot ".old-$token"
$distPrefix = $distRoot.TrimEnd("\", "/") +
    [System.IO.Path]::DirectorySeparatorChar

function Assert-DistributionPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith(
            $distPrefix,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside dist/windows: $resolved"
    }
}

foreach ($path in @(
        $finalDirectory,
        $archivePath,
        $stagingRoot,
        $backupDirectory)) {
    Assert-DistributionPath $path
}

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Windows archive is missing: $archivePath"
}

if (-not [string]::IsNullOrWhiteSpace($ExpectedArchiveSha256)) {
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    if (-not [string]::Equals(
            $archiveHash,
            $ExpectedArchiveSha256,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Windows archive changed after verification."
    }
}

New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
try {
    [System.IO.Compression.ZipFile]::ExtractToDirectory(
        $archivePath,
        $stagingRoot)
    $stagedDirectory = Join-Path $stagingRoot "CodexQuotaBar-Windows-x64"
    $stagedExecutable = Join-Path $stagedDirectory "CodexQuotaBar.exe"
    if (-not (Test-Path -LiteralPath $stagedExecutable -PathType Leaf)) {
        throw "Staged executable is missing."
    }

    $selfCheck = Start-Process `
        -FilePath $stagedExecutable `
        -ArgumentList "--verify-bundled-pet" `
        -Wait `
        -PassThru `
        -WindowStyle Hidden
    if ($selfCheck.ExitCode -ne 0) {
        throw "Staged executable self-check failed with exit code $($selfCheck.ExitCode)."
    }

    $instances = @(Get-CimInstance Win32_Process -Filter "Name='CodexQuotaBar.exe'")
    if ($instances.Count -ne 1) {
        throw "Expected one running instance before replacement; found $($instances.Count)."
    }

    $expectedOldExecutable = [System.IO.Path]::GetFullPath(
        (Join-Path $finalDirectory "CodexQuotaBar.exe"))
    $runningExecutable = [System.IO.Path]::GetFullPath(
        $instances[0].ExecutablePath)
    if (-not [string]::Equals(
            $runningExecutable,
            $expectedOldExecutable,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The running instance is not the verified old package."
    }

    Stop-Process -Id $instances[0].ProcessId
    Wait-Process -Id $instances[0].ProcessId -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $finalDirectory -Destination $backupDirectory

    try {
        Move-Item -LiteralPath $stagedDirectory -Destination $finalDirectory
        $newExecutable = Join-Path $finalDirectory "CodexQuotaBar.exe"
        $newProcess = Start-Process `
            -FilePath $newExecutable `
            -PassThru
        Start-Sleep -Seconds 4
        $newProcess.Refresh()
        if ($newProcess.HasExited) {
            throw "New application exited during startup with code $($newProcess.ExitCode)."
        }

        $newInstances = @(Get-CimInstance Win32_Process -Filter "Name='CodexQuotaBar.exe'")
        if (($newInstances.Count -ne 1) -or
            ($newInstances[0].ProcessId -ne $newProcess.Id)) {
            throw "Expected exactly one new instance; found $($newInstances.Count)."
        }
    }
    catch {
        Get-CimInstance Win32_Process -Filter "Name='CodexQuotaBar.exe'" |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
        if (Test-Path -LiteralPath $finalDirectory) {
            Assert-DistributionPath $finalDirectory
            Remove-Item -LiteralPath $finalDirectory -Recurse -Force
        }

        Move-Item -LiteralPath $backupDirectory -Destination $finalDirectory
        Start-Process `
            -FilePath (Join-Path $finalDirectory "CodexQuotaBar.exe") |
            Out-Null
        throw
    }

    Assert-DistributionPath $backupDirectory
    Remove-Item -LiteralPath $backupDirectory -Recurse -Force
    $runEntry = (Get-ItemProperty `
        -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
        -Name CodexQuotaBar).CodexQuotaBar

    [pscustomobject]@{
        ProcessId = $newProcess.Id
        Executable = $newExecutable
        RunEntry = $runEntry
    }
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Assert-DistributionPath $stagingRoot
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
}
