import assert from "node:assert/strict";
import test from "node:test";

import {
  DIFFICULTY_PROFILES,
  generateAiLevel,
  maxAverageBlockersForLayers,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";
import { solveLevel } from "../projects/paws-level-editor/core/level-solver.mjs";
import {
  DIFFICULTY_DIMENSION_WEIGHTS,
  rateDifficultyScore,
  scoreLevelDifficulty,
} from "../projects/paws-level-editor/core/level-difficulty.mjs";
import * as levelValidator from "../projects/paws-level-editor/core/level-validator.mjs";

const { validateLevel } = levelValidator;

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

function assertFixedSevenByEight(document) {
  assert.equal(document.board.width, 7);
  assert.equal(document.board.height, 8);
  assert.equal(document.gridUnit, "sheep_7x8_mini8");
  assert.equal(document.original.gridUnit, "sheep_7x8_mini8");
  assert.equal(document.designerNote.widthNum, 7);
  assert.equal(document.designerNote.heightNum, 8);
  assert.equal(
    document.tiles.every(({ x, y }) => x >= 0 && x <= 48 && y >= 0 && y <= 56),
    true,
  );
}

function sameLayerOverlapPairs(tiles) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
      const left = tiles[leftIndex];
      const right = tiles[rightIndex];
      if (
        left.layer === right.layer
        && Math.abs(left.x - right.x) < 8
        && Math.abs(left.y - right.y) < 8
      ) {
        pairs.push([left.uid, right.uid]);
      }
    }
  }
  return pairs;
}

test("AI validation rejects positive-area overlap on one layer", () => {
  const document = makeDocument([
    tile("left", 0, 0, 1, 1),
    tile("overlapping", 7, 0, 1, 1),
  ]);
  document.designerNote.aiGeneration = {};

  const overlapIssue = validateLevel(document)
    .find(({ code }) => code === "same-layer-overlap");

  assert.equal(Boolean(overlapIssue), true);
  assert.deepEqual(overlapIssue.tileUids.sort(), ["left", "overlapping"]);
});

test("AI validation permits edge-touching tiles", () => {
  const document = makeDocument([
    tile("left", 0, 0, 1, 1),
    tile("touching", 8, 0, 1, 1),
  ]);
  document.designerNote.aiGeneration = {};

  assert.equal(
    validateLevel(document).some(({ code }) => code === "same-layer-overlap"),
    false,
  );
});

test("AI validation rejects odd type counts inside individual layers", () => {
  const document = makeDocument([
    tile("layer-1-a", 0, 0, 1, 1),
    tile("layer-2-a", 0, 16, 2, 1),
    tile("layer-2-b", 16, 16, 2, 1),
    tile("layer-2-c", 32, 16, 2, 1),
  ]);
  document.designerNote.aiGeneration = {};

  const oddLayerIssue = validateLevel(document)
    .find(({ code }) => code === "odd-layer-type");

  assert.equal(oddLayerIssue?.severity, "error");
  assert.deepEqual(
    new Set(oddLayerIssue.tileUids),
    new Set(["layer-1-a", "layer-2-a", "layer-2-b", "layer-2-c"]),
  );
});

test("AI publish validation reruns the solver and blocks an unsolvable edit", () => {
  assert.equal(typeof levelValidator.validateLevelForPublish, "function");
  const document = makeDocument([
    tile("edge-a", 0, 0, 1, 1),
    tile("blocked-a", 8, 0, 1, 2),
    tile("blocked-b", 16, 0, 1, 1),
    tile("edge-b", 24, 0, 1, 2),
  ]);
  document.designerNote.aiGeneration = {};

  assert.deepEqual(
    validateLevel(document).filter(({ severity }) => severity === "error"),
    [],
  );
  assert.equal(solveLevel(document).solvable, false);

  const issues = levelValidator.validateLevelForPublish(document);
  assert.equal(
    issues.some(({ severity, code }) => severity === "error" && code === "unsolvable-ai-level"),
    true,
  );
});

test("legacy levels remain loadable when they contain historical overlap", () => {
  const document = makeDocument([
    tile("left", 0, 0, 1, 1),
    tile("overlapping", 7, 0, 1, 1),
  ]);

  assert.equal(
    validateLevel(document).find(({ code }) => code === "same-layer-overlap")?.severity,
    "warning",
  );
  assert.equal(
    validateLevel(document, { rejectSameLayerOverlap: true })
      .some(({ code }) => code === "same-layer-overlap"),
    true,
  );
});

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

test("difficulty score uses the Feishu five-dimension weights and a shared rating scale", () => {
  assert.deepEqual(DIFFICULTY_DIMENSION_WEIGHTS, {
    structure: 0.2,
    information: 0.15,
    choice: 0.2,
    route: 0.35,
    endurance: 0.1,
  });
  assert.deepEqual(rateDifficultyScore(39), { key: "relaxed", label: "教学 / 轻松" });
  assert.deepEqual(rateDifficultyScore(60), { key: "hard-intro", label: "困难入门" });
  assert.deepEqual(rateDifficultyScore(80), { key: "extreme", label: "极难挑战" });

  const result = scoreLevelDifficulty(reference);
  const expected = Math.round(
    result.dimensions.structure * 0.2
    + result.dimensions.information * 0.15
    + result.dimensions.choice * 0.2
    + result.dimensions.route * 0.35
    + result.dimensions.endurance * 0.1,
  );
  assert.equal(result.score, expected);
  assert.equal(Object.values(result.dimensions).every(Number.isFinite), true);
  assert.equal(Object.values(result.dimensions).every((value) => value >= 0 && value <= 100), true);
  assert.equal(result.valid, true);
  assert.equal(result.releaseGate, "pass");
  assert.equal(result.reasons.length >= 1 && result.reasons.length <= 3, true);
});

test("unsolvable is an invalid release gate instead of a 100 difficulty score", () => {
  const blocked = makeDocument([
    tile("left-a", 0, 0, 1, 2),
    tile("blocked-a", 8, 0, 1, 1),
    tile("right-a", 16, 0, 1, 3),
    tile("left-b", 0, 24, 1, 4),
    tile("blocked-b", 8, 24, 1, 1),
    tile("right-b", 16, 24, 1, 5),
  ]);

  const result = scoreLevelDifficulty(blocked);

  assert.equal(result.valid, false);
  assert.equal(result.releaseGate, "blocked");
  assert.equal(result.solver.solvable, false);
  assert.equal(result.score < 100, true);
  assert.match(result.gateReason, /不可解/);
});

test("difficulty profiles expose exact defaults and concise recommendations", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(DIFFICULTY_PROFILES).map(([key, value]) => [key, {
      defaultTileCount: value.defaultTileCount,
      defaultLayerCount: value.defaultLayerCount,
      defaultTargetScore: value.defaultTargetScore,
      suggestedTiles: value.suggestedTiles,
      suggestedLayers: value.suggestedLayers,
    }])),
    {
      easy: {
        defaultTileCount: 180,
        defaultLayerCount: 12,
        defaultTargetScore: 40,
        suggestedTiles: [160, 200],
        suggestedLayers: [10, 14],
      },
      normal: {
        defaultTileCount: 200,
        defaultLayerCount: 15,
        defaultTargetScore: 60,
        suggestedTiles: [190, 230],
        suggestedLayers: [14, 20],
      },
      hard: {
        defaultTileCount: 240,
        defaultLayerCount: 32,
        defaultTargetScore: 80,
        suggestedTiles: [220, 280],
        suggestedLayers: [28, 36],
      },
    },
  );
});

test("average blocker quality limits stay fixed at 4 through 15 layers and 6 beyond", () => {
  assert.equal(maxAverageBlockersForLayers(1), 4);
  assert.equal(maxAverageBlockersForLayers(15), 4);
  assert.equal(maxAverageBlockersForLayers(16), 6);
  assert.equal(maxAverageBlockersForLayers(32), 6);
  assert.equal(maxAverageBlockersForLayers(40), 6);
});

test("generator honors exact normalized size, layers and target difficulty", () => {
  const generated = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    tileCount: 201,
    layerCount: 15,
    targetScore: 60,
    seed: 73125,
    maxAttempts: 4,
  });
  const stats = extractLevelStatistics(generated.document);

  assertFixedSevenByEight(generated.document);

  assert.equal(stats.tileCount, 202);
  assert.equal(stats.layerCount, 15);
  assert.equal(stats.effectiveLayerCount, 15);
  assert.equal(generated.target.tileCount, 202);
  assert.equal(generated.target.layerCount, 15);
  assert.equal(generated.target.score, 60);
  assert.equal(generated.report.difficulty.valid, true);
  assert.equal(generated.report.difficulty.releaseGate, "pass");
  assert.equal(Number.isFinite(generated.report.difficulty.score), true);
  assert.equal(generated.document.designerNote.aiGeneration.difficulty.targetScore, 60);
  assert.deepEqual(
    generated.document.designerNote.aiGeneration.stagePlan.map(({ key }) => key),
    ["surface", "shelter", "middle", "crisis", "release"],
  );
  assert.equal(
    generated.document.designerNote.aiGeneration.stagePlan
      .reduce((total, stage) => total + stage.tileCount, 0),
    202,
  );
  assert.equal(
    generated.document.designerNote.aiGeneration.stagePlan
      .reduce((total, stage) => total + stage.layerCount, 0),
    15,
  );
  const stages = generated.document.designerNote.aiGeneration.stagePlan;
  assert.equal(stages.find(({ key }) => key === "release").pressureTarget
    < stages.find(({ key }) => key === "crisis").pressureTarget, true);
  assert.equal(Math.abs(generated.report.difficulty.score - 60) <= 5, true);
});

test("200 tiles, 15 layers and score 60 stay solvable on the fixed board", () => {
  const generated = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
    seed: 20260721,
  });
  const stats = extractLevelStatistics(generated.document);

  assertFixedSevenByEight(generated.document);
  assert.equal(stats.tileCount, 200);
  assert.equal(stats.layerCount, 15);
  assert.equal(generated.report.solvable, true);
  assert.equal(generated.report.steps, 100);
  assert.equal(stats.maxExactStackDepth <= 2, true);
  assert.equal(stats.averageBlockers <= 4, true);
  assert.equal(Math.abs(generated.report.difficulty.score - 60) <= 5, true);
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

      assertFixedSevenByEight(generated.document);
      assert.deepEqual(errors, []);
      assert.deepEqual(sameLayerOverlapPairs(generated.document.tiles), []);
      assert.equal(generated.report.solvable, true);
      assert.equal(generated.report.steps, stats.tileCount / 2);
      assert.equal(generated.document.tiles.length % 2, 0);

      const globalTypes = new Map();
      const layerTypes = new Map();
      for (const tileValue of generated.document.tiles) {
        globalTypes.set(
          tileValue.type,
          (globalTypes.get(tileValue.type) ?? 0) + 1,
        );
        const layerType = `${tileValue.layer}|${tileValue.type}`;
        layerTypes.set(layerType, (layerTypes.get(layerType) ?? 0) + 1);
      }
      assert.equal(
        [...globalTypes.values()].every((count) => count % 2 === 0),
        true,
      );
      assert.equal(
        [...layerTypes.values()].every((count) => count % 2 === 0),
        true,
      );
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
        stats.averageBlockers <= (stats.layerCount > 15
          ? 6
          : 4),
        true,
      );
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
