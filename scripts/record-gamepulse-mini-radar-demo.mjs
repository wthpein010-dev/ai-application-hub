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
const targetDuration = 75;

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
  await page.locator("h1").waitFor({ state: "visible" });
  await page.locator("#rankings").waitFor({ state: "attached" });
  await page
    .locator('input[aria-label^="加入比较："]')
    .first()
    .waitFor({ state: "attached" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(1_200);

  const startedAt = Date.now();
  const preRollMs = startedAt - rawStartedAt;

  await waitUntil(startedAt, 10);
  await page.locator("#rankings").scrollIntoViewIfNeeded();
  await delay(700);

  await waitUntil(startedAt, 22);
  await page.getByRole("tab", { name: /海外榜/ }).click();

  await waitUntil(startedAt, 28);
  await page.getByRole("tab", { name: /双榜概览/ }).click();

  await waitUntil(startedAt, 35);
  await page.getByRole("tab", { name: /国内榜/ }).click();

  await waitUntil(startedAt, 38);
  await page.getByRole("textbox", { name: "搜索游戏" }).fill("羊");

  await waitUntil(startedAt, 43);
  await page.getByRole("button", { name: "重置" }).click();

  await waitUntil(startedAt, 48);
  await page
    .getByRole("button", {
      name: "查看 向僵尸开炮 详情",
      exact: true,
    })
    .click();

  await waitUntil(startedAt, 55);
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();

  await waitUntil(startedAt, 57);
  for (const title of ["向僵尸开炮", "羊了个羊：星球", "三国：冰河时代"]) {
    await page
      .locator(`input[aria-label="加入比较：${title}"]`)
      .check({ force: true });
    await delay(900);
  }
  await page.locator(".compare-tray").waitFor({ state: "visible" });

  await waitUntil(startedAt, 62);
  await page.getByText(/下次自动检查/).scrollIntoViewIfNeeded();

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
    "00:00:26",
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
