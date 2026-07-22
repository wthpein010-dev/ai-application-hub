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
const defaultFileName = "level_0020_r2_第二关模板12.json";
const sourceFiles = [
  "projects/paws-level-editor/index.html",
  "projects/paws-level-editor/styles.css",
  "projects/paws-level-editor/app.mjs",
  "projects/paws-level-editor/static-api-client.mjs",
  "projects/paws-level-editor/core/ai-level-generator.mjs",
  "projects/paws-level-editor/core/editor-geometry.mjs",
  "projects/paws-level-editor/core/level-difficulty.mjs",
  "projects/paws-level-editor/core/level-solver.mjs",
  "projects/paws-level-editor/core/level-statistics.mjs",
  "projects/paws-level-editor/core/level-validator.mjs",
  "projects/paws-level-editor/core/view-model.mjs",
  "projects/paws-level-editor/ui/ai-level-dialog.mjs",
  "projects/paws-level-editor/ui/editor-shortcuts.mjs",
  "projects/paws-level-editor/ui/inspector.mjs",
  "projects/paws-level-editor/ui/level-export.mjs",
  "projects/paws-level-editor/ui/local-level-import.mjs",
  "projects/paws-level-editor/ui/level-summary.mjs",
  "projects/paws-level-editor/ui/workbench-controller.mjs",
  "projects/paws-level-editor/views/canvas-2d.mjs",
  "projects/paws-level-editor/views/three-3d.mjs",
  "projects/paws-level-editor/levels/index.json",
  "projects/paws-level-editor/levels/level_0020_r2_第二关模板12.json",
  "scripts/record-paws-level-editor-demo.mjs",
  "scripts/paws-recording-support.mjs",
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
      await waitForWorkbench(page);
      await page.locator('[role="option"]').first().waitFor({ state: "visible" });
      await page.waitForFunction(
        (requested) =>
          window.pawsWorkbench?.document?.fileName === requested
          && window.pawsWorkbench?.levels?.length === 30,
        defaultFileName,
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

      // 00:00 — show the 30-level library, requested default and local AI generation.
      markChapter(proof.timeline, "tools", startedAt, 0);
      await page.locator("#fit-view").click();
      await delay(1_200);
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
      assert.equal(aiGeneration.referenceCount, 30);
      assert.equal(aiGeneration.sameLayerOverlapPairs, 0);
      assert.equal(aiGeneration.totalEven, true);
      assert.equal(aiGeneration.globalTypesEven, true);
      assert.equal(aiGeneration.layerTypesEven, true);
      assert.ok(Math.abs(aiGeneration.actualScore - aiGeneration.targetScore) <= 5);
      assert.equal(await page.locator('[role="option"]').count(), 31);
      proof.actions.aiGeneration = aiGeneration;
      const generatedFileName = aiGeneration.fileName;
      const generatedStorageKey = `paws-level-editor-demo-v1:${generatedFileName}`;
      await page.locator("#fit-view").click();
      await waitForWorkbench(page);

      // 00:12 — real 2D selection, drag and visible property edit.
      await waitUntil(startedAt, 12);
      markChapter(proof.timeline, "edit2d", startedAt, 12);
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
      await delay(900);
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
      await delay(2800);
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
      await delay(2700);

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
      await waitForWorkbench(page);
      await page.locator('[role="option"]', { hasText: generatedFileName }).click();
      await page.waitForFunction(
        (fileName) => window.pawsWorkbench?.document?.fileName === fileName,
        generatedFileName,
      );
      await waitForWorkbench(page);
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
        ({ deletedFileName, requestedFileName }) =>
          window.pawsWorkbench?.document?.fileName === requestedFileName
          && window.pawsWorkbench?.levels?.length === 30
          && localStorage.getItem(
            `paws-level-editor-demo-v1:${deletedFileName}`,
          ) === null,
        { deletedFileName: generatedFileName, requestedFileName: defaultFileName },
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
        referenceCountAfterDelete: 30,
      });
      proof.actions.persistence = {
        savedProperty: savedPosition.x,
        savedPosition,
        savedToLocalStorage,
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
    "00:00:38",
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
