import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mime = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".png", "image/png"],
]);
const server = createServer(async (request, response) => {
  try {
    const requestPath = normalize(decodeURIComponent((request.url || "/").split("?", 1)[0]).replace(/^\/+/, ""));
    let filePath = resolve(root, requestPath || "index.html");
    if (relative(root, filePath).startsWith("..")) throw new Error("Invalid path");
    if (!extname(filePath)) filePath = join(filePath, "index.html");
    response.writeHead(200, { "content-type": mime.get(extname(filePath)) || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch { response.writeHead(404).end(); }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${origin}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });

  await page.locator("#tab-trinkets").click();
  assert.equal(await page.locator("#tab-trinkets").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".trinket-card").count(), 11);
  const firstRow = await page.locator(".trinket-card").evaluateAll((cards) => {
    const top = cards[0].getBoundingClientRect().top;
    return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - top) < 2).length;
  });
  assert.equal(firstRow, 4);
  assert.equal(await page.locator('.trinket-card[data-item-id="4"]').getAttribute("data-new"), "true");

  await page.locator('.trinket-card[data-item-id="4"]').click();
  assert.equal(await page.locator("#trinket-detail").isVisible(), true);
  assert.equal(await page.locator("#trinket-detail-name").textContent(), "告白玫瑰");
  assert.match(await page.locator("#trinket-detail-id").textContent(), /HAND-0004/);
  await page.locator("#trinket-favorite").click();
  assert.equal(await page.locator("#trinket-favorite").getAttribute("aria-pressed"), "true");

  await page.locator("#trinket-toggle-draft").click();
  assert.equal(await page.locator('.trinket-card[data-item-id="4"]').getAttribute("data-draft-selected"), "true");
  assert.equal(await page.locator("#trinket-save").isEnabled(), true);
  await page.locator("#trinket-save").click();
  assert.equal(await page.locator("#trinket-inline-flow").getAttribute("data-flow"), "save");
  await page.locator("#confirm-save").click();
  await page.getByText("保存成功", { exact: true }).waitFor();

  await page.locator("#trinket-sort").selectOption("quantity");
  assert.equal(await page.locator(".trinket-card").first().getAttribute("data-item-id"), "7");
  await page.locator("#trinket-search").fill("玫瑰");
  assert.equal(await page.locator(".trinket-card").count(), 1);
  await page.locator("#trinket-search").fill("");

  await page.locator("#open-warehouse").click();
  assert.equal(await page.locator("#trinket-inline-flow").getAttribute("data-flow"), "warehouse");
  assert.equal(await page.locator(".warehouse-card").count(), 11);
  await page.locator("#close-inline-flow").click();

  await page.locator("#open-gift").click();
  assert.equal(await page.locator("#trinket-inline-flow").getAttribute("data-flow"), "gift");
  await page.locator('input[name="gift-friend"][value="小羊好友 A"]').check();
  await page.locator("#confirm-gift").click();
  await page.getByText("赠送成功", { exact: true }).waitFor();

  const layout = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.equal(layout, true);
  assert.deepEqual(errors, []);
  await page.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified trinket atlas, preview, save, warehouse and gift flows.");
