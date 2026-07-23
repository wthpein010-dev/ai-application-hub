[CmdletBinding()]
param(
    [string]$LevelDir = 'E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels',
    [string]$BlockAssetDir = 'E:\Mahjong\PawsHomeClient\Assets\SheepLevelEditor\Resources\SheepLevelEditor\Blocks',
    [string]$DefaultLevel = 'level_0021_r2_第二关模板12.json',
    [Alias('Host')]
    [string]$HostAddress = '0.0.0.0',
    [ValidateRange(1, 65535)]
    [int]$Port = 8090
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serverEntry = Join-Path $repositoryRoot 'tools\paws-level-editor-lan\server.mjs'

if (-not (Test-Path -LiteralPath $LevelDir -PathType Container)) {
    throw "Level directory does not exist: $LevelDir"
}
if (-not (Test-Path -LiteralPath $BlockAssetDir -PathType Container)) {
    throw "Block asset directory does not exist: $BlockAssetDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $LevelDir $DefaultLevel) -PathType Leaf)) {
    throw "Default level does not exist: $DefaultLevel"
}
if (-not (Test-Path -LiteralPath $serverEntry -PathType Leaf)) {
    throw "LAN server entry does not exist: $serverEntry"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer was not found.'
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required; found $(& node --version)."
}

$passwordWasProvided = -not [string]::IsNullOrEmpty($env:WORKBENCH_PASSWORD)
$plainPassword = $null
if (-not $passwordWasProvided) {
    $securePassword = Read-Host 'Set the write password for this workbench session' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ([string]::IsNullOrEmpty($plainPassword)) {
        throw 'The write password cannot be empty.'
    }
    $env:WORKBENCH_PASSWORD = $plainPassword
}

$previous = @{
    PAWS_LEVEL_DIR = $env:PAWS_LEVEL_DIR
    PAWS_BLOCK_ASSET_DIR = $env:PAWS_BLOCK_ASSET_DIR
    PAWS_DEFAULT_LEVEL = $env:PAWS_DEFAULT_LEVEL
    WORKBENCH_HOST = $env:WORKBENCH_HOST
    WORKBENCH_PORT = $env:WORKBENCH_PORT
}

try {
    $env:PAWS_LEVEL_DIR = (Resolve-Path -LiteralPath $LevelDir).Path
    $env:PAWS_BLOCK_ASSET_DIR = (Resolve-Path -LiteralPath $BlockAssetDir).Path
    $env:PAWS_DEFAULT_LEVEL = $DefaultLevel
    $env:WORKBENCH_HOST = $HostAddress
    $env:WORKBENCH_PORT = [string]$Port

    Write-Host ''
    Write-Host 'Paws LAN Level Workbench is starting' -ForegroundColor Green
    Write-Host "Local: http://127.0.0.1:$Port"
    Write-Host 'LAN URLs (trusted private networks only):' -ForegroundColor Cyan
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Select-Object -ExpandProperty IPAddress -Unique |
        ForEach-Object { Write-Host "      http://$($_):$Port" }
    Write-Host 'Delete moves JSON and .meta into EditorLevels\_Trash; restore is available in the page.'
    Write-Host 'Press Ctrl+C to stop the service.'
    Write-Host ''

    Push-Location $repositoryRoot
    try {
        & node $serverEntry
        if ($LASTEXITCODE -ne 0) {
            throw "The LAN server exited with code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    foreach ($name in $previous.Keys) {
        if ($null -eq $previous[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item "Env:$name" $previous[$name]
        }
    }
    if (-not $passwordWasProvided) {
        Remove-Item Env:WORKBENCH_PASSWORD -ErrorAction SilentlyContinue
    }
    $plainPassword = $null
}
