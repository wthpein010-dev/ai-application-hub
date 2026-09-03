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

const origin = await listenForFetch(server);
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${origin}/projects/brick-character-copy-preview/index.html`, { waitUntil: "networkidle" });

  const desktopPanels = await page.locator("#reward-preview, #atlas-list-panel, #atlas-detail-panel").evaluateAll((panels) => panels.map((panel) => ({
    width: panel.getBoundingClientRect().width,
    height: panel.getBoundingClientRect().height,
    scrollHeight: panel.scrollHeight,
    overflowY: getComputedStyle(panel).overflowY,
  })));
  assert.equal(desktopPanels.length, 3);
  assert.equal(desktopPanels.every((panel) => Math.abs(panel.width - desktopPanels[0].width) < 2), true, `desktop panels must share one width: ${desktopPanels.map((panel) => panel.width).join(", ")}`);
  assert.equal(desktopPanels.every((panel) => Math.abs(panel.height - desktopPanels[0].height) < 2 && panel.height >= 1000), true, `desktop panels must share an expanded height: ${desktopPanels.map((panel) => panel.height).join(", ")}`);
  assert.equal(desktopPanels.every((panel) => panel.overflowY !== "auto" && panel.scrollHeight <= panel.height + 1), true, "desktop panels must expose their full content without internal scrollbars");
  assert.equal(await page.locator("#character-reward-preview .reward-light").evaluate((light) => getComputedStyle(light).animationName), "none");

  await page.locator("#tab-trinkets").click();
  assert.equal(await page.locator("#tab-trinkets").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".trinket-card").count(), 11);
  assert.equal(await page.locator('.trinket-card[data-item-id="1"]').getAttribute("data-equipped"), "true", "entering the small-object tab must establish a complete default equipped preview");
  assert.match(await page.locator("#trinket-stage-figure .trinket-hand-anchor img").getAttribute("src"), /hand_1\.png/);
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
  assert.equal(await page.locator("#trinket-reward-preview").isVisible(), true);
  assert.equal(await page.locator("#trinket-reward-preview .character-figure").count(), 0, "the left panel must show only the isolated small-object art");
  assert.equal(await page.locator("#trinket-reward-preview img").count(), 1);
  assert.equal(await page.locator("#trinket-reward-preview img").evaluate((image) => image.naturalWidth > 0 && image.naturalHeight > 0), true);
  assert.equal(await page.locator("#trinket-reward-preview img").evaluate((image) => getComputedStyle(image).getPropertyValue("--trinket-reward-scale").trim()), "1", "the large left preview must retain the complete source canvas rather than the cropped card scale");
  const rewardArtCenter = await page.locator("#trinket-reward-preview img").evaluate((image) => {
    const stage = image.closest(".trinket-reward-stage");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let maxX = -1;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 4) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    }
    const imageRect = image.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const artCenter = imageRect.left - stageRect.left + ((minX + maxX) / 2 / width) * imageRect.width;
    return artCenter / stageRect.width;
  });
  assert.ok(rewardArtCenter > 0.4 && rewardArtCenter < 0.6, `the painted small object must be centered in the left preview, got ${rewardArtCenter}`);
  await page.locator("#trinket-favorite").click();
  assert.equal(await page.locator("#trinket-favorite").getAttribute("aria-pressed"), "true");

  assert.equal(await page.getByRole("button", { name: "试穿" }).count(), 0, "equipping must not need a secondary try-on button");
  assert.equal(await page.locator("#trinket-remove").isVisible(), true);
  assert.equal(await page.locator('.trinket-card[data-item-id="4"]').getAttribute("data-equipped"), "true");
  assert.equal(await page.locator('.trinket-card[data-item-id="4"]').getAttribute("aria-label"), "告白玫瑰，已装扮");
  assert.equal(await page.locator("#trinket-stage-figure .trinket-preview-rig").count(), 1);
  assert.equal(await page.locator("#trinket-stage-figure .trinket-hand-anchor").count(), 1);
  const equippedGeometry = await page.locator("#trinket-stage-figure").evaluate((stage) => {
    const rig = stage.querySelector(".trinket-preview-rig");
    const anchor = stage.querySelector(".trinket-hand-anchor");
    const item = anchor?.querySelector("img");
    if (!rig || !anchor || !item) return null;
    const rigRect = rig.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      anchorInsideRig: anchorRect.left >= rigRect.left - 1 && anchorRect.right <= rigRect.right + 1 && anchorRect.top >= rigRect.top - 1 && anchorRect.bottom <= rigRect.bottom + 1,
      itemInsideAnchor: itemRect.left >= anchorRect.left - 1 && itemRect.right <= anchorRect.right + 1 && itemRect.top >= anchorRect.top - 1 && itemRect.bottom <= anchorRect.bottom + 1,
      naturalWidth: item.naturalWidth,
      naturalHeight: item.naturalHeight,
    };
  });
  assert.deepEqual(equippedGeometry && {
    anchorInsideRig: equippedGeometry.anchorInsideRig,
    itemInsideAnchor: equippedGeometry.itemInsideAnchor,
  }, { anchorInsideRig: true, itemInsideAnchor: true });
  assert.ok((equippedGeometry?.naturalWidth || 0) > 0 && (equippedGeometry?.naturalHeight || 0) > 0);
  assert.match(await page.locator("#trinket-stage-figure .trinket-hand-anchor img").getAttribute("src"), /hand_4\.png/);

  await page.locator('.trinket-card[data-item-id="7"]').click();
  assert.equal(await page.locator('.trinket-card[data-item-id="7"]').getAttribute("data-equipped"), "true");
  assert.equal(await page.locator('.trinket-card[data-item-id="4"]').getAttribute("data-equipped"), "false");
  assert.match(await page.locator("#trinket-stage-figure .trinket-hand-anchor img").getAttribute("src"), /hand_7\.png/);
  await page.locator("#trinket-remove").click();
  assert.equal(await page.locator("#trinket-stage-figure .trinket-hand-anchor").count(), 0, "remove must clear the equipped layer immediately");
  assert.equal(await page.locator('.trinket-card[data-item-id="7"]').getAttribute("data-equipped"), "false");
  const persistedPreview = await page.evaluate(() => JSON.parse(localStorage.getItem("brick-gallery-trinket-preview-v1")));
  assert.equal(persistedPreview.equippedByCharacter["100001"], null, "remove must preserve the unequipped state instead of silently restoring the last small object");
  await page.locator("#tab-characters").click();
  await page.locator("#tab-trinkets").click();
  assert.equal(await page.locator("#trinket-stage-figure .trinket-hand-anchor").count(), 0, "returning to the small-object tab must respect an explicit remove action");

  await page.locator("#trinket-sort").selectOption("quantity");
  assert.equal(await page.locator(".trinket-card").first().getAttribute("data-item-id"), "7");
  await page.locator("#trinket-search").fill("玫瑰");
  assert.equal(await page.locator(".trinket-card").count(), 1);
  await page.locator("#trinket-search").fill("");

  const layout = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.equal(layout, true);
  assert.deepEqual(errors, []);
  await page.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified trinket atlas, direct equip, remove, and full-height panel flows.");
