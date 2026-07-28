import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "../tests/support/paws-static-server.mjs";
import { withRecordingResources } from "./paws-recording-support.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const bundledFfmpeg = require("ffmpeg-static");
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(repoRoot, "projects", "paws-level-editor", "video");
const outputPath = join(videoRoot, "paws-level-editor-tutorial.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const proofPath = join(videoRoot, "recording-proof.json");
const recordingRoot = join(tmpdir(), "paws-level-editor-demo-recording");
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg;
const targetDuration = 88;
const defaultFileName = "video_reference.json";
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
  id: 74000,
  name: "视频本地参考",
  difficulty: "Normal",
  gridUnit: "sheep_7x8_mini8",
  designerNote: JSON.stringify({
    widthNum: 7,
    heightNum: 8,
    levelKey: 74000,
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
const sourceFiles = [
  "projects/paws-level-editor/index.html",
  "projects/paws-level-editor/styles.css",
  "projects/paws-level-editor/app.mjs",
  "projects/paws-level-editor/static-api-client.mjs",
  "projects/paws-level-editor/core/ai-level-generator.mjs",
  "projects/paws-level-editor/core/editor-geometry.mjs",
  "projects/paws-level-editor/core/field-grid-layout.mjs",
  "projects/paws-level-editor/core/fill-tool.mjs",
  "projects/paws-level-editor/core/gameplay-assets.mjs",
  "projects/paws-level-editor/core/gameplay-metadata.mjs",
  "projects/paws-level-editor/core/grass-layout.mjs",
  "projects/paws-level-editor/core/level-adapter.mjs",
  "projects/paws-level-editor/core/level-difficulty.mjs",
  "projects/paws-level-editor/core/legacy-ai-geometry-upgrade.mjs",
  "projects/paws-level-editor/core/level-solver.mjs",
  "projects/paws-level-editor/core/level-statistics.mjs",
  "projects/paws-level-editor/core/level-validator.mjs",
  "projects/paws-level-editor/core/pass-rate-evaluator.mjs",
  "projects/paws-level-editor/core/play-engine.mjs",
  "projects/paws-level-editor/core/tile-relations.mjs",
  "projects/paws-level-editor/core/view-model.mjs",
  "projects/paws-level-editor/core/xorshift.mjs",
  "projects/paws-level-editor/ui/ai-level-dialog.mjs",
  "projects/paws-level-editor/ui/editor-shortcuts.mjs",
  "projects/paws-level-editor/ui/grass-field.mjs",
  "projects/paws-level-editor/ui/inspector.mjs",
  "projects/paws-level-editor/ui/last-opened-level.mjs",
  "projects/paws-level-editor/ui/level-export.mjs",
  "projects/paws-level-editor/ui/local-level-import.mjs",
  "projects/paws-level-editor/ui/level-summary.mjs",
  "projects/paws-level-editor/ui/legacy-ai-open-upgrade.mjs",
  "projects/paws-level-editor/ui/play-tool-command.mjs",
  "projects/paws-level-editor/ui/workbench-controller.mjs",
  "projects/paws-level-editor/views/canvas-2d.mjs",
  "projects/paws-level-editor/views/three-3d.mjs",
  "projects/paws-level-editor/levels/index.json",
  "scripts/record-paws-level-editor-demo.mjs",
  "scripts/paws-recording-support.mjs",
];
const assetFiles = [
  "projects/paws-level-editor/assets/gameplay/btn_random.png",
  "projects/paws-level-editor/assets/gameplay/btn_magnet.png",
  "projects/paws-level-editor/assets/gameplay/btn_rollback.png",
];

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function sha256SourceFile(path) {
  const normalized = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function markChapter(timeline, chapter, startedAt, expectedSeconds) {
  const actualMs = Date.now() - startedAt;
  assert.ok(
    Math.abs(actualMs - expectedSeconds * 1000) <= 1_500,
    `${chapter} should start near ${expectedSeconds}s, got ${actualMs}ms`,
  );
  timeline[chapter] = actualMs;
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        rejectRun(
          new Error(
            `${command} exited with ${code}\n${stderr || stdout}`.trim(),
          ),
        );
      }
    });
  });
}

async function launchBrowser() {
  const attempts = [
    ["Playwright Chromium", { headless: true }],
    ["system Chrome", { channel: "chrome", headless: true }],
    ["system Edge", { channel: "msedge", headless: true }],
  ];
  const failures = [];
  for (const [label, options] of attempts) {
    try {
      return { browser: await chromium.launch(options), label };
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  throw new Error(
    `No Chromium-compatible browser can record the editor.\n${failures.join("\n")}`,
  );
}

async function waitForWorkbench(page) {
  await page.waitForFunction(() => {
    const controller = window.pawsWorkbench;
    return controller?.document && controller?.renderer;
  });
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
      [...renderer.textures.keys()].some(
        (key) => typeof key === "string" && key.startsWith("loading:"),
      )
    ) {
      return false;
    }
    return true;
  });
  await page.evaluate(
    () =>
      new Promise((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
      }),
  );
}

async function waitUntil(startedAt, seconds) {
  const remaining = seconds * 1000 - (Date.now() - startedAt);
  if (remaining > 0) {
    await delay(remaining);
  }
}

async function visibleEditTile(page) {
  const target = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const offsets = [0.5, 2, 4, 6, 7.5];
    const candidates = [...controller.document.tiles].sort(
      (left, right) => right.layer - left.layer,
    );
    for (const tile of candidates) {
      const target = [];
      for (let y = tile.y % 8; y <= (controller.document.board.height - 1) * 8; y += 8) {
        for (let x = tile.x % 8; x <= (controller.document.board.width - 1) * 8; x += 8) {
          if (x === tile.x && y === tile.y) continue;
          if (controller.document.tiles.some((other) =>
            other.uid !== tile.uid
            && other.layer === tile.layer
            && Math.abs(other.x - x) < 8
            && Math.abs(other.y - y) < 8)) {
            continue;
          }
          target.push({ x, y });
        }
      }
      if (!target.length) continue;
      for (const yOffset of offsets) {
        for (const xOffset of offsets) {
          const point = {
            x:
              (tile.x + xOffset) * renderer.viewport.scale +
              renderer.viewport.offsetX,
            y:
              (tile.y + yOffset) * renderer.viewport.scale +
              renderer.viewport.offsetY,
          };
          if (renderer.hitBoardTile(point)?.uid === tile.uid) {
            return {
              uid: tile.uid,
              ...point,
              targetX: target[0].x,
              targetY: target[0].y,
              scale: renderer.viewport.scale,
            };
          }
        }
      }
    }
    return null;
  });
  if (!target) {
    throw new Error("No visible 2D editor tile was available for the recording");
  }
  return target;
}

async function clickMatchingPairIn2d(page) {
  const targets = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const candidates = controller.playSnapshot.tiles
      .filter(
        (tile) =>
          !tile.removed &&
          !Number.isInteger(tile.stashedSlot) &&
          !tile.covered &&
          !tile.sideBlocked,
      )
      .map((tile) => {
        for (const yOffset of [0.5, 2, 4, 6, 7.5]) {
          for (const xOffset of [0.5, 2, 4, 6, 7.5]) {
            const point = {
              x:
                (tile.x + xOffset) * renderer.viewport.scale +
                renderer.viewport.offsetX,
              y:
                (tile.y + yOffset) * renderer.viewport.scale +
                renderer.viewport.offsetY,
            };
            if (renderer.hitBoardTile(point)?.uid === tile.uid) {
              return { ...tile, point };
            }
          }
        }
        return null;
      })
      .filter(Boolean);
    for (let index = 0; index < candidates.length; index += 1) {
      const pair = candidates
        .slice(index + 1)
        .find((candidate) => candidate.type === candidates[index].type);
      if (pair) {
        return [candidates[index], pair];
      }
    }
    return [];
  });
  if (targets.length !== 2) {
    throw new Error("No visible matching pair was available for the 2D play recording");
  }
  const box = await page.locator(".level-canvas-2d").boundingBox();
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    await page.mouse.click(box.x + target.point.x, box.y + target.point.y);
    if (index === 0) {
      await page.waitForFunction(
        (uid) => window.pawsWorkbench.playSnapshot.selectedTileUid === uid,
        target.uid,
      );
    } else {
      await page.waitForFunction(
        (uids) => uids.every((uid) =>
          window.pawsWorkbench.playSnapshot.tiles
            .find((tile) => tile.uid === uid)?.removed),
        targets.map(({ uid }) => uid),
      );
    }
    await delay(850);
  }
}

async function stashAvailableTileIn2d(page) {
  const target = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const candidates = controller.playSnapshot.tiles.filter(
      (tile) =>
        !tile.removed &&
        !Number.isInteger(tile.stashedSlot) &&
        !tile.covered &&
        !tile.sideBlocked,
    );
    for (const tile of candidates) {
      for (const yOffset of [0.5, 2, 4, 6, 7.5]) {
        for (const xOffset of [0.5, 2, 4, 6, 7.5]) {
          const point = {
            x:
              (tile.x + xOffset) * renderer.viewport.scale +
              renderer.viewport.offsetX,
            y:
              (tile.y + yOffset) * renderer.viewport.scale +
              renderer.viewport.offsetY,
          };
          if (renderer.hitBoardTile(point)?.uid === tile.uid) {
            return { uid: tile.uid, ...point };
          }
        }
      }
    }
    return null;
  });
  if (!target) {
    throw new Error("No visible tile was available for the 2D stash recording");
  }
  const box = await page.locator(".level-canvas-2d").boundingBox();
  assert.ok(box, "2D canvas should have a bounding box");
  await page.mouse.click(box.x + target.x, box.y + target.y, {
    button: "right",
  });
  await page.waitForFunction(
    (uid) => window.pawsWorkbench.playSnapshot.tray.includes(uid),
    target.uid,
  );
  return target.uid;
}

async function clickVisibleTileIn3d(page) {
  const target = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const rectangle = renderer.renderer.domElement.getBoundingClientRect();
    const selectedUid =
      controller.mode === "play"
        ? controller.playSnapshot.selectedTileUid
        : [...controller.selection][0];
    const source =
      controller.mode === "play"
        ? controller.playSnapshot.tiles.filter(
            (tile) =>
              !tile.removed &&
              !Number.isInteger(tile.stashedSlot) &&
              !tile.covered &&
              !tile.sideBlocked &&
              tile.uid !== selectedUid,
          )
        : controller.document.tiles.filter((tile) => tile.uid !== selectedUid);
    for (const tile of source) {
      const mesh = renderer.meshes.get(tile.uid);
      if (!mesh) {
        continue;
      }
      const projected = mesh
        .getWorldPosition(mesh.position.clone())
        .project(renderer.camera);
      const point = {
        x: ((projected.x + 1) * rectangle.width) / 2,
        y: ((1 - projected.y) * rectangle.height) / 2,
      };
      if (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= rectangle.width &&
        point.y <= rectangle.height
      ) {
        const picked = renderer.pick({
          clientX: rectangle.left + point.x,
          clientY: rectangle.top + point.y,
        });
        if (picked?.uid === tile.uid) {
          return { uid: tile.uid, ...point };
        }
      }
    }
    return null;
  });
  if (!target) {
    throw new Error("No raycast-visible tile was available for the 3D recording");
  }
  const box = await page.locator(".level-canvas-3d").boundingBox();
  await page.mouse.click(box.x + target.x, box.y + target.y);
  return target.uid;
}

async function recordEditor() {
  await rm(recordingRoot, { recursive: true, force: true });
  await mkdir(recordingRoot, { recursive: true });
  const recording = await withRecordingResources({
    startServer: () => startStaticServer({ root: repoRoot }),
    launchBrowser,
    createContext: (browser) =>
      browser.newContext({
        deviceScaleFactor: 1,
        recordVideo: {
          dir: recordingRoot,
          size: { width: 1280, height: 720 },
        },
        viewport: { width: 1280, height: 720 },
      }),
    run: async ({ server, context, launch }) => {
      const errors = { console: [], page: [] };
      const rawStartedAt = Date.now();
      const page = await context.newPage();
      const video = page.video();
      page.on("pageerror", (error) => errors.page.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.console.push(message.text());
        }
      });

      await page.goto(
        `${server.baseUrl}/projects/paws-level-editor/index.html`,
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForFunction(() =>
        window.pawsWorkbench?.levels?.length === 0
        && document.querySelector("#connection-state")?.textContent?.includes("关卡库在线"));
      assert.match(await page.locator("#level-list").textContent(), /内置关卡库已清空/);
      await page.locator("#import-level-input").setInputFiles({
        name: defaultFileName,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(referenceLevel)),
      });
      await waitForWorkbench(page);
      await page.locator('[role="option"]').first().waitFor({ state: "visible" });
      await page.waitForFunction(
        ({ requested, expectedCount }) =>
          window.pawsWorkbench?.document?.fileName === requested
          && window.pawsWorkbench?.levels?.length === expectedCount,
        { requested: defaultFileName, expectedCount: baselineLevelCount },
      );
      const metadata = await page.evaluate((requested) => {
        const controller = window.pawsWorkbench;
        const level = controller.levels.find(({ fileName }) => fileName === requested);
        return {
          cardText:
            document.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? "",
          fileName: controller.document.fileName,
          levelId: level.id,
          modifiedAt: level.modifiedAt,
        };
      }, defaultFileName);
      assert.equal(metadata.fileName, defaultFileName);
      assert.equal(Number.isInteger(metadata.levelId), true);
      assert.equal(new Date(metadata.modifiedAt).toISOString(), metadata.modifiedAt);
      assert.doesNotMatch(metadata.cardText, /#undefined|Invalid Date/);

      // The published timeline starts only after the auto-opened page is network/texture stable.
      const startedAt = Date.now();
      const proof = {
        schemaVersion: 1,
        recordedAt: new Date(startedAt).toISOString(),
        recording: {
          browser: launch.label,
          preRollMs: startedAt - rawStartedAt,
        },
        timeline: {},
        actions: { metadata },
        errors,
      };

      // 00:00 — show the empty-bundle banner, imported local reference and AI generation.
      markChapter(proof.timeline, "tools", startedAt, 0);
      await page.locator("#fit-view").click();
      await page.waitForFunction(() => window.pawsWorkbench?.grassField?.imageReady);
      const grass2d = await page.evaluate(async () => {
        const { GRASS_VISUAL_SCALE, grassVariantRotationRadians } = await import(
          new URL("./core/grass-layout.mjs", window.location.href).href
        );
        const samples = [];
        const startedAt = performance.now();
        await new Promise((resolveSample) => {
          const sample = (timestamp) => {
            const pulse = window.pawsWorkbench?.grassField?.lastPulseScale;
            if (Number.isFinite(pulse)) samples.push(pulse);
            if (timestamp - startedAt >= 1_200) {
              resolveSample();
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        return {
          canvasCount: document.querySelectorAll(".level-grass-field").length,
          imageReady: window.pawsWorkbench.grassField.imageReady,
          visualScale: GRASS_VISUAL_SCALE,
          variantRotations: {
            Grass1: grassVariantRotationRadians("Grass1"),
            Grass2: grassVariantRotationRadians("Grass2"),
          },
          animated: Math.max(...samples) - Math.min(...samples) > 0.1,
        };
      });
      assert.deepEqual(grass2d, {
        canvasCount: 1,
        imageReady: true,
        visualScale: 0.5,
        variantRotations: {
          Grass1: 0,
          Grass2: Math.PI,
        },
        animated: true,
      });
      proof.actions.grass = { twoD: grass2d };
      await page.locator("#generate-ai-level").click();
      await page.locator("#ai-level-dialog").waitFor({ state: "visible" });
      assert.equal(
        await page.locator('input[name="ai-reference"][value="all"]').isChecked(),
        true,
      );
      assert.equal(await page.locator("#ai-tile-count").inputValue(), "200");
      assert.equal(await page.locator("#ai-layer-count").inputValue(), "15");
      assert.equal(await page.locator("#ai-target-score").inputValue(), "60");
      await delay(1_500);
      await page.locator("#confirm-ai-level").click();
      await page.waitForFunction(() => {
        const controller = window.pawsWorkbench;
        return (
          !controller?.aiGenerationPending
          && controller?.lastAiGeneration?.fileName
          && controller.document?.fileName === controller.lastAiGeneration.fileName
        );
      });
      const aiGeneration = await page.evaluate(() => {
        const controller = window.pawsWorkbench;
        const catalogEntry = controller.levels.find(
          ({ fileName }) => fileName === controller.document.fileName,
        );
        const globalTypes = new Map();
        const layerTypes = new Map();
        let sameLayerOverlapPairs = 0;
        for (let leftIndex = 0; leftIndex < controller.document.tiles.length; leftIndex += 1) {
          const left = controller.document.tiles[leftIndex];
          globalTypes.set(left.type, (globalTypes.get(left.type) ?? 0) + 1);
          const layerType = String(left.layer) + "|" + String(left.type);
          layerTypes.set(layerType, (layerTypes.get(layerType) ?? 0) + 1);
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < controller.document.tiles.length;
            rightIndex += 1
          ) {
            const right = controller.document.tiles[rightIndex];
            if (
              left.layer === right.layer
              && Math.abs(left.x - right.x) < 8
              && Math.abs(left.y - right.y) < 8
            ) sameLayerOverlapPairs += 1;
          }
        }
        return {
          fileName: controller.lastAiGeneration.fileName,
          reference: controller.lastAiGeneration.options.reference,
          solvable: controller.lastAiGeneration.report.solvable,
          tileCount: controller.document.tiles.length,
          layerCount: controller.lastAiGeneration.report.statistics.effectiveLayerCount,
          targetScore: controller.lastAiGeneration.options.targetScore,
          actualScore: controller.lastAiGeneration.report.difficulty.score,
          rating: controller.lastAiGeneration.report.difficulty.rating.label,
          dimensions: controller.lastAiGeneration.report.difficulty.dimensions,
          board: {
            width: controller.document.board.width,
            height: controller.document.board.height,
          },
          gridUnit: controller.document.gridUnit,
          designerBoard: {
            width: controller.document.designerNote.widthNum,
            height: controller.document.designerNote.heightNum,
          },
          coordinatesInBounds: controller.document.tiles.every(
            ({ x, y }) => x >= 0 && x <= 48 && y >= 0 && y <= 56,
          ),
          source: catalogEntry.source,
          aiReferenceEligible: catalogEntry.aiReferenceEligible,
          referenceCount:
            controller.document.designerNote.aiGeneration.referenceCount,
          sameLayerOverlapPairs,
          totalEven: controller.document.tiles.length % 2 === 0,
          globalTypesEven: [...globalTypes.values()].every((count) => count % 2 === 0),
          layerTypesEven: [...layerTypes.values()].every((count) => count % 2 === 0),
        };
      });
      assert.match(aiGeneration.fileName, /^ai_level_\d+\.json$/);
      assert.equal(aiGeneration.reference, "all");
      assert.equal(aiGeneration.solvable, true);
      assert.equal(aiGeneration.tileCount, 200);
      assert.equal(aiGeneration.layerCount, 15);
      assert.equal(aiGeneration.targetScore, 60);
      assert.deepEqual(aiGeneration.board, { width: 7, height: 8 });
      assert.equal(aiGeneration.gridUnit, "sheep_7x8_mini8");
      assert.deepEqual(aiGeneration.designerBoard, { width: 7, height: 8 });
      assert.equal(aiGeneration.coordinatesInBounds, true);
      assert.equal(aiGeneration.source, "ai");
      assert.equal(aiGeneration.aiReferenceEligible, false);
      assert.equal(aiGeneration.referenceCount, baselineLevelCount);
      assert.equal(aiGeneration.sameLayerOverlapPairs, 0);
      assert.equal(aiGeneration.totalEven, true);
      assert.equal(aiGeneration.globalTypesEven, true);
      assert.equal(aiGeneration.layerTypesEven, true);
      assert.ok(Math.abs(aiGeneration.actualScore - aiGeneration.targetScore) <= 5);
      assert.equal(
        await page.locator('[role="option"]').count(),
        baselineLevelCount + 1,
      );
      proof.actions.aiGeneration = aiGeneration;
      await page.locator("#evaluate-pass-rate").click();
      await page.waitForFunction(() => {
        const state = window.pawsWorkbench?.passRateState;
        return state?.result && !state.pending;
      });
      proof.actions.passRate = await page.evaluate(() => {
        const state = window.pawsWorkbench.passRateState;
        return {
          passPercent: state.result.passPercent,
          passCount: state.result.passCount,
          trialCount: state.result.trialCount,
          stale: state.stale,
        };
      });
      assert.equal(proof.actions.passRate.trialCount, 12);
      assert.equal(
        proof.actions.passRate.passCount <= proof.actions.passRate.trialCount,
        true,
      );
      assert.equal(
        proof.actions.passRate.passPercent >= 0
          && proof.actions.passRate.passPercent <= 100,
        true,
      );
      assert.equal(proof.actions.passRate.stale, false);
      const generatedFileName = aiGeneration.fileName;
      const generatedStorageKey = `paws-level-editor-demo-v1:${generatedFileName}`;
      await page.locator("#fit-view").click();
      await waitForWorkbench(page);

      // 00:12 — real 2D selection, drag and visible property edit.
      await waitUntil(startedAt, 12);
      markChapter(proof.timeline, "edit2d", startedAt, 12);
      proof.actions.fieldGrid = await page.evaluate(async () => {
        const controller = window.pawsWorkbench;
        const { buildFieldGridLayout } = await import(
          new URL("./core/field-grid-layout.mjs", window.location.href).href
        );
        const board = {
          width: controller.document.board.width,
          height: controller.document.board.height,
        };
        const layout = buildFieldGridLayout(board);
        return {
          board,
          bounds: layout.bounds,
          majorLineCount: layout.majorLines.length,
          centerLineCount: layout.centerLines.length,
          xLabels: layout.labels
            .filter(({ axis }) => axis === "x")
            .map(({ value }) => value),
          yLabels: layout.labels
            .filter(({ axis }) => axis === "y")
            .map(({ value }) => value),
          edit2d:
            controller.mode === "edit" &&
            controller.view === "2d" &&
            typeof controller.renderer?.drawFieldGrid === "function",
        };
      });
      assert.deepEqual(proof.actions.fieldGrid, {
        board: { width: 7, height: 8 },
        bounds: { minX: 0, minY: 0, maxX: 56, maxY: 64 },
        majorLineCount: 17,
        centerLineCount: 15,
        xLabels: [0, 8, 16, 24, 32, 40, 48, 56],
        yLabels: [0, 8, 16, 24, 32, 40, 48, 56, 64],
        edit2d: true,
      });
      const editTile = await visibleEditTile(page);
      const { editTileIndex, originalPosition } = await page.evaluate((uid) => {
        const tiles = window.pawsWorkbench.document.tiles;
        const editTileIndex = tiles.findIndex((item) => item.uid === uid);
        const tile = tiles[editTileIndex];
        return {
          editTileIndex,
          originalPosition: { x: tile.x, y: tile.y },
        };
      }, editTile.uid);
      assert.ok(editTileIndex >= 0);
      const canvas2d = await page.locator(".level-canvas-2d").boundingBox();
      assert.ok(canvas2d, "2D canvas should have a bounding box");
      await page.mouse.click(canvas2d.x + editTile.x, canvas2d.y + editTile.y);
      await page.waitForFunction(
        (uid) => window.pawsWorkbench.selection.has(uid),
        editTile.uid,
      );
      const selectedEditUid = await page.evaluate(
        () => [...window.pawsWorkbench.selection][0],
      );
      assert.equal(selectedEditUid, editTile.uid);
      const selectedBeforeDrag = await page.evaluate(
        () => [...window.pawsWorkbench.selection].join(","),
      );
      await delay(1700);
      await page.mouse.move(canvas2d.x + editTile.x, canvas2d.y + editTile.y);
      await page.mouse.down();
      await page.mouse.move(
        canvas2d.x + editTile.x
          + (editTile.targetX - originalPosition.x) * editTile.scale,
        canvas2d.y + editTile.y
          + (editTile.targetY - originalPosition.y) * editTile.scale,
        { steps: 28 },
      );
      await page.mouse.up();
      await page.waitForFunction(
        ({ uid, before }) => {
          const tile = window.pawsWorkbench.document.tiles.find((item) => item.uid === uid);
          return tile.x !== before.x || tile.y !== before.y;
        },
        { uid: editTile.uid, before: originalPosition },
      );
      const draggedPosition = await page.evaluate((uid) => {
        const tile = window.pawsWorkbench.document.tiles.find((item) => item.uid === uid);
        return { x: tile.x, y: tile.y };
      }, editTile.uid);
      const selectedAfterDrag = await page.evaluate(
        () => [...window.pawsWorkbench.selection].join(","),
      );
      assert.notDeepEqual(draggedPosition, originalPosition);
      assert.equal(selectedAfterDrag, selectedBeforeDrag);
      await delay(2200);
      const tileFlip = page.locator('[data-tile-field="presetColorType"]');
      const propertyBefore = Number(await tileFlip.inputValue());
      const propertyAfter = propertyBefore === 2 ? 1 : 2;
      await tileFlip.selectOption(String(propertyAfter));
      await page.waitForFunction(
        ({ uid, expected }) =>
          window.pawsWorkbench.document.tiles.find((tile) => tile.uid === uid)
            ?.presetColorType === expected,
        { uid: editTile.uid, expected: propertyAfter },
      );
      const savedPosition = await page.evaluate((uid) => {
        const tile = window.pawsWorkbench.document.tiles.find((item) => item.uid === uid);
        return { x: tile.x, y: tile.y };
      }, editTile.uid);
      proof.actions.edit2d = {
        drag: {
          uid: selectedEditUid,
          selectedBefore: selectedBeforeDrag,
          selectedAfter: selectedAfterDrag,
          before: originalPosition,
          after: draggedPosition,
        },
        property: {
          field: "presetColorType",
          before: propertyBefore,
          after: propertyAfter,
        },
      };
      await page.evaluate(() => window.pawsWorkbench.setSelection(new Set()));
      await page.locator('[data-tool="fill"]').click();
      await page.locator('[data-placement-field="fillStartLayer"]').fill("20");
      await page.locator('[data-placement-field="fillStartLayer"]').press("Enter");
      const fillGesture = await page.evaluate(() => {
        const controller = window.pawsWorkbench;
        const renderer = controller.renderer;
        const rectangle = renderer.canvas.getBoundingClientRect();
        const screenPoint = ({ x, y }) => ({
          x: rectangle.left + renderer.viewport.offsetX + (x + 4) * renderer.viewport.scale,
          y: rectangle.top + renderer.viewport.offsetY + (y + 4) * renderer.viewport.scale,
        });
        return {
          start: screenPoint({ x: 0, y: 0 }),
          end: screenPoint({ x: 3, y: 0 }),
          historyBefore: controller.history.undoStack.length,
        };
      });
      await page.mouse.move(fillGesture.start.x, fillGesture.start.y);
      await page.mouse.down();
      await page.mouse.move(fillGesture.end.x, fillGesture.end.y, { steps: 8 });
      await page.mouse.up();
      const fillTool = await page.evaluate((historyBefore) => {
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
      assert.deepEqual(fillTool, {
        count: 4,
        types: [-1, -1, -1, -1],
        layers: [20, 21, 22, 23],
        positions: [[0, 0], [1, 0], [2, 0], [3, 0]],
        historyDelta: 1,
      });
      await delay(500);
      await page.keyboard.press("Control+Z");
      await page.waitForFunction(() => window.pawsWorkbench.document.tiles.length === 200);
      proof.actions.fillTool = { ...fillTool, undone: true };
      await page.locator('[data-tool="select"]').click();
      await page.evaluate((uid) => window.pawsWorkbench.setSelection(new Set([uid])), editTile.uid);
      const tileCountBeforeShortcuts = await page.evaluate(
        () => window.pawsWorkbench.document.tiles.length,
      );
      await page.locator(".level-canvas-2d").focus();
      await page.keyboard.press("Control+C");
      await page.keyboard.press("Control+V");
      await page.waitForFunction(
        (before) => window.pawsWorkbench.document.tiles.length === before + 1,
        tileCountBeforeShortcuts,
      );
      await delay(700);
      await page.keyboard.press("Control+D");
      await page.waitForFunction(
        (before) => window.pawsWorkbench.document.tiles.length === before + 2,
        tileCountBeforeShortcuts,
      );
      await delay(900);
      proof.actions.safeEditing = await page.evaluate((tileCountBefore) => {
        const tiles = window.pawsWorkbench.document.tiles;
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
          tileCountBefore,
          tileCountAfter: tiles.length,
          sameLayerOverlapPairs,
        };
      }, tileCountBeforeShortcuts);
      assert.deepEqual(proof.actions.safeEditing, {
        tileCountBefore: 200,
        tileCountAfter: 202,
        sameLayerOverlapPairs: 0,
      });
      await page.locator("#layer-view-mode").selectOption("through");
      await page.locator("#layer-view-prev").click();
      await page.waitForFunction(() =>
        window.pawsWorkbench.layerView.mode === "through"
        && window.pawsWorkbench.layerView.layer === 14);
      proof.actions.layerInspection = {
        layer: 14,
        through2d: await page.evaluate(() =>
          window.pawsWorkbench.renderer.boardTiles().length),
      };
      await delay(1100);

      // 00:32 — switch to the real WebGL view, orbit the camera and pick a different tile.
      await waitUntil(startedAt, 32);
      markChapter(proof.timeline, "view3d", startedAt, 32);
      await page.locator("#view-3d").click();
      await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
      await waitForWorkbench(page);
      await page.waitForFunction(() =>
        window.pawsWorkbench.renderer?.grassGroup?.children.length === 12);
      proof.actions.grass.threeD = await page.evaluate(async () => {
        const renderer = window.pawsWorkbench.renderer;
        const samples = [];
        const startedAt = performance.now();
        await new Promise((resolveSample) => {
          const sample = (timestamp) => {
            samples.push(renderer.grassGroup.children[0].scale.y);
            if (timestamp - startedAt >= 1_200) {
              resolveSample();
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        return {
          patchCount: renderer.grassGroup.children.length,
          animated: Math.max(...samples) - Math.min(...samples) > 0.1,
          geometrySizes: [...renderer.grassGeometries.values()].map((geometry) => [
            Number(geometry.parameters.width.toFixed(4)),
            Number(geometry.parameters.height.toFixed(4)),
          ]),
        };
      });
      assert.deepEqual(proof.actions.grass.threeD, {
        patchCount: 12,
        animated: true,
        geometrySizes: [[0.6625, 0.3625], [0.375, 0.4375]],
      });
      proof.actions.layerInspection.through3d = await page.evaluate(() =>
        window.pawsWorkbench.renderer.meshes.size);
      assert.equal(
        proof.actions.layerInspection.through3d,
        proof.actions.layerInspection.through2d,
      );
      await page.locator("#layer-view-mode").selectOption("single");
      await page.waitForFunction(() =>
        window.pawsWorkbench.layerView.mode === "single");
      proof.actions.layerInspection.single3d = await page.evaluate(() =>
        window.pawsWorkbench.renderer.meshes.size);
      assert.ok(proof.actions.layerInspection.single3d > 0);
      await page.locator("#layer-view-mode").selectOption("all");
      const cameraPresets = {};
      for (const preset of ["iso", "top", "front", "side"]) {
        await page.locator(`[data-camera-preset="${preset}"]`).click();
        await delay(320);
        cameraPresets[preset] = await page.evaluate(() =>
          window.pawsWorkbench.renderer.camera.position.toArray());
      }
      assert.equal(
        new Set(Object.values(cameraPresets).map((position) => position.join(","))).size,
        4,
      );
      const explodedBefore = await page.evaluate(() => {
        const renderer = window.pawsWorkbench.renderer;
        const highest = [...renderer.meshes.values()].sort(
          (left, right) => right.userData.record.layer - left.userData.record.layer,
        )[0];
        return { uid: highest.userData.uid, y: highest.userData.baseY };
      });
      await page.locator("#layer-separation").fill("75");
      const explodedAfter = await page.evaluate((uid) =>
        window.pawsWorkbench.renderer.meshes.get(uid).userData.baseY, explodedBefore.uid);
      assert.ok(explodedAfter > explodedBefore.y + 1);
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
        throw new Error("Expected a tile with 3D relationships");
      });
      await page.waitForFunction(() =>
        window.pawsWorkbench.renderer.relationGroup.children.length > 0);
      await page.locator("#focus-3d-selection").click();
      const relationLines = await page.evaluate(() =>
        window.pawsWorkbench.renderer.relationGroup.children.length);
      const focusDistance = await page.evaluate((uid) => {
        const renderer = window.pawsWorkbench.renderer;
        return renderer.controls.target.distanceTo(renderer.meshes.get(uid).position);
      }, relationSelection.uid);
      assert.ok(focusDistance < 0.2);
      await delay(900);
      const inspection = {
        cameraPresets,
        relationEdges: relationSelection.edgeCount,
        relationLines,
        explodedDelta: explodedAfter - explodedBefore.y,
        focusDistance,
      };
      await page.locator("#layer-separation").fill("0");
      await page.evaluate(() => window.pawsWorkbench.setSelection(new Set()));
      await delay(500);
      const cameraBefore = await page.evaluate(() => ({
        position: window.pawsWorkbench.renderer.camera.position.toArray(),
        target: window.pawsWorkbench.renderer.controls.target.toArray(),
      }));
      const selectedBefore3d = await page.evaluate(
        () => [...window.pawsWorkbench.selection].join(","),
      );
      const canvas3d = await page.locator(".level-canvas-3d").boundingBox();
      assert.ok(canvas3d, "3D canvas should have a bounding box");
      await page.mouse.move(
        canvas3d.x + canvas3d.width * 0.68,
        canvas3d.y + canvas3d.height * 0.48,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvas3d.x + canvas3d.width * 0.38,
        canvas3d.y + canvas3d.height * 0.38,
        { steps: 45 },
      );
      await page.mouse.up();
      await delay(2700);
      const cameraAfter = await page.evaluate(() => ({
        position: window.pawsWorkbench.renderer.camera.position.toArray(),
        target: window.pawsWorkbench.renderer.controls.target.toArray(),
      }));
      assert.notDeepEqual(cameraAfter, cameraBefore);
      const selectedUid3d = await clickVisibleTileIn3d(page);
      await page.waitForFunction(
        (uid) => window.pawsWorkbench.selection.has(uid),
        selectedUid3d,
      );
      const selectedAfter3d = await page.evaluate(
        () => [...window.pawsWorkbench.selection].join(","),
      );
      assert.notEqual(selectedAfter3d, selectedBefore3d);
      await page.evaluate(() => window.pawsWorkbench.setSelection(new Set()));
      await page.locator('[data-tool="delete"]').click();
      const deletedUid3d = await clickVisibleTileIn3d(page);
      await page.waitForFunction(
        (uid) => !window.pawsWorkbench.document.tiles.some((tile) => tile.uid === uid),
        deletedUid3d,
      );
      const deletedCount = await page.evaluate(
        () => window.pawsWorkbench.document.tiles.length,
      );
      await delay(850);
      await page.locator("#undo").click();
      await page.waitForFunction(
        (uid) => window.pawsWorkbench.document.tiles.some((tile) => tile.uid === uid),
        deletedUid3d,
      );
      const restoredCount = await page.evaluate(
        () => window.pawsWorkbench.document.tiles.length,
      );
      await page.locator('[data-tool="select"]').click();
      const deleteUndo = {
        uid: deletedUid3d,
        deletedCount,
        restoredCount,
        restored: restoredCount === 202,
      };
      assert.deepEqual(
        { deletedCount, restoredCount, restored: deleteUndo.restored },
        { deletedCount: 201, restoredCount: 202, restored: true },
      );
      proof.actions.edit3d = {
        cameraBefore,
        cameraAfter,
        inspection,
        selectedBefore: selectedBefore3d,
        selectedAfter: selectedAfter3d,
        deleteUndo,
      };
      await delay(1200);

      // 00:50 — enter play mode and change state through real 2D and 3D canvases.
      await waitUntil(startedAt, 50);
      markChapter(proof.timeline, "play", startedAt, 50);
      await page.locator("#view-2d").click();
      await page.locator("#mode-play").click();
      await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
      const initialTools = await page.evaluate(() =>
        window.pawsWorkbench.playSnapshot.tools);
      assert.deepEqual(initialTools, {
        shuffle: { remaining: 1 },
        match: { remaining: 1 },
        undo: { remaining: 1 },
      });
      const playTools = { initial: initialTools };

      const undoUid = await stashAvailableTileIn2d(page);
      const trayBeforeUndo = await page.evaluate(() => [
        ...window.pawsWorkbench.playSnapshot.tray,
      ]);
      await delay(650);
      await page.locator("#play-tool-undo").click();
      await page.waitForFunction(
        (uid) =>
          window.pawsWorkbench.playSnapshot.tools.undo.remaining === 0 &&
          !window.pawsWorkbench.playSnapshot.tray.includes(uid),
        undoUid,
      );
      const undoState = await page.evaluate(() => ({
        tray: [...window.pawsWorkbench.playSnapshot.tray],
        remaining: window.pawsWorkbench.playSnapshot.tools.undo.remaining,
      }));
      playTools.undo = {
        uid: undoUid,
        trayBefore: trayBeforeUndo,
        trayAfter: undoState.tray,
        remaining: undoState.remaining,
      };
      await delay(700);

      const removedBeforeToolMatch = await page.evaluate(() =>
        window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length,
      );
      await page.locator("#play-tool-match").click();
      await page.waitForFunction(
        (before) =>
          window.pawsWorkbench.playSnapshot.tools.match.remaining === 0 &&
          window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length
            === before + 2,
        removedBeforeToolMatch,
      );
      const matchState = await page.evaluate(() => ({
        removedAfter:
          window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length,
        remaining: window.pawsWorkbench.playSnapshot.tools.match.remaining,
        tools: window.pawsWorkbench.playSnapshot.tools,
      }));
      playTools.match = {
        removedBefore: removedBeforeToolMatch,
        removedAfter: matchState.removedAfter,
        remaining: matchState.remaining,
      };
      playTools.shared2d = matchState.tools;
      await delay(900);

      await page.locator("#view-3d").click();
      await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
      await waitForWorkbench(page);
      playTools.shared3d = await page.evaluate(() =>
        window.pawsWorkbench.playSnapshot.tools);
      assert.deepEqual(playTools.shared3d, playTools.shared2d);
      const beforeToolShuffle = await page.evaluate(() => {
        const boardTiles = window.pawsWorkbench.playSnapshot.tiles.filter(
          ({ removed, stashedSlot }) => !removed && !Number.isInteger(stashedSlot),
        );
        return {
          identity: boardTiles.map(({ uid, x, y, layer, faceDown }) => ({
            uid,
            x,
            y,
            layer,
            faceDown,
          })),
          types: boardTiles
            .map(({ type }) => type)
            .sort((left, right) => left - right),
        };
      });
      await delay(600);
      await page.locator("#play-tool-shuffle").click();
      await page.waitForFunction(() =>
        window.pawsWorkbench.playSnapshot.tools.shuffle.remaining === 0);
      const afterToolShuffle = await page.evaluate(() => {
        const boardTiles = window.pawsWorkbench.playSnapshot.tiles.filter(
          ({ removed, stashedSlot }) => !removed && !Number.isInteger(stashedSlot),
        );
        return {
          identity: boardTiles.map(({ uid, x, y, layer, faceDown }) => ({
            uid,
            x,
            y,
            layer,
            faceDown,
          })),
          types: boardTiles
            .map(({ type }) => type)
            .sort((left, right) => left - right),
          tools: window.pawsWorkbench.playSnapshot.tools,
        };
      });
      assert.deepEqual(afterToolShuffle.identity, beforeToolShuffle.identity);
      assert.deepEqual(afterToolShuffle.types, beforeToolShuffle.types);
      playTools.shuffle = {
        identityPreserved: true,
        typeMultisetPreserved: true,
        remaining: afterToolShuffle.tools.shuffle.remaining,
      };
      playTools.allConsumed = afterToolShuffle.tools;
      await delay(1_000);

      await page.locator("#view-2d").click();
      await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
      await page.locator("#restart-play").click();
      await page.waitForFunction(() =>
        Object.values(window.pawsWorkbench.playSnapshot.tools)
          .every(({ remaining }) => remaining === 1));
      playTools.afterRestart = await page.evaluate(() =>
        window.pawsWorkbench.playSnapshot.tools);
      proof.actions.playTools = playTools;
      await delay(650);

      const removedBefore = await page.evaluate(() =>
        window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length,
      );
      await clickMatchingPairIn2d(page);
      await page.waitForFunction(
        (before) =>
          window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length >
          before,
        removedBefore,
      );
      const removedAfter = await page.evaluate(() =>
        window.pawsWorkbench.playSnapshot.tiles.filter((tile) => tile.removed).length,
      );
      assert.ok(removedAfter > removedBefore);
      proof.actions.play2d = { removedBefore, removedAfter };
      await delay(750);
      await page.locator("#view-3d").click();
      await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
      await waitForWorkbench(page);
      const selectedBeforePlay3d = await page.evaluate(
        () => window.pawsWorkbench.playSnapshot.selectedTileUid ?? "",
      );
      const selectedUidPlay3d = await clickVisibleTileIn3d(page);
      await page.waitForFunction(
        (before) => (window.pawsWorkbench.playSnapshot.selectedTileUid ?? "") !== before,
        selectedBeforePlay3d,
      );
      const selectedAfterPlay3d = await page.evaluate(
        () => window.pawsWorkbench.playSnapshot.selectedTileUid ?? "",
      );
      assert.notEqual(selectedAfterPlay3d, selectedBeforePlay3d);
      assert.equal(selectedAfterPlay3d, selectedUidPlay3d);
      proof.actions.play3d = {
        selectedBefore: selectedBeforePlay3d,
        selectedAfter: selectedAfterPlay3d,
      };
      await delay(900);

      // 01:10 — save, reload, delete the local AI copy and verify it is forgotten.
      await waitUntil(startedAt, 70);
      markChapter(proof.timeline, "persistence", startedAt, 70);
      await page.locator("#mode-edit").click();
      await page.locator("#view-2d").click();
      const [exportDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#export-level").click(),
      ]);
      const exportedValue = JSON.parse(
        await readFile(await exportDownload.path(), "utf8"),
      );
      proof.actions.export = {
        fileName: exportDownload.suggestedFilename(),
        gridUnit: exportedValue.gridUnit,
        tileCount: exportedValue.tiles.length,
      };
      assert.equal(proof.actions.export.fileName, generatedFileName);
      assert.equal(proof.actions.export.gridUnit, "sheep_7x8_mini8");
      assert.equal(proof.actions.export.tileCount, 202);
      await delay(1100);
      await page.locator("#save-level").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#stage-toast")
          ?.textContent?.includes("已保存到当前浏览器"),
      );
      await page.waitForFunction(
        (key) => localStorage.getItem(key) !== null,
        generatedStorageKey,
      );
      const savedToLocalStorage = await page.evaluate(
        (key) => localStorage.getItem(key) !== null,
        generatedStorageKey,
      );
      assert.equal(savedToLocalStorage, true);
      await delay(2400);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        (fileName) => window.pawsWorkbench?.document?.fileName === fileName,
        generatedFileName,
      );
      await waitForWorkbench(page);
      const lastOpenedRestored = await page.evaluate(
        (fileName) => window.pawsWorkbench.document.fileName === fileName,
        generatedFileName,
      );
      assert.equal(lastOpenedRestored, true);
      const reloadedPosition = await page.evaluate((tileIndex) => {
        const tile = window.pawsWorkbench.document.tiles[tileIndex];
        return { x: tile.x, y: tile.y };
      }, editTileIndex);
      assert.deepEqual(reloadedPosition, savedPosition);
      const localCopyPreserved = await page.evaluate(
        (key) => localStorage.getItem(key) !== null,
        generatedStorageKey,
      );
      assert.equal(localCopyPreserved, true);
      await delay(1_700);
      assert.equal(await page.locator("#delete-local-level").isEnabled(), true);
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#delete-local-level").click();
      await page.waitForFunction(
        ({ deletedFileName, requestedFileName, expectedCount }) =>
          window.pawsWorkbench?.document?.fileName === requestedFileName
          && window.pawsWorkbench?.levels?.length === expectedCount
          && localStorage.getItem(
            `paws-level-editor-demo-v1:${deletedFileName}`,
          ) === null,
        {
          deletedFileName: generatedFileName,
          requestedFileName: defaultFileName,
          expectedCount: baselineLevelCount,
        },
      );
      await waitForWorkbench(page);
      const returnedToDefault = await page.evaluate(
        (fileName) => window.pawsWorkbench.document.fileName === fileName,
        defaultFileName,
      );
      assert.equal(returnedToDefault, true);
      const deletion = await page.evaluate(async (fileName) => ({
        deletedFromStorage:
          localStorage.getItem(`paws-level-editor-demo-v1:${fileName}`) === null,
        absentFromCatalog:
          !window.pawsWorkbench.levels.some((level) => level.fileName === fileName),
        referenceCountAfterDelete:
          (await window.pawsWorkbench.loadAiReferenceDocuments()).length,
      }), generatedFileName);
      assert.deepEqual(deletion, {
        deletedFromStorage: true,
        absentFromCatalog: true,
        referenceCountAfterDelete: baselineLevelCount,
      });
      proof.actions.persistence = {
        savedProperty: savedPosition.x,
        savedPosition,
        savedToLocalStorage,
        lastOpenedRestored,
        reloadedProperty: reloadedPosition.x,
        reloadedPosition,
        localCopyPreserved,
        returnedToDefault,
        ...deletion,
      };

      await waitUntil(startedAt, targetDuration);
      assert.deepEqual(errors.console, []);
      assert.deepEqual(errors.page, []);
      proof.recording.completedAt = new Date().toISOString();
      proof.recording.durationMs = Date.now() - startedAt;
      return {
        browserLabel: launch.label,
        preRollMs: startedAt - rawStartedAt,
        proof,
        video,
      };
    },
  });
  return {
    ...recording,
    webmPath: await recording.video.path(),
  };
}

async function main() {
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    throw new Error(
      "ffmpeg is unavailable. Run `npm install` or set FFMPEG_PATH to a working ffmpeg binary.",
    );
  }
  await mkdir(videoRoot, { recursive: true });
  const recording = await recordEditor();
  await run(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    recording.webmPath,
    "-ss",
    (recording.preRollMs / 1000).toFixed(3),
    "-t",
    String(targetDuration),
    "-vf",
    "scale=1280:720:flags=lanczos,fps=30",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    outputPath,
  ]);
  await run(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "00:00:32.5",
    "-i",
    outputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    posterPath,
  ]);
  await run(ffmpegPath, [
    "-v",
    "error",
    "-i",
    outputPath,
    "-f",
    "null",
    "-",
  ]);
  recording.proof.media = {
    file: "paws-level-editor-tutorial.mp4",
    sha256: await sha256File(outputPath),
  };
  recording.proof.sources = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (relativePath) => [
        relativePath,
        await sha256SourceFile(join(repoRoot, ...relativePath.split("/"))),
      ]),
    ),
  );
  recording.proof.assets = Object.fromEntries(
    await Promise.all(
      assetFiles.map(async (relativePath) => [
        relativePath,
        await sha256File(join(repoRoot, ...relativePath.split("/"))),
      ]),
    ),
  );
  await writeFile(
    proofPath,
    `${JSON.stringify(recording.proof, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Recorded ${outputPath}\nPoster ${posterPath}\nProof ${proofPath}\nBrowser ${recording.browserLabel}`,
  );
}

await main();
