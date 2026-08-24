import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "tests", "artifacts", "clickflow", "browser");
await mkdir(artifacts, { recursive: true });

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".mp4", "video/mp4"],
  [".vtt", "text/vtt; charset=utf-8"],
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
  response.setHeader("Content-Type", contentTypes.get(extname(filePath)) || "application/octet-stream");
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
const browser = await chromium.launch({
  args: ["--headless=new"],
  channel: process.platform === "win32" ? "chrome" : undefined,
  headless: true,
});

const failures = [];
try {
  const hub = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  hub.on("console", (message) => {
    if (message.type() === "error") failures.push(`hub console: ${message.text()}`);
  });
  hub.on("pageerror", (error) => failures.push(`hub page: ${error.message}`));
  await hub.goto(`${origin}/index.html#apps`, { waitUntil: "networkidle" });
  const clickFlowCard = hub.locator('#appGrid article[data-app-id="clickflow"]');
  await clickFlowCard.scrollIntoViewIfNeeded();
  assert.equal(await clickFlowCard.count(), 1);
  assert.equal(
    await clickFlowCard.locator("h3").textContent(),
    "ClickFlow 鼠标自动化",
  );
  assert.equal(
    await clickFlowCard.locator(".status-badge").textContent(),
    "桌面工具",
  );
  assert.equal(
    await clickFlowCard.locator(".card-meta > span").nth(1).textContent(),
    "桌面自动化工具",
  );
  assert.equal(
    await clickFlowCard.locator("xpath=following-sibling::article[1]").getAttribute("data-app-id"),
    "pureshrink",
  );
  assert.deepEqual(
    await clickFlowCard.locator(".card-actions a").allTextContents(),
    ["网页预览", "介绍视频", "Wins下载", "Mac下载"],
  );
  await hub.close();

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

    await page.goto(`${origin}/projects/clickflow/index.html`, { waitUntil: "networkidle" });
    assert.equal(
      await page.locator(".workbench-status").getAttribute("aria-live"),
      "polite",
      "dynamic task status should be announced without interrupting the user",
    );
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    assert.ok(layout.documentWidth <= layout.viewportWidth, `${viewport.name} guide must not overflow`);

    await page.locator('[data-field="x"]').fill("960");
    await page.locator('[data-field="y"]').fill("540");
    assert.equal(await page.locator("[data-coordinate]").textContent(), "960, 540");
    await page.locator('[data-action="point-start"]').click();
    assert.equal(await page.locator(".workbench-status").getAttribute("data-status"), "running");

    await page.locator('[data-mode="sequence"]').click();
    await page.locator('[data-action="record"]').click();
    await page.locator('[data-action="add-step"]').click();
    assert.equal(await page.locator("[data-step]").count(), 1);
    assert.equal(await page.locator(".workbench-status").getAttribute("data-status"), "recording");
    await page.locator('[data-action="replay"]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("[data-step].is-playing").count(), 1);
    await page.keyboard.press("F9");
    assert.equal(await page.locator("[data-status-title]").textContent(), "全部任务已停止");

    await page.screenshot({
      path: join(artifacts, `${viewport.name}-guide.png`),
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
  await videoPage.goto(`${origin}/projects/clickflow/video/index.html`, { waitUntil: "networkidle" });
  await videoPage.locator("#loadVideo").click();
  await videoPage.waitForFunction(() => {
    const video = document.querySelector("#introVideo");
    return !video.hidden && video.readyState >= 2;
  });
  await videoPage.locator("#introVideo").evaluate(async (video) => video.play());
  await videoPage.waitForFunction(() => document.querySelector("#introVideo").currentTime > 0.5);
  const playback = await videoPage.locator("#introVideo").evaluate((video) => ({
    captionMode: video.textTracks[0]?.mode,
    error: video.error?.message || "",
    height: video.videoHeight,
    paused: video.paused,
    width: video.videoWidth,
  }));
  assert.deepEqual(playback, {
    captionMode: "showing",
    error: "",
    height: 720,
    paused: false,
    width: 1280,
  });
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
