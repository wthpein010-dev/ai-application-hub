import { validateLevel } from "./level-validator.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "./level-statistics.mjs";
import { solveLevel } from "./level-solver.mjs";
import { XorShift } from "./xorshift.mjs";

const TILE_SIZE = 8;
const ALGORITHM_VERSION = "paws-local-stat-v1";

export const DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    tiles: Object.freeze([36, 48]),
    layers: Object.freeze([3, 4]),
    minInitialPairs: 4,
    maxOverlap: 0.25,
  }),
  normal: Object.freeze({
    tiles: Object.freeze([60, 72]),
    layers: Object.freeze([5, 6]),
    minInitialPairs: 2,
    maxOverlap: 0.4,
  }),
  hard: Object.freeze({
    tiles: Object.freeze([84, 96]),
    layers: Object.freeze([7, 8]),
    minInitialPairs: 1,
    maxOverlap: 0.5,
  }),
});

const LAYOUTS = Object.freeze({
  balanced: Object.freeze({ label: "均衡布局", overlapTarget: 2 }),
  progressive: Object.freeze({ label: "层层推进", overlapTarget: 4 }),
  open: Object.freeze({ label: "开阔分布", overlapTarget: 0 }),
});

const DIFFICULTY_LABELS = Object.freeze({
  easy: { label: "简单", value: "Easy" },
  normal: { label: "标准", value: "Normal" },
  hard: { label: "困难", value: "Hard" },
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function overlaps(left, right) {
  return (
    left.x < right.x + TILE_SIZE
    && left.x + TILE_SIZE > right.x
    && left.y < right.y + TILE_SIZE
    && left.y + TILE_SIZE > right.y
  );
}

function chooseEven(rng, [minimum, maximum]) {
  const first = Math.ceil(minimum / 2);
  const last = Math.floor(maximum / 2);
  return rng.nextInt(first, last + 1) * 2;
}

function chooseInteger(rng, [minimum, maximum]) {
  return rng.nextInt(minimum, maximum + 1);
}

function distributePairs(pairCount, layerCount, minimumTopPairs, layout) {
  const counts = Array(layerCount).fill(1);
  counts[layerCount - 1] = minimumTopPairs;
  let remaining = pairCount - counts.reduce((total, value) => total + value, 0);
  const lowerLayers = Array.from(
    { length: layerCount - 1 },
    (_, index) => index,
  );
  const order = layout === "open"
    ? [...lowerLayers].reverse()
    : lowerLayers;
  let cursor = 0;
  while (remaining > 0) {
    counts[order[cursor % order.length]] += 1;
    cursor += 1;
    remaining -= 1;
  }
  return counts;
}

function createsSideSandwich(positions, candidate) {
  const next = new Set(positions);
  next.add(`${candidate.left.x}|${candidate.left.y}`);
  next.add(`${candidate.right.x}|${candidate.right.y}`);
  for (const key of next) {
    const [x, y] = key.split("|").map(Number);
    if (next.has(`${x - TILE_SIZE}|${y}`)
      && next.has(`${x + TILE_SIZE}|${y}`)) {
      return true;
    }
  }
  return false;
}

function candidateOverlapCount(candidate, placedTiles) {
  return [candidate.left, candidate.right]
    .reduce(
      (total, tile) =>
        total + placedTiles.filter((placed) => overlaps(tile, placed)).length,
      0,
    );
}

function learnedCentroid(learned) {
  const anchors = learned.normalizedAnchors ?? [];
  if (!anchors.length) return { x: 0.5, y: 0.5 };
  return {
    x: anchors.reduce((total, anchor) => total + anchor.x, 0) / anchors.length,
    y: anchors.reduce((total, anchor) => total + anchor.y, 0) / anchors.length,
  };
}

function buildPairPool(board, learned, layout, rng) {
  const maxX = board.width * TILE_SIZE - TILE_SIZE;
  const maxY = board.height * TILE_SIZE - TILE_SIZE;
  const centroid = learnedCentroid(learned);
  const pool = [];
  for (let leftX = 0; leftX < maxX - leftX; leftX += 4) {
    const rightX = maxX - leftX;
    for (let y = 0; y <= maxY; y += 4) {
      const normalizedY = maxY > 0 ? y / maxY : 0.5;
      const normalizedLeftX = maxX > 0 ? leftX / maxX : 0.25;
      const centerDistance =
        Math.abs(normalizedY - centroid.y)
        + Math.abs(normalizedLeftX - Math.min(centroid.x, 1 - centroid.x));
      const spatialScore = layout === "open"
        ? centerDistance * 24
        : -centerDistance * (layout === "progressive" ? 18 : 12);
      pool.push({
        left: { x: leftX, y },
        right: { x: rightX, y },
        spatialScore,
        jitter: rng.nextUint32() / 0xffffffff,
      });
    }
  }
  return pool;
}

function chooseLayerPairs({
  count,
  layer,
  pool,
  layout,
  placedTiles,
  occupiedAnchors,
}) {
  const selected = [];
  const positions = new Set();
  while (selected.length < count) {
    const ranked = pool
      .filter((candidate) => {
        const keys = [
          `${candidate.left.x}|${candidate.left.y}`,
          `${candidate.right.x}|${candidate.right.y}`,
        ];
        return keys.every((key) => !occupiedAnchors.has(key))
          && !createsSideSandwich(positions, candidate);
      })
      .map((candidate) => {
        const overlapCount = candidateOverlapCount(candidate, placedTiles);
        const overlapScore = layout === "progressive"
          ? overlapCount * 80
          : layout === "open"
            ? -overlapCount * 100
            : -Math.abs(overlapCount - LAYOUTS[layout].overlapTarget) * 28;
        return {
          candidate,
          score: overlapScore + candidate.spatialScore + candidate.jitter,
        };
      })
      .sort((left, right) => right.score - left.score);
    const chosen = ranked[0]?.candidate;
    if (!chosen) {
      throw new Error(`第 ${layer} 层无法在重叠约束内放置 ${count} 对砖块。`);
    }
    selected.push(chosen);
    for (const anchor of [chosen.left, chosen.right]) {
      const key = `${anchor.x}|${anchor.y}`;
      positions.add(key);
      occupiedAnchors.add(key);
    }
  }
  return selected;
}

function buildTiles({
  board,
  learned,
  pairCounts,
  layout,
  rng,
}) {
  const typeOrder = rng.shuffle(
    Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const pool = buildPairPool(board, learned, layout, rng);
  const occupiedAnchors = new Set();
  const placedTiles = [];
  let pairOrdinal = 0;
  for (let layerIndex = 0; layerIndex < pairCounts.length; layerIndex += 1) {
    const layer = layerIndex + 1;
    const pairs = chooseLayerPairs({
      count: pairCounts[layerIndex],
      layer,
      pool,
      layout,
      placedTiles,
      occupiedAnchors,
    });
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const type = typeOrder[pairOrdinal % typeOrder.length];
      const base = {
        layer,
        type,
        moldType: 1,
        metaType: 0,
        metaData: 0,
        presetColorType: 1,
      };
      placedTiles.push(
        {
          ...base,
          uid: `ai-${layer}-${index + 1}-a`,
          x: pair.left.x,
          y: pair.left.y,
        },
        {
          ...base,
          uid: `ai-${layer}-${index + 1}-b`,
          x: pair.right.x,
          y: pair.right.y,
        },
      );
      pairOrdinal += 1;
    }
  }
  return placedTiles.sort((left, right) =>
    left.layer - right.layer || left.y - right.y || left.x - right.x);
}

function buildDocument({
  references,
  learned,
  profile,
  difficulty,
  layout,
  seed,
}) {
  const rng = XorShift.fromSeed(seed);
  const reference = references[rng.nextInt(0, references.length)];
  const tileCount = chooseEven(rng, profile.tiles);
  const layerCount = chooseInteger(rng, profile.layers);
  const pairCounts = distributePairs(
    tileCount / 2,
    layerCount,
    profile.minInitialPairs,
    layout,
  );
  const board = {
    width: Math.max(8, Math.round(learned.board.width)),
    height: Math.max(10, Math.round(learned.board.height)),
    scale: Number.isFinite(learned.board.scale) ? learned.board.scale : 1,
  };
  const tiles = buildTiles({
    board,
    learned,
    pairCounts,
    layout,
    rng,
  });
  const unsignedSeed = seed >>> 0;
  const id = -((unsignedSeed % 900000) + 100000);
  const name =
    `AI ${DIFFICULTY_LABELS[difficulty].label} · ${LAYOUTS[layout].label}`;
  const original = {
    ...(clone(reference.original) ?? {}),
    id,
    name,
    difficulty: DIFFICULTY_LABELS[difficulty].value,
    gridUnit: reference.gridUnit || "sheep_8x10_mini8",
    tiles: [],
    stacks: [],
  };
  const designerNote = {
    ...(clone(reference.designerNote) ?? {}),
    widthNum: board.width,
    heightNum: board.height,
    boardScale: board.scale,
    blockTypeCount: 32,
    fullRandomTypeMin: 1,
    fullRandomTypeMax: 32,
    levelData: {},
    goldBlockData: [],
    cakeNum: 0,
    aiGeneration: {
      algorithmVersion: ALGORITHM_VERSION,
      seed: unsignedSeed,
      options: { difficulty, layout },
      referenceCount: references.length,
      learned: {
        sampleCount: learned.sampleCount,
        symmetryScore: learned.symmetryScore,
        overlapRatio: learned.overlapRatio,
      },
    },
  };
  return {
    original,
    designerNote,
    fileName: "",
    version: "",
    source: "tiles",
    warnings: [],
    id,
    name,
    difficulty: DIFFICULTY_LABELS[difficulty].value,
    gridUnit: original.gridUnit,
    board,
    random: {
      blockTypeCount: 32,
      fullTypeMin: 1,
      fullTypeMax: 32,
    },
    tiles,
  };
}

export function generateAiLevel({
  references,
  difficulty,
  layout,
  seed,
  maxAttempts = 32,
}) {
  const normalizedReferences = (Array.isArray(references) ? references : [])
    .filter((reference) =>
      reference
      && Array.isArray(reference.tiles)
      && reference.tiles.length > 0);
  if (!normalizedReferences.length) {
    throw new Error("没有可用于学习的参考关卡。");
  }
  const profile = DIFFICULTY_PROFILES[difficulty];
  if (!profile || !LAYOUTS[layout]) {
    throw new Error("AI 生成选项无效。");
  }
  const attemptsLimit = Math.max(1, Math.trunc(Number(maxAttempts) || 0));
  const learned = mergeLevelStatistics(
    normalizedReferences.map(extractLevelStatistics),
  );
  const requestedSeed = Number(seed) | 0;

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    const attemptSeed =
      (requestedSeed + Math.imul(attempt - 1, 0x9e3779b9)) | 0;
    let document;
    try {
      document = buildDocument({
        references: normalizedReferences,
        learned,
        profile,
        difficulty,
        layout,
        seed: attemptSeed,
      });
    } catch {
      continue;
    }
    const statistics = extractLevelStatistics(document);
    const errors = validateLevel(document)
      .filter(({ severity }) => severity === "error");
    if (
      errors.length
      || statistics.overlapRatio > profile.maxOverlap
      || statistics.maxExactStackDepth > 2
      || statistics.initialAccessiblePairs < profile.minInitialPairs
    ) {
      continue;
    }
    const report = solveLevel(document);
    if (!report.solvable) continue;

    document.designerNote.aiGeneration.solver = {
      solvable: true,
      steps: report.steps,
      nodes: report.nodes,
      initialAccessiblePairs: report.initialAccessiblePairs,
      maxDependencyDepth: statistics.maxDependencyDepth,
    };
    return {
      document,
      report: { ...report, statistics },
      seed: attemptSeed,
      attempts: attempt,
    };
  }
  throw new Error("在当前约束内未找到可解关卡，请重试或降低难度。");
}
