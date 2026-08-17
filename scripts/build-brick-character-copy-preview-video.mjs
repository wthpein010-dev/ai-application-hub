import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const videoRoot = join(root, "projects", "brick-character-copy-preview", "video");
const recordingRoot = join(videoRoot, ".recording");
const outputPath = join(videoRoot, "brick-character-copy-preview-demo.mp4");
const posterPath = join(videoRoot, "poster.jpg");

const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
]);

function safePath(urlPath) {
  const path = normalize(decodeURIComponent(urlPath.split("?", 1)[0]).replace(/^\/+/, ""));
  const absolute = resolve(root, path || "index.html");
  const fromRoot = relative(root, absolute);
  if (fromRoot.startsWith("..") || fromRoot.includes(":\\")) return null;
  return absolute;
}

const server = createServer(async (request, response) => {
  try {
    let filePath = safePath(request.url || "/");
    if (!filePath) throw new Error("Invalid path");
    if (!extname(filePath)) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": mime.get(extname(filePath)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

await mkdir(recordingRoot, { recursive: true });
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: recordingRoot, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const video = page.video();

try {
  await page.goto(`http://127.0.0.1:${port}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: posterPath, type: "jpeg", quality: 90 });

  await page.waitForTimeout(4_000);
  await page.locator('tr[data-index="4"]').click();
  await page.waitForTimeout(4_000);
  await page.locator('tr[data-index="7"]').click();
  await page.waitForTimeout(4_000);
  await page.locator('tr[data-index="9"]').scrollIntoViewIfNeeded();
  await page.locator('tr[data-index="9"]').click();
  await page.waitForTimeout(4_000);
  await page.locator("#search").fill("程序员");
  await page.waitForTimeout(5_000);
  await page.locator('tr[data-index="6"]').click();
  await page.waitForTimeout(4_000);
  await page.locator("#search").fill("");
  await page.locator('tr[data-index="0"]').scrollIntoViewIfNeeded();
  await page.locator('tr[data-index="0"]').click();
  await page.waitForTimeout(5_000);
} finally {
  await page.close();
  await context.close();
  await browser.close();
  server.close();
}

const webmPath = await video.path();
const encoded = spawnSync(ffmpegPath, [
  "-y",
  "-i", webmPath,
  "-an",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "23",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  outputPath,
], { stdio: "inherit" });

if (encoded.status !== 0) throw new Error(`ffmpeg failed with status ${encoded.status}`);
await rm(recordingRoot, { recursive: true, force: true });
console.log(outputPath);
