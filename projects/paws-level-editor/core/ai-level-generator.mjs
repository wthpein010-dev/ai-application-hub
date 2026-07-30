import { validateLevel } from "./level-validator.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "./level-statistics.mjs";
import { solveLevel } from "./level-solver.mjs";
import { scoreLevelDifficulty } from "./level-difficulty.mjs";
import { assignRandomTypes } from "./random-assigner.mjs";
import { XorShift } from "./xorshift.mjs";
import { computeCoverage } from "./coverage.mjs";
import { buildTemplateMotifGeometry } from "./template-motif-generator.mjs";
import { validateBlueprintCapacity } from "./stage-blueprint.mjs";

const TILE_SIZE = 8;
const ALGORITHM_VERSION = "paws-local-stat-v10-template-motifs";
const AI_BOARD = Object.freeze({ width: 7, height: 8 });
const AI_GRID_UNIT = "sheep_7x8_mini8";
export const MAX_AVERAGE_BLOCKERS = 4;
export const MAX_DEEP_LEVEL_AVERAGE_BLOCKERS = 6;

export function maxAverageBlockersForLayers(layerCount) {
  return Number(layerCount) > 15
    ? MAX_DEEP_LEVEL_AVERAGE_BLOCKERS
    : MAX_AVERAGE_BLOCKERS;
}

export const DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    defaultTileCount: 180,
    defaultLayerCount: 12,
    defaultTargetScore: 40,
    suggestedTiles: Object.freeze([160, 200]),
    suggestedLayers: Object.freeze([10, 14]),
    tiles: Object.freeze([180, 180]),
    layers: Object.freeze([12, 12]),
    minInitialPairs: 6,
    maxOverlap: 0.25,
    towerCount: 4,
    highTowerCount: 1,
    minTowerCount: 3,
    maxExactStackDepth: 4,
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
    towerCount: 5,
    highTowerCount: 2,
    minTowerCount: 3,
    maxExactStackDepth: 6,
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
    towerCount: 6,
    highTowerCount: 3,
    minTowerCount: 3,
    maxExactStackDepth: 8,
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

const STANDARD_TOWER_CENTERS = Object.freeze([
  Object.freeze({ x: 0.16, y: 0.18 }),
  Object.freeze({ x: 0.84, y: 0.2 }),
  Object.freeze({ x: 0.18, y: 0.82 }),
  Object.freeze({ x: 0.84, y: 0.8 }),
  Object.freeze({ x: 0.5, y: 0.5 }),
  Object.freeze({ x: 0.5, y: 0.14 }),
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
  difficulty,
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
    { minimum: 5, maximum: 40, label: "有效层数" },
  );
  const normalizedTargetScore = boundedInteger(
    targetScore ?? profile.defaultTargetScore,
    { minimum: 0, maximum: 100, label: "目标难度" },
  );
  const minimumPairs = normalizedLayerCount + profile.minInitialPairs - 1;
  if (evenTileCount / 2 < minimumPairs) {
    throw new Error(`砖块数量不足以构成 ${normalizedLayerCount} 个有效层。`);
  }
  const normalizedDifficulty = difficulty
    ?? Object.entries(DIFFICULTY_PROFILES)
      .find(([, candidate]) => candidate === profile)?.[0]
    ?? "normal";
  const capacity = validateBlueprintCapacity({
    difficulty: normalizedDifficulty,
    tileCount: evenTileCount,
    layerCount: normalizedLayerCount,
  });
  if (!capacity.supported) {
    throw new RangeError(capacity.message);
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
  let nextUpperLayer = layerCount;
  for (const stage of stagePlan) {
    stage.layerEnd = nextUpperLayer;
    stage.layerStart = stage.layerCount
      ? nextUpperLayer - stage.layerCount + 1
      : nextUpperLayer + 1;
    nextUpperLayer = stage.layerStart - 1;
  }
  const layerGroups = stagePlan.map((stage, index) => {
    if (!stage.layerCount) return [];
    const hardPressureFraction = targetScore >= 75
      ? [0, 0.5, 0.7, 0.75, 0][index]
      : targetScore >= 55
        ? [0, 0.25, 0.35, 0.5, 0][index]
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
    layerPlans: [
      ...layerGroups[4].map((pairCountForLayer, index) => ({
        ...stagePlan[4],
        pairCountForLayer,
        stageLayerIndex: index,
      })),
      ...layerGroups[3].map((pairCountForLayer, index) => ({
        ...stagePlan[3],
        pairCountForLayer,
        stageLayerIndex: index,
      })),
      ...layerGroups[2].map((pairCountForLayer, index) => ({
        ...stagePlan[2],
        pairCountForLayer,
        stageLayerIndex: index,
      })),
      ...layerGroups[1].map((pairCountForLayer, index) => ({
        ...stagePlan[1],
        pairCountForLayer,
        stageLayerIndex: index,
      })),
      ...layerGroups[0].map((pairCountForLayer, index) => ({
        ...stagePlan[0],
        pairCountForLayer,
        stageLayerIndex: index,
      })),
    ],
  };
}

export function maxTowerAverageBlockersForLayers(layerCount) {
  return maxAverageBlockersForLayers(layerCount) + 2;
}

export function generatedStructureIssues(statistics, profile, layerCount) {
  const issues = [];
  if (statistics.initialAccessibleTiles < 2) {
    issues.push(`开局可操作砖块不足(${statistics.initialAccessibleTiles})`);
  }
  return issues;
}

function candidateOverlapCount(candidate, placedTiles) {
  return [candidate.left, candidate.right]
    .reduce(
      (total, tile) =>
        total + placedTiles.filter((placed) => overlaps(tile, placed)).length,
      0,
    );
}

function clamp01(value) {
  return Math.max(0.05, Math.min(0.95, Number(value)));
}

function maximumFlatComponentSize(anchors) {
  const remaining = new Set(anchors.map((_, index) => index));
  let maximum = 0;
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    let size = 0;
    while (queue.length) {
      const index = queue.shift();
      size += 1;
      for (const candidate of [...remaining]) {
        const delta =
          Math.abs(anchors[index].x - anchors[candidate].x)
          + Math.abs(anchors[index].y - anchors[candidate].y);
        if (delta !== TILE_SIZE) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    maximum = Math.max(maximum, size);
  }
  return maximum;
}

function buildLayerAnchorPool(board, layer) {
  const maxX = board.width * TILE_SIZE - TILE_SIZE;
  const maxY = board.height * TILE_SIZE - TILE_SIZE;
  const offset = [0, 2, 4, 6][(layer - 1) % 4];
  const anchors = [];
  for (let x = offset; x <= maxX; x += TILE_SIZE) {
    for (let y = offset; y <= maxY; y += TILE_SIZE) {
      anchors.push({ x, y });
    }
  }
  return anchors;
}

function planTowerCenters({ learned, profile, layout, rng }) {
  const learnedCenters = (learned.towerCenters ?? [])
    .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  return STANDARD_TOWER_CENTERS
    .slice(0, profile.towerCount)
    .map((standard, index) => {
      const learnedCenter = [...learnedCenters].sort((left, right) =>
        Math.hypot(left.x - standard.x, left.y - standard.y)
        - Math.hypot(right.x - standard.x, right.y - standard.y))[0];
      const learnedWeight = learnedCenter
        ? Math.min(0.34, (learned.meanTileCount / 200) * 0.34)
        : 0;
      const layoutShift =
        layout === "open"
          ? (standard.x < 0.5 ? -0.025 : 0.025)
          : layout === "progressive"
            ? (standard.y < 0.5 ? 0.018 : -0.018)
            : 0;
      const jitterX = (rng.nextUint32() / 0xffffffff - 0.5) * 0.035;
      const jitterY = (rng.nextUint32() / 0xffffffff - 0.5) * 0.035;
      return {
        id: index,
        x: clamp01(
          standard.x * (1 - learnedWeight)
          + (learnedCenter?.x ?? standard.x) * learnedWeight
          + layoutShift
          + jitterX,
        ),
        y: clamp01(
          standard.y * (1 - learnedWeight)
          + (learnedCenter?.y ?? standard.y) * learnedWeight
          + jitterY,
        ),
        kind: index < profile.highTowerCount ? "high" : "low",
      };
    });
}

function shiftedCenter(center, deltaX, deltaY) {
  return {
    ...center,
    x: clamp01(center.x + deltaX),
    y: clamp01(center.y + deltaY),
  };
}

function activeCentersForLayer(towerCenters, layerPlan, profile) {
  const progress = layerPlan.layerCount > 1
    ? layerPlan.stageLayerIndex / (layerPlan.layerCount - 1)
    : 0.5;
  const step = ((layerPlan.stageLayerIndex % 4) - 1.5) * 0.055;
  const highTowers = towerCenters.filter(({ kind }) => kind === "high");
  const lowTowers = towerCenters.filter(({ kind }) => kind !== "high");
  const rotatingLowTowers = lowTowers.filter(
    (_, index) => (index + layerPlan.stageLayerIndex) % 2 === 0,
  );
  if (layerPlan.key === "shelter") {
    const count = Math.min(3, towerCenters.length);
    return towerCenters.slice(0, count).map((center, index) => {
      const partner = towerCenters[(index + 1) % towerCenters.length];
      return shiftedCenter(
        center,
        (partner.x - center.x) * 0.2 + step,
        (partner.y - center.y) * 0.2 - step,
      );
    });
  }
  if (layerPlan.key === "crisis") {
    return towerCenters
      .slice(0, Math.min(towerCenters.length, profile.highTowerCount + 1))
      .map((center, index) =>
        shiftedCenter(center, index % 2 ? step : -step, step));
  }
  if (layerPlan.key === "release") {
    return towerCenters
      .filter((_, index) => index % 2 === layerPlan.stageLayerIndex % 2)
      .slice(0, 3)
      .map((center) => shiftedCenter(center, -step, step));
  }
  if (layerPlan.key === "middle") {
    const centers = [
      ...highTowers,
      ...rotatingLowTowers,
      lowTowers[(layerPlan.stageLayerIndex + 1) % Math.max(1, lowTowers.length)],
    ].filter((center, index, values) =>
      center && values.findIndex(({ id }) => id === center.id) === index);
    return centers.map((center, index) =>
      shiftedCenter(
        center,
        (index % 2 ? -1 : 1) * (step + (progress - 0.5) * 0.08),
        (index % 3 - 1) * 0.026 - step * 0.35,
      ));
  }
  const surfaceCenters = [
    ...highTowers,
    ...rotatingLowTowers,
    lowTowers[(layerPlan.stageLayerIndex + 1) % Math.max(1, lowTowers.length)],
  ].filter((center, index, values) =>
    center && values.findIndex(({ id }) => id === center.id) === index);
  return surfaceCenters.map((center, index) =>
    shiftedCenter(
      center,
      (index % 2 ? 1 : -1) * step,
      (index % 3 - 1) * 0.02 - step * 0.25,
    ));
}

function normalizedAnchor(anchor, board) {
  const maxX = Math.max(1, board.width * TILE_SIZE - TILE_SIZE);
  const maxY = Math.max(1, board.height * TILE_SIZE - TILE_SIZE);
  return { x: anchor.x / maxX, y: anchor.y / maxY };
}

function nearestTower(anchor, centers, board) {
  const normalized = normalizedAnchor(anchor, board);
  return centers
    .map((center, index) => ({
      index,
      distance: Math.hypot(
        normalized.x - center.x,
        normalized.y - center.y,
      ),
    }))
    .sort((left, right) =>
      left.distance - right.distance || left.index - right.index)[0];
}

function buildPairPool({
  board,
  learned,
  layout,
  rng,
  layer,
  layerPlan,
  towerCenters,
  profile,
}) {
  const activeCenters = activeCentersForLayer(towerCenters, layerPlan, profile);
  const radius = {
    surface: 0.2,
    shelter: 0.17,
    middle: 0.2,
    crisis: 0.18,
    release: 0.17,
  }[layerPlan.key] ?? 0.2;
  const anchors = buildLayerAnchorPool(board, layer);
  const targetPairDistance = Math.max(
    0.2,
    Math.min(
      0.75,
      layout === "open"
        ? Math.max(0.52, learned.initialPairDistance ?? 0.52)
        : layout === "progressive"
          ? Math.min(0.48, learned.initialPairDistance ?? 0.42)
          : learned.initialPairDistance ?? 0.45,
    ),
  );
  const pool = [];
  for (let leftIndex = 0; leftIndex < anchors.length; leftIndex += 1) {
    const left = anchors[leftIndex];
    const leftTower = nearestTower(left, activeCenters, board);
    for (let rightIndex = leftIndex + 1; rightIndex < anchors.length; rightIndex += 1) {
      const right = anchors[rightIndex];
      if (overlaps(left, right)) continue;
      const rightTower = nearestTower(right, activeCenters, board);
      const normalizedLeft = normalizedAnchor(left, board);
      const normalizedRight = normalizedAnchor(right, board);
      const pairDistance = Math.hypot(
        normalizedLeft.x - normalizedRight.x,
        normalizedLeft.y - normalizedRight.y,
      );
      const gapParity =
        (Math.round(left.x / TILE_SIZE) + Math.round(left.y / TILE_SIZE))
        % 2;
      const desiredParity =
        (layerPlan.stageLayerIndex + (layerPlan.key === "shelter" ? 1 : 0))
        % 2;
      const towerDistance = leftTower.distance + rightTower.distance;
      const outsideTowerPenalty =
        Math.max(0, leftTower.distance - radius)
        + Math.max(0, rightTower.distance - radius);
      const sameTowerPenalty = leftTower.index === rightTower.index ? 32 : 0;
      const distancePenalty = Math.abs(pairDistance - targetPairDistance) * 95;
      const gapScore = gapParity === desiredParity ? 8 : 0;
      pool.push({
        left,
        right,
        siteIds: [leftTower.index, rightTower.index],
        spatialScore:
          -towerDistance * 620
          - outsideTowerPenalty * 1_100
          - distancePenalty
          - sameTowerPenalty
          + gapScore
          + rng.nextUint32() / 0xffffffff,
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
  immediateUpperTiles,
  occupiedAnchors,
  stageKey,
  coverageScale,
  anchorReuseLimit,
}) {
  const selected = [];
  const selectedAnchors = [];
  const parentUseCounts = new Map();
  const siteUseCounts = new Map();
  while (selected.length < count) {
    const baseEligible = (candidate) => {
      const keys = [
        `${candidate.left.x}|${candidate.left.y}`,
        `${candidate.right.x}|${candidate.right.y}`,
      ];
      return keys.every(
        (key) => (occupiedAnchors.get(key) ?? 0) < anchorReuseLimit,
      )
        && !overlaps(candidate.left, candidate.right)
        && [candidate.left, candidate.right].every((anchor) =>
          selectedAnchors.every((placed) => !overlaps(anchor, placed)))
        && maximumFlatComponentSize([
          ...selectedAnchors,
          candidate.left,
          candidate.right,
        ]) <= 6;
    };
    const coverageCount = (candidate) =>
      [candidate.left, candidate.right].filter((anchor) =>
        immediateUpperTiles.some((upper) => overlaps(anchor, upper))).length;
    const coveredPairRatio = {
      surface: 1,
      shelter: 1,
      middle: 1,
      crisis: 1,
      release: 1,
    }[stageKey] ?? 0.6;
    const requireCoveredCandidate =
      selected.length < Math.ceil(count * coveredPairRatio * coverageScale)
      && immediateUpperTiles.length;
    const requiredCoverage = 1;
    const coveredCandidateAvailable = requireCoveredCandidate
      && pool.some((candidate) =>
        baseEligible(candidate)
        && coverageCount(candidate) >= requiredCoverage);
    const ranked = pool
      .filter((candidate) => baseEligible(candidate)
        && (!coveredCandidateAvailable
          || coverageCount(candidate) >= requiredCoverage))
      .map((candidate) => {
        const overlapCount = candidateOverlapCount(candidate, placedTiles);
        const extraBlockers = Math.max(0, overlapCount - 2);
        const adjacencyCount = [candidate.left, candidate.right]
          .reduce((total, anchor) =>
            total + selectedAnchors.filter((placed) =>
              Math.abs(anchor.x - placed.x) + Math.abs(anchor.y - placed.y)
              === TILE_SIZE).length, 0);
        const siteReuse = candidate.siteIds.reduce(
          (total, siteId) => total + (siteUseCounts.get(siteId) ?? 0),
          0,
        );
        const newSites = [...new Set(candidate.siteIds)]
          .filter((siteId) => !siteUseCounts.has(siteId)).length;
        const parentReuse = immediateUpperTiles.length
          ? [candidate.left, candidate.right].reduce((total, anchor) => {
            const parents = immediateUpperTiles.filter((upper) =>
              overlaps(anchor, upper));
            const reuseCounts = parents.map((parent) =>
              parentUseCounts.get(parent) ?? 0);
            return total + (reuseCounts.length ? Math.min(...reuseCounts) : 0);
          }, 0)
          : 0;
        const overlapScore = layout === "progressive"
          ? -extraBlockers * 420
          : layout === "open"
            ? -extraBlockers * 760
            : -extraBlockers * 600;
        const directCoverage = coverageCount(candidate);
        const coverageScore = -directCoverage * (
          stageKey === "crisis" ? 28 : stageKey === "middle" ? 52 : 80
        );
        return {
          candidate,
          extraBlockers,
          score:
            overlapScore
            - adjacencyCount * (stageKey === "shelter" ? 70 : 130)
            - overlapCount * 72
            - parentReuse * 105
            - siteReuse * 38
            + newSites * 54
            + coverageScore
            + candidate.spatialScore
        };
      });
    if (ranked.some(({ score }) => !Number.isFinite(score))) {
      throw new Error(`第 ${layer} 层候选评分不是有限数。`);
    }
    ranked.sort((left, right) =>
      left.extraBlockers - right.extraBlockers
      || right.score - left.score);
    const chosen = ranked[0]?.candidate;
    if (!chosen) {
      throw new Error(
        `第 ${layer} 层无法在重叠约束内放置 ${count} 对砖块`
        + `（已放 ${selected.length} 对）。`,
      );
    }
    selected.push(chosen);
    for (const siteId of chosen.siteIds) {
      siteUseCounts.set(siteId, (siteUseCounts.get(siteId) ?? 0) + 1);
    }
    for (const anchor of [chosen.left, chosen.right]) {
      const key = `${anchor.x}|${anchor.y}`;
      selectedAnchors.push(anchor);
      occupiedAnchors.set(key, (occupiedAnchors.get(key) ?? 0) + 1);
      const parents = immediateUpperTiles
        .filter((upper) => overlaps(anchor, upper))
        .sort((left, right) =>
          (parentUseCounts.get(left) ?? 0) - (parentUseCounts.get(right) ?? 0));
      if (parents[0]) {
        parentUseCounts.set(parents[0], (parentUseCounts.get(parents[0]) ?? 0) + 1);
      }
    }
  }
  return selected;
}

function buildPairTiles({
  board,
  learned,
  pairCounts,
  layerPlans,
  layout,
  rng,
  profile,
}) {
  const typeOrder = rng.shuffle(
    Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const towerCenters = planTowerCenters({
    learned,
    profile,
    layout,
    rng,
  });
  const pairLayers = buildTowerPairLayers({
    board,
    learned,
    pairCounts,
    layerPlans,
    layout,
    rng,
    profile,
    towerCenters,
  });
  const placedTiles = [];
  const placedPairs = [];
  for (let layerIndex = 0; layerIndex < pairCounts.length; layerIndex += 1) {
    const layer = layerIndex + 1;
    const pairs = pairLayers[layerIndex];
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const base = {
        layer,
        type: 1,
        moldType: 1,
        metaType: 0,
        metaData: 0,
        presetColorType: 1,
      };
      const tiles = [
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
      ];
      placedPairs.push({ layer, tiles });
      placedTiles.push(...tiles);
    }
  }
  const coverage = computeCoverage(placedTiles);
  const accessibleTypeUses = new Map(typeOrder.map((type) => [type, 0]));
  const totalTypeUses = new Map(typeOrder.map((type) => [type, 0]));
  const orderedPairs = [...placedPairs].sort((left, right) => {
    const leftAccessible = left.tiles.filter((tile) => {
      const state = coverage.get(tile.uid);
      return !state?.covered && !state?.sideBlocked;
    }).length;
    const rightAccessible = right.tiles.filter((tile) => {
      const state = coverage.get(tile.uid);
      return !state?.covered && !state?.sideBlocked;
    }).length;
    return (
      right.layer - left.layer
      || rightAccessible - leftAccessible
      || left.tiles[0].uid.localeCompare(right.tiles[0].uid)
    );
  });
  for (const pair of orderedPairs) {
    const accessibleCount = pair.tiles.filter((tile) => {
      const state = coverage.get(tile.uid);
      return !state?.covered && !state?.sideBlocked;
    }).length;
    const type = [...typeOrder].sort((left, right) => {
      const leftAccessibleUses = accessibleTypeUses.get(left) ?? 0;
      const rightAccessibleUses = accessibleTypeUses.get(right) ?? 0;
      const leftNewPairs =
        Math.floor((leftAccessibleUses + accessibleCount) / 2)
        - Math.floor(leftAccessibleUses / 2);
      const rightNewPairs =
        Math.floor((rightAccessibleUses + accessibleCount) / 2)
        - Math.floor(rightAccessibleUses / 2);
      return (
        leftNewPairs - rightNewPairs
        || (totalTypeUses.get(left) ?? 0) - (totalTypeUses.get(right) ?? 0)
        || leftAccessibleUses - rightAccessibleUses
        || typeOrder.indexOf(left) - typeOrder.indexOf(right)
      );
    })[0];
    for (const tile of pair.tiles) tile.type = type;
    accessibleTypeUses.set(
      type,
      (accessibleTypeUses.get(type) ?? 0) + accessibleCount,
    );
    totalTypeUses.set(type, (totalTypeUses.get(type) ?? 0) + 2);
  }
  return {
    tiles: placedTiles.sort((left, right) =>
      left.layer - right.layer || left.y - right.y || left.x - right.x),
    towerCenters,
  };
}

const CANONICAL_LAYER_RHYTHM = Object.freeze([
  1.05, 0.82, 1.24, 0.78, 1.12,
  1.46, 0.9, 1.3, 0.76, 1.18,
  0.62, 0.56, 0.42, 0.3, 0.22,
]);

function selectReferenceProfile(learned, tileCount, layerCount, rng) {
  const profiles = learned.referenceProfiles ?? [];
  if (!profiles.length) return null;
  const ranked = profiles
    .map((profile) => ({
      profile,
      score:
        Math.abs((Number(profile.tileCount) || 0) - tileCount)
          / Math.max(1, tileCount)
        + Math.abs((Number(profile.layerCount) || 0) - layerCount)
          / Math.max(1, layerCount),
    }))
    .sort((left, right) =>
      left.score - right.score
      || left.profile.sampleIndex - right.profile.sampleIndex);
  const candidateCount = Math.min(
    ranked.length,
    ranked.length > 3 ? 3 : 1,
  );
  return ranked[rng.nextInt(0, candidateCount)].profile;
}

function resampleLayerWeights(sourceCounts, layerCount) {
  const source = (Array.isArray(sourceCounts) ? sourceCounts : [])
    .map((value) => Math.max(1, Number(value) || 1));
  const weights = Array.from({ length: layerCount }, (_, index) => {
    if (!source.length) {
      return CANONICAL_LAYER_RHYTHM[index % CANONICAL_LAYER_RHYTHM.length];
    }
    const sourcePosition = layerCount > 1
      ? index * (source.length - 1) / (layerCount - 1)
      : 0;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(source.length - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    return (
      source[lowerIndex] * (1 - fraction)
      + source[upperIndex] * fraction
    );
  });
  const range = Math.max(...weights) - Math.min(...weights);
  if (range < 4) {
    return weights.map((weight, index) =>
      weight * CANONICAL_LAYER_RHYTHM[index % CANONICAL_LAYER_RHYTHM.length]);
  }
  return weights;
}

function allocateLayerTileCounts({
  sourceCounts,
  layerCount,
  tileCount,
  blindDepth,
}) {
  const weights = resampleLayerWeights(sourceCounts, layerCount);
  const counts = weights.map((_, index) => index < blindDepth ? 2 : 1);
  let remaining = tileCount - counts.reduce((total, count) => total + count, 0);
  if (remaining < 0) {
    throw new Error("砖块数量不足以保留每个有效层和盲盒平铺栈。");
  }
  const weightTotal = weights.reduce((total, value) => total + value, 0);
  const exact = weights.map((weight) =>
    weightTotal ? remaining * weight / weightTotal : remaining / layerCount);
  const fractions = [];
  for (let index = 0; index < counts.length; index += 1) {
    const addition = Math.floor(exact[index]);
    counts[index] += addition;
    remaining -= addition;
    fractions.push({
      index,
      fraction: exact[index] - addition,
    });
  }
  fractions.sort((left, right) =>
    right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (remaining > 0) {
    const candidate = fractions[cursor % fractions.length].index;
    if (counts[candidate] < 28) {
      counts[candidate] += 1;
      remaining -= 1;
    }
    cursor += 1;
    if (cursor > fractions.length * 64) {
      throw new Error("目标砖块数量超过模板塔群的单层容量。");
    }
  }
  if (counts.every((count) => count % 2 === 0) && counts.length > 1) {
    const donor = counts.findIndex((count) => count > 2);
    const recipient = counts.findIndex((_, index) => index !== donor);
    if (donor >= 0 && recipient >= 0) {
      counts[donor] -= 1;
      counts[recipient] += 1;
    }
  }
  return counts;
}

function transformTemplateAnchor(
  anchor,
  board,
  transform,
  layerIndex,
  phaseSpan,
) {
  const maxX = board.width * TILE_SIZE - TILE_SIZE;
  const maxY = board.height * TILE_SIZE - TILE_SIZE;
  let x = Math.round((Number(anchor.normalizedX) || 0) * maxX);
  let y = Math.round((Number(anchor.normalizedY) || 0) * maxY);
  if (transform.mirrorX) x = maxX - x;
  if (transform.mirrorY) y = maxY - y;
  const shiftX = (layerIndex * 3) % TILE_SIZE;
  const shiftY = (layerIndex * 5) % TILE_SIZE;
  const phase = Math.floor(layerIndex / phaseSpan);
  const macroX = [0, 12, -12, 20, -20][phase % 5];
  const macroY = [0, -12, 12, 20, -20][phase % 5];
  x += transform.mirrorX ? -shiftX : shiftX;
  y += transform.mirrorY ? -shiftY : shiftY;
  x += transform.mirrorX ? -macroX : macroX;
  y += transform.mirrorY ? -macroY : macroY;
  const wrap = (value, maximum) => {
    const span = maximum + 1;
    return ((value % span) + span) % span;
  };
  return {
    x: wrap(x, maxX),
    y: wrap(y, maxY),
  };
}

function canPlaceAnchor(anchor, selected) {
  return selected.every((placed) => !overlaps(anchor, placed));
}

function chooseSpreadSubset(anchors, count, rng) {
  if (anchors.length <= count) return anchors;
  const remaining = [...anchors];
  const selected = [
    remaining.splice(rng.nextInt(0, remaining.length), 1)[0],
  ];
  while (selected.length < count && remaining.length) {
    const ranked = remaining
      .map((anchor, index) => ({
        anchor,
        index,
        distance: Math.min(
          ...selected.map((placed) =>
            Math.hypot(anchor.x - placed.x, anchor.y - placed.y)),
        ),
        jitter: rng.nextUint32() / 0xffffffff,
      }))
      .sort((left, right) =>
        right.distance - left.distance || right.jitter - left.jitter);
    selected.push(ranked[0].anchor);
    remaining.splice(ranked[0].index, 1);
  }
  return selected;
}

function nearestLayerTemplate(profile, normalizedDepth, desiredCount) {
  const templates = profile?.layerTemplates ?? [];
  return [...templates].sort((left, right) =>
    (
      Math.abs((Number(left.normalizedDepth) || 0) - normalizedDepth) * 20
      + Math.abs((Number(left.tileCount) || 0) - desiredCount)
    )
    - (
      Math.abs((Number(right.normalizedDepth) || 0) - normalizedDepth) * 20
      + Math.abs((Number(right.tileCount) || 0) - desiredCount)
    )
    || left.layer - right.layer)[0] ?? null;
}

function blindAnchorsForLayer(layerIndex, blindDepth, board) {
  if (layerIndex >= blindDepth) return [];
  const maxX = board.width * TILE_SIZE - TILE_SIZE;
  const maxY = board.height * TILE_SIZE - TILE_SIZE;
  const progress = blindDepth > 1
    ? Math.round(layerIndex * Math.min(16, maxX / 3) / (blindDepth - 1))
    : 0;
  return [
    {
      x: progress,
      y: maxY - 4,
      blind: true,
      blindTop: layerIndex === blindDepth - 1,
    },
    {
      x: maxX - progress,
      y: maxY - 4,
      blind: true,
      blindTop: layerIndex === blindDepth - 1,
    },
  ];
}

function buildFallbackAnchorPool({
  board,
  layer,
  layerPlan,
  towerCenters,
  profile,
  rng,
}) {
  const offset = (layer - 1) % TILE_SIZE;
  const activeCenters = activeCentersForLayer(
    towerCenters,
    layerPlan,
    profile,
  );
  const anchors = [];
  for (
    let x = offset;
    x <= board.width * TILE_SIZE - TILE_SIZE;
    x += TILE_SIZE
  ) {
    for (
      let y = offset;
      y <= board.height * TILE_SIZE - TILE_SIZE;
      y += TILE_SIZE
    ) {
      const nearest = nearestTower({ x, y }, activeCenters, board);
      anchors.push({
        x,
        y,
        score:
          nearest.distance * 100
          + ((Math.round(x / TILE_SIZE) + Math.round(y / TILE_SIZE)) % 2) * 4
          + rng.nextUint32() / 0xffffffff,
      });
    }
  }
  return anchors.sort((left, right) => left.score - right.score);
}

function buildTiles({
  board,
  learned,
  pairCounts,
  layerPlans,
  layout,
  rng,
  profile,
}) {
  const tileCount = pairCounts.reduce((total, value) => total + value, 0) * 2;
  const layerCount = pairCounts.length;
  const selectedProfile = selectReferenceProfile(
    learned,
    tileCount,
    layerCount,
    rng,
  );
  const learnedBlindDepth = Math.max(
    0,
    ...(selectedProfile?.blindStacks ?? []).map(({ depth }) => Number(depth) || 0),
  );
  const blindDepth = Math.min(
    layerCount,
    Math.max(
      difficultyBlindDepth(profile, layerCount),
      Math.min(layerCount, learnedBlindDepth),
    ),
  );
  const layerTileCounts = allocateLayerTileCounts({
    sourceCounts: selectedProfile?.layerTileCounts,
    layerCount,
    tileCount,
    blindDepth,
  });
  const towerCenters = planTowerCenters({
    learned,
    profile,
    layout,
    rng,
  });
  const transform = {
    mirrorX: Boolean(rng.nextUint32() & 1),
    mirrorY: Boolean(rng.nextUint32() & 1),
  };
  const phaseSpan = profile.defaultTargetScore >= 80
    ? 8
    : profile.defaultTargetScore >= 60
      ? 4
      : 2;
  const tiles = [];
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const layer = layerIndex + 1;
    const desiredCount = layerTileCounts[layerIndex];
    const normalizedDepth = layerCount > 1
      ? layerIndex / (layerCount - 1)
      : 0;
    const template = nearestLayerTemplate(
      selectedProfile,
      normalizedDepth,
      desiredCount,
    );
    const selected = blindAnchorsForLayer(
      layerIndex,
      blindDepth,
      board,
    );
    const transformedTemplate = (template?.anchors ?? [])
      .map((anchor) =>
        transformTemplateAnchor(
          anchor,
          board,
          transform,
          layerIndex,
          phaseSpan,
        ))
      .filter((anchor, index, values) =>
        values.findIndex((candidate) =>
          candidate.x === anchor.x && candidate.y === anchor.y) === index)
      .filter((anchor) => canPlaceAnchor(anchor, selected));
    const sparseReference =
      Number(selectedProfile?.tileCount) < 80
      || Number(selectedProfile?.layerCount) < 5;
    const templateTarget = sparseReference
      ? 0
      : Math.max(0, desiredCount - selected.length);
    const templateAnchors = chooseSpreadSubset(
      transformedTemplate,
      Math.min(templateTarget, transformedTemplate.length),
      rng,
    );
    for (const anchor of templateAnchors) {
      if (canPlaceAnchor(anchor, selected)) selected.push(anchor);
    }
    const fallbackPool = buildFallbackAnchorPool({
      board,
      layer,
      layerPlan: layerPlans[layerIndex],
      towerCenters,
      profile,
      rng,
    });
    for (const anchor of fallbackPool) {
      if (selected.length >= desiredCount) break;
      if (!canPlaceAnchor(anchor, selected)) continue;
      if (
        maximumFlatComponentSize([...selected, anchor]) > 20
      ) {
        continue;
      }
      selected.push(anchor);
    }
    if (selected.length !== desiredCount) {
      throw new Error(
        `第 ${layer} 层模板轮廓只能安全放置 ${selected.length}/${desiredCount} 张砖块。`,
      );
    }
    selected.forEach((anchor, index) => {
      tiles.push({
        uid: `ai-${layer}-${index + 1}`,
        x: anchor.x,
        y: anchor.y,
        layer,
        type: -1,
        moldType: anchor.blindTop ? 2 : 1,
        metaType: 0,
        metaData: 0,
        presetColorType: anchor.blind && !anchor.blindTop ? 3 : 1,
      });
    });
  }
  return {
    tiles: tiles.sort((left, right) =>
      left.layer - right.layer || left.y - right.y || left.x - right.x),
    towerCenters,
    layerTileCounts,
    templateSampleIndex: selectedProfile?.sampleIndex ?? null,
    blindBoxStackCount: blindDepth ? 2 : 0,
    blindBoxStackDepth: blindDepth,
  };
}

function difficultyBlindDepth(profile, layerCount) {
  if (profile.defaultTargetScore >= 80) {
    return Math.min(layerCount, Math.max(8, Math.round(layerCount * 0.58)));
  }
  if (profile.defaultTargetScore >= 60) {
    return Math.min(layerCount, Math.max(6, Math.round(layerCount * 0.5)));
  }
  return Math.min(layerCount, Math.max(4, Math.round(layerCount * 0.38)));
}

function buildTowerPairLayers({
  board,
  learned,
  pairCounts,
  layerPlans,
  layout,
  rng,
  profile,
  towerCenters,
}) {
  const pairsByLayer = Array.from({ length: pairCounts.length }, () => []);
  const pools = pairCounts.map((_, layerIndex) =>
    buildPairPool({
      board,
      learned,
      layout,
      rng,
      layer: layerIndex + 1,
      layerPlan: layerPlans[layerIndex],
      towerCenters,
      profile,
    }));
  const placedTiles = [];
  const occupiedAnchors = new Map();
  for (let layerIndex = pairCounts.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = layerIndex + 1;
    const immediateUpperTiles = layerIndex === pairCounts.length - 1
      ? []
      : pairsByLayer[layerIndex + 1]
        .flatMap(({ left, right }) => [left, right]);
    const pairs = chooseLayerPairs({
      count: pairCounts[layerIndex],
      layer,
      pool: pools[layerIndex],
      layout,
      placedTiles,
      immediateUpperTiles,
      occupiedAnchors,
      stageKey: layerPlans[layerIndex].key,
      coverageScale: profile.minInitialPairs >= 8 ? 0.55 : 1,
      anchorReuseLimit: profile.maxExactStackDepth,
    });
    pairsByLayer[layerIndex] = pairs;
    for (const pair of pairs) {
      placedTiles.push(pair.left, pair.right);
    }
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
  attempt = 0,
}) {
  const rng = XorShift.fromSeed(seed);
  const reference = references[rng.nextInt(0, references.length)];
  const tileCount = target.tileCount;
  const layerCount = target.layerCount;
  const fullRandomTypeMax = {
    easy: 6,
    normal: 15,
    hard: 32,
  }[difficulty];
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
    ...AI_BOARD,
    scale: Number.isFinite(learned.board.scale) ? learned.board.scale : 1,
  };
  const generatedGeometry = buildTemplateMotifGeometry({
    learned,
    target: { tileCount, layerCount },
    layout,
    seed,
    attempt,
  });
  const tiles = generatedGeometry.tiles;
  const unsignedSeed = seed >>> 0;
  const id = -((unsignedSeed % 900000) + 100000);
  const name =
    `AI ${DIFFICULTY_LABELS[difficulty].label} · ${LAYOUTS[layout].label}`;
  const original = {
    ...(clone(reference.original) ?? {}),
    id,
    name,
    difficulty: DIFFICULTY_LABELS[difficulty].value,
    gridUnit: AI_GRID_UNIT,
    tiles: [],
    stacks: [],
  };
  const designerNote = {
    ...(clone(reference.designerNote) ?? {}),
    widthNum: board.width,
    heightNum: board.height,
    levelKey: id,
    gameLevelOrder: 2,
    cdNum: 0,
    showLayerNum: true,
    boardScale: board.scale,
    blockTypeCount: fullRandomTypeMax,
    fullRandomTypeMin: 1,
    fullRandomTypeMax,
    blockTypeData: {},
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
      towerPlan: {
        towerCount: profile.towerCount,
        highTowerCount: profile.highTowerCount,
        centers: generatedGeometry.towerCenters ?? learned.towerCenters,
      },
      templateLearning: {
        sampleIndex: generatedGeometry.sourceProfile?.sampleIndex ?? null,
        sourceFileName: generatedGeometry.sourceProfile?.sourceFileName ?? "",
        sourceLayerMap: generatedGeometry.sourceLayerMap,
        preservedAnchorRatio: generatedGeometry.preservedAnchorRatio,
        fillTrackCount: generatedGeometry.fillTracks.length,
        fillTracks: generatedGeometry.fillTracks,
        layerTileCounts: generatedGeometry.layerTileCounts,
        layerCapacities: generatedGeometry.layerCapacities,
        blindBoxStackCount: generatedGeometry.fillTracks.length,
        blindBoxStackDepth: Math.max(
          0,
          ...generatedGeometry.fillTracks.map(({ depth }) => depth),
        ),
        fullRandomRatio: 1,
        similarity: {
          sourceLayerOrderPreserved:
            generatedGeometry.sourceLayerMap.every((layer, index) =>
              index === 0 || layer >= generatedGeometry.sourceLayerMap[index - 1]),
          fillTrackCountMatched:
            generatedGeometry.fillTracks.length
            === (
              generatedGeometry.sourceProfile?.fillTracks
              ?? generatedGeometry.sourceProfile?.blindStacks
              ?? []
            ).length,
          capacitySafe:
            generatedGeometry.layerTileCounts.every((count, index) =>
              count <= generatedGeometry.layerCapacities[index]),
        },
      },
      referenceCount: references.length,
      learned: {
        sampleCount: learned.sampleCount,
        symmetryScore: learned.symmetryScore,
        overlapRatio: learned.overlapRatio,
        boundaryRatio: learned.boundaryRatio,
        initialPairDistance: learned.initialPairDistance,
        towerCenters: learned.towerCenters,
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
      blockTypeCount: fullRandomTypeMax,
      fullTypeMin: 1,
      fullTypeMax: fullRandomTypeMax,
    },
    gameplay: {
      levelKey: id,
      gameLevelOrder: 2,
      cdNum: 0,
      showLayerNum: true,
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
    difficulty,
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
  let lastRejection = "";

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
        attempt: attempt - 1,
      });
    } catch (error) {
      lastBuildError = error;
      continue;
    }
    const statistics = extractLevelStatistics(document);
    const errors = validateLevel(document, { rejectSameLayerOverlap: true })
      .filter(({ severity }) => severity === "error");
    const structureIssues = generatedStructureIssues(
      statistics,
      profile,
      target.layerCount,
    );
    if (errors.length || structureIssues.length) {
      lastRejection = [
        ...errors.map(({ message }) => message),
        ...structureIssues,
      ].join("、");
      continue;
    }
    const report = solveLevel(document);
    if (!report.solvable) {
      lastRejection = "求解器未找到完整消除路径";
      continue;
    }

    const difficultyTiles = assignRandomTypes(document.tiles, {
      seed: attemptSeed,
      ...(document.random ?? {}),
      isSolvable: (candidate) => solveLevel({ tiles: candidate }).solvable,
      solvableMoves: report.moves,
      maxRandomAttempts: 1,
    });
    const difficultyDocument = {
      ...document,
      tiles: difficultyTiles,
    };
    const difficultySolverReport = solveLevel(difficultyDocument);
    const difficultyReport = scoreLevelDifficulty(difficultyDocument, {
      solverReport: difficultySolverReport,
    });
    if (!difficultyReport.valid) {
      lastRejection = "难度评分门禁未通过";
      continue;
    }
    document.designerNote.aiGeneration.solver = {
      solvable: true,
      steps: report.steps,
      nodes: report.nodes,
      initialAccessiblePairs: report.initialAccessiblePairs,
      maxDependencyDepth: statistics.maxDependencyDepth,
      recommendedPlaySeed: attemptSeed >>> 0,
    };
    document.designerNote.aiGeneration.difficulty = {
      targetScore: target.score,
      actualScore: difficultyReport.score,
      rating: difficultyReport.rating,
      dimensions: difficultyReport.dimensions,
      confidence: difficultyReport.confidence,
      reasons: difficultyReport.reasons,
    };
    document.designerNote.aiGeneration.structure = {
      towerCount: statistics.towerCount,
      highTowerCount: profile.highTowerCount,
      platformComponentCount: statistics.platformComponentCount,
      largestFlatPlatformSize: statistics.largestFlatPlatformSize,
      boundaryRatio: statistics.boundaryRatio,
      releaseDependencyDrop: statistics.releaseDependencyDrop,
      stagePressure: statistics.stagePressure,
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
  if (lastRejection) {
    throw new Error(`在当前约束内未找到可解关卡：${lastRejection}。`);
  }
  throw new Error("在当前约束内未找到可解关卡，请重试或降低难度。");
}
