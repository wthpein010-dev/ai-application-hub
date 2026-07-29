param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath(
    (Join-Path -Path $PSScriptRoot -ChildPath "..")
)
$entryPoint = Join-Path -Path $projectRoot -ChildPath "auto_clicker.py"
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) {
    throw "Cannot verify the ClickFlow project root: $projectRoot"
}

function Remove-ProjectPath {
    param([Parameter(Mandatory = $true)][string]$TargetPath)

    $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)
    $rootPrefix = $projectRoot.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTarget.StartsWith(
        $rootPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Refusing to remove a path outside the project: $resolvedTarget"
    }
    if (Test-Path -LiteralPath $resolvedTarget) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
}

function Compress-ArchiveWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    $lastError = $null
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            if (Test-Path -LiteralPath $DestinationPath) {
                Remove-Item -LiteralPath $DestinationPath -Force
            }
            Compress-Archive -LiteralPath $SourcePath -DestinationPath $DestinationPath -CompressionLevel Optimal
            return
        }
        catch {
            $lastError = $_
            if ($attempt -lt 10) {
                Start-Sleep -Milliseconds 500
            }
        }
    }
    throw $lastError
}

Push-Location -LiteralPath $projectRoot
try {
    $bootstrapPython = (Get-Command python -ErrorAction Stop).Source
    $hostArchitecture = (& $bootstrapPython -c "import platform; print(platform.machine())").Trim()
    if ($hostArchitecture -notin @("AMD64", "x86_64")) {
        throw "Windows x64 requires AMD64 Python; found: $hostArchitecture"
    }

    $venvPath = Join-Path -Path $projectRoot -ChildPath ".venv-build-windows"
    $buildPython = Join-Path -Path $venvPath -ChildPath "Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $buildPython -PathType Leaf)) {
        & $bootstrapPython -m venv $venvPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create the Windows build environment."
        }
    }

    if (-not $SkipInstall) {
        & $buildPython -m pip install --disable-pip-version-check -r requirements-build.txt
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install Windows build dependencies."
        }
    }

    & $buildPython -m py_compile auto_clicker.py clickflow_input.py clickflow_core.py clickflow_theme.py
    if ($LASTEXITCODE -ne 0) {
        throw "Python syntax validation failed."
    }
    & $buildPython -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        throw "Automated tests failed; stopping the build."
    }

    Remove-ProjectPath (Join-Path -Path $projectRoot -ChildPath "build")
    Remove-ProjectPath (Join-Path -Path $projectRoot -ChildPath "dist")

    & $buildPython -m PyInstaller --clean --noconfirm ClickFlow.spec
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller build failed."
    }

    $exePath = Join-Path -Path $projectRoot -ChildPath "dist\ClickFlow.exe"
    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        throw "The build finished without dist\ClickFlow.exe."
    }

    $process = Start-Process -FilePath $exePath -PassThru -WindowStyle Hidden
    try {
        Start-Sleep -Seconds 3
        if ($process.HasExited) {
            throw "ClickFlow.exe exited early with code $($process.ExitCode)."
        }
    }
    finally {
        if (-not $process.HasExited) {
            & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to stop the ClickFlow smoke-test process tree."
            }
            $process.WaitForExit(5000) | Out-Null
        }
    }

    $releaseRoot = Join-Path -Path $projectRoot -ChildPath "release"
    $staging = Join-Path -Path $releaseRoot -ChildPath "ClickFlow-Windows-x64"
    $archive = Join-Path -Path $releaseRoot -ChildPath "ClickFlow-Windows-x64.zip"
    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    Remove-ProjectPath $staging
    if (Test-Path -LiteralPath $archive) {
        Remove-Item -LiteralPath $archive -Force
    }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    Copy-Item -LiteralPath $exePath -Destination (Join-Path $staging "ClickFlow.exe")
    Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\README-Windows.txt") -Destination $staging
    Compress-ArchiveWithRetry -SourcePath $staging -DestinationPath $archive

    Write-Host "Windows package created: $archive"
}
finally {
    Pop-Location
}
