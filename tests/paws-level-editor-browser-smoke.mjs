import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLevelDocument } from "../projects/paws-level-editor/core/level-adapter.mjs";
import { validateLevel } from "../projects/paws-level-editor/core/level-validator.mjs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  throw new Error(
    "Playwright is unavailable. Set NODE_PATH to the bundled runtime dependency node_modules paths before running this test.",
    { cause: error },
  );
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

async function assertBundledLevelIsValid() {
  const levelPath = resolve(
    repoRoot,
    "projects",
    "paws-level-editor",
    "levels",
    "level_showcase.json",
  );
  const value = JSON.parse(await readFile(levelPath, "utf8"));
  assert.deepEqual(
    value.tiles,
    value.designerNote.levelData,
    "top-level tiles and designerNote.levelData should stay synchronized",
  );
  const document = parseLevelDocument(value, {
    fileName: "level_showcase.json",
    version: "browser-smoke",
  });
  const errors = validateLevel(document).filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, [], `bundled showcase validation errors:\n${JSON.stringify(errors, null, 2)}`);
}

function startStaticServer() {
  const rootPrefix = `${resolve(repoRoot)}${sep}`;
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const requestedPath = resolve(repoRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (requestedPath !== resolve(repoRoot) && !requestedPath.startsWith(rootPrefix)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const details = await stat(requestedPath);
      const filePath = details.isDirectory() ? resolve(requestedPath, "index.html") : requestedPath;
      const body = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  return new Promise((resolveStarted, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveStarted({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClosed, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClosed());
        }),
      });
    });
  });
}

function captureBrowserErrors(page, label, errors) {
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      errors.push(`${label} console.error${location ? ` (${location})` : ""}: ${message.text()}`);
    }
  });
}

async function launchChromium() {
  const attempts = [
    { label: "Playwright Chromium", options: { headless: true } },
    { label: "Chrome channel", options: { channel: "chrome", headless: true } },
    { label: "Edge channel", options: { channel: "msedge", headless: true } },
  ];
  const failures = [];
  for (const attempt of attempts) {
    try {
      return await chromium.launch(attempt.options);
    } catch (error) {
      failures.push(`${attempt.label}: ${error.message}`);
    }
  }
  throw new Error(`No Chromium-compatible browser could be launched.\n${failures.join("\n")}`);
}

async function waitForWorkbench(page) {
  await page.waitForFunction(() => {
    const controller = window.pawsWorkbench;
    return controller?.document && controller?.renderer;
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(
    dimensions.scrollWidth <= dimensions.innerWidth,
    true,
    `${label} overflowed horizontally: ${JSON.stringify(dimensions)}`,
  );
}

await assertBundledLevelIsValid();
const server = await startStaticServer();
const browser = await launchChromium();
const browserErrors = [];
const summary = {
  browser: `${browser.browserType().name()} ${browser.version()}`,
  desktopOverflow: null,
  mobileOverflow: null,
};

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  captureBrowserErrors(page, "desktop", browserErrors);

  await page.goto(`${server.baseUrl}/projects/paws-level-editor/index.html`);
  await page.locator("#connection-state").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document.querySelector("#connection-state")?.textContent?.includes("静态演示在线"));

  assert.equal(await page.locator('[role="option"]').count(), 1, "expected one bundled demo level");
  await waitForWorkbench(page);
  assert.notEqual((await page.locator("#status-tiles").textContent())?.trim(), "—");
  assert.equal(await page.locator("#reset-level").isEnabled(), true);
  assert.equal(await page.locator(".level-canvas-2d").isVisible(), true, "2D canvas should be visible");
  await assertNoHorizontalOverflow(page, "desktop");
  summary.desktopOverflow = false;

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".level-canvas-3d").evaluate((canvas) =>
      Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))),
    true,
    "3D canvas should expose a WebGL context",
  );

  const originalTile = await page.evaluate(() => {
    const tile = window.pawsWorkbench.document.tiles[0];
    window.pawsWorkbench.setSelection(new Set([tile.uid]));
    return { uid: tile.uid, x: tile.x };
  });
  const modifiedX = originalTile.x + 1;
  const tileX = page.locator('[data-tile-field="x"]');
  await tileX.fill(String(modifiedX));
  await tileX.press("Tab");
  await page.waitForFunction(
    ({ uid, x }) => window.pawsWorkbench.document.tiles.find((tile) => tile.uid === uid)?.x === x,
    { uid: originalTile.uid, x: modifiedX },
  );
  await page.locator("#save-level").click();
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("已保存到当前浏览器"));
  assert.equal(
    await page.evaluate(() => localStorage.getItem("paws-level-editor-demo-v1:level_showcase.json") !== null),
    true,
    "save should write the bundled level override to localStorage",
  );

  await page.reload();
  await waitForWorkbench(page);
  assert.equal(
    await page.evaluate(
      ({ uid, x }) => window.pawsWorkbench.document.tiles.find((tile) => tile.uid === uid)?.x === x,
      { uid: originalTile.uid, x: modifiedX },
    ),
    true,
    "refresh should auto-open and restore the saved tile edit",
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#reset-level").click();
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("已恢复内置示例"));
  assert.equal(
    await page.evaluate(
      ({ uid, x }) => window.pawsWorkbench.document.tiles.find((tile) => tile.uid === uid)?.x === x,
      originalTile,
    ),
    true,
    "reset should restore the bundled tile value",
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("paws-level-editor-demo-v1:level_showcase.json")),
    null,
    "reset should remove the localStorage override",
  );

  await page.locator("#mode-play").click();
  await page.waitForFunction(() => window.pawsWorkbench.mode === "play");
  assert.notEqual((await page.locator("#status-seed").textContent())?.trim(), "—");
  const playState = await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot));
  await page.locator("#view-2d").click();
  await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
  assert.equal(await page.locator("#mode-play").getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot)),
    playState,
    "switching 3D to 2D should retain play state",
  );
  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  assert.equal(await page.locator("#mode-play").getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot)),
    playState,
    "switching 2D to 3D should retain play state",
  );
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await mobile.newPage();
  captureBrowserErrors(mobilePage, "390x844", browserErrors);
  await mobilePage.goto(`${server.baseUrl}/projects/paws-level-editor/index.html`);
  await waitForWorkbench(mobilePage);
  assert.equal(await mobilePage.locator("#readonly-banner").isVisible(), true);
  assert.equal(await mobilePage.locator("#app").getAttribute("data-mode"), "play");
  assert.equal(await mobilePage.locator("#mode-edit").isVisible(), false);
  await assertNoHorizontalOverflow(mobilePage, "390x844");
  summary.mobileOverflow = false;
  await mobile.close();

  assert.deepEqual(browserErrors, [], `browser emitted errors:\n${browserErrors.join("\n")}`);
  console.log(JSON.stringify({ ...summary, consoleErrors: 0, pageErrors: 0 }));
} finally {
  await browser.close();
  await server.close();
}
