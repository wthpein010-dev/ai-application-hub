import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
process.env.FFMPEG_PATH ||= require("ffmpeg-static");
const { decodeMedia, inspectMedia } = await import("./media-inspect.mjs");

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "paws-level-editor", "video");
const mediaPath = join(videoRoot, "paws-level-editor-tutorial.mp4");
const proofPath = join(videoRoot, "recording-proof.json");
const ffmpegPath = process.env.FFMPEG_PATH;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Source(path) {
  return sha256(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
}

test("tutorial player exposes lazy loading, captions and five chapters", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /<video[^>]+controls[^>]+playsinline[^>]+preload="none"/);
  assert.match(html, /data-src="\.\/paws-level-editor-tutorial\.mp4"/);
  assert.match(
    html,
    /<track[^>]+kind="captions"[^>]+src="\.\/paws-level-editor-tutorial\.vtt"[^>]+srclang="zh"[^>]+default/,
  );
  assert.equal((html.match(/data-time="/g) || []).length, 5);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
});

test("tutorial assets keep the chapter timeline and player references aligned", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  const captions = readFileSync(
    join(videoRoot, "paws-level-editor-tutorial.vtt"),
    "utf8",
  );
  const script = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");

  for (const time of ["0", "12", "32", "50", "70"]) {
    assert.match(html, new RegExp(`data-time="${time}"`));
  }
  for (const cue of ["00:00.000", "00:12.000", "00:32.000", "00:50.000", "01:10.000"]) {
    assert.equal(captions.includes(cue), true, `captions should include ${cue}`);
  }
  assert.match(script, /00:00/);
  assert.match(script, /01:10/);
  assert.match(script, /7×8 工程网格/);
  assert.match(script, /随机、配对、撤回/);
  assert.match(captions, /工程网格/);
  assert.match(captions, /随机、配对、撤回/);
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("tutorial is 16:9 H.264 and lasts 75 to 110 seconds", () => {
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 75 && media.duration <= 110);

  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});

test("recording proof matches current media, sources, timeline and real state changes", () => {
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  const proofText = JSON.stringify(proof);

  assert.equal(proof.schemaVersion, 1);
  assert.equal(new Date(proof.recordedAt).toISOString(), proof.recordedAt);
  assert.doesNotMatch(proofText, /[A-Za-z]:[\\/]|Users[\\/]|AppData[\\/]/i);
  assert.equal(proof.media.file, "paws-level-editor-tutorial.mp4");
  assert.equal(proof.media.sha256, sha256(readFileSync(mediaPath)));

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
  assert.deepEqual(Object.keys(proof.sources).sort(), sourceFiles.sort());
  for (const relativePath of sourceFiles) {
    assert.equal(
      proof.sources[relativePath],
      sha256Source(join(root, ...relativePath.split("/"))),
      relativePath,
    );
  }
  const assetFiles = [
    "projects/paws-level-editor/assets/gameplay/btn_random.png",
    "projects/paws-level-editor/assets/gameplay/btn_magnet.png",
    "projects/paws-level-editor/assets/gameplay/btn_rollback.png",
  ];
  assert.deepEqual(Object.keys(proof.assets).sort(), assetFiles.sort());
  for (const relativePath of assetFiles) {
    assert.equal(
      proof.assets[relativePath],
      sha256(readFileSync(join(root, ...relativePath.split("/")))),
      relativePath,
    );
  }

  const expectedChapters = {
    tools: 0,
    edit2d: 12_000,
    view3d: 32_000,
    play: 50_000,
    persistence: 70_000,
  };
  for (const [chapter, expectedMs] of Object.entries(expectedChapters)) {
    assert.ok(
      Math.abs(proof.timeline[chapter] - expectedMs) <= 1_500,
      `${chapter} triggered at ${proof.timeline[chapter]}ms`,
    );
  }

  const actions = proof.actions;
  assert.equal(Number.isInteger(actions.metadata.levelId), true);
  assert.equal(new Date(actions.metadata.modifiedAt).toISOString(), actions.metadata.modifiedAt);
  assert.doesNotMatch(actions.metadata.cardText, /#undefined|Invalid Date/);
  assert.match(actions.aiGeneration.fileName, /^ai_level_\d+\.json$/);
  assert.equal(actions.aiGeneration.reference, "all");
  assert.equal(actions.aiGeneration.solvable, true);
  assert.equal(actions.aiGeneration.tileCount, 200);
  assert.equal(actions.aiGeneration.layerCount, 15);
  assert.equal(actions.aiGeneration.targetScore, 60);
  assert.deepEqual(actions.aiGeneration.board, { width: 7, height: 8 });
  assert.equal(actions.aiGeneration.gridUnit, "sheep_7x8_mini8");
  assert.deepEqual(actions.aiGeneration.designerBoard, { width: 7, height: 8 });
  assert.equal(actions.aiGeneration.coordinatesInBounds, true);
  assert.equal(actions.aiGeneration.source, "ai");
  assert.equal(actions.aiGeneration.aiReferenceEligible, false);
  assert.equal(actions.aiGeneration.referenceCount, 1);
  assert.equal(actions.aiGeneration.sameLayerOverlapPairs, 0);
  assert.equal(actions.aiGeneration.totalEven, true);
  assert.equal(actions.aiGeneration.globalTypesEven, true);
  assert.equal(actions.aiGeneration.layerTypesEven, true);
  assert.deepEqual(actions.grass.twoD, {
    canvasCount: 1,
    imageReady: true,
    visualScale: 0.5,
    variantRotations: {
      Grass1: 0,
      Grass2: Math.PI,
    },
    animated: true,
  });
  assert.equal(actions.grass.threeD.patchCount, 12);
  assert.equal(actions.grass.threeD.animated, true);
  assert.deepEqual(
    actions.grass.threeD.geometrySizes,
    [[0.6625, 0.3625], [0.375, 0.4375]],
  );
  assert.equal(actions.passRate.trialCount, 12);
  assert.equal(actions.passRate.passCount <= actions.passRate.trialCount, true);
  assert.equal(actions.passRate.passPercent >= 0 && actions.passRate.passPercent <= 100, true);
  assert.equal(actions.passRate.stale, false);
  assert.deepEqual(actions.fieldGrid, {
    board: { width: 7, height: 8 },
    bounds: { minX: 0, minY: 0, maxX: 56, maxY: 64 },
    majorLineCount: 17,
    centerLineCount: 15,
    xLabels: [0, 8, 16, 24, 32, 40, 48, 56],
    yLabels: [0, 8, 16, 24, 32, 40, 48, 56, 64],
    edit2d: true,
  });
  assert.equal(
    Math.abs(actions.aiGeneration.actualScore - actions.aiGeneration.targetScore) <= 5,
    true,
  );
  assert.deepEqual(
    Object.keys(actions.aiGeneration.dimensions),
    ["structure", "information", "choice", "route", "endurance"],
  );
  assert.notDeepEqual(actions.edit2d.drag.before, actions.edit2d.drag.after);
  assert.equal(actions.edit2d.drag.selectedBefore, actions.edit2d.drag.uid);
  assert.equal(actions.edit2d.drag.selectedAfter, actions.edit2d.drag.uid);
  assert.notEqual(actions.edit2d.property.before, actions.edit2d.property.after);
  assert.deepEqual(actions.safeEditing, {
    tileCountBefore: 200,
    tileCountAfter: 202,
    sameLayerOverlapPairs: 0,
  });
  assert.deepEqual(actions.fillTool, {
    count: 4,
    types: [-1, -1, -1, -1],
    layers: [20, 21, 22, 23],
    positions: [[0, 0], [1, 0], [2, 0], [3, 0]],
    historyDelta: 1,
    undone: true,
  });
  assert.equal(actions.layerInspection.through2d, actions.layerInspection.through3d);
  assert.ok(actions.layerInspection.through2d > 0);
  assert.ok(actions.layerInspection.single3d > 0);
  assert.notDeepEqual(actions.edit3d.cameraBefore, actions.edit3d.cameraAfter);
  assert.deepEqual(Object.keys(actions.edit3d.inspection.cameraPresets), [
    "iso",
    "top",
    "front",
    "side",
  ]);
  assert.ok(actions.edit3d.inspection.relationEdges > 0);
  assert.ok(actions.edit3d.inspection.relationLines > 0);
  assert.ok(actions.edit3d.inspection.explodedDelta > 1);
  assert.ok(actions.edit3d.inspection.focusDistance < 0.2);
  assert.notEqual(actions.edit3d.selectedBefore, actions.edit3d.selectedAfter);
  assert.equal(actions.edit3d.deleteUndo.deletedCount, 201);
  assert.equal(actions.edit3d.deleteUndo.restoredCount, 202);
  assert.equal(actions.edit3d.deleteUndo.restored, true);
  assert.ok(actions.play2d.removedAfter > actions.play2d.removedBefore);
  assert.notEqual(actions.play3d.selectedBefore, actions.play3d.selectedAfter);
  assert.deepEqual(actions.playTools.initial, {
    shuffle: { remaining: 1 },
    match: { remaining: 1 },
    undo: { remaining: 1 },
  });
  assert.equal(actions.playTools.undo.trayBefore.includes(actions.playTools.undo.uid), true);
  assert.equal(actions.playTools.undo.trayAfter.includes(actions.playTools.undo.uid), false);
  assert.equal(actions.playTools.undo.remaining, 0);
  assert.equal(
    actions.playTools.match.removedAfter,
    actions.playTools.match.removedBefore + 2,
  );
  assert.equal(actions.playTools.match.remaining, 0);
  assert.deepEqual(actions.playTools.shared2d, actions.playTools.shared3d);
  assert.deepEqual(actions.playTools.shared3d, {
    shuffle: { remaining: 1 },
    match: { remaining: 0 },
    undo: { remaining: 0 },
  });
  assert.equal(actions.playTools.shuffle.identityPreserved, true);
  assert.equal(actions.playTools.shuffle.typeMultisetPreserved, true);
  assert.equal(actions.playTools.shuffle.remaining, 0);
  assert.deepEqual(actions.playTools.allConsumed, {
    shuffle: { remaining: 0 },
    match: { remaining: 0 },
    undo: { remaining: 0 },
  });
  assert.deepEqual(actions.playTools.afterRestart, {
    shuffle: { remaining: 1 },
    match: { remaining: 1 },
    undo: { remaining: 1 },
  });
  assert.equal(actions.persistence.savedToLocalStorage, true);
  assert.equal(actions.persistence.lastOpenedRestored, true);
  assert.equal(
    actions.persistence.reloadedProperty,
    actions.persistence.savedProperty,
  );
  assert.deepEqual(
    actions.persistence.reloadedPosition,
    actions.persistence.savedPosition,
  );
  assert.equal(actions.persistence.localCopyPreserved, true);
  assert.equal(actions.persistence.returnedToDefault, true);
  assert.equal(actions.persistence.deletedFromStorage, true);
  assert.equal(actions.persistence.absentFromCatalog, true);
  assert.equal(actions.persistence.referenceCountAfterDelete, 1);
  assert.match(actions.export.fileName, /^ai_level_\d+\.json$/);
  assert.equal(actions.export.gridUnit, "sheep_7x8_mini8");
  assert.equal(actions.export.tileCount, 202);
  assert.deepEqual(proof.errors.console, []);
  assert.deepEqual(proof.errors.page, []);
});

test("five chapter frames differ and media has no long black or frozen segment", () => {
  const frameHashes = ["00:00:05", "00:00:16", "00:00:38", "00:00:56", "00:01:14"]
    .map((timestamp) => {
      const frame = spawnSync(
        ffmpegPath,
        [
          "-v", "error",
          "-ss", timestamp,
          "-i", mediaPath,
          "-frames:v", "1",
          "-f", "image2pipe",
          "-vcodec", "mjpeg",
          "pipe:1",
        ],
        { encoding: null, maxBuffer: 8 * 1024 * 1024 },
      );
      assert.equal(frame.status, 0, frame.stderr?.toString() || frame.error?.message);
      assert.ok(frame.stdout.length > 0, `${timestamp} should produce a frame`);
      return sha256(frame.stdout);
    });
  assert.equal(new Set(frameHashes).size, 5);

  const contentGate = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-i", mediaPath,
      "-vf", "blackdetect=d=2:pix_th=0.10,freezedetect=n=-50dB:d=20",
      "-an",
      "-f", "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(contentGate.status, 0, contentGate.stderr || contentGate.error?.message);
  assert.doesNotMatch(contentGate.stderr, /black_start:/);
  assert.doesNotMatch(contentGate.stderr, /freeze_start:/);
});
