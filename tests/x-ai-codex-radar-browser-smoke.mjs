import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".mp4", "video/mp4"],
  [".vtt", "text/vtt; charset=utf-8"],
]);
const browserExecutable = [
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => existsSync(candidate));

assert.ok(browserExecutable, "a Chromium browser should be available");

const server = createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  let candidate = normalize(join(root, requestPath.replace(/^\/+/, "")));
  if (!candidate.startsWith(root)) return response.writeHead(403).end("Forbidden");
  try {
    if ((await stat(candidate)).isDirectory()) candidate = join(candidate, "index.html");
    const body = await readFile(candidate);
    response.writeHead(200, { "content-type": mimeTypes.get(extname(candidate)) || "application/octet-stream", "accept-ranges": "bytes" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const browserErrors = [];

async function openPage(viewport, path) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(origin)) browserErrors.push(`request: ${request.url()} ${request.failure()?.errorText}`);
  });
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  return page;
}

async function assertMobileHeaderLayout(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const { top, right, bottom, left } = document.querySelector(selector).getBoundingClientRect();
      return { top, right, bottom, left };
    };
    return {
      home: rect(".hub-home-link"),
      topbar: rect(".topbar"),
      brand: rect(".brand"),
      actions: rect(".top-actions"),
    };
  });
  assert.ok(boxes.home.bottom <= boxes.brand.top, `${label}: return control should not overlap the brand`);
  assert.ok(boxes.topbar.bottom >= boxes.brand.bottom, `${label}: topbar should contain the brand`);
  assert.ok(boxes.topbar.bottom >= boxes.actions.bottom, `${label}: topbar should contain its actions`);
  assert.ok(boxes.actions.right <= boxes.topbar.right, `${label}: actions should stay inside the topbar`);
}

try {
  const desktop = await openPage({ width: 1280, height: 720 }, "/projects/x-ai-codex-radar/index.html");
  assert.equal(await desktop.title(), "AI / Codex 雷达");
  assert.equal(await desktop.locator("#resultCount").textContent(), "8");
  assert.match(await desktop.locator(".boundary").innerText(), /示例数据/);
  assert.match(await desktop.locator(".secondary-button").innerText(), /需 ChatGPT 登录/);
  assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);

  await desktop.selectOption("#topicFilter", "Codex");
  assert.equal(await desktop.locator("#resultCount").textContent(), "2");
  await desktop.selectOption("#confidenceFilter", "high");
  await desktop.click('[data-signal-id="codex-review"]');
  assert.match(await desktop.locator("#detailPanel h3").innerText(), /代码审查/);
  await desktop.fill("#searchInput", "不存在的测试词");
  assert.equal(await desktop.locator("#emptyState").isVisible(), true);
  await desktop.click("[data-reset-filters]");
  assert.equal(await desktop.locator("#resultCount").textContent(), "8");
  await desktop.close();

  const mobile = await openPage({ width: 390, height: 844 }, "/projects/x-ai-codex-radar/index.html");
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await assertMobileHeaderLayout(mobile, "390px");
  await mobile.selectOption("#topicFilter", "Agent");
  assert.equal(await mobile.locator("#resultCount").textContent(), "2");
  await mobile.click('[data-signal-id="agent-memory"]');
  assert.match(await mobile.locator("#detailPanel h3").innerText(), /长期记忆/);
  assert.equal(await mobile.locator("#detailPanel").isVisible(), true);
  await mobile.close();

  const tablet = await openPage({ width: 760, height: 900 }, "/projects/x-ai-codex-radar/index.html");
  assert.equal(await tablet.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await assertMobileHeaderLayout(tablet, "760px");
  await tablet.close();

  const video = await openPage({ width: 1280, height: 720 }, "/projects/x-ai-codex-radar/video/index.html");
  await video.click("#loadVideo");
  await video.waitForFunction(() => {
    const player = document.querySelector("#introVideo");
    return player && player.readyState >= 1 && player.videoWidth === 1280 && player.videoHeight === 720;
  });
  const media = await video.locator("#introVideo").evaluate(async (player) => {
    await player.play();
    await new Promise((resolve) => setTimeout(resolve, 650));
    return {
      currentTime: player.currentTime,
      duration: player.duration,
      width: player.videoWidth,
      height: player.videoHeight,
      captionMode: player.textTracks[0]?.mode || "",
    };
  });
  assert.ok(media.currentTime > 0, "video playback should advance");
  assert.ok(media.duration >= 60 && media.duration <= 90);
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.equal(media.captionMode, "showing");
  await video.close();

  assert.deepEqual(browserErrors, []);
  console.log("AI / Codex Radar browser smoke passed on desktop, mobile, and H.264 playback.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
