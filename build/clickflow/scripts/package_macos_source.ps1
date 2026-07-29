param(
    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath(
    (Join-Path -Path $PSScriptRoot -ChildPath "..")
)
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "auto_clicker.py"))) {
    throw "Cannot verify the ClickFlow project root: $projectRoot"
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path -Path $projectRoot -ChildPath "release"
}
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$staging = Join-Path -Path $outputRoot -ChildPath "ClickFlow-macOS-build"
$archive = Join-Path -Path $outputRoot -ChildPath "ClickFlow-macOS-build.zip"

function Remove-OutputPath {
    param([Parameter(Mandatory = $true)][string]$TargetPath)

    $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)
    $outputPrefix = $outputRoot.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTarget.StartsWith(
        $outputPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Refusing to remove a path outside the output directory: $resolvedTarget"
    }
    if (Test-Path -LiteralPath $resolvedTarget) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Remove-OutputPath $staging
if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$sourceFiles = @(
    "auto_clicker.py",
    "clickflow_core.py",
    "clickflow_input.py",
    "clickflow_theme.py",
    "ClickFlow.spec",
    "requirements.txt",
    "requirements-build.txt"
)
foreach ($sourceFile in $sourceFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $sourceFile) -Destination $staging
}

Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\build_macos.sh") -Destination (Join-Path $staging "build_macos.sh")
Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\README-macOS.md") -Destination (Join-Path $staging "README-macOS.md")
$stagedTests = Join-Path -Path $staging -ChildPath "tests"
New-Item -ItemType Directory -Path $stagedTests -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot "tests") -File -Filter "*.py" |
    Copy-Item -Destination $stagedTests

Compress-Archive -LiteralPath $staging -DestinationPath $archive -CompressionLevel Optimal
Write-Host "macOS source build package created: $archive"
