import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:8765/projects/lighthouse-rescue/index.html";
const output = process.env.LIGHTHOUSE_BROWSER_OUTPUT || ".superpowers/sdd/2026-09-29-lighthouse-rescue/browser-smoke";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.LIGHTHOUSE_BROWSER_PATH || undefined });

async function run(width, height, playRound) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600, isMobile: width < 600 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
  await page.waitForTimeout(3500); // Unity's splash can continue after loader promise resolves.
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(horizontalOverflow, false, `${width}px horizontal overflow`);
  assert.match(await page.locator(".mode-note").innerText(), /没有接入抖音直播间/);
  await page.screenshot({ path: join(output, `${width}-initial.png`), fullPage: false });
  if (playRound) {
    const box = await page.locator("#lighthouse-canvas").boundingBox();
    assert.ok(box && box.width > 250 && box.height > 450);
    const click = async (x, y) => {
      const px = box.x + box.width * x / 1080, py = box.y + box.height * y / 1920;
      if (width < 600) await page.touchscreen.tap(px, py);
      else await page.mouse.click(px, py);
      await page.waitForTimeout(130); // Unity processes input once per rendered frame.
    };
    const stageRegion = { x: box.x + box.width * 0.07, y: box.y + box.height * 0.14, width: box.width * 0.72, height: box.height * 0.075 };
    const waitingStage = await page.screenshot({ clip: stageRegion });
    await click(960, 1865); await click(960, 1865); // 8x
    await click(150, 1865); await click(200, 1458); // start and board
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(output, `${width}-after-start.png`), fullPage: false });
    const gatheringStage = await page.screenshot({ clip: stageRegion });
    assert.equal(waitingStage.equals(gatheringStage), false, "clicking Start must advance the Unity rules state");
    await page.waitForTimeout(2700); await click(540, 1458); // left route
    await page.waitForTimeout(2700);
    for (let stage = 0; stage < 3; stage++) {
      await click(285, 1706); await click(285, 1706); // 40 likes, two light
      for (let count = 0; count < 3; count++) {
        await click(285, 1585); // repair, 3-second game cooldown
        await page.waitForTimeout(480);
      }
      await page.waitForTimeout(3200);
    }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: join(output, `${width}-result.png`), fullPage: false });
  }
  assert.deepEqual(errors, [], `${width}px browser errors`);
  await context.close();
}

try {
  await run(1440, 1100, true);
  await run(390, 844, true);
  console.log("Lighthouse WebGL browser smoke passed: desktop and mobile playthroughs, no console/page errors or overflow");
} finally { await browser.close(); }
