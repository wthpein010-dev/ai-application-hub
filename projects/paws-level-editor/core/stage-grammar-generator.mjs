import { computeCoverage } from "./coverage.mjs";
import {
  extractStructureGrammar,
  spatialComponents,
  topologyHash,
} from "./structure-corpus.mjs";
import { XorShift } from "./xorshift.mjs";

const TILE_SIZE = 8;
const MAX_PLATFORM_SIZE = 10;
const LOCAL_MOTIF_CAPACITY = 9;
const MAX_COMPONENTS = 4;
const REGION_CENTERS = Object.freeze([
  Object.freeze({ x: 8, y: 8 }),
  Object.freeze({ x: 40, y: 8 }),
  Object.freeze({ x: 8, y: 48 }),
  Object.freeze({ x: 40, y: 48 }),
]);
const LOCAL_MOTIF_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([-8, 0]),
  Object.freeze([8, 0]),
  Object.freeze([0, -8]),
  Object.freeze([0, 8]),
  Object.freeze([-8, -8]),
  Object.freeze([8, -8]),
  Object.freeze([-8, 8]),
  Object.freeze([8, 8]),
]);

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function overlaps(left, right) {
  return (
    left.x < right.x + TILE_SIZE
    && left.x + TILE_SIZE > right.x
    && left.y < right.y + TILE_SIZE
    && left.y + TILE_SIZE > right.y
  );
}

function semanticTile(anchor, {
  uid,
  top = false,
  blind = false,
} = {}) {
  return {
    uid,
    x: anchor.x,
    y: anchor.y,
    layer: anchor.layer,
    type: -1,
    moldType: top ? 2 : 1,
    metaType: 0,
    metaData: 0,
    presetColorType: blind && !top ? 3 : 1,
  };
}

function sourceFamilyForBlueprint(structureCorpus, blueprint) {
  const sourceFileName = String(blueprint.familyIds?.[0] ?? "");
  return (structureCorpus?.families ?? []).find((family) =>
    String(family.sourceFileName ?? "") === sourceFileName)
    ?? structureCorpus?.families?.[0]
    ?? null;
}

function trackDirection(source, trackIndex, mirror) {
  const first = source?.lowerAnchors?.[0];
  const last = source?.lowerAnchors?.at(-1) ?? source?.topAnchor;
  const sourceDelta = Number(last?.x) - Number(first?.x);
  const natural = sourceDelta
    ? Math.sign(sourceDelta)
    : trackIndex % 2
      ? -1
      : 1;
  return mirror ? -natural : natural;
}

function scaledTrackStart(source, sourceLayerCount, targetLayerCount, depth) {
  const sourceStart = Math.max(1, integer(source?.layerStart, 1));
  const normalized = sourceLayerCount > 1
    ? (sourceStart - 1) / (sourceLayerCount - 1)
    : 0;
  const requested = 1 + Math.round(normalized * (targetLayerCount - 1));
  return clamp(requested, 1, targetLayerCount - depth);
}

function buildBlindTracks({ blueprint, structureCorpus, rng }) {
  const sources = blueprint.fillTrackPlan?.tracks ?? [];
  if (![0, 2, 4].includes(sources.length)) {
    throw new Error("盲盒轨道数量必须是 0、2 或 4。");
  }
  const targetLayerCount = blueprint.layerPlans.length;
  const sourceFamily = sourceFamilyForBlueprint(structureCorpus, blueprint);
  const sourceLayerCount = Math.max(
    1,
    integer(sourceFamily?.layerCount, targetLayerCount),
  );
  const mirror = Boolean(rng.nextUint32() & 1);
  const tiles = [];
  const fillTracks = sources.map((source, trackIndex) => {
    const sourceDepth = Math.max(2, integer(source?.lowerDepth, 2));
    const lowerDepth = clamp(
      Math.round(sourceDepth / sourceLayerCount * targetLayerCount),
      2,
      targetLayerCount - 1,
    );
    const layerStart = scaledTrackStart(
      source,
      sourceLayerCount,
      targetLayerCount,
      lowerDepth,
    );
    const center = REGION_CENTERS[trackIndex];
    const direction = trackDirection(source, trackIndex, mirror);
    const lowerAnchors = Array.from({ length: lowerDepth }, (_, index) => {
      const phase = [0, 1, 2, 1, 0, -1, -2, -1][index % 8];
      return {
        x: clamp(center.x + direction * phase, 0, 48),
        y: center.y,
        layer: layerStart + index,
      };
    });
    const nextPhase = [0, 1, 2, 1, 0, -1, -2, -1][lowerDepth % 8];
    const topAnchor = {
      x: clamp(center.x + direction * nextPhase, 0, 48),
      y: center.y,
      layer: layerStart + lowerDepth,
    };
    lowerAnchors.forEach((anchor, index) => {
      tiles.push(semanticTile(anchor, {
        uid: `stage-track-${trackIndex + 1}-lower-${index + 1}`,
        blind: true,
      }));
    });
    tiles.push(semanticTile(topAnchor, {
      uid: `stage-track-${trackIndex + 1}-top`,
      top: true,
    }));
    return {
      lowerDepth,
      depth: lowerDepth + 1,
      explicitTop: true,
      layerStart,
      layerEnd: topAnchor.layer,
      lowerAnchors,
      topAnchor,
      sourceLowerDepth: sourceDepth,
    };
  });
  return { tiles, fillTracks };
}

function nearestRegionIndex(tile) {
  return REGION_CENTERS
    .map((center, index) => ({
      index,
      distance: Math.hypot(tile.x - center.x, tile.y - center.y),
    }))
    .sort((left, right) =>
      left.distance - right.distance || left.index - right.index)[0].index;
}

function transformedOffsets(offsets, transformIndex) {
  const quarterTurns = transformIndex % 4;
  const mirrored = Boolean((transformIndex >> 2) & 1);
  return offsets.map(([sourceX, sourceY]) => {
    let x = mirrored ? -sourceX : sourceX;
    let y = sourceY;
    for (let turn = 0; turn < quarterTurns; turn += 1) {
      [x, y] = [-y, x];
    }
    return [x, y];
  });
}

function desiredComponentCount(layerPlan, reservedCount) {
  const minimumForCapacity = Math.ceil(
    layerPlan.tileCount / LOCAL_MOTIF_CAPACITY,
  );
  const stageMinimum = layerPlan.stageKey === "release" ? 2 : 3;
  return clamp(
    Math.max(stageMinimum, minimumForCapacity, reservedCount),
    1,
    MAX_COMPONENTS,
  );
}

function allocateComponentSizes(total, initialSizes, priority) {
  const sizes = [...initialSizes];
  if (total > sizes.length * LOCAL_MOTIF_CAPACITY) {
    throw new RangeError(
      `${total} 张砖块超过 ${sizes.length} 个局部平台的容量。`,
    );
  }
  let remaining = total - sizes.reduce((sum, value) => sum + value, 0);
  if (remaining < 0) {
    throw new RangeError("盲盒轨道占用超过当前层预算。");
  }
  while (remaining > 0) {
    const candidates = priority
      .filter((index) => sizes[index] < LOCAL_MOTIF_CAPACITY)
      .sort((left, right) =>
        sizes[left] - sizes[right]
        || priority.indexOf(left) - priority.indexOf(right));
    if (!candidates.length) {
      throw new RangeError("局部平台已满，无法完成逐层预算。");
    }
    sizes[candidates[0]] += 1;
    remaining -= 1;
  }
  return sizes;
}

function placeLayer({
  layerPlan,
  reservedTiles,
  regionOrder,
  motifOffsets,
  motifUses,
  repairLog,
}) {
  const groupsByRegion = new Map();
  for (const tile of reservedTiles) {
    const regionIndex = nearestRegionIndex(tile);
    const group = groupsByRegion.get(regionIndex) ?? {
      regionIndex,
      reserved: [],
    };
    group.reserved.push(tile);
    groupsByRegion.set(regionIndex, group);
  }
  const desiredCount = desiredComponentCount(
    layerPlan,
    groupsByRegion.size,
  );
  for (const regionIndex of regionOrder) {
    if (groupsByRegion.size >= desiredCount) break;
    if (!groupsByRegion.has(regionIndex)) {
      groupsByRegion.set(regionIndex, { regionIndex, reserved: [] });
    }
  }
  const groups = [...groupsByRegion.values()]
    .sort((left, right) =>
      regionOrder.indexOf(left.regionIndex)
      - regionOrder.indexOf(right.regionIndex));
  if (groups.length > MAX_COMPONENTS) {
    throw new RangeError("当前层盲盒轨道产生了超过 4 个空间组件。");
  }
  const priority = groups.map((_, index) => index);
  const targetSizes = allocateComponentSizes(
    layerPlan.tileCount,
    groups.map(({ reserved }) => reserved.length),
    priority,
  );
  const placed = [...reservedTiles];

  groups.forEach((group, groupIndex) => {
    const base = {
      ...REGION_CENTERS[group.regionIndex],
      layer: layerPlan.layer,
    };
    const candidates = motifOffsets
      .map(([dx, dy]) => ({
        x: base.x + dx,
        y: base.y + dy,
        layer: layerPlan.layer,
      }))
      .filter(({ x, y }) => x >= 0 && x <= 48 && y >= 0 && y <= 56);
    let ordinal = 0;
    while (
      placed.filter((tile) =>
        nearestRegionIndex(tile) === group.regionIndex).length
      < targetSizes[groupIndex]
    ) {
      const anchor = candidates.find((candidate) =>
        !placed.some((tile) => overlaps(candidate, tile)));
      if (!anchor) {
        repairLog.push({
          action: "local-motif-exhausted",
          layer: layerPlan.layer,
          regionIndex: group.regionIndex,
        });
        throw new RangeError(
          `第 ${layerPlan.layer} 层局部母题无法容纳精确砖块预算。`,
        );
      }
      ordinal += 1;
      placed.push(semanticTile(anchor, {
        uid:
          `stage-${layerPlan.layer}-island-${groupIndex + 1}-${ordinal}`,
      }));
    }
    motifUses.push({
      layer: layerPlan.layer,
      stageKey: layerPlan.stageKey,
      motif: "local-island",
      regionIndex: group.regionIndex,
      tileCount: targetSizes[groupIndex],
      reservedTrackTiles: group.reserved.length,
    });
  });
  if (placed.length !== layerPlan.tileCount) {
    throw new Error(
      `第 ${layerPlan.layer} 层生成 ${placed.length} 张，`
      + `目标为 ${layerPlan.tileCount} 张。`,
    );
  }
  const components = spatialComponents(placed);
  if (
    components.length < 1
    || components.length > MAX_COMPONENTS
    || components.some(({ length }) => length > MAX_PLATFORM_SIZE)
  ) {
    throw new Error(
      `第 ${layerPlan.layer} 层局部平台结构不满足门禁：`
      + `组件 ${components.length} 个，尺寸 `
      + `${components.map(({ length }) => length).join("/") || "0"}。`,
    );
  }
  return placed;
}

function releasePressure(tiles, stagePlan) {
  const pressureAt = (layerEnd) => {
    const remaining = tiles.filter(({ layer }) => layer <= layerEnd);
    if (!remaining.length) return 0;
    const coverage = computeCoverage(remaining);
    const blocked = remaining.filter(({ uid }) => {
      const state = coverage.get(uid);
      return state?.covered || state?.sideBlocked;
    }).length;
    return blocked / remaining.length;
  };
  const crisis = stagePlan.find(({ key }) => key === "crisis");
  const release = stagePlan.find(({ key }) => key === "release");
  if (!crisis || !release) return 0;
  return pressureAt(crisis.layerEnd) - pressureAt(release.layerEnd);
}

function maximumComponentShares(layers) {
  return Object.fromEntries(layers.map(({ layer, components, tiles }) => [
    layer,
    tiles.length
      ? Math.max(0, ...components.map(({ length }) => length)) / tiles.length
      : 0,
  ]));
}

function hasThreeLayerGiantRun(maximumShares) {
  const entries = Object.entries(maximumShares)
    .map(([layer, share]) => ({ layer: Number(layer), share }))
    .sort((left, right) => left.layer - right.layer);
  let run = 0;
  let previousLayer = null;
  for (const entry of entries) {
    if (entry.share > 0.6) {
      run = previousLayer === entry.layer - 1 ? run + 1 : 1;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
    previousLayer = entry.layer;
  }
  return false;
}

function inferredTowerRoles(towerChains, layerCount) {
  const roles = { high: 0, medium: 0, small: 0 };
  for (const chain of towerChains) {
    if (chain.depth >= layerCount * 0.7) roles.high += 1;
    else if (chain.depth >= layerCount * 0.4) roles.medium += 1;
    else roles.small += 1;
  }
  return roles;
}

export function measureStageGeometry({
  tiles = [],
  stagePlan = [],
  fillTracks = [],
  towerEntrances = [],
} = {}) {
  const byLayer = new Map();
  for (const tile of tiles) {
    const layer = integer(tile.layer, 1);
    const values = byLayer.get(layer) ?? [];
    values.push(tile);
    byLayer.set(layer, values);
  }
  const layers = [...byLayer]
    .sort(([left], [right]) => left - right)
    .map(([layer, layerTiles]) => ({
      layer,
      tiles: layerTiles,
      components: spatialComponents(layerTiles),
    }));
  const releaseLayers = new Set(
    stagePlan
      .filter(({ key }) => key === "release")
      .flatMap(({ layerStart, layerEnd }) =>
        Array.from(
          { length: Math.max(0, layerEnd - layerStart + 1) },
          (_, index) => layerStart + index,
        )),
  );
  const applicableLayers = layers.filter(({ layer, tiles: layerTiles }) =>
    layerTiles.length > 2 && !releaseLayers.has(layer));
  const multiComponentLayers = applicableLayers.filter(({ components }) =>
    components.length >= 2 && components.length <= 4);
  const maximumComponentShareByLayer = maximumComponentShares(layers);
  const grammar = extractStructureGrammar({
    board: { width: 7, height: 8 },
    tiles,
  });
  const explicitRoles = towerEntrances.reduce(
    (counts, { role }) => {
      if (Object.hasOwn(counts, role)) counts[role] += 1;
      return counts;
    },
    { high: 0, medium: 0, small: 0 },
  );
  const layerCount = layers.length;
  const towerRoleCounts = towerEntrances.length
    ? explicitRoles
    : inferredTowerRoles(grammar.towerChains, layerCount);
  const boundaryTiles = tiles.filter(({ x, y }) =>
    x <= 0 || x >= 48 || y <= 0 || y >= 56);
  return {
    layerTileCounts: layers.map(({ tiles: layerTiles }) => layerTiles.length),
    multiComponentLayerRatio: applicableLayers.length
      ? multiComponentLayers.length / applicableLayers.length
      : 1,
    maximumPlatformSize: Math.max(
      0,
      ...layers.flatMap(({ components }) =>
        components.map(({ length }) => length)),
    ),
    maximumComponentShareByLayer,
    threeLayerGiantRun: hasThreeLayerGiantRun(
      maximumComponentShareByLayer,
    ),
    towerEntranceCount: towerEntrances.length || grammar.towerChains.length,
    towerRoleCounts,
    maximumTowerDepth: Math.max(
      0,
      ...grammar.towerChains.map(({ depth }) => depth),
    ),
    releaseDependencyDrop: releasePressure(tiles, stagePlan),
    boundaryRatio: tiles.length ? boundaryTiles.length / tiles.length : 0,
    fillTrackCount: fillTracks.length,
  };
}

export function buildStageGrammarGeometry({
  blueprint,
  structureCorpus,
  seed,
}) {
  if (!blueprint || !Array.isArray(blueprint.layerPlans)) {
    throw new TypeError("阶段语法生成需要有效蓝图。");
  }
  const rng = XorShift.fromSeed(seed);
  const { tiles: trackTiles, fillTracks } = buildBlindTracks({
    blueprint,
    structureCorpus,
    rng,
  });
  const tracksByLayer = new Map();
  for (const tile of trackTiles) {
    const values = tracksByLayer.get(tile.layer) ?? [];
    values.push(tile);
    tracksByLayer.set(tile.layer, values);
  }
  const regionOrder = rng.shuffle([0, 1, 2, 3]);
  const motifOffsets = transformedOffsets(
    LOCAL_MOTIF_OFFSETS,
    rng.nextInt(0, 8),
  );
  const motifUses = [];
  const repairLog = [];
  const tiles = blueprint.layerPlans.flatMap((layerPlan) =>
    placeLayer({
      layerPlan,
      reservedTiles: tracksByLayer.get(layerPlan.layer) ?? [],
      regionOrder,
      motifOffsets,
      motifUses,
      repairLog,
    }));
  const metrics = measureStageGeometry({
    tiles,
    stagePlan: blueprint.stagePlan,
    fillTracks,
    towerEntrances: blueprint.towerEntrances,
  });
  const geometryTopologyHash = topologyHash({
    tiles,
    stagePlan: blueprint.stagePlan,
    fillTracks,
  });
  return {
    tiles,
    fillTracks,
    layerTileCounts: metrics.layerTileCounts,
    blueprintLayerTileCounts: [...blueprint.layerTileCounts],
    stagePlan: structuredClone(blueprint.stagePlan),
    towerEntrances: structuredClone(blueprint.towerEntrances),
    motifUses,
    repairLog,
    topologyHash: geometryTopologyHash,
    metrics,
  };
}
