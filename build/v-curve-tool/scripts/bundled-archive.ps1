param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Compress", "Expand")]
    [string]$Mode,

    [Parameter(Mandatory = $true)]
    [string]$Source,

    [Parameter(Mandatory = $true)]
    [string]$Destination
)

$ErrorActionPreference = "Stop"
$sourcePath = [System.IO.Path]::GetFullPath($Source)
$destinationPath = [System.IO.Path]::GetFullPath($Destination)

if ($Mode -eq "Compress") {
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
        throw "待压缩目录不存在：$sourcePath"
    }
    Compress-Archive -LiteralPath $sourcePath -DestinationPath $destinationPath -CompressionLevel Optimal -Force
    exit 0
}

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "待解压文件不存在：$sourcePath"
}
Expand-Archive -LiteralPath $sourcePath -DestinationPath $destinationPath -Force
