import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const bundledFfmpeg = require("ffmpeg-static");

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(repoRoot, "projects", "codex-thread-workbench");
const videoRoot = join(projectRoot, "video");
const outputPath = join(videoRoot, "codex-thread-workbench-demo.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const recordingRoot = join(tmpdir(), "codex-thread-workbench-recording");
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg;
const targetUrl = pathToFileURL(join(projectRoot, "index.html")).href;
const captureDuration = 37.5;
const playbackScale = 2;
const targetDuration = captureDuration * playbackScale;

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
  await page.goto(targetUrl, { waitUntil: "load" });
  await page.locator(".workbench").waitFor({ state: "visible" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(700);

  const startedAt = Date.now();
  const preRollMs = startedAt - rawStartedAt;

  await waitUntil(startedAt, 5.5);
  const releaseComposer = page.locator('[data-thread-id="release"] [data-role="composer"]');
  await releaseComposer.locator("textarea").fill("继续检查 Mac 版下载，并补充视频入口。");
  await delay(500);
  await releaseComposer.locator('button[type="submit"]').click();

  await waitUntil(startedAt, 11.5);
  const quotaCard = page.locator('[data-thread-id="quota"]');
  await quotaCard.scrollIntoViewIfNeeded();
  await quotaCard.locator('[data-action="minimize-card"]').click();
  await delay(900);
  await quotaCard.locator('[data-action="minimize-card"]').click();

  await waitUntil(startedAt, 18);
  await page.locator('[data-action="open-picker"]').click();
  await page.locator('[data-role="picker-search"]').fill("记忆");

  await waitUntil(startedAt, 23.5);
  await page.locator('[data-action="close-picker"]').last().click();
  const approvalCard = page.locator('[data-thread-id="approval"]');
  await approvalCard.scrollIntoViewIfNeeded();
  await delay(450);
  await approvalCard.locator('[data-action="approve"]').click();

  await waitUntil(startedAt, 31);
  await page.locator('[data-action="fullscreen"]').click();
  await delay(800);
  await page.locator('[data-action="reset-layout"]').click();
  await page.locator(".product-note").scrollIntoViewIfNeeded();

  await waitUntil(startedAt, captureDuration);
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
    "-vf",
    `setpts=${playbackScale}*PTS,scale=1280:720:flags=lanczos,fps=30`,
    "-t",
    String(targetDuration),
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
    "00:00:39",
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
    `Rendered ${outputPath}\nPoster ${posterPath}\nBrowser ${recording.browserLabel}`,
  );
}

await main();
