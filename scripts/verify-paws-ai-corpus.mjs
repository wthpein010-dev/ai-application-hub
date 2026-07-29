import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateAiLevel,
} from "../projects/paws-level-editor/core/ai-level-generator.mjs";
import {
  parseLevelDocument,
} from "../projects/paws-level-editor/core/level-adapter.mjs";
import {
  extractLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";
import { createPlaySession } from "../projects/paws-level-editor/core/play-engine.mjs";
import { solveLevel } from "../projects/paws-level-editor/core/level-solver.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const levelsRoot = process.env.PAWS_EDITOR_LEVELS?.trim();
const proofPath = join(
  repoRoot,
  "tests",
  "artifacts",
  "paws-ai-v10-corpus-proof.json",
);
const TILE_SIZE = 8;
const TARGETS = Object.freeze({
  easy: Object.freeze({ tileCount: 180, layerCount: 12, targetScore: 40 }),
  normal: Object.freeze({ tileCount: 200, layerCount: 15, targetScore: 60 }),
  hard: Object.freeze({ tileCount: 240, layerCount: 32, targetScore: 80 }),
});
const LAYOUTS = Object.freeze(["balanced", "progressive", "open"]);

if (!levelsRoot) {
  throw new Error("PAWS_EDITOR_LEVELS is required for the Unity corpus verifier.");
}

function overlapCount(tiles) {
  let count = 0;
  for (const layerTiles of Map.groupBy(tiles, ({ layer }) => layer).values()) {
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
          count += 1;
        }
      }
    }
  }
  return count;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

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
const sourceStatistics = new Map(references.map((reference) => [
  reference.fileName,
  extractLevelStatistics(reference),
]));
const counters = {
  generationFailures: 0,
  countFailures: 0,
  layerFailures: 0,
  overlapFailures: 0,
  typeFailures: 0,
  fillTrackMismatches: 0,
  solverFailures: 0,
  playSeedFailures: 0,
};
const failures = [];
let generationCases = 0;
let playSeedCases = 0;

function recordFailure(counter, context, message) {
  counters[counter] += 1;
  if (failures.length < 100) failures.push({ counter, context, message });
}

function validateGenerated(generated, target, context, expectedSource = null) {
  const document = generated.document;
  const learning = document.designerNote.aiGeneration.templateLearning;
  const selectedSource = expectedSource
    ?? sourceStatistics.get(learning.sourceFileName);
  if (document.tiles.length !== target.tileCount) {
    recordFailure(
      "countFailures",
      context,
      `expected ${target.tileCount}, got ${document.tiles.length}`,
    );
  }
  const actualLayerCount = new Set(document.tiles.map(({ layer }) => layer)).size;
  if (actualLayerCount !== target.layerCount) {
    recordFailure(
      "layerFailures",
      context,
      `expected ${target.layerCount}, got ${actualLayerCount}`,
    );
  }
  const sameLayerOverlaps = overlapCount(document.tiles);
  if (sameLayerOverlaps) {
    recordFailure(
      "overlapFailures",
      context,
      `${sameLayerOverlaps} same-layer overlap pairs`,
    );
  }
  if (!document.tiles.every(({ type }) => type === -1)) {
    recordFailure("typeFailures", context, "generated type was not -1");
  }
  if (
    !selectedSource
    || learning.fillTrackCount !== selectedSource.fillTracks.length
    || learning.fillTrackCount !== learning.fillTracks.length
  ) {
    recordFailure(
      "fillTrackMismatches",
      context,
      `source=${selectedSource?.fillTracks?.length ?? "missing"}, generated=${learning.fillTrackCount}`,
    );
  }
  if (!solveLevel(document).solvable) {
    recordFailure("solverFailures", context, "raw generated geometry is unsolvable");
  }
}

for (const [index, reference] of references.entries()) {
  const context = `single:${reference.fileName}`;
  generationCases += 1;
  try {
    const generated = generateAiLevel({
      references: [reference],
      difficulty: "normal",
      layout: "balanced",
      ...TARGETS.normal,
      seed: 10000 + index,
      maxAttempts: 1,
    });
    validateGenerated(
      generated,
      TARGETS.normal,
      context,
      sourceStatistics.get(reference.fileName),
    );
  } catch (error) {
    recordFailure("generationFailures", context, errorMessage(error));
  }
}

for (const [difficultyIndex, difficulty] of Object.keys(TARGETS).entries()) {
  for (const [layoutIndex, layout] of LAYOUTS.entries()) {
    for (let seed = 1; seed <= 50; seed += 1) {
      const context = `sweep:${difficulty}:${layout}:${seed}`;
      generationCases += 1;
      try {
        const generated = generateAiLevel({
          references,
          difficulty,
          layout,
          ...TARGETS[difficulty],
          seed:
            100000
            + difficultyIndex * 10000
            + layoutIndex * 1000
            + seed,
          maxAttempts: 1,
        });
        validateGenerated(generated, TARGETS[difficulty], context);
      } catch (error) {
        recordFailure("generationFailures", context, errorMessage(error));
      }
    }
  }
}

for (const [difficultyIndex, difficulty] of Object.keys(TARGETS).entries()) {
  for (let generatedIndex = 0; generatedIndex < 10; generatedIndex += 1) {
    const generationContext = `play-level:${difficulty}:${generatedIndex + 1}`;
    generationCases += 1;
    let generated;
    try {
      generated = generateAiLevel({
        references,
        difficulty,
        layout: LAYOUTS[generatedIndex % LAYOUTS.length],
        ...TARGETS[difficulty],
        seed: 500000 + difficultyIndex * 10000 + generatedIndex,
        maxAttempts: 1,
      });
      validateGenerated(generated, TARGETS[difficulty], generationContext);
    } catch (error) {
      recordFailure("generationFailures", generationContext, errorMessage(error));
      continue;
    }
    for (let playSeed = 1; playSeed <= 20; playSeed += 1) {
      const context = `${generationContext}:seed:${playSeed}`;
      playSeedCases += 1;
      try {
        const snapshot = createPlaySession(
          generated.document,
          playSeed,
        ).getSnapshot();
        const typeGroups = Map.groupBy(snapshot.tiles, ({ type }) => type);
        const paired = [...typeGroups.values()]
          .every((tiles) => tiles.length % 2 === 0);
        const report = solveLevel({ tiles: snapshot.tiles });
        if (!paired || !report.solvable) {
          recordFailure(
            "playSeedFailures",
            context,
            `paired=${paired}, solvable=${report.solvable}`,
          );
        }
      } catch (error) {
        recordFailure("playSeedFailures", context, errorMessage(error));
      }
    }
  }
}

const ok = Object.values(counters).every((count) => count === 0);
const proof = {
  schemaVersion: 1,
  algorithmVersion: "paws-local-stat-v10-template-motifs",
  generatedAt: new Date().toISOString(),
  corpusCount: references.length,
  sourceFiles: fileNames,
  generationCases,
  playSeedCases,
  counters,
  failures,
  ok,
};
await mkdir(dirname(proofPath), { recursive: true });
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
if (!ok) process.exitCode = 1;
