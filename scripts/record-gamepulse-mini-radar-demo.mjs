import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const bundledFfmpeg = require("ffmpeg-static");

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(
  repoRoot,
  "projects",
  "gamepulse-mini-radar",
  "video",
);
const outputPath = join(videoRoot, "gamepulse-mini-radar-demo.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const recordingRoot = join(tmpdir(), "gamepulse-mini-radar-recording");
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg;
const targetUrl =
  "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site";
const targetDuration = 83;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitUntil(startedAt, seconds) {
  const remaining = seconds * 1000 - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining);
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else {
        rejectRun(
          new Error(
            `${command} exited with ${code}\n${stderr || stdout}`.trim(),
          ),
        );
      }
    });
  });
}

async function launchBrowser() {
  const attempts = [
    ["Playwright Chromium", { headless: true }],
    ["system Chrome", { channel: "chrome", headless: true }],
    ["system Edge", { channel: "msedge", headless: true }],
  ];
  const failures = [];
  for (const [label, options] of attempts) {
    try {
      return { browser: await chromium.launch(options), label };
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  throw new Error(
    `No Chromium-compatible browser is available.\n${failures.join("\n")}`,
  );
}

async function recordWalkthrough() {
  await rm(recordingRoot, { recursive: true, force: true });
  await mkdir(recordingRoot, { recursive: true });

  const launch = await launchBrowser();
  const context = await launch.browser.newContext({
    deviceScaleFactor: 1,
    recordVideo: {
      dir: recordingRoot,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const rawVideo = page.video();
  const errors = { console: [], page: [] };

  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });

  const rawStartedAt = Date.now();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "看榜单、读拆解、找合作" }).waitFor();
  await page.getByRole("navigation", { name: "主导航" }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(1_200);

  const startedAt = Date.now();
  const preRollMs = startedAt - rawStartedAt;

  await waitUntil(startedAt, 13);
  await page.getByRole("button", { name: "榜单", exact: true }).click();
  await page.getByRole("tab", { name: /四榜概览/ }).click();
  await page.getByRole("heading", { name: "今日四榜概览" }).waitFor();

  await waitUntil(startedAt, 19);
  await page.getByRole("tab", { name: /国内榜/ }).click();
  await page
    .getByRole("button", { name: "查看 赵云与阿斗 详情", exact: true })
    .click();
  await page.getByRole("heading", { name: "玩法拆解" }).waitFor();

  await waitUntil(startedAt, 24);
  await page.getByRole("button", { name: "关闭详情" }).click();

  await waitUntil(startedAt, 27);
  await page.getByRole("button", { name: "情报", exact: true }).click();
  const knowledgeSearch = page.getByPlaceholder("搜索标题、摘要、来源、游戏名或发行商");
  await knowledgeSearch.waitFor();
  await knowledgeSearch.fill("玩法");

  await waitUntil(startedAt, 35);
  await page.getByRole("button", { name: "重置", exact: true }).click();

  await waitUntil(startedAt, 40);
  await page.getByRole("button", { name: "发布合作", exact: true }).click();
  await page.getByRole("heading", { name: "让好项目遇见对的人" }).waitFor();

  await waitUntil(startedAt, 44);
  await page.getByRole("button", { name: "我要发布" }).click();
  await page.getByRole("combobox", { name: "信息类型" }).selectOption({ label: "活动" });
  await page.getByLabel("开始时间").waitFor();

  await waitUntil(startedAt, 52);
  await page.getByRole("button", { name: "关闭发布表单" }).click();

  await waitUntil(startedAt, 55);
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "我的发布", exact: true }).click();
  await page.getByRole("heading", { name: "我的发布" }).waitFor();

  await waitUntil(startedAt, 63);
  await page.getByRole("button", { name: "接口说明", exact: true }).click();
  await page.getByRole("heading", { name: "把合作信息接入你的工作流" }).waitFor();

  await waitUntil(startedAt, 69);
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page.getByRole("heading", { name: "看榜单、读拆解、找合作" }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));

  await waitUntil(startedAt, targetDuration);
  assert.deepEqual(errors.console, []);
  assert.deepEqual(errors.page, []);

  await context.close();
  const webmPath = await rawVideo.path();
  await launch.browser.close();
  return { browserLabel: launch.label, preRollMs, webmPath };
}

async function main() {
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    throw new Error("ffmpeg is unavailable. Install dependencies first.");
  }
  await mkdir(videoRoot, { recursive: true });
  const recording = await recordWalkthrough();

  await run(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    recording.webmPath,
    "-ss",
    (recording.preRollMs / 1000).toFixed(3),
    "-t",
    String(targetDuration),
    "-vf",
    "scale=1280:720:flags=lanczos,fps=30",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    outputPath,
  ]);

  await run(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "00:00:46",
    "-i",
    outputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    posterPath,
  ]);

  await run(ffmpegPath, [
    "-v",
    "error",
    "-i",
    outputPath,
    "-f",
    "null",
    "-",
  ]);

  console.log(
    `Recorded ${outputPath}\nPoster ${posterPath}\nBrowser ${recording.browserLabel}`,
  );
}

await main();
