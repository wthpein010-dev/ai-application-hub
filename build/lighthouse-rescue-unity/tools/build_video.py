"""Cut an honest, captioned stage recap from screenshots captured by the Windows player."""

import argparse
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    root = args.repo.resolve()
    scratch = root / ".superpowers/sdd/2026-09-29-lighthouse-rescue"
    short = scratch / "release-short-capture"
    long = scratch / "release-long-capture"
    frames = [short / f"short-0{i}-{name}.png" for i, name in [
        (1, "gathering"), (2, "voting"), (3, "checkpoint")]]
    frames += [long / "long-03-checkpoint.png"]
    frames += [short / f"short-0{i}-{name}.png" for i, name in [
        (4, "checkpoint"), (5, "checkpoint"), (6, "finale"), (7, "result")]]
    for frame in frames:
        if not frame.is_file():
            raise FileNotFoundError(frame)
    video = root / "projects/lighthouse-rescue/video"
    video.mkdir(parents=True, exist_ok=True)
    concat = scratch / "video-concat.txt"
    lines = []
    for frame in frames:
        lines.extend([f"file '{frame.as_posix()}'", "duration 4"])
    lines.append(f"file '{frames[-1].as_posix()}'")
    concat.write_text("\n".join(lines) + "\n", encoding="utf-8")
    cues = [
        "目标：三段救援，把三个人带回灯塔",
        "先免费上船，再投票选择短路或长路",
        "礁石短路更快，修理目标更高",
        "迷雾长路更慢，需要更多照明",
        "每段先有系统值守，免费指令补足缺口",
        "修理保船，照明救人；点赞也能补光",
        "三段结束后冲向灯塔，准备结算",
        "本局救起三人；礼物只作外观",
    ]
    vtt = ["WEBVTT", ""]
    for i, caption in enumerate(cues):
        vtt.extend([f"00:00:{4*i:02}.000 --> 00:00:{4*(i+1):02}.000", caption, ""])
    (video / "lighthouse-demo.vtt").write_text("\n".join(vtt), encoding="utf-8")

    def run(*command):
        subprocess.run([args.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *map(str, command)], check=True)

    run("-f", "concat", "-safe", "0", "-i", concat,
        "-vf", "scale=720:1280:flags=lanczos,fps=24,format=yuv420p", "-t", "32",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-movflags", "+faststart",
        video / "lighthouse-demo.mp4")
    run("-i", frames[-1], "-vf", "scale=720:1280:flags=lanczos", "-frames:v", "1", "-q:v", "2", video / "poster.jpg")
    run("-i", frames[2], "-vf", "crop=1080:608:0:438,scale=1280:720:flags=lanczos",
        "-frames:v", "1", "-c:v", "libwebp", "-q:v", "85", root / "assets/hub-showcase/lighthouse-rescue.webp")
    print("Lighthouse video:", (video / "lighthouse-demo.mp4").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
