import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mime = new Map([[".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".png", "image/png"]]);
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

await new Promise((listen) => server.listen(0, "127.0.0.1", listen));
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 750, height: 1334 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${origin}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });

    assert.equal(await page.title(), "砖块小人与随身小物图鉴");
    assert.equal(await page.locator("#reward-preview").isVisible(), true);
    assert.equal((await page.locator("#reward-name").textContent()).trim(), "原皮战神");
    assert.equal((await page.locator("#gallery-count").textContent()).trim(), "45/45");
    assert.equal((await page.locator("#gallery-page").textContent()).trim(), "1/4");
    assert.equal(await page.locator(".character-card").count(), 12);
    assert.equal(await page.locator(".character-card.is-locked").count(), 0);
    assert.equal(await page.locator('.character-card[data-block-id="100001"] .character-layer').count() > 0, true);
    assert.equal(await page.locator('.character-card[data-block-id="100014"] .character-preview').count(), 1);

    const cardGeometry = await page.locator(".character-card").evaluateAll((cards) => cards.slice(0, 3).map((card) => card.getBoundingClientRect().toJSON()));
    assert.equal(new Set(cardGeometry.map(({ left }) => Math.round(left))).size, 3);
    if (viewport.width >= 1100) {
      assert.ok(Math.abs(cardGeometry[0].width - 150) < 1);
      assert.ok(Math.abs(cardGeometry[0].height - 164) < 1);
    }

    await page.locator('.character-card[data-block-id="100001"]').click();
    assert.equal(await page.locator("#character-detail").isVisible(), true);
    assert.equal(await page.locator("#atlas-list-panel").isVisible(), true);
    assert.equal(await page.locator("#detail-dialog").count(), 0);
    assert.equal(await page.locator('[aria-modal="true"]').count(), 0);
    assert.equal(new URL(page.url()).searchParams.get("character"), "100001");
    assert.equal(await page.locator("#detail-name").textContent(), "原皮战神");
    assert.equal(await page.locator("#reward-name").textContent(), "原皮战神");
    assert.equal(await page.locator("#detail-unlock").textContent(), "常规模式或活动模式通关后获得");
    assert.match(await page.locator("#diagnostic-rendered-lines").textContent(), /行/);
    const detailGeometry = await page.locator("#detail-description").evaluate((element) => ({ width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth + 1 }));
    if (viewport.width >= 1100) assert.ok(detailGeometry.width >= 250 && detailGeometry.width <= 390, "detail copy should stay compact beside the catalog");
    assert.equal(detailGeometry.overflow, false);

    await page.locator("#detail-next").click();
    assert.equal(await page.locator("#detail-name").textContent(), "黑帽快客");
    await page.locator("#detail-prev").click();
    assert.equal(await page.locator("#detail-name").textContent(), "原皮战神");
    await page.locator("#detail-favorite").click();
    assert.equal(await page.locator("#detail-favorite").getAttribute("aria-pressed"), "true");
    await page.locator("#gallery-search").fill("毛线架构师");
    assert.equal(await page.locator(".character-card").count(), 1);
    await page.locator("#gallery-search").fill("");

    const layout = await page.evaluate(() => {
      const list = document.querySelector("#atlas-list-panel").getBoundingClientRect();
      const detail = document.querySelector("#atlas-detail-panel").getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sideBySide: list.right <= detail.left + 1, stacked: list.bottom <= detail.top, inert: document.querySelector("main")?.inert ?? false };
    });
    assert.equal(layout.overflow, false);
    assert.equal(layout.inert, false);
    if (viewport.width >= 1100) assert.equal(layout.sideBySide, true);
    else assert.equal(layout.stacked, true);
    assert.deepEqual(errors, []);
    await page.close();
  }

  const deepLink = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await deepLink.goto(`${origin}/projects/brick-character-copy-preview/index.html?tab=characters&character=100014`, { waitUntil: "networkidle" });
  assert.equal(await deepLink.locator("#character-detail").isVisible(), true);
  assert.match(await deepLink.locator("#detail-name").textContent(), /./);
  await deepLink.close();
  console.log("Verified inline 45-character gallery and copy diagnostics.");
} finally {
  await browser.close();
  server.close();
}
