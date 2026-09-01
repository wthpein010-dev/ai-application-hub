import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedCharacters = JSON.parse(await readFile(join(root, "projects", "brick-character-copy-preview", "data", "characters.json"), "utf8"));
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
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 750, height: 1334 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const failedResponses = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

    await page.goto(`${origin}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1_100);

    assert.equal(await page.title(), "砖块小人图鉴与文案校对");
    assert.equal((await page.locator("#gallery-count").textContent()).trim(), "45/45");
    assert.equal((await page.locator("#gallery-page").textContent()).trim(), "1/4");
    assert.equal(await page.locator(".character-card").count(), 12);
    assert.equal(await page.locator(".character-card.is-locked").count(), 0);
    assert.equal(await page.locator(".character-card .character-layer").count() > 12, true);
    assert.equal(await page.locator(".character-card").first().getAttribute("data-name"), "原皮战神");
    assert.equal(await page.locator(".character-card").nth(1).getAttribute("data-name"), "黑帽快客");
    assert.equal(await page.locator('a[href="./copy-review.html"]').count(), 1);
    assert.equal(await page.locator('a[href="../trinket-market/index.html"]').count(), 1);

    const cardGeometry = await page.locator(".character-card").evaluateAll((cards) => cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), width: rect.width, height: rect.height };
    }));
    assert.equal(new Set(cardGeometry.slice(0, 3).map(({ left }) => left)).size, 3);
    assert.equal(new Set(cardGeometry.slice(0, 3).map(({ top }) => top)).size, 1);
    assert.equal(new Set(cardGeometry.slice(0, 12).map(({ top }) => top)).size, 4);
    if (viewport.width === 1440) {
      assert.ok(Math.abs(cardGeometry[0].width - 170) < 1);
      assert.ok(Math.abs(cardGeometry[0].height - 180) < 1);
    }

    const historyLengthBeforeDetail = await page.evaluate(() => history.length);
    const firstCard = page.locator(".character-card").first();
    await firstCard.click();
    assert.equal(await page.locator("#detail-dialog").getAttribute("aria-hidden"), "false");
    assert.equal(await page.evaluate(() => history.length), historyLengthBeforeDetail + 1);
    assert.equal(new URL(page.url()).searchParams.get("character"), "100001");
    assert.equal(await page.locator("#detail-name").textContent(), "原皮战神");
    assert.equal(await page.locator("#detail-unlock").textContent(), "不加配饰自在生长，基础但绝不普通");
    assert.equal(await page.locator("#detail-description").textContent(), "没有配饰也敢直接出场，原皮才是最强皮肤。");
    assert.equal((await page.locator("#detail-position").textContent()).trim(), "1 / 45");
    assert.equal(await page.locator("#copy-diagnostics").isVisible(), true);
    assert.match(await page.locator("#diagnostic-rendered-lines").textContent(), /2 行/);

    const detailGeometry = await page.locator("#detail-description").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
        verticalOverflow: element.scrollHeight > element.clientHeight + 1,
      };
    });
    if (viewport.width === 1440) assert.ok(Math.abs(detailGeometry.width - 420) < 1);
    assert.equal(detailGeometry.horizontalOverflow, false);

    if (viewport.width === 1440) {
      assert.equal(await page.locator(".gallery-layout").evaluate((element) => element.inert), true);
      await page.locator("#detail-close").focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "detail-share");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "detail-close");

      const renderedBeforeResize = await page.locator("#diagnostic-rendered-lines").textContent();
      await page.locator("#detail-description").evaluate((element) => { element.style.width = "210px"; });
      await page.waitForFunction(
        (before) => document.querySelector("#diagnostic-rendered-lines")?.textContent !== before,
        renderedBeforeResize,
      );
      assert.notEqual(await page.locator("#diagnostic-rendered-lines").textContent(), renderedBeforeResize);
      await page.locator("#detail-description").evaluate((element) => { element.style.removeProperty("width"); });
      await page.waitForFunction(
        (before) => document.querySelector("#diagnostic-rendered-lines")?.textContent === before,
        renderedBeforeResize,
      );

      await page.locator("#detail-next").click();
      assert.equal(await page.locator("#detail-name").textContent(), "黑帽快客");
      await page.goBack();
      await page.waitForFunction(() => document.querySelector("#detail-name")?.textContent === "原皮战神");
      await page.goBack();
      await page.waitForFunction(() => document.querySelector("#detail-dialog")?.getAttribute("aria-hidden") === "true");
      assert.equal(new URL(page.url()).searchParams.has("character"), false);
      assert.equal(await page.locator(".gallery-layout").evaluate((element) => element.inert), false);
      await page.goForward();
      await page.waitForFunction(() => document.querySelector("#detail-dialog")?.getAttribute("aria-hidden") === "false");
      assert.equal(await page.locator("#detail-name").textContent(), "原皮战神");
    }

    await page.locator("#detail-next").click();
    assert.equal(await page.locator("#detail-name").textContent(), "黑帽快客");
    assert.equal((await page.locator("#detail-position").textContent()).trim(), "2 / 45");
    await page.locator("#detail-prev").click();
    assert.equal(await page.locator("#detail-name").textContent(), "原皮战神");

    await page.locator("#detail-favorite").click();
    assert.equal(await page.locator("#detail-favorite").getAttribute("aria-pressed"), "true");
    await page.locator("#detail-close").click();
    assert.equal(await page.locator("#detail-dialog").getAttribute("aria-hidden"), "true");
    assert.equal(await firstCard.evaluate((element) => element === document.activeElement), true);
    assert.equal(await firstCard.locator(".favorite-mark").isVisible(), true);

    await page.locator("#page-next").click();
    assert.equal((await page.locator("#gallery-page").textContent()).trim(), "2/4");
    assert.equal(await page.locator(".character-card").first().getAttribute("data-name"), "福气小猪");
    await page.locator("#gallery-search").fill("毛线架构师");
    assert.equal(await page.locator(".character-card").count(), 1);
    assert.equal(await page.locator(".character-card").first().getAttribute("data-name"), "毛线架构师");
    assert.equal((await page.locator("#gallery-page").textContent()).trim(), "1/1");
    await page.locator("#gallery-search").fill("");
    assert.equal(await page.locator(".character-card").count(), 12);

    await page.locator(".character-card").first().click();
    for (let index = 0; index < expectedCharacters.length; index += 1) {
      const expected = expectedCharacters[index];
      assert.equal(await page.locator("#detail-name").textContent(), expected.name);
      assert.equal(await page.locator("#detail-unlock").textContent(), expected.unlockDesc);
      assert.equal(await page.locator("#detail-description").textContent(), expected.galleryDesc);
      assert.equal((await page.locator("#detail-position").textContent()).trim(), `${index + 1} / 45`);
      await page.waitForFunction(() => Array.from(document.querySelectorAll("#detail-character img")).every((image) => image.complete && image.naturalWidth > 0));
      if (index < expectedCharacters.length - 1) await page.locator("#detail-next").click();
    }
    await page.locator("#detail-close").click();

    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(bodyOverflow, false);
    assert.deepEqual(failedResponses, []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Verified the 45-character gallery, detail diagnostics, and responsive layout.");
} finally {
  await browser.close();
  server.close();
}
