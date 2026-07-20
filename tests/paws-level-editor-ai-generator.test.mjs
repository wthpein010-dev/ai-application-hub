import assert from "node:assert/strict";
import test from "node:test";

import {
  DIFFICULTY_PROFILES,
  generateAiLevel,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";
import { solveLevel } from "../projects/paws-level-editor/core/level-solver.mjs";
import { validateLevel } from "../projects/paws-level-editor/core/level-validator.mjs";

function tile(uid, x, y, layer, type) {
  return {
    uid,
    x,
    y,
    layer,
    type,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType: 1,
  };
}

function makeDocument(tiles, {
  width = 8,
  height = 10,
  name = "参考关卡",
} = {}) {
  return {
    original: {
      id: 9000,
      name,
      difficulty: "Normal",
      gridUnit: "sheep_8x10_mini8",
      features: {},
      bagOffer: [],
      tiles: tiles.map(({ uid, ...value }) => value),
      stacks: [],
    },
    designerNote: {
      widthNum: width,
      heightNum: height,
      boardScale: 1,
      blockTypeCount: 16,
      fullRandomTypeMin: 1,
      fullRandomTypeMax: 32,
      levelData: {},
    },
    id: 9000,
    name,
    difficulty: "Normal",
    gridUnit: "sheep_8x10_mini8",
    board: { width, height, scale: 1 },
    random: { blockTypeCount: 16, fullTypeMin: 1, fullTypeMax: 32 },
    tiles,
    warnings: [],
  };
}

const reference = makeDocument([
  tile("r1", 8, 16, 1, 1),
  tile("r2", 48, 16, 1, 1),
  tile("r3", 12, 20, 2, 2),
  tile("r4", 44, 20, 2, 2),
  tile("r5", 16, 24, 3, 3),
  tile("r6", 40, 24, 3, 3),
]);

test("statistics report layers, overlap, symmetry, exact stacks and initial pairs", () => {
  const stats = extractLevelStatistics(makeDocument([
    tile("a", 0, 0, 1, 1),
    tile("b", 16, 0, 1, 1),
    tile("c", 4, 4, 2, 2),
    tile("d", 20, 4, 2, 2),
  ]));

  assert.equal(stats.tileCount, 4);
  assert.equal(stats.layerCount, 2);
  assert.equal(stats.layerHistogram[1], 2);
  assert.equal(stats.layerHistogram[2], 2);
  assert.equal(stats.intersectingCrossLayerPairs, 2);
  assert.equal(stats.crossLayerPairCount, 4);
  assert.equal(stats.overlapRatio, 0.5);
  assert.equal(stats.maxExactStackDepth, 1);
  assert.equal(stats.initialAccessiblePairs, 1);
  assert.equal(stats.symmetryScore, 0);
  assert.equal(stats.maxDependencyDepth, 2);
  assert.equal(stats.normalizedAnchors.length, 4);
});

test("merged statistics average boards and retain bounded learned anchors", () => {
  const merged = mergeLevelStatistics([
    extractLevelStatistics(reference),
    extractLevelStatistics(makeDocument(reference.tiles, { width: 10, height: 12 })),
  ]);

  assert.deepEqual(merged.board, { width: 9, height: 11, scale: 1 });
  assert.equal(merged.sampleCount, 2);
  assert.equal(merged.symmetryScore > 0, true);
  assert.equal(merged.normalizedAnchors.length, 12);
  assert.equal(merged.normalizedAnchors.every(({ x, y }) =>
    x >= 0 && x <= 1 && y >= 0 && y <= 1), true);
});

test("solver removes a symmetric dependency chain", () => {
  const document = makeDocument([
    tile("lower-left", 0, 0, 1, 1),
    tile("lower-right", 16, 0, 1, 1),
    tile("upper-left", 4, 4, 2, 2),
    tile("upper-right", 20, 4, 2, 2),
  ]);

  const report = solveLevel(document);

  assert.equal(report.solvable, true);
  assert.equal(report.steps, 2);
  assert.deepEqual(report.moves[0].sort(), ["upper-left", "upper-right"]);
  assert.equal(report.initialAccessiblePairs, 1);
  assert.equal(report.nodes > 0, true);
});

test("solver rejects a side-blocked position without an accessible match", () => {
  const document = makeDocument([
    tile("left-a", 0, 0, 1, 2),
    tile("blocked-a", 8, 0, 1, 1),
    tile("right-a", 16, 0, 1, 3),
    tile("left-b", 0, 24, 1, 4),
    tile("blocked-b", 8, 24, 1, 1),
    tile("right-b", 16, 24, 1, 5),
  ]);

  const report = solveLevel(document);

  assert.equal(report.solvable, false);
  assert.equal(report.steps, 0);
  assert.equal(report.initialAccessiblePairs, 0);
  assert.equal(report.exhausted, false);
});

test("solver reports a deterministic node limit", () => {
  const document = makeDocument([
    tile("a", 0, 0, 1, 1),
    tile("b", 16, 0, 1, 1),
    tile("c", 0, 16, 1, 2),
    tile("d", 16, 16, 1, 2),
  ]);

  const report = solveLevel(document, { maxNodes: 1 });

  assert.equal(report.solvable, false);
  assert.equal(report.exhausted, true);
  assert.equal(report.nodes, 1);
});

for (const difficulty of ["easy", "normal", "hard"]) {
  for (const layout of ["balanced", "progressive", "open"]) {
    test(`generates constrained solvable ${difficulty}/${layout}`, () => {
      const generated = generateAiLevel({
        references: [reference],
        difficulty,
        layout,
        seed: 73125,
      });
      const profile = DIFFICULTY_PROFILES[difficulty];
      const stats = extractLevelStatistics(generated.document);
      const errors = validateLevel(generated.document)
        .filter(({ severity }) => severity === "error");

      assert.deepEqual(errors, []);
      assert.equal(generated.report.solvable, true);
      assert.equal(generated.report.steps, stats.tileCount / 2);
      assert.equal(
        stats.tileCount >= profile.tiles[0] && stats.tileCount <= profile.tiles[1],
        true,
      );
      assert.equal(
        stats.layerCount >= profile.layers[0] && stats.layerCount <= profile.layers[1],
        true,
      );
      assert.equal(stats.initialAccessiblePairs >= profile.minInitialPairs, true);
      assert.equal(stats.overlapRatio <= profile.maxOverlap, true);
      assert.equal(stats.maxExactStackDepth <= 2, true);
      assert.equal(
        generated.document.tiles.every(({ type }) => type >= 1 && type <= 32),
        true,
      );
      assert.equal(
        generated.document.designerNote.aiGeneration.options.difficulty,
        difficulty,
      );
      assert.equal(
        generated.document.designerNote.aiGeneration.options.layout,
        layout,
      );
    });
  }
}

test("generator is deterministic for one seed and varies across seeds", () => {
  const first = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    seed: 20260720,
  });
  const repeated = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    seed: 20260720,
  });
  const different = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    seed: 20260721,
  });

  assert.deepEqual(first.document.tiles, repeated.document.tiles);
  assert.deepEqual(first.report.moves, repeated.report.moves);
  assert.notDeepEqual(first.document.tiles, different.document.tiles);
});

test("generator rejects missing references and invalid options without producing a level", () => {
  assert.throws(
    () => generateAiLevel({
      references: [],
      difficulty: "normal",
      layout: "balanced",
      seed: 1,
    }),
    /参考关卡/,
  );
  assert.throws(
    () => generateAiLevel({
      references: [reference],
      difficulty: "impossible",
      layout: "balanced",
      seed: 1,
    }),
    /选项无效/,
  );
});
