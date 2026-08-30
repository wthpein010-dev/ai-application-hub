import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

const root = process.cwd();

function contentType(file) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[extname(file)] || "application/octet-stream";
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      const relative = pathname === "/" ? "projects/icecream/index.html" : pathname.slice(1);
      const file = normalize(join(root, relative));
      if (!file.startsWith(root)) throw new Error("outside root");
      const body = await readFile(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}/projects/icecream/index.html`
  };
}

test("IceCream demo waits for consent, then reports Unity loading progress", async t => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let loaderRequests = 0;
  await page.route("**/Build/WebGLPreview.loader.js*", async route => {
    loaderRequests += 1;
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        window.createUnityInstance = (canvas, config, onProgress) => {
          onProgress(0.42);
          return new Promise(resolve => {
            window.__finishIceCreamLoad = () => resolve({ SetFullscreen() {} });
          });
        };
      `
    });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });

  assert.equal(loaderRequests, 0, "Unity loader must not download before the player clicks start");
  await assert.doesNotReject(() => page.getByRole("heading", { name: "吃了个冰" }).waitFor());
  await assert.doesNotReject(() => page.getByRole("button", { name: "开始体验" }).waitFor());
  assert.equal(await page.locator("#loadingPanel").isVisible(), false);

  const stageRatio = await page.locator("#unity-canvas").evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  assert.ok(Math.abs(stageRatio - 750 / 1624) < 0.0001, `canvas ratio was ${stageRatio}`);

  await page.getByRole("button", { name: "开始体验" }).click();
  assert.equal(loaderRequests, 1);
  assert.equal(await page.locator("#loadingPanel").isVisible(), true);
  await page.getByText("正在加载资源 42%", { exact: true }).waitFor();
  assert.equal(await page.locator("#loadingText").innerText(), "正在加载资源 42%");

  await page.evaluate(() => window.__finishIceCreamLoad());
  await page.getByRole("button", { name: "游戏已启动" }).waitFor();
  assert.equal(await page.locator("#loadingPanel").isVisible(), false);
});

test("IceCream demo keeps the portrait stage inside a mobile viewport", async t => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const metrics = await page.evaluate(() => {
    const stage = document.querySelector("#stage").getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      stageBottom: stage.bottom,
      stageWidth: stage.width,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });

  assert.ok(metrics.bodyWidth <= metrics.viewportWidth, JSON.stringify(metrics));
  assert.ok(metrics.stageWidth <= metrics.viewportWidth, JSON.stringify(metrics));
  assert.ok(metrics.stageBottom > 0, JSON.stringify(metrics));
});

test("IceCream demo clears a failed loader before a successful retry", async t => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let loaderRequests = 0;
  await page.route("**/Build/WebGLPreview.loader.js*", async route => {
    loaderRequests += 1;
    if (loaderRequests === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        window.createUnityInstance = (canvas, config, onProgress) => {
          onProgress(1);
          return Promise.resolve({ SetFullscreen() {} });
        };
      `
    });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "开始体验" }).click();
  await page.getByRole("button", { name: "重新加载" }).waitFor();
  assert.equal(await page.locator("#unity-warning div").count(), 1);

  await page.getByRole("button", { name: "重新加载" }).click();
  await page.getByRole("button", { name: "游戏已启动" }).waitFor();

  assert.equal(loaderRequests, 2);
  assert.equal(await page.locator("#unity-warning div").count(), 0, "stale errors must be cleared");
  assert.equal(
    await page.locator('script[src*="WebGLPreview.loader.js"]').count(),
    1,
    "the failed loader element must not remain in the document"
  );
});

test("IceCream fullscreen control targets the portrait stage", async t => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function requestFullscreen() {
      window.__fullscreenTarget = this.id;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "全屏" }).click();

  assert.equal(await page.evaluate(() => window.__fullscreenTarget), "stage");
  const ratio = await page.locator("#unity-canvas").evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  assert.ok(Math.abs(ratio - 750 / 1624) < 0.0001, `fullscreen canvas ratio was ${ratio}`);
});
