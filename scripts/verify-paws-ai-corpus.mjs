import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
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
import {
  spatialComponents,
} from "../projects/paws-level-editor/core/structure-corpus.mjs";

const ALGORITHM_VERSION = "paws-local-stat-v11-stage-grammar";
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const levelsRoot = process.env.PAWS_EDITOR_LEVELS?.trim();
const proofPath = join(
  repoRoot,
  "tests",
  "artifacts",
  "paws-ai-v11-corpus-proof.json",
);
const TARGETS = Object.freeze({
  easy: Object.freeze({ tileCount: 180, layerCount: 12, targetScore: 40 }),
  normal: Object.freeze({ tileCount: 200, layerCount: 15, targetScore: 60 }),
  hard: Object.freeze({ tileCount: 240, layerCount: 32, targetScore: 80 }),
});
const COMPACT_TARGETS = Object.freeze({
  easy: Object.freeze({ tileCount: 100, layerCount: 10 }),
  normal: Object.freeze({ tileCount: 104, layerCount: 5 }),
  hard: Object.freeze({ tileCount: 106, layerCount: 5 }),
});
const MAXIMUM_TARGET = Object.freeze({ tileCount: 400, layerCount: 40 });
const LAYOUTS = Object.freeze(["balanced", "progressive", "open"]);
const MATRIX_SEEDS_PER_COMBINATION = 54;
const FIXED_DIVERSITY_SEEDS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => 2026073001 + index),
);
const TILE_SIZE = 8;

if (!levelsRoot) {
  throw new Error("PAWS_EDITOR_LEVELS is required for the Unity corpus verifier.");
}

function increment(histogram, value) {
  const key = String(value);
  histogram[key] = (histogram[key] ?? 0) + 1;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function summarize(values) {
  if (!values.length) return { minimum: 0, maximum: 0, average: 0 };
  return {
    minimum: round(Math.min(...values)),
    maximum: round(Math.max(...values)),
    average: round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
  };
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return round(sorted[index]);
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

function isInBounds(tile) {
  return Number.isInteger(tile.x)
    && Number.isInteger(tile.y)
    && Number.isInteger(tile.layer)
    && tile.x >= 0
    && tile.x <= 48
    && tile.y >= 0
    && tile.y <= 56
    && tile.layer >= 1;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function targetForMatrix(difficulty, seedIndex) {
  if (seedIndex === 1) return TARGETS[difficulty];
  const boundary = seedIndex === 3
    ? MAXIMUM_TARGET
    : COMPACT_TARGETS[difficulty];
  return { ...boundary, targetScore: TARGETS[difficulty].targetScore };
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

const geometryFailures = {
  build: 0,
  count: 0,
  layers: 0,
  bounds: 0,
  overlap: 0,
  density: 0,
  structure: 0,
  solve: 0,
};
const playFailures = {
  oddTypes: 0,
  assignment: 0,
  solve: 0,
};
const failureDetails = [];
const geometryDurations = [];
const playDurations = [];
const releaseDrops = [];
const layerPeakHistogram = {};
const componentCountHistogram = {};
const maximumComponentHistogram = {};
const towerEntranceHistogram = {};
const maximumTowerDepthHistogram = {};
const fillTrackHistogram = { 0: 0, 2: 0, 4: 0 };
const towerRoleTotals = { high: 0, medium: 0, small: 0 };
const difficultyScores = { easy: [], normal: [], hard: [] };
const defaultDifficultyScores = { easy: [], normal: [], hard: [] };
const defaultLayerPeaks = [];
const defaultLayerPeakHistogram = {};
const playDocuments = { easy: [], normal: [], hard: [] };
let geometryCases = 0;
let playCases = 0;

function recordFailure(group, key, context, message) {
  group[key] += 1;
  if (failureDetails.length < 200) {
    failureDetails.push({ group: group === geometryFailures ? "geometry" : "play", key, context, message });
  }
}

function recordGeometryMetrics(generated, difficulty, target) {
  const document = generated.document;
  const ai = document.designerNote.aiGeneration;
  const metrics = ai.structure;
  const layerGroups = [...Map.groupBy(document.tiles, ({ layer }) => layer)]
    .sort(([left], [right]) => left - right);
  const layerPeak = Math.max(0, ...layerGroups.map(([, tiles]) => tiles.length));

  increment(layerPeakHistogram, layerPeak);
  increment(towerEntranceHistogram, metrics.towerEntranceCount);
  increment(maximumTowerDepthHistogram, metrics.maximumTowerDepth);
  increment(fillTrackHistogram, metrics.fillTrackCount);
  releaseDrops.push(metrics.releaseDependencyDrop);
  towerRoleTotals.high += metrics.towerRoleCounts.high;
  towerRoleTotals.medium += metrics.towerRoleCounts.medium;
  towerRoleTotals.small += metrics.towerRoleCounts.small;
  difficultyScores[difficulty].push(ai.difficulty.actualScore);
  if (
    target.tileCount === TARGETS[difficulty].tileCount
    && target.layerCount === TARGETS[difficulty].layerCount
  ) {
    defaultDifficultyScores[difficulty].push(ai.difficulty.actualScore);
  }

  for (const [, layerTiles] of layerGroups) {
    const components = spatialComponents(layerTiles);
    increment(componentCountHistogram, components.length);
    increment(
      maximumComponentHistogram,
      Math.max(0, ...components.map(({ length }) => length)),
    );
  }

  if (target.tileCount === 200 && target.layerCount === 15) {
    defaultLayerPeaks.push(layerPeak);
    increment(defaultLayerPeakHistogram, layerPeak);
  }
}

function validateGenerated(generated, target, context, expectedSource = null) {
  const document = generated.document;
  const ai = document.designerNote.aiGeneration;
  const learning = ai.templateLearning;
  const metrics = ai.structure;
  const actualLayerCount = new Set(document.tiles.map(({ layer }) => layer)).size;
  const layerPeak = Math.max(0, ...metrics.layerTileCounts);

  if (document.tiles.length !== target.tileCount) {
    recordFailure(
      geometryFailures,
      "count",
      context,
      `expected ${target.tileCount}, got ${document.tiles.length}`,
    );
  }
  if (actualLayerCount !== target.layerCount) {
    recordFailure(
      geometryFailures,
      "layers",
      context,
      `expected ${target.layerCount}, got ${actualLayerCount}`,
    );
  }
  if (!document.tiles.every(isInBounds)) {
    recordFailure(geometryFailures, "bounds", context, "tile anchor outside 7x8 board");
  }
  const overlaps = overlapCount(document.tiles);
  if (overlaps) {
    recordFailure(
      geometryFailures,
      "overlap",
      context,
      `${overlaps} same-layer overlap pairs`,
    );
  }
  if (
    layerPeak > ai.blueprint.maxLayerTiles
    || (target.tileCount === 200 && target.layerCount === 15 && layerPeak > 22)
  ) {
    recordFailure(
      geometryFailures,
      "density",
      context,
      `layer peak ${layerPeak}, cap ${ai.blueprint.maxLayerTiles}`,
    );
  }

  const selectedSource = expectedSource
    ?? sourceStatistics.get(learning.sourceFileName);
  const lowerTrackTiles = document.tiles
    .filter(({ uid }) => /^stage-track-\d+-lower-\d+$/i.test(uid));
  const topTrackTiles = document.tiles
    .filter(({ uid }) => /^stage-track-\d+-top$/i.test(uid));
  const sourceTrackCount = selectedSource?.fillTracks?.length;
  const structureValid =
    ai.algorithmVersion === ALGORITHM_VERSION
    && ai.blueprint.stagePlan.length === 5
    && document.tiles.every(({ type }) => type === -1)
    && [0, 2, 4].includes(learning.fillTrackCount)
    && learning.fillTrackCount === learning.fillTracks.length
    && (expectedSource === null || learning.fillTrackCount === sourceTrackCount)
    && lowerTrackTiles.every(({ presetColorType, moldType }) =>
      presetColorType === 3 && moldType === 1)
    && topTrackTiles.length === learning.fillTrackCount
    && topTrackTiles.every(({ presetColorType, moldType }) =>
      presetColorType === 1 && moldType === 2)
    && metrics.multiComponentLayerRatio >= 0.65
    && metrics.maximumPlatformSize <= 10
    && metrics.threeLayerGiantRun === false
    && metrics.towerEntranceCount >= 4
    && metrics.towerRoleCounts.high >= 1
    && metrics.towerRoleCounts.medium >= 1
    && metrics.towerRoleCounts.small >= 2
    && metrics.releaseDependencyDrop > 0;
  if (!structureValid) {
    recordFailure(
      geometryFailures,
      "structure",
      context,
      JSON.stringify({
        algorithmVersion: ai.algorithmVersion,
        fillTracks: learning.fillTrackCount,
        sourceTrackCount,
        multiComponentLayerRatio: metrics.multiComponentLayerRatio,
        maximumPlatformSize: metrics.maximumPlatformSize,
        threeLayerGiantRun: metrics.threeLayerGiantRun,
        towerEntranceCount: metrics.towerEntranceCount,
        towerRoleCounts: metrics.towerRoleCounts,
        releaseDependencyDrop: metrics.releaseDependencyDrop,
      }),
    );
  }
  if (!solveLevel(document).solvable) {
    recordFailure(geometryFailures, "solve", context, "geometry has no complete removal route");
  }
}

function generateAndMeasure(options, context, expectedSource = null) {
  geometryCases += 1;
  const startedAt = performance.now();
  try {
    const generated = generateAiLevel({ ...options, maxAttempts: 1 });
    geometryDurations.push(performance.now() - startedAt);
    validateGenerated(generated, options, context, expectedSource);
    recordGeometryMetrics(generated, options.difficulty, options);
    return generated;
  } catch (error) {
    geometryDurations.push(performance.now() - startedAt);
    recordFailure(geometryFailures, "build", context, errorMessage(error));
    return null;
  }
}

const verifierStartedAt = performance.now();

for (const [index, reference] of references.entries()) {
  generateAndMeasure({
    references: [reference],
    difficulty: "normal",
    layout: "balanced",
    ...TARGETS.normal,
    seed: 10000 + index,
  }, `source:${reference.fileName}`, sourceStatistics.get(reference.fileName));
}

for (const [difficultyIndex, difficulty] of Object.keys(TARGETS).entries()) {
  for (const [layoutIndex, layout] of LAYOUTS.entries()) {
    for (
      let seedIndex = 1;
      seedIndex <= MATRIX_SEEDS_PER_COMBINATION;
      seedIndex += 1
    ) {
      const target = targetForMatrix(difficulty, seedIndex);
      const generated = generateAndMeasure({
        references,
        difficulty,
        layout,
        ...target,
        seed:
          100000
          + difficultyIndex * 10000
          + layoutIndex * 1000
          + seedIndex,
      }, `matrix:${difficulty}:${layout}:${target.tileCount}x${target.layerCount}:${seedIndex}`);
      if (
        generated
        && layout === "balanced"
        && target.tileCount === COMPACT_TARGETS[difficulty].tileCount
        && target.layerCount === COMPACT_TARGETS[difficulty].layerCount
        && playDocuments[difficulty].length < 10
      ) {
        playDocuments[difficulty].push(generated.document);
      }
    }
  }
}

const topologyHashes = [];
const sourceUseCounts = {};
const topologyFamilyUseCounts = {};
for (const seed of FIXED_DIVERSITY_SEEDS) {
  const generated = generateAndMeasure({
    references,
    difficulty: "normal",
    layout: "balanced",
    ...TARGETS.normal,
    seed,
  }, `diversity:normal:balanced:${seed}`);
  if (!generated) continue;
  const ai = generated.document.designerNote.aiGeneration;
  topologyHashes.push(ai.templateLearning.topologyHash);
  const source = ai.templateLearning.sourceFileName || "(builtin)";
  const topologyFamily = ai.blueprint.topologyFamily || source;
  sourceUseCounts[source] = (sourceUseCounts[source] ?? 0) + 1;
  topologyFamilyUseCounts[topologyFamily] =
    (topologyFamilyUseCounts[topologyFamily] ?? 0) + 1;
}

for (const [difficultyIndex, difficulty] of Object.keys(TARGETS).entries()) {
  for (const [documentIndex, document] of playDocuments[difficulty].entries()) {
    for (let playSeed = 1; playSeed <= 20; playSeed += 1) {
      playCases += 1;
      const context = `play:${difficulty}:${documentIndex + 1}:${playSeed}`;
      const startedAt = performance.now();
      let snapshot;
      try {
        snapshot = createPlaySession(
          document,
          700000
            + difficultyIndex * 10000
            + documentIndex * 100
            + playSeed,
        ).getSnapshot();
      } catch (error) {
        playDurations.push(performance.now() - startedAt);
        recordFailure(playFailures, "assignment", context, errorMessage(error));
        continue;
      }
      const typeGroups = Map.groupBy(snapshot.tiles, ({ type }) => type);
      if (![...typeGroups.values()].every((tiles) => tiles.length % 2 === 0)) {
        recordFailure(playFailures, "oddTypes", context, "assigned type count was odd");
      }
      if (!solveLevel({ tiles: snapshot.tiles }).solvable) {
        recordFailure(playFailures, "solve", context, "assigned play layout was unsolvable");
      }
      playDurations.push(performance.now() - startedAt);
    }
  }
}

const familyUseCounts = Object.keys(sourceUseCounts).length >= 3
  ? sourceUseCounts
  : topologyFamilyUseCounts;
const maximumFamilyUseRatio = FIXED_DIVERSITY_SEEDS.length
  ? Math.max(0, ...Object.values(familyUseCounts))
    / FIXED_DIVERSITY_SEEDS.length
  : 1;
const uniqueTopologyHashes = new Set(topologyHashes).size;
const allGeometryFailuresZero = Object.values(geometryFailures)
  .every((count) => count === 0);
const allPlayFailuresZero = Object.values(playFailures)
  .every((count) => count === 0);
const corpusValid = references.length === 16
  && fileNames.every((fileName) => !/_Trash/i.test(fileName));
const diversityValid = topologyHashes.length === FIXED_DIVERSITY_SEEDS.length
  && uniqueTopologyHashes >= 24
  && maximumFamilyUseRatio <= 0.4;
const proof = {
  schemaVersion: 2,
  algorithmVersion: ALGORITHM_VERSION,
  generatedAt: new Date().toISOString(),
  corpus: {
    activeSecondRoundFiles: references.length,
    trashFilesRead: 0,
    sourceFiles: fileNames,
  },
  geometry: {
    cases: geometryCases,
    failures: geometryFailures,
    layerPeakHistogram,
    componentCountHistogram,
    maximumComponentHistogram,
    towerEntranceHistogram,
    maximumTowerDepthHistogram,
    towerRoleTotals,
    releaseDependencyDrop: summarize(releaseDrops),
    fillTrackHistogram,
    difficultyScores: Object.fromEntries(
      Object.entries(difficultyScores)
        .map(([difficulty, values]) => [difficulty, summarize(values)]),
    ),
    defaultDifficultyScores: Object.fromEntries(
      Object.entries(defaultDifficultyScores)
        .map(([difficulty, values]) => [difficulty, summarize(values)]),
    ),
  },
  play: {
    cases: playCases,
    failures: playFailures,
  },
  diversity: {
    fixedSeedCount: FIXED_DIVERSITY_SEEDS.length,
    generatedSeedCount: topologyHashes.length,
    uniqueTopologyHashes,
    topologyHashes,
    sourceFamilyCount: Object.keys(sourceUseCounts).length,
    sourceUseCounts,
    topologyFamilyUseCounts,
    familyRatioBasis: Object.keys(sourceUseCounts).length >= 3
      ? "sourceFileName"
      : "topologyFamily",
    maximumFamilyUseRatio: round(maximumFamilyUseRatio),
  },
  default200x15: {
    cases: defaultLayerPeaks.length,
    maximumLayerPeak: Math.max(0, ...defaultLayerPeaks),
    layerPeakHistogram: defaultLayerPeakHistogram,
  },
  performance: {
    geometryP95Ms: percentile(geometryDurations, 0.95),
    playP95Ms: percentile(playDurations, 0.95),
    totalDurationMs: round(performance.now() - verifierStartedAt),
  },
  failures: failureDetails,
  ok:
    corpusValid
    && geometryCases >= 500
    && playCases >= 600
    && allGeometryFailuresZero
    && allPlayFailuresZero
    && diversityValid
    && Math.max(0, ...defaultLayerPeaks) <= 22,
};

await mkdir(dirname(proofPath), { recursive: true });
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
if (!proof.ok) process.exitCode = 1;
