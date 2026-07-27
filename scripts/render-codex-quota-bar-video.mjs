import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_PATH || require("ffmpeg-static");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "codex-quota-bar");
const videoRoot = join(projectRoot, "video");
const tempRoot = await mkdtemp(join(tmpdir(), "codex-quota-video-"));
const gif = await readFile(join(projectRoot, "assets", "suit-hamster.gif"));
const codexPreview = await readFile(
  join(projectRoot, "assets", "compact-pet-quota.webp"),
);
const gifData = `data:image/gif;base64,${gif.toString("base64")}`;
const codexData = `data:image/webp;base64,${codexPreview.toString("base64")}`;

const scenes = [
  {
    eyebrow: "01 / QUOTA",
    title: "额度，贴近宠物也要最醒目",
    body: "剩余百分比和横向进度条固定在最上方，数字清楚，变化一眼可见。",
    mode: "bundled",
  },
  {
    eyebrow: "02 / CODEX PET FIRST",
    title: "Codex 桌宠优先",
    body: "检测到当前 Codex 桌宠时直接融合，保留原有动画和任务状态。",
    mode: "codex",
  },
  {
    eyebrow: "03 / BUILT-IN FALLBACK",
    title: "没有桌宠，也能直接开",
    body: "应用已内置西装仓鼠，新电脑无需另外安装宠物资源。",
    mode: "bundled",
  },
  {
    eyebrow: "04 / TASK COMPLETE",
    title: "完成提示不挡住额度",
    body: "任务结束后在右侧安全区弹出中文提示，额度数字与进度条仍然完整可见。",
    mode: "notice",
  },
  {
    eyebrow: "05 / DESKTOP READY",
    title: "新电脑解压即用",
    body: "默认开机启动，托盘随时控制显示；Windows 与 macOS 都提供独立工具包。",
    mode: "platforms",
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
    body { color: #f2f3ef; background: #111313; font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
    .frame { display: grid; width: 100%; height: 100%; grid-template-rows: 74px 1fr 62px; padding: 0 64px; }
    header, footer { display: flex; align-items: center; justify-content: space-between; border-color: rgba(240, 243, 238, 0.14); }
    header { border-bottom: 1px solid rgba(240, 243, 238, 0.14); }
    footer { border-top: 1px solid rgba(240, 243, 238, 0.14); color: #aeb3ad; font-size: 15px; }
    .brand { display: flex; gap: 12px; align-items: center; font-weight: 800; }
    .mark { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #74e7dd; border-radius: 7px; color: #74e7dd; font: 700 12px Consolas, monospace; }
    .meta { color: #aeb3ad; font: 13px Consolas, monospace; }
    main { display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(520px, 1.08fr); gap: 76px; align-items: center; }
    .copy { min-width: 0; opacity: 1; transform: translateY(0); transition: opacity 220ms ease, transform 220ms ease; }
    .copy.out { opacity: 0; transform: translateY(10px); }
    .eyebrow { margin: 0 0 18px; color: #74e7dd; font: 800 14px Consolas, monospace; }
    h1 { max-width: 540px; margin: 0 0 24px; font-size: 56px; line-height: 1.16; letter-spacing: 0; }
    .body { max-width: 520px; margin: 0; color: #aeb3ad; font-size: 22px; line-height: 1.72; }
    .stage { position: relative; display: grid; min-height: 486px; place-items: center; border: 1px solid rgba(240, 243, 238, 0.14); border-radius: 8px; background: #181b1a; }
    .mock { position: relative; width: 476px; height: 414px; }
    .quota { position: absolute; top: 18px; left: 26px; width: 250px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.17); border-radius: 8px; background: #222625; box-shadow: 0 22px 48px rgba(0, 0, 0, 0.34); }
    .quota-head { display: flex; padding: 16px 17px 0; justify-content: space-between; color: #f2f3ef; font-size: 12px; font-weight: 800; }
    .quota-head span:last-child { color: #aeb3ad; font-weight: 600; }
    .quota strong { display: block; padding: 9px 17px 11px; font: 700 50px Consolas, monospace; }
    .progress { height: 12px; background: #373d3a; }
    .progress span { display: block; width: 67%; height: 100%; background: #74e7dd; }
    .pet { position: absolute; top: 166px; left: 56px; width: 190px; height: 204px; object-fit: contain; }
    .notice { position: absolute; top: 164px; right: 18px; display: grid; width: 208px; gap: 9px; padding: 18px; border: 1px solid rgba(255, 255, 255, 0.16); border-left: 4px solid #d9f55f; border-radius: 7px; background: #222625; box-shadow: 0 20px 44px rgba(0, 0, 0, 0.34); opacity: 0; transform: translateX(12px); transition: opacity 260ms ease, transform 260ms ease; }
    .notice.show { opacity: 1; transform: translateX(0); }
    .notice span { color: #d9f55f; font-size: 13px; font-weight: 900; }
    .notice strong { font-size: 17px; }
    .notice small { color: #aeb3ad; font-size: 12px; line-height: 1.5; }
    .codex-capture { display: none; width: 476px; height: auto; border: 1px solid rgba(255, 255, 255, 0.14); background: #111; image-rendering: auto; }
    .codex-capture.show { display: block; }
    .platforms { position: absolute; right: 18px; bottom: 22px; display: flex; gap: 8px; opacity: 0; transition: opacity 240ms ease; }
    .platforms.show { opacity: 1; }
    .platforms span { padding: 9px 12px; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 6px; color: #f2f3ef; background: #222625; font-size: 12px; font-weight: 800; }
    .timeline { display: flex; gap: 9px; align-items: center; }
    .tick { width: 44px; height: 4px; background: #373d3a; }
    .tick.active { background: #d9f55f; }
  </style>
</head>
<body>
  <div class="frame">
    <header><div class="brand"><span class="mark">CQ</span><span>Codex 用量悬浮条</span></div><span class="meta">DESKTOP TOOL / 40 SEC</span></header>
    <main>
      <section class="copy" id="copy"><p class="eyebrow" id="eyebrow"></p><h1 id="title"></h1><p class="body" id="body"></p></section>
      <section class="stage">
        <div class="mock" id="mock">
          <div class="quota"><div class="quota-head"><span>剩余额度</span><span>刚刚更新</span></div><strong>67%</strong><div class="progress"><span></span></div></div>
          <img class="pet" src="${gifData}" alt="">
          <div class="notice" id="notice"><span>任务已完成</span><strong>发布包已构建</strong><small>中文提示自动避让额度面板</small></div>
          <div class="platforms" id="platforms"><span>Windows x64</span><span>macOS arm64 / x64</span></div>
        </div>
        <img class="codex-capture" id="codexCapture" src="${codexData}" alt="">
      </section>
    </main>
    <footer><span>Codex 桌宠优先 · 内置西装仓鼠兜底 · 始终只显示一个宠物</span><div class="timeline" id="timeline"></div></footer>
  </div>
  <script>
    const scenes = ${JSON.stringify(scenes)};
    const copy = document.querySelector("#copy");
    const timeline = document.querySelector("#timeline");
    timeline.innerHTML = scenes.map((_, index) => '<span class="tick" data-index="' + index + '"></span>').join("");
    window.renderScene = async (index) => {
      copy.classList.add("out");
      await new Promise((resolve) => setTimeout(resolve, 230));
      const scene = scenes[index];
      document.querySelector("#eyebrow").textContent = scene.eyebrow;
      document.querySelector("#title").textContent = scene.title;
      document.querySelector("#body").textContent = scene.body;
      document.querySelector("#mock").hidden = scene.mode === "codex";
      document.querySelector("#codexCapture").classList.toggle("show", scene.mode === "codex");
      document.querySelector("#notice").classList.toggle("show", scene.mode === "notice");
      document.querySelector("#platforms").classList.toggle("show", scene.mode === "platforms");
      document.querySelectorAll(".tick").forEach((tick, tickIndex) => tick.classList.toggle("active", tickIndex === index));
      copy.classList.remove("out");
    };
    window.renderScene(0);
  </script>
</body>
</html>`;

let browser;
try {
  browser = await chromium.launch({
    args: ["--headless=new"],
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    recordVideo: { dir: tempRoot, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: join(videoRoot, "poster.jpg"),
    type: "jpeg",
    quality: 90,
  });

  const recording = page.video();
  for (let index = 0; index < scenes.length; index += 1) {
    if (index > 0) await page.evaluate((next) => window.renderScene(next), index);
    await page.waitForTimeout(8_000);
  }
  await context.close();

  const webmPath = await recording.path();
  const outputPath = join(videoRoot, "codex-quota-bar-demo.mp4");
  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-i",
      webmPath,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      "30",
      outputPath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "ffmpeg failed");
  }
} finally {
  await browser?.close();
  await rm(tempRoot, { force: true, recursive: true });
}
