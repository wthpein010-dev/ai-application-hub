param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repositoryRoot "src/CodexQuotaBar.App/CodexQuotaBar.App.csproj"
$publishDirectory = Join-Path $repositoryRoot "artifacts/publish/win-x64"
$stagingDirectory = Join-Path $repositoryRoot "artifacts/package/windows"
$packageDirectory = Join-Path $stagingDirectory "CodexQuotaBar-Windows-x64"
$outputDirectory = Join-Path $repositoryRoot "dist/windows"
$archivePath = Join-Path $outputDirectory "CodexQuotaBar-Windows-x64.zip"

function Assert-RepositoryPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $root = [System.IO.Path]::GetFullPath($repositoryRoot).TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
    $candidate = [System.IO.Path]::GetFullPath($Path)
    if (-not $candidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the repository: $candidate"
    }
}

function Reset-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    Assert-RepositoryPath $Path
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

Reset-Directory $publishDirectory
Reset-Directory $stagingDirectory
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Assert-RepositoryPath $archivePath
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

$publishArguments = @(
    "publish",
    $projectPath,
    "--configuration", $Configuration,
    "--runtime", "win-x64",
    "--self-contained", "true",
    "--output", $publishDirectory,
    "-p:PublishSingleFile=true",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-p:DebugType=None",
    "-p:DebugSymbols=false"
)

& dotnet @publishArguments
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE"
}

Get-ChildItem -LiteralPath $publishDirectory -Force | Copy-Item -Destination $packageDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "README.md") -Destination (Join-Path $packageDirectory "README-zh-CN.md")
Compress-Archive -LiteralPath $packageDirectory -DestinationPath $archivePath -CompressionLevel Optimal

Write-Host "Created Windows package: $archivePath"
