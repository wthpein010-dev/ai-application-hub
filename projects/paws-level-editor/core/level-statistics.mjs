import { computeCoverage } from "./coverage.mjs";

const TILE_SIZE = 8;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function overlaps(left, right) {
  return (
    left.x < right.x + TILE_SIZE
    && left.x + TILE_SIZE > right.x
    && left.y < right.y + TILE_SIZE
    && left.y + TILE_SIZE > right.y
  );
}

function groupCount(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return groups;
}

function countAccessiblePairs(tiles, coverage) {
  const available = tiles.filter((tile) => {
    const state = coverage.get(tile.uid);
    return !state?.covered && !state?.sideBlocked;
  });
  return [...groupCount(available, (tile) => tile.type).values()]
    .reduce((total, count) => total + Math.floor(count / 2), 0);
}

function countCrossLayerOverlap(tiles) {
  let count = 0;
  let possible = 0;
  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
    const left = tiles[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
      const right = tiles[rightIndex];
      if (left.layer === right.layer) continue;
      possible += 1;
      if (overlaps(left, right)) count += 1;
    }
  }
  return { count, possible };
}

function maximumExactStackDepth(tiles) {
  const counts = groupCount(tiles, (tile) => `${tile.x}|${tile.y}`);
  return Math.max(0, ...counts.values());
}

function calculateSymmetryScore(tiles, boardWidth) {
  if (!tiles.length) return 0;
  const maxAnchorX = Math.max(0, boardWidth * TILE_SIZE - TILE_SIZE);
  const positions = new Set(
    tiles.map((tile) => `${tile.layer}|${tile.x}|${tile.y}`),
  );
  const mirrored = tiles.filter((tile) =>
    positions.has(`${tile.layer}|${maxAnchorX - tile.x}|${tile.y}`));
  return mirrored.length / tiles.length;
}

function calculateDependencyDepth(tiles) {
  const depthByUid = new Map();
  const ordered = [...tiles].sort((left, right) => right.layer - left.layer);
  let maximum = 0;
  for (const tile of ordered) {
    const higherDepths = ordered
      .filter((candidate) =>
        candidate.layer > tile.layer
        && overlaps(tile, candidate)
        && depthByUid.has(candidate.uid))
      .map((candidate) => depthByUid.get(candidate.uid));
    const depth = 1 + Math.max(0, ...higherDepths);
    depthByUid.set(tile.uid, depth);
    maximum = Math.max(maximum, depth);
  }
  return maximum;
}

function collectCommonOffsets(tiles) {
  const counts = new Map();
  const byLayer = new Map();
  for (const tile of tiles) {
    const values = byLayer.get(tile.layer) ?? [];
    values.push(tile);
    byLayer.set(tile.layer, values);
  }
  for (const values of byLayer.values()) {
    for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
        const dx = Math.abs(values[leftIndex].x - values[rightIndex].x);
        const dy = Math.abs(values[leftIndex].y - values[rightIndex].y);
        if (dx === 0 && dy === 0) continue;
        const key = `${dx}|${dy}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .map(([key, count]) => {
      const [dx, dy] = key.split("|").map(Number);
      return { dx, dy, count };
    })
    .sort((left, right) =>
      right.count - left.count || left.dx - right.dx || left.dy - right.dy)
    .slice(0, 12);
}

export function extractLevelStatistics(document) {
  const tiles = Array.isArray(document?.tiles)
    ? document.tiles.map((tile, index) => ({
      ...tile,
      uid: tile.uid || `statistics-tile-${index + 1}`,
    }))
    : [];
  const board = {
    width: Math.max(1, finiteNumber(document?.board?.width, 8)),
    height: Math.max(1, finiteNumber(document?.board?.height, 10)),
    scale: Math.max(0.01, finiteNumber(document?.board?.scale, 1)),
  };
  const layerCount = Math.max(0, ...tiles.map((tile) => finiteNumber(tile.layer, 0)));
  const layerHistogram = Object.fromEntries(
    [...groupCount(tiles, (tile) => tile.layer)]
      .sort(([left], [right]) => Number(left) - Number(right)),
  );
  const typeDistribution = Object.fromEntries(
    [...groupCount(tiles, (tile) => tile.type)]
      .sort(([left], [right]) => Number(left) - Number(right)),
  );
  const crossLayerOverlap = countCrossLayerOverlap(tiles);
  const coverage = computeCoverage(tiles);
  const maxAnchorX = Math.max(1, board.width * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, board.height * TILE_SIZE - TILE_SIZE);

  return {
    board,
    tileCount: tiles.length,
    layerCount,
    layerHistogram,
    typeDistribution,
    normalizedAnchors: tiles.map((tile) => ({
      x: Math.min(1, Math.max(0, tile.x / maxAnchorX)),
      y: Math.min(1, Math.max(0, tile.y / maxAnchorY)),
      layer: layerCount > 1 ? (tile.layer - 1) / (layerCount - 1) : 0,
    })),
    commonOffsets: collectCommonOffsets(tiles),
    intersectingCrossLayerPairs: crossLayerOverlap.count,
    crossLayerPairCount: crossLayerOverlap.possible,
    overlapRatio:
      crossLayerOverlap.possible > 0
        ? crossLayerOverlap.count / crossLayerOverlap.possible
        : 0,
    maxExactStackDepth: maximumExactStackDepth(tiles),
    initialAccessiblePairs: countAccessiblePairs(tiles, coverage),
    symmetryScore: calculateSymmetryScore(tiles, board.width),
    maxDependencyDepth: calculateDependencyDepth(tiles),
  };
}

function average(values, fallback) {
  if (!values.length) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function mergeLevelStatistics(statistics) {
  const samples = (Array.isArray(statistics) ? statistics : [])
    .filter((value) => value && typeof value === "object");
  if (!samples.length) {
    throw new Error("没有可用于学习的参考关卡。");
  }
  return {
    sampleCount: samples.length,
    board: {
      width: Math.round(average(samples.map(({ board }) => board.width), 8)),
      height: Math.round(average(samples.map(({ board }) => board.height), 10)),
      scale: average(samples.map(({ board }) => board.scale), 1),
    },
    meanTileCount: average(samples.map(({ tileCount }) => tileCount), 0),
    meanLayerCount: average(samples.map(({ layerCount }) => layerCount), 0),
    symmetryScore: average(samples.map(({ symmetryScore }) => symmetryScore), 0),
    overlapRatio: average(samples.map(({ overlapRatio }) => overlapRatio), 0),
    maxDependencyDepth: Math.max(
      0,
      ...samples.map(({ maxDependencyDepth }) => maxDependencyDepth),
    ),
    normalizedAnchors: samples
      .flatMap(({ normalizedAnchors }) => normalizedAnchors ?? [])
      .slice(0, 1200),
    commonOffsets: samples
      .flatMap(({ commonOffsets }) => commonOffsets ?? [])
      .sort((left, right) => right.count - left.count)
      .slice(0, 24),
  };
}
