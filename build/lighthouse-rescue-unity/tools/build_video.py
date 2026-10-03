"""Encode a captioned gameplay video from actual animated WebGL canvas capture."""

import argparse
import json
import subprocess
from pathlib import Path


def timecode(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}.{milliseconds:03}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    root = args.repo.resolve()
    scratch = root / ".superpowers/sdd/2026-10-03-lighthouse-pov-storm"
    capture = scratch / "gameplay.webm"
    markers_path = scratch / "gameplay.json"
    if not capture.is_file() or not markers_path.is_file():
        raise FileNotFoundError("Run tools/record_video.mjs against the current local WebGL build first")
    markers = json.loads(markers_path.read_text(encoding="utf-8"))
    audio = root / "build/lighthouse-rescue-unity/Assets/Resources/Audio"
    video = root / "projects/lighthouse-rescue/video"
    video.mkdir(parents=True, exist_ok=True)

    cues = [
        (0, markers["voting"], "免费上船，俯视航行并投票选路"),
        (markers["voting"], markers["checkpoint1"], "左边礁石短路，右边迷雾长路"),
        (markers["checkpoint1"], markers["checkpoint2"], "船上视角：照明寻找第一位落难者"),
        (markers["checkpoint2"], markers["checkpoint3"], "有效操作显示观众贡献，风雨雷电加剧"),
        (markers["checkpoint3"], 22.4, "第三段救援，探照灯穿过浪花"),
        (22.4, markers["result"], "带三个人冲回灯塔，准备结算"),
        (markers["result"], markers["result"] + 2.5, "结算看本局免费修理、照明与补光"),
    ]
    lines = ["WEBVTT", ""]
    for start, end, caption in cues:
        lines.extend([f"{timecode(start)} --> {timecode(end)}", caption, ""])
    (video / "lighthouse-demo.vtt").write_text("\n".join(lines), encoding="utf-8")

    def run(*command):
        subprocess.run([args.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *map(str, command)], check=True)

    thunder = audio / "Thunder.ogg"
    delay = [round((markers[f"checkpoint{i}"] + 0.26) * 1000) for i in (1, 2, 3)]
    filters = ["[1:a]volume=0.14[rain]"]
    for index, milliseconds in enumerate(delay, start=2):
        filters.append(f"[{index}:a]adelay={milliseconds},volume=0.25[t{index}]")
    filters.append("[rain][t2][t3][t4]amix=inputs=4:duration=first:normalize=0,alimiter=limit=0.85[aout]")
    run("-i", capture, "-stream_loop", "-1", "-i", audio / "StormRain.ogg",
        "-i", thunder, "-i", thunder, "-i", thunder,
        "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[aout]",
        "-vf", "scale=720:1280:flags=lanczos,fps=24,format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21",
        "-c:a", "aac", "-b:a", "112k", "-shortest", "-movflags", "+faststart",
        video / "lighthouse-demo.mp4")
    run("-ss", markers["checkpoint2"] + 1.5, "-i", video / "lighthouse-demo.mp4",
        "-frames:v", "1", "-update", "1", "-q:v", "2", video / "poster.jpg")
    run("-ss", markers["checkpoint2"] + 1.5, "-i", capture,
        "-vf", "crop=iw*0.85:ih*0.27:iw*0.075:ih*0.226,scale=1280:720:flags=lanczos",
        "-frames:v", "1", "-update", "1", "-c:v", "libwebp", "-q:v", "85",
        root / "assets/hub-showcase/lighthouse-rescue.webp")
    print("Lighthouse animated video:", (video / "lighthouse-demo.mp4").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
