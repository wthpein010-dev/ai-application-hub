import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLevelDocument } from "../projects/paws-level-editor/core/level-adapter.mjs";
import { validateLevel } from "../projects/paws-level-editor/core/level-validator.mjs";
import { startStaticServer } from "./support/paws-static-server.mjs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  throw new Error(
    "Playwright is unavailable. Run npm install in the repository root before npm run test:paws-browser.",
    { cause: error },
  );
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
  const types = new Set(value.tiles.map((tile) => tile.type));
  assert.equal(types.has(0), true, "showcase should retain local-random type 0");
  assert.equal(types.has(-1), true, "showcase should retain full-random type -1");
  assert.equal(
    value.tiles.some((tile) => tile.presetColorType === 2),
    true,
    "showcase should retain a face-down tile",
  );
  for (let type = 1001; type <= 1006; type += 1) {
    assert.equal(types.has(type), true, `showcase should retain special type ${type}`);
  }
  assert.equal(
    new Set(value.tiles.map((tile) => tile.layer)).size >= 4,
    true,
    "showcase should retain at least four layers",
  );
  const document = parseLevelDocument(value, {
    fileName: "level_showcase.json",
    version: "browser-smoke",
  });
  const errors = validateLevel(document).filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, [], `bundled showcase validation errors:\n${JSON.stringify(errors, null, 2)}`);
}

function captureBrowserErrors(page, label, errors) {
  page.on("pageerror", (error) => errors.page.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      errors.console.push(
        `${label}${location ? ` (${location})` : ""}: ${message.text()}`,
      );
    }
  });
  page.on("requestfailed", (request) => {
    errors.request.push(
      `${label}: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.http.push(`${label}: ${response.status()} ${response.url()}`);
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

async function waitForNetworkAndTextures(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const renderer = window.pawsWorkbench?.renderer;
    if (!renderer) {
      return false;
    }
    if (
      renderer.images instanceof Map &&
      [...renderer.images.values()].some((image) => !image.complete)
    ) {
      return false;
    }
    if (
      renderer.textures instanceof Map &&
      [...renderer.textures.keys()].some((key) =>
        typeof key === "string" && key.startsWith("loading:"))
    ) {
      return false;
    }
    return true;
  });
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
  }));
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

async function importSyntheticLevel(page, { name, value }) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("#import-level").click(),
  ]);
  await chooser.setFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(
      typeof value === "string" ? value : JSON.stringify(value),
    ),
  });
}

async function clickAvailablePairIn2d(page) {
  const targets = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const candidates = controller.playSnapshot.tiles
      .filter((tile) =>
        !tile.removed &&
        !Number.isInteger(tile.stashedSlot) &&
        !tile.covered &&
        !tile.sideBlocked)
      .map((tile) => {
        const offsets = [0.5, 2, 4, 6, 7.5];
        for (const yOffset of offsets) {
          for (const xOffset of offsets) {
            const point = {
              x: (tile.x + xOffset) * renderer.viewport.scale + renderer.viewport.offsetX,
              y: (tile.y + yOffset) * renderer.viewport.scale + renderer.viewport.offsetY,
            };
            if (renderer.hitBoardTile(point)?.uid === tile.uid) {
              return { ...tile, point };
            }
          }
        }
        return null;
      })
      .filter(Boolean);
    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
      const second = candidates
        .slice(firstIndex + 1)
        .find((candidate) => candidate.type === candidates[firstIndex].type);
      if (second) {
        return [
          { uid: candidates[firstIndex].uid, ...candidates[firstIndex].point },
          { uid: second.uid, ...second.point },
        ];
      }
    }
    return [];
  });
  assert.equal(targets.length, 2, "expected an unobscured matching pair in the 2D canvas");
  const canvasBox = await page.locator(".level-canvas-2d").boundingBox();
  assert.ok(canvasBox, "2D canvas should have a bounding box");
  for (const target of targets) {
    await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
  }
  return targets;
}

async function clickAvailableTileIn3d(page) {
  const target = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const rectangle = renderer.renderer.domElement.getBoundingClientRect();
    const candidates = controller.playSnapshot.tiles.filter((tile) =>
      !tile.removed &&
      !Number.isInteger(tile.stashedSlot) &&
      !tile.covered &&
      !tile.sideBlocked);
    for (const tile of candidates) {
      const mesh = renderer.meshes.get(tile.uid);
      if (!mesh) {
        continue;
      }
      const projected = mesh.getWorldPosition(mesh.position.clone()).project(renderer.camera);
      const point = {
        x: (projected.x + 1) * rectangle.width / 2,
        y: (1 - projected.y) * rectangle.height / 2,
      };
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > rectangle.width ||
        point.y > rectangle.height
      ) {
        continue;
      }
      const picked = renderer.pick({
        clientX: rectangle.left + point.x,
        clientY: rectangle.top + point.y,
      });
      if (picked?.uid === tile.uid) {
        return { uid: tile.uid, ...point };
      }
    }
    return null;
  });
  assert.ok(target, "expected a raycast-visible available tile in the 3D canvas");
  const canvasBox = await page.locator(".level-canvas-3d").boundingBox();
  assert.ok(canvasBox, "3D canvas should have a bounding box");
  await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
  return target;
}

await assertBundledLevelIsValid();
const browserErrors = { console: [], http: [], page: [], request: [] };
let browser = null;
let server = null;
let summary = null;

try {
  server = await startStaticServer({ root: repoRoot });
  browser = await launchChromium();
  summary = {
    browser: `${browser.browserType().name()} ${browser.version()}`,
    desktopOverflow: null,
    mobileOverflow: null,
    importedFileName: null,
    importPersists: null,
    collisionFileName: null,
    mobileImportHidden: null,
  };
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  captureBrowserErrors(page, "desktop", browserErrors);

  await page.goto(`${server.baseUrl}/projects/paws-level-editor/index.html`, {
    waitUntil: "networkidle",
  });
  await page.locator("#connection-state").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document.querySelector("#connection-state")?.textContent?.includes("静态演示在线"));

  assert.equal(await page.locator('[role="option"]').count(), 1, "expected one bundled demo level");
  const levelCardText = await page.locator('[role="option"]').textContent();
  assert.doesNotMatch(levelCardText, /#undefined|Invalid Date/);
  assert.match(levelCardText, /#\d{4,}/);
  await waitForWorkbench(page);
  await waitForNetworkAndTextures(page);
  assert.notEqual((await page.locator("#status-tiles").textContent())?.trim(), "—");
  assert.equal(await page.locator("#reset-level").isEnabled(), true);
  assert.equal(await page.locator(".level-canvas-2d").isVisible(), true, "2D canvas should be visible");
  await assertNoHorizontalOverflow(page, "desktop");
  summary.desktopOverflow = false;

  const importedLevel = {
    id: 72020,
    name: "浏览器本地导入",
    difficulty: "Hard",
    unknownTopLevel: { preserve: "browser-smoke" },
    designerNote: JSON.stringify({
      customNote: "保留未知设计字段",
      widthNum: 8,
      heightNum: 10,
    }),
    tiles: [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 8, y: 0, layer: 1, type: 1 },
    ],
  };
  await importSyntheticLevel(page, {
    name: "local_demo.json",
    value: importedLevel,
  });
  await page.waitForFunction(() =>
    window.pawsWorkbench?.document?.fileName === "local_demo.json");
  await waitForNetworkAndTextures(page);
  assert.equal(await page.locator('[role="option"]').count(), 2);
  assert.equal(
    await page.locator('[role="option"][aria-selected="true"] .level-file').textContent(),
    "local_demo.json",
    "the imported local document should be selected",
  );
  const importedDocument = await page.evaluate(() => ({
    fileName: window.pawsWorkbench.document.fileName,
    id: window.pawsWorkbench.document.id,
    name: window.pawsWorkbench.document.name,
    unknownTopLevel: window.pawsWorkbench.document.original.unknownTopLevel,
  }));
  assert.deepEqual(importedDocument, {
    fileName: "local_demo.json",
    id: importedLevel.id,
    name: importedLevel.name,
    unknownTopLevel: importedLevel.unknownTopLevel,
  });
  summary.importedFileName = importedDocument.fileName;
  const storedImport = await page.evaluate(() => {
    const raw = localStorage.getItem("paws-level-editor-demo-v1:local_demo.json");
    return raw ? JSON.parse(raw) : null;
  });
  assert.equal(storedImport?.fileName, "local_demo.json");
  assert.equal(storedImport?.value?.id, importedLevel.id);
  assert.equal(storedImport?.value?.name, importedLevel.name);
  assert.deepEqual(storedImport?.value?.unknownTopLevel, importedLevel.unknownTopLevel);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    window.pawsWorkbench?.levels?.length === 2);
  assert.equal(await page.locator('[role="option"]').count(), 2);
  assert.equal(
    await page.locator('[role="option"] .level-file').allTextContents()
      .then((fileNames) => fileNames.includes("local_demo.json")),
    true,
    "reload should retain the imported entry",
  );
  summary.importPersists = true;

  await importSyntheticLevel(page, {
    name: "local_demo.json",
    value: importedLevel,
  });
  await page.waitForFunction(() =>
    window.pawsWorkbench?.document?.fileName === "local_demo_import.json");
  await waitForNetworkAndTextures(page);
  assert.equal(await page.locator('[role="option"]').count(), 3);
  summary.collisionFileName = await page.evaluate(() =>
    window.pawsWorkbench.document.fileName);
  assert.equal(summary.collisionFileName, "local_demo_import.json");

  const stateBeforeInvalidImport = await page.evaluate(() => ({
    fileName: window.pawsWorkbench.document.fileName,
    levelCount: window.pawsWorkbench.levels.length,
  }));
  await importSyntheticLevel(page, {
    name: "invalid.json",
    value: "{invalid JSON",
  });
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("不是合法 JSON"));
  assert.deepEqual(
    await page.evaluate(() => ({
      fileName: window.pawsWorkbench.document.fileName,
      levelCount: window.pawsWorkbench.levels.length,
    })),
    stateBeforeInvalidImport,
    "invalid JSON should not change the current document or level list",
  );

  await page.locator('[role="option"]', { hasText: "level_showcase.json" }).click();
  await page.waitForFunction(() =>
    window.pawsWorkbench?.document?.fileName === "level_showcase.json");
  await waitForNetworkAndTextures(page);
  await page.evaluate(async () => {
    localStorage.removeItem("paws-level-editor-demo-v1:local_demo.json");
    localStorage.removeItem("paws-level-editor-demo-v1:local_demo_import.json");
    localStorage.setItem("paws-level-editor-demo-v1:local-files", "[]");
    await window.pawsWorkbench.refreshLevels();
  });
  assert.equal(await page.locator('[role="option"]').count(), 1);

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
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
  await waitForNetworkAndTextures(page);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("paws-level-editor-demo-v1:level_showcase.json") !== null),
    true,
    "save should write the bundled level override to localStorage",
  );

  await page.reload({ waitUntil: "networkidle" });
  await waitForWorkbench(page);
  await waitForNetworkAndTextures(page);
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
  await waitForNetworkAndTextures(page);
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
  await waitForNetworkAndTextures(page);
  assert.notEqual((await page.locator("#status-seed").textContent())?.trim(), "—");
  const removedBefore2dClick = await page.evaluate(() =>
    window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length);
  await clickAvailablePairIn2d(page);
  await page.waitForFunction((removedBefore) =>
    window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length >
    removedBefore, removedBefore2dClick);
  await waitForNetworkAndTextures(page);
  summary.removedBy2dClicks =
    await page.evaluate(() =>
      window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length) -
    removedBefore2dClick;
  assert.equal(
    await page.evaluate((removedBefore) =>
      window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length >
      removedBefore, removedBefore2dClick),
    true,
    "real 2D canvas clicks should remove an available matching pair",
  );
  const playStateAfter2d = await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot));
  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assert.equal(await page.locator("#mode-play").getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot)),
    playStateAfter2d,
    "switching 2D to 3D should retain play state",
  );
  const before3dClick = await page.evaluate(() => ({
    removed: window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length,
    selectedTileUid: window.pawsWorkbench.playSnapshot.selectedTileUid,
  }));
  await clickAvailableTileIn3d(page);
  await page.waitForFunction((before) => {
    const snapshot = window.pawsWorkbench.playSnapshot;
    return (
      snapshot.selectedTileUid !== before.selectedTileUid ||
      snapshot.tiles.filter((tile) => tile.removed).length > before.removed
    );
  }, before3dClick);
  await waitForNetworkAndTextures(page);
  summary.threePointerInteraction = await page.evaluate((before) => {
    const snapshot = window.pawsWorkbench.playSnapshot;
    return (
      snapshot.selectedTileUid !== before.selectedTileUid ||
      snapshot.tiles.filter((tile) => tile.removed).length > before.removed
    );
  }, before3dClick);
  const playStateAfter3d = await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot));
  await page.locator("#view-2d").click();
  await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assert.equal(await page.locator("#mode-play").getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot)),
    playStateAfter3d,
    "switching 3D to 2D should retain play state after a real 3D interaction",
  );
  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.pawsWorkbench.playSnapshot)),
    playStateAfter3d,
    "switching 2D to 3D should retain the interacted play state",
  );
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await mobile.newPage();
  captureBrowserErrors(mobilePage, "390x844", browserErrors);
  await mobilePage.goto(`${server.baseUrl}/projects/paws-level-editor/index.html`, {
    waitUntil: "networkidle",
  });
  await waitForWorkbench(mobilePage);
  await waitForNetworkAndTextures(mobilePage);
  assert.equal(await mobilePage.locator("#readonly-banner").isVisible(), true);
  assert.equal(await mobilePage.locator("#app").getAttribute("data-mode"), "play");
  assert.equal(await mobilePage.locator("#mode-edit").isVisible(), false);
  summary.mobileImportHidden =
    await mobilePage.locator("#import-level").isHidden();
  assert.equal(summary.mobileImportHidden, true);
  await assertNoHorizontalOverflow(mobilePage, "390x844");
  summary.mobileOverflow = false;
  await mobile.close();

  for (const [kind, entries] of Object.entries(browserErrors)) {
    assert.deepEqual(entries, [], `${kind} errors:\n${entries.join("\n")}`);
  }
  console.log(JSON.stringify({
    ...summary,
    consoleErrors: 0,
    httpErrors: 0,
    pageErrors: 0,
    requestFailures: 0,
  }));
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}
