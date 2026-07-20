import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "../tests/support/paws-static-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const bundledFfmpeg = require("ffmpeg-static");
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(repoRoot, "projects", "paws-level-editor", "video");
const outputPath = join(videoRoot, "paws-level-editor-tutorial.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const recordingRoot = join(tmpdir(), "paws-level-editor-demo-recording");
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg;
const targetDuration = 88;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
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
            return { uid: tile.uid, ...point };
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
        return [candidates[index].point, pair.point];
      }
    }
    return [];
  });
  if (targets.length !== 2) {
    throw new Error("No visible matching pair was available for the 2D play recording");
  }
  const box = await page.locator(".level-canvas-2d").boundingBox();
  for (const target of targets) {
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await delay(850);
  }
}

async function clickVisibleTileIn3d(page) {
  const target = await page.evaluate(() => {
    const controller = window.pawsWorkbench;
    const renderer = controller.renderer;
    const rectangle = renderer.renderer.domElement.getBoundingClientRect();
    const source =
      controller.mode === "play"
        ? controller.playSnapshot.tiles.filter(
            (tile) =>
              !tile.removed &&
              !Number.isInteger(tile.stashedSlot) &&
              !tile.covered &&
              !tile.sideBlocked,
          )
        : controller.document.tiles;
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
          return point;
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
}

async function recordEditor() {
  await rm(recordingRoot, { recursive: true, force: true });
  await mkdir(recordingRoot, { recursive: true });
  const server = await startStaticServer({ root: repoRoot });
  const { browser, label } = await launchBrowser();
  let context;
  let video;
  const browserErrors = [];
  try {
    context = await browser.newContext({
      deviceScaleFactor: 1,
      recordVideo: {
        dir: recordingRoot,
        size: { width: 1280, height: 720 },
      },
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    video = page.video();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });

    const startedAt = Date.now();
    await page.goto(
      `${server.baseUrl}/projects/paws-level-editor/index.html`,
      { waitUntil: "domcontentloaded" },
    );
    await waitForWorkbench(page);

    // 00:00 — the real tool opens its bundled showcase automatically.
    await page.locator('[role="option"]').waitFor({ state: "visible" });
    await page.locator("#fit-view").click();

    // 00:12 — real 2D selection, drag and visible property edit.
    await waitUntil(startedAt, 12);
    const editTile = await visibleEditTile(page);
    const canvas2d = await page.locator(".level-canvas-2d").boundingBox();
    await page.mouse.click(canvas2d.x + editTile.x, canvas2d.y + editTile.y);
    await delay(1700);
    await page.mouse.move(canvas2d.x + editTile.x, canvas2d.y + editTile.y);
    await page.mouse.down();
    await page.mouse.move(
      canvas2d.x + editTile.x + 42,
      canvas2d.y + editTile.y + 18,
      { steps: 28 },
    );
    await page.mouse.up();
    await delay(2200);
    const tileX = page.locator('[data-tile-field="x"]');
    const currentX = Number(await tileX.inputValue());
    await tileX.fill(String(currentX + 1));
    await tileX.press("Tab");
    await delay(2400);

    // 00:32 — switch to the real WebGL view, orbit the camera and pick a tile.
    await waitUntil(startedAt, 32);
    await page.locator("#view-3d").click();
    await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
    await waitForWorkbench(page);
    const canvas3d = await page.locator(".level-canvas-3d").boundingBox();
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
    await clickVisibleTileIn3d(page);
    await delay(2600);

    // 00:50 — enter play mode and change state through real 2D and 3D canvases.
    await waitUntil(startedAt, 50);
    await page.locator("#view-2d").click();
    await page.locator("#mode-play").click();
    await page.locator(".level-canvas-2d").waitFor({ state: "visible" });
    await clickMatchingPairIn2d(page);
    await delay(2800);
    await page.locator("#view-3d").click();
    await page.locator(".level-canvas-3d").waitFor({ state: "visible" });
    await waitForWorkbench(page);
    await clickVisibleTileIn3d(page);
    await delay(2700);

    // 01:10 — return to edit, save visibly, refresh to restore, then reset bundled data.
    await waitUntil(startedAt, 70);
    await page.locator("#mode-edit").click();
    await page.locator("#view-2d").click();
    await page.locator("#save-level").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#stage-toast")
        ?.textContent?.includes("已保存到当前浏览器"),
    );
    await delay(2400);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkbench(page);
    await delay(2500);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#reset-level").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#stage-toast")
        ?.textContent?.includes("已恢复内置示例"),
    );
    await waitUntil(startedAt, targetDuration);
    if (browserErrors.length) {
      throw new Error(`Browser errors during recording:\n${browserErrors.join("\n")}`);
    }
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
  return { browserLabel: label, webmPath: await video.path() };
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
  console.log(
    `Recorded ${outputPath}\nPoster ${posterPath}\nBrowser ${recording.browserLabel}\nSource ${recording.webmPath}`,
  );
}

await main();
