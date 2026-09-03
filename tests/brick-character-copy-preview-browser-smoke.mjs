import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { listenForFetch } from "./helpers/fetch-safe-listener.mjs";

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

const origin = await listenForFetch(server);
const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const hub = await browser.newPage({ viewport });
    await hub.goto(`${origin}/index.html#engineering`, { waitUntil: "networkidle" });
    const engineeringCard = hub.locator('#engineeringGrid article[data-app-id="brick-character-copy-preview"]');
    assert.equal(await engineeringCard.count(), 1);
    assert.equal(await hub.locator('#appGrid article[data-app-id="brick-character-copy-preview"]').count(), 0);
    assert.equal(await engineeringCard.locator(".status-badge").textContent(), "工程体验");
    assert.equal(await hub.locator("#engineeringGrid article[data-app-id]").last().getAttribute("data-app-id"), "v-curve-tool");
    await hub.close();

    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${origin}/projects/brick-character-copy-preview/copy-review.html`, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "砖块角色文案预览");
    assert.equal(await page.locator("#rows tr").count(), 20);
    assert.equal(await page.locator("#preview-name").textContent(), "袋鼠团长");
    assert.equal(await page.locator("#preview-image").isVisible(), true);
    assert.equal(await page.locator("#rows .role-thumb").count(), 20);
    assert.equal(await page.locator("[data-upload-index]").count(), 20);

    assert.equal(await page.locator(".game-detail-overlay").isVisible(), true);
    assert.equal(await page.locator(".game-detail-panel").isVisible(), true);
    assert.equal(await page.locator("#preview-prev").count(), 1);
    assert.equal(await page.locator("#preview-next").count(), 1);
    assert.equal(await page.locator("#preview-favorite").getAttribute("aria-pressed"), "false");
    assert.match(await page.locator("#preview-favorite img").getAttribute("src"), /tujian_jues_save1\.png$/);

    const initialPreviewImage = await page.locator("#preview-image").getAttribute("src");
    await page.locator("#preview-next").click();
    assert.equal(await page.locator("#preview-name").textContent(), "淘闪闪");
    assert.equal(await page.locator("#preview-code").textContent(), "淘宝闪购骑手");
    assert.notEqual(await page.locator("#preview-image").getAttribute("src"), initialPreviewImage);
    assert.match(await page.locator("#preview-copy").textContent(), /付款键/);
    await page.locator("#preview-prev").click();
    assert.equal(await page.locator("#preview-name").textContent(), "袋鼠团长");

    await page.locator("#preview-favorite").click();
    assert.equal(await page.locator("#preview-favorite").getAttribute("aria-pressed"), "true");
    assert.match(await page.locator("#preview-favorite img").getAttribute("src"), /tujian_jues_save2\.png$/);
    await page.waitForFunction(() => document.querySelector("#preview-favorite img")?.naturalWidth > 0);

    const fixedArtworkGeometry = await page.locator(".artwork-fixed").evaluateAll((images) => images.map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        renderedRatio: rect.width / rect.height,
        naturalRatio: image.naturalWidth / image.naturalHeight,
      };
    }));
    assert.equal(
      fixedArtworkGeometry.every(({ renderedRatio, naturalRatio }) => Math.abs(renderedRatio - naturalRatio) < 0.03),
      true,
      `fixed artwork deformation: ${JSON.stringify(fixedArtworkGeometry)}`,
    );

    await page.locator('tr[data-index="10"]').click();
    assert.equal(await page.locator("#preview-name").textContent(), "原皮战神");
    assert.equal(await page.locator("#preview-image").isVisible(), true);
    assert.ok(await page.locator("#preview-image").evaluate((image) => image.complete && image.naturalWidth > 0));

    for (let index = 0; index < 20; index += 1) {
      await page.locator(`tr[data-index="${index}"]`).click();
      assert.ok(await page.locator("#preview-image").evaluate((image) => image.complete && image.naturalWidth > 0));
    }

    await page.locator('tr[data-index="7"]').click();
    assert.equal(await page.locator("#preview-name").textContent(), "搬砖本砖");
    assert.match(await page.locator("#preview-copy").textContent(), /失散的亲戚/);

    await page.locator("#search").fill("程序员");
    assert.equal(await page.locator("#rows tr").count(), 1);
    assert.equal(await page.locator("#rows .role-name").textContent(), "格码哥");

    await page.locator("#search").fill("");
    const previewGeometry = await page.locator(".preview-btn").evaluateAll((buttons) => buttons.map((button) => {
      const cell = button.closest("td");
      const buttonRect = button.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      return {
        oneLine: button.scrollHeight <= button.clientHeight,
        inside: buttonRect.left >= cellRect.left && buttonRect.right <= cellRect.right,
      };
    }));
    assert.equal(previewGeometry.every(({ oneLine, inside }) => oneLine && inside), true);

    const defaultImageSrc = await page.locator('tr[data-index="0"] .role-thumb').getAttribute("src");
    const uploadChooserPromise = page.waitForEvent("filechooser");
    await page.locator('[data-upload-index="0"]').click();
    const uploadChooser = await uploadChooserPromise;
    await uploadChooser.setFiles(join(root, "projects", "brick-character-copy-preview", "assets", "career-jd-courier.png"));
    await page.waitForFunction(() => document.querySelector("#upload-status")?.textContent.includes("已保存到当前浏览器"));
    assert.match(await page.locator("#upload-status").textContent(), /已保存到当前浏览器/);
    assert.match(await page.locator('tr[data-index="0"] .role-thumb').getAttribute("src"), /^blob:/);
    assert.match(await page.locator("#preview-image").getAttribute("src"), /^blob:/);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator('tr[data-index="0"] .role-thumb').waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector('tr[data-index="0"] .role-thumb')?.src.startsWith("blob:"));
    assert.equal(await page.locator('[data-restore-index="0"]').count(), 1);
    await page.locator('[data-restore-index="0"]').click();
    await page.waitForFunction(() => document.querySelector("#upload-status")?.textContent.includes("已恢复原图"));
    assert.match(await page.locator("#upload-status").textContent(), /已恢复原图/);
    assert.equal(await page.locator('tr[data-index="0"] .role-thumb').getAttribute("src"), defaultImageSrc);

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator('tr[data-index="0"] .role-thumb').getAttribute("src"), defaultImageSrc);

    if (viewport.width === 1440) {
      const unsupportedChooserPromise = page.waitForEvent("filechooser");
      await page.locator('[data-upload-index="0"]').click();
      const unsupportedChooser = await unsupportedChooserPromise;
      await unsupportedChooser.setFiles({ name: "not-an-image.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
      await page.waitForFunction(() => document.querySelector("#upload-status")?.textContent.includes("仅支持 PNG、JPG 和 WebP"));
      assert.match(await page.locator("#upload-status").textContent(), /仅支持 PNG、JPG 和 WebP/);
      assert.equal(await page.locator('tr[data-index="0"] .role-thumb').getAttribute("src"), defaultImageSrc);

      const oversizeChooserPromise = page.waitForEvent("filechooser");
      await page.locator('[data-upload-index="0"]').click();
      const oversizeChooser = await oversizeChooserPromise;
      await oversizeChooser.setFiles({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
      await page.waitForFunction(() => document.querySelector("#upload-status")?.textContent.includes("不能超过 8 MB"));
      assert.match(await page.locator("#upload-status").textContent(), /不能超过 8 MB/);
      assert.equal(await page.locator('tr[data-index="0"] .role-thumb').getAttribute("src"), defaultImageSrc);
    }

    const layout = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      tableOverflow: document.querySelector(".table-wrap").scrollWidth > document.querySelector(".table-wrap").clientWidth,
      detail: (() => {
        const panel = document.querySelector(".game-detail-panel").getBoundingClientRect();
        const action = document.querySelector(".game-action").getBoundingClientRect();
        const position = document.querySelector(".role-position").getBoundingClientRect();
        return {
          actionInsidePanel: action.top >= panel.top && action.bottom <= panel.bottom,
          actionClearOfPosition: action.bottom <= position.top,
        };
      })(),
    }));
    assert.ok(layout.body <= layout.viewport + 1, `${viewport.width}px body overflow: ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.detail, { actionInsidePanel: true, actionClearOfPosition: true });
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
