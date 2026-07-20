import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./support/paws-static-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactsRoot = join(repoRoot, "tests", "artifacts");
const requestedDefault = "level_0020_r2_第二关模板12.json";
const baseUrlIndex = process.argv.indexOf("--base-url");
const externalBaseUrl = baseUrlIndex >= 0
  ? process.argv[baseUrlIndex + 1]?.replace(/\/+$/, "")
  : "";
const updateArtifacts = process.argv.includes("--update-artifacts");

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
  const errors = captureErrors(page);

  await page.goto(editorUrl(baseUrl), { waitUntil: "networkidle" });
  await page.waitForFunction((fileName) => {
    const controller = window.pawsWorkbench;
    return controller?.document?.fileName === fileName && controller?.renderer;
  }, requestedDefault);
  assert.equal(await page.locator('[role="option"]').count(), 30);
  assert.equal(await page.locator("#level-count").textContent(), "30");
  assert.equal(
    await page.locator('[role="option"][aria-selected="true"] .level-file').textContent(),
    requestedDefault,
  );
  assert.equal((await page.locator("#status-level").textContent())?.trim(), "第二关模板12");

  for (const query of ["第二关模板12", "level_0027_r2_27.json"]) {
    await page.locator("#level-search").fill(query);
    assert.equal(
      await page.locator('[role="option"]').count(),
      1,
      `search should find exactly one level for ${query}`,
    );
  }
  await page.locator("#level-search").fill("");
  assert.equal(await page.locator('[role="option"]').count(), 30);

  const onlineResources = await page.evaluate(async (fileName) => {
    const responses = await Promise.all([
      fetch("./levels/index.json"),
      fetch(`./levels/${encodeURIComponent(fileName)}`),
    ]);
    return Promise.all(responses.map(async (response) => ({
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes: (await response.arrayBuffer()).byteLength,
    })));
  }, requestedDefault);
  assert.equal(onlineResources.every(({ status, bytes }) => status === 200 && bytes > 0), true);

  await page.locator("#generate-ai-level").click();
  await page.locator("#ai-level-dialog").waitFor({ state: "visible" });
  assert.equal(await page.locator('input[name="ai-difficulty"]').count(), 3);
  assert.equal(await page.locator('input[name="ai-layout"]').count(), 3);
  assert.equal(await page.locator('input[name="ai-reference"]').count(), 2);
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
      localEntries: controller.levels.filter(
        ({ local, fileName }) => local && fileName.startsWith("ai_level_"),
      ).length,
      generation: controller.lastAiGeneration,
    };
  });
  assert.match(generated.fileName, /^ai_level_\d+(?:_import(?:_\d+)?)?\.json$/);
  assert.match(generated.name, /^AI 标准 · 均衡布局$/);
  assert.equal(generated.tiles >= 60 && generated.tiles <= 72, true);
  assert.equal(generated.layers >= 5 && generated.layers <= 6, true);
  assert.equal(generated.localEntries, 1);
  assert.equal(generated.generation.report.solvable, true);
  assert.equal(generated.generation.report.steps, generated.tiles / 2);
  assert.equal(await page.locator('[role="option"]').count(), 31);

  await page.locator("#view-3d").click();
  await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".level-canvas-3d");
    return Boolean(canvas?.getContext("webgl2") || canvas?.getContext("webgl"));
  });
  const webgl = await page.locator(".level-canvas-3d").evaluate((canvas) =>
    Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
  assert.equal(webgl, true);
  if (!externalBaseUrl && updateArtifacts) {
    await page.screenshot({
      path: join(artifactsRoot, "paws-ai-level-desktop.png"),
      fullPage: true,
    });
  }

  await page.locator("#mode-play").click();
  await page.waitForFunction(() => window.pawsWorkbench?.mode === "play");
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

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.pawsWorkbench?.levels?.length === 31);
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

  for (const [kind, entries] of Object.entries(errors)) {
    assert.deepEqual(entries, [], `${kind} errors:\n${entries.join("\n")}`);
  }
  const proof = {
    environment: externalBaseUrl ? "online" : "local",
    catalogCount: 30,
    defaultFileName: requestedDefault,
    generatedFileName: generated.fileName,
    generatedTileCount: generated.tiles,
    generatedLayerCount: generated.layers,
    solverSteps: generated.generation.report.steps,
    solverNodes: generated.generation.report.nodes,
    completedInPlay: completed.won,
    webgl,
    persistedAfterReload: true,
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
