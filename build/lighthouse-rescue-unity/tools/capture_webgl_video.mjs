// Capture the real playable Unity WebGL canvas for the public stage recap.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(import.meta.dirname, "../../..");
const base = process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:8765/projects/lighthouse-rescue/index.html";
const scratch = join(root, ".superpowers/sdd/2026-09-29-lighthouse-rescue");
const browser = await chromium.launch({ headless: true });

async function captureRound(shortRoute) {
  const folder = join(scratch, shortRoute ? "release-short-capture" : "release-long-capture");
  mkdirSync(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
    await page.waitForTimeout(3300);
    const canvas = page.locator("#lighthouse-canvas");
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 480 && box.height > 800);
    const click = async (x, y) => {
      await page.mouse.click(box.x + box.width * x / 1080, box.y + box.height * y / 1920);
      await page.waitForTimeout(130);
    };
    const shot = async (index, name) => {
      const path = join(folder, `${shortRoute ? "short" : "long"}-0${index}-${name}.png`);
      await canvas.screenshot({ path });
      assert.ok(statSync(path).size > 200_000, `${name} screenshot is unexpectedly small`);
    };
    await click(960, 1865); // 4× simulation clock leaves room for real capture latency.
    await click(150, 1865); await click(200, 1458); // Start and board.
    if (shortRoute) await shot(1, "gathering");
    await page.waitForTimeout(5200);
    await click(shortRoute ? 540 : 850, 1458);
    if (shortRoute) await shot(2, "voting");
    await page.waitForTimeout(5200);
    if (!shortRoute) {
      await shot(3, "checkpoint");
      return;
    }
    for (let stage = 1; stage <= 3; stage++) {
      await click(285, 1706); await click(285, 1706);
      for (let count = 0; count < 3; count++) {
        await click(285, 1585);
        await page.waitForTimeout(850);
      }
      await shot(stage + 2, "checkpoint");
      await page.waitForTimeout(5200);
    }
    await shot(6, "finale");
    await page.waitForTimeout(10300);
    await shot(7, "result");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

try {
  await captureRound(true);
  await captureRound(false);
  console.log("Captured Unity WebGL short and long stage frames for the public video");
} finally {
  await browser.close();
}
