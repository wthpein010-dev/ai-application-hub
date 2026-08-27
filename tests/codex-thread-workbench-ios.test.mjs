import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iosRoot = resolve(root, "projects/codex-thread-workbench/ios");
const readIos = name => readFile(resolve(iosRoot, name));

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("iOS companion manifest is standalone and ships exact PNG icon sizes", async () => {
  const manifest = JSON.parse(await readIos("app.webmanifest"));
  assert.equal(manifest.name, "Codex 待确认悬浮助手");
  assert.equal(manifest.short_name, "Codex 待确认");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#071a16");
  assert.deepEqual(manifest.icons, [
    { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ]);
  assert.deepEqual(pngSize(await readIos("icon-192.png")), { width: 192, height: 192 });
  assert.deepEqual(pngSize(await readIos("icon-512.png")), { width: 512, height: 512 });
});

test("iOS page gives Safari install steps and states the desktop capability boundary", async () => {
  const html = (await readIos("index.html")).toString("utf8");
  assert.match(html, /rel="manifest" href="\.\/app\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icon-192\.png"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /分享/);
  assert.match(html, /添加到主屏幕/);
  assert.match(html, /iOS 沙箱/);
  assert.match(html, /不能置顶悬浮/);
  assert.match(html, /不能读取电脑上的 Codex 任务/);
  assert.match(html, /不能启动 Codex CLI/);
  assert.match(html, /Windows 与 macOS/);
  assert.match(html, /v2\.1\.8/);
  assert.match(html, /data-action="simulate-candidates"/);
  assert.match(html, /data-action="confirm-all"/);
});

test("service worker precaches only the iOS static shell", async () => {
  const listeners = new Map();
  let cachedUrls;
  const context = {
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() {},
      clients: { claim: async () => {} },
      location: new URL("https://example.test/projects/codex-thread-workbench/ios/service-worker.js"),
    },
    caches: {
      async open() {
        return { async addAll(urls) { cachedUrls = [...urls]; } };
      },
      async keys() { return ["codex-confirmation-ios-v1", "codex-confirmation-ios-v2"]; },
      async delete() { return true; },
      async match() { return undefined; },
    },
    fetch: async () => new Response("ok"),
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext((await readIos("service-worker.js")).toString("utf8"), context);

  assert.equal(listeners.has("install"), true);
  assert.equal(listeners.has("activate"), true);
  assert.equal(listeners.has("fetch"), true);
  let installPromise;
  listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.deepEqual(cachedUrls, [
    "./",
    "./index.html",
    "./styles.css?v=20260827-v218",
    "./app.js?v=20260827-v218",
    "./app.webmanifest",
    "./icon-192.png",
    "./icon-512.png",
  ]);
  assert.equal(cachedUrls.every(url => url.startsWith("./") && !url.startsWith("../")), true);
});

test("service worker activation deletes only obsolete caches owned by this iOS app", async () => {
  const listeners = new Map();
  const deleted = [];
  const context = {
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() {},
      clients: { claim: async () => {} },
      location: new URL("https://example.test/projects/codex-thread-workbench/ios/service-worker.js"),
    },
    caches: {
      async open() { return { async addAll() {} }; },
      async keys() {
        return [
          "codex-confirmation-ios-v1",
          "codex-confirmation-ios-v2",
          "codex-confirmation-ios-v218",
          "another-hub-pwa-v7",
        ];
      },
      async delete(key) { deleted.push(key); return true; },
      async match() { return undefined; },
    },
    fetch: async () => new Response("ok"),
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext((await readIos("service-worker.js")).toString("utf8"), context);

  let activatePromise;
  listeners.get("activate")({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;

  assert.deepEqual(deleted, ["codex-confirmation-ios-v1", "codex-confirmation-ios-v2"]);
});

test("offline fallback serves cached HTML only for navigation requests", async () => {
  const listeners = new Map();
  const cachedIndex = new Response("<main>offline shell</main>", {
    headers: { "Content-Type": "text/html" },
  });
  const context = {
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() {},
      clients: { claim: async () => {} },
      location: new URL("https://example.test/projects/codex-thread-workbench/ios/service-worker.js"),
    },
    caches: {
      async open() { return { async addAll() {} }; },
      async keys() { return []; },
      async delete() { return true; },
      async match(request) {
        return request === "./index.html" ? cachedIndex : undefined;
      },
    },
    fetch: async () => { throw new Error("offline"); },
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext((await readIos("service-worker.js")).toString("utf8"), context);

  const dispatchFetch = request => {
    let responsePromise;
    listeners.get("fetch")({
      request,
      respondWith(promise) { responsePromise = promise; },
    });
    return responsePromise;
  };

  const assetRequest = {
    method: "GET",
    mode: "no-cors",
    url: "https://example.test/projects/codex-thread-workbench/ios/missing.css",
  };
  await assert.rejects(dispatchFetch(assetRequest), /offline/);

  const navigationRequest = {
    method: "GET",
    mode: "navigate",
    url: "https://example.test/projects/codex-thread-workbench/ios/missing-route",
  };
  const fallback = await dispatchFetch(navigationRequest);
  assert.equal(await fallback.text(), "<main>offline shell</main>");
});

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".png", "image/png"],
]);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  let target = resolve(root, "." + normalize(pathname));
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
  if ((!target.startsWith(root + sep) && target !== root) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const stats = statSync(target);
  response.writeHead(200, { "Content-Length": stats.size, "Content-Type": contentTypes.get(extname(target)) || "application/octet-stream" });
  createReadStream(target).pipe(response);
});

async function launchBrowser() {
  const failures = [];
  for (const options of [
    { headless: true },
    { channel: "chrome", headless: true },
    { channel: "msedge", headless: true },
  ]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(`No Chromium-compatible browser is available.\n${failures.join("\n")}`);
}

test("iOS companion remains usable at 390 by 844 and confirms demo candidates", async () => {
  await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${server.address().port}/projects/codex-thread-workbench/ios/index.html`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.getByRole("button", { name: "模拟待确认出现" }).click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
    await page.getByRole("button", { name: "一键全部确认" }).click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 0);
    assert.match(await page.locator('[data-role="activity-log"]').textContent(), /已模拟确认 2 个任务/);
  } finally {
    await browser?.close();
    await new Promise(resolveServer => server.close(resolveServer));
  }
});

test("installed iOS companion reloads offline with styles and interaction intact", async () => {
  await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const url = `http://127.0.0.1:${server.address().port}/projects/codex-thread-workbench/ios/index.html`;
    await page.goto(url);
    await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("service worker timeout")), 5_000)),
    ]));
    await page.reload();
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

    await page.context().setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(
      await page.locator(".install-card").evaluate(element => getComputedStyle(element).borderRadius),
      "20px",
    );
    await page.getByRole("button", { name: "模拟待确认出现" }).click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
  } finally {
    if (browser) {
      const contexts = browser.contexts();
      await Promise.all(contexts.map(context => context.setOffline(false)));
    }
    await browser?.close();
    await new Promise(resolveServer => server.close(resolveServer));
  }
});
