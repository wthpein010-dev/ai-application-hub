import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";

import { chromium } from "playwright";

const root = process.cwd();
const types = {
  ".css": "text/css; charset=utf-8",
  ".data": "application/octet-stream",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
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
const url = `http://127.0.0.1:${server.address().port}/projects/icecream/index.html`;
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
  await page.screenshot({ path: join(tmpdir(), "icecream-demo-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "开始体验" }).click();
  await page.getByRole("button", { name: "游戏已启动" }).waitFor({ timeout: 120_000 });
  const desktop = await page.evaluate(() => {
    const rect = document.querySelector("#unity-canvas").getBoundingClientRect();
    return { height: rect.height, ratio: rect.width / rect.height, title: document.title, width: rect.width };
  });
  assert.ok(Math.abs(desktop.ratio - 750 / 1624) < 0.0001, JSON.stringify(desktop));
  assert.deepEqual(errors, []);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("console", message => {
    if (message.type() === "error") mobileErrors.push(message.text());
  });
  mobile.on("pageerror", error => mobileErrors.push(error.message));
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(tmpdir(), "icecream-demo-mobile.png"), fullPage: true });
  const mobileMetrics = await mobile.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollWidth: document.body.scrollWidth
  }));
  assert.ok(mobileMetrics.scrollWidth <= mobileMetrics.innerWidth, JSON.stringify(mobileMetrics));
  assert.ok(mobileMetrics.documentWidth <= mobileMetrics.innerWidth, JSON.stringify(mobileMetrics));
  assert.deepEqual(mobileErrors, []);

  console.log(JSON.stringify({ desktop, errors, loaderRequests, mobile: mobileMetrics, mobileErrors }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
