import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  generateAiLevel,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import {
  parseLevelDocument,
} from "../projects/paws-level-editor/core/level-adapter.mjs";
import {
  extractLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";
import { solveLevel } from "../projects/paws-level-editor/core/level-solver.mjs";

const levelsRoot = process.env.PAWS_EDITOR_LEVELS?.trim();
const TILE_SIZE = 8;

function sameLayerOverlapPairs(tiles) {
  const overlaps = [];
  const byLayer = Map.groupBy(tiles, ({ layer }) => layer);
  for (const layerTiles of byLayer.values()) {
    for (let left = 0; left < layerTiles.length; left += 1) {
      for (let right = left + 1; right < layerTiles.length; right += 1) {
        const a = layerTiles[left];
        const b = layerTiles[right];
        if (
          a.x < b.x + TILE_SIZE
          && a.x + TILE_SIZE > b.x
          && a.y < b.y + TILE_SIZE
          && a.y + TILE_SIZE > b.y
        ) {
          overlaps.push([a.uid, b.uid]);
        }
      }
    }
  }
  return overlaps;
}

async function readActiveCorpus() {
  const entries = await readdir(levelsRoot, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) =>
      entry.isFile()
      && /_r2_.*\.json$/i.test(entry.name))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const references = await Promise.all(fileNames.map(async (fileName) =>
    parseLevelDocument(
      JSON.parse(await readFile(join(levelsRoot, fileName), "utf8")),
      { fileName },
    )));
  return { fileNames, references };
}

test("every active Unity second-round template generates one valid v11 stage-grammar level", {
  skip: levelsRoot
    ? false
    : "PAWS_EDITOR_LEVELS is not set; Unity corpus gate was not requested.",
}, async () => {
  const { fileNames, references } = await readActiveCorpus();
  assert.equal(fileNames.length, 16);
  assert.equal(fileNames.some((fileName) => /_Trash/i.test(fileName)), false);

  for (const [index, source] of references.entries()) {
    const fileName = fileNames[index];
    const sourceStatistics = extractLevelStatistics(source);
    const generated = generateAiLevel({
      references: [source],
      difficulty: "normal",
      layout: "balanced",
      tileCount: 200,
      layerCount: 15,
      targetScore: 60,
      seed: 20260729 + index,
      maxAttempts: 1,
    });
    const ai = generated.document.designerNote.aiGeneration;
    const learning = ai.templateLearning;

    assert.equal(
      ai.algorithmVersion,
      "paws-local-stat-v11-stage-grammar",
      fileName,
    );
    assert.equal(generated.document.tiles.length, 200, fileName);
    assert.equal(new Set(generated.document.tiles.map(({ layer }) => layer)).size, 15, fileName);
    assert.equal(generated.document.tiles.every(({ type }) => type === -1), true, fileName);
    assert.deepEqual(sameLayerOverlapPairs(generated.document.tiles), [], fileName);
    assert.equal(ai.blueprint.stagePlan.length, 5, fileName);
    assert.equal(ai.blueprint.layerPlans.length, 15, fileName);
    assert.equal(Math.max(...learning.layerTileCounts) <= 22, true, fileName);
    assert.equal(ai.structure.towerEntranceCount >= 4, true, fileName);
    assert.equal(ai.structure.threeLayerGiantRun, false, fileName);
    assert.equal(ai.structure.releaseDependencyDrop > 0, true, fileName);
    assert.equal(learning.fillTrackCount, sourceStatistics.fillTracks.length, fileName);
    assert.equal(learning.fillTrackCount, learning.fillTracks.length, fileName);
    assert.equal([0, 2, 4].includes(learning.fillTrackCount), true, fileName);
    assert.equal(solveLevel(generated.document).solvable, true, fileName);
  }
});

test("easy 400/40 keeps six opening pairs with one deterministic attempt", {
  skip: levelsRoot
    ? false
    : "PAWS_EDITOR_LEVELS is not set; Unity corpus gate was not requested.",
}, async () => {
  const { references } = await readActiveCorpus();
  const generated = generateAiLevel({
    references,
    difficulty: "easy",
    layout: "balanced",
    tileCount: 400,
    layerCount: 40,
    targetScore: 40,
    seed: 100003,
    maxAttempts: 1,
  });

  assert.equal(generated.document.tiles.length, 400);
  assert.equal(generated.report.initialAccessiblePairs >= 6, true);
  assert.equal(generated.report.solvable, true);
});

test("each difficulty generates at a declared compact boundary", {
  skip: levelsRoot
    ? false
    : "PAWS_EDITOR_LEVELS is not set; Unity corpus gate was not requested.",
}, async () => {
  const { references } = await readActiveCorpus();
  const cases = [
    { difficulty: "easy", tileCount: 100, layerCount: 10, targetScore: 40 },
    { difficulty: "normal", tileCount: 104, layerCount: 5, targetScore: 60 },
    { difficulty: "hard", tileCount: 106, layerCount: 5, targetScore: 80 },
  ];

  for (const [index, options] of cases.entries()) {
    const generated = generateAiLevel({
      references,
      ...options,
      layout: "balanced",
      seed: 300001 + index,
      maxAttempts: 1,
    });
    assert.equal(generated.document.tiles.length, options.tileCount);
    assert.equal(generated.report.solvable, true);
  }
});
