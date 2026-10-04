import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Opt-in WebGL acceptance. These are Chromium viewports, not physical phone benchmarks.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = process.env.LIGHTHOUSE_BROWSER_OUTPUT;
if (output) mkdirSync(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png" };
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const target = resolve(root, "." + name);
  if (!target.startsWith(root + sep) || !existsSync(target) || statSync(target).isDirectory()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream",
    "Content-Length": statSync(target).size, "Cache-Control": "no-store" });
  createReadStream(target).pipe(response);
});

const minimumDesktopFps = Number(process.env.LIGHTHOUSE_MIN_DESKTOP_UNITY_FPS || 30);
const minimumMobileFps = Number(process.env.LIGHTHOUSE_MIN_EMULATED_MOBILE_UNITY_FPS || 15);
const maximumP95Ms = Number(process.env.LIGHTHOUSE_MAX_UNITY_P95_MS || 100);
const metricsTimeoutMs = Number(process.env.LIGHTHOUSE_METRICS_READY_TIMEOUT_MS || 30000);
assert.ok(Number.isFinite(minimumDesktopFps) && minimumDesktopFps > 0);
assert.ok(Number.isFinite(minimumMobileFps) && minimumMobileFps > 0);
assert.ok(Number.isFinite(maximumP95Ms) && maximumP95Ms > 0);

await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
const baseUrl = process.env.LIGHTHOUSE_BASE_URL || `http://127.0.0.1:${server.address().port}/projects/lighthouse-rescue/index.html`;
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.LIGHTHOUSE_BROWSER_PATH || undefined });

async function verifyNormalModeHasNoExport() {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const url = baseUrl;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => window.__lighthouseMetrics), undefined,
      "normal play must not export metrics");
  } finally {
    await context.close();
  }
}

async function run(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
    hasTouch: width < 600, isMobile: width < 600 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const requestedUrl = new URL(baseUrl);
  requestedUrl.searchParams.set("lighthouseMetrics", "1");
  const url = requestedUrl.href;
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
    await page.waitForFunction(() => window.__lighthouseMetrics?.source === "Unity.Time.unscaledDeltaTime",
      undefined, { timeout: metricsTimeoutMs });
    await page.waitForTimeout(2500); // Loader promise can resolve before Unity's splash clears.
    const box = await page.locator("#lighthouse-canvas").boundingBox();
    assert.ok(box && box.width > 250 && box.height > 450);
    const click = async (x, y) => {
      const px = box.x + box.width * x / 1080, py = box.y + box.height * y / 1920;
      if (width < 600) await page.touchscreen.tap(px, py);
      else await page.mouse.click(px, py);
      await page.waitForTimeout(150);
    };
    const metrics = () => page.evaluate(() => window.__lighthouseMetrics);
    const phase = async (expected, timeout = 50000) => {
      try {
        await page.waitForFunction(value => window.__lighthouseMetrics?.phase === value,
          expected, { timeout });
      } catch (error) {
        throw new Error(`Expected ${expected}, last Unity state ${JSON.stringify(await metrics())}`, { cause: error });
      }
    };
    const completeCheckpoint = async () => {
      await click(285, 1585); // Repair, initial progress is one of four.
      await click(780, 1585); // Light.
      await click(285, 1706); // 20 likes grant the third light point.
      await page.waitForTimeout(3200); // Same-user repair cooldown is three game seconds.
      await click(285, 1585);
      await page.waitForTimeout(3200);
      await click(285, 1585);
    };

    await phase("Waiting");
    if (output) await page.screenshot({ path: join(output, `${width}-initial.png`) });
    const roundStartedAt = Date.now();
    await click(150, 1865); // Start at 1x; never touch the speed control.
    await phase("Gathering", 5000);
    await click(200, 1458); // Board.
    await phase("Voting", 35000);
    await click(540, 1458); // Left / short route.
    for (const name of ["Checkpoint1", "Checkpoint2", "Checkpoint3"]) {
      await phase(name);
      await completeCheckpoint();
      if (output) await page.screenshot({ path: join(output, `${width}-${name}.png`) });
    }
    await phase("Finale");
    await phase("Result");
    const roundWallSeconds = (Date.now() - roundStartedAt) / 1000;
    assert.ok(roundWallSeconds >= 170,
      `normal 1x round finished implausibly fast: ${roundWallSeconds}s`);
    const result = await metrics();
    if (output) await page.screenshot({ path: join(output, `${width}-result.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
      `${width}px horizontal overflow`);
    assert.deepEqual(Object.keys(result).sort(), ["outcome", "phase", "phases", "route", "saved",
      "source", "total"].sort(), "metrics must contain only aggregate timing and game state");
    assert.equal(result.route, "ShortLeft");
    assert.equal(result.outcome, "FullSuccess");
    assert.equal(result.saved, 3);
    assert.ok(result.total.sampleCount >= 1000,
      `insufficient Unity frame samples: ${result.total.sampleCount}`);
    assert.deepEqual(result.phases.map(item => item.phase), ["Waiting", "Gathering", "Voting",
      "Checkpoint1", "Checkpoint2", "Checkpoint3", "Finale", "Result"]);
    for (const item of result.phases) {
      assert.deepEqual(Object.keys(item).sort(), ["maxFrameMs", "meanFrameMs", "meanFps",
        "p95FrameMsUpperBound", "phase", "sampleCount", "slowFrameCount"].sort());
      assert.ok(item.sampleCount > 0, `Unity did not sample ${item.phase}`);
      assert.ok(Number.isFinite(item.meanFrameMs) && Number.isFinite(item.maxFrameMs));
      assert.ok(Number.isFinite(item.p95FrameMsUpperBound));
    }
    const minimumFps = width < 600 ? minimumMobileFps : minimumDesktopFps;
    assert.ok(result.total.meanFps >= minimumFps,
      `${width}px Chromium viewport Unity main-loop rate ${result.total.meanFps} < ${minimumFps}`);
    assert.ok(result.total.p95FrameMsUpperBound <= maximumP95Ms,
      `${width}px Chromium viewport Unity p95 frame time ${result.total.p95FrameMsUpperBound}ms > ${maximumP95Ms}ms`);
    assert.deepEqual(errors, [], `${width}px browser errors`);
    return { viewport: `${width}x${height}`, roundWallSeconds,
      environment: "Chromium emulation; Unity main-loop frame intervals, not GPU present FPS or physical hardware",
      ...result };
  } finally {
    await context.close();
  }
}

try {
  await verifyNormalModeHasNoExport();
  const results = [await run(1440, 1100), await run(390, 844)];
  const report = { kind: "lighthouse-unity-performance-smoke", baseUrl, results };
  if (output) writeFileSync(join(output, "unity-performance.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise(resolveServer => server.close(resolveServer));
}
