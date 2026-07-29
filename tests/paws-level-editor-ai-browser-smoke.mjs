import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./support/paws-static-server.mjs";
import {
  maxTowerAverageBlockersForLayers,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactsRoot = join(repoRoot, "tests", "artifacts");
const referenceFileName = "ai_reference.json";
const baselineLevelCount = 1;
const referenceTiles = [
  { x: 0, y: 0, layer: 1, type: 1 },
  { x: 16, y: 0, layer: 1, type: 1 },
  { x: 32, y: 0, layer: 1, type: 2 },
  { x: 48, y: 0, layer: 1, type: 2 },
  { x: 4, y: 4, layer: 2, type: 3 },
  { x: 20, y: 4, layer: 2, type: 3 },
  { x: 36, y: 4, layer: 2, type: 4 },
  { x: 44, y: 4, layer: 2, type: 4 },
];
const referenceLevel = {
  id: 73000,
  name: "AI 本地参考",
  difficulty: "Normal",
  gridUnit: "sheep_7x8_mini8",
  designerNote: JSON.stringify({
    widthNum: 7,
    heightNum: 8,
    levelKey: 73000,
    gameLevelOrder: 1,
    cdNum: 0,
    showLayerNum: true,
    boardScale: 1,
    blockTypeCount: 32,
    fullRandomTypeMin: 1,
    fullRandomTypeMax: 32,
    blockTypeData: {},
    levelData: Object.groupBy(referenceTiles, ({ layer }) => String(layer)),
    goldBlockData: [],
    cakeNum: 0,
  }),
  tiles: referenceTiles,
};
const baseUrlIndex = process.argv.indexOf("--base-url");
const externalBaseUrl = baseUrlIndex >= 0
  ? process.argv[baseUrlIndex + 1]?.replace(/\/+$/, "")
  : "";
const updateArtifacts = process.argv.includes("--update-artifacts");
const browserTimeout = externalBaseUrl ? 120_000 : 30_000;

function editorUrl(baseUrl) {
  return baseUrl.includes("/projects/paws-level-editor")
    ? `${baseUrl}/index.html`
    : `${baseUrl}/projects/paws-level-editor/index.html`;
}

function captureErrors(page) {
  const errors = { console: [], http: [], page: [], request: [] };
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("requestfailed", (request) => {
    errors.request.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.http.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function importSyntheticLevel(page, { name, value }) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("#import-level").click(),
  ]);
  await chooser.setFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
}

async function launchBrowser() {
  const options = [
    { headless: true },
    { channel: "chrome", headless: true },
    { channel: "msedge", headless: true },
  ];
  const failures = [];
  for (const option of options) {
    try {
      return await chromium.launch(option);
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(`无法启动 Chromium：\n${failures.join("\n")}`);
}

async function waitForNetworkAndTextures(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const renderer = window.pawsWorkbench?.renderer;
    if (!renderer) return false;
    if (
      renderer.images instanceof Map
      && [...renderer.images.values()].some((image) => !image.complete)
    ) {
      return false;
    }
    if (
      renderer.gameplayImages instanceof Map
      && [...renderer.gameplayImages.values()].some((image) => !image.complete)
    ) {
      return false;
    }
    if (
      document.querySelector(".level-canvas-3d")
      && (
        !renderer.blockBackgroundImage
        || !renderer.lockMaskImage
        || !renderer.grassTexture
        || !renderer.playTrayTexture
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

let server;
let browser;
try {
  if (!externalBaseUrl) {
    server = await startStaticServer({ root: repoRoot });
  }
  const baseUrl = externalBaseUrl || server.baseUrl;
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const fixedSeed = 73125;
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value(values) {
        if (values instanceof Uint32Array) {
          values.fill(fixedSeed);
          return values;
        }
        return originalGetRandomValues(values);
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(browserTimeout);
  page.setDefaultTimeout(browserTimeout);
  const errors = captureErrors(page);

  await page.goto(editorUrl(baseUrl), { waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    document.querySelector("#connection-state")?.textContent?.includes("关卡库在线"));
  assert.equal(await page.locator('[role="option"]').count(), 0);
  assert.equal(await page.locator("#level-count").textContent(), "0");
  assert.match(await page.locator("#level-list").textContent(), /内置关卡库已清空/);
  assert.equal(await page.evaluate(() => window.pawsWorkbench?.document), null);

  const onlineIndex = await page.evaluate(async () => {
    const response = await fetch("./levels/index.json");
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      value: await response.json(),
    };
  });
  assert.equal(onlineIndex.status, 200);
  assert.deepEqual(onlineIndex.value, { defaultFileName: "", levels: [] });

  await page.locator("#generate-ai-level").click();
  await page.locator("#ai-level-dialog").waitFor({ state: "visible" });
  assert.equal(await page.locator('input[name="ai-difficulty"]').count(), 3);
  assert.equal(await page.locator('input[name="ai-layout"]').count(), 3);
  assert.equal(await page.locator('input[name="ai-reference"]').count(), 2);
  assert.equal(await page.locator('input[name="ai-tile-count"]').inputValue(), "200");
  assert.equal(await page.locator('input[name="ai-layer-count"]').inputValue(), "15");
  assert.equal(await page.locator('input[name="ai-target-score"]').inputValue(), "60");
  assert.equal(
    await page.locator('input[name="ai-difficulty"][value="normal"]').isChecked(),
    true,
  );
  assert.equal(
    await page.locator('input[name="ai-layout"][value="balanced"]').isChecked(),
    true,
  );
  assert.equal(
    await page.locator('input[name="ai-reference"][value="all"]').isChecked(),
    true,
  );
  if (!externalBaseUrl && updateArtifacts) {
    await mkdir(artifactsRoot, { recursive: true });
    await page.screenshot({
      path: join(artifactsRoot, "paws-ai-level-dialog.png"),
      fullPage: true,
    });
  }

  await page.locator("#confirm-ai-level").click();
  await page.waitForFunction(() =>
    document.querySelector("#ai-level-error")?.textContent?.includes(
      "没有可用于学习的参考关卡",
    ));
  assert.equal(await page.evaluate(() => window.pawsWorkbench?.document), null);
  await page.locator('#ai-level-form button[value="cancel"]').click();
  await page.locator("#ai-level-dialog").waitFor({ state: "hidden" });

  await importSyntheticLevel(page, {
    name: referenceFileName,
    value: referenceLevel,
  });
  await page.waitForFunction((fileName) => {
    const controller = window.pawsWorkbench;
    return controller?.document?.fileName === fileName && controller?.renderer;
  }, referenceFileName);
  assert.equal(await page.locator('[role="option"]').count(), baselineLevelCount);
  assert.equal(await page.locator("#level-count").textContent(), String(baselineLevelCount));
  assert.equal(
    await page.locator('[role="option"][aria-selected="true"] .level-file').textContent(),
    referenceFileName,
  );
  assert.equal((await page.locator("#status-level").textContent())?.trim(), "AI 本地参考");
  for (const query of ["AI 本地参考", referenceFileName]) {
    await page.locator("#level-search").fill(query);
    assert.equal(
      await page.locator('[role="option"]').count(),
      1,
      `search should find the imported reference for ${query}`,
    );
  }
  await page.locator("#level-search").fill("");

  await page.locator("#generate-ai-level").click();
  await page.locator("#ai-level-dialog").waitFor({ state: "visible" });
  await page.locator("#confirm-ai-level").click();
  await page.waitForFunction(() => {
    const controller = window.pawsWorkbench;
    return (
      !controller?.aiGenerationPending
      && controller?.lastAiGeneration?.fileName
      && controller.document?.fileName === controller.lastAiGeneration.fileName
    );
  });
  const generated = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    return {
      fileName: controller.document.fileName,
      name: controller.document.name,
      tiles: controller.document.tiles.length,
      layers: Math.max(...controller.document.tiles.map(({ layer }) => layer)),
      board: controller.document.board,
      gridUnit: controller.document.gridUnit,
      designerBoard: {
        width: controller.document.designerNote.widthNum,
        height: controller.document.designerNote.heightNum,
      },
      coordinatesInBounds: controller.document.tiles.every(
        ({ x, y }) => x >= 0 && x <= 48 && y >= 0 && y <= 56,
      ),
      localEntries: controller.levels.filter(
        ({ local, fileName }) => local && fileName.startsWith("ai_level_"),
      ).length,
      catalogEntry: controller.levels.find(
        ({ fileName }) => fileName === controller.document.fileName,
      ),
      storedSource: JSON.parse(
        localStorage.getItem(`paws-level-editor-demo-v1:${controller.document.fileName}`),
      )?.source,
      generation: controller.lastAiGeneration,
    };
  });
  assert.match(generated.fileName, /^ai_level_\d+(?:_import(?:_\d+)?)?\.json$/);
  assert.match(generated.name, /^AI 标准 · 均衡布局$/);
  assert.equal(generated.tiles, 200);
  assert.equal(generated.layers, 15);
  assert.deepEqual(
    { width: generated.board.width, height: generated.board.height },
    { width: 7, height: 8 },
  );
  assert.equal(generated.gridUnit, "sheep_7x8_mini8");
  assert.deepEqual(generated.designerBoard, { width: 7, height: 8 });
  assert.equal(generated.coordinatesInBounds, true);
  assert.equal(generated.localEntries, 1);
  assert.equal(generated.catalogEntry.source, "ai");
  assert.equal(generated.catalogEntry.aiReferenceEligible, false);
  assert.equal(generated.storedSource, "ai");
  assert.equal(generated.generation.document, undefined);
  assert.equal(generated.generation.report.solvable, true);
  assert.equal(generated.generation.report.steps, generated.tiles / 2);
  assert.equal(generated.generation.report.statistics.effectiveLayerCount, 15);
  assert.equal(
    generated.generation.report.statistics.initialAccessiblePairs >= 3,
    true,
    "standard AI levels must expose at least the profile minimum of three opening pairs",
  );
  assert.equal(
    generated.generation.report.statistics.averageBlockers
      <= maxTowerAverageBlockersForLayers(15) + 4,
    true,
    "tower layouts must stay within the stage-aware blocker budget",
  );
  assert.equal(
    generated.generation.report.statistics.towerCount >= 3,
    true,
  );
  assert.equal(
    generated.generation.report.statistics.largestFlatPlatformSize <= 20,
    true,
  );
  assert.equal(
    generated.generation.report.statistics.boundaryRatio >= 0.54,
    true,
  );
  assert.equal(
    generated.generation.report.statistics.releaseDependencyDrop >= 0.02,
    true,
  );
  assert.equal(generated.generation.report.difficulty.valid, true);
  assert.equal(generated.generation.report.difficulty.releaseGate, "pass");
  assert.equal(
    Math.abs(generated.generation.report.difficulty.score - 60) <= 5,
    true,
  );
  assert.equal(
    await page.evaluate(async () =>
      (await window.pawsWorkbench.loadAiReferenceDocuments()).length),
    baselineLevelCount,
    "AI-generated results must not feed the all-level learning set",
  );
  assert.deepEqual(
    Object.keys(generated.generation.report.difficulty.dimensions),
    ["structure", "information", "choice", "route", "endurance"],
  );
  assert.match(await page.locator("#status-difficulty").textContent(), /^\d+ · /);
  assert.equal(await page.locator('[role="option"]').count(), baselineLevelCount + 1);
  await waitForNetworkAndTextures(page);

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".level-canvas-3d");
    return Boolean(canvas?.getContext("webgl2") || canvas?.getContext("webgl"));
  });
  const webgl = await page.locator(".level-canvas-3d").evaluate((canvas) =>
    Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
  assert.equal(webgl, true);
  await waitForNetworkAndTextures(page);
  if (!externalBaseUrl && updateArtifacts) {
    await page.screenshot({
      path: join(artifactsRoot, "paws-ai-level-desktop.png"),
      fullPage: true,
    });
  }

  await page.locator("#mode-play").click();
  await page.waitForFunction(() => window.pawsWorkbench?.mode === "play");
  const blockedVisual = await page.evaluate(() => {
    const meshes = [...window.pawsWorkbench.renderer.meshes.values()];
    const blockedMesh = meshes.find((mesh) => mesh.userData.record?.blocked);
    return {
      blockedCount: meshes.filter((mesh) => mesh.userData.record?.blocked).length,
      topHex: blockedMesh?.userData.topMaterial.color.getHex() ?? null,
      sideHex: blockedMesh?.userData.sideMaterial.color.getHex() ?? null,
      // Three.js runs in legacy linear-working-space mode in this bundle.
      // Hand-derived from sRGB #949494 and #254906 after sRGB -> linear.
      expectedTopHex: 0x4b4b4b,
      expectedSideHex: 0x041000,
    };
  });
  assert.equal(blockedVisual.blockedCount > 0, true);
  assert.equal(blockedVisual.topHex, blockedVisual.expectedTopHex);
  assert.equal(blockedVisual.sideHex, blockedVisual.expectedSideHex);
  if (!externalBaseUrl && updateArtifacts) {
    await page.screenshot({
      path: join(artifactsRoot, "paws-ai-play-3d-blocked.png"),
      fullPage: true,
    });
    await page.locator("#view-2d").click();
    await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
    await waitForNetworkAndTextures(page);
    await page.screenshot({
      path: join(artifactsRoot, "paws-ai-play-2d-blocked.png"),
      fullPage: true,
    });
    await page.locator("#view-3d").click();
    await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
    await waitForNetworkAndTextures(page);
  }
  const firstMoveResult = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const [first, second] = controller.lastAiGeneration.report.moves[0];
    controller.interactPlay(first);
    controller.interactPlay(second);
    return controller.playSnapshot.tiles.filter(({ removed }) => removed).length;
  });
  assert.equal(firstMoveResult, 2);
  await page.locator("#restart-play").click();
  const completed = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    for (const [first, second] of controller.lastAiGeneration.report.moves) {
      controller.interactPlay(first);
      controller.interactPlay(second);
    }
    return {
      won: controller.playSnapshot.won,
      remaining: controller.playSnapshot.tiles.filter(({ removed }) => !removed).length,
    };
  });
  assert.deepEqual(completed, { won: true, remaining: 0 });
  await waitForNetworkAndTextures(page);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction((expectedCount) =>
    window.pawsWorkbench?.levels?.length === expectedCount, baselineLevelCount + 1);
  assert.equal(
    await page.locator('[role="option"] .level-file').allTextContents()
      .then((names) => names.includes(generated.fileName)),
    true,
  );
  await page.locator('[role="option"]', { hasText: generated.fileName }).click();
  await page.waitForFunction(
    (fileName) => window.pawsWorkbench?.document?.fileName === fileName,
    generated.fileName,
  );
  assert.equal(
    await page.evaluate((fileName) =>
      localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`) !== null,
    generated.fileName),
    true,
  );
  assert.equal(await page.locator("#delete-local-level").isEnabled(), true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-local-level").click();
  await page.waitForFunction(({ fileName, fallback, expectedCount }) =>
    window.pawsWorkbench?.document?.fileName === fallback
    && window.pawsWorkbench?.levels?.length === expectedCount
    && localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`) === null,
  {
    fileName: generated.fileName,
    fallback: referenceFileName,
    expectedCount: baselineLevelCount,
  });

  await page.locator("#generate-ai-level").click();
  await page.locator("#ai-level-dialog").waitFor({ state: "visible" });
  await page.locator('input[name="ai-difficulty"][value="hard"]').check();
  assert.equal(await page.locator('input[name="ai-tile-count"]').inputValue(), "240");
  assert.equal(await page.locator('input[name="ai-layer-count"]').inputValue(), "32");
  assert.equal(await page.locator('input[name="ai-target-score"]').inputValue(), "80");
  const hardGenerationStartedAt = Date.now();
  await page.locator("#confirm-ai-level").click();
  await page.waitForFunction(() => {
    const controller = window.pawsWorkbench;
    return (
      !controller?.aiGenerationPending
      && controller?.lastAiGeneration?.options?.difficulty === "hard"
      && controller?.document?.fileName === controller.lastAiGeneration.fileName
    );
  });
  const hardGenerationMs = Date.now() - hardGenerationStartedAt;
  const hardGenerated = await page.evaluate(() => ({
    fileName: window.pawsWorkbench.document.fileName,
    tiles: window.pawsWorkbench.document.tiles.length,
    layers: Math.max(...window.pawsWorkbench.document.tiles.map(({ layer }) => layer)),
    solvable: window.pawsWorkbench.lastAiGeneration.report.solvable,
  }));
  assert.deepEqual(
    { tiles: hardGenerated.tiles, layers: hardGenerated.layers, solvable: hardGenerated.solvable },
    { tiles: 240, layers: 32, solvable: true },
  );
  assert.equal(
    hardGenerationMs < 7_000,
    true,
    `hard 240/32 browser generation took ${hardGenerationMs}ms (limit 7000ms)`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-local-level").click();
  await page.waitForFunction(({ fileName, fallback, expectedCount }) =>
    window.pawsWorkbench?.document?.fileName === fallback
    && window.pawsWorkbench?.levels?.length === expectedCount
    && localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`) === null,
  {
    fileName: hardGenerated.fileName,
    fallback: referenceFileName,
    expectedCount: baselineLevelCount,
  });

  for (const [kind, entries] of Object.entries(errors)) {
    assert.deepEqual(entries, [], `${kind} errors:\n${entries.join("\n")}`);
  }
  const proof = {
    environment: externalBaseUrl ? "online" : "local",
    catalogCount: 0,
    referenceLevelCount: baselineLevelCount,
    defaultFileName: "",
    generatedFileName: generated.fileName,
    generatedTileCount: generated.tiles,
    generatedLayerCount: generated.layers,
    generatedBoard: generated.board,
    generatedGridUnit: generated.gridUnit,
    generatedDifficultyScore: generated.generation.report.difficulty.score,
    generatedDifficultyRating: generated.generation.report.difficulty.rating.label,
    generatedDifficultyDimensions: generated.generation.report.difficulty.dimensions,
    generatedInitialPairs: generated.generation.report.statistics.initialAccessiblePairs,
    generatedAverageBlockers: generated.generation.report.statistics.averageBlockers,
    hardGenerationMs,
    solverSteps: generated.generation.report.steps,
    solverNodes: generated.generation.report.nodes,
    completedInPlay: completed.won,
    webgl,
    persistedAfterReload: true,
    deletedAfterVerification: true,
    consoleErrors: errors.console.length,
    httpErrors: errors.http.length,
    pageErrors: errors.page.length,
    requestFailures: errors.request.length,
  };
  if (!externalBaseUrl && updateArtifacts) {
    await writeFile(
      join(artifactsRoot, "paws-ai-level-proof.json"),
      `${JSON.stringify(proof, null, 2)}\n`,
      "utf8",
    );
  }
  console.log(JSON.stringify(proof));
  await context.close();
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}
