param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("windows", "macos")]
    [string]$Platform
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$petResourcePath = Join-Path $repositoryRoot "src/CodexQuotaBar.App/Assets/Pets/suit-hamster.gif"
$expectedPetSha256 = "A3E00783DC4A6C2C0656CF3E79915D214AF2DAEA8BCE8C75EB99616F3BDE3BE8"
$archivePath = if ($Platform -eq "windows") {
    Join-Path $repositoryRoot "dist/windows/CodexQuotaBar-Windows-x64.zip"
} else {
    Join-Path $repositoryRoot "dist/macos/CodexQuotaBar-macOS.zip"
}

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Package archive is missing: $archivePath"
}

if (-not (Test-Path -LiteralPath $petResourcePath -PathType Leaf)) {
    throw "Bundled pet source is missing: $petResourcePath"
}

$petSha256 = (Get-FileHash -LiteralPath $petResourcePath -Algorithm SHA256).Hash
if (-not [string]::Equals($petSha256, $expectedPetSha256, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Bundled pet source hash does not match the approved asset."
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })

    function Assert-ArchiveEntry {
        param(
            [Parameter(Mandatory = $true)]
            [string]$Pattern,
            [Parameter(Mandatory = $true)]
            [string]$Description
        )

        if (-not ($entryNames | Where-Object { $_ -match $Pattern })) {
            throw "Package is missing $Description."
        }
    }

    Assert-ArchiveEntry -Pattern "/README-zh-CN\.md$" -Description "the Chinese readme"

    if ($Platform -eq "windows") {
        Assert-ArchiveEntry -Pattern "/CodexQuotaBar\.exe$" -Description "CodexQuotaBar.exe"
    } else {
        foreach ($architecture in @("arm64", "x64")) {
            $appPrefix = "/$architecture/CodexQuotaBar\.app/Contents"
            Assert-ArchiveEntry -Pattern "$appPrefix/Info\.plist$" -Description "$architecture Info.plist"
            Assert-ArchiveEntry -Pattern "$appPrefix/MacOS/CodexQuotaBar$" -Description "$architecture executable"
        }
    }
}
finally {
    $archive.Dispose()
}

if ($Platform -eq "windows") {
    $verificationRoot = Join-Path ([System.IO.Path]::GetTempPath()) "CodexQuotaBar-package-verification-$([Guid]::NewGuid().ToString('N'))"
    try {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $verificationRoot)
        $executable = Get-ChildItem -LiteralPath $verificationRoot -Filter "CodexQuotaBar.exe" -File -Recurse |
            Select-Object -First 1
        if ($null -eq $executable) {
            throw "Extracted Windows package has no CodexQuotaBar.exe."
        }

        $process = Start-Process `
            -FilePath $executable.FullName `
            -ArgumentList "--verify-bundled-pet" `
            -PassThru `
            -Wait `
            -WindowStyle Hidden
        if ($process.ExitCode -ne 0) {
            throw "Packaged Windows executable failed the bundled pet self-check with exit code $($process.ExitCode)."
        }
    }
    finally {
        if (Test-Path -LiteralPath $verificationRoot) {
            $temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\", "/") +
                [System.IO.Path]::DirectorySeparatorChar
            $resolvedVerificationRoot = [System.IO.Path]::GetFullPath($verificationRoot)
            if (-not $resolvedVerificationRoot.StartsWith(
                    $temporaryRoot,
                    [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Refusing to remove a verification path outside the temporary directory."
            }

            Remove-Item -LiteralPath $resolvedVerificationRoot -Recurse -Force
        }
    }
}

Write-Host "Verified $Platform package: $archivePath"
