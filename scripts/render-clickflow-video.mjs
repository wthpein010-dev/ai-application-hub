import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "clickflow", "video");
const temporaryRoot = await mkdtemp(join(tmpdir(), "clickflow-video-"));
await mkdir(videoRoot, { recursive: true });

const scenes = [
  {
    mode: "point",
    caption: "先填写目标坐标、点击间隔和执行次数。",
    status: "目标位置已更新 · 842, 516",
  },
  {
    mode: "running",
    caption: "开启光标恢复，按 F8 开始或暂停定点点击。",
    status: "定点点击运行中 · 每 2 秒执行一次",
  },
  {
    mode: "recording",
    caption: "按 F6 录制，工具窗口内的点击会自动过滤。",
    status: "正在录制动作 · 已记录 1 个有效点击",
  },
  {
    mode: "replay",
    caption: "编辑动作与间隔，再按 F7 循环回放。",
    status: "序列回放中 · 第 2 / 3 个动作",
  },
  {
    mode: "finish",
    caption: "随时按 F9 停止全部，并下载对应系统版本。",
    status: "全部任务已停止 · Windows / macOS 已就绪",
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
    body { color: #f7f3fb; background: #0b0910; font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
    .video { display: grid; width: 100%; height: 100%; grid-template-rows: 60px 1fr 74px; padding: 0 48px; background: radial-gradient(circle at 20% 5%, rgba(109,92,231,.2), transparent 500px), #0b0910; }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #332d3d; }
    .brand { display: flex; gap: 11px; align-items: center; font-weight: 900; }
    .mark { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 8px; color: white; background: #6d5ce7; font: 900 12px Consolas, monospace; }
    .meta { color: #9991a3; font: 12px Consolas, monospace; letter-spacing: .08em; }
    main { display: grid; place-items: center; padding: 18px 0; }
    .app { width: 1030px; height: 505px; overflow: hidden; border: 1px solid #40384c; border-radius: 15px; background: #15121c; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
    .appbar { display: flex; height: 58px; align-items: center; padding: 0 20px; border-bottom: 1px solid #352e40; }
    .appbar strong { font-size: 18px; }
    .appbar small { margin-left: 10px; color: #9991a3; }
    .stop { margin-left: auto; padding: 10px 13px; border: 1px solid rgba(240,106,130,.5); border-radius: 8px; color: #ff9bad; font-size: 12px; }
    .tabs { display: grid; height: 49px; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #352e40; background: #100e15; }
    .tab { display: grid; place-items: center; color: #8f8799; font-size: 13px; font-weight: 800; }
    .tab.active { border-bottom: 3px solid #8b78ff; color: #fff; }
    .workspace { display: grid; height: 343px; grid-template-columns: .86fr 1.14fr; gap: 14px; padding: 15px; }
    .card { position: relative; overflow: hidden; padding: 17px; border: 1px solid #373043; border-radius: 11px; background: #1d1925; }
    .card-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .card-title strong { font-size: 14px; }
    .key { padding: 5px 8px; border: 1px solid #443a54; border-radius: 6px; color: #c5bbff; font: 800 10px Consolas, monospace; }
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field { display: grid; gap: 5px; color: #9991a3; font-size: 10px; }
    .value { height: 35px; padding: 9px 10px; border: 1px solid #3a3246; border-radius: 7px; color: #f7f3fb; background: #110f16; font: 700 12px Consolas, monospace; }
    .check { display: flex; gap: 8px; align-items: center; margin-top: 13px; color: #cfc8d6; font-size: 11px; }
    .box { display: grid; width: 16px; height: 16px; place-items: center; border: 1px solid #8b78ff; border-radius: 4px; color: white; background: #6d5ce7; }
    .primary { position: absolute; right: 17px; bottom: 16px; left: 17px; display: grid; height: 38px; place-items: center; border-radius: 8px; color: #fff; background: #6d5ce7; font-size: 12px; font-weight: 900; }
    .screen { position: relative; height: 230px; overflow: hidden; border: 1px solid #3a3246; border-radius: 9px; background: linear-gradient(rgba(139,120,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,120,255,.06) 1px, transparent 1px), #0d0b11; background-size: 26px 26px; }
    .screen::before { position: absolute; top: 0; right: 0; left: 0; height: 31px; content: "DISPLAY 1920 × 1080"; padding: 9px 11px; border-bottom: 1px solid #312b3a; color: #6f6877; font: 9px Consolas, monospace; text-align: right; background: #15121b; }
    .target { position: absolute; top: 48%; left: 44%; width: 24px; height: 24px; transform: translate(-50%,-50%); }
    .target::before, .target::after { position: absolute; content: ""; background: #b8adff; }
    .target::before { top: 11px; width: 24px; height: 2px; }
    .target::after { left: 11px; width: 2px; height: 24px; }
    .wave { position: absolute; top: 48%; left: 44%; width: 36px; height: 36px; border: 2px solid #8b78ff; border-radius: 50%; opacity: 0; transform: translate(-50%,-50%); }
    .running .wave { animation: pulse 1.25s ease-out infinite; }
    @keyframes pulse { 0% { opacity: .9; transform: translate(-50%,-50%) scale(.5); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(2.4); } }
    .stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 10px; }
    .stat { padding: 9px; border: 1px solid #352f3f; border-radius: 7px; background: #17131e; }
    .stat span { display: block; margin-bottom: 3px; color: #8f8799; font-size: 9px; }
    .stat strong { font-size: 11px; }
    .sequence { display: none; height: 343px; grid-template-columns: 1.5fr .7fr; gap: 14px; padding: 15px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { height: 39px; padding: 7px; border-bottom: 1px solid #352f3f; text-align: center; }
    th { color: #8f8799; background: #110f16; }
    tr.active { background: rgba(101,217,178,.16); }
    .record { padding: 7px 9px; border: 1px solid #f06a82; border-radius: 6px; color: #ff9bad; font-size: 10px; }
    .loop { display: grid; gap: 10px; }
    .loop .field { grid-template-columns: 1fr; }
    .platforms { display: none; height: 343px; padding: 26px; place-items: center; }
    .finish { width: 100%; }
    .finish h2 { margin: 0 0 18px; font-size: 29px; text-align: center; }
    .keys { display: flex; gap: 9px; justify-content: center; margin-bottom: 28px; }
    .keys span { padding: 10px 13px; border: 1px solid #3b3446; border-radius: 8px; background: #18141f; font: 800 11px Consolas, monospace; }
    .downloads { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .download { padding: 22px; border: 1px solid #3b3446; border-radius: 10px; background: #1d1925; }
    .download span { color: #a899ff; font: 800 10px Consolas, monospace; }
    .download strong { display: block; margin-top: 8px; font-size: 16px; }
    .statusbar { display: flex; height: 55px; gap: 10px; align-items: center; padding: 0 18px; border-top: 1px solid #352e40; color: #a39ba9; background: #100e15; font-size: 11px; }
    .light { width: 8px; height: 8px; border-radius: 50%; background: #65d9b2; }
    .statusbar strong { color: #f7f3fb; }
    footer { display: flex; align-items: center; justify-content: center; border-top: 1px solid #332d3d; }
    .caption { width: 1080px; overflow: hidden; color: #f8f5fb; font-size: 20px; font-weight: 800; line-height: 1; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
    .scene-copy { opacity: 1; transform: translateY(0); transition: opacity 180ms ease, transform 180ms ease; }
    .scene-copy.out { opacity: 0; transform: translateY(5px); }
  </style>
</head>
<body>
  <div class="video">
    <header><div class="brand"><span class="mark">CF</span><span>ClickFlow · 鼠标自动化工作台</span></div><span class="meta">QUICK START / 50 SEC</span></header>
    <main>
      <section class="app">
        <div class="appbar"><strong>ClickFlow</strong><small>鼠标自动化工作台</small><span class="stop">停止全部 · F9</span></div>
        <div class="tabs"><div class="tab active" id="pointTab">01 · 定点点击</div><div class="tab" id="sequenceTab">02 · 录制回放</div></div>
        <div class="workspace" id="point">
          <section class="card">
            <div class="card-title"><strong>目标位置与执行规则</strong><span class="key">F8</span></div>
            <div class="fields">
              <div class="field">X 坐标<div class="value">842</div></div><div class="field">Y 坐标<div class="value">516</div></div>
              <div class="field">点击间隔<div class="value">2.0 秒</div></div><div class="field">执行次数<div class="value">0 · 持续</div></div>
              <div class="field">鼠标按键<div class="value">左键</div></div><div class="field">按下时长<div class="value">20 ms</div></div>
            </div>
            <div class="check"><span class="box">✓</span><span>点击后恢复鼠标位置</span></div>
            <div class="primary" id="pointAction">开始点击 · F8</div>
          </section>
          <section class="card running" id="preview">
            <div class="card-title"><strong>位置预览</strong><span class="key">SIMULATION</span></div>
            <div class="screen"><div class="target"></div><div class="wave"></div></div>
            <div class="stats"><div class="stat"><span>频率</span><strong>0.5 次/秒</strong></div><div class="stat"><span>次数</span><strong>持续</strong></div><div class="stat"><span>光标保护</span><strong>已开启</strong></div></div>
          </section>
        </div>
        <div class="sequence" id="sequence">
          <section class="card">
            <div class="card-title"><strong>动作时间线 · <span id="stepCount">1 个动作</span></strong><span class="record" id="record">结束录制 · F6</span></div>
            <table><thead><tr><th>#</th><th>动作</th><th>坐标</th><th>等待</th><th>按下</th><th>光标保护</th></tr></thead><tbody id="rows"></tbody></table>
          </section>
          <section class="card">
            <div class="card-title"><strong>回放设置</strong><span class="key">F7</span></div>
            <div class="loop">
              <div class="field">循环次数<div class="value">5</div></div>
              <div class="field">循环间隔<div class="value">1.0 秒</div></div>
              <div class="field">播放速度<div class="value">1.0 ×</div></div>
              <div class="check"><span class="box">✓</span><span>使用真实间隔</span></div>
            </div>
            <div class="primary" id="replayAction">开始回放 · F7</div>
          </section>
        </div>
        <div class="platforms" id="platforms">
          <div class="finish">
            <h2>完成设置后，随时按 F9 停止全部</h2>
            <div class="keys"><span>F6 录制</span><span>F7 回放</span><span>F8 定点点击</span><span>F9 停止全部</span></div>
            <div class="downloads"><div class="download"><span>WINDOWS x64</span><strong>ClickFlow.exe · 解压即用</strong></div><div class="download"><span>MACOS ARM64 / X64</span><strong>ClickFlow.app · 按芯片选择</strong></div></div>
          </div>
        </div>
        <div class="statusbar"><span class="light" id="statusLight"></span><strong id="status"></strong></div>
      </section>
    </main>
    <footer><div class="caption scene-copy" id="caption"></div></footer>
  </div>
  <script>
    const scenes = ${JSON.stringify(scenes)};
    const point = document.querySelector("#point");
    const sequence = document.querySelector("#sequence");
    const platforms = document.querySelector("#platforms");
    const pointTab = document.querySelector("#pointTab");
    const sequenceTab = document.querySelector("#sequenceTab");
    const caption = document.querySelector("#caption");
    const rows = document.querySelector("#rows");
    const rowData = [
      ["01", "左键", "842, 516", "0.00 秒", "20 ms", "开启"],
      ["02", "右键", "1090, 620", "0.84 秒", "20 ms", "开启"],
      ["03", "左键", "670, 742", "1.12 秒", "20 ms", "开启"]
    ];
    function renderRows(count, active = -1) {
      rows.innerHTML = rowData.slice(0, count).map((row, index) =>
        '<tr class="' + (index === active ? 'active' : '') + '">' + row.map(value => '<td>' + value + '</td>').join('') + '</tr>'
      ).join("");
    }
    window.renderScene = async (index) => {
      caption.classList.add("out");
      await new Promise(resolve => setTimeout(resolve, 180));
      const scene = scenes[index];
      const showPoint = scene.mode === "point" || scene.mode === "running";
      const showSequence = scene.mode === "recording" || scene.mode === "replay";
      point.style.display = showPoint ? "grid" : "none";
      sequence.style.display = showSequence ? "grid" : "none";
      platforms.style.display = scene.mode === "finish" ? "grid" : "none";
      pointTab.classList.toggle("active", showPoint);
      sequenceTab.classList.toggle("active", showSequence);
      document.querySelector("#preview").classList.toggle("running", scene.mode === "running");
      document.querySelector("#pointAction").textContent = scene.mode === "running" ? "暂停点击 · F8" : "开始点击 · F8";
      document.querySelector("#record").style.display = scene.mode === "recording" ? "inline-block" : "none";
      document.querySelector("#stepCount").textContent = scene.mode === "recording" ? "1 个动作" : "3 个动作";
      document.querySelector("#replayAction").textContent = scene.mode === "replay" ? "暂停回放 · F7" : "开始回放 · F7";
      renderRows(scene.mode === "recording" ? 1 : 3, scene.mode === "replay" ? 1 : -1);
      document.querySelector("#status").textContent = scene.status;
      document.querySelector("#statusLight").style.background = scene.mode === "recording" ? "#f06a82" : scene.mode === "replay" || scene.mode === "running" ? "#8b78ff" : "#65d9b2";
      caption.textContent = scene.caption;
      caption.classList.remove("out");
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
  await page.waitForTimeout(700);
  await page.screenshot({
    path: join(videoRoot, "poster.jpg"),
    type: "jpeg",
    quality: 91,
  });

  const recording = page.video();
  for (let index = 0; index < scenes.length; index += 1) {
    if (index > 0) await page.evaluate((next) => window.renderScene(next), index);
    await page.waitForTimeout(10_000);
  }
  await context.close();

  const webmPath = await recording.path();
  const outputPath = join(videoRoot, "clickflow-demo.mp4");
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
