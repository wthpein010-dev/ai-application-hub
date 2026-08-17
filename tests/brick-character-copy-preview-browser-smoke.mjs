import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestPath = normalize(decodeURIComponent((request.url || "/").split("?", 1)[0]).replace(/^\/+/, ""));
    let filePath = resolve(root, requestPath || "index.html");
    const fromRoot = relative(root, filePath);
    if (fromRoot.startsWith("..")) throw new Error("Invalid path");
    if (!extname(filePath)) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": mime.get(extname(filePath)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${origin}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "砖块角色文案预览");
    assert.equal(await page.locator("#rows tr").count(), 20);
    assert.equal(await page.locator("#preview-name").textContent(), "袋鼠团长");
    assert.equal(await page.locator("#preview-image").isHidden(), true);

    await page.locator('tr[data-index="10"]').click();
    assert.equal(await page.locator("#preview-name").textContent(), "原生松弛草");
    assert.equal(await page.locator("#preview-image").isVisible(), true);
    assert.ok(await page.locator("#preview-image").evaluate((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator("#rows .role-thumb").count(), 10);

    for (let index = 10; index < 20; index += 1) {
      await page.locator(`tr[data-index="${index}"]`).click();
      assert.ok(await page.locator("#preview-image").evaluate((image) => image.complete && image.naturalWidth > 0));
    }

    await page.locator('tr[data-index="7"]').click();
    assert.equal(await page.locator("#preview-name").textContent(), "搬砖本砖");
    assert.match(await page.locator("#preview-copy").textContent(), /失散的亲戚/);

    await page.locator("#search").fill("程序员");
    assert.equal(await page.locator("#rows tr").count(), 1);
    assert.equal(await page.locator("#rows .role-name").textContent(), "格码哥");

    const layout = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      tableOverflow: document.querySelector(".table-wrap").scrollWidth > document.querySelector(".table-wrap").clientWidth,
    }));
    assert.ok(layout.body <= layout.viewport + 1, `${viewport.width}px body overflow: ${JSON.stringify(layout)}`);
    if (viewport.width === 390) assert.equal(layout.tableOverflow, true);
    assert.deepEqual(errors, []);
    await page.close();
  }

  const videoPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const videoErrors = [];
  videoPage.on("console", (message) => {
    if (message.type() === "error") videoErrors.push(message.text());
  });
  videoPage.on("pageerror", (error) => videoErrors.push(error.message));
  await videoPage.goto(`${origin}/projects/brick-character-copy-preview/video/index.html`, { waitUntil: "networkidle" });
  await videoPage.locator("#loadVideo").click();
  await videoPage.waitForFunction(() => {
    const video = document.querySelector("#introVideo");
    return !video.hidden && video.readyState >= 2 && video.currentTime > 0;
  }, null, { timeout: 15_000 });
  const playback = await videoPage.locator("#introVideo").evaluate((video) => ({
    currentTime: video.currentTime,
    error: video.error?.message || "",
    trackMode: video.textTracks[0]?.mode || "",
  }));
  assert.ok(playback.currentTime > 0);
  assert.equal(playback.error, "");
  assert.equal(playback.trackMode, "showing");
  assert.deepEqual(videoErrors, []);
  await videoPage.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified brick character copy preview at desktop and mobile sizes.");
