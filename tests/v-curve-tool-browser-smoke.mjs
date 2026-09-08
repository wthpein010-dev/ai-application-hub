import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/build-hub-showcase-media.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = join(root, "artifacts/v-curve-v150/browser");
await mkdir(out, { recursive: true });
const server = process.env.HUB_BASE_URL ? null : createStaticServer();
if (server) await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = process.env.HUB_BASE_URL?.replace(/\/+$/u, "") || `http://127.0.0.1:${server.address().port}`;
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((path) => path && existsSync(path));
const browser = await chromium.launch({ executablePath, headless: true });
const evidence = { base, version: "1.5.0", views: [] };
async function ready(frame) {
  await frame.locator("#export-json:not([disabled])").waitFor({ timeout: 120_000 });
}
async function exportJson(page, frame, name) {
  const pending = page.waitForEvent("download");
  await frame.locator("#export-json").click();
  const download = await pending;
  const target = join(out, name);
  await download.saveAs(target);
  return JSON.parse(await readFile(target, "utf8"));
}
try {
  for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/projects/v-curve-tool/index.html`, { waitUntil: "networkidle" });
    const frame = page.frames().find((candidate) => candidate.url().includes("/v-curve-tool/app/"));
    assert.ok(frame, "real tool iframe must load");
    await ready(frame);
    assert.equal(await frame.locator("#model-select").inputValue(), "reference");
    assert.ok(await frame.locator("#left-level-select option").count() >= 37);
    for (const surface of [page, frame]) {
      const dimensions = await surface.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(dimensions.scroll <= dimensions.client + 1, `${viewport.name} horizontal overflow: ${JSON.stringify(dimensions)}`);
    }
    assert.equal(await page.locator(".hub-home-link").getAttribute("href"), "../../index.html#engineering");
    await page.screenshot({ path: join(out, `${viewport.name}-demo.png`), fullPage: true });
    const reference = await exportJson(page, frame, `${viewport.name}-reference.json`);
    assert.equal(reference.model.id, "reference");
    assert.equal(reference.model.version, "1.5.0");
    assert.equal(reference.left.metrics.openingV, 25);
    assert.equal(reference.right.metrics.openingV, 32);
    assert.equal(reference.left.metrics.mc25.p50, 28);
    assert.equal(reference.right.metrics.mc25.p50, 18);
    const rightBefore = await frame.locator("#right-level-select").inputValue();
    const alternative = await frame.locator("#left-level-select option").evaluateAll((options) => options.find((option) => !option.textContent.includes("900121"))?.value);
    await frame.locator("#left-level-select").selectOption(alternative);
    await ready(frame);
    assert.equal(await frame.locator("#right-level-select").inputValue(), rightBefore);
    await frame.locator("#model-select").selectOption("runtime");
    await ready(frame);
    const runtime = await exportJson(page, frame, `${viewport.name}-runtime.json`);
    assert.equal(runtime.model.id, "runtime");
    assert.equal(runtime.model.sideLock, false);
    assert.equal(runtime.model.progressDefinition, "removed");
    await frame.locator("#load-reference-sample").click();
    await ready(frame);
    const restored = await exportJson(page, frame, `${viewport.name}-restored.json`);
    assert.equal(restored.model.id, "reference");
    assert.equal(restored.left.metrics.openingV, 25);
    assert.equal(restored.right.metrics.openingV, 32);
    await page.goto(`${base}/projects/v-curve-tool/video/index.html`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".hub-video-home").getAttribute("href"), "../../../index.html#engineering");
    await page.locator("#loadVideo").click();
    await page.waitForFunction(() => document.querySelector("#introVideo").currentTime > 0.3, null, { timeout: 30_000 });
    const video = await page.locator("#introVideo").evaluate((element) => ({
      duration: element.duration, width: element.videoWidth, height: element.videoHeight,
      currentTime: element.currentTime, paused: element.paused, error: element.error,
      captions: element.textTracks[0]?.mode,
      scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
    }));
    assert.equal(video.width, 1280); assert.equal(video.height, 720);
    assert.ok(video.duration >= 45 && video.duration < 90);
    assert.equal(video.error, null); assert.equal(video.paused, false);
    assert.equal(video.captions, "showing"); assert.ok(video.scroll <= video.client + 1);
    await page.screenshot({ path: join(out, `${viewport.name}-video.png`), fullPage: true });
    assert.deepEqual(errors, [], `${viewport.name} browser errors`);
    evidence.views.push({ viewport, video, referenceOpeningV: [25, 32], referenceMc25P50: [28, 18], errors });
    await context.close();
  }
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
await writeFile(join(out, "acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
