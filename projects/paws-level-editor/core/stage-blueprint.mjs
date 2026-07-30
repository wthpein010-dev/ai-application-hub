import { XorShift } from "./xorshift.mjs";

const STAGES = Object.freeze([
  Object.freeze({
    key: "surface",
    label: "表层塔群",
    layerWeight: 3,
    tileWeight: 22,
  }),
  Object.freeze({
    key: "shelter",
    label: "薄掩体",
    layerWeight: 2,
    tileWeight: 15,
  }),
  Object.freeze({
    key: "middle",
    label: "中层塔群",
    layerWeight: 5,
    tileWeight: 34,
  }),
  Object.freeze({
    key: "crisis",
    label: "深层卡点",
    layerWeight: 3,
    tileWeight: 20,
  }),
  Object.freeze({
    key: "release",
    label: "释放残局",
    layerWeight: 2,
    tileWeight: 9,
  }),
]);

const DIFFICULTY_FACTORS = Object.freeze({
  easy: 1.45,
  normal: 1.65,
  hard: 1.85,
});

const DEFAULT_TOWER_ENTRANCES = Object.freeze([
  Object.freeze({ x: 8, y: 8 }),
  Object.freeze({ x: 40, y: 10 }),
  Object.freeze({ x: 10, y: 46 }),
  Object.freeze({ x: 40, y: 46 }),
  Object.freeze({ x: 24, y: 28 }),
  Object.freeze({ x: 24, y: 6 }),
]);

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function apportion(total, weights, minimums) {
  const count = weights.length;
  const normalizedMinimums = Array.isArray(minimums)
    ? minimums.map((value) => Math.max(0, integer(value)))
    : Array(count).fill(Math.max(0, integer(minimums)));
  const minimumTotal = normalizedMinimums
    .reduce((sum, value) => sum + value, 0);
  if (total < minimumTotal) {
    throw new RangeError("总量不足以覆盖每个阶段的最小容量。");
  }
  const remaining = total - minimumTotal;
  if (!remaining) return normalizedMinimums;
  const weightTotal = weights.reduce(
    (sum, value) => sum + Math.max(0, Number(value) || 0),
    0,
  );
  const desiredResiduals = weights.map((weight, index) =>
    Math.max(
      0,
      total * Math.max(0, Number(weight) || 0) / weightTotal
        - normalizedMinimums[index],
    ));
  const residualTotal = desiredResiduals.reduce(
    (sum, value) => sum + value,
    0,
  );
  const exact = desiredResiduals.map((value, index) =>
    residualTotal
      ? value / residualTotal * remaining
      : Math.max(0, Number(weights[index]) || 0) / weightTotal * remaining);
  const result = normalizedMinimums.map((minimum, index) =>
    minimum + Math.floor(exact[index]));
  let unassigned = total - result.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value),
    }))
    .sort((left, right) =>
      right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (unassigned > 0) {
    result[order[cursor % order.length].index] += 1;
    cursor += 1;
    unassigned -= 1;
  }
  return result;
}

function stageLayerCounts(layerCount) {
  return apportion(
    layerCount,
    STAGES.map(({ layerWeight }) => layerWeight),
    Array(STAGES.length).fill(1),
  );
}

function stageTileCounts(tileCount, layers) {
  return apportion(
    tileCount,
    STAGES.map(({ tileWeight }) => tileWeight),
    layers,
  );
}

function capacityState({ difficulty, tileCount, layerCount }) {
  const normalizedTileCount = Math.max(0, integer(tileCount));
  const normalizedLayerCount = Math.max(0, integer(layerCount));
  if (normalizedLayerCount < STAGES.length) {
    return {
      supported: false,
      maxLayerTiles: 0,
      stageLayers: [],
      stageTiles: [],
    };
  }
  const maxLayerTiles = layerTileLimit({
    difficulty,
    tileCount: normalizedTileCount,
    layerCount: normalizedLayerCount,
  });
  let stageLayers;
  let stageTiles;
  try {
    stageLayers = stageLayerCounts(normalizedLayerCount);
    stageTiles = stageTileCounts(normalizedTileCount, stageLayers);
  } catch {
    return {
      supported: false,
      maxLayerTiles,
      stageLayers: [],
      stageTiles: [],
    };
  }
  const supported = stageTiles.every((count, index) =>
    count >= stageLayers[index]
    && count <= stageLayers[index] * maxLayerTiles);
  return {
    supported,
    maxLayerTiles,
    stageLayers,
    stageTiles,
  };
}

export function layerTileLimit({ tileCount, layerCount, difficulty }) {
  const factor = DIFFICULTY_FACTORS[difficulty];
  if (!factor) throw new RangeError("AI 难度无效。");
  const tiles = Math.max(0, Number(tileCount) || 0);
  const layers = Math.max(1, Number(layerCount) || 0);
  return Math.min(56, Math.max(10, Math.ceil(tiles / layers * factor)));
}

export function validateBlueprintCapacity({
  difficulty,
  tileCount,
  layerCount,
}) {
  const normalizedDifficulty = String(difficulty ?? "");
  if (!DIFFICULTY_FACTORS[normalizedDifficulty]) {
    throw new RangeError("AI 难度无效。");
  }
  const normalizedTileCount = Math.max(0, integer(tileCount));
  const normalizedLayerCount = Math.max(0, integer(layerCount));
  const current = capacityState({
    difficulty: normalizedDifficulty,
    tileCount: normalizedTileCount,
    layerCount: normalizedLayerCount,
  });
  let minimumLayers = null;
  for (let candidate = STAGES.length; candidate <= 40; candidate += 1) {
    if (capacityState({
      difficulty: normalizedDifficulty,
      tileCount: normalizedTileCount,
      layerCount: candidate,
    }).supported) {
      minimumLayers = candidate;
      break;
    }
  }
  let maxTiles = 0;
  for (let candidate = 20; candidate <= 400; candidate += 2) {
    if (capacityState({
      difficulty: normalizedDifficulty,
      tileCount: candidate,
      layerCount: normalizedLayerCount,
    }).supported) {
      maxTiles = candidate;
    }
  }
  const guidanceLayers = minimumLayers ?? 41;
  return {
    supported: current.supported,
    maxTiles,
    minimumLayers: guidanceLayers,
    maxLayerTiles: current.maxLayerTiles,
    message: current.supported
      ? `当前组合可生成；单层上限 ${current.maxLayerTiles} 张。`
      : `${normalizedTileCount} 张砖块至少需要 ${guidanceLayers} 个有效层；`
        + `当前 ${normalizedLayerCount} 层最多支持 ${maxTiles} 张。`,
  };
}

function buildStagePlan({ tileCount, layerCount, targetScore }) {
  const layers = stageLayerCounts(layerCount);
  const tiles = stageTileCounts(tileCount, layers);
  const pressures = [
    Math.round(Math.min(38, targetScore * 0.5)),
    Math.round(Math.min(55, targetScore * 0.7)),
    Math.round(Math.min(75, targetScore * 0.85)),
    Math.round(Math.min(95, targetScore + 5)),
    Math.round(Math.max(15, targetScore - 25)),
  ];
  let nextUpperLayer = layerCount;
  return STAGES.map((stage, index) => {
    const layerEnd = nextUpperLayer;
    const layerStart = layerEnd - layers[index] + 1;
    nextUpperLayer = layerStart - 1;
    return {
      key: stage.key,
      label: stage.label,
      layerCount: layers[index],
      tileCount: tiles[index],
      layerStart,
      layerEnd,
      pressureTarget: pressures[index],
    };
  });
}

function distributeLayerTiles(total, count, limit, rng) {
  const base = Math.floor(total / count);
  if (base > limit) {
    throw new RangeError("阶段平均砖块数超过单层容量。");
  }
  const result = Array(count).fill(base);
  const remainder = total - base * count;
  const order = rng.shuffle(Array.from({ length: count }, (_, index) => index));
  for (let index = 0; index < remainder; index += 1) {
    result[order[index]] += 1;
  }
  if (result.some((value) => value < 1 || value > limit)) {
    throw new RangeError("阶段逐层砖块分配超过容量。");
  }
  return result;
}

function buildLayerPlans(stagePlan, maxLayerTiles, rng) {
  const byStage = new Map(stagePlan.map((stage) => [
    stage.key,
    distributeLayerTiles(
      stage.tileCount,
      stage.layerCount,
      maxLayerTiles,
      rng,
    ),
  ]));
  const physical = [];
  for (const stage of [...stagePlan].reverse()) {
    const counts = byStage.get(stage.key);
    for (let index = 0; index < stage.layerCount; index += 1) {
      physical.push({
        layer: stage.layerStart + index,
        stageKey: stage.key,
        stageLabel: stage.label,
        stageLayerIndex: index,
        stageLayerCount: stage.layerCount,
        tileCount: counts[index],
        pressureTarget: stage.pressureTarget,
      });
    }
  }
  return physical;
}

function rankFamilies(structureCorpus, {
  tileCount,
  layerCount,
  layout,
}) {
  const families = Array.isArray(structureCorpus?.families)
    ? structureCorpus.families
    : [];
  return [...families]
    .map((family, index) => {
      const tileDistance =
        Math.abs(integer(family.tileCount) - tileCount) / Math.max(1, tileCount);
      const layerDistance =
        Math.abs(integer(family.layerCount) - layerCount)
        / Math.max(1, layerCount);
      const componentCounts = (family.layerRoles ?? [])
        .map(({ componentCount }) => integer(componentCount))
        .filter((value) => value > 0);
      const meanComponents = componentCounts.length
        ? componentCounts.reduce((sum, value) => sum + value, 0)
          / componentCounts.length
        : 3;
      const componentTarget = layout === "open" ? 3.5 : layout === "progressive" ? 2.5 : 3;
      return {
        family,
        index,
        distance:
          tileDistance * 0.45
          + layerDistance * 0.4
          + Math.abs(meanComponents - componentTarget) * 0.15,
      };
    })
    .sort((left, right) =>
      left.distance - right.distance
      || String(left.family.sourceFileName ?? "")
        .localeCompare(String(right.family.sourceFileName ?? "")))
    .map(({ family }) => family);
}

function towerRole(index) {
  if (index === 0) return "high";
  if (index === 1) return "medium";
  return "small";
}

function sourceTowerCenter(chain, fallback) {
  const x = Number(chain?.centroid?.x);
  const y = Number(chain?.centroid?.y);
  return {
    x: Number.isFinite(x) ? (Math.abs(x) <= 1 ? x * 48 : x) : fallback.x,
    y: Number.isFinite(y) ? (Math.abs(y) <= 1 ? y * 56 : y) : fallback.y,
  };
}

function planMixedTowerEntrances(selected, {
  difficulty,
  difficultyProfile,
  layerCount,
}, rng) {
  const desiredCount = clamp(
    integer(difficultyProfile?.towerCount, {
      easy: 4,
      normal: 5,
      hard: 6,
    }[difficulty]),
    4,
    6,
  );
  const sources = (selected?.towerChains ?? [])
    .filter(({ depth }) => integer(depth) > 0)
    .sort((left, right) =>
      integer(right.depth) - integer(left.depth)
      || Number(left.centroid?.y ?? 0) - Number(right.centroid?.y ?? 0)
      || Number(left.centroid?.x ?? 0) - Number(right.centroid?.x ?? 0));
  const mirrorX = Boolean(rng.nextUint32() & 1);
  const mirrorY = Boolean(rng.nextUint32() & 1);
  return Array.from({ length: desiredCount }, (_, index) => {
    const fallback = DEFAULT_TOWER_ENTRANCES[index];
    const source = sourceTowerCenter(sources[index % Math.max(1, sources.length)], fallback);
    const transformedX = mirrorX ? 48 - source.x : source.x;
    const transformedY = mirrorY ? 56 - source.y : source.y;
    const role = towerRole(index);
    const targetDepth = role === "high"
      ? Math.max(6, Math.ceil(layerCount * 0.8))
      : role === "medium"
        ? Math.max(4, Math.ceil(layerCount * 0.55))
        : Math.max(3, Math.ceil(layerCount * 0.3));
    return {
      id: `tower-${index + 1}`,
      role,
      x: clamp(Math.round(transformedX) + rng.nextInt(-2, 3), 0, 48),
      y: clamp(Math.round(transformedY) + rng.nextInt(-2, 3), 0, 56),
      layerStart: 1,
      layerEnd: Math.min(layerCount, targetDepth),
      depth: Math.min(layerCount, targetDepth),
      sourceDepth: integer(sources[index % Math.max(1, sources.length)]?.depth),
    };
  });
}

function planFillTracks(selected) {
  const sourceTracks = Array.isArray(selected?.fillTracks)
    ? selected.fillTracks
    : [];
  const trackCount = [0, 2, 4].includes(sourceTracks.length)
    ? sourceTracks.length
    : 0;
  return {
    trackCount,
    tracks: structuredClone(sourceTracks.slice(0, trackCount)),
  };
}

export function buildStageBlueprint(options) {
  const gate = validateBlueprintCapacity(options);
  if (!gate.supported) throw new RangeError(gate.message);
  const rng = XorShift.fromSeed(options.seed);
  const rankedFamilies = rankFamilies(options.structureCorpus, options)
    .slice(0, 4);
  if (!rankedFamilies.length) {
    throw new Error("没有可用于编译阶段蓝图的结构家族。");
  }
  const selected = rankedFamilies[rng.nextInt(0, rankedFamilies.length)];
  const stagePlan = buildStagePlan({
    tileCount: integer(options.tileCount),
    layerCount: integer(options.layerCount),
    targetScore: clamp(integer(options.targetScore, 60), 0, 100),
  });
  const layerPlans = buildLayerPlans(stagePlan, gate.maxLayerTiles, rng);
  const towerEntrances = planMixedTowerEntrances(selected, options, rng);
  const fillTrackPlan = planFillTracks(selected);
  return {
    stagePlan,
    layerPlans,
    layerTileCounts: layerPlans.map(({ tileCount }) => tileCount),
    towerEntrances,
    fillTrackPlan,
    maxLayerTiles: gate.maxLayerTiles,
    familyIds: [String(selected.sourceFileName ?? "")],
    topologyFamily: String(
      selected.familyKey
      ?? selected.topologyHash
      ?? selected.sourceFileName
      ?? "",
    ),
  };
}
