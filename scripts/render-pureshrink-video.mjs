import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "pureshrink", "video");
const temporaryRoot = await mkdtemp(join(tmpdir(), "pureshrink-video-"));
await mkdir(videoRoot, { recursive: true });

const scenes = [
  {
    mode: "privacy",
    caption: "文件不离开设备，原件永不覆盖。",
    status: "LOCAL ENGINE · 0 个上传请求",
  },
  {
    mode: "modes",
    caption: "严格无损默认开启，高保真明确标注非无损。",
    status: "新任务将使用严格无损",
  },
  {
    mode: "queue",
    caption: "图片、GIF 和视频可以一次加入同一队列。",
    status: "3 个文件等待压缩",
  },
  {
    mode: "running",
    caption: "每个文件都会显示真实策略、进度和输出大小。",
    status: "正在本设备处理 hero.png",
  },
  {
    mode: "finished",
    caption: "候选没有更小时，PureShrink 会保留原件。",
    status: "本轮完成 · 共节省 36.4 MB",
  },
  {
    mode: "desktop",
    caption: "大视频和整批素材建议交给桌面原生引擎。",
    status: "Windows x64 · macOS arm64 / x64",
  },
];

const html = String.raw`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1280px; height: 720px; margin: 0; overflow: hidden; }
    body { color: #f4f0df; background: #07100d; font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
    .video { display: grid; width: 100%; height: 100%; grid-template-rows: 58px 1fr 72px; padding: 0 42px; background: radial-gradient(circle at 84% 8%, rgba(131,230,176,.14), transparent 470px), linear-gradient(rgba(213,255,135,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(213,255,135,.035) 1px, transparent 1px), #07100d; background-size: auto, 42px 42px, 42px 42px, auto; }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(213,255,135,.16); }
    .brand { display: flex; gap: 12px; align-items: center; font-weight: 900; }
    .mark { display: grid; width: 33px; height: 33px; place-items: center; border: 1px solid #d5ff87; border-radius: 10px; color: #d5ff87; font: 900 10px Consolas, monospace; }
    .meta { color: #9aaea5; font: 11px Consolas, monospace; letter-spacing: .1em; }
    main { display: grid; place-items: center; padding: 15px 0; }
    .app { width: 1110px; height: 520px; overflow: hidden; border: 1px solid rgba(213,255,135,.28); border-radius: 21px; background: rgba(10,23,18,.96); box-shadow: 0 30px 90px rgba(0,0,0,.4); }
    .top { display: flex; height: 72px; align-items: center; padding: 0 24px; border-bottom: 1px solid rgba(213,255,135,.14); }
    .top h1 { margin: 0; font-size: 25px; letter-spacing: -.03em; }
    .top h1 span { color: #d5ff87; }
    .engine { margin-left: auto; padding: 8px 11px; border: 1px solid rgba(131,230,176,.28); border-radius: 999px; color: #83e6b0; font: 10px Consolas, monospace; }
    .body { display: grid; height: 393px; grid-template-columns: 1.18fr .82fr; gap: 14px; padding: 14px; }
    .drop { position: relative; display: grid; place-items: center; border: 1px dashed rgba(213,255,135,.42); border-radius: 16px; background: radial-gradient(circle, rgba(213,255,135,.08), transparent 50%), #0e2019; text-align: center; }
    .drop-icon { position: relative; width: 66px; height: 66px; margin: 0 auto 18px; }
    .drop-icon i { position: absolute; inset: 0; border: 1px solid rgba(213,255,135,.4); border-radius: 15px; transform: rotate(45deg); }
    .drop-icon i:nth-child(2) { inset: 14px; border-color: #d5ff87; }
    .drop-icon i:nth-child(3) { inset: 27px; background: #d5ff87; }
    .drop strong { display: block; font-size: 19px; }
    .drop p { color: #9aaea5; font-size: 12px; }
    .trust { position: absolute; bottom: 22px; color: #83e6b0; font-size: 11px; }
    .mode-column { display: grid; grid-template-rows: 1fr 1fr; gap: 12px; }
    .mode { padding: 18px; border: 1px solid rgba(213,255,135,.14); border-radius: 14px; background: #10251d; }
    .mode.active { border-color: #d5ff87; box-shadow: inset 4px 0 #d5ff87; background: linear-gradient(135deg, rgba(213,255,135,.1), transparent), #10251d; }
    .mode-head { display: flex; align-items: center; justify-content: space-between; }
    .mode-head em { padding: 4px 7px; border-radius: 999px; color: #07100d; background: #d5ff87; font-size: 9px; font-style: normal; font-weight: 900; }
    .mode-head em.warn { background: #ffb36d; }
    .mode p { margin: 13px 0 0; color: #aebdb5; font-size: 11px; line-height: 1.55; }
    .queue { display: none; height: 393px; padding: 14px; }
    .queue-card { width: 100%; overflow: hidden; border: 1px solid rgba(213,255,135,.16); border-radius: 15px; background: #0b1a14; }
    .metrics { display: grid; height: 73px; grid-template-columns: repeat(4,1fr); border-bottom: 1px solid rgba(213,255,135,.13); }
    .metric { padding: 13px 16px; border-right: 1px solid rgba(213,255,135,.12); }
    .metric:last-child { border: 0; }
    .metric span { display: block; color: #9aaea5; font-size: 9px; }
    .metric strong { display: block; margin-top: 7px; font: 800 15px Consolas, monospace; }
    .rows { height: 258px; }
    .row { display: grid; height: 86px; grid-template-columns: 52px 1fr 130px 96px; gap: 15px; align-items: center; padding: 13px 18px; border-bottom: 1px solid rgba(213,255,135,.1); }
    .file { display: grid; width: 46px; height: 46px; place-items: center; border: 1px solid rgba(213,255,135,.2); border-radius: 11px; color: #d5ff87; font: 800 9px Consolas, monospace; }
    .name strong { display: block; font-size: 13px; }
    .name span { display: block; margin-top: 6px; color: #9aaea5; font-size: 10px; }
    .bar { height: 4px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.07); }
    .bar i { display: block; width: 0; height: 100%; background: linear-gradient(90deg,#83e6b0,#d5ff87); }
    .result { text-align: right; }
    .result span { display: block; color: #9aaea5; font-size: 9px; }
    .result strong { display: block; margin-top: 6px; font: 800 11px Consolas, monospace; }
    .dock { display: flex; height: 62px; align-items: center; padding: 0 18px; border-top: 1px solid rgba(213,255,135,.13); }
    .light { width: 8px; height: 8px; margin-right: 10px; border-radius: 50%; background: #d5ff87; box-shadow: 0 0 14px #d5ff87; }
    .dock strong { font-size: 11px; }
    .button { margin-left: auto; padding: 9px 14px; border-radius: 9px; color: #07100d; background: #d5ff87; font-size: 10px; font-weight: 900; }
    .desktop { display: none; height: 393px; padding: 34px; place-items: center; }
    .desktop-wrap { width: 100%; }
    .desktop h2 { margin: 0 0 12px; text-align: center; font-size: 28px; }
    .desktop > div > p { margin: 0 0 26px; color: #9aaea5; text-align: center; }
    .downloads { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .download { display: flex; height: 165px; padding: 21px; flex-direction: column; justify-content: space-between; border: 1px solid rgba(213,255,135,.2); border-radius: 15px; background: #10251d; }
    .download span { color: #d5ff87; font: 800 10px Consolas, monospace; }
    .download strong { font-size: 17px; }
    .download small { color: #9aaea5; }
    footer { display: flex; align-items: center; justify-content: center; border-top: 1px solid rgba(213,255,135,.16); }
    .caption { width: 1100px; overflow: hidden; color: #f4f0df; font-size: 20px; font-weight: 800; line-height: 1; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="video">
    <header><div class="brand"><span class="mark">PS</span><span>PureShrink · 无损压缩工坊</span></div><span class="meta">LOCAL-FIRST / 42 SEC</span></header>
    <main>
      <section class="app">
        <div class="top"><h1>把文件变轻，<span>不让原件冒险。</span></h1><span class="engine">浏览器本地引擎</span></div>
        <div class="body" id="intake">
          <section class="drop"><div><div class="drop-icon"><i></i><i></i><i></i></div><strong>拖入图片、视频、GIF 或其他文件</strong><p>支持批量队列 · 大文件推荐桌面版</p></div><span class="trust">● 文件不离开设备，原件永不覆盖</span></section>
          <section class="mode-column"><article class="mode active" id="lossless"><div class="mode-head"><strong>严格无损</strong><em>默认</em></div><p>PNG 像素一致 · 媒体码流复制<br>结果不更小时保留原件</p></article><article class="mode" id="fidelity"><div class="mode-head"><strong>高保真</strong><em class="warn">非无损</em></div><p>WebP 95 · H.264 CRF 18<br>用轻微质量交换更高压缩率</p></article></section>
        </div>
        <div class="queue" id="queue">
          <section class="queue-card">
            <div class="metrics"><div class="metric"><span>原始总量</span><strong>86.4 MB</strong></div><div class="metric"><span>当前总量</span><strong id="output">86.4 MB</strong></div><div class="metric"><span>已节省</span><strong id="saved">0%</strong></div><div class="metric"><span>已完成</span><strong id="done">0 / 3</strong></div></div>
            <div class="rows">
              <div class="row"><span class="file">PNG</span><div class="name"><strong>hero.png</strong><span>像素无损 PNG 重编码</span></div><div class="bar"><i id="p1"></i></div><div class="result"><span>12.8 MB</span><strong id="r1">等待</strong></div></div>
              <div class="row"><span class="file">GIF</span><div class="name"><strong>loading.gif</strong><span>码流复制与元数据精简</span></div><div class="bar"><i id="p2"></i></div><div class="result"><span>3.6 MB</span><strong id="r2">等待</strong></div></div>
              <div class="row"><span class="file">MP4</span><div class="name"><strong>launch.mp4</strong><span>码流复制与容器整理</span></div><div class="bar"><i id="p3"></i></div><div class="result"><span>70 MB</span><strong id="r3">等待</strong></div></div>
            </div>
            <div class="dock"><span class="light"></span><strong id="status"></strong><span class="button">开始压缩</span></div>
          </section>
        </div>
        <div class="desktop" id="desktop"><div class="desktop-wrap"><h2>大视频和整批素材，交给桌面版</h2><p>原生 FFmpeg · 输出增加 -pureshrink · 不覆盖源文件</p><div class="downloads"><div class="download"><span>WINDOWS x64</span><strong>PureShrink.exe</strong><small>便携版 · 解压即用</small></div><div class="download"><span>MACOS ARM64 / X64</span><strong>PureShrink.app</strong><small>Apple Silicon 与 Intel</small></div></div></div></div>
      </section>
    </main>
    <footer><div class="caption" id="caption"></div></footer>
  </div>
  <script>
    const scenes = ${JSON.stringify(scenes)};
    const intake = document.querySelector("#intake");
    const queue = document.querySelector("#queue");
    const desktop = document.querySelector("#desktop");
    window.renderScene = (index) => {
      const scene = scenes[index];
      const queueMode = ["queue","running","finished"].includes(scene.mode);
      intake.style.display = queueMode || scene.mode === "desktop" ? "none" : "grid";
      queue.style.display = queueMode ? "block" : "none";
      desktop.style.display = scene.mode === "desktop" ? "grid" : "none";
      document.querySelector("#fidelity").classList.toggle("active", scene.mode === "modes");
      document.querySelector("#lossless").classList.add("active");
      const running = scene.mode === "running";
      const finished = scene.mode === "finished";
      document.querySelector("#p1").style.width = finished ? "100%" : running ? "68%" : "0";
      document.querySelector("#p2").style.width = finished ? "100%" : "0";
      document.querySelector("#p3").style.width = finished ? "100%" : "0";
      document.querySelector("#r1").textContent = finished ? "-38% · 7.9 MB" : running ? "68%" : "等待";
      document.querySelector("#r2").textContent = finished ? "原件更优" : "等待";
      document.querySelector("#r3").textContent = finished ? "-45% · 38.5 MB" : "等待";
      document.querySelector("#output").textContent = finished ? "50 MB" : "86.4 MB";
      document.querySelector("#saved").textContent = finished ? "42.1%" : "0%";
      document.querySelector("#done").textContent = finished ? "3 / 3" : running ? "0 / 3" : "0 / 3";
      document.querySelector("#status").textContent = scene.status;
      document.querySelector("#caption").textContent = scene.caption;
    };
    window.renderScene(0);
  </script>
</body>
</html>`;

let browser;
try {
  browser = await chromium.launch({
    args: ["--headless=new"],
    channel: process.platform === "win32" ? "chrome" : undefined,
    headless: true,
  });
  const context = await browser.newContext({
    recordVideo: { dir: temporaryRoot, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(videoRoot, "poster.jpg"),
    type: "jpeg",
    quality: 91,
  });

  const recording = page.video();
  for (let index = 0; index < scenes.length; index += 1) {
    if (index > 0) await page.evaluate((next) => window.renderScene(next), index);
    await page.waitForTimeout(7_000);
  }
  await context.close();

  const webmPath = await recording.path();
  const outputPath = join(videoRoot, "pureshrink-demo.mp4");
  const result = spawnSync(
    process.env.FFMPEG_PATH || ffmpeg,
    [
      "-y",
      "-i", webmPath,
      "-an",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-r", "30",
      outputPath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "ffmpeg failed");
  await readFile(outputPath);
} finally {
  await browser?.close();
  await rm(temporaryRoot, { force: true, recursive: true });
}
