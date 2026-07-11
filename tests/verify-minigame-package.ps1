$ErrorActionPreference = 'Stop'
$expectedNames = @('MinigameBrief_v1.1.exe', 'README.md', 'UNITY_MINIGAME_MEMORY.md', 'VERIFICATION.md') | Sort-Object
$zipPath = Join-Path $PSScriptRoot '..\downloads\minigame-project-simulator-windows.zip'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('minigame-project-simulator-' + [Guid]::NewGuid().ToString('N'))

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $zipPath))
try {
    $actualNames = @($archive.Entries | ForEach-Object FullName | Sort-Object)
    if (Compare-Object $expectedNames $actualNames) { throw "ZIP entries do not match the approved four-file manifest." }
}
finally {
    $archive.Dispose()
}

try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $temp
    $hash = (Get-FileHash (Join-Path $temp 'MinigameBrief_v1.1.exe') -Algorithm SHA256).Hash
    $expectedHash = '985EC9017A2EF5900DD53F3E1C27CDFB7C66ABFCE404717039F96ED86FD3D86E'
    if ($hash -ne $expectedHash) { throw "EXE hash mismatch: $hash" }
    Write-Output "PASS package entries=4 exe_sha256=$hash"
}
finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
