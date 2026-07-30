import assert from "node:assert/strict";
import test from "node:test";

import { DIFFICULTY_PROFILES } from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import { extractLevelStatistics } from "../projects/paws-level-editor/core/level-statistics.mjs";
import { buildStageBlueprint } from "../projects/paws-level-editor/core/stage-blueprint.mjs";
import {
  buildStageGrammarGeometry,
  measureStageGeometry,
} from "../projects/paws-level-editor/core/stage-grammar-generator.mjs";

const TILE_SIZE = 8;
const TRACK_CENTERS = [
  [8, 8],
  [40, 8],
  [8, 48],
  [40, 48],
];

function sameLayerOverlapPairs(tiles) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
      const left = tiles[leftIndex];
      const right = tiles[rightIndex];
      if (
        left.layer === right.layer
        && left.x < right.x + TILE_SIZE
        && left.x + TILE_SIZE > right.x
        && left.y < right.y + TILE_SIZE
        && left.y + TILE_SIZE > right.y
      ) {
        pairs.push([left.uid, right.uid]);
      }
    }
  }
  return pairs;
}

function referenceFamily(fillTrackCount = 2) {
  return {
    familyIndex: 0,
    familyKey: `family-track-${fillTrackCount}`,
    topologyHash: `family-track-${fillTrackCount}`,
    sourceFileName: `reference-track-${fillTrackCount}.json`,
    tileCount: 200,
    layerCount: 15,
    layerRoles: Array.from({ length: 15 }, (_, index) => ({
      layer: index + 1,
      tileCount: 13 + Number(index % 3 === 0),
      componentCount: 3,
      componentSizes: [5, 5, 4],
    })),
    towerChains: [
      { depth: 15, centroid: { x: 8, y: 8 }, layerStart: 1, layerEnd: 15 },
      { depth: 10, centroid: { x: 40, y: 8 }, layerStart: 1, layerEnd: 10 },
      { depth: 5, centroid: { x: 8, y: 48 }, layerStart: 1, layerEnd: 5 },
      { depth: 4, centroid: { x: 40, y: 48 }, layerStart: 1, layerEnd: 4 },
    ],
    platformMotifs: [],
    releaseMotifs: [],
    fillTracks: TRACK_CENTERS
      .slice(0, fillTrackCount)
      .map(([x, y], trackIndex) => ({
        lowerDepth: 4,
        depth: 5,
        explicitTop: true,
        layerStart: 1,
        layerEnd: 5,
        lowerAnchors: Array.from({ length: 4 }, (_, index) => ({
          x: x + (trackIndex % 2 ? -index : index),
          y,
          layer: index + 1,
        })),
        topAnchor: {
          x: x + (trackIndex % 2 ? -4 : 4),
          y,
          layer: 5,
        },
      })),
  };
}

function geometryOptions({
  fillTrackCount = 2,
  seed = 20260730,
} = {}) {
  const family = referenceFamily(fillTrackCount);
  const structureCorpus = {
    sampleCount: 1,
    families: [family],
    distributions: {},
    platformMotifs: [],
    releaseMotifs: [],
    towerChains: family.towerChains,
  };
  const blueprint = buildStageBlueprint({
    structureCorpus,
    difficulty: "normal",
    difficultyProfile: DIFFICULTY_PROFILES.normal,
    layout: "balanced",
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
    seed,
  });
  return { blueprint, structureCorpus, seed };
}

test("default geometry is tower-shaped instead of a dense lattice", () => {
  const result = buildStageGrammarGeometry(geometryOptions());

  assert.equal(result.tiles.length, 200);
  assert.equal(new Set(result.tiles.map(({ layer }) => layer)).size, 15);
  assert.equal(Math.max(...result.layerTileCounts) <= 22, true);
  assert.deepEqual(result.layerTileCounts, result.blueprintLayerTileCounts);
  assert.deepEqual(sameLayerOverlapPairs(result.tiles), []);
  assert.equal(result.metrics.multiComponentLayerRatio >= 0.65, true);
  assert.equal(result.metrics.maximumPlatformSize <= 10, true);
  assert.equal(result.metrics.threeLayerGiantRun, false);
  assert.equal(result.metrics.towerEntranceCount >= 4, true);
  assert.equal(result.metrics.towerRoleCounts.high >= 1, true);
  assert.equal(result.metrics.towerRoleCounts.medium >= 1, true);
  assert.equal(result.metrics.towerRoleCounts.small >= 2, true);
  assert.equal(result.metrics.releaseDependencyDrop > 0, true);
  assert.equal(result.motifUses.length > 0, true);
  assert.equal(
    result.repairLog.every(({ action }) => !/lattice|整盘|扫格/i.test(action)),
    true,
  );
  assert.match(result.topologyHash, /^topology-[0-9a-f]{8}$/);
});

test("fill tracks preserve Unity shortcut 3 semantics", () => {
  for (const trackCount of [0, 2, 4]) {
    const result = buildStageGrammarGeometry(
      geometryOptions({ fillTrackCount: trackCount }),
    );
    assert.equal(result.fillTracks.length, trackCount);
    assert.equal(
      result.tiles.filter(({ presetColorType }) => presetColorType === 3).length,
      result.fillTracks.reduce((sum, track) => sum + track.lowerDepth, 0),
    );
    assert.equal(
      result.tiles.filter(({ moldType }) => moldType === 2).length,
      trackCount,
    );
    assert.equal(result.tiles.every(({ type }) => type === -1), true);
    assert.equal(
      result.tiles
        .filter(({ presetColorType }) => presetColorType === 3)
        .every(({ moldType }) => moldType === 1),
      true,
    );
  }
});

test("geometry is deterministic and its topology varies by seed", () => {
  const first = buildStageGrammarGeometry(geometryOptions({ seed: 11 }));
  const repeated = buildStageGrammarGeometry(geometryOptions({ seed: 11 }));
  const changed = buildStageGrammarGeometry(geometryOptions({ seed: 12 }));

  assert.deepEqual(first, repeated);
  assert.notEqual(first.topologyHash, changed.topologyHash);
});

test("deep two-track references keep easy crisis layers split into local islands", () => {
  const family = referenceFamily(2);
  family.layerCount = 20;
  family.fillTracks = family.fillTracks.map((track) => ({
    ...track,
    lowerDepth: 19,
    depth: 20,
    layerEnd: 20,
    lowerAnchors: Array.from({ length: 19 }, (_, index) => ({
      ...track.lowerAnchors[0],
      layer: index + 1,
    })),
    topAnchor: {
      ...track.topAnchor,
      layer: 20,
    },
  }));
  const structureCorpus = {
    sampleCount: 1,
    families: [family],
    distributions: {},
  };
  const blueprint = buildStageBlueprint({
    structureCorpus,
    difficulty: "easy",
    difficultyProfile: DIFFICULTY_PROFILES.easy,
    layout: "balanced",
    tileCount: 180,
    layerCount: 12,
    targetScore: 40,
    seed: 73125,
  });

  const result = buildStageGrammarGeometry({
    blueprint,
    structureCorpus,
    seed: 73125,
  });

  assert.equal(result.tiles.length, 180);
  assert.equal(result.metrics.maximumPlatformSize <= 10, true);
  assert.equal(result.metrics.multiComponentLayerRatio >= 0.65, true);
});

test("shared stage metrics are exposed through level statistics", () => {
  const result = buildStageGrammarGeometry(geometryOptions());
  const measured = measureStageGeometry({
    tiles: result.tiles,
    stagePlan: result.stagePlan,
    fillTracks: result.fillTracks,
    towerEntrances: result.towerEntrances,
  });
  const statistics = extractLevelStatistics({
    fileName: "generated.json",
    board: { width: 7, height: 8, scale: 1 },
    tiles: result.tiles,
    designerNote: {
      aiGeneration: {
        stagePlan: result.stagePlan,
        blueprint: {
          stagePlan: result.stagePlan,
          towerEntrances: result.towerEntrances,
          fillTrackPlan: { tracks: result.fillTracks },
        },
      },
    },
  });

  assert.deepEqual(measured, result.metrics);
  assert.deepEqual(statistics.stageGeometry, result.metrics);
});
