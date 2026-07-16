from __future__ import annotations

import html
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = Path(r"C:\Users\ASUS\AppData\Local\Temp\ai-hub-video-captures")
FFMPEG = Path(r"C:\Users\ASUS\AppData\Local\kzip_sogou\ffmpeg.exe")
FONT = Path(r"C:\Windows\Fonts\msyh.ttc")
SIZE = (1280, 720)
FPS = 10
SLIDE_SECONDS = 8


def entities(value: str) -> str:
    escaped = html.escape(value, quote=True)
    return "".join(character if ord(character) < 128 else f"&#{ord(character)};" for character in escaped)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), size, index=1 if bold else 0)


def wrap(draw: ImageDraw.ImageDraw, value: str, typeface: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for character in value:
        candidate = current + character
        if current and draw.textlength(candidate, font=typeface) > width:
            lines.append(current)
            current = character
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped(draw: ImageDraw.ImageDraw, value: str, x: int, y: int, width: int, typeface: ImageFont.FreeTypeFont, color: str, spacing: int = 12) -> int:
    lines = wrap(draw, value, typeface, width)
    line_height = typeface.size + spacing
    for index, line in enumerate(lines):
        draw.text((x, y + index * line_height), line, fill=color, font=typeface)
    return y + max(1, len(lines)) * line_height


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str | None = None, radius: int = 8) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2 if outline else 1)


def screenshot_panel(capture_name: str) -> Image.Image:
    if capture_name == "icecream":
        image = Image.new("RGB", (690, 388), "#fff7ed")
        draw = ImageDraw.Draw(image)
        rounded(draw, (22, 22, 668, 366), "#fffdf8", "#eabf8d")
        draw.text((52, 48), "ORDER  Strawberry + Vanilla", font=font(26, True), fill="#7c2d12")
        for x, color in ((118, "#fda4af"), (262, "#fde68a"), (406, "#86efac")):
            draw.polygon([(x + 22, 250), (x + 86, 250), (x + 54, 334)], fill="#d97706")
            draw.ellipse((x, 174, x + 108, 276), fill=color, outline="#9a3412", width=3)
        draw.text((70, 116), "Pick a flavor, make the cone, finish the order.", font=font(20), fill="#9a3412")
        return image
    if capture_name == "vita-mahjong":
        image = Image.new("RGB", (690, 388), "#1b2735")
        draw = ImageDraw.Draw(image)
        rounded(draw, (22, 22, 668, 366), "#233b4d", "#4f748a")
        draw.text((46, 46), "MATCH TILES", font=font(28, True), fill="#f8fafc")
        for index, (x, y, color) in enumerate(((90, 132, "#f3bd55"), (218, 132, "#58cbb3"), (346, 132, "#f3bd55"), (474, 132, "#ef8f73"))):
            rounded(draw, (x, y, x + 86, y + 100), color, "#f8fafc")
            draw.text((x + 28, y + 30), str(index + 1), font=font(32, True), fill="#18202e")
        draw.text((72, 290), "Match the same tiles before the slots fill up.", font=font(20), fill="#dbeafe")
        return image
    source = CAPTURE_DIR / f"{capture_name}.png"
    if source.exists():
        with Image.open(source) as image:
            return ImageOps.fit(image.convert("RGB"), (690, 388), method=Image.Resampling.LANCZOS)

    image = Image.new("RGB", (690, 388), "#1b2638")
    draw = ImageDraw.Draw(image)
    rounded(draw, (18, 18, 672, 370), "#233552", "#3b557b")
    draw.text((54, 74), "Web / Windows / Mac", font=font(34, True), fill="#f7fafc")
    draw.text((54, 132), "Open the project page to begin.", font=font(23), fill="#cbd5e1")
    return image


def render_slide(project: dict, slide_index: int, heading: str, copy: str) -> Image.Image:
    image = Image.new("RGB", SIZE, "#101827")
    draw = ImageDraw.Draw(image)
    accent = project["accent"]
    muted = "#aebdce"

    draw.rectangle((0, 0, SIZE[0], 12), fill=accent)
    draw.text((60, 42), "AI APPLICATION HUB  /  TUTORIAL", font=font(18, True), fill=accent)
    draw.text((60, 78), project["name"], font=font(46, True), fill="#f8fafc")
    draw.text((1134, 46), f"{slide_index + 1}/4", font=font(22, True), fill="#d7e0eb")

    panel = screenshot_panel(project["capture"])
    rounded(draw, (58, 176, 752, 570), "#172234", "#2b3d57")
    image.paste(panel, (60, 178))

    rounded(draw, (790, 176, 1220, 570), "#172234", "#2b3d57")
    draw.text((826, 220), heading, font=font(34, True), fill="#f8fafc")
    next_y = draw_wrapped(draw, copy, 826, 286, 350, font(24), muted, 16)
    draw.line((826, min(next_y + 24, 484), 1168, min(next_y + 24, 484)), fill="#39506e", width=2)
    draw.text((826, min(next_y + 52, 516)), "打开网页，按页面提示体验。", font=font(20), fill=accent)

    rounded(draw, (60, 616, 1220, 666), "#172234", "#2b3d57")
    draw.text((84, 630), "介绍视频：支持 Windows 与 Mac 浏览器播放", font=font(18, True), fill="#dce7f2")
    draw.text((1024, 630), "全部项目总览", font=font(18, True), fill=accent)
    return image


def encode(project: dict) -> None:
    output = ROOT / project["mp4"]
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "1280x720",
        "-framerate", str(FPS), "-i", "pipe:0", "-an", "-c:v", "libx264",
        "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    slides = [
        ("这是一个什么项目", project["summary"]),
        ("第 1 步", project["steps"][0]),
        ("第 2 步", project["steps"][1]),
        ("完成体验", project["steps"][2]),
    ]
    assert process.stdin is not None
    for index, (heading, copy) in enumerate(slides):
        frame = render_slide(project, index, heading, copy).tobytes()
        for _ in range(FPS * SLIDE_SECONDS):
            process.stdin.write(frame)
    process.stdin.close()
    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
    if process.wait() != 0:
        raise RuntimeError(stderr or f"Unable to encode {output}")


def player_page(project: dict) -> str:
    title = entities(f"{project['name']}教学视频")
    summary = entities(project["player_summary"])
    badge = entities(project["badge"])
    video_id = project.get("video_id", "introVideo")
    track = ""
    if project.get("vtt"):
        track = f"\n          <track kind=\"subtitles\" srclang=\"zh-CN\" label=\"Chinese\" src=\"{project['vtt']}\" default />\n        "
    return f"""<!doctype html>
<html lang=\"zh-CN\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{title}</title>
    <style>
      :root {{ --page: #101827; --panel: #172234; --line: #2b3d57; --text: #f8fafc; --muted: #aebdce; --accent: {project['accent']}; }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; min-width: 320px; overflow-x: hidden; color: var(--text); background: var(--page); font-family: \"Microsoft YaHei\", \"PingFang SC\", \"Segoe UI\", Arial, sans-serif; }}
      .back {{ position: fixed; top: 16px; left: 16px; z-index: 2; display: inline-flex; min-height: 38px; align-items: center; padding: 0 13px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); background: #172234; font-size: 14px; font-weight: 800; text-decoration: none; }}
      main {{ width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 84px 0 44px; }}
      .eyebrow {{ margin: 0 0 12px; color: var(--accent); font-size: 13px; font-weight: 900; }}
      h1 {{ max-width: 760px; margin: 0; font-size: clamp(30px, 5vw, 52px); line-height: 1.12; letter-spacing: 0; }}
      .intro {{ max-width: 700px; margin: 14px 0 22px; color: var(--muted); line-height: 1.75; }}
      .player {{ overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }}
      .load-card {{ display: grid; min-height: 420px; place-content: center; gap: 14px; padding: 28px; text-align: center; }}
      .load-card strong {{ font-size: 24px; }}
      .load-card p {{ max-width: 440px; margin: 0; color: var(--muted); line-height: 1.7; }}
      button {{ min-height: 44px; padding: 0 17px; border: 0; border-radius: 8px; color: #101827; background: var(--accent); font: inherit; font-weight: 900; cursor: pointer; }}
      video {{ display: block; width: 100%; aspect-ratio: 16 / 9; background: #060b13; }}
      [hidden] {{ display: none !important; }}
      .links {{ display: flex; flex-wrap: wrap; gap: 14px; margin-top: 18px; }}
      .links a {{ color: var(--muted); font-size: 14px; text-decoration: none; }}
      .links a:hover, .back:hover {{ color: var(--accent); }}
      @media (max-width: 560px) {{ main {{ width: min(100% - 24px, 980px); padding-top: 78px; }} .back {{ top: 12px; left: 12px; }} .load-card {{ min-height: 280px; }} }}
    </style>
  </head>
  <body>
    <a class=\"back\" href=\"{project['home_href']}\">&#36820;&#22238;&#20027;&#39029;</a>
    <main>
      <p class=\"eyebrow\">{badge}</p>
      <h1>{title}</h1>
      <p class=\"intro\">{summary}</p>
      <section class=\"player\" aria-label=\"tutorial video player\">
        <div class=\"load-card\" id=\"loadCard\">
          <strong>&#20934;&#22791;&#25773;&#25918;&#25945;&#23398;&#35270;&#39057;</strong>
          <p>&#39029;&#38754;&#20808;&#36731;&#37327;&#25171;&#24320;&#65292;&#28857;&#20987;&#21518;&#25165;&#21152;&#36733; MP4&#65292;&#32593;&#32476;&#36739;&#24930;&#26102;&#20063;&#33021;&#20808;&#30475;&#21040;&#20837;&#21475;&#12290;</p>
          <button id=\"loadVideo\" type=\"button\">&#21152;&#36733;&#24182;&#25773;&#25918;&#35270;&#39057;</button>
        </div>
        <video id=\"{video_id}\" controls playsinline preload=\"none\" data-src=\"{project['mp4_name']}\" hidden>{track}</video>
      </section>
      <nav class=\"links\" aria-label=\"related links\">
        <a href=\"{project['mp4_name']}\">&#30452;&#25509;&#25171;&#24320; MP4</a>
        <a href=\"{project['entry_href']}\">&#25171;&#24320;&#24212;&#29992;</a>
        <a href=\"{project['home_href']}\">&#36820;&#22238;&#20840;&#37096;&#39033;&#30446;&#24635;&#35272;</a>
      </nav>
    </main>
    <script>
      const video = document.querySelector('#{video_id}');
      const loadButton = document.querySelector('#loadVideo');
      const loadCard = document.querySelector('#loadCard');
      loadButton.addEventListener('click', () => {{
        if (!video.src) video.src = video.dataset.src;
        loadCard.hidden = true;
        video.hidden = false;
        video.play().catch(() => video.load());
      }}, {{ once: true }});
    </script>
  </body>
</html>
"""


VIDEO_PROJECTS = [
    {
        "name": "IceCream \u51b0\u6fc0\u51cc\u5de5\u574a",
        "capture": "icecream",
        "mp4": "projects/icecream/video/icecream-tutorial.mp4",
        "page": "projects/icecream/video/index.html",
        "mp4_name": "./icecream-tutorial.mp4",
        "entry_href": "../index.html",
        "home_href": "../../../index.html#games",
        "badge": "\u5c0f\u6e38\u620f\u6559\u5b66\u89c6\u9891",
        "player_summary": "\u4ece\u9009\u62e9\u53e3\u5473\u5230\u5b8c\u6210\u751c\u7b52\uff0c\u5feb\u901f\u4e86\u89e3\u7ad6\u5c4f\u51b0\u6fc0\u51cc\u914d\u5355\u5173\u5361\u7684\u4f53\u9a8c\u65b9\u5f0f\u3002",
        "summary": "\u4e00\u6b3e\u6309\u987e\u5ba2\u9700\u6c42\u9009\u62e9\u53e3\u5473\u3001\u5236\u4f5c\u751c\u7b52\u5e76\u8fde\u7eed\u901a\u5173\u7684\u7ad6\u5c4f\u5c0f\u6e38\u620f\u3002",
        "steps": ["\u6253\u5f00\u5de5\u7a0b\u4f53\u9a8c\u9875\uff0c\u5148\u67e5\u770b\u5f53\u524d\u987e\u5ba2\u7684\u914d\u5355\u8981\u6c42\u3002", "\u6839\u636e\u8ba2\u5355\u9009\u62e9\u51b0\u6fc0\u51cc\u53e3\u5473\u4e0e\u751c\u7b52\uff0c\u5b8c\u6210\u5f53\u524d\u5173\u5361\u3002", "\u6309\u987a\u5e8f\u7ee7\u7eed\u95ef\u5173\uff0c\u8fd9\u4e2a\u7248\u672c\u5305\u542b 10 \u4e2a\u53ef\u4f53\u9a8c\u5173\u5361\u3002"],
        "accent": "#f3bd55",
    },
    {
        "name": "\u7f8a\u4e86\u4e2a\u7f8a\uff1a\u5bf9\u5bf9\u78b0",
        "capture": "vita-mahjong",
        "mp4": "projects/vita-mahjong/video/vita-mahjong-tutorial.mp4",
        "page": "projects/vita-mahjong/video/index.html",
        "mp4_name": "./vita-mahjong-tutorial.mp4",
        "entry_href": "../index.html",
        "home_href": "../../../index.html#engineering",
        "badge": "AI\u7248\u5c0f\u6e38\u620f\u6559\u5b66",
        "player_summary": "\u4e86\u89e3\u65b9\u5757\u5339\u914d\u3001\u69fd\u4f4d\u7ba1\u7406\u548c\u9053\u5177\u4f7f\u7528\u7684\u57fa\u672c\u6d41\u7a0b\u3002",
        "summary": "\u4ee5\u62df\u4eba\u65b9\u5757\u3001\u69fd\u4f4d\u3001\u9053\u5177\u548c\u57ce\u5e02\u7f8a\u7fa4\u5305\u88c5\u7684 H5 \u5339\u914d\u6d88\u9664\u539f\u578b\u3002",
        "steps": ["\u6253\u5f00 H5 \u4f53\u9a8c\u5165\u53e3\uff0c\u89c2\u5bdf\u5f53\u524d\u65b9\u5757\u4e0e\u69fd\u4f4d\u4f59\u91cf\u3002", "\u70b9\u51fb\u76f8\u540c\u65b9\u5757\u8fdb\u5165\u69fd\u4f4d\uff0c\u51d1\u9f50\u5339\u914d\u540e\u5373\u53ef\u6d88\u9664\u3002", "\u69fd\u4f4d\u7d27\u5f20\u65f6\u4f7f\u7528\u9053\u5177\uff0c\u4fdd\u6301\u6d88\u9664\u8282\u594f\u7ee7\u7eed\u95ef\u5173\u3002"],
        "accent": "#f3bd55",
    },
    {
        "name": "\u88c5\u4e86\u4e2a\u5565",
        "capture": "zhuanglege-sha",
        "mp4": "projects/zhuanglege-sha/video/zhuanglege-sha-tutorial.mp4",
        "page": "projects/zhuanglege-sha/video/index.html",
        "mp4_name": "./zhuanglege-sha-tutorial.mp4",
        "entry_href": "../index.html",
        "home_href": "../../../index.html#games",
        "badge": "\u5c0f\u6e38\u620f\u6559\u5b66\u89c6\u9891",
        "player_summary": "\u5b66\u4f1a\u5207\u6362\u89c2\u5bdf\u89c6\u56fe\uff0c\u5224\u65ad\u884c\u674e\u662f\u5426\u53ef\u4ee5\u653e\u884c\u3002",
        "summary": "\u4e00\u6b3e\u4ee5\u673a\u573a\u5b89\u68c0\u5ba1\u6838\u4e3a\u9898\u6750\u7684\u7ad6\u5c4f\u95ef\u5173\u6e38\u620f\uff0c\u6839\u636e\u884c\u674e\u5185\u7269\u54c1\u4f5c\u51fa\u653e\u884c\u5224\u65ad\u3002",
        "steps": ["\u6253\u5f00\u5173\u5361\uff0c\u5148\u67e5\u770b\u884c\u674e\u5916\u89c2\u4e0e\u5f53\u524d\u5ba1\u6838\u63d0\u793a\u3002", "\u5207\u6362\u666e\u901a\u3001X \u5149\u548c\u8f6e\u5ed3\u89c6\u56fe\uff0c\u5bf9\u6bd4\u7406\u89e3\u884c\u674e\u5185\u5bb9\u3002", "\u6839\u636e\u5ba1\u6838\u7ed3\u679c\u9009\u62e9\u653e\u884c\u6216\u62e6\u622a\uff0c\u5b8c\u6210\u5f53\u524d\u95ef\u5173\u5224\u65ad\u3002"],
        "accent": "#e78352",
    },
    {
        "name": "\u7f8a\u4e86\u4e2a\u7f8a\uff1a\u78b0\u78b0\u6d88",
        "capture": "paws-home-client",
        "mp4": "projects/paws-home-client/video/paws-home-client-tutorial.mp4",
        "page": "projects/paws-home-client/video/index.html",
        "mp4_name": "./paws-home-client-tutorial.mp4",
        "entry_href": "../index.html",
        "home_href": "../../../index.html#engineering",
        "badge": "\u5de5\u7a0b\u5728\u7ebf\u4f53\u9a8c",
        "player_summary": "\u4e3a\u9879\u76ee\u7ec4\u6253\u5305\u6d4b\u8bd5\u51c6\u5907\uff0c\u7528\u4e8e\u5feb\u901f\u68c0\u67e5 WebGL \u52a0\u8f7d\u4e0e\u6d4f\u89c8\u5668\u8fd0\u884c\u3002",
        "summary": "\u9879\u76ee\u7ec4\u6253\u5305\u7684 WebGL \u5185\u90e8\u4f53\u9a8c\u5165\u53e3\uff0c\u4f9b\u5728\u7ebf\u68c0\u67e5\u6e38\u620f\u5305\u7684\u52a0\u8f7d\u72b6\u6001\u548c\u57fa\u672c\u8fd0\u884c\u8868\u73b0\u3002",
        "steps": ["\u6253\u5f00\u5de5\u7a0b WebGL \u4f53\u9a8c\u9875\uff0c\u5148\u7b49\u5f85\u8d44\u6e90\u52a0\u8f7d\u5b8c\u6210\u3002", "\u8fdb\u5165\u6e38\u620f\u540e\u8fdb\u884c\u57fa\u672c\u5339\u914d\u64cd\u4f5c\uff0c\u89c2\u5bdf\u8fd0\u884c\u4e0e\u54cd\u5e94\u60c5\u51b5\u3002", "\u5b8c\u6210\u4f53\u9a8c\u540e\u8fd4\u56de\u4e3b\u9875\uff0c\u7ee7\u7eed\u68c0\u67e5\u5176\u4ed6\u9879\u76ee\u5165\u53e3\u3002"],
        "accent": "#f3bd55",
    },
    {
        "name": "\u7bb1\u4e86\u4e2a\u7bb1",
        "capture": "xiang-le-ge-xiang",
        "mp4": "projects/xiang-le-ge-xiang/video/xiang-le-ge-xiang-tutorial.mp4",
        "page": "projects/xiang-le-ge-xiang/video/index.html",
        "mp4_name": "./xiang-le-ge-xiang-tutorial.mp4",
        "entry_href": "../index.html",
        "home_href": "../../../index.html#games",
        "badge": "\u5c0f\u6e38\u620f\u6559\u5b66\u89c6\u9891",
        "player_summary": "\u770b\u61c2\u57fa\u7840\u63a8\u7bb1\u89c4\u5219\uff0c\u5e76\u4f53\u9a8c\u7b2c\u4e8c\u5173\u7684\u5730\u56fe\u53d8\u5316\u3002",
        "summary": "\u4e00\u6b3e\u53ea\u6709\u4e24\u5173\u7684\u7ad6\u5c4f\u63a8\u7bb1\u5b50\u539f\u578b\uff0c\u4ece\u4e00\u63a8\u5373\u8fc7\u5230\u7b2c\u4e8c\u5173\u7684\u5927\u5730\u56fe\u89c6\u91ce\u3002",
        "steps": ["\u6253\u5f00\u6e38\u620f\uff0c\u8bc6\u522b\u7bb1\u5b50\u3001\u76ee\u6807\u70b9\u4e0e\u89d2\u8272\u7684\u521d\u59cb\u4f4d\u7f6e\u3002", "\u70b9\u51fb\u6216\u6ed1\u52a8\u63a8\u52a8\u7bb1\u5b50\uff0c\u8ba9\u7bb1\u5b50\u8fdb\u5165\u76ee\u6807\u4f4d\u7f6e\u3002", "\u8fdb\u5165\u7b2c\u4e8c\u5173\u65f6\u89c2\u5bdf\u5927\u5730\u56fe\u626b\u51fa\u540e\u7684\u89c6\u91ce\u53d8\u5316\u3002"],
        "accent": "#e78352",
    },
    {
        "name": "\u6bcf\u65e5\u7b56\u5212\u77e5\u8bc6\u8003\u6838",
        "capture": "planner-daily-quiz",
        "mp4": "projects/planner-daily-quiz/video/planner-daily-quiz-tutorial.mp4",
        "page": "projects/planner-daily-quiz/video/index.html",
        "mp4_name": "./planner-daily-quiz-tutorial.mp4",
        "entry_href": "../index.html",
        "home_href": "../../../index.html#apps",
        "badge": "\u8bad\u7ec3\u5de5\u5177\u6559\u5b66",
        "player_summary": "\u4ece\u5f00\u59cb\u4eca\u65e5\u7b54\u9898\u5230\u67e5\u9605\u89e3\u6790\u4e0e\u9519\u9898\u5efa\u8bae\u7684\u5b8c\u6574\u6d41\u7a0b\u3002",
        "summary": "\u9762\u5411\u4f11\u95f2\u6e38\u620f\u7b56\u5212\u7684\u6bcf\u65e5\u8bad\u7ec3\u9898\u5e93\uff0c\u5305\u542b\u9650\u65f6\u7b54\u9898\u3001\u81ea\u52a8\u6279\u6539\u4e0e\u9519\u9898\u5f3a\u5316\u5efa\u8bae\u3002",
        "steps": ["\u8fdb\u5165\u9875\u9762\u540e\u70b9\u51fb\u5f00\u59cb\uff0c\u67e5\u770b\u5f53\u65e5\u9898\u76ee\u4e0e\u5012\u8ba1\u65f6\u3002", "\u5728\u9650\u65f6\u5185\u5b8c\u6210\u9009\u9879\uff0c\u63d0\u4ea4\u540e\u5373\u53ef\u67e5\u770b\u6279\u6539\u7ed3\u679c\u3002", "\u9605\u8bfb\u7b54\u6848\u89e3\u6790\u4e0e\u9519\u9898\u5efa\u8bae\uff0c\u4e3a\u540e\u7eed\u590d\u4e60\u7559\u4e0b\u53c2\u8003\u3002"],
        "accent": "#58cbb3",
    },
]


PLAYER_ONLY = [
    {"name": "\u98de\u4e66\u6587\u4ef6\u6279\u91cf\u4e0b\u8f7d\u63d2\u4ef6", "page": "projects/\u98de\u4e66\u6587\u4ef6\u6279\u91cf\u4e0b\u8f7d\u63d2\u4ef6/\u89c6\u9891\u8d44\u6e90/\u6f14\u793a\u89c6\u9891.html", "mp4_name": "../demo/feishu-batch-downloader-demo.mp4", "entry_href": "../index.html", "home_href": "../../../index.html#apps", "badge": "\u63d2\u4ef6\u6559\u5b66\u89c6\u9891", "player_summary": "\u6f14\u793a\u5982\u4f55\u6253\u5f00\u63d2\u4ef6\u8bf4\u660e\u3001\u4f7f\u7528\u6279\u91cf\u4e0b\u8f7d\u529f\u80fd\u5e76\u67e5\u770b\u5b89\u88c5\u63d0\u793a\u3002", "accent": "#58cbb3"},
    {"name": "AI \u6e38\u620f\u9700\u6c42\u5de5\u574a", "page": "projects/ai-game-requirements-workshop/video/index.html", "mp4_name": "./ai-game-requirements-workshop.mp4", "entry_href": "https://gamepop-studio-20260713.polite-chord-7994.chatgpt.site", "home_href": "../../../index.html#apps", "badge": "\u5de5\u5177\u6559\u5b66\u89c6\u9891", "player_summary": "\u7528\u4e00\u6761\u89c6\u9891\u770b\u61c2\u5982\u4f55\u6574\u7406\u6e38\u620f\u9700\u6c42\uff0c\u5e76\u751f\u6210\u53ef\u4ea4\u7ed9 Codex \u7684\u7ed3\u6784\u5316\u4fe1\u606f\u3002", "accent": "#58cbb3"},
    {"name": "Codex \u4e60\u60ef\u5de5\u5177", "page": "videos/codex-habit-tool-demo.html", "mp4_name": "./codex-habit-tool-demo.mp4", "entry_href": "../projects/codex-habit-tool/index.html", "home_href": "../index.html#apps", "badge": "\u5de5\u5177\u6559\u5b66\u89c6\u9891", "player_summary": "\u5feb\u901f\u4e86\u89e3\u4e60\u60ef\u5217\u8868\u7684\u64cd\u4f5c\u6d41\u7a0b\uff0c\u5305\u62ec\u65b0\u5efa\u3001\u5b8c\u6210\u4e0e\u67e5\u770b\u7edf\u8ba1\u3002", "accent": "#58cbb3"},
    {"name": "Codex \u5bf9\u8bdd\u8bc4\u5206\u5de5\u5177", "page": "projects/Codex\u5bf9\u8bdd\u8bc4\u5206\u5de5\u5177/\u89c6\u9891\u8d44\u6e90/\u6f14\u793a\u89c6\u9891.html", "mp4_name": "./codex-reviewer-intro.mp4", "entry_href": "../index.html", "home_href": "../../../index.html#apps", "badge": "\u5de5\u5177\u6559\u5b66\u89c6\u9891", "player_summary": "\u4ecb\u7ecd\u5982\u4f55\u8bfb\u53d6\u672c\u5730 Codex \u5bf9\u8bdd\u3001\u8bc4\u5206\u5e76\u5bfc\u51fa\u53ef\u590d\u76d8\u62a5\u544a\u3002", "accent": "#5b8cff", "video_id": "walkthroughVideo", "vtt": "./codex-reviewer-intro.vtt"},
    {"name": "\u4e07\u8bdd\u7b52", "page": "projects/\u4e07\u8bdd\u7b52/\u89c6\u9891\u8d44\u6e90/\u6f14\u793a\u89c6\u9891.html", "mp4_name": "./wanhuatong-tutorial.mp4", "entry_href": "../index.html", "home_href": "../../../index.html#apps", "badge": "\u5de5\u5177\u6559\u5b66\u89c6\u9891", "player_summary": "\u4ece\u9009\u62e9\u6a21\u5f0f\u5230\u8f93\u5165\u6587\u672c\uff0c\u5f88\u5feb\u5b66\u4f1a\u5c06\u4e00\u53e5\u8bdd\u8f6c\u6210\u5408\u9002\u7684\u8868\u8fbe\u3002", "accent": "#5b8cff"},
]


def write_player(project: dict) -> None:
    page = ROOT / project["page"]
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(player_page(project), encoding="utf-8")


def main() -> None:
    if not FFMPEG.exists():
        raise FileNotFoundError(FFMPEG)
    for project in VIDEO_PROJECTS:
        encode(project)
        write_player(project)
    for project in PLAYER_ONLY:
        write_player(project)


if __name__ == "__main__":
    main()
