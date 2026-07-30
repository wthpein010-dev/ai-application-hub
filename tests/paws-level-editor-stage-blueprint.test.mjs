import assert from "node:assert/strict";
import test from "node:test";

import { DIFFICULTY_PROFILES } from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import {
  buildStageBlueprint,
  layerTileLimit,
  validateBlueprintCapacity,
} from "../projects/paws-level-editor/core/stage-blueprint.mjs";

function family(sourceFileName, {
  fillTrackCount = 0,
  tileCount = 200,
  layerCount = 15,
  topologyHash = `topology-${sourceFileName}`,
} = {}) {
  return {
    sourceFileName,
    familyKey: topologyHash,
    topologyHash,
    tileCount,
    layerCount,
    layerRoles: Array.from({ length: layerCount }, (_, index) => ({
      layer: index + 1,
      tileCount: Math.max(1, Math.round(tileCount / layerCount)),
      componentCount: 3,
      componentSizes: [5, 5, 4],
    })),
    towerChains: [
      {
        depth: 12,
        centroid: { x: 8, y: 8 },
        layerStart: 1,
        layerEnd: 12,
      },
      {
        depth: 8,
        centroid: { x: 40, y: 12 },
        layerStart: 2,
        layerEnd: 9,
      },
      {
        depth: 4,
        centroid: { x: 12, y: 48 },
        layerStart: 1,
        layerEnd: 4,
      },
      {
        depth: 3,
        centroid: { x: 40, y: 48 },
        layerStart: 1,
        layerEnd: 3,
      },
    ],
    fillTracks: Array.from({ length: fillTrackCount }, (_, index) => ({
      lowerDepth: 3,
      layerStart: 2,
      layerEnd: 5,
      lowerAnchors: [
        { x: index ? 36 : 8, y: 24, layer: 2 },
        { x: index ? 34 : 10, y: 24, layer: 3 },
        { x: index ? 32 : 12, y: 24, layer: 4 },
      ],
      topAnchor: {
        x: index ? 30 : 14,
        y: 24,
        layer: 5,
      },
    })),
  };
}

function structureCorpus(fillTrackCount = 2) {
  const families = [
    family("template-a.json", { fillTrackCount }),
    family("template-b.json", { fillTrackCount: 0, tileCount: 220 }),
    family("template-c.json", { fillTrackCount: 4, layerCount: 18 }),
    family("template-d.json", { fillTrackCount: 2, tileCount: 180 }),
  ].map((value, familyIndex) => ({ ...value, familyIndex }));
  return {
    sampleCount: families.length,
    families,
    distributions: {},
  };
}

function normalOptions(overrides = {}) {
  return {
    structureCorpus: structureCorpus(),
    difficulty: "normal",
    difficultyProfile: DIFFICULTY_PROFILES.normal,
    layout: "balanced",
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
    seed: 20260730,
    ...overrides,
  };
}

test("200/15 compiles the approved five-stage layer and tile budgets", () => {
  const blueprint = buildStageBlueprint(normalOptions());

  assert.deepEqual(
    blueprint.stagePlan.map(({ key, layerCount, tileCount }) => [
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
  assert.deepEqual(
    blueprint.stagePlan.map(({ layerStart, layerEnd }) => [
      layerStart,
      layerEnd,
    ]),
    [[13, 15], [11, 12], [6, 10], [3, 5], [1, 2]],
  );
  assert.equal(
    blueprint.layerTileCounts.reduce((sum, value) => sum + value, 0),
    200,
  );
  assert.equal(blueprint.layerTileCounts.length, 15);
  assert.equal(Math.max(...blueprint.layerTileCounts) <= 22, true);
  assert.equal(blueprint.layerPlans[0].stageKey, "release");
  assert.equal(blueprint.layerPlans.at(-1).stageKey, "surface");
});

test("capacity errors are deterministic and include exact guidance", () => {
  const first = validateBlueprintCapacity({
    difficulty: "normal",
    tileCount: 400,
    layerCount: 5,
  });
  const repeated = validateBlueprintCapacity({
    difficulty: "normal",
    tileCount: 400,
    layerCount: 5,
  });

  assert.deepEqual(first, repeated);
  assert.equal(first.supported, false);
  assert.match(first.message, /至少需要 \d+ 个有效层/);
  assert.match(first.message, /当前 5 层最多支持 \d+ 张/);
  assert.equal(first.minimumLayers > 5, true);
  assert.equal(first.maxTiles < 400, true);
});

test("dynamic layer limit preserves the standard 200/15 peak", () => {
  assert.equal(layerTileLimit({
    difficulty: "normal",
    tileCount: 200,
    layerCount: 15,
  }), 22);
  assert.equal(layerTileLimit({
    difficulty: "hard",
    tileCount: 240,
    layerCount: 32,
  }), 14);
});

test("tower entrances always include mixed high, medium, and small roles", () => {
  const blueprint = buildStageBlueprint(normalOptions());
  const roles = blueprint.towerEntrances.map(({ role }) => role);

  assert.equal(blueprint.towerEntrances.length >= 4, true);
  assert.equal(roles.includes("high"), true);
  assert.equal(roles.includes("medium"), true);
  assert.equal(roles.filter((role) => role === "small").length >= 2, true);
  assert.equal(
    blueprint.towerEntrances.every(({ x, y }) =>
      x >= 0 && x <= 48 && y >= 0 && y <= 56),
    true,
  );
});

test("family and fill-track planning are deterministic and keep 0/2/4 semantics", () => {
  const first = buildStageBlueprint(normalOptions({ seed: 77 }));
  const repeated = buildStageBlueprint(normalOptions({ seed: 77 }));

  assert.deepEqual(first, repeated);
  assert.equal(first.familyIds.length, 1);
  assert.equal([0, 2, 4].includes(first.fillTrackPlan.trackCount), true);
  assert.equal(
    first.fillTrackPlan.tracks.length,
    first.fillTrackPlan.trackCount,
  );
});
