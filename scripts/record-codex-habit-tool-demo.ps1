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
    if (-not $candidate) { throw "$name.exe not found." }
    return $candidate
}

$ffmpeg = Find-Tool 'ffmpeg'
$ffprobe = Find-Tool 'ffprobe'
$videoDir = Join-Path $RepositoryRoot 'videos'
$timeline = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'codex-habit-tool-video-script.json') | ConvertFrom-Json
$frame = Join-Path $videoDir 'codex-habit-tool-frame.png'
$caption = Join-Path $videoDir 'codex-habit-tool-demo.vtt'
$output = Join-Path $videoDir 'codex-habit-tool-demo.mp4'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('codex-habit-tool-video-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null

try {
    $segments = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $timeline.Count; $i++) {
        $item = $timeline[$i]
        $speech = Join-Path $temp ("speech-{0:D2}.wav" -f $i)
        $audio = Join-Path $temp ("audio-{0:D2}.wav" -f $i)
        $segment = Join-Path $temp ("segment-{0:D2}.mp4" -f $i)
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $synth.SelectVoice($VoiceName)
        $synth.Rate = -1
        $synth.Volume = 100
        $synth.SetOutputToWaveFile($speech)
        $synth.Speak([string]$item.narration)
        $synth.Dispose()
        & $ffmpeg -y -loglevel error -i $speech -af 'apad' -t ([string]$item.duration) -ar 48000 -ac 2 $audio
        if ($LASTEXITCODE -ne 0) { throw "Unable to prepare narration $($item.id)" }
        $frames = [int]$item.duration * 30
        $zoom = 1.012 + ($i * 0.003)
        $filter = "scale=1660:980:force_original_aspect_ratio=decrease,pad=1660:980:(ow-iw)/2:(oh-ih)/2:color=0x0c1523,zoompan=z='min(zoom+0.00006,$zoom)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30,format=yuv420p"
        & $ffmpeg -y -loglevel error -loop 1 -i $frame -i $audio -t ([string]$item.duration) -vf $filter -r 30 -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -shortest $segment
        if ($LASTEXITCODE -ne 0) { throw "Unable to render segment $($item.id)" }
        $segments.Add("file '$($segment.Replace("'", "''"))'")
    }
    $concat = Join-Path $temp 'segments.txt'
    $joined = Join-Path $temp 'joined.mp4'
    [IO.File]::WriteAllLines($concat, $segments, [Text.UTF8Encoding]::new($false))
    & $ffmpeg -y -loglevel error -f concat -safe 0 -i $concat -c copy $joined
    if ($LASTEXITCODE -ne 0) { throw 'Unable to join video segments' }
    Push-Location $videoDir
    try {
        & $ffmpeg -y -loglevel error -i $joined -vf "subtitles=codex-habit-tool-demo.vtt:force_style='FontName=Microsoft YaHei,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=48,Alignment=2'" -c:v libx264 -preset medium -crf 21 -c:a copy -movflags +faststart $output
        if ($LASTEXITCODE -ne 0) { throw 'Unable to burn subtitles' }
    } finally { Pop-Location }
    & $ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height -of json $output
} finally {
    if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
