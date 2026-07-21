import { validateLevel } from "./level-validator.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "./level-statistics.mjs";
import { solveLevel } from "./level-solver.mjs";
import { scoreLevelDifficulty } from "./level-difficulty.mjs";
import { XorShift } from "./xorshift.mjs";

const TILE_SIZE = 8;
const ALGORITHM_VERSION = "paws-local-stat-v2";

export const DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    defaultTileCount: 180,
    defaultLayerCount: 12,
    defaultTargetScore: 40,
    suggestedTiles: Object.freeze([160, 200]),
    suggestedLayers: Object.freeze([10, 14]),
    tiles: Object.freeze([180, 180]),
    layers: Object.freeze([12, 12]),
    minInitialPairs: 8,
    maxOverlap: 0.25,
  }),
  normal: Object.freeze({
    defaultTileCount: 200,
    defaultLayerCount: 15,
    defaultTargetScore: 60,
    suggestedTiles: Object.freeze([190, 230]),
    suggestedLayers: Object.freeze([14, 20]),
    tiles: Object.freeze([200, 200]),
    layers: Object.freeze([15, 15]),
    minInitialPairs: 3,
    maxOverlap: 0.4,
  }),
  hard: Object.freeze({
    defaultTileCount: 240,
    defaultLayerCount: 32,
    defaultTargetScore: 80,
    suggestedTiles: Object.freeze([220, 280]),
    suggestedLayers: Object.freeze([28, 36]),
    tiles: Object.freeze([240, 240]),
    layers: Object.freeze([32, 32]),
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

const STAGE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "surface", label: "表层塔群", tileWeight: 0.22, layerWeight: 0.18 }),
  Object.freeze({ key: "shelter", label: "薄掩体", tileWeight: 0.15, layerWeight: 0.12 }),
  Object.freeze({ key: "middle", label: "中层塔群", tileWeight: 0.34, layerWeight: 0.34 }),
  Object.freeze({ key: "crisis", label: "深层卡点", tileWeight: 0.2, layerWeight: 0.26 }),
  Object.freeze({ key: "release", label: "释放残局", tileWeight: 0.09, layerWeight: 0.1 }),
]);

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

function boundedInteger(value, { minimum, maximum, label }) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label}必须是数字。`);
  }
  const integer = Math.round(number);
  if (integer < minimum || integer > maximum) {
    throw new Error(`${label}必须在 ${minimum}–${maximum} 之间。`);
  }
  return integer;
}

export function normalizeGenerationTargets({
  profile,
  tileCount,
  layerCount,
  targetScore,
}) {
  const normalizedTileCount = boundedInteger(
    tileCount ?? profile.defaultTileCount,
    { minimum: 20, maximum: 400, label: "砖块数量" },
  );
  const evenTileCount = normalizedTileCount % 2
    ? normalizedTileCount + 1
    : normalizedTileCount;
  const normalizedLayerCount = boundedInteger(
    layerCount ?? profile.defaultLayerCount,
    { minimum: 1, maximum: 40, label: "有效层数" },
  );
  const normalizedTargetScore = boundedInteger(
    targetScore ?? profile.defaultTargetScore,
    { minimum: 0, maximum: 100, label: "目标难度" },
  );
  const minimumPairs = normalizedLayerCount + profile.minInitialPairs - 1;
  if (evenTileCount / 2 < minimumPairs) {
    throw new Error(`砖块数量不足以构成 ${normalizedLayerCount} 个有效层。`);
  }
  return {
    tileCount: evenTileCount,
    layerCount: normalizedLayerCount,
    score: normalizedTargetScore,
    tileCountAdjusted: evenTileCount !== normalizedTileCount,
  };
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

function allocateCounts(total, weights, minimum = 0) {
  const counts = weights.map(() => minimum);
  let remaining = total - minimum * weights.length;
  if (remaining < 0) throw new Error("砖块或层数不足以构成五阶段结构。");
  const exact = weights.map((weight) => weight * remaining);
  for (let index = 0; index < exact.length; index += 1) {
    const value = Math.floor(exact[index]);
    counts[index] += value;
    remaining -= value;
  }
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (remaining > 0) {
    counts[order[cursor % order.length].index] += 1;
    cursor += 1;
    remaining -= 1;
  }
  return counts;
}

function distributeWithinStage(totalPairs, layers, minimumTopPairs = 0, {
  lowPairLayers = 0,
  lowPairValue = 2,
} = {}) {
  const counts = Array(layers).fill(1);
  if (minimumTopPairs) counts[layers - 1] = minimumTopPairs;
  const protectedLowLayers = Math.min(
    Math.max(0, layers - (minimumTopPairs ? 1 : 0)),
    Math.max(0, lowPairLayers),
  );
  for (let offset = 0; offset < protectedLowLayers; offset += 1) {
    const index = layers - 1 - (minimumTopPairs ? 1 : 0) - offset;
    counts[index] = Math.max(counts[index], lowPairValue);
  }
  let remaining = totalPairs - counts.reduce((total, value) => total + value, 0);
  if (remaining < 0) throw new Error("阶段砖块不足以满足开局安全对子约束。");
  const recipientLayers = Array.from({ length: layers }, (_, index) => index)
    .filter((index) => {
      if (minimumTopPairs && index === layers - 1) return false;
      return index < layers - protectedLowLayers - (minimumTopPairs ? 1 : 0);
    });
  if (!recipientLayers.length) {
    recipientLayers.push(...Array.from({ length: layers }, (_, index) => index));
  }
  let cursor = 0;
  while (remaining > 0) {
    counts[recipientLayers[cursor % recipientLayers.length]] += 1;
    cursor += 1;
    remaining -= 1;
  }
  return counts;
}

function buildStageStructure({ pairCount, layerCount, minimumTopPairs, targetScore }) {
  const tileWeights = STAGE_DEFINITIONS.map(({ tileWeight }) => tileWeight);
  const layerWeights = STAGE_DEFINITIONS.map(({ layerWeight }) => layerWeight);
  const stagePairs = allocateCounts(pairCount, tileWeights, 1);
  const stageLayers = layerCount >= STAGE_DEFINITIONS.length
    ? allocateCounts(layerCount, layerWeights, 1)
    : [layerCount, 0, 0, 0, 0];
  const surfaceIndex = 0;
  const minimumSurfacePairs = stageLayers[surfaceIndex] + minimumTopPairs - 1;
  if (stagePairs[surfaceIndex] < minimumSurfacePairs) {
    let needed = minimumSurfacePairs - stagePairs[surfaceIndex];
    const donors = [2, 3, 1, 4];
    for (const donor of donors) {
      const spare = Math.max(0, stagePairs[donor] - Math.max(1, stageLayers[donor]));
      const moved = Math.min(spare, needed);
      stagePairs[donor] -= moved;
      stagePairs[surfaceIndex] += moved;
      needed -= moved;
    }
    if (needed) throw new Error("砖块数量不足以满足开局安全对子约束。");
  }
  const pressureTargets = [
    Math.round(Math.min(38, targetScore * 0.5)),
    Math.round(Math.min(55, targetScore * 0.7)),
    Math.round(Math.min(75, targetScore * 0.85)),
    Math.round(Math.min(95, targetScore + 5)),
    Math.round(Math.max(15, targetScore - 25)),
  ];
  const stagePlan = STAGE_DEFINITIONS.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    pairCount: stagePairs[index],
    tileCount: stagePairs[index] * 2,
    layerCount: stageLayers[index],
    pressureTarget: pressureTargets[index],
  }));
  const layerGroups = stagePlan.map((stage, index) => {
    if (!stage.layerCount) return [];
    const hardPressureFraction = targetScore >= 75
      ? [0, 0.5, 0.7, 0.75, 0][index]
      : 0;
    const lowPairLayers = Math.floor(stage.layerCount * hardPressureFraction);
    stage.lowPairLayerCount = lowPairLayers;
    return distributeWithinStage(
      stage.pairCount,
      stage.layerCount,
      index === surfaceIndex ? minimumTopPairs : 0,
      { lowPairLayers },
    );
  });
  return {
    stagePlan,
    pairCounts: [
      ...layerGroups[4],
      ...layerGroups[3],
      ...layerGroups[2],
      ...layerGroups[1],
      ...layerGroups[0],
    ],
  };
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
  const pairLayers = buildTowerPairLayers({
    board,
    learned,
    pairCounts,
    layout,
    rng,
  });
  const placedTiles = [];
  let pairOrdinal = 0;
  for (let layerIndex = 0; layerIndex < pairCounts.length; layerIndex += 1) {
    const layer = layerIndex + 1;
    const pairs = pairLayers[layerIndex];
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

function distributeTopAnchors(count, minimum, maximum, center, rng) {
  if (count === 1) return [Math.round(center)];
  const lower = Math.max(minimum, Math.round(center - (count - 1) * 5));
  const upper = Math.min(maximum, Math.round(center + (count - 1) * 5));
  const span = Math.max(1, upper - lower);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / Math.max(1, count - 1);
    const base = lower + span * ratio;
    return Math.round(base + (rng.nextUint32() % 3) - 1);
  });
}

function nearOffsets(layout, rng) {
  const values = [];
  for (let dx = -7; dx <= 7; dx += 1) {
    for (let dy = -7; dy <= 7; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      values.push({
        dx,
        dy,
        distance: Math.abs(dx) + Math.abs(dy),
        jitter: rng.nextUint32() / 0xffffffff,
      });
    }
  }
  return values.sort((left, right) => {
    if (layout === "open") {
      return right.distance - left.distance || left.jitter - right.jitter;
    }
    if (layout === "progressive") {
      return left.distance - right.distance || left.jitter - right.jitter;
    }
    return Math.abs(left.distance - 8) - Math.abs(right.distance - 8)
      || left.jitter - right.jitter;
  });
}

function chooseChildAnchor({
  parent,
  offsets,
  maxX,
  maxY,
  layerAnchors,
  globalAnchors,
}) {
  const existing = [...globalAnchors].map((key) => {
    const [x, y] = key.split("|").map(Number);
    return { x, y };
  });
  const candidates = [];
  for (const { dx, dy } of offsets) {
    const x = Math.min(maxX, Math.max(0, parent.x + dx));
    const y = Math.min(maxY, Math.max(0, parent.y + dy));
    if (x === parent.x && y === parent.y) continue;
    const key = `${x}|${y}`;
    if (layerAnchors.has(key) || globalAnchors.has(key)) continue;
    const anchor = { x, y };
    if (!overlaps(anchor, parent)) continue;
    const extraOverlaps = existing.filter((value) =>
      overlaps(anchor, value)
      && (value.x !== parent.x || value.y !== parent.y)).length;
    candidates.push({ anchor, key, extraOverlaps });
  }
  const chosen = candidates.sort((left, right) =>
    left.extraOverlaps - right.extraOverlaps)[0];
  if (chosen) {
    layerAnchors.add(chosen.key);
    globalAnchors.add(chosen.key);
    return chosen.anchor;
  }
  throw new Error("无法在塔群遮挡约束内放置下层砖块。");
}

function buildTowerPairLayers({
  board,
  learned,
  pairCounts,
  layout,
  rng,
}) {
  const maxX = board.width * TILE_SIZE - TILE_SIZE;
  const maxY = board.height * TILE_SIZE - TILE_SIZE;
  const centroid = learnedCentroid(learned);
  const centerY = centroid.y * maxY;
  const topIndex = pairCounts.length - 1;
  const pairsByLayer = Array.from({ length: pairCounts.length }, () => []);
  const globalAnchors = new Set();
  const topYs = distributeTopAnchors(
    pairCounts[topIndex],
    4,
    Math.max(4, maxY - 4),
    centerY,
    rng,
  );
  const sideInset = layout === "open" ? 2 : layout === "progressive" ? 14 : 8;
  const topAnchors = new Set();
  pairsByLayer[topIndex] = topYs.map((y, index) => {
    const left = {
      x: Math.min(maxX, sideInset + (index % 2) * 2),
      y: Math.min(maxY, Math.max(0, y)),
    };
    const right = {
      x: Math.max(0, maxX - sideInset - (index % 2) * 2),
      y: left.y,
    };
    for (const anchor of [left, right]) {
      const key = `${anchor.x}|${anchor.y}`;
      if (topAnchors.has(key)) throw new Error("塔顶入口发生坐标冲突。");
      topAnchors.add(key);
      globalAnchors.add(key);
    }
    return { left, right };
  });

  for (let layerIndex = topIndex - 1; layerIndex >= 0; layerIndex -= 1) {
    const parents = pairsByLayer[layerIndex + 1];
    const layerAnchors = new Set();
    const offsets = nearOffsets(layout, rng);
    pairsByLayer[layerIndex] = Array.from(
      { length: pairCounts[layerIndex] },
      (_, index) => {
        const parent = parents[Math.floor(index * parents.length / pairCounts[layerIndex])];
        return {
          left: chooseChildAnchor({
            parent: parent.left,
            offsets,
            maxX,
            maxY,
            layerAnchors,
            globalAnchors,
          }),
          right: chooseChildAnchor({
            parent: parent.right,
            offsets: [...offsets].reverse(),
            maxX,
            maxY,
            layerAnchors,
            globalAnchors,
          }),
        };
      },
    );
  }
  return pairsByLayer;
}

function buildDocument({
  references,
  learned,
  profile,
  difficulty,
  layout,
  seed,
  target,
}) {
  const rng = XorShift.fromSeed(seed);
  const reference = references[rng.nextInt(0, references.length)];
  const tileCount = target.tileCount;
  const layerCount = target.layerCount;
  const stageStructure = buildStageStructure({
    pairCount: tileCount / 2,
    layerCount,
    minimumTopPairs: profile.minInitialPairs,
    targetScore: target.score,
  });
  const pairCounts = stageStructure.pairCounts;
  if (pairCounts.length !== layerCount) {
    throw new Error("五阶段结构未覆盖全部有效层。");
  }
  const board = {
    width: Math.max(
      layerCount > 20 ? 12 : 10,
      Math.round(learned.board.width),
    ),
    height: Math.max(
      layerCount > 20 ? 16 : 12,
      Math.round(learned.board.height),
    ),
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
      target: {
        tileCount,
        layerCount,
        targetScore: target.score,
      },
      stagePlan: stageStructure.stagePlan,
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
  tileCount,
  layerCount,
  targetScore,
  maxAttempts = 12,
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
  const target = normalizeGenerationTargets({
    profile,
    tileCount,
    layerCount,
    targetScore,
  });
  const attemptsLimit = Math.min(
    64,
    Math.max(1, Math.trunc(Number(maxAttempts) || 0)),
  );
  const learned = mergeLevelStatistics(
    normalizedReferences.map(extractLevelStatistics),
  );
  const requestedSeed = Number(seed) | 0;
  let best = null;
  let lastBuildError = null;

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
        target,
      });
    } catch (error) {
      lastBuildError = error;
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

    const difficultyReport = scoreLevelDifficulty(document, {
      solverReport: report,
    });
    if (!difficultyReport.valid) continue;
    document.designerNote.aiGeneration.solver = {
      solvable: true,
      steps: report.steps,
      nodes: report.nodes,
      initialAccessiblePairs: report.initialAccessiblePairs,
      maxDependencyDepth: statistics.maxDependencyDepth,
    };
    document.designerNote.aiGeneration.difficulty = {
      targetScore: target.score,
      actualScore: difficultyReport.score,
      rating: difficultyReport.rating,
      dimensions: difficultyReport.dimensions,
      confidence: difficultyReport.confidence,
      reasons: difficultyReport.reasons,
    };
    const candidate = {
      document,
      report: { ...report, statistics, difficulty: difficultyReport },
      seed: attemptSeed,
      attempts: attempt,
      target,
    };
    const difference = Math.abs(difficultyReport.score - target.score);
    if (!best || difference < best.difference) {
      best = { candidate, difference };
    }
    if (difference <= 5) return candidate;
  }
  if (best) return best.candidate;
  if (lastBuildError) {
    throw new Error(`在当前约束内未找到可解关卡：${lastBuildError.message}`);
  }
  throw new Error("在当前约束内未找到可解关卡，请重试或降低难度。");
}
