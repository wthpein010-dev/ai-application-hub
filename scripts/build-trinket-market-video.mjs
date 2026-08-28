import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const videoRoot = join(root, "projects", "trinket-market", "video");
const recordingRoot = join(videoRoot, ".recording");
const outputPath = join(videoRoot, "trinket-market-demo.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const durationSeconds = 60;
const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function safePath(urlPath) {
  const path = normalize(decodeURIComponent(urlPath.split("?", 1)[0]).replace(/^\/+/, ""));
  const absolute = resolve(root, path || "index.html");
  return relative(root, absolute).startsWith("..") ? null : absolute;
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
  acceptDownloads: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const video = page.video();

try {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`http://127.0.0.1:${port}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await page.locator("body[data-ready='true']").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 86, behavior: "instant" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: posterPath, type: "jpeg", quality: 90 });
  const startedAt = Date.now();

  async function at(second, action) {
    const remaining = second * 1000 - (Date.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
    if (action) await action();
  }

  await at(5, () => page.locator(".value-toggle").click());
  await at(10, () => page.locator("#sort-mode").selectOption("id"));
  await at(14, () => page.locator("#sort-direction").click());
  await at(17, () => page.locator("#sort-mode").selectOption("name"));
  await at(20, () => page.locator("#sort-mode").selectOption("manual"));
  await at(22, async () => {
    const cards = page.locator(".item-card");
    const first = await cards.nth(0).boundingBox();
    const ninth = await cards.nth(8).boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(ninth.x + ninth.width / 3, ninth.y + ninth.height / 2, { steps: 24 });
    await page.waitForTimeout(500);
    await page.mouse.up();
  });
  await at(29, () => page.locator("#edit-mode").click());
  await at(31, () => page.locator('.item-card[data-id="1"] .item-edit').click());
  await at(34, async () => {
    await page.locator("#edit-name").fill("便携冰水壶·典藏");
    await page.locator("#edit-rarity").fill("限定");
    await page.locator("#edit-acquired").fill("20001");
  });
  await at(39, () => page.locator("#item-form button[type='submit']").click());
  await at(44, () => page.locator("#export-json").click());
  await at(49, () => page.locator("#theme-select").selectOption("b"));
  await at(54, () => page.locator("#theme-select").selectOption("c"));
  await at(durationSeconds);
} finally {
  await page.close();
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

const webmPath = await video.path();
const mediaTool = process.env.FFMPEG_PATH || ffmpegPath;
const encoded = spawnSync(mediaTool, [
  "-y",
  "-i", webmPath,
  "-t", String(durationSeconds),
  "-vf", "scale=1280:720:flags=lanczos,fps=30",
  "-an",
  "-c:v", "libx264",
  "-profile:v", "high",
  "-level", "4.0",
  "-preset", "medium",
  "-crf", "22",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-metadata", "title=随身小物交易市场功能演示",
  outputPath,
], { stdio: "inherit" });

if (encoded.status !== 0) throw new Error(`ffmpeg failed with status ${encoded.status}`);
await rm(recordingRoot, { recursive: true, force: true });
console.log(outputPath);
