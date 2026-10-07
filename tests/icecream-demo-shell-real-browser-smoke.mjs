import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";

import { chromium } from "playwright";

const root = process.cwd();
const evidenceRoot = process.env.ICECREAM_EVIDENCE_DIR || tmpdir();
await mkdir(evidenceRoot, { recursive: true });
const types = {
  ".css": "text/css; charset=utf-8",
  ".data": "application/octet-stream",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm"
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "projects/icecream/index.html" : pathname.slice(1);
    const file = normalize(join(root, relative));
    if (!file.startsWith(root)) throw new Error("outside root");
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = process.env.ICECREAM_BASE_URL ||
  `http://127.0.0.1:${server.address().port}/projects/icecream/index.html`;
const browser = await chromium.launch({ headless: true });

try {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));

  let loaderRequests = 0;
  page.on("request", request => {
    if (request.url().includes("WebGLPreview.loader.js")) loaderRequests += 1;
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(loaderRequests, 0, "Unity loader requested before start");
  await page.screenshot({ path: join(evidenceRoot, "icecream-demo-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "开始体验" }).click();
  await page.getByRole("button", { name: "游戏已启动" }).waitFor({ timeout: 120_000 });
  const desktop = await page.evaluate(() => {
    const rect = document.querySelector("#unity-canvas").getBoundingClientRect();
    return { height: rect.height, ratio: rect.width / rect.height, title: document.title, width: rect.width };
  });
  assert.ok(Math.abs(desktop.ratio - 750 / 1624) < 0.0001, JSON.stringify(desktop));
  const pixels = await page.evaluate(() => new Promise(resolve => {
    const canvas = document.querySelector("#unity-canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return resolve({ colors: 0 });
    let attempts = 0;
    const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    function sample() {
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
      const colors = new Set();
      for (let offset = 0; offset < data.length; offset += 64)
        colors.add(`${data[offset] >> 4},${data[offset + 1] >> 4},${data[offset + 2] >> 4}`);
      if (colors.size > 64 || ++attempts >= 120) resolve({ colors: colors.size });
      else setTimeout(() => requestAnimationFrame(sample), 100);
    }
    requestAnimationFrame(sample);
  }));
  assert.ok(pixels.colors > 64, `Game canvas is blank or still on the splash screen: ${JSON.stringify(pixels)}`);
  await page.waitForTimeout(1000);
  await page.locator("#unity-canvas").screenshot({ path: join(evidenceRoot, "icecream-gameplay.png") });
  const clickGame = async (x, y) => {
    const box = await page.locator("#unity-canvas").boundingBox();
    await page.locator("#unity-canvas").click({ position: { x: box.width * x / 750, y: box.height * y / 1624 } });
  };
  for (const order of [[555, 195], [315, 435], [195]]) {
    for (const x of order) await clickGame(x, 904);
    await clickGame(375, 1394);
  }
  await page.waitForTimeout(4000);
  const readResult = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector("#unity-canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const pixel = (x, y) => {
      const offset = (Math.floor((1 - y / 1624) * height) * width + Math.floor(x / 750 * width)) * 4;
      return data.slice(offset, offset + 3);
    };
    const served = [155, 375, 595].map(center => {
      let count = 0;
      for (let x = center - 60; x <= center + 60; x += 2) {
        for (let y = 300; y <= 345; y += 2) {
          const [r, g, b] = pixel(x, y);
          if (g > 65 && g > r * 1.6 && g > b * 1.6) count++;
        }
      }
      return count;
    });
    const [r, g, b] = pixel(375, 900);
    resolve({ served, resultPanelVisible: r > 220 && g > 210 && b > 180 });
  })));
  const result = await readResult();
  assert.ok(result.resultPanelVisible && result.served.every(count => count > 10),
    `The three customers must be served and the result popup visible: ${JSON.stringify(result)}`);
  await page.locator("#unity-canvas").screenshot({ path: join(evidenceRoot, "icecream-first-level-result.png") });
  await clickGame(545, 928);
  await page.waitForTimeout(200);
  assert.equal((await readResult()).resultPanelVisible, false, "Next must dismiss the result popup");
  await page.locator("#unity-canvas").screenshot({ path: join(evidenceRoot, "icecream-next-level.png") });
  assert.deepEqual(errors, []);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("console", message => {
    if (message.type() === "error") mobileErrors.push(message.text());
  });
  mobile.on("pageerror", error => mobileErrors.push(error.message));
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(evidenceRoot, "icecream-demo-mobile.png"), fullPage: true });
  const mobileMetrics = await mobile.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollWidth: document.body.scrollWidth
  }));
  assert.ok(mobileMetrics.scrollWidth <= mobileMetrics.innerWidth, JSON.stringify(mobileMetrics));
  assert.ok(mobileMetrics.documentWidth <= mobileMetrics.innerWidth, JSON.stringify(mobileMetrics));
  assert.deepEqual(mobileErrors, []);

  console.log(JSON.stringify({ desktop, pixels, result, errors, loaderRequests, mobile: mobileMetrics, mobileErrors }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
