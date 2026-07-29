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

test("every active Unity second-round template generates one valid v10 level", {
  skip: levelsRoot
    ? false
    : "PAWS_EDITOR_LEVELS is not set; Unity corpus gate was not requested.",
}, async () => {
  const entries = await readdir(levelsRoot, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) =>
      entry.isFile()
      && /_r2_.*\.json$/i.test(entry.name))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  assert.equal(fileNames.length >= 16, true);

  for (const [index, fileName] of fileNames.entries()) {
    const source = parseLevelDocument(
      JSON.parse(await readFile(join(levelsRoot, fileName), "utf8")),
      { fileName },
    );
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
    const learning = generated.document.designerNote.aiGeneration.templateLearning;

    assert.equal(
      generated.document.designerNote.aiGeneration.algorithmVersion,
      "paws-local-stat-v10-template-motifs",
      fileName,
    );
    assert.equal(generated.document.tiles.length, 200, fileName);
    assert.equal(new Set(generated.document.tiles.map(({ layer }) => layer)).size, 15, fileName);
    assert.equal(generated.document.tiles.every(({ type }) => type === -1), true, fileName);
    assert.deepEqual(sameLayerOverlapPairs(generated.document.tiles), [], fileName);
    assert.equal(learning.sourceLayerMap.length, 15, fileName);
    assert.equal(learning.fillTrackCount, sourceStatistics.fillTracks.length, fileName);
    assert.equal(learning.fillTrackCount, learning.fillTracks.length, fileName);
    assert.equal(solveLevel(generated.document).solvable, true, fileName);
  }
});
