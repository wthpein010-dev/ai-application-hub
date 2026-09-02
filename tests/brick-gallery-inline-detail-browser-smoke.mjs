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
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);
const server = createServer(async (request, response) => {
  try {
    const requestPath = normalize(decodeURIComponent((request.url || "/").split("?", 1)[0]).replace(/^\/+/, ""));
    let filePath = resolve(root, requestPath || "index.html");
    if (relative(root, filePath).startsWith("..")) throw new Error("Invalid path");
    if (!extname(filePath)) filePath = join(filePath, "index.html");
    response.writeHead(200, { "content-type": mime.get(extname(filePath)) || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${origin}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });

    assert.equal(await page.title(), "砖块小人与随身小物图鉴");
    assert.equal(await page.locator("#reward-preview").isVisible(), true);
    assert.equal(await page.locator("#atlas-list-panel").isVisible(), true);
    assert.equal(await page.locator("#atlas-detail-panel").isVisible(), true);
    assert.equal(await page.locator("#detail-empty").isVisible(), true);
    assert.equal(await page.locator("#detail-dialog").count(), 0);
    assert.equal(await page.locator('[aria-modal="true"]').count(), 0);
    assert.equal(await page.locator(".character-card").count(), 12);

    await page.locator('.character-card[data-block-id="100014"]').click();
    assert.equal(await page.locator("#character-detail").isVisible(), true);
    assert.equal(await page.locator("#detail-empty").isVisible(), false);
    assert.equal(await page.locator("#atlas-list-panel").isVisible(), true);
    assert.equal((await page.locator("#detail-name").textContent()).trim(), "黑帽快客");
    assert.equal((await page.locator("#reward-name").textContent()).trim(), "黑帽快客");

    const before = await page.locator("#detail-name").textContent();
    await page.locator("#detail-next").click();
    assert.notEqual(await page.locator("#detail-name").textContent(), before);

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      reward: document.querySelector("#reward-preview").getBoundingClientRect().toJSON(),
      list: document.querySelector("#atlas-list-panel").getBoundingClientRect().toJSON(),
      detail: document.querySelector("#atlas-detail-panel").getBoundingClientRect().toJSON(),
      stage: document.querySelector("#detail-character").getBoundingClientRect().toJSON(),
      figure: document.querySelector("#detail-character .character-figure").getBoundingClientRect().toJSON(),
      inert: document.querySelector("main")?.inert ?? false,
    }));
    assert.equal(layout.overflow, false, `${viewport.width}px should not overflow`);
    assert.equal(layout.inert, false);
    if (viewport.width >= 1100) {
      assert.ok(layout.reward.right <= layout.list.left + 1, "reward and catalog must sit side by side");
      assert.ok(layout.list.right <= layout.detail.left + 1, "catalog and detail must sit side by side");
      assert.ok(layout.figure.left >= layout.stage.left - 1 && layout.figure.right <= layout.stage.right + 1, "character figure must stay within the compact stage");
      assert.ok(layout.figure.top >= layout.stage.top - 1 && layout.figure.bottom <= layout.stage.bottom + 1, "character figure must stay within the compact stage");
    }
    if (viewport.width < 1100) assert.ok(layout.list.bottom <= layout.detail.top, "narrow panels must stack without overlap");
    assert.deepEqual(errors, []);
    await page.close();
  }

  const deepLink = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await deepLink.goto(`${origin}/projects/brick-character-copy-preview/index.html?tab=characters&character=100014`, { waitUntil: "networkidle" });
  assert.equal(await deepLink.locator("#character-detail").isVisible(), true);
  await deepLink.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified inline landscape character details.");
