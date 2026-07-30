import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateMotifGeometry,
} from "../projects/paws-level-editor/core/template-motif-generator.mjs";
import {
  generateAiLevel,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";

const TILE_SIZE = 8;

function tile(uid, x, y, layer, {
  type = -1,
  moldType = 1,
  presetColorType = 1,
} = {}) {
  return {
    uid,
    x,
    y,
    layer,
    type,
    moldType,
    metaType: 0,
    metaData: 0,
    presetColorType,
  };
}

function makeDocument(tiles, { width = 7, height = 8 } = {}) {
  return {
    original: { id: 2, name: "第二关模板", tiles: [], stacks: [] },
    designerNote: { widthNum: width, heightNum: height },
    fileName: "level_0002_r2_第二关模板.json",
    board: { width, height, scale: 1 },
    gameplay: { gameLevelOrder: 2 },
    tiles,
  };
}

function learn(documents) {
  return mergeLevelStatistics(documents.map(extractLevelStatistics));
}

function gridLayer(count, layer) {
  return Array.from({ length: count }, (_, index) =>
    tile(
      `grid-${layer}-${index}`,
      (index % 7) * TILE_SIZE,
      Math.floor(index / 7) * TILE_SIZE,
      layer,
    ));
}

function makeTrackDocument(trackCount) {
  const tracks = [0, 12, 36, 48].slice(0, trackCount)
    .flatMap((x, track) => {
      const direction = track < 2 ? 1 : -1;
      return [
        tile(`fill-${track}-1`, x, 52, 1, {
          presetColorType: 3,
        }),
        tile(`fill-${track}-2`, x + direction, 52, 2, {
          presetColorType: 3,
        }),
        tile(`fill-${track}-top`, x + direction * 2, 52, 3, {
          moldType: 2,
        }),
      ];
    });
  return makeDocument([
    ...tracks,
    tile("ordinary-1", 0, 0, 1),
    tile("ordinary-2", 8, 0, 2),
    tile("ordinary-3", 16, 0, 3),
    tile("ordinary-4", 24, 0, 4),
  ]);
}

function assertNoSameLayerOverlap(tiles) {
  const layers = Map.groupBy(tiles, ({ layer }) => layer);
  for (const [layer, layerTiles] of layers) {
    for (let left = 0; left < layerTiles.length; left += 1) {
      for (let right = left + 1; right < layerTiles.length; right += 1) {
        const a = layerTiles[left];
        const b = layerTiles[right];
        assert.equal(
          a.x < b.x + TILE_SIZE
            && a.x + TILE_SIZE > b.x
            && a.y < b.y + TILE_SIZE
            && a.y + TILE_SIZE > b.y,
          false,
          `layer ${layer}: ${a.uid} overlaps ${b.uid}`,
        );
      }
    }
  }
}

test("global transform preserves source layer order without per-layer wrapping", () => {
  const source = makeDocument(Array.from({ length: 6 }, (_, index) =>
    tile(`ordered-${index + 1}`, index * 8, 8, index + 1)));
  const result = buildTemplateMotifGeometry({
    learned: learn([source]),
    target: { tileCount: 6, layerCount: 6 },
    layout: "balanced",
    seed: 101,
  });

  assert.deepEqual(result.sourceLayerMap, [1, 2, 3, 4, 5, 6]);
  const xs = result.tiles.map(({ x }) => x);
  assert.equal(
    xs.every((x, index) => index === 0 || x > xs[index - 1])
      || xs.every((x, index) => index === 0 || x < xs[index - 1]),
    true,
  );
});

test("capacity-aware allocation returns exact totals instead of 29/32 failures", () => {
  const rhythm = [9, 14, 27, 11, 24, 8, 19, 13, 25, 7, 18, 6, 12, 5, 9, 3, 2];
  const source = makeDocument(rhythm.flatMap((count, index) =>
    gridLayer(count, index + 1)));
  const result = buildTemplateMotifGeometry({
    learned: learn([source]),
    target: { tileCount: 200, layerCount: 15 },
    layout: "balanced",
    seed: 20260729,
  });

  assert.equal(result.tiles.length, 200);
  assert.equal(result.layerTileCounts.length, 15);
  assert.equal(
    result.layerTileCounts.every((count, index) =>
      count <= result.layerCapacities[index]),
    true,
  );
  assert.equal(result.layerTileCounts.reduce((sum, count) => sum + count, 0), 200);
});

test("selected templates reproduce zero, two and four fill tracks", () => {
  for (const trackCount of [0, 2, 4]) {
    const source = makeTrackDocument(trackCount);
    const result = buildTemplateMotifGeometry({
      learned: learn([source]),
      target: { tileCount: Math.max(20, source.tiles.length), layerCount: 4 },
      layout: "progressive",
      seed: 300 + trackCount,
    });

    assert.equal(result.fillTracks.length, trackCount);
    assert.equal(
      result.tiles.filter(({ presetColorType }) => presetColorType === 3).length,
      trackCount * 2,
    );
    assert.equal(
      result.tiles.filter(({ moldType }) => moldType === 2).length,
      trackCount,
    );
  }
});

test("every generated tile uses full-random type -1", () => {
  const result = buildTemplateMotifGeometry({
    learned: learn([makeTrackDocument(2)]),
    target: { tileCount: 40, layerCount: 6 },
    layout: "open",
    seed: 404,
  });

  assert.equal(result.tiles.every(({ type }) => type === -1), true);
});

test("same-layer geometry never overlaps", () => {
  const source = makeDocument(Array.from({ length: 12 }, (_, layerIndex) =>
    gridLayer(18 + (layerIndex % 3) * 4, layerIndex + 1)).flat());
  const result = buildTemplateMotifGeometry({
    learned: learn([source]),
    target: { tileCount: 200, layerCount: 15 },
    layout: "balanced",
    seed: 505,
  });

  assertNoSameLayerOverlap(result.tiles);
});

test("same seed is deterministic and different seeds vary the global transform", () => {
  const learned = learn([makeDocument(Array.from({ length: 8 }, (_, index) =>
    tile(`seed-${index}`, index * 6, index * 4, index + 1)))]);
  const options = {
    learned,
    target: { tileCount: 24, layerCount: 8 },
    layout: "balanced",
  };
  const first = buildTemplateMotifGeometry({ ...options, seed: 606 });
  const repeat = buildTemplateMotifGeometry({ ...options, seed: 606 });
  const different = buildTemplateMotifGeometry({ ...options, seed: 987654321 });

  assert.deepEqual(repeat, first);
  assert.notDeepEqual(different.tiles, first.tiles);
});

test("AI facade uses v11 stage grammar while legacy v10 motif builder stays isolated", () => {
  const source = makeDocument(Array.from({ length: 17 }, (_, index) =>
    tile(
      `motif-${index + 1}`,
      (index * 13) % 49,
      (index * 17) % 57,
      index + 1,
    )));
  const generated = generateAiLevel({
    references: [source],
    difficulty: "normal",
    layout: "balanced",
    seed: 707,
    tileCount: 100,
    layerCount: 15,
    targetScore: 60,
    maxAttempts: 1,
  });
  const learning = generated.document.designerNote.aiGeneration.templateLearning;

  assert.equal(
    generated.document.designerNote.aiGeneration.algorithmVersion,
    "paws-local-stat-v11-stage-grammar",
  );
  assert.equal(learning.fillTrackCount, 0);
  assert.deepEqual(learning.fillTracks, []);
  assert.equal(
    generated.document.designerNote.aiGeneration.blueprint.layerPlans.length,
    15,
  );
  assert.equal(learning.motifUses.length > 0, true);
  assert.equal(
    learning.repairLog.every(({ action }) => !/lattice/i.test(action)),
    true,
  );
  assert.equal(learning.fullRandomRatio, 1);
  assert.equal(
    generated.document.tiles.every(({ type }) => type === -1),
    true,
  );
  assert.equal(generated.document.tiles.length, 100);
});
