import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadDefaultApps() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));
  const end = start + closing.index + 3;
  const source = runtime
    .slice(start, end + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };

  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}

function contentType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mp4": "video/mp4",
    ".vtt": "text/vtt; charset=utf-8",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = resolve(root, "." + normalize(pathname));

    if (!target.startsWith(root + sep) && target !== root) {
      response.writeHead(403).end();
      return;
    }

    const path = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;

    if (!existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }

    const stats = statSync(path);
    const range = request.headers.range;
    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Type": contentType(path),
    };

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [rawStart, rawEnd] = range.replace("bytes=", "").split("-");
      const start = rawStart ? Number(rawStart) : 0;
      const end = rawEnd ? Math.min(Number(rawEnd), stats.size - 1) : stats.size - 1;

      response.writeHead(206, {
        ...headers,
        "Content-Length": end - start + 1,
        "Content-Range": "bytes " + start + "-" + end + "/" + stats.size,
      });
      createReadStream(path, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, { ...headers, "Content-Length": stats.size });
    createReadStream(path).pipe(response);
  });
}

function startServer(server) {
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer("http://127.0.0.1:" + address.port);
    });
  });
}

function stopServer(server) {
  return new Promise((resolveServer) => server.close(resolveServer));
}

function urlPath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

const browserPath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => path && existsSync(path));

assert.ok(browserPath, "A local Chrome or Edge executable is required for browser verification.");

const server = createStaticServer();
const baseUrl = await startServer(server);
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const apps = loadDefaultApps();

try {
  for (const viewport of [
    { width: 1440, height: 900, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    const failedResources = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text() + " " + message.location().url);
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResources.push(response.status() + " " + response.url());
      }
    });

    for (const app of apps) {
      await page.goto(baseUrl + "/" + urlPath(app.video.replace(/^\.\//, "")), {
        waitUntil: "networkidle",
      });

      const layout = await page.evaluate(() => {
        const home = document.querySelector(".hub-video-home");
        const stage = document.querySelector(".hub-video-stage");
        const homeBox = home.getBoundingClientRect();
        const stageBox = stage.getBoundingClientRect();

        return {
          homeLeft: homeBox.left,
          homeTop: homeBox.top,
          homeHref: home.getAttribute("href"),
          stageHeight: stageBox.height,
          stageWidth: stageBox.width,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      assert.ok(layout.homeLeft >= 0 && layout.homeTop >= 0, app.id + " home action placement");
      assert.equal(layout.homeHref.endsWith("/index.html"), true, app.id + " home action target");
      assert.ok(layout.stageWidth <= 960.1, app.id + " stage max width");
      assert.ok(Math.abs(layout.stageWidth / layout.stageHeight - 16 / 9) <= 0.01, app.id + " stage ratio");
      assert.ok(layout.scrollWidth <= layout.viewportWidth, app.id + " horizontal overflow");
    }

    await context.close();
    assert.deepEqual(failedResources, [], viewport.name + " failed resources");
    assert.deepEqual(errors, [], viewport.name + " console errors");
  }

  for (const id of ["paws-level-editor", "nang-keng-pai-pai-xiang"]) {
    const app = apps.find((candidate) => candidate.id === id);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(baseUrl + "/" + urlPath(app.video.replace(/^\.\//, "")));
    await page.locator("#loadVideo").click();
    await page.waitForFunction(() => document.querySelector("#introVideo").currentSrc.length > 0);
    await page.waitForFunction(() => document.querySelector("#introVideo").currentTime > 0, null, {
      timeout: 20_000,
    });

    await context.close();
  }

  console.log("Verified " + apps.length + " pages at desktop and mobile sizes.");
} finally {
  await browser.close();
  await stopServer(server);
}
