import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.LIGHTHOUSE_DEMO_OUTPUT || ".scratch/lighthouse-proposal-demo";
const url = process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:8765/projects/lighthouse-rescue/index.html";
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.LIGHTHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 520, height: 1050 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  recordVideo: { dir: output, size: { width: 520, height: 1050 } }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

async function click(x, y) {
  const box = await page.locator("#lighthouse-canvas").boundingBox();
  assert.ok(box, "Unity canvas is missing");
  await page.touchscreen.tap(box.x + box.width * x / 1080, box.y + box.height * y / 1920);
  await page.waitForTimeout(150);
}

async function at(started, seconds) {
  const delay = started + seconds * 1000 - Date.now();
  if (delay > 0) await page.waitForTimeout(delay);
}

async function shortCheckpoint(started, second) {
  await at(started, second);
  await click(285, 1585); // Repair
  await click(780, 1585); // Light
  await click(285, 1706); // Twenty likes complete the light target
  await click(780, 1706); // Cosmetic gift
  await at(started, second + 4);
  await click(285, 1585);
  await at(started, second + 8);
  await click(285, 1585);
}

async function longCheckpoint(started, second) {
  await at(started, second);
  await click(285, 1585);
  await click(780, 1585);
  await click(285, 1706);
  await at(started, second + 0.8);
  await click(285, 1585);
  await click(780, 1585);
}

try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
  await page.waitForTimeout(2500);

  // A complete normal-speed short-route round, including every rescue and the result.
  await click(150, 1865);
  const first = Date.now();
  await click(200, 1458); // Board
  await at(first, 21);
  await click(540, 1458); // Vote left
  await shortCheckpoint(first, 42);
  await shortCheckpoint(first, 77);
  await shortCheckpoint(first, 112);
  await at(first, 188);
  await page.screenshot({ path: join(output, "normal-speed-result.png") });

  // A second, accelerated long-route round shows the other valid route vote.
  await click(150, 1865);
  await click(960, 1865);
  await click(960, 1865);
  const second = Date.now();
  await click(200, 1458);
  await at(second, 2.8);
  await click(860, 1458); // Vote right
  await longCheckpoint(second, 5.6);
  await longCheckpoint(second, 10.6);
  await longCheckpoint(second, 15.6);
  await at(second, 26);
  await page.screenshot({ path: join(output, "accelerated-result.png") });
  assert.deepEqual(errors, [], "browser errors while recording");
  console.log(`Proposal demonstration recorded in ${output}`);
} finally {
  await context.close();
  await browser.close();
}
