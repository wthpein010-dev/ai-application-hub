import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./support/paws-static-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const server = await startStaticServer({ root: repositoryRoot });
const editorUrl = `${server.baseUrl}/projects/paws-level-editor/index.html`;
const grassFixture = {
  id: 82001,
  name: "草地浏览器测试",
  difficulty: "Normal",
  gridUnit: "sheep_7x8_mini8",
  designerNote: JSON.stringify({
    widthNum: 7,
    heightNum: 8,
    levelKey: 82001,
    gameLevelOrder: 1,
    cdNum: 0,
    showLayerNum: true,
    boardScale: 1,
    blockTypeCount: 32,
    fullRandomTypeMin: 1,
    fullRandomTypeMax: 32,
    blockTypeData: {},
    levelData: {
      1: [
        { x: 0, y: 0, layer: 1, type: 1, presetColorType: 1 },
        { x: 16, y: 0, layer: 1, type: 1, presetColorType: 1 },
      ],
    },
    goldBlockData: [],
    cakeNum: 0,
  }),
  tiles: [
    { x: 0, y: 0, layer: 1, type: 1, presetColorType: 1 },
    { x: 16, y: 0, layer: 1, type: 1, presetColorType: 1 },
  ],
};

async function launchBrowser() {
  for (const options of [
    { headless: true },
    { channel: "chrome", headless: true },
    { channel: "msedge", headless: true },
  ]) {
    try {
      return await chromium.launch(options);
    } catch {
      // Try the next installed Chromium channel.
    }
  }
  throw new Error("No Chromium-compatible browser is available.");
}

function collectErrors(page, label, errors) {
  page.on("pageerror", (error) => errors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    errors.push(`${label} request: ${request.url()} ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${label} http: ${response.status()} ${response.url()}`);
  });
}

async function waitForGrass(page, { requireDocument = true } = {}) {
  await page.waitForFunction((needsDocument) => {
    const controller = window.pawsWorkbench;
    return controller
      && (!needsDocument || controller.document)
      && controller.grassField?.imageReady
      && document.querySelectorAll(".level-grass-field").length === 1;
  }, requireDocument);
}

async function importGrassFixture(page, fileName) {
  await page.waitForFunction(() =>
    window.pawsWorkbench?.levels?.length === 0
    && document.querySelector("#connection-state")?.textContent?.includes("关卡库在线"));
  await page.locator("#import-level-input").setInputFiles({
    name: fileName,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(grassFixture)),
  });
  await page.waitForFunction((expectedFileName) =>
    window.pawsWorkbench?.document?.fileName === expectedFileName,
  fileName);
}

async function grassFrameSamples(page) {
  return page.evaluate(() => {
    const field = window.pawsWorkbench.grassField;
    const sample = (seconds) => {
      field.draw(seconds);
      const bytes = field.context.getImageData(0, 0, field.canvas.width, field.canvas.height).data;
      let visiblePixels = 0;
      for (let index = 3; index < bytes.length; index += 4) {
        if (bytes[index] > 0) visiblePixels += 1;
      }
      return { pulseScale: Number(field.lastPulseScale.toFixed(3)), visiblePixels };
    };
    return {
      samples: [sample(0.4667), sample(0.5)],
      mediaMatches: field.motionQuery.matches,
      reducedMotion: field.isReducedMotion(),
    };
  });
}

const browser = await launchBrowser();
const errors = [];

try {
  const normal = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await normal.newPage();
  collectErrors(page, "normal", errors);
  await page.goto(editorUrl);
  await importGrassFixture(page, "grass_normal.json");
  await waitForGrass(page);
  const normalFrames = await grassFrameSamples(page);
  assert.deepEqual(normalFrames.samples.map(({ pulseScale }) => pulseScale), [1.3, 0.9]);
  assert.equal(normalFrames.samples.every(({ visiblePixels }) => visiblePixels > 0), true);

  await page.locator("#view-3d").click();
  await page.waitForFunction(() => window.pawsWorkbench.renderer?.grassGroup?.children.length === 12);
  const three = await page.evaluate(() => {
    const renderer = window.pawsWorkbench.renderer;
    const children = renderer.grassGroup.children;
    const alphaCentroids = [...renderer.grassTextures.values()].map((texture) => {
      const canvas = texture.image;
      const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      let weightedY = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const value = bytes[(y * canvas.width + x) * 4 + 3];
          alpha += value;
          weightedY += y * value;
        }
      }
      return Number((weightedY / alpha / canvas.height).toFixed(3));
    });
    return {
      count: children.length,
      upright: children.every((grass) => Math.abs(grass.rotation.x) < 0.00001),
      doubleSided: [...renderer.grassMaterials.values()].every((material) => material.side === 2),
      depthWriteDisabled: [...renderer.grassMaterials.values()].every((material) => material.depthWrite === false),
      geometrySizes: [...renderer.grassGeometries.values()].map((geometry) => [
        geometry.parameters.width,
        geometry.parameters.height,
      ]),
      textureSizes: [...renderer.grassTextures.values()].map((texture) => [
        texture.image.width,
        texture.image.height,
      ]),
      alphaCentroids,
    };
  });
  assert.deepEqual(three, {
    count: 12,
    upright: true,
    doubleSided: true,
    depthWriteDisabled: true,
    geometrySizes: [[0.6625000000000001, 0.36250000000000004], [0.375, 0.4375]],
    textureSizes: [[53, 29], [30, 35]],
    alphaCentroids: [0.474, 0.545],
  });
  await page.waitForFunction(() => {
    const grass = window.pawsWorkbench.renderer?.grassGroup?.children[0];
    if (!grass) return false;
    window.__grassScales ??= [];
    window.__grassScales.push(grass.scale.y);
    return Math.max(...window.__grassScales) - Math.min(...window.__grassScales) > 0.12;
  }, null, { timeout: 2500, polling: 16 });

  await page.locator("#view-2d").click();
  await page.locator("#mode-play").click();
  await page.waitForFunction(() => window.pawsWorkbench.mode === "play");
  assert.equal(await page.locator(".level-grass-field").count(), 1);

  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const reducedPage = await reduced.newPage();
  collectErrors(reducedPage, "reduced", errors);
  await reducedPage.goto(editorUrl);
  await importGrassFixture(reducedPage, "grass_reduced.json");
  await waitForGrass(reducedPage);
  const reducedFrames = await grassFrameSamples(reducedPage);
  assert.deepEqual(reducedFrames.samples.map(({ pulseScale }) => pulseScale), [1, 1]);
  assert.equal(reducedFrames.samples.every(({ visiblePixels }) => visiblePixels > 0), true);
  assert.equal(reducedFrames.mediaMatches, true);
  assert.equal(reducedFrames.reducedMotion, true);
  await reducedPage.locator("#view-3d").click();
  await reducedPage.waitForFunction(() => window.pawsWorkbench.renderer?.grassGroup?.children.length === 12);
  await reducedPage.waitForTimeout(650);
  assert.equal(
    await reducedPage.evaluate(() =>
      window.pawsWorkbench.renderer.grassGroup.children.every((grass) => grass.scale.y === 1)),
    true,
  );

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  collectErrors(mobilePage, "mobile", errors);
  await mobilePage.goto(editorUrl);
  await waitForGrass(mobilePage, { requireDocument: false });
  const mobileState = await mobilePage.evaluate(() => ({
    mode: window.pawsWorkbench.mode,
    canvasCount: document.querySelectorAll(".level-grass-field").length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  assert.deepEqual(mobileState, { mode: "play", canvasCount: 1, overflow: false });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    normalAnimated: true,
    reducedMotionStatic: true,
    grass3d: three,
    playGrassCanvasCount: 1,
    mobileOverflow: false,
    browserErrors: 0,
  }));
} finally {
  await browser.close();
  await server.close();
}
