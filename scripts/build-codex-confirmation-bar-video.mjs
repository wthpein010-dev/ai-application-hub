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
const projectRoot = join(repoRoot, "projects", "codex-confirmation-bar");
const videoRoot = join(projectRoot, "video");
const outputPath = join(videoRoot, "codex-confirmation-bar-demo.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const recordingRoot = join(tmpdir(), "codex-confirmation-bar-recording");
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg;
const targetUrl = pathToFileURL(join(projectRoot, "index.html")).href;
const captureDuration = 37.5;
const playbackScale = 2;
const targetDuration = captureDuration * playbackScale;

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
async function waitUntil(startedAt, seconds) {
  const remaining = seconds * 1000 - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining);
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`${command} exited with ${code}\n${stderr || stdout}`.trim()));
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
  throw new Error(`No Chromium-compatible browser is available.\n${failures.join("\n")}`);
}

async function recordWalkthrough() {
  await rm(recordingRoot, { recursive: true, force: true });
  await mkdir(recordingRoot, { recursive: true });
  const launch = await launchBrowser();
  const context = await launch.browser.newContext({
    deviceScaleFactor: 1,
    recordVideo: { dir: recordingRoot, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const rawVideo = page.video();
  const errors = { console: [], page: [] };
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });

  const rawStartedAt = Date.now();
  await page.goto(targetUrl, { waitUntil: "load" });
  await page.locator(".hero").waitFor({ state: "visible" });
  await delay(700);
  const startedAt = Date.now();
  const preRollMs = startedAt - rawStartedAt;

  await waitUntil(startedAt, 3.5);
  await page.locator(".demo-panel").scrollIntoViewIfNeeded();

  await waitUntil(startedAt, 5.5);
  await page.locator('[data-action="scan"]').click();

  await waitUntil(startedAt, 11.5);
  const handle = page.locator('[data-role="drag-handle"]');
  const handleBox = await handle.boundingBox();
  assert.ok(handleBox);
  await page.mouse.move(handleBox.x + 36, handleBox.y + 18);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 210, handleBox.y + 92, { steps: 14 });
  await page.mouse.up();

  await waitUntil(startedAt, 18);
  await page.locator('[data-role="candidate"]').first().locator('[data-action="confirm"]').click();

  await waitUntil(startedAt, 24.5);
  await page.evaluate(() => document.querySelector('[data-action="fail-next"]').click());
  await page.locator('[data-role="candidate"]').first().locator('[data-action="confirm"]').click();

  await waitUntil(startedAt, 31);
  await page.locator('[data-role="candidate"][data-state="error"] [data-action="retry"]').click();

  await waitUntil(startedAt, 34.5);
  await page.locator('[data-action="confirm-all"]').click();
  await page.locator('[data-role="status"]').scrollIntoViewIfNeeded();

  await waitUntil(startedAt, captureDuration);
  assert.deepEqual(errors.console, []);
  assert.deepEqual(errors.page, []);
  await context.close();
  const webmPath = await rawVideo.path();
  await launch.browser.close();
  return { browserLabel: launch.label, preRollMs, webmPath };
}

async function main() {
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error("ffmpeg is unavailable. Run npm ci first.");
  await mkdir(videoRoot, { recursive: true });
  const recording = await recordWalkthrough();

  await run(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", recording.webmPath,
    "-ss", (recording.preRollMs / 1000).toFixed(3),
    "-vf", `setpts=${playbackScale}*PTS,scale=1280:720:flags=lanczos,fps=30`,
    "-t", String(targetDuration),
    "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
    "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", outputPath,
  ]);
  await run(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-ss", "00:00:27",
    "-i", outputPath, "-frames:v", "1", "-q:v", "2", posterPath,
  ]);
  await run(ffmpegPath, ["-v", "error", "-i", outputPath, "-f", "null", "-"]);
  console.log(`Rendered ${outputPath}\nPoster ${posterPath}\nBrowser ${recording.browserLabel}`);
}

await main();
