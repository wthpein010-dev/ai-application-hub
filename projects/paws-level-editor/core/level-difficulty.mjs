import { computeCoverage } from "./coverage.mjs";
import { extractLevelStatistics } from "./level-statistics.mjs";
import { solveLevel } from "./level-solver.mjs";

const TILE_SIZE = 8;

export const DIFFICULTY_DIMENSION_WEIGHTS = Object.freeze({
  structure: 0.2,
  information: 0.15,
  choice: 0.2,
  route: 0.35,
  endurance: 0.1,
});

const DIMENSION_LABELS = Object.freeze({
  structure: "结构压力",
  information: "信息压力",
  choice: "选择压力",
  route: "路线风险",
  endurance: "耐力压力",
});

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function interpolate(value, points) {
  const ordered = [...points].sort((left, right) => left[0] - right[0]);
  if (value <= ordered[0][0]) return ordered[0][1];
  for (let index = 1; index < ordered.length; index += 1) {
    const [rightValue, rightScore] = ordered[index];
    const [leftValue, leftScore] = ordered[index - 1];
    if (value > rightValue) continue;
    const span = Math.max(Number.EPSILON, rightValue - leftValue);
    const ratio = (value - leftValue) / span;
    return leftScore + (rightScore - leftScore) * ratio;
  }
  return ordered.at(-1)[1];
}

function weightedScore(metrics) {
  const usable = metrics.filter(({ value }) => Number.isFinite(value));
  const totalWeight = usable.reduce((total, { weight }) => total + weight, 0);
  if (!totalWeight) return 0;
  return Math.round(clamp(usable.reduce(
    (total, { value, weight }) => total + value * weight,
    0,
  ) / totalWeight));
}

function accessibleTiles(tiles) {
  const coverage = computeCoverage(tiles);
  return tiles.filter((tile) => {
    const state = coverage.get(tile.uid);
    return !state?.covered && !state?.sideBlocked;
  });
}

function pairCount(tiles) {
  const counts = new Map();
  for (const tile of tiles) {
    counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
  }
  return [...counts.values()]
    .reduce((total, count) => total + Math.floor(count / 2), 0);
}

function median(values, fallback = 0) {
  if (!values.length) return fallback;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function trajectoryMetrics(document, solver) {
  const source = (Array.isArray(document?.tiles) ? document.tiles : [])
    .map((tile, index) => ({
      ...tile,
      uid: tile.uid || `difficulty-tile-${index + 1}`,
    }));
  if (!solver.solvable || !solver.moves.length) {
    return {
      effectiveFlipRate: 0,
      medianPartnerWait: source.length ? source.length / 2 : 0,
      meanActiveTypes: 0,
      meanPairCount: 0,
      minimumPairCount: 0,
      onePairStageRatio: 1,
      lowPairStageRatio: 1,
      longestLowPairRatio: 1,
      toleranceSteps: 0,
      crossPairDistance: 0,
      searchRatio: solver.steps ? solver.nodes / solver.steps : solver.nodes,
    };
  }

  const moveIndexByUid = new Map();
  solver.moves.forEach((uids, index) => {
    uids.forEach((uid) => moveIndexByUid.set(uid, index));
  });
  const boardWidth = Math.max(1, Number(document?.board?.width) || 8);
  const boardHeight = Math.max(1, Number(document?.board?.height) || 10);
  const diagonal = Math.hypot(
    boardWidth * TILE_SIZE - TILE_SIZE,
    boardHeight * TILE_SIZE - TILE_SIZE,
  );
  const pairs = [];
  const activeTypes = [];
  const partnerWaits = [];
  const pairDistances = [];
  let active = source;
  let effectiveFlips = 0;
  let revealedTiles = 0;
  let longestLowRun = 0;
  let lowRun = 0;

  for (let step = 0; step < solver.moves.length; step += 1) {
    const before = accessibleTiles(active);
    const currentPairs = pairCount(before);
    pairs.push(currentPairs);
    activeTypes.push(new Set(before.map(({ type }) => type)).size);
    if (currentPairs <= 2) {
      lowRun += 1;
      longestLowRun = Math.max(longestLowRun, lowRun);
    } else {
      lowRun = 0;
    }
    for (const tile of before) {
      const moveIndex = moveIndexByUid.get(tile.uid);
      if (Number.isInteger(moveIndex) && moveIndex >= step) {
        partnerWaits.push(moveIndex - step);
      }
    }

    const move = new Set(solver.moves[step]);
    const selected = active.filter(({ uid }) => move.has(uid));
    if (selected.length === 2) {
      pairDistances.push(Math.hypot(
        selected[0].x - selected[1].x,
        selected[0].y - selected[1].y,
      ) / Math.max(1, diagonal));
    }
    const beforeUids = new Set(before.map(({ uid }) => uid));
    active = active.filter(({ uid }) => !move.has(uid));
    const after = accessibleTiles(active);
    const countsAfter = new Map();
    for (const tile of after) {
      countsAfter.set(tile.type, (countsAfter.get(tile.type) ?? 0) + 1);
    }
    const revealed = after.filter(({ uid }) => !beforeUids.has(uid));
    revealedTiles += revealed.length;
    effectiveFlips += revealed.filter((tile) => {
      if ((countsAfter.get(tile.type) ?? 0) >= 2) return true;
      const futureMove = moveIndexByUid.get(tile.uid);
      return Number.isInteger(futureMove) && futureMove - step <= 3;
    }).length;
  }

  const totalStages = Math.max(1, pairs.length);
  return {
    effectiveFlipRate: revealedTiles ? effectiveFlips / revealedTiles : 1,
    medianPartnerWait: median(partnerWaits),
    meanActiveTypes: activeTypes.reduce((total, value) => total + value, 0) / totalStages,
    meanPairCount: pairs.reduce((total, value) => total + value, 0) / totalStages,
    minimumPairCount: Math.min(...pairs),
    onePairStageRatio: pairs.filter((value) => value <= 1).length / totalStages,
    lowPairStageRatio: pairs.filter((value) => value <= 2).length / totalStages,
    longestLowPairRatio: longestLowRun / totalStages,
    toleranceSteps: Math.max(0, Math.round(median(pairs.map((value) => value - 1)))),
    crossPairDistance: pairDistances.length
      ? pairDistances.reduce((total, value) => total + value, 0) / pairDistances.length
      : 0,
    searchRatio: solver.nodes / Math.max(1, solver.steps),
  };
}

export function rateDifficultyScore(score) {
  const value = clamp(score);
  if (value <= 39) return { key: "relaxed", label: "教学 / 轻松" };
  if (value <= 59) return { key: "standard", label: "标准" };
  if (value <= 69) return { key: "hard-intro", label: "困难入门" };
  if (value <= 79) return { key: "hard", label: "困难" };
  if (value <= 89) return { key: "extreme", label: "极难挑战" };
  return { key: "expert", label: "专家挑战" };
}

export function scoreLevelDifficulty(document, {
  maxNodes = 50000,
  solverReport = null,
} = {}) {
  const statistics = extractLevelStatistics(document);
  const solver = solverReport ?? solveLevel(document, { maxNodes });
  const trajectory = trajectoryMetrics(document, solver);

  const structure = weightedScore([
    { weight: 0.25, value: interpolate(statistics.maxDependencyDepth, [[0, 0], [3, 20], [5, 50], [8, 70], [9, 90], [20, 100]]) },
    { weight: 0.2, value: interpolate(statistics.initialOpenRate, [[0, 100], [0.18, 90], [0.3, 70], [0.45, 45], [0.65, 20], [1, 0]]) },
    { weight: 0.2, value: interpolate(statistics.averageBlockers, [[0, 0], [0.8, 20], [1.3, 50], [2, 70], [2.5, 90], [4, 100]]) },
    { weight: 0.2, value: interpolate(statistics.bottleneckConcentration, [[0, 0], [0.2, 20], [0.3, 50], [0.45, 70], [0.6, 90], [1, 100]]) },
    { weight: 0.15, value: interpolate(statistics.effectiveLayerCount, [[0, 0], [5, 20], [8, 50], [12, 70], [13, 85], [32, 100]]) },
  ]);
  const information = weightedScore([
    { weight: 0.4, value: interpolate(statistics.maxDependencyDepth, [[0, 0], [3, 20], [5, 50], [8, 70], [15, 90], [30, 100]]) },
    { weight: 0.25, value: interpolate(trajectory.effectiveFlipRate, [[0, 100], [0.35, 85], [0.5, 65], [0.65, 35], [0.8, 15], [1, 0]]) },
    { weight: 0.15, value: interpolate(trajectory.medianPartnerWait, [[0, 0], [2, 20], [4, 50], [7, 70], [8, 90], [16, 100]]) },
    { weight: 0.1, value: interpolate(trajectory.meanActiveTypes, [[0, 0], [4, 20], [7, 50], [10, 70], [11, 90], [20, 100]]) },
    { weight: 0.1, value: interpolate(statistics.initialOpenPairRate, [[0, 100], [0.2, 90], [0.35, 70], [0.5, 50], [0.65, 25], [1, 0]]) },
  ]);
  const choice = weightedScore([
    { weight: 0.35, value: interpolate(statistics.initialAccessiblePairs, [[0, 100], [1, 90], [2, 70], [3, 55], [5, 25], [8, 0]]) },
    { weight: 0.3, value: interpolate(statistics.maxDependencyDepth, [[0, 0], [3, 20], [5, 50], [8, 70], [15, 90], [30, 100]]) },
    { weight: 0.2, value: interpolate(trajectory.lowPairStageRatio, [[0, 0], [0.15, 20], [0.3, 50], [0.5, 70], [0.7, 90], [1, 100]]) },
    { weight: 0.15, value: interpolate(trajectory.crossPairDistance, [[0, 0], [0.2, 20], [0.35, 50], [0.55, 70], [0.7, 90], [1, 100]]) },
  ]);
  const route = weightedScore([
    { weight: 0.4, value: interpolate(statistics.initialAccessiblePairs, [[0, 100], [1, 90], [2, 70], [3, 55], [5, 25], [8, 0]]) },
    { weight: 0.4, value: interpolate(statistics.maxDependencyDepth, [[0, 0], [3, 20], [5, 50], [8, 70], [15, 90], [30, 100]]) },
    { weight: 0.15, value: interpolate(trajectory.lowPairStageRatio, [[0, 0], [0.15, 20], [0.3, 50], [0.5, 70], [0.7, 90], [1, 100]]) },
    { weight: 0.05, value: interpolate(trajectory.toleranceSteps, [[0, 100], [1, 90], [2, 70], [3, 50], [4, 20], [8, 0]]) },
  ]);
  const endurance = weightedScore([
    { weight: 0.3, value: interpolate(statistics.tileCount / 2, [[0, 0], [60, 20], [90, 50], [130, 70], [180, 90], [220, 100]]) },
    { weight: 0.25, value: interpolate(statistics.tileCount, [[0, 0], [96, 20], [150, 50], [210, 70], [280, 90], [400, 100]]) },
    { weight: 0.2, value: interpolate(trajectory.crossPairDistance, [[0, 0], [0.2, 20], [0.35, 50], [0.5, 70], [0.65, 90], [1, 100]]) },
    { weight: 0.25, value: interpolate(trajectory.longestLowPairRatio, [[0, 0], [0.1, 20], [0.25, 50], [0.45, 70], [0.65, 90], [1, 100]]) },
  ]);

  const dimensions = { structure, information, choice, route, endurance };
  const score = Math.round(Object.entries(DIFFICULTY_DIMENSION_WEIGHTS)
    .reduce((total, [key, weight]) => total + dimensions[key] * weight, 0));
  const releaseGate = solver.exhausted
    ? "review"
    : solver.solvable
      ? "pass"
      : "blocked";
  const valid = releaseGate === "pass";
  const reasons = Object.entries(dimensions)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, value]) => `${DIMENSION_LABELS[key]} ${value}`);

  return {
    valid,
    releaseGate,
    gateReason: releaseGate === "blocked"
      ? "确定性求解未找到可解路线，不可解关卡禁止发布。"
      : releaseGate === "review"
        ? "求解达到节点上限，需要提高预算后复核。"
        : "合法性与可解性快速门禁通过。",
    score,
    rating: rateDifficultyScore(score),
    dimensions,
    confidence: solver.exhausted ? 60 : 90,
    reasons,
    metrics: {
      ...trajectory,
      initialOpenRate: statistics.initialOpenRate,
      initialOpenPairRate: statistics.initialOpenPairRate,
      averageBlockers: statistics.averageBlockers,
      bottleneckConcentration: statistics.bottleneckConcentration,
      effectiveLayerCount: statistics.effectiveLayerCount,
      maxDependencyDepth: statistics.maxDependencyDepth,
      tileCount: statistics.tileCount,
    },
    statistics,
    solver,
  };
}
