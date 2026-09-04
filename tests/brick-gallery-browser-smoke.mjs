import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { listenForFetch } from "./helpers/fetch-safe-listener.mjs";

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

const origin = await listenForFetch(server);
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });

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
    assert.equal(await page.locator('.character-card[data-block-id="100014"] .character-preview').count(), 0);
    assert.equal(await page.locator('.character-card[data-block-id="100014"] .character-spine-sprite').count(), 6);

    const cardGeometry = await page.locator(".character-card").evaluateAll((cards) => cards.slice(0, 3).map((card) => card.getBoundingClientRect().toJSON()));
    assert.equal(new Set(cardGeometry.map(({ left }) => Math.round(left))).size, 3);
    if (viewport.width >= 1100) {
      assert.equal(cardGeometry.every((card) => Math.abs(card.width - cardGeometry[0].width) < 1), true);
      assert.ok(cardGeometry[0].width >= 120 && cardGeometry[0].width <= 135);
      assert.ok(Math.abs(cardGeometry[0].height / cardGeometry[0].width - (164 / 150)) < 0.02);
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

    const formalFrameRatio = 1.3584;
    const assertFormalLayeredFrame = async (selector, scene) => {
      const frames = await page.locator(selector).evaluateAll((figures) => figures.map((figure) => {
        const bounds = figure.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, ratio: bounds.height / bounds.width };
      }));
      assert.ok(frames.length > 0, `${scene} must render the selected layered character`);
      assert.equal(frames.every(({ width, height, ratio }) => width > 0 && height > width && Math.abs(ratio - formalFrameRatio) < 0.025), true,
        `${scene} must keep the full 180.57 × 245.28 formal Spine frame instead of cropping it into a square`);
    };
    await assertFormalLayeredFrame("#reward-character .character-figure--layered", "victory result");
    await assertFormalLayeredFrame("#detail-character .character-figure--layered", "character detail");

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

    await page.locator("#tab-trinkets").click();
    assert.equal(await page.locator("#trinket-detail").isVisible(), true);
    await assertFormalLayeredFrame("#trinket-stage-figure .character-figure--layered", "equipped trinket preview");
    await page.locator("#tab-characters").click();

    assert.deepEqual(errors, []);
    await page.close();
  }

  const deepLink = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await deepLink.goto(`${origin}/projects/brick-character-copy-preview/index.html?tab=characters&character=100014`, { waitUntil: "networkidle" });
  assert.equal(await deepLink.locator("#character-detail").isVisible(), true);
  assert.match(await deepLink.locator("#detail-name").textContent(), /./);
  await deepLink.close();

  const wideVictory = await browser.newPage({ viewport: { width: 2552, height: 1260 } });
  await wideVictory.goto(`${origin}/projects/brick-character-copy-preview/index.html?tab=characters&character=100001`, { waitUntil: "networkidle" });
  const victoryLayout = await wideVictory.evaluate(() => {
    const panel = document.querySelector("#reward-preview").getBoundingClientRect();
    const actions = document.querySelector(".reward-main-actions").getBoundingClientRect();
    const home = document.querySelector(".reward-home-action");
    const homeRange = document.createRange();
    homeRange.selectNodeContents(home);
    return {
      actionsLeft: (actions.left - panel.left) / panel.width,
      actionsWidth: actions.width / panel.width,
      actionsBottom: (panel.bottom - actions.bottom) / panel.height,
      homeLineCount: homeRange.getClientRects().length,
    };
  });
  assert.ok(victoryLayout.actionsLeft >= 0.28 && victoryLayout.actionsLeft <= 0.34, "wide victory actions should follow the game composition instead of being centered across the panel");
  assert.ok(victoryLayout.actionsWidth >= 0.55 && victoryLayout.actionsWidth <= 0.61, "wide victory actions should retain the compact game-sized action group");
  assert.ok(victoryLayout.actionsBottom >= 0.13 && victoryLayout.actionsBottom <= 0.20, "wide victory actions should keep the reference bottom breathing room");
  assert.equal(victoryLayout.homeLineCount, 1, "the compact game-sized return-home button must keep its label on one line");
  await wideVictory.close();

  for (const [blockId, name] of [[100004, "满眼心动"], [100008, "咩羊姐"], [100014, "黑帽快客"]]) {
    const layered = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const layeredErrors = [];
    layered.on("console", (message) => { if (message.type() === "error") layeredErrors.push(message.text()); });
    layered.on("pageerror", (error) => layeredErrors.push(error.message));
    layered.on("response", (response) => { if (response.status() >= 400) layeredErrors.push(`${response.status()} ${response.url()}`); });
    await layered.goto(`${origin}/projects/brick-character-copy-preview/index.html?tab=characters&character=${blockId}`, { waitUntil: "networkidle" });

    const figure = layered.locator("#detail-character .character-figure");
    assert.equal((await layered.locator("#detail-name").textContent()).trim(), name);
    assert.equal(await figure.locator(".character-limbs").count(), 0, `${name} must not receive fabricated CSS legs`);
    assert.equal(await figure.locator(".character-spine-sprite").count(), 6, `${name} must use four official leg segments and two feet`);
    const atlasSlices = await figure.locator("canvas.character-spine-sprite__atlas").evaluateAll(async (canvases) => {
      const image = await new Promise((resolve, reject) => {
        const source = new Image();
        source.addEventListener("load", () => resolve(source), { once: true });
        source.addEventListener("error", () => reject(new Error("formal Character Spine atlas failed to load")), { once: true });
        source.src = "./assets/spine/character.png";
      });
      const expectedSlices = [
        { x: 697, y: 75, width: 4, height: 20 },
        { x: 697, y: 75, width: 4, height: 20 },
        { x: 697, y: 75, width: 4, height: 20 },
        { x: 697, y: 75, width: 4, height: 20 },
        { x: 681, y: 19, width: 17, height: 10 },
        { x: 681, y: 19, width: 17, height: 10 },
      ];
      return canvases.map((canvas, index) => {
        const expected = expectedSlices[index];
        const expectedCanvas = document.createElement("canvas");
        expectedCanvas.width = expected.height;
        expectedCanvas.height = expected.width;
        const expectedContext = expectedCanvas.getContext("2d", { willReadFrequently: true });
        expectedContext.imageSmoothingEnabled = false;
        expectedContext.translate(0, expectedCanvas.height);
        expectedContext.rotate(-Math.PI / 2);
        expectedContext.drawImage(image, expected.x, expected.y, expected.width, expected.height, 0, 0, expected.width, expected.height);
        const actualPixels = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
        const expectedPixels = expectedContext.getImageData(0, 0, expectedCanvas.width, expectedCanvas.height).data;
        let mismatchedPixels = actualPixels.length === expectedPixels.length ? 0 : Math.max(actualPixels.length, expectedPixels.length);
        const firstDifferences = [];
        for (let pixel = 0; pixel < Math.min(actualPixels.length, expectedPixels.length); pixel += 1) {
          if (actualPixels[pixel] !== expectedPixels[pixel]) {
            mismatchedPixels += 1;
            if (firstDifferences.length < 8) firstDifferences.push({ pixel, actual: actualPixels[pixel], expected: expectedPixels[pixel] });
          }
        }
        return {
          width: canvas.width,
          height: canvas.height,
          expectedWidth: expectedCanvas.width,
          expectedHeight: expectedCanvas.height,
          mismatchedPixels,
          firstDifferences,
        };
      });
    });
    assert.equal(atlasSlices.every(({ width, height, expectedWidth, expectedHeight, mismatchedPixels }) => width === expectedWidth && height === expectedHeight && mismatchedPixels === 0), true, `${name} must sample each rotated formal Atlas rectangle exactly, before its CSS display rotation: ${JSON.stringify(atlasSlices)}`);
    const limbBounds = await figure.locator(".character-spine-sprite").evaluateAll((sprites, owner) => {
      const figureBounds = owner.getBoundingClientRect();
      return sprites.map((sprite) => {
        const bounds = sprite.getBoundingClientRect();
        const atlasCanvas = sprite.querySelector("canvas.character-spine-sprite__atlas");
        const pixels = atlasCanvas?.getContext("2d")?.getImageData(0, 0, atlasCanvas.width, atlasCanvas.height).data;
        let opaquePixels = 0;
        for (let index = 0; pixels && index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0) opaquePixels += 1;
        }
        return {
          hasPixels: opaquePixels > 0,
          width: bounds.width,
          height: bounds.height,
          left: (bounds.left - figureBounds.left) / figureBounds.width,
          top: (bounds.top - figureBounds.top) / figureBounds.height,
          widthRatio: bounds.width / figureBounds.width,
          heightRatio: bounds.height / figureBounds.height,
          inside: bounds.left >= figureBounds.left - 1
            && bounds.right <= figureBounds.right + 1
            && bounds.top >= figureBounds.top - 1
            && bounds.bottom <= figureBounds.bottom + 1,
        };
      });
    }, await figure.elementHandle());
    assert.equal(limbBounds.every(({ hasPixels, width, height, inside }) => hasPixels && width > 0 && height > 0 && inside), true, `${name} must render the official dark leg and foot pixels, rather than a different atlas region`);
    const formalLimbBounds = [
      { left: 0.36152, top: 0.81588, widthRatio: 0.03323, heightRatio: 0.08969 },
      { left: 0.36152, top: 0.88112, widthRatio: 0.03323, heightRatio: 0.08969 },
      { left: 0.58304, top: 0.81588, widthRatio: 0.03323, heightRatio: 0.08969 },
      { left: 0.58365, top: 0.88107, widthRatio: 0.03323, heightRatio: 0.08969 },
      { left: 0.35515, top: 0.93885, widthRatio: 0.10522, heightRatio: 0.04892 },
      { left: 0.57667, top: 0.93412, widthRatio: 0.10522, heightRatio: 0.04892 },
    ];
    assert.equal(limbBounds.every((bounds, index) => Object.entries(formalLimbBounds[index])
      .every(([field, expected]) => Math.abs(bounds[field] - expected) < 0.012)), true,
    `${name} must place each leg and foot using the formal Spine bone and attachment coordinates: ${JSON.stringify(limbBounds)}`);
    const layerBounds = await figure.locator(".character-layer").evaluateAll((layers, owner) => {
      const figureBounds = owner.getBoundingClientRect();
      return Object.fromEntries(layers.map((layer) => {
        const kind = [...layer.classList].find((className) => className.startsWith("character-layer--"))?.replace("character-layer--", "");
        const bounds = layer.getBoundingClientRect();
        return [kind, {
          left: (bounds.left - figureBounds.left) / figureBounds.width,
          top: (bounds.top - figureBounds.top) / figureBounds.height,
          width: bounds.width / figureBounds.width,
          height: bounds.height / figureBounds.height,
        }];
      }));
    }, await figure.elementHandle());
    const formalLayerBounds = {
      body: { left: 0.00155, top: 0.21861, width: 0.99684, height: 0.73386 },
      block: { left: 0.26738, top: 0.35162, width: 0.56488, height: 0.46783 },
      head: { left: 0.00155, top: 0.00114, width: 0.99684, height: 0.73386 },
      dress: { left: 0.00155, top: 0.21861, width: 0.99684, height: 0.73386 },
    };
    assert.equal(Object.entries(layerBounds).every(([kind, bounds]) => Object.entries(formalLayerBounds[kind])
      .every(([field, expected]) => Math.abs(bounds[field] - expected) < 0.012)), true,
    `${name} must preserve the formal Spine attachment position and size for every visual layer: ${JSON.stringify(layerBounds)}`);
    assert.deepEqual(layeredErrors, []);
    await layered.close();
  }
  console.log("Verified inline 45-character gallery and copy diagnostics.");
} finally {
  await browser.close();
  server.close();
}
