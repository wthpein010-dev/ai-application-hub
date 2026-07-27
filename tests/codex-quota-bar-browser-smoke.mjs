import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "artifacts", "codex-quota-bar", "browser");
await mkdir(artifacts, { recursive: true });

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".mp4", "video/mp4"],
  [".vtt", "text/vtt; charset=utf-8"],
  [".webp", "image/webp"],
  [".zip", "application/zip"],
]);

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = normalize(join(root, relativePath));
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end();
    return;
  }

  const size = statSync(filePath).size;
  const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
  response.setHeader("Content-Type", types.get(extname(filePath)) || "application/octet-stream");
  response.setHeader("Accept-Ranges", "bytes");
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    response.writeHead(206, {
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { "Content-Length": size });
  createReadStream(filePath).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch(
  process.platform === "win32"
    ? { args: ["--headless=new"], channel: "chrome", headless: true }
    : { headless: true },
);

const failures = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`${viewport.name} console: ${message.text()}`);
    });
    page.on("pageerror", (error) => failures.push(`${viewport.name} page: ${error.message}`));
    page.on("requestfailed", (request) => {
      failures.push(`${viewport.name} request: ${request.url()} ${request.failure()?.errorText}`);
    });

    await page.goto(`${origin}/projects/codex-quota-bar/index.html`, {
      waitUntil: "networkidle",
    });
    await page.locator(".pet-stage img").evaluate((image) => image.decode());
    const layout = await page.evaluate(() => {
      const bounds = (selector) => {
        const rectangle = document.querySelector(selector).getBoundingClientRect();
        return {
          bottom: rectangle.bottom,
          height: rectangle.height,
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top,
          width: rectangle.width,
        };
      };
      return {
        documentWidth: document.documentElement.scrollWidth,
        pet: bounds(".pet-stage"),
        preview: bounds(".desktop-preview"),
        quota: bounds(".quota-strip"),
        toast: bounds(".task-toast"),
        viewportWidth: window.innerWidth,
      };
    });
    assert.ok(layout.documentWidth <= layout.viewportWidth, `${viewport.name} page must not overflow`);
    assert.ok(layout.quota.bottom <= layout.pet.top + 8, `${viewport.name} quota must stay above pet`);
    assert.ok(
      layout.quota.right <= layout.toast.left || layout.toast.right <= layout.quota.left,
      `${viewport.name} task toast must not cover quota`,
    );
    for (const item of [layout.pet, layout.quota, layout.toast]) {
      assert.ok(item.left >= layout.preview.left && item.right <= layout.preview.right);
      assert.ok(item.top >= layout.preview.top && item.bottom <= layout.preview.bottom);
    }
    await page.screenshot({
      path: join(artifacts, `${viewport.name}-project.png`),
      fullPage: true,
    });
    await page.close();
  }

  const videoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  videoPage.on("console", (message) => {
    if (message.type() === "error") failures.push(`video console: ${message.text()}`);
  });
  videoPage.on("pageerror", (error) => failures.push(`video page: ${error.message}`));
  videoPage.on("requestfailed", (request) => {
    failures.push(`video request: ${request.url()} ${request.failure()?.errorText}`);
  });
  await videoPage.goto(`${origin}/projects/codex-quota-bar/video/index.html`, {
    waitUntil: "networkidle",
  });
  await videoPage.locator("#loadVideo").click();
  await videoPage.waitForFunction(() => {
    const video = document.querySelector("#introVideo");
    return !video.hidden && video.readyState >= 2;
  });
  await videoPage.locator("#introVideo").evaluate(async (video) => {
    await video.play();
  });
  await videoPage.waitForFunction(() => document.querySelector("#introVideo").currentTime > 0.5);
  const playback = await videoPage.locator("#introVideo").evaluate((video) => ({
    captionMode: video.textTracks[0]?.mode,
    currentTime: video.currentTime,
    duration: video.duration,
    error: video.error?.message || "",
    paused: video.paused,
    readyState: video.readyState,
    videoHeight: video.videoHeight,
    videoWidth: video.videoWidth,
  }));
  assert.equal(playback.error, "");
  assert.equal(playback.paused, false);
  assert.equal(playback.captionMode, "showing");
  assert.equal(playback.videoWidth, 1280);
  assert.equal(playback.videoHeight, 720);
  assert.ok(playback.duration >= 30 && playback.duration < 60);
  await videoPage.screenshot({
    path: join(artifacts, "desktop-video-playing.png"),
    fullPage: true,
  });
  await videoPage.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

assert.deepEqual(failures, []);
