param(
    [string]$RepositoryRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$VoiceName = 'Microsoft Huihui Desktop'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

function Find-Tool([string]$name) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if (-not $candidate) { throw "$name.exe not found. Install Gyan.FFmpeg with WinGet." }
    return $candidate
}

$ffmpeg = Find-Tool 'ffmpeg'
$ffprobe = Find-Tool 'ffprobe'
$projectName = -join (67, 111, 100, 101, 120, 23545, 35805, 35780, 20998, 24037, 20855 | ForEach-Object { [char]$_ })
$assetName = -join (35270, 39057, 36164, 28304 | ForEach-Object { [char]$_ })
$projectDir = Join-Path (Join-Path $RepositoryRoot 'projects') $projectName
$videoDir = Join-Path $projectDir $assetName
$frameDir = Join-Path $videoDir 'frames'
$timelinePath = Join-Path $RepositoryRoot 'scripts\codex-reviewer-video-script.json'
$caption = Join-Path $videoDir 'codex-reviewer-intro.vtt'
if (-not (Test-Path -LiteralPath $timelinePath)) { throw "Missing video timeline: $timelinePath" }
if (-not (Test-Path -LiteralPath $caption)) { throw "Missing video captions: $caption" }
$timeline = Get-Content -Raw -Encoding UTF8 $timelinePath | ConvertFrom-Json
$output = Join-Path $videoDir 'codex-reviewer-intro.mp4'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('codex-reviewer-video-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null

try {
    $concatLines = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $timeline.Count; $i++) {
        $item = $timeline[$i]
        $frame = Join-Path $frameDir $item.frame
        if (-not (Test-Path -LiteralPath $frame)) { throw "Missing video frame: $frame" }

        $speechPath = Join-Path $temp ("speech-{0:D2}.wav" -f $i)
        $audioPath = Join-Path $temp ("audio-{0:D2}.wav" -f $i)
        $segmentPath = Join-Path $temp ("segment-{0:D2}.mp4" -f $i)
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $synth.SelectVoice($VoiceName)
        $synth.Rate = -1
        $synth.Volume = 100
        $synth.SetOutputToWaveFile($speechPath)
        $synth.Speak([string]$item.narration)
        $synth.Dispose()

        & $ffmpeg -y -loglevel error -i $speechPath -af 'apad' -t ([string]$item.duration) -ar 48000 -ac 2 $audioPath
        if ($LASTEXITCODE -ne 0) { throw "Unable to pad narration for $($item.id)" }

        $frames = [int]$item.duration * 30
        $filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x07111f,zoompan=z='min(zoom+0.00008,1.018)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30,format=yuv420p"
        & $ffmpeg -y -loglevel error -loop 1 -i $frame -i $audioPath -t ([string]$item.duration) -vf $filter -r 30 -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -shortest $segmentPath
        if ($LASTEXITCODE -ne 0) { throw "Unable to render segment $($item.id)" }
        $concatLines.Add("file '$($segmentPath.Replace("'", "''"))'")
    }

    $concatPath = Join-Path $temp 'segments.txt'
    $joinedPath = Join-Path $temp 'joined.mp4'
    $finalPath = Join-Path $temp 'final.mp4'
    [IO.File]::WriteAllLines($concatPath, $concatLines, [Text.UTF8Encoding]::new($false))
    & $ffmpeg -y -loglevel error -f concat -safe 0 -i $concatPath -c copy $joinedPath
    if ($LASTEXITCODE -ne 0) { throw 'Unable to concatenate video segments' }

    Push-Location $videoDir
    try {
        & $ffmpeg -y -loglevel error -i $joinedPath -vf "subtitles=codex-reviewer-intro.vtt:force_style='FontName=Microsoft YaHei,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=48,Alignment=2'" -c:v libx264 -preset medium -crf 21 -c:a copy -movflags +faststart $finalPath
        if ($LASTEXITCODE -ne 0) { throw 'Unable to burn captions into final video' }
    } finally {
        Pop-Location
    }

    $decodeErrors = @(& $ffmpeg -v error -i $finalPath -f null - 2>&1)
    if ($LASTEXITCODE -ne 0 -or $decodeErrors.Count -gt 0) {
        $firstError = $decodeErrors | Select-Object -First 1
        throw "Final video failed decode validation: $firstError"
    }
    Move-Item -LiteralPath $finalPath -Destination $output -Force

    $probe = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $output
    Write-Output "PASS video=$output duration=$probe seconds voice=$VoiceName"
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
