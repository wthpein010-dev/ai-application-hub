// Record actual animated Unity canvas frames from the local WebGL build.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const output = process.env.LIGHTHOUSE_CAPTURE_WEBM || join(root, ".superpowers", "sdd", "2026-10-03-lighthouse-pov-storm", "gameplay.webm");
const markersPath = output.replace(/\.webm$/i, ".json");
mkdirSync(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.LIGHTHOUSE_BROWSER_PATH || undefined });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:8765/projects/lighthouse-rescue/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
  await page.waitForTimeout(2000);
  const box = await page.locator("#lighthouse-canvas").boundingBox();
  assert.ok(box && box.width >= 390);

  await page.evaluate(() => {
    const canvas = document.querySelector("#lighthouse-canvas");
    if (!canvas.captureStream || !MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
      throw new Error("Unity canvas recording unavailable in this browser");
    const stream = canvas.captureStream(24);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 4_000_000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    window.__lighthouseRecord = { recorder, chunks, stream, started: performance.now() };
    recorder.start(1000);
  });
  const mark = async () => page.evaluate(() => (performance.now() - window.__lighthouseRecord.started) / 1000);
  const tap = async (x, y) => {
    await page.touchscreen.tap(box.x + box.width * x / 1080, box.y + box.height * y / 1920);
    await page.waitForTimeout(130);
  };
  const markers = { waiting: await mark() };
  await tap(960, 1865); await tap(960, 1865);
  await tap(150, 1865); await tap(200, 1458);
  markers.gathering = await mark();
  await page.waitForTimeout(2700);
  await tap(540, 1458);
  markers.voting = await mark();
  await page.waitForTimeout(2700);
  markers.checkpoint1 = await mark();
  for (let stage = 1; stage <= 3; stage++) {
    await tap(285, 1706); await tap(285, 1706);
    for (let count = 0; count < 3; count++) { await tap(285, 1585); await page.waitForTimeout(480); }
    await page.waitForTimeout(3200);
    if (stage < 3) markers[`checkpoint${stage + 1}`] = await mark();
  }
  await page.waitForTimeout(6000);
  markers.result = await mark();
  await page.waitForTimeout(2800);
  const capture = await page.evaluate(async () => {
    const { recorder, chunks, stream } = window.__lighthouseRecord;
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = event => reject(event.error || new Error("MediaRecorder failed"));
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: "video/webm" });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), bytes: blob.size };
  });
  assert.ok(capture.bytes > 100_000, "recording should contain animated gameplay");
  assert.deepEqual(errors, []);
  writeFileSync(output, Buffer.from(capture.base64, "base64"));
  writeFileSync(markersPath, JSON.stringify(markers, null, 2) + "\n");
  console.log(JSON.stringify({ output, bytes: capture.bytes, markers }));
} finally {
  await browser.close();
}
