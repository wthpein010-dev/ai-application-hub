param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repositoryRoot "src/CodexQuotaBar.App/CodexQuotaBar.App.csproj"
$publishRoot = Join-Path $repositoryRoot "artifacts/publish"
$stagingDirectory = Join-Path $repositoryRoot "artifacts/package/macos"
$packageDirectory = Join-Path $stagingDirectory "CodexQuotaBar-macOS"
$outputDirectory = Join-Path $repositoryRoot "dist/macos"
$archivePath = Join-Path $outputDirectory "CodexQuotaBar-macOS.zip"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

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

function Set-ZipUnixCreatorPlatform {
    param([Parameter(Mandatory = $true)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $minimumOffset = [Math]::Max(0, $bytes.Length - 65557)
    $endOffset = -1

    for ($index = $bytes.Length - 22; $index -ge $minimumOffset; $index--) {
        if ([BitConverter]::ToUInt32($bytes, $index) -eq 0x06054b50) {
            $endOffset = $index
            break
        }
    }

    if ($endOffset -lt 0) {
        throw "ZIP end-of-central-directory record is missing: $Path"
    }

    $entryCount = [BitConverter]::ToUInt16($bytes, $endOffset + 10)
    $offset = [int][BitConverter]::ToUInt32($bytes, $endOffset + 16)
    for ($entryIndex = 0; $entryIndex -lt $entryCount; $entryIndex++) {
        if ([BitConverter]::ToUInt32($bytes, $offset) -ne 0x02014b50) {
            throw "Invalid ZIP central-directory entry at offset $offset"
        }

        $bytes[$offset + 5] = 3
        $nameLength = [BitConverter]::ToUInt16($bytes, $offset + 28)
        $extraLength = [BitConverter]::ToUInt16($bytes, $offset + 30)
        $commentLength = [BitConverter]::ToUInt16($bytes, $offset + 32)
        $offset += 46 + $nameLength + $extraLength + $commentLength
    }

    [System.IO.File]::WriteAllBytes($Path, $bytes)
}

$infoPlist = @'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Codex Quota Bar</string>
  <key>CFBundleExecutable</key>
  <string>CodexQuotaBar</string>
  <key>CFBundleIdentifier</key>
  <string>com.codexquotabar.app</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>CodexQuotaBar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
'@

Reset-Directory $stagingDirectory
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Assert-RepositoryPath $archivePath
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

foreach ($architecture in @("arm64", "x64")) {
    $runtime = "osx-$architecture"
    $publishDirectory = Join-Path $publishRoot $runtime
    $contentsDirectory = Join-Path $packageDirectory "$architecture/CodexQuotaBar.app/Contents"
    $macOsDirectory = Join-Path $contentsDirectory "MacOS"
    $resourcesDirectory = Join-Path $contentsDirectory "Resources"

    Reset-Directory $publishDirectory
    New-Item -ItemType Directory -Path $macOsDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $resourcesDirectory -Force | Out-Null

    $publishArguments = @(
        "publish",
        $projectPath,
        "--configuration", $Configuration,
        "--runtime", $runtime,
        "--self-contained", "true",
        "--output", $publishDirectory,
        "-p:PublishSingleFile=true",
        "-p:IncludeNativeLibrariesForSelfExtract=false",
        "-p:DebugType=None",
        "-p:DebugSymbols=false"
    )

    & dotnet @publishArguments
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish for $runtime failed with exit code $LASTEXITCODE"
    }

    Get-ChildItem -LiteralPath $publishDirectory -Force | Copy-Item -Destination $macOsDirectory -Recurse -Force

    foreach ($library in @(
        "libAvaloniaNative.dylib",
        "libHarfBuzzSharp.dylib",
        "libSkiaSharp.dylib")) {
        $libraryPath = Join-Path $macOsDirectory $library
        if (-not (Test-Path -LiteralPath $libraryPath -PathType Leaf)) {
            throw "Required macOS native library is missing for ${runtime}: $library"
        }
    }

    [System.IO.File]::WriteAllText((Join-Path $contentsDirectory "Info.plist"), $infoPlist, $utf8WithoutBom)
}

Copy-Item -LiteralPath (Join-Path $repositoryRoot "README.md") -Destination (Join-Path $packageDirectory "README-zh-CN.md")

$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $baseDirectory = Split-Path -Parent $packageDirectory
    Get-ChildItem -LiteralPath $packageDirectory -File -Recurse | ForEach-Object {
        $relativePath = $_.FullName.Substring($baseDirectory.Length + 1).Replace("\", "/")
        $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $_.FullName,
            $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal)

        if ($relativePath -match "/Contents/MacOS/(CodexQuotaBar|.+\.dylib)$") {
            $entry.ExternalAttributes = -2115174400
        }
        else {
            $entry.ExternalAttributes = -2119958528
        }
    }
}
finally {
    $archive.Dispose()
}

Set-ZipUnixCreatorPlatform -Path $archivePath

Write-Host "Created macOS package: $archivePath"
