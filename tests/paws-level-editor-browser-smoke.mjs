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
const baseUrlIndex = process.argv.indexOf("--base-url");
const externalBaseUrl = baseUrlIndex >= 0
  ? process.argv[baseUrlIndex + 1]?.replace(/\/+$/, "")
  : "";
const browserTimeout = externalBaseUrl ? 120_000 : 30_000;

function editorUrl(baseUrl) {
  return baseUrl.includes("/projects/paws-level-editor")
    ? `${baseUrl}/index.html`
    : `${baseUrl}/projects/paws-level-editor/index.html`;
}
const defaultFileName = "level_0021_r2_第二关模板12.json";
const bundledLevelCount = 23;

async function assertBundledLevelIsValid() {
  const levelPath = resolve(
    repoRoot,
    "projects",
    "paws-level-editor",
    "levels",
    defaultFileName,
  );
  const value = JSON.parse(await readFile(levelPath, "utf8"));
  const designerNote = typeof value.designerNote === "string"
    ? JSON.parse(value.designerNote)
    : value.designerNote;
  assert.equal(value.id, 21);
  assert.equal(value.name, "第二关模板12");
  assert.equal(value.tiles.length, 198);
  assert.equal(Object.keys(designerNote.levelData).length, 17);
  const types = new Set(value.tiles.map((tile) => tile.type));
  assert.deepEqual([...types], [-1], "current Unity default should remain fully random");
  assert.equal(new Set(value.tiles.map((tile) => tile.layer)).size, 17);
  const document = parseLevelDocument(value, {
    fileName: defaultFileName,
    version: "browser-smoke",
  });
  const errors = validateLevel(document).filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, [], `bundled default validation errors:\n${JSON.stringify(errors, null, 2)}`);
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
    const failure = request.failure()?.errorText ?? "failed";
    if (
      failure === "net::ERR_ABORTED"
      && request.resourceType() === "image"
      && /\/assets\/blocks\/block_\d+\.png(?:\?|$)/.test(request.url())
    ) {
      errors.lifecycleAbort.push(request.url());
      return;
    }
    errors.request.push(
      `${label}: ${request.method()} ${request.url()} ${failure}`,
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
      renderer.gameplayImages instanceof Map &&
      [...renderer.gameplayImages.values()].some((image) => !image.complete)
    ) {
      return false;
    }
    if (
      document.querySelector(".level-canvas-3d") &&
      (
        !renderer.blockBackgroundImage ||
        !renderer.lockMaskImage ||
        !renderer.grassTexture ||
        !renderer.playTrayTexture
      )
    ) {
      return false;
    }
    if (renderer.loadingPatterns instanceof Set && renderer.loadingPatterns.size > 0) {
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

function assertNoRequestFailures(errors, checkpoint) {
  assert.deepEqual(
    errors.request,
    [],
    `request errors by ${checkpoint}:\n${errors.request.join("\n")}`,
  );
}

async function assertToolbarClearsInspector(page, label) {
  const layout = await page.evaluate(() => {
    const control = document.querySelector("#layer-view-prev")?.getBoundingClientRect();
    const inspector = document.querySelector("#inspector-panel")?.getBoundingClientRect();
    return control && inspector
      ? { controlRight: control.right, inspectorLeft: inspector.left }
      : null;
  });
  assert.ok(layout, label + " toolbar or inspector was missing");
  assert.equal(
    layout.controlRight <= layout.inspectorLeft,
    true,
    label + " layer toolbar overlapped the inspector: " + JSON.stringify(layout),
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

async function snapshotLocalImportState(page) {
  return page.evaluate(() => ({
    fileName: window.pawsWorkbench.document.fileName,
    serializedDocument: JSON.stringify(window.pawsWorkbench.document),
    levelFileNames: window.pawsWorkbench.levels.map((level) => level.fileName),
    localStorage: Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith("paws-level-editor-demo-v1:"))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    ),
  }));
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

async function clickEditableTileIn3d(page, uid = null) {
  const target = await page.evaluate((wantedUid) => {
    const renderer = window.pawsWorkbench.renderer;
    const rectangle = renderer.renderer.domElement.getBoundingClientRect();
    for (const [candidateUid, mesh] of renderer.meshes) {
      if (wantedUid && candidateUid !== wantedUid) continue;
      const projected = mesh.getWorldPosition(mesh.position.clone()).project(renderer.camera);
      const point = {
        x: (projected.x + 1) * rectangle.width / 2,
        y: (1 - projected.y) * rectangle.height / 2,
      };
      const picked = renderer.pick({
        clientX: rectangle.left + point.x,
        clientY: rectangle.top + point.y,
      });
      if (picked?.uid === candidateUid) return { uid: candidateUid, ...point };
    }
    return null;
  }, uid);
  assert.ok(target, "expected a raycast-visible editable tile in the 3D canvas");
  const canvasBox = await page.locator(".level-canvas-3d").boundingBox();
  assert.ok(canvasBox, "editable 3D canvas should have a bounding box");
  await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
  return target;
}

await assertBundledLevelIsValid();
const browserErrors = {
  console: [],
  http: [],
  page: [],
  request: [],
  lifecycleAbort: [],
};
let browser = null;
let server = null;
let summary = null;

try {
  if (!externalBaseUrl) {
    server = await startStaticServer({ root: repoRoot });
  }
  const baseUrl = externalBaseUrl || server.baseUrl;
  browser = await launchChromium();
  summary = {
    environment: externalBaseUrl ? "online" : "local",
    browser: `${browser.browserType().name()} ${browser.version()}`,
    desktopOverflow: null,
    mobileOverflow: null,
    importedFileName: null,
    importPersists: null,
    collisionFileName: null,
    importedEditSaved: null,
    importedWebgl: null,
    importedPlayInteraction: null,
    safeEditing: null,
    layerInspection: null,
    threeInspection: null,
    metadataRoundTrip: null,
    threeDeleteUndo: null,
    exportRoundTrip: null,
    deletedLocalLevels: null,
    aiReferenceCountsAfterDelete: null,
    legacyAiUpgrade: null,
    aiGeneration: null,
    aiPlaythrough: null,
    mobileImportHidden: null,
    mobileDeleteHidden: null,
  };
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await desktop.newPage();
  page.setDefaultNavigationTimeout(browserTimeout);
  page.setDefaultTimeout(browserTimeout);
  captureBrowserErrors(page, "desktop", browserErrors);

  await page.goto(editorUrl(baseUrl), {
    waitUntil: "networkidle",
  });
  await page.locator("#connection-state").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document.querySelector("#connection-state")?.textContent?.includes("关卡库在线"));

  assert.equal(
    await page.locator('[role="option"]').count(),
    bundledLevelCount,
    "expected all bundled project levels",
  );
  const levelCardText = await page.locator(
    `[role="option"]:has-text("${defaultFileName}")`,
  ).textContent();
  assert.doesNotMatch(levelCardText, /#undefined|Invalid Date/);
  assert.match(levelCardText, /#\d{4,}/);
  await waitForWorkbench(page);
  await waitForNetworkAndTextures(page);
  assert.equal(
    await page.evaluate(() => window.pawsWorkbench.document.fileName),
    defaultFileName,
    "requested default should open automatically",
  );
  assert.notEqual((await page.locator("#status-tiles").textContent())?.trim(), "—");
  assert.equal(await page.locator("#reset-level").isEnabled(), true);
  assert.equal(await page.locator(".level-canvas-2d").isVisible(), true, "2D canvas should be visible");
  await assertNoHorizontalOverflow(page, "desktop");
  await assertToolbarClearsInspector(page, "1280x720");
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
  assert.equal(await page.locator('[role="option"]').count(), bundledLevelCount + 1);
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
    local: window.pawsWorkbench.document.local,
    bundled: window.pawsWorkbench.document.bundled,
    source: window.pawsWorkbench.document.source,
  }));
  assert.deepEqual(importedDocument, {
    fileName: "local_demo.json",
    id: importedLevel.id,
    name: importedLevel.name,
    unknownTopLevel: importedLevel.unknownTopLevel,
    local: true,
    bundled: false,
    source: "import",
  });
  summary.importedFileName = importedDocument.fileName;
  const storedImport = await page.evaluate(() => {
    const raw = localStorage.getItem("paws-level-editor-demo-v1:local_demo.json");
    return raw ? JSON.parse(raw) : null;
  });
  assert.equal(storedImport?.fileName, "local_demo.json");
  assert.equal(storedImport?.value?.id, importedLevel.id);
  assert.equal(storedImport?.value?.name, importedLevel.name);
  assert.equal(storedImport?.source, "import");
  assert.deepEqual(storedImport?.value?.unknownTopLevel, importedLevel.unknownTopLevel);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction((expectedCount) =>
    window.pawsWorkbench?.levels?.length === expectedCount, bundledLevelCount + 1);
  assert.equal(await page.locator('[role="option"]').count(), bundledLevelCount + 1);
  assert.equal(
    await page.locator('[role="option"] .level-file').allTextContents()
      .then((fileNames) => fileNames.includes("local_demo.json")),
    true,
    "reload should retain the imported entry",
  );
  summary.importPersists = true;

  const collisionLevel = {
    ...importedLevel,
    id: 72021,
    name: "浏览器重名导入副本",
    unknownTopLevel: { preserve: "distinct-collision-payload" },
  };
  const originalRecordBeforeCollision = await page.evaluate(() =>
    localStorage.getItem("paws-level-editor-demo-v1:local_demo.json"));
  await importSyntheticLevel(page, {
    name: "local_demo.json",
    value: collisionLevel,
  });
  await page.waitForFunction(() =>
    window.pawsWorkbench?.document?.fileName === "local_demo_import.json");
  await waitForNetworkAndTextures(page);
  assert.equal(await page.locator('[role="option"]').count(), bundledLevelCount + 2);
  summary.collisionFileName = await page.evaluate(() =>
    window.pawsWorkbench.document.fileName);
  assert.equal(summary.collisionFileName, "local_demo_import.json");
  const storedCollision = await page.evaluate(() => ({
    original: localStorage.getItem("paws-level-editor-demo-v1:local_demo.json"),
    imported: JSON.parse(
      localStorage.getItem("paws-level-editor-demo-v1:local_demo_import.json"),
    ),
  }));
  assert.equal(
    storedCollision.original,
    originalRecordBeforeCollision,
    "same-name import should not mutate the original local record",
  );
  assert.equal(storedCollision.imported.value.id, collisionLevel.id);
  assert.equal(storedCollision.imported.value.name, collisionLevel.name);
  assert.deepEqual(
    storedCollision.imported.value.unknownTopLevel,
    collisionLevel.unknownTopLevel,
  );
  assert.notDeepEqual(
    storedCollision.imported.value.unknownTopLevel,
    importedLevel.unknownTopLevel,
  );

  const stateBeforeInvalidImport = await snapshotLocalImportState(page);
  await importSyntheticLevel(page, {
    name: "invalid.json",
    value: "{invalid JSON",
  });
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("不是合法 JSON"));
  assert.deepEqual(
    await snapshotLocalImportState(page),
    stateBeforeInvalidImport,
    "invalid JSON should not change the document, ordered level list, or browser storage",
  );

  const importedAcceptanceFileName = "local_demo_import.json";
  const importedOriginalTile = await page.evaluate((fileName) => {
    assertCurrentImportedDocument(fileName);
    const tile = window.pawsWorkbench.document.tiles[0];
    window.pawsWorkbench.setSelection(new Set([tile.uid]));
    return { uid: tile.uid, y: tile.y };

    function assertCurrentImportedDocument(expectedFileName) {
      if (window.pawsWorkbench.document.fileName !== expectedFileName) {
        throw new Error(`Expected imported document ${expectedFileName}`);
      }
    }
  }, importedAcceptanceFileName);
  const importedModifiedY = importedOriginalTile.y + 1;
  const importedTileY = page.locator('[data-tile-field="y"]');
  await importedTileY.fill(String(importedModifiedY));
  await importedTileY.press("Tab");
  await page.waitForFunction(
    ({ fileName, uid, y }) =>
      window.pawsWorkbench.document.fileName === fileName
      && window.pawsWorkbench.document.tiles.find((tile) => tile.uid === uid)?.y === y,
    {
      fileName: importedAcceptanceFileName,
      uid: importedOriginalTile.uid,
      y: importedModifiedY,
    },
  );
  await page.locator("#save-level").click();
  await page.waitForFunction(
    ({ fileName, y }) => {
      const raw = localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`);
      return raw && JSON.parse(raw).value.tiles[0].y === y;
    },
    { fileName: importedAcceptanceFileName, y: importedModifiedY },
  );
  summary.importedEditSaved = true;

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assert.equal(
    await page.evaluate(
      (fileName) => window.pawsWorkbench.document.fileName === fileName,
      importedAcceptanceFileName,
    ),
    true,
    "the imported document should remain current in 3D",
  );
  summary.importedWebgl = await page.locator(".level-canvas-3d").evaluate((canvas) =>
    Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
  assert.equal(summary.importedWebgl, true, "the imported document should render in WebGL");

  await page.locator("#mode-play").click();
  await page.waitForFunction(
    (fileName) =>
      window.pawsWorkbench.mode === "play"
      && window.pawsWorkbench.document.fileName === fileName,
    importedAcceptanceFileName,
  );
  await page.locator("#view-2d").click();
  await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  const importedRemovedBefore = await page.evaluate(() =>
    window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length);
  await clickAvailablePairIn2d(page);
  await page.waitForFunction(
    (before) =>
      window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length > before,
    importedRemovedBefore,
  );
  summary.importedPlayInteraction = await page.evaluate(
    (before) =>
      window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length > before,
    importedRemovedBefore,
  );
  assert.equal(
    summary.importedPlayInteraction,
    true,
    "real play interaction should change the imported document play state",
  );
  await page.locator("#mode-edit").click();
  await page.waitForFunction(() => window.pawsWorkbench.mode === "edit");
  assert.equal(await page.locator("#delete-local-level").isEnabled(), true);
  const referenceCountBeforeDelete = await page.evaluate(async () =>
    (await window.pawsWorkbench.loadAiReferenceDocuments()).length);
  assert.equal(referenceCountBeforeDelete, bundledLevelCount + 2);
  const localReferenceMetadata = await page.evaluate(() =>
    window.pawsWorkbench.levels
      .filter(({ fileName }) => fileName.startsWith("local_demo"))
      .map(({ fileName, source, aiReferenceEligible }) => ({
        fileName,
        source,
        aiReferenceEligible,
      }))
      .sort((left, right) => left.fileName.localeCompare(right.fileName)));
  assert.deepEqual(localReferenceMetadata, [
    { fileName: "local_demo_import.json", source: "import", aiReferenceEligible: true },
    { fileName: "local_demo.json", source: "import", aiReferenceEligible: true },
  ]);

  page.once("dialog", (dialog) => {
    assert.match(dialog.message(), /删除后无法撤销，AI 下次生成将不再学习这关/);
    dialog.accept();
  });
  await page.locator("#delete-local-level").click();
  await page.waitForFunction(({ deleted, fallback, expectedCount }) =>
    window.pawsWorkbench?.document?.fileName === fallback
    && window.pawsWorkbench?.levels?.length === expectedCount
    && localStorage.getItem(`paws-level-editor-demo-v1:${deleted}`) === null,
  {
    deleted: "local_demo_import.json",
    fallback: defaultFileName,
    expectedCount: bundledLevelCount + 1,
  });
  await page.waitForFunction((expectedCount) =>
    document.querySelector("#stage-toast")?.textContent?.includes(
      `剩余 AI 学习参考 ${expectedCount} 关`,
    ), bundledLevelCount + 1);
  const referenceCountAfterFirstDelete = await page.evaluate(async () =>
    (await window.pawsWorkbench.loadAiReferenceDocuments()).length);
  assert.equal(referenceCountAfterFirstDelete, bundledLevelCount + 1);
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after first local deletion");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction((expectedCount) =>
    window.pawsWorkbench?.levels?.length === expectedCount, bundledLevelCount + 1);
  assert.equal(
    await page.locator('[role="option"] .level-file').allTextContents()
      .then((names) => names.includes("local_demo_import.json")),
    false,
    "deleted local level must stay forgotten after reload",
  );
  await page.locator('[role="option"]', { hasText: "local_demo.json" }).click();
  await page.waitForFunction(() =>
    window.pawsWorkbench?.document?.fileName === "local_demo.json");
  assert.equal(await page.locator("#delete-local-level").isEnabled(), true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-local-level").click();
  await page.waitForFunction(({ fallback, expectedCount }) =>
    window.pawsWorkbench?.document?.fileName === fallback
    && window.pawsWorkbench?.levels?.length === expectedCount
    && localStorage.getItem("paws-level-editor-demo-v1:local_demo.json") === null,
  { fallback: defaultFileName, expectedCount: bundledLevelCount });
  const referenceCountAfterSecondDelete = await page.evaluate(async () =>
    (await window.pawsWorkbench.loadAiReferenceDocuments()).length);
  assert.equal(referenceCountAfterSecondDelete, bundledLevelCount);
  summary.deletedLocalLevels = ["local_demo_import.json", "local_demo.json"];
  summary.aiReferenceCountsAfterDelete = [
    referenceCountBeforeDelete,
    referenceCountAfterFirstDelete,
    referenceCountAfterSecondDelete,
  ];
  assert.equal(await page.locator('[role="option"]').count(), bundledLevelCount);
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after deleting imported levels");

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assert.equal(
    await page.locator(".level-canvas-3d").evaluate((canvas) =>
      Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))),
    true,
    "3D canvas should expose a WebGL context",
  );

  const relationSelection = await page.evaluate(async () => {
    const controller = window.pawsWorkbench;
    const moduleUrl = new URL("./core/tile-relations.mjs", window.location.href);
    const { analyzeTileRelations } = await import(moduleUrl.href);
    for (const tile of controller.document.tiles) {
      const relations = analyzeTileRelations(controller.document.tiles, [tile.uid]);
      if (!relations.edges.length) continue;
      controller.setSelection(new Set([tile.uid]));
      return { uid: tile.uid, edgeCount: relations.edges.length };
    }
    throw new Error("Expected a bundled tile with inspection relationships");
  });
  await page.waitForFunction(() =>
    window.pawsWorkbench.renderer.relationGroup.children.length > 0);
  const cameraPositions = [];
  for (const preset of ["iso", "top", "front", "side"]) {
    await page.locator(`[data-camera-preset="${preset}"]`).click();
    cameraPositions.push(await page.evaluate(() =>
      window.pawsWorkbench.renderer.camera.position.toArray().map((value) =>
        Number(value.toFixed(3)))));
  }
  assert.equal(new Set(cameraPositions.map((position) => position.join(","))).size, 4);
  await page.locator('[data-camera-preset="top"]').click();
  await page.locator("#fit-view").click();
  assert.deepEqual(
    await page.evaluate(() => window.pawsWorkbench.renderer.camera.up.toArray()),
    [0, 1, 0],
    "fit after top view must restore a level Y-up camera",
  );
  const explodedBefore = await page.evaluate(() => {
    const renderer = window.pawsWorkbench.renderer;
    const highest = [...renderer.meshes.values()].sort(
      (left, right) => right.userData.record.layer - left.userData.record.layer,
    )[0];
    return { uid: highest.userData.uid, y: highest.userData.baseY };
  });
  await page.locator("#layer-separation").fill("80");
  const explodedAfter = await page.evaluate((uid) =>
    window.pawsWorkbench.renderer.meshes.get(uid).userData.baseY, explodedBefore.uid);
  assert.ok(explodedAfter > explodedBefore.y + 1, "exploded view should separate upper layers");
  await page.locator("#focus-3d-selection").click();
  const focusDistance = await page.evaluate((uid) => {
    const renderer = window.pawsWorkbench.renderer;
    return renderer.controls.target.distanceTo(renderer.meshes.get(uid).position);
  }, relationSelection.uid);
  assert.ok(focusDistance < 0.2, "focus should target the selected tile");
  const issueColor = await page.evaluate((uid) => {
    const controller = window.pawsWorkbench;
    controller.setSelection(new Set());
    controller.renderer.setIssues([{ severity: "error", tileUids: [uid] }]);
    const color = controller.renderer.meshes.get(uid).userData.topMaterial.color.getHex();
    controller.renderer.setIssues(controller.issues);
    return color;
  }, relationSelection.uid);
  assert.equal(issueColor, 0xff7474);
  await page.locator("#mode-play").click();
  await page.waitForFunction(() =>
    window.pawsWorkbench.mode === "play"
    && window.pawsWorkbench.view === "3d"
    && window.pawsWorkbench.renderer.mode === "play");
  const playFrames = await page.evaluate(() => {
    const renderer = window.pawsWorkbench.renderer;
    const frame = () => ({
      position: renderer.camera.position.toArray(),
      target: renderer.controls.target.toArray(),
    });
    renderer.fitCamera();
    const rememberedSeparation = frame();
    renderer.setLayerSeparation(0);
    renderer.fitCamera();
    return { rememberedSeparation, zeroSeparation: frame() };
  });
  assert.deepEqual(
    playFrames.rememberedSeparation,
    playFrames.zeroSeparation,
    "play camera framing must ignore the remembered edit explosion setting",
  );
  await page.locator("#mode-edit").click();
  await page.waitForFunction(() =>
    window.pawsWorkbench.mode === "edit"
    && window.pawsWorkbench.view === "3d"
    && window.pawsWorkbench.renderer.mode === "edit");
  await page.locator("#layer-separation").fill("0");
  summary.threeInspection = {
    relationEdges: relationSelection.edgeCount,
    cameraPresets: cameraPositions.length,
    explodedDelta: Number((explodedAfter - explodedBefore.y).toFixed(3)),
    focusDistance: Number(focusDistance.toFixed(4)),
    issueColor,
  };

  const originalGameplay = await page.evaluate(() => ({
    id: window.pawsWorkbench.document.id,
    ...window.pawsWorkbench.document.gameplay,
  }));
  await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    controller.document.gameplay.levelKey = controller.document.id + 1000;
    controller.validate(false);
  });
  await page.locator("#save-level").click();
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("已保存到当前浏览器"));
  assert.deepEqual(
    await page.evaluate(() => ({
      id: window.pawsWorkbench.document.id,
      levelKey: window.pawsWorkbench.document.gameplay.levelKey,
      stillMismatched: window.pawsWorkbench.issues.some(
        ({ code }) => code === "level-key-mismatch",
      ),
    })),
    { id: originalGameplay.id, levelKey: originalGameplay.id, stillMismatched: false },
    "save must immediately apply the canonical serialized levelKey in memory",
  );
  const rejectedGameplayPatch = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const before = {
      stateId: controller.history.stateId,
      gameplay: structuredClone(controller.document.gameplay),
    };
    controller.patchGameplay({ gameLevelOrder: 0, cdNum: 1.5 });
    return {
      before,
      after: {
        stateId: controller.history.stateId,
        gameplay: structuredClone(controller.document.gameplay),
      },
      toast: document.querySelector("#stage-toast")?.textContent ?? "",
    };
  });
  assert.deepEqual(rejectedGameplayPatch.after, rejectedGameplayPatch.before);
  assert.match(rejectedGameplayPatch.toast, /挑战回合|限时秒数/);

  const originalTile = await page.evaluate(async () => {
    const controller = window.pawsWorkbench;
    const geometryUrl = new URL("./core/editor-geometry.mjs", window.location.href);
    const { planTileMove } = await import(geometryUrl.href);
    const deltas = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const tile of controller.document.tiles) {
      for (const delta of deltas) {
        if (planTileMove(controller.document, [tile.uid], delta).ok) {
          controller.setSelection(new Set([tile.uid]));
          return { uid: tile.uid, x: tile.x, y: tile.y, ...delta };
        }
      }
    }
    throw new Error("Expected a safely movable bundled tile");
  });
  const modifiedTile = {
    x: originalTile.x + originalTile.dx,
    y: originalTile.y + originalTile.dy,
  };
  await page.evaluate(({ dx, dy }) => window.pawsWorkbench.nudgeSelection(dx, dy), originalTile);
  await page.waitForFunction(
    ({ uid, x, y }) => {
      const tile = window.pawsWorkbench.document.tiles.find((candidate) => candidate.uid === uid);
      return tile?.x === x && tile?.y === y;
    },
    { uid: originalTile.uid, ...modifiedTile },
  );
  await page.locator('[data-doc-field="id"]').fill("121");
  await page.locator('[data-doc-field="id"]').press("Tab");
  await page.locator('[data-gameplay-field="gameLevelOrder"]').fill("4");
  await page.locator('[data-gameplay-field="gameLevelOrder"]').press("Tab");
  await page.locator('[data-gameplay-field="cdNum"]').fill("75");
  await page.locator('[data-gameplay-field="cdNum"]').press("Tab");
  await page.locator('[data-gameplay-field="showLayerNum"]').selectOption("false");
  await page.waitForFunction(() => {
    const { document } = window.pawsWorkbench;
    return document.id === 121
      && document.gameplay.levelKey === 121
      && document.gameplay.gameLevelOrder === 4
      && document.gameplay.cdNum === 75
      && document.gameplay.showLayerNum === false;
  });
  await page.locator("#save-level").click();
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("已保存到当前浏览器"));
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after saving edited bundled level");
  assert.equal(
    await page.evaluate(
      (fileName) => localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`) !== null,
      defaultFileName,
    ),
    true,
    "save should write the bundled level override to localStorage",
  );
  const storedGameplay = await page.evaluate((fileName) => {
    const record = JSON.parse(localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`));
    const note = JSON.parse(record.value.designerNote);
    return {
      id: record.value.id,
      levelKey: note.levelKey,
      gameLevelOrder: note.gameLevelOrder,
      cdNum: note.cdNum,
      showLayerNum: note.showLayerNum,
    };
  }, defaultFileName);
  assert.deepEqual(storedGameplay, {
    id: 121,
    levelKey: 121,
    gameLevelOrder: 4,
    cdNum: 75,
    showLayerNum: false,
  });

  await page.reload({ waitUntil: "networkidle" });
  await waitForWorkbench(page);
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after reloading edited bundled level");
  assert.equal(
    await page.evaluate(
      ({ uid, x, y }) => {
        const tile = window.pawsWorkbench.document.tiles.find((candidate) => candidate.uid === uid);
        return tile?.x === x && tile?.y === y;
      },
      { uid: originalTile.uid, ...modifiedTile },
    ),
    true,
    "refresh should auto-open and restore the saved tile edit",
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      id: window.pawsWorkbench.document.id,
      ...window.pawsWorkbench.document.gameplay,
    })),
    storedGameplay,
  );
  summary.metadataRoundTrip = storedGameplay;

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#reset-level").click();
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("已恢复内置示例"));
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after resetting bundled level");
  assert.equal(
    await page.evaluate(
      ({ uid, x, y }) => {
        const tile = window.pawsWorkbench.document.tiles.find((candidate) => candidate.uid === uid);
        return tile?.x === x && tile?.y === y;
      },
      { uid: originalTile.uid, x: originalTile.x, y: originalTile.y },
    ),
    true,
    "reset should restore the bundled tile value",
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      id: window.pawsWorkbench.document.id,
      ...window.pawsWorkbench.document.gameplay,
    })),
    originalGameplay,
  );
  assert.equal(
    await page.evaluate(
      (fileName) => localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`),
      defaultFileName,
    ),
    null,
    "reset should remove the localStorage override",
  );

  await page.locator("#new-level").click();
  await page.waitForFunction(() => window.pawsWorkbench?.document?.name === "新关卡");
  const newBoard = await page.evaluate(() => ({
    board: window.pawsWorkbench.document.board,
    gridUnit: window.pawsWorkbench.document.gridUnit,
  }));
  assert.deepEqual(newBoard, {
    board: { width: 7, height: 8, scale: 1 },
    gridUnit: "sheep_7x8_mini8",
  });
  await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    for (const tile of [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 8, y: 0, layer: 1, type: 1 },
      { x: 40, y: 0, layer: 1, type: 2 },
      { x: 48, y: 0, layer: 1, type: 2 },
    ]) controller.placeTile({ ...tile, presetColorType: 1 });
  });
  await page.waitForFunction(() => window.pawsWorkbench.document.tiles.length === 4);

  const rejectedMove = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const target = controller.document.tiles.find(({ x, y }) => x === 8 && y === 0);
    controller.setSelection(new Set([target.uid]));
    return {
      uid: target.uid,
      x: target.x,
      undoCount: controller.history.undoStack.length,
    };
  });
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("同层砖块"));
  assert.deepEqual(
    await page.evaluate((expected) => {
      const controller = window.pawsWorkbench;
      return {
        uid: expected.uid,
        x: controller.document.tiles.find(({ uid }) => uid === expected.uid).x,
        undoCount: controller.history.undoStack.length,
      };
    }, rejectedMove),
    rejectedMove,
    "overlap nudge should be rejected without adding history",
  );

  const resizeUndoCount = await page.evaluate(() => window.pawsWorkbench.history.undoStack.length);
  await page.evaluate(() => window.pawsWorkbench.patchBoard({ width: 6 }));
  await page.waitForFunction(() =>
    document.querySelector("#stage-toast")?.textContent?.includes("裁掉"));
  assert.deepEqual(
    await page.evaluate(() => ({
      width: window.pawsWorkbench.document.board.width,
      undoCount: window.pawsWorkbench.history.undoStack.length,
    })),
    { width: 7, undoCount: resizeUndoCount },
    "unsafe board shrink should be rejected atomically",
  );

  await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const source = controller.document.tiles.find(({ x, y }) => x === 0 && y === 0);
    controller.setSelection(new Set([source.uid]));
  });
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await page.waitForFunction(() => window.pawsWorkbench.document.tiles.length === 5);
  await page.keyboard.press("Control+D");
  await page.waitForFunction(() => window.pawsWorkbench.document.tiles.length === 6);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("PageUp");
  await page.waitForFunction(() =>
    window.pawsWorkbench.document.tiles.some(({ layer }) => layer === 2));

  summary.safeEditing = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const tiles = controller.document.tiles;
    let sameLayerOverlapPairs = 0;
    for (let left = 0; left < tiles.length; left += 1) {
      for (let right = left + 1; right < tiles.length; right += 1) {
        if (
          tiles[left].layer === tiles[right].layer
          && Math.abs(tiles[left].x - tiles[right].x) < 8
          && Math.abs(tiles[left].y - tiles[right].y) < 8
        ) sameLayerOverlapPairs += 1;
      }
    }
    return {
      board: `${controller.document.board.width}x${controller.document.board.height}`,
      tileCount: tiles.length,
      sameLayerOverlapPairs,
      undoCount: controller.history.undoStack.length,
    };
  });
  assert.deepEqual(
    {
      board: summary.safeEditing.board,
      tileCount: summary.safeEditing.tileCount,
      sameLayerOverlapPairs: summary.safeEditing.sameLayerOverlapPairs,
    },
    { board: "7x8", tileCount: 6, sameLayerOverlapPairs: 0 },
  );

  await page.evaluate(() => window.pawsWorkbench.setSelection(new Set()));
  await page.locator('[data-tool="fill"]').click();
  await page.locator('[data-placement-field="fillStartLayer"]').fill("20");
  await page.locator('[data-placement-field="fillStartLayer"]').press("Enter");
  const fillGesture = await page.evaluate(() => {
    const renderer = window.pawsWorkbench.renderer;
    const rectangle = renderer.canvas.getBoundingClientRect();
    const screenPoint = ({ x, y }) => ({
      x: rectangle.left + renderer.viewport.offsetX + (x + 4) * renderer.viewport.scale,
      y: rectangle.top + renderer.viewport.offsetY + (y + 4) * renderer.viewport.scale,
    });
    return {
      start: screenPoint({ x: 0, y: 0 }),
      end: screenPoint({ x: 3, y: 0 }),
      historyBefore: window.pawsWorkbench.history.undoStack.length,
    };
  });
  await page.mouse.move(fillGesture.start.x, fillGesture.start.y);
  await page.mouse.down();
  await page.mouse.move(fillGesture.end.x, fillGesture.end.y, { steps: 8 });
  await page.mouse.up();
  summary.fillTool = await page.evaluate((historyBefore) => {
    const controller = window.pawsWorkbench;
    const additions = controller.document.tiles
      .filter(({ layer }) => layer >= 20)
      .sort((left, right) => left.layer - right.layer);
    return {
      count: additions.length,
      types: additions.map(({ type }) => type),
      layers: additions.map(({ layer }) => layer),
      positions: additions.map(({ x, y }) => [x, y]),
      historyDelta: controller.history.undoStack.length - historyBefore,
    };
  }, fillGesture.historyBefore);
  assert.deepEqual(summary.fillTool, {
    count: 4,
    types: [-1, -1, -1, -1],
    layers: [20, 21, 22, 23],
    positions: [[0, 0], [1, 0], [2, 0], [3, 0]],
    historyDelta: 1,
  });
  await page.keyboard.press("Control+Z");
  await page.waitForFunction(() => window.pawsWorkbench.document.tiles.length === 6);

  await page.locator("#layer-view-mode").selectOption("through");
  await page.waitForFunction(() => window.pawsWorkbench.layerView.mode === "through");
  const through2d = await page.evaluate(() => window.pawsWorkbench.renderer.boardTiles().length);
  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after new-level 3D inspection");
  const through3d = await page.evaluate(() => window.pawsWorkbench.renderer.meshes.size);
  await page.locator("#layer-view-mode").selectOption("single");
  await page.locator("#layer-view-next").click();
  await page.waitForFunction(() =>
    window.pawsWorkbench.layerView.mode === "single"
    && window.pawsWorkbench.layerView.layer === 2);
  const single3d = await page.evaluate(() => window.pawsWorkbench.renderer.meshes.size);
  await page.locator("#view-2d").click();
  await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
  const single2d = await page.evaluate(() => window.pawsWorkbench.renderer.boardTiles().length);
  summary.layerInspection = { through2d, through3d, single2d, single3d };
  assert.deepEqual(summary.layerInspection, {
    through2d: 5,
    through3d: 5,
    single2d: 1,
    single3d: 1,
  });

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  const layerTwoUid = await page.evaluate(() =>
    window.pawsWorkbench.document.tiles.find(({ layer }) => layer === 2).uid);
  await page.locator('[data-tool="delete"]').click();
  await clickEditableTileIn3d(page, layerTwoUid);
  await page.waitForFunction((uid) =>
    !window.pawsWorkbench.document.tiles.some((tile) => tile.uid === uid), layerTwoUid);
  const afterDeleteCount = await page.evaluate(() => window.pawsWorkbench.document.tiles.length);
  await page.keyboard.press("Control+Z");
  await page.waitForFunction((uid) =>
    window.pawsWorkbench.document.tiles.some((tile) => tile.uid === uid), layerTwoUid);
  const afterUndoCount = await page.evaluate(() => window.pawsWorkbench.document.tiles.length);
  summary.threeDeleteUndo = {
    deletedCount: afterDeleteCount,
    restoredCount: afterUndoCount,
  };
  assert.deepEqual(summary.threeDeleteUndo, { deletedCount: 5, restoredCount: 6 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-level").click(),
  ]);
  const exportedText = await readFile(await download.path(), "utf8");
  const exportedValue = JSON.parse(exportedText);
  assert.equal(download.suggestedFilename(), "level_0000.json");
  assert.equal(exportedValue.gridUnit, "sheep_7x8_mini8");
  assert.equal(exportedValue.tiles.length, 6);
  page.once("dialog", (dialog) => dialog.accept());
  await importSyntheticLevel(page, {
    name: download.suggestedFilename(),
    value: exportedText,
  });
  await page.waitForFunction(() =>
    window.pawsWorkbench?.document?.fileName === "level_0000.json");
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after export round-trip import");
  summary.exportRoundTrip = await page.evaluate(() => ({
    fileName: window.pawsWorkbench.document.fileName,
    board: `${window.pawsWorkbench.document.board.width}x${window.pawsWorkbench.document.board.height}`,
    gridUnit: window.pawsWorkbench.document.gridUnit,
    tileCount: window.pawsWorkbench.document.tiles.length,
  }));
  assert.deepEqual(summary.exportRoundTrip, {
    fileName: "level_0000.json",
    board: "7x8",
    gridUnit: "sheep_7x8_mini8",
    tileCount: 6,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-local-level").click();
  await page.waitForFunction((fallback) =>
    window.pawsWorkbench?.document?.fileName === fallback, defaultFileName);
  await waitForNetworkAndTextures(page);

  const legacyAiFileName = "ai_legacy_overlap.json";
  await page.evaluate(async (fileName) => {
    const controller = window.pawsWorkbench;
    const { serializeLevelDocument } = await import("./core/level-adapter.mjs");
    const legacyDocument = {
      original: { id: 880001, name: "旧 AI 重叠回归", difficulty: "Normal" },
      designerNote: { aiGeneration: { seed: 20260722 } },
      id: 880001,
      name: "旧 AI 重叠回归",
      difficulty: "Normal",
      gridUnit: "sheep_7x8_mini8",
      board: { width: 7, height: 8, scale: 1 },
      random: { blockTypeCount: 32, fullTypeMin: 1, fullTypeMax: 32 },
      gameplay: { gameLevelOrder: 1, cdNum: 0, showLayerNum: true },
      tiles: [
        { uid: "legacy-a", x: 0, y: 0, layer: 1, type: 1 },
        { uid: "legacy-b", x: 7, y: 0, layer: 1, type: 2 },
        { uid: "legacy-c", x: 16, y: 0, layer: 1, type: 2 },
        { uid: "legacy-d", x: 24, y: 0, layer: 1, type: 1 },
      ],
      warnings: [],
    };
    await controller.api.saveLevel({
      fileName,
      value: serializeLevelDocument(legacyDocument),
      expectedVersion: "",
      saveAs: true,
      source: "ai",
    });
    await controller.refreshLevels();
    await controller.openLevel(fileName, { discardDirty: true });
  }, legacyAiFileName);
  await page.waitForFunction((fileName) =>
    window.pawsWorkbench?.document?.fileName === fileName, legacyAiFileName);
  await waitForNetworkAndTextures(page);
  summary.legacyAiUpgrade = await page.evaluate(async (fileName) => {
    const controller = window.pawsWorkbench;
    const { parseLevelDocument } = await import("./core/level-adapter.mjs");
    const { validateLevelForPublish } = await import("./core/level-validator.mjs");
    const { solveLevel } = await import("./core/level-solver.mjs");
    const tiles = controller.document.tiles;
    let sameLayerOverlapPairs = 0;
    for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
        const left = tiles[leftIndex];
        const right = tiles[rightIndex];
        if (
          left.layer === right.layer
          && Math.abs(left.x - right.x) < 8
          && Math.abs(left.y - right.y) < 8
        ) sameLayerOverlapPairs += 1;
      }
    }
    const stored = await controller.api.loadLevel(fileName);
    const persisted = parseLevelDocument(stored.value, {
      fileName,
      version: stored.version,
    });
    return {
      moved: controller.document.designerNote.aiGeneration
        .geometryUpgrade?.movedTileUids?.length ?? 0,
      sameLayerOverlapPairs,
      persistedRule: persisted.designerNote.aiGeneration.geometryUpgrade?.rule ?? "",
      versionPersisted: controller.document.version === stored.version,
      validationErrors: validateLevelForPublish(controller.document)
        .filter(({ severity }) => severity === "error").length,
      solverSteps: solveLevel(controller.document).steps,
    };
  }, legacyAiFileName);
  assert.deepEqual(summary.legacyAiUpgrade, {
    moved: 1,
    sameLayerOverlapPairs: 0,
    persistedRule: "same-layer-zero-overlap-v1",
    versionPersisted: true,
    validationErrors: 0,
    solverSteps: 2,
  });
  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".level-canvas-3d").evaluate((canvas) =>
      Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))),
    true,
  );
  await page.locator("#view-2d").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-local-level").click();
  await page.waitForFunction((fallback) =>
    window.pawsWorkbench?.document?.fileName === fallback, defaultFileName);
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "before AI generation");

  await page.locator("#generate-ai-level").click();
  await page.locator("#ai-level-dialog").waitFor({ state: "visible" });
  await page.locator("#ai-reference-current").check();
  await page.locator("#ai-tile-count").fill("200");
  await page.locator("#ai-layer-count").fill("15");
  await page.locator("#ai-target-score").fill("60");
  await page.locator("#confirm-ai-level").click();
  await page.waitForFunction(() => {
    const controller = window.pawsWorkbench;
    return !controller?.aiGenerationPending
      && controller?.document?.designerNote?.aiGeneration
      && controller.document.tiles.length === 200
      && controller.lastAiGeneration?.report?.solvable;
  });
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after AI generation");
  summary.aiGeneration = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const tiles = controller.document.tiles;
    const globalTypes = new Map();
    const layerTypes = new Map();
    let sameLayerOverlapPairs = 0;
    for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
      const left = tiles[leftIndex];
      globalTypes.set(left.type, (globalTypes.get(left.type) ?? 0) + 1);
      const layerType = `${left.layer}|${left.type}`;
      layerTypes.set(layerType, (layerTypes.get(layerType) ?? 0) + 1);
      for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
        const right = tiles[rightIndex];
        if (
          left.layer === right.layer
          && Math.abs(left.x - right.x) < 8
          && Math.abs(left.y - right.y) < 8
        ) sameLayerOverlapPairs += 1;
      }
    }
    return {
      fileName: controller.document.fileName,
      tileCount: tiles.length,
      layerCount: new Set(tiles.map(({ layer }) => layer)).size,
      sameLayerOverlapPairs,
      globalTypesEven: [...globalTypes.values()].every((count) => count % 2 === 0),
      layerTypesEven: [...layerTypes.values()].every((count) => count % 2 === 0),
      solverSteps: controller.lastAiGeneration.report.steps,
      difficultyScore: controller.lastAiGeneration.report.difficulty.score,
    };
  });
  assert.equal(summary.aiGeneration.tileCount, 200);
  assert.equal(summary.aiGeneration.layerCount, 15);
  assert.equal(summary.aiGeneration.sameLayerOverlapPairs, 0);
  assert.equal(summary.aiGeneration.globalTypesEven, true);
  assert.equal(summary.aiGeneration.layerTypesEven, true);
  assert.equal(summary.aiGeneration.solverSteps, 100);

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after first AI 3D view");
  assert.equal(
    await page.locator(".level-canvas-3d").evaluate((canvas) =>
      Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))),
    true,
    "the generated AI level should render in WebGL",
  );
  await page.locator("#view-2d").click();
  await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after returning AI to 2D");

  await page.locator("#mode-play").click();
  await page.waitForFunction(() => window.pawsWorkbench.mode === "play");
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after starting AI play");
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
  summary.aiPlaythrough = await page.evaluate(async () => {
    const controller = window.pawsWorkbench;
    const solverUrl = new URL("./core/level-solver.mjs", window.location.href);
    const { solveLevel } = await import(solverUrl.href);
    const report = solveLevel(controller.document);
    controller.restartPlay();
    for (const [firstUid, secondUid] of report.moves) {
      controller.playSession.interact(firstUid);
      controller.playSession.interact(secondUid);
    }
    controller.playSnapshot = controller.playSession.getSnapshot();
    controller.refreshRenderer();
    controller.updateUI();
    return {
      solvable: report.solvable,
      steps: report.steps,
      won: controller.playSnapshot.won,
      remaining: controller.playSnapshot.tiles.filter(({ removed }) => !removed).length,
    };
  });
  assert.deepEqual(summary.aiPlaythrough, {
    solvable: true,
    steps: 100,
    won: true,
    remaining: 0,
  });
  await waitForNetworkAndTextures(page);
  assertNoRequestFailures(browserErrors, "after AI playthrough");
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await mobile.newPage();
  mobilePage.setDefaultNavigationTimeout(browserTimeout);
  mobilePage.setDefaultTimeout(browserTimeout);
  captureBrowserErrors(mobilePage, "390x844", browserErrors);
  await mobilePage.goto(editorUrl(baseUrl), {
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
  summary.mobileDeleteHidden =
    await mobilePage.locator("#delete-local-level").isHidden();
  assert.equal(summary.mobileDeleteHidden, true);
  assert.equal(await mobilePage.locator("#generate-ai-level").isHidden(), true);
  await assertNoHorizontalOverflow(mobilePage, "390x844");
  summary.mobileOverflow = false;
  await mobile.close();

  const lifecycleAbortUrls = [...new Set(browserErrors.lifecycleAbort)];
  const lifecycleAbortChecks = await Promise.all(lifecycleAbortUrls.map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    return { url, status: response.status };
  }));
  assert.equal(
    lifecycleAbortChecks.every(({ status }) => status === 200),
    true,
    `lifecycle-aborted block assets must remain available:\n${JSON.stringify(lifecycleAbortChecks)}`,
  );
  for (const kind of ["console", "http", "page", "request"]) {
    const entries = browserErrors[kind];
    assert.deepEqual(entries, [], `${kind} errors:\n${entries.join("\n")}`);
  }
  console.log(JSON.stringify({
    ...summary,
    consoleErrors: 0,
    httpErrors: 0,
    pageErrors: 0,
    requestFailures: 0,
    verifiedLifecycleAborts: lifecycleAbortUrls.length,
  }));
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}
