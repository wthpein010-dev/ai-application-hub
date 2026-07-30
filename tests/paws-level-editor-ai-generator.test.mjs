import assert from "node:assert/strict";
import test from "node:test";

import {
  DIFFICULTY_PROFILES,
  generateAiLevel,
  maxAverageBlockersForLayers,
  maxTowerAverageBlockersForLayers,
  normalizeGenerationTargets,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import { upgradeLegacyAiGeometry } from "../projects/paws-level-editor/core/legacy-ai-geometry-upgrade.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";
import { solveLevel } from "../projects/paws-level-editor/core/level-solver.mjs";
import { createPlaySession } from "../projects/paws-level-editor/core/play-engine.mjs";
import {
  assignSolvableRandomTypes,
} from "../projects/paws-level-editor/core/random-assigner.mjs";
import {
  DIFFICULTY_DIMENSION_WEIGHTS,
  rateDifficultyScore,
  scoreLevelDifficulty,
} from "../projects/paws-level-editor/core/level-difficulty.mjs";
import * as levelValidator from "../projects/paws-level-editor/core/level-validator.mjs";

const { validateLevel, validateLevelForPublish } = levelValidator;

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

function makeLegacyAiDocument(tiles, options = {}) {
  const document = makeDocument(tiles, options);
  document.designerNote.aiGeneration = { algorithmVersion: "paws-local-stat-v6" };
  return document;
}

function typeCounts(tiles) {
  return Object.fromEntries(tiles.reduce((counts, tileValue) => {
    counts.set(tileValue.type, (counts.get(tileValue.type) ?? 0) + 1);
    return counts;
  }, new Map()));
}

test("AI facade returns v11 stage geometry with Unity full-random semantics", () => {
  const generated = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
    seed: 20260730,
    maxAttempts: 1,
  });
  const ai = generated.document.designerNote.aiGeneration;

  assert.equal(ai.algorithmVersion, "paws-local-stat-v11-stage-grammar");
  assert.equal(generated.document.tiles.every(({ type }) => type === -1), true);
  assert.equal(ai.blueprint.stagePlan.length, 5);
  assert.deepEqual(
    ai.blueprint.stagePlan.map(({ key, layerCount, tileCount }) => [
      key,
      layerCount,
      tileCount,
    ]),
    [
      ["surface", 3, 44],
      ["shelter", 2, 30],
      ["middle", 5, 68],
      ["crisis", 3, 40],
      ["release", 2, 18],
    ],
  );
  assert.equal(ai.structure.towerEntranceCount >= 4, true);
  assert.equal(ai.structure.maximumPlatformSize <= 10, true);
  assert.equal(ai.structure.multiComponentLayerRatio >= 0.65, true);
  assert.equal(ai.structure.threeLayerGiantRun, false);
  assert.equal(ai.structure.releaseDependencyDrop > 0, true);
  assert.equal(solveLevel(generated.document).solvable, true);
});

test("move-order fallback is bounded, paired, and solvable", () => {
  const randomTiles = [
    tile("a", 0, 0, 1, -1),
    tile("b", 8, 0, 1, -1),
    tile("c", 24, 0, 1, -1),
    tile("d", 32, 0, 1, -1),
  ];
  const assigned = assignSolvableRandomTypes(randomTiles, {
    seed: 7,
    fullTypeMin: 1,
    fullTypeMax: 15,
    solvableMoves: [["a", "b"], ["c", "d"]],
    isSolvable: (candidate) => solveLevel({ tiles: candidate }).solvable,
  });

  assert.equal(
    Object.values(typeCounts(assigned)).every((count) => count % 2 === 0),
    true,
  );
  assert.equal(solveLevel({ tiles: assigned }).solvable, true);

  let gateCalls = 0;
  const fifthStrategy = assignSolvableRandomTypes(randomTiles, {
    seed: 7,
    fullTypeMin: 1,
    fullTypeMax: 15,
    solvableMoves: [["a", "b"], ["c", "d"]],
    isSolvable: () => {
      gateCalls += 1;
      return gateCalls === 5;
    },
  });
  assert.equal(gateCalls, 5);
  assert.equal(
    Object.values(typeCounts(fifthStrategy)).every((count) => count % 2 === 0),
    true,
  );
});

test("legacy AI geometry repair is deterministic and treats edge touching as safe", () => {
  const document = makeLegacyAiDocument([
    tile("pair-a-left", 0, 0, 1, 1),
    tile("pair-b-left", 7, 0, 1, 2),
    tile("pair-b-right", 16, 0, 1, 2),
    tile("pair-a-right", 24, 0, 1, 1),
  ]);

  const first = upgradeLegacyAiGeometry(document);
  const repeated = upgradeLegacyAiGeometry(document);

  assert.equal(first.status, "upgraded");
  assert.deepEqual(first, repeated);
  assert.equal(first.document.tiles.find(({ uid }) => uid === "pair-b-left").x, 8);
  assert.deepEqual(sameLayerOverlapPairs(first.document.tiles), []);
  assert.deepEqual(validateLevelForPublish(first.document).filter(({ severity }) => severity === "error"), []);
  assert.equal(solveLevel(first.document).steps, first.document.tiles.length / 2);
  assert.deepEqual(first.document.designerNote.aiGeneration.geometryUpgrade, {
    rule: "same-layer-zero-overlap-v1",
    movedTileUids: ["pair-b-left"],
    sameLayerOverlapPairs: 0,
  });
});

test("legacy AI geometry repair is idempotent after a successful upgrade", () => {
  const document = makeLegacyAiDocument([
    tile("pair-a-left", 0, 0, 1, 1),
    tile("pair-b-left", 7, 0, 1, 2),
    tile("pair-b-right", 16, 0, 1, 2),
    tile("pair-a-right", 24, 0, 1, 1),
  ]);
  const upgraded = upgradeLegacyAiGeometry(document);
  const metadata = structuredClone(upgraded.document.designerNote.aiGeneration.geometryUpgrade);

  const repeated = upgradeLegacyAiGeometry(upgraded.document);

  assert.equal(upgraded.status, "upgraded");
  assert.equal(repeated.status, "unchanged");
  assert.equal(repeated.document, upgraded.document);
  assert.deepEqual(repeated.document, upgraded.document);
  assert.deepEqual(repeated.document.designerNote.aiGeneration.geometryUpgrade, metadata);
  assert.deepEqual(repeated.movedTileUids, []);
});

test("legacy AI geometry repair preserves tile identity, fields, and Unity pairing parity", () => {
  const protectedTile = {
    ...tile("fixed-left", 0, 0, 1, 7),
    moldType: 23,
    metaType: 24,
    metaData: 25,
    presetColorType: 26,
    goldBlock: { reward: "fish" },
    customPayload: { preserved: true },
  };
  const document = makeLegacyAiDocument([
    protectedTile,
    tile("random-zero-left", 7, 0, 1, 0),
    tile("random-full-left", 16, 0, 1, -1),
    tile("random-full-right", 24, 0, 1, -1),
    tile("random-zero-right", 32, 0, 1, 0),
    { ...tile("fixed-right", 40, 0, 1, 7), customPayload: { preserved: "right" } },
  ]);
  const before = structuredClone(document);

  const result = upgradeLegacyAiGeometry(document);

  assert.equal(result.status, "upgraded");
  assert.deepEqual(document, before);
  assert.deepEqual(
    result.document.tiles.map(({ uid, type, layer, moldType, metaType, metaData, presetColorType, goldBlock, customPayload }) => ({
      uid, type, layer, moldType, metaType, metaData, presetColorType, goldBlock, customPayload,
    })),
    before.tiles.map(({ uid, type, layer, moldType, metaType, metaData, presetColorType, goldBlock, customPayload }) => ({
      uid, type, layer, moldType, metaType, metaData, presetColorType, goldBlock, customPayload,
    })),
  );
  assert.deepEqual(typeCounts(result.document.tiles), typeCounts(before.tiles));
  assert.equal(Object.values(typeCounts(result.document.tiles)).every((count) => count % 2 === 0), true);
  assert.deepEqual(validateLevelForPublish(result.document).filter(({ severity }) => severity === "error"), []);
  assert.equal(solveLevel(result.document).steps, result.document.tiles.length / 2);
});

test("legacy AI geometry repair refuses an unsolvable candidate without returning a partial document", () => {
  const document = makeLegacyAiDocument([
    tile("edge-a", 0, 0, 1, 1),
    tile("blocked-a", 7, 0, 1, 2),
    tile("blocked-b", 16, 0, 1, 1),
    tile("edge-b", 24, 0, 1, 2),
  ]);
  const before = structuredClone(document);

  const result = upgradeLegacyAiGeometry(document);

  assert.equal(result.status, "failed");
  assert.equal(result.document, document);
  assert.deepEqual(document, before);
  assert.equal(result.movedTileUids.length, 0);
  assert.equal(result.reason, "publish-validation-failed");
});

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

test("AI validation permits odd random counts per layer when the global pool is even", () => {
  const document = makeDocument([
    tile("layer-1-a", 0, 0, 1, -1),
    tile("layer-2-a", 0, 16, 2, -1),
    tile("layer-2-b", 16, 16, 2, -1),
    tile("layer-2-c", 32, 16, 2, -1),
  ]);
  document.designerNote.aiGeneration = {};

  assert.equal(
    validateLevel(document).some(({ code }) => code === "odd-layer-type"),
    false,
  );
  assert.deepEqual(validateLevel(document).filter(({ severity }) => severity === "error"), []);
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

test("reference statistics retain layer silhouettes, random ratios and blind-box stacks", () => {
  const template = makeDocument([
    { ...tile("blind-left-1", 0, 52, 1, -1), presetColorType: 3 },
    { ...tile("blind-right-1", 31, 52, 1, -1), presetColorType: 3 },
    { ...tile("tower-left-1", 8, 8, 1, -1) },
    { ...tile("blind-left-2", 1, 52, 2, -1), presetColorType: 3 },
    { ...tile("blind-right-2", 32, 52, 2, -1), presetColorType: 3 },
    { ...tile("tower-left-2", 12, 12, 2, -1) },
    { ...tile("blind-left-top", 2, 52, 3, -1), moldType: 2 },
    { ...tile("blind-right-top", 33, 52, 3, -1), moldType: 2 },
  ], { width: 7, height: 8 });
  template.fileName = "level_0010_r2_第二关模板12.json";
  const stats = extractLevelStatistics(template);
  const learned = mergeLevelStatistics([stats]);

  assert.deepEqual(stats.layerTileCounts, [3, 3, 2]);
  assert.equal(stats.layerTemplates.length, 3);
  assert.equal(stats.layerTemplates[0].components.length >= 2, true);
  assert.equal(stats.typeRatios.fullRandom, 1);
  assert.equal(stats.blindStacks.length, 2);
  assert.equal(stats.blindStacks.every(({ depth }) => depth === 3), true);
  assert.equal(learned.layerTemplates.length, 3);
  assert.equal(learned.referenceProfiles.length, 1);
  assert.equal(
    learned.referenceProfiles[0].sourceFileName,
    "level_0010_r2_第二关模板12.json",
  );
  assert.equal(
    learned.referenceProfiles[0].layoutMetrics.boundaryRatio,
    stats.boundaryRatio,
  );
  assert.equal(learned.typeRatios.fullRandom, 1);
  assert.equal(learned.blindStacks.length, 2);
});

test("reference statistics distinguish zero and four fill tracks", () => {
  const noFill = makeDocument([
    tile("ordinary-a", 0, 0, 1, -1),
    tile("ordinary-b", 16, 0, 1, -1),
  ]);
  const fourFill = makeDocument([
    ...[0, 12, 36, 48].flatMap((x, track) => [
      {
        ...tile(`fill-${track}-1`, x, 0, 1, -1),
        presetColorType: 3,
      },
      {
        ...tile(`fill-${track}-2`, x + (track < 2 ? 1 : -1), 0, 2, -1),
        presetColorType: 3,
      },
      {
        ...tile(`fill-${track}-top`, x + (track < 2 ? 2 : -2), 0, 3, -1),
        moldType: 2,
      },
    ]),
  ], { width: 7, height: 8 });

  const emptyStats = extractLevelStatistics(noFill);
  const fourStats = extractLevelStatistics(fourFill);
  const learned = mergeLevelStatistics([fourStats]);

  assert.deepEqual(emptyStats.fillTracks, []);
  assert.equal(fourStats.fillTracks.length, 4);
  assert.equal(
    fourStats.fillTracks.every((track) =>
      track.lowerDepth === 2
      && track.depth === 3
      && track.explicitTop === true),
    true,
  );
  assert.deepEqual(
    fourStats.layerSequence.map(({ layer, tileCount }) => ({ layer, tileCount })),
    [
      { layer: 1, tileCount: 4 },
      { layer: 2, tileCount: 4 },
      { layer: 3, tileCount: 4 },
    ],
  );
  assert.deepEqual(fourStats.blindStacks, fourStats.fillTracks);
  assert.equal(learned.referenceProfiles[0].fillTracks.length, 4);
  assert.deepEqual(
    learned.referenceProfiles[0].layerSequence.map(({ tileCount }) => tileCount),
    [4, 4, 4],
  );
  assert.deepEqual(learned.blindStacks, learned.fillTracks);
});

test("legacy fill tracks infer a top layer without mutating the reference", () => {
  const legacyFill = makeDocument([
    {
      ...tile("legacy-1", 0, 52, 1, -1),
      presetColorType: 3,
    },
    {
      ...tile("legacy-2", 1, 52, 2, -1),
      presetColorType: 3,
    },
  ], { width: 7, height: 8 });

  const stats = extractLevelStatistics(legacyFill);

  assert.equal(stats.fillTracks.length, 1);
  assert.equal(stats.fillTracks[0].lowerDepth, 2);
  assert.equal(stats.fillTracks[0].depth, 3);
  assert.equal(stats.fillTracks[0].explicitTop, false);
  assert.equal(stats.fillTracks[0].layerStart, 1);
  assert.equal(stats.fillTracks[0].layerEnd, 3);
  assert.deepEqual(
    legacyFill.tiles.map(({ moldType }) => moldType),
    [1, 1],
  );
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
  assert.equal(maxTowerAverageBlockersForLayers(15), 6);
  assert.equal(maxTowerAverageBlockersForLayers(16), 8);
});

test("five-stage generation rejects layer counts below the structural capacity", () => {
  for (const layerCount of [1, 2, 3, 4]) {
    assert.throws(
      () => normalizeGenerationTargets({
        profile: DIFFICULTY_PROFILES.normal,
        tileCount: 200,
        layerCount,
        targetScore: 60,
      }),
      /有效层数必须在 5–40 之间/,
    );
  }

  assert.throws(
    () => generateAiLevel({
      references: [reference],
      difficulty: "normal",
      layout: "balanced",
      tileCount: 200,
      layerCount: 5,
      targetScore: 60,
      seed: 73125,
      maxAttempts: 1,
    }),
    /200 张砖块至少需要 9 个有效层；当前 5 层最多支持 104 张/,
  );
  assert.equal(
    normalizeGenerationTargets({
      profile: DIFFICULTY_PROFILES.normal,
      tileCount: 200,
      layerCount: 14,
      targetScore: 60,
    }).layerCount,
    14,
  );
  const boundary = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    tileCount: 200,
    layerCount: 14,
    targetScore: 60,
    seed: 73125,
    maxAttempts: 12,
  });
  assert.equal(boundary.report.solvable, true);
  assert.equal(extractLevelStatistics(boundary.document).layerCount, 14);
});

test("100 tiles can use a valid six-layer five-stage tower plan", () => {
  for (const layout of ["balanced", "progressive", "open"]) {
    const generated = generateAiLevel({
      references: [reference],
      difficulty: "normal",
      layout,
      tileCount: 100,
      layerCount: 6,
      targetScore: 60,
      seed: 73125,
      maxAttempts: 12,
    });

    assert.equal(generated.report.solvable, true);
    assert.equal(generated.document.tiles.length, 100);
    assert.equal(extractLevelStatistics(generated.document).layerCount, 6);
  }
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

test("generated geometry records continuous template mapping and safe capacities", () => {
  const generated = generateAiLevel({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
    seed: 20260728,
    maxAttempts: 12,
  });
  const stats = extractLevelStatistics(generated.document);
  const ai = generated.document.designerNote.aiGeneration;
  const structure = ai.structure;
  const learning = ai.templateLearning;

  assert.equal(ai.blueprint.layerPlans.length, 15);
  assert.equal(
    ai.blueprint.layerPlans.every(({ layer }, index) =>
      index === 0 || layer > ai.blueprint.layerPlans[index - 1].layer),
    true,
  );
  assert.equal(learning.layerTileCounts.reduce((sum, count) => sum + count, 0), 200);
  assert.equal(
    learning.layerTileCounts.every((count) =>
      count <= ai.blueprint.maxLayerTiles),
    true,
  );
  assert.equal(learning.fillTrackCount, learning.fillTracks.length);
  assert.equal(learning.fullRandomRatio, 1);
  assert.equal(learning.sourceFileNames.length, 1);
  assert.match(learning.topologyHash, /^topology-[0-9a-f]{8}$/);
  assert.equal(structure.maximumPlatformSize <= 10, true);
  assert.equal(structure.multiComponentLayerRatio >= 0.65, true);
  assert.equal(structure.towerEntranceCount >= 4, true);
  assert.equal(structure.releaseDependencyDrop > 0, true);
  assert.deepEqual(structure.stagePressure, stats.stagePressure);
});

test("200/15 generation rejects a noncanonical single blind track", () => {
  const templateTiles = Array.from({ length: 17 }, (_, layerIndex) => {
    const layer = layerIndex + 1;
    const count = [13, 13, 19, 13, 13, 27, 15, 24, 13, 22, 7, 7, 4, 2, 2, 2, 2][layerIndex];
    const anchors = [];
    for (let index = 0; index < count; index += 1) {
      const column = index % 7;
      const row = Math.floor(index / 7);
      anchors.push({
        ...tile(`template-${layer}-${index}`, column * 8, row * 12, layer, -1),
      });
    }
    if (layer <= 16) {
      anchors[0] = {
        ...anchors[0],
        x: layer - 1,
        y: 52,
        presetColorType: 3,
      };
    } else {
      anchors[0] = {
        ...anchors[0],
        x: 16,
        y: 52,
        moldType: 2,
      };
    }
    return anchors;
  }).flat();
  const generated = generateAiLevel({
    references: [makeDocument(templateTiles, { width: 7, height: 8 })],
    difficulty: "normal",
    layout: "balanced",
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
    seed: 20260729,
    maxAttempts: 12,
  });
  const stats = extractLevelStatistics(generated.document);
  const layerCounts = Object.values(stats.layerHistogram);
  const fullRandomCount = generated.document.tiles
    .filter(({ type }) => type === -1).length;
  const blindBases = generated.document.tiles
    .filter(({ moldType, presetColorType }) =>
      moldType === 1 && presetColorType === 3);
  const blindTops = generated.document.tiles
    .filter(({ moldType, presetColorType }) =>
      moldType === 2 && presetColorType === 1);

  assert.equal(
    generated.document.designerNote.aiGeneration.algorithmVersion,
    "paws-local-stat-v11-stage-grammar",
  );
  const ai = generated.document.designerNote.aiGeneration;
  const learning = generated.document.designerNote.aiGeneration.templateLearning;
  assert.equal(fullRandomCount, generated.document.tiles.length);
  assert.equal(Math.max(...layerCounts) <= ai.blueprint.maxLayerTiles, true);
  assert.equal(ai.blueprint.layerPlans.length, 15);
  assert.equal(learning.fillTrackCount, 0);
  assert.equal(blindBases.length, 0);
  assert.equal(blindTops.length, learning.fillTrackCount);
  assert.equal(ai.structure.maximumPlatformSize <= 10, true);
  assert.equal(ai.structure.multiComponentLayerRatio >= 0.65, true);
  assert.deepEqual(sameLayerOverlapPairs(generated.document.tiles), []);
  assert.equal(generated.report.solvable, true);
});

test("reference learning retains reusable tower and platform statistics", () => {
  const learned = mergeLevelStatistics([
    extractLevelStatistics(reference),
    extractLevelStatistics(makeDocument(reference.tiles, { width: 10, height: 12 })),
  ]);

  assert.equal(learned.towerCenters.length >= 2, true);
  assert.equal(
    learned.towerCenters.every(({ x, y }) =>
      x >= 0 && x <= 1 && y >= 0 && y <= 1),
    true,
  );
  assert.equal(Number.isFinite(learned.boundaryRatio), true);
  assert.equal(Number.isFinite(learned.initialPairDistance), true);
  assert.equal(Number.isFinite(learned.largestFlatPlatformSize), true);
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
  const ai = generated.document.designerNote.aiGeneration;
  const learning = ai.templateLearning;
  assert.equal(
    ai.blueprint.layerPlans.length === stats.layerCount
      && learning.fillTrackCount === learning.fillTracks.length,
    true,
  );
  assert.equal(
    learning.layerTileCounts.every((count) =>
      count <= ai.blueprint.maxLayerTiles),
    true,
  );
  assert.equal(Math.abs(generated.report.difficulty.score - 60) <= 5, true);
});

test("v11 has zero single-attempt generation failures across 50 easy and normal seeds", () => {
  const corpus = Array.from({ length: 16 }, (_, profileIndex) =>
    makeDocument(reference.tiles.map((sourceTile) => ({
      ...sourceTile,
      x: (sourceTile.x + profileIndex * 3) % 49,
      y: (sourceTile.y + profileIndex * 5) % 57,
    })), {
      width: 7,
      height: 8,
      name: `第二关模板${profileIndex + 1}`,
    }));

  for (const difficulty of ["easy", "normal"]) {
    const profile = DIFFICULTY_PROFILES[difficulty];
    for (let seed = 1; seed <= 50; seed += 1) {
      const generated = generateAiLevel({
        references: corpus,
        difficulty,
        layout: "balanced",
        tileCount: profile.defaultTileCount,
        layerCount: profile.defaultLayerCount,
        targetScore: profile.defaultTargetScore,
        seed,
        maxAttempts: 1,
      });
      const ai = generated.document.designerNote.aiGeneration;
      const learning = generated.document.designerNote.aiGeneration.templateLearning;
      assert.equal(generated.document.tiles.length, profile.defaultTileCount);
      assert.equal(ai.blueprint.layerPlans.length, profile.defaultLayerCount);
      assert.equal(learning.fillTrackCount, learning.fillTracks.length);
      assert.equal(generated.document.tiles.every(({ type }) => type === -1), true);
      assert.deepEqual(sameLayerOverlapPairs(generated.document.tiles), []);
      assert.equal(generated.report.solvable, true);
    }
  }
});

test("AI random artwork remains paired and solvable across play seeds", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const profile = DIFFICULTY_PROFILES[difficulty];
    const generated = generateAiLevel({
      references: [reference],
      difficulty,
      layout: "balanced",
      tileCount: profile.defaultTileCount,
      layerCount: profile.defaultLayerCount,
      targetScore: profile.defaultTargetScore,
      seed: 20260729,
    });

    for (let seed = 1; seed <= 20; seed += 1) {
      const snapshot = createPlaySession(generated.document, seed).getSnapshot();
      const counts = Map.groupBy(snapshot.tiles, ({ type }) => type);
      assert.equal(
        [...counts.values()].every((records) => records.length % 2 === 0),
        true,
      );
      const report = solveLevel({ tiles: snapshot.tiles });
      assert.equal(report.solvable, true);
      assert.equal(report.steps, profile.defaultTileCount / 2);
    }
  }
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
        [...layerTypes.values()].some((count) => count % 2 !== 0),
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
      const learning = generated.document.designerNote.aiGeneration.templateLearning;
      const blueprint = generated.document.designerNote.aiGeneration.blueprint;
      assert.equal(stats.initialAccessibleTiles >= 2, true);
      assert.equal(
        blueprint.layerPlans.length === stats.layerCount,
        true,
      );
      assert.equal(
        learning.layerTileCounts.every((count) =>
          count <= blueprint.maxLayerTiles),
        true,
      );
      assert.equal(
        generated.document.tiles.filter(({ type }) => type === -1).length
          === generated.document.tiles.length,
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
