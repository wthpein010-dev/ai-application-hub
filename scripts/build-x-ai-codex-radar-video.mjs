import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "x-ai-codex-radar", "video");
const captureRoot = join(videoRoot, ".capture");
const rawVideo = join(videoRoot, "x-ai-codex-radar-demo.webm");
const finalVideo = join(videoRoot, "x-ai-codex-radar-demo.mp4");
const poster = join(videoRoot, "poster.jpg");
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);
const browserExecutable = [
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => existsSync(candidate));

if (!browserExecutable) throw new Error("No compatible Chromium browser is available for recording");

async function waitForFfmpeg() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const probe = spawnSync(ffmpegPath, ["-version"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return;
    if (attempt === 90) throw probe.error || new Error("ffmpeg did not become ready in time");
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

await rm(captureRoot, { recursive: true, force: true });
await mkdir(captureRoot, { recursive: true });

const server = createServer(async (request, response) => {
  const { readFile } = await import("node:fs/promises");
  const requestPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relativePath = requestPath === "/" ? "projects/x-ai-codex-radar/index.html" : requestPath.replace(/^\/+/, "");
  const candidate = normalize(join(root, relativePath));
  if (!candidate.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(candidate);
    response.writeHead(200, { "content-type": mimeTypes.get(extname(candidate)) || "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: captureRoot, size: { width: 1280, height: 720 } },
  colorScheme: "light",
});
const page = await context.newPage();
const recording = page.video();

try {
  console.log("Recording the forum-style walkthrough...");
  await page.goto(`http://127.0.0.1:${port}/projects/x-ai-codex-radar/index.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  await page.locator(".quick-status").scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.click('[data-token-alert="true"] .token-disclosure summary');
  await page.waitForTimeout(9000);
  await page.click('[data-token-alert="true"] .token-disclosure summary');
  await page.waitForTimeout(1000);
  await page.locator(".priority-section").scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);
  await page.click('[data-open-thread="tibo-token-reset"]');
  await page.waitForTimeout(5000);
  await page.click('[data-filter="tibo"]');
  await page.waitForTimeout(4000);
  await page.click('[data-thread-id="tibo-token-reset"]');
  await page.waitForTimeout(6000);
  await page.click('[data-filter="official"]');
  await page.waitForTimeout(4000);
  await page.click('[data-thread-id="codex-official-update"]');
  await page.waitForTimeout(7000);
  await page.click('[data-filter="token"]');
  await page.waitForTimeout(4000);
  await page.click('[data-thread-id="tibo-token-reset"]');
  await page.locator("#threadDetail").scrollIntoViewIfNeeded();
  await page.waitForTimeout(8000);
  await page.click('[data-filter="musk"]');
  await page.waitForTimeout(4000);
  await page.locator(".token-status").scrollIntoViewIfNeeded();
  await page.waitForTimeout(6000);
  await page.locator("#top").scrollIntoViewIfNeeded();
  await page.waitForTimeout(7000);
} finally {
  await context.close();
  await browser.close();
  server.close();
}

const capturedPath = await recording.path();
await rm(rawVideo, { force: true });
await rename(capturedPath, rawVideo);
console.log("Waiting for the local media encoder...");
await waitForFfmpeg();
console.log("Transcoding to H.264...");

const transcode = spawnSync(ffmpegPath, [
  "-y", "-i", rawVideo,
  "-c:v", "libx264", "-preset", "medium", "-crf", "20",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  finalVideo,
], { stdio: "inherit" });
if (transcode.error) throw transcode.error;
if (transcode.status !== 0) throw new Error(`ffmpeg transcode failed with ${transcode.status}`);

const posterResult = spawnSync(ffmpegPath, ["-y", "-ss", "00:00:13", "-i", finalVideo, "-frames:v", "1", "-update", "1", "-q:v", "2", poster], { stdio: "inherit" });
if (posterResult.error) throw posterResult.error;
if (posterResult.status !== 0) throw new Error(`ffmpeg poster failed with ${posterResult.status}`);

await rm(rawVideo, { force: true });
await rm(captureRoot, { recursive: true, force: true });
console.log(`Built ${finalVideo}`);
