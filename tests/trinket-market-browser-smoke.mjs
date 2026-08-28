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
  const layouts = [
    { width: 1440, height: 1000, columns: 9 },
    { width: 1024, height: 1000, columns: 8 },
    { width: 736, height: 1000, columns: 6 },
    { width: 360, height: 1000, columns: 3 },
  ];

  for (const layout of layouts) {
    const page = await browser.newPage({ viewport: layout });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
    await page.locator("body[data-ready='true']").waitFor();

    assert.equal(await page.title(), "随身小物交易市场");
    assert.equal(await page.locator(".item-card").count(), 11);
    assert.equal(await page.locator("body").getAttribute("data-theme"), "a");
    assert.equal(await page.locator("#value-toggle").isChecked(), false);
    assert.equal(await page.locator(".item-price:not([hidden])").count(), 0);
    assert.equal(await page.locator(".item-art img[data-centered='true']").count(), 11);

    const firstRowCount = await page.locator(".item-card").evaluateAll((cards) => {
      const top = cards[0].getBoundingClientRect().top;
      return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - top) < 2).length;
    });
    assert.equal(firstRowCount, layout.columns);

    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      imageWidth: Number.parseFloat(getComputedStyle(document.querySelector(".item-art img")).width),
      nameSize: Number.parseFloat(getComputedStyle(document.querySelector(".item-name")).fontSize),
    }));
    assert.deepEqual(geometry, { overflow: false, imageWidth: 163, nameSize: 12 });

    await page.locator(".value-toggle").click();
    assert.equal(await page.locator("#value-toggle").isChecked(), true);
    assert.equal(await page.locator(".item-price:not([hidden])").count(), 11);
    assert.equal(await page.locator("#third-stat-label").textContent(), "参考总估值");
    assert.deepEqual(errors, []);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await page.locator("body[data-ready='true']").waitFor();

  assert.deepEqual(await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id))), [7, 1, 3, 8, 2, 9, 5, 4, 11, 6, 10]);
  await page.locator("#sort-mode").selectOption("id");
  assert.deepEqual(await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id))), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await page.locator("#sort-direction").click();
  assert.deepEqual(await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id))), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  await page.locator("#sort-mode").selectOption("name");
  assert.deepEqual((await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id)))).slice(0, 4), [1, 2, 4, 11]);

  await page.evaluate(() => window.TrinketMarketAPI.setAcquisitionCounts({ 1: 30000, 2: -1, 99: 2 }));
  await page.locator("#sort-mode").selectOption("acquired");
  assert.equal(await page.locator(".item-card").first().getAttribute("data-id"), "1");
  assert.match(await page.locator('.item-card[data-id="1"] .item-count').textContent(), /30,000/);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("trinket-market:counts", { detail: { 2: 31000 } })));
  assert.equal(await page.locator(".item-card").first().getAttribute("data-id"), "2");

  await page.locator("#sort-mode").selectOption("manual");
  await page.evaluate(() => {
    window.__gridMutations = 0;
    const grid = document.querySelector("#item-grid");
    window.__gridObserver = new MutationObserver((records) => {
      window.__gridMutations += records.filter((record) => record.type === "childList")
        .reduce((sum, record) => sum + record.addedNodes.length + record.removedNodes.length, 0);
    });
    window.__gridObserver.observe(grid, { childList: true });
  });
  const cards = page.locator(".item-card");
  const first = await cards.nth(0).boundingBox();
  const ninth = await cards.nth(8).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(ninth.x + ninth.width * 0.25, ninth.y + ninth.height / 2, { steps: 1 });
  await page.waitForTimeout(120);
  const during = await page.evaluate(() => ({
    active: document.querySelector("#item-grid").classList.contains("is-drag-active"),
    ghost: Boolean(document.querySelector(".drag-ghost")),
    sourceHidden: Number(getComputedStyle(document.querySelector(".item-card.is-dragging .item-card-content")).opacity) === 0,
    mutations: window.__gridMutations,
  }));
  assert.equal(during.active, true);
  assert.equal(during.ghost, true);
  assert.equal(during.sourceHidden, true);
  assert.ok(during.mutations <= 2, `cross-row drag used ${during.mutations} child mutations`);
  await page.mouse.up();
  await page.waitForTimeout(260);
  assert.equal(await page.locator(".drag-ghost").count(), 0);
  assert.equal(await page.locator(".item-card.is-dragging").count(), 0);
  assert.match(await page.locator("#drag-status").textContent(), /已移动到第/);
  assert.deepEqual(errors, []);
  await page.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified trinket market layout, sorting, count bridge, and cross-row drag.");
