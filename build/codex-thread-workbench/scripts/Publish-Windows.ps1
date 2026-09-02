param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [ValidateSet("Workbench", "ConfirmationBar")]
    [string]$Profile = "Workbench",
    [string]$OutputRoot = ""
)

function Wait-ForReadableFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [int]$TimeoutMilliseconds = 5000
    )

    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
    while ($true) {
        $stream = $null
        try {
            $stream = [System.IO.File]::Open(
                $Path,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read,
                [System.IO.FileShare]::ReadWrite)
            return
        }
        catch [System.IO.IOException] {
            if ([DateTime]::UtcNow -ge $deadline) {
                throw
            }

            Start-Sleep -Milliseconds 100
        }
        finally {
            if ($null -ne $stream) {
                $stream.Dispose()
            }
        }
    }
}

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repositoryRoot "artifacts\release"
}

$project = Join-Path $repositoryRoot "src\CodexThreadWorkbench\CodexThreadWorkbench.csproj"
$isConfirmationBar = $Profile -eq "ConfirmationBar"
$distributionName = if ($isConfirmationBar) { "CodexConfirmationBar" } else { "CodexThreadWorkbench" }
$publishDirectory = Join-Path $OutputRoot "$distributionName-Windows-x64"
$archivePath = Join-Path $OutputRoot "$distributionName-Windows-x64.zip"
$executableName = "$distributionName.exe"
$readmePath = if ($isConfirmationBar) {
    Join-Path $repositoryRoot "README.confirmation-bar.md"
}
else {
    Join-Path $repositoryRoot "README.md"
}
$recoveryScriptName = if ($isConfirmationBar) {
    "Install-ConfirmationBarRecovery.ps1"
}
else {
    "Install-WindowsRecoveryTask.ps1"
}

if (Test-Path -LiteralPath $publishDirectory) {
    Remove-Item -LiteralPath $publishDirectory -Recurse -Force
}

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $publishDirectory -Force | Out-Null

dotnet publish $project `
    --configuration $Configuration `
    --runtime $Runtime `
    --self-contained true `
    --output $publishDirectory `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=None `
    -p:DebugSymbols=false

if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE."
}

$publishedExecutablePath = Join-Path $publishDirectory "CodexThreadWorkbench.exe"
if (-not (Test-Path -LiteralPath $publishedExecutablePath -PathType Leaf) -or
    (Get-Item -LiteralPath $publishedExecutablePath).Length -le 0) {
    throw "Published executable is missing or empty: $publishedExecutablePath"
}

$executablePath = Join-Path $publishDirectory $executableName
if ($publishedExecutablePath -ne $executablePath) {
    Rename-Item -LiteralPath $publishedExecutablePath -NewName $executableName
}

Copy-Item -LiteralPath $readmePath `
    -Destination (Join-Path $publishDirectory "README.md")
Copy-Item -LiteralPath (Join-Path $repositoryRoot "scripts\Install-WindowsRecoveryTask.ps1") `
    -Destination (Join-Path $publishDirectory $recoveryScriptName)

@{
    defaultMode = if ($isConfirmationBar) { "confirmation-overlay" } else { "workbench" }
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $publishDirectory "codex-launch-profile.json") -Encoding utf8

$compressionError = $null
for ($attempt = 1; $attempt -le 3; $attempt++) {
    Wait-ForReadableFile -Path $executablePath
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    try {
        Compress-Archive -Path (Join-Path $publishDirectory "*") `
            -DestinationPath $archivePath `
            -CompressionLevel Optimal `
            -ErrorAction Stop
        $compressionError = $null
        break
    }
    catch {
        $compressionError = $_
        if ($attempt -lt 3) {
            Start-Sleep -Milliseconds 150
        }
    }
}

if ($null -ne $compressionError) {
    throw $compressionError
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $archiveEntries = @($archive.Entries | ForEach-Object FullName)
    if ($archiveEntries -notcontains $executableName -or
        $archiveEntries -notcontains "README.md" -or
        $archiveEntries -notcontains $recoveryScriptName -or
        $archiveEntries -notcontains "codex-launch-profile.json") {
        throw "Windows package is missing the executable, launch profile, recovery installer, or README."
    }
}
finally {
    $archive.Dispose()
}

Write-Host "Windows package: $archivePath"
