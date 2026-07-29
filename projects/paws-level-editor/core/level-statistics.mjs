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

function accessibleTiles(tiles, coverage) {
  return tiles.filter((tile) => {
    const state = coverage.get(tile.uid);
    return !state?.covered && !state?.sideBlocked;
  });
}

function countCrossLayerOverlap(tiles) {
  let count = 0;
  let possible = 0;
  const participatingLayers = new Set();
  const blockersByUid = new Map(tiles.map(({ uid }) => [uid, 0]));
  const dependenciesByUid = new Map(tiles.map(({ uid }) => [uid, 0]));
  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
    const left = tiles[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
      const right = tiles[rightIndex];
      if (left.layer === right.layer) continue;
      possible += 1;
      if (!overlaps(left, right)) continue;
      count += 1;
      participatingLayers.add(left.layer);
      participatingLayers.add(right.layer);
      const higher = left.layer > right.layer ? left : right;
      const lower = higher === left ? right : left;
      blockersByUid.set(lower.uid, (blockersByUid.get(lower.uid) ?? 0) + 1);
      dependenciesByUid.set(higher.uid, (dependenciesByUid.get(higher.uid) ?? 0) + 1);
    }
  }
  return {
    count,
    possible,
    participatingLayers,
    blockersByUid,
    dependenciesByUid,
  };
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

function averagePairDistance(tiles, board) {
  if (tiles.length < 2) return 0;
  const diagonal = Math.hypot(
    Math.max(1, board.width * TILE_SIZE - TILE_SIZE),
    Math.max(1, board.height * TILE_SIZE - TILE_SIZE),
  );
  const byType = new Map();
  for (const tile of tiles) {
    const values = byType.get(tile.type) ?? [];
    values.push(tile);
    byType.set(tile.type, values);
  }
  const distances = [];
  for (const values of byType.values()) {
    for (let index = 0; index + 1 < values.length; index += 2) {
      distances.push(Math.hypot(
        values[index].x - values[index + 1].x,
        values[index].y - values[index + 1].y,
      ) / diagonal);
    }
  }
  return distances.length
    ? distances.reduce((total, value) => total + value, 0) / distances.length
    : 0;
}

function bottleneckConcentration(dependenciesByUid) {
  const values = [...dependenciesByUid.values()].sort((left, right) => right - left);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  const criticalCount = Math.max(1, Math.ceil(values.length * 0.1));
  return values.slice(0, criticalCount)
    .reduce((sum, value) => sum + value, 0) / total;
}

function areFlatNeighbors(left, right) {
  if (left.layer !== right.layer) return false;
  const deltaX = Math.abs(left.x - right.x);
  const deltaY = Math.abs(left.y - right.y);
  return (
    (deltaX === TILE_SIZE && deltaY === 0)
    || (deltaY === TILE_SIZE && deltaX === 0)
  );
}

function connectedComponents(values, connected) {
  const remaining = new Set(values.map((_, index) => index));
  const components = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    const component = [];
    while (queue.length) {
      const index = queue.shift();
      component.push(values[index]);
      for (const candidate of [...remaining]) {
        if (!connected(values[index], values[candidate])) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    components.push(component);
  }
  return components;
}

function analyzePlatforms(tiles) {
  const byLayer = new Map();
  for (const tile of tiles) {
    const values = byLayer.get(tile.layer) ?? [];
    values.push(tile);
    byLayer.set(tile.layer, values);
  }
  const components = [...byLayer.values()]
    .flatMap((values) => connectedComponents(values, areFlatNeighbors));
  const largestLayerSize = Math.max(
    0,
    ...[...byLayer.values()].map((values) => values.length),
  );
  const largestFlatPlatformSize = Math.max(
    0,
    ...components.map((component) => component.length),
  );
  let exposedEdges = 0;
  for (const values of byLayer.values()) {
    const positions = new Set(values.map(({ x, y }) => `${x}|${y}`));
    for (const tile of values) {
      exposedEdges += Number(!positions.has(`${tile.x - TILE_SIZE}|${tile.y}`));
      exposedEdges += Number(!positions.has(`${tile.x + TILE_SIZE}|${tile.y}`));
      exposedEdges += Number(!positions.has(`${tile.x}|${tile.y - TILE_SIZE}`));
      exposedEdges += Number(!positions.has(`${tile.x}|${tile.y + TILE_SIZE}`));
    }
  }
  return {
    platformComponentCount: components.length,
    largestFlatPlatformSize,
    largestFlatPlatformRatio: largestLayerSize
      ? largestFlatPlatformSize / largestLayerSize
      : 0,
    boundaryRatio: tiles.length ? exposedEdges / (tiles.length * 4) : 0,
  };
}

function stageLayerRanges(document, layerCount) {
  const source = document?.designerNote?.aiGeneration?.stagePlan;
  if (!Array.isArray(source) || !source.length) return [];
  let nextUpperLayer = layerCount;
  return source.map((stage) => {
    const count = Math.max(0, Math.trunc(Number(stage.layerCount) || 0));
    const layerEnd = Number.isFinite(Number(stage.layerEnd))
      ? Number(stage.layerEnd)
      : nextUpperLayer;
    const layerStart = Number.isFinite(Number(stage.layerStart))
      ? Number(stage.layerStart)
      : count
        ? layerEnd - count + 1
        : layerEnd + 1;
    nextUpperLayer = layerStart - 1;
    return {
      key: stage.key,
      layerStart,
      layerEnd,
    };
  });
}

function analyzeStagePressure(document, tiles, layerCount) {
  const ranges = stageLayerRanges(document, layerCount);
  const stagePressure = Object.fromEntries(ranges.map((stage) => {
    const remaining = tiles.filter((tile) => tile.layer <= stage.layerEnd);
    const coverage = computeCoverage(remaining);
    const accessible = accessibleTiles(remaining, coverage);
    return [stage.key, {
      layerStart: stage.layerStart,
      layerEnd: stage.layerEnd,
      remainingTiles: remaining.length,
      openRate: remaining.length ? accessible.length / remaining.length : 1,
      accessiblePairs: countAccessiblePairs(remaining, coverage),
      pressure: remaining.length ? 1 - accessible.length / remaining.length : 0,
    }];
  }));
  const crisisPressure = stagePressure.crisis?.pressure;
  const releasePressure = stagePressure.release?.pressure;
  return {
    stagePressure,
    releaseDependencyDrop:
      Number.isFinite(crisisPressure) && Number.isFinite(releasePressure)
        ? crisisPressure - releasePressure
        : 0,
  };
}

function analyzeTowers(document, tiles, layerCount, board) {
  const surfaceRange = stageLayerRanges(document, layerCount)
    .find(({ key }) => key === "surface");
  const minimumLayer = surfaceRange?.layerStart
    ?? Math.max(1, Math.ceil(layerCount * 0.8));
  const towerTiles = tiles.filter((tile) => tile.layer >= minimumLayer);
  const components = connectedComponents(
    towerTiles,
    (left, right) =>
      areFlatNeighbors(left, right)
      || (
        Math.abs(left.layer - right.layer) <= 2
        && left.layer !== right.layer
        && overlaps(left, right)
      ),
  );
  const towerComponents = components.filter((component) => component.length >= 2);
  const meaningfulComponents = towerComponents.length
    ? towerComponents
    : components;
  const maxAnchorX = Math.max(1, board.width * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, board.height * TILE_SIZE - TILE_SIZE);
  const towerCenters = meaningfulComponents
    .map((component) => ({
      x: component.reduce((total, tile) => total + tile.x, 0)
        / component.length / maxAnchorX,
      y: component.reduce((total, tile) => total + tile.y, 0)
        / component.length / maxAnchorY,
      weight: component.length,
    }))
    .sort((left, right) =>
      right.weight - left.weight || left.x - right.x || left.y - right.y)
    .slice(0, 6);
  return {
    towerCount: meaningfulComponents.length,
    towerCenters,
  };
}

function analyzeLayerSequence(tiles, board, layerCount) {
  const byLayer = new Map();
  for (const tile of tiles) {
    const layerTiles = byLayer.get(tile.layer) ?? [];
    layerTiles.push(tile);
    byLayer.set(tile.layer, layerTiles);
  }
  const maxAnchorX = Math.max(1, board.width * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, board.height * TILE_SIZE - TILE_SIZE);
  const layerSequence = [...byLayer]
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([layer, layerTiles], index, orderedLayers) => {
      const ordered = [...layerTiles].sort((left, right) =>
        left.y - right.y || left.x - right.x || String(left.uid).localeCompare(String(right.uid)));
      const components = connectedComponents(ordered, areFlatNeighbors)
        .map((component) => component.map(({ uid }) => uid));
      const previousCount = index > 0 ? orderedLayers[index - 1][1].length : ordered.length;
      return {
        layer: Number(layer),
        normalizedDepth: layerCount > 1
          ? (Number(layer) - 1) / (layerCount - 1)
          : 0,
        tileCount: ordered.length,
        deltaFromPrevious: index > 0 ? ordered.length - previousCount : 0,
        components,
        anchors: ordered.map((tile) => ({
          x: tile.x,
          y: tile.y,
          normalizedX: Math.min(1, Math.max(0, tile.x / maxAnchorX)),
          normalizedY: Math.min(1, Math.max(0, tile.y / maxAnchorY)),
          type: Number(tile.type),
          moldType: Number(tile.moldType ?? 1),
          presetColorType: Number(tile.presetColorType ?? 1),
        })),
      };
    });
  return {
    layerTileCounts: layerSequence.map(({ tileCount }) => tileCount),
    layerCountRhythm: layerSequence.map(({
      layer,
      tileCount,
      deltaFromPrevious,
    }) => ({
      layer,
      tileCount,
      deltaFromPrevious,
    })),
    layerSequence,
    layerTemplates: layerSequence,
  };
}

function analyzeFillTracks(tiles, board) {
  const maxAnchorX = Math.max(1, board.width * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, board.height * TILE_SIZE - TILE_SIZE);
  const lowerByLayer = new Map();
  for (const tile of tiles) {
    if (
      Number(tile.presetColorType) !== 3
      || Number(tile.moldType ?? 1) === 2
    ) {
      continue;
    }
    const layerTiles = lowerByLayer.get(Number(tile.layer)) ?? [];
    layerTiles.push(tile);
    lowerByLayer.set(Number(tile.layer), layerTiles);
  }
  const tracks = [];
  for (const [layer, layerTiles] of [...lowerByLayer]
    .sort(([left], [right]) => left - right)) {
    const orderedTiles = [...layerTiles].sort((left, right) =>
      left.y - right.y || left.x - right.x || String(left.uid).localeCompare(String(right.uid)));
    const candidatePairs = tracks.flatMap((track, trackIndex) => {
      const previous = track.lowerTiles.at(-1);
      if (!previous || Number(previous.layer) !== layer - 1) return [];
      return orderedTiles.flatMap((tile, tileIndex) => {
        const dx = Math.abs(Number(previous.x) - Number(tile.x));
        const dy = Math.abs(Number(previous.y) - Number(tile.y));
        if (dx > 4 || dy > 4) return [];
        return [{
          trackIndex,
          tileIndex,
          distance: Math.hypot(dx, dy),
        }];
      });
    }).sort((left, right) =>
      left.distance - right.distance
      || left.trackIndex - right.trackIndex
      || left.tileIndex - right.tileIndex);
    const matchedTracks = new Set();
    const matchedTiles = new Set();
    for (const { trackIndex, tileIndex } of candidatePairs) {
      if (matchedTracks.has(trackIndex) || matchedTiles.has(tileIndex)) continue;
      tracks[trackIndex].lowerTiles.push(orderedTiles[tileIndex]);
      matchedTracks.add(trackIndex);
      matchedTiles.add(tileIndex);
    }
    orderedTiles.forEach((tile, tileIndex) => {
      if (!matchedTiles.has(tileIndex)) tracks.push({ lowerTiles: [tile] });
    });
  }

  const availableTops = tiles
    .filter(({ moldType }) => Number(moldType) === 2)
    .sort((left, right) =>
      Number(left.layer) - Number(right.layer)
      || Number(left.y) - Number(right.y)
      || Number(left.x) - Number(right.x));
  const usedTopIndices = new Set();
  const fillTracks = tracks
    .map(({ lowerTiles }) => {
      const lastLower = lowerTiles.at(-1);
      const explicitTop = availableTops
        .map((tile, index) => ({
          tile,
          index,
          dx: Math.abs(Number(lastLower.x) - Number(tile.x)),
          dy: Math.abs(Number(lastLower.y) - Number(tile.y)),
        }))
        .filter(({ tile, index, dx, dy }) =>
          !usedTopIndices.has(index)
          && Number(tile.layer) === Number(lastLower.layer) + 1
          && dx <= 4
          && dy <= 4)
        .sort((left, right) =>
          Math.hypot(left.dx, left.dy) - Math.hypot(right.dx, right.dy)
          || left.index - right.index)[0];
      if (explicitTop) usedTopIndices.add(explicitTop.index);
      if (lowerTiles.length < 2 && !explicitTop) return null;

      const previousLower = lowerTiles.at(-2) ?? lastLower;
      const inferredTop = {
        x: Math.min(
          maxAnchorX,
          Math.max(0, Number(lastLower.x) + Number(lastLower.x) - Number(previousLower.x)),
        ),
        y: Math.min(
          maxAnchorY,
          Math.max(0, Number(lastLower.y) + Number(lastLower.y) - Number(previousLower.y)),
        ),
        layer: Number(lastLower.layer) + 1,
      };
      const top = explicitTop?.tile ?? inferredTop;
      const anchors = [...lowerTiles, top];
      return {
        lowerDepth: lowerTiles.length,
        depth: lowerTiles.length + 1,
        explicitTop: Boolean(explicitTop),
        layerStart: Number(lowerTiles[0].layer),
        layerEnd: Number(top.layer),
        lowerAnchors: lowerTiles.map((tile) => ({
          layer: Number(tile.layer),
          x: Number(tile.x),
          y: Number(tile.y),
          normalizedX: Math.min(1, Math.max(0, Number(tile.x) / maxAnchorX)),
          normalizedY: Math.min(1, Math.max(0, Number(tile.y) / maxAnchorY)),
        })),
        topAnchor: {
          layer: Number(top.layer),
          x: Number(top.x),
          y: Number(top.y),
          normalizedX: Math.min(1, Math.max(0, Number(top.x) / maxAnchorX)),
          normalizedY: Math.min(1, Math.max(0, Number(top.y) / maxAnchorY)),
        },
        anchors: anchors.map((tile) => ({
          layer: Number(tile.layer),
          x: Number(tile.x),
          y: Number(tile.y),
        })),
        start: {
          x: Number(lowerTiles[0].x) / maxAnchorX,
          y: Number(lowerTiles[0].y) / maxAnchorY,
        },
        delta: {
          x: (Number(top.x) - Number(lowerTiles[0].x))
            / (anchors.length - 1) / maxAnchorX,
          y: (Number(top.y) - Number(lowerTiles[0].y))
            / (anchors.length - 1) / maxAnchorY,
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.layerStart - right.layerStart
      || left.start.y - right.start.y
      || left.start.x - right.start.x);
  return {
    fillTrackCount: fillTracks.length,
    fillTracks,
    blindStacks: fillTracks,
  };
}

function analyzeLearnedTemplates(tiles, board, layerCount) {
  const layerAnalysis = analyzeLayerSequence(tiles, board, layerCount);
  const fillAnalysis = analyzeFillTracks(tiles, board);

  const fullRandomCount = tiles
    .filter(({ type }) => Number(type) === -1).length;
  const normalRandomCount = tiles
    .filter(({ type }) => Number(type) === 0).length;
  return {
    ...layerAnalysis,
    ...fillAnalysis,
    typeRatios: {
      fullRandom: tiles.length ? fullRandomCount / tiles.length : 0,
      normalRandom: tiles.length ? normalRandomCount / tiles.length : 0,
      fixed: tiles.length
        ? (tiles.length - fullRandomCount - normalRandomCount) / tiles.length
        : 0,
    },
  };
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
  const initiallyAccessible = accessibleTiles(tiles, coverage);
  const initiallyBlocked = tiles.filter((tile) =>
    (crossLayerOverlap.blockersByUid.get(tile.uid) ?? 0) > 0);
  const blockerTotal = initiallyBlocked.reduce(
    (total, tile) => total + (crossLayerOverlap.blockersByUid.get(tile.uid) ?? 0),
    0,
  );
  const nonEmptyLayers = new Set(tiles.map(({ layer }) => layer));
  const maxAnchorX = Math.max(1, board.width * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, board.height * TILE_SIZE - TILE_SIZE);
  const platformStructure = analyzePlatforms(tiles);
  const towerStructure = analyzeTowers(document, tiles, layerCount, board);
  const pressureStructure = analyzeStagePressure(document, tiles, layerCount);
  const learnedTemplates = analyzeLearnedTemplates(
    tiles,
    board,
    layerCount,
  );

  return {
    sourceFileName: String(document?.fileName ?? ""),
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
    initialAccessibleTiles: initiallyAccessible.length,
    initialOpenRate: tiles.length ? initiallyAccessible.length / tiles.length : 0,
    initialOpenPairRate: initiallyAccessible.length
      ? Math.min(1, countAccessiblePairs(tiles, coverage) * 2 / initiallyAccessible.length)
      : 0,
    initialActiveTypeCount: new Set(initiallyAccessible.map(({ type }) => type)).size,
    initialPairDistance: averagePairDistance(initiallyAccessible, board),
    averageBlockers: initiallyBlocked.length ? blockerTotal / initiallyBlocked.length : 0,
    bottleneckConcentration: bottleneckConcentration(
      crossLayerOverlap.dependenciesByUid,
    ),
    effectiveLayerCount: crossLayerOverlap.participatingLayers.size
      || Math.min(1, nonEmptyLayers.size),
    nonEmptyLayerCount: nonEmptyLayers.size,
    symmetryScore: calculateSymmetryScore(tiles, board.width),
    maxDependencyDepth: calculateDependencyDepth(tiles),
    ...platformStructure,
    ...towerStructure,
    ...pressureStructure,
    ...learnedTemplates,
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
  const totalTiles = samples.reduce(
    (total, { tileCount }) => total + Math.max(0, Number(tileCount) || 0),
    0,
  );
  const weightedRatio = (key) => totalTiles
    ? samples.reduce(
      (total, sample) =>
        total
        + (Number(sample.typeRatios?.[key]) || 0)
          * Math.max(0, Number(sample.tileCount) || 0),
      0,
    ) / totalTiles
    : 0;
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
    boundaryRatio: average(samples.map(({ boundaryRatio }) => boundaryRatio), 1),
    initialPairDistance: average(samples.map(({ initialPairDistance }) => initialPairDistance), 0.4),
    largestFlatPlatformSize: average(
      samples.map(({ largestFlatPlatformSize }) => largestFlatPlatformSize),
      0,
    ),
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
    towerCenters: samples
      .flatMap(({ towerCenters }) => towerCenters ?? [])
      .sort((left, right) =>
        (right.weight ?? 0) - (left.weight ?? 0)
        || left.x - right.x
        || left.y - right.y)
      .slice(0, 12),
    layerTemplates: samples.flatMap((sample, sampleIndex) =>
      (sample.layerTemplates ?? []).map((template) => ({
        ...template,
        sampleIndex,
      }))),
    layerSequence: samples.flatMap((sample, sampleIndex) =>
      (sample.layerSequence ?? sample.layerTemplates ?? []).map((template) => ({
        ...template,
        sampleIndex,
      }))),
    referenceProfiles: samples.map((sample, sampleIndex) => ({
      sampleIndex,
      sourceFileName: String(sample.sourceFileName ?? ""),
      board: sample.board,
      tileCount: sample.tileCount,
      layerCount: sample.layerCount,
      layerTileCounts: [...(sample.layerTileCounts ?? [])],
      layerCountRhythm: structuredClone(sample.layerCountRhythm ?? []),
      layerTemplates: (sample.layerTemplates ?? []).map((template) => ({
        ...template,
        sampleIndex,
      })),
      layerSequence: (sample.layerSequence ?? sample.layerTemplates ?? [])
        .map((template) => ({
          ...template,
          sampleIndex,
        })),
      fillTracks: structuredClone(sample.fillTracks ?? sample.blindStacks ?? []),
      blindStacks: structuredClone(sample.fillTracks ?? sample.blindStacks ?? []),
      layoutMetrics: {
        boundaryRatio: Number(sample.boundaryRatio) || 0,
        largestFlatPlatformSize: Number(sample.largestFlatPlatformSize) || 0,
        initialAccessiblePairs: Number(sample.initialAccessiblePairs) || 0,
        symmetryScore: Number(sample.symmetryScore) || 0,
        thinLayerTailLength: [...(sample.layerTileCounts ?? [])]
          .reverse()
          .findIndex((count) => Number(count) > 2) === -1
          ? (sample.layerTileCounts ?? []).length
          : [...(sample.layerTileCounts ?? [])]
            .reverse()
            .findIndex((count) => Number(count) > 2),
      },
      typeRatios: { ...(sample.typeRatios ?? {}) },
    })),
    fillTracks: samples.flatMap((sample) =>
      structuredClone(sample.fillTracks ?? sample.blindStacks ?? [])),
    blindStacks: samples.flatMap((sample) =>
      structuredClone(sample.fillTracks ?? sample.blindStacks ?? [])),
    typeRatios: {
      fullRandom: weightedRatio("fullRandom"),
      normalRandom: weightedRatio("normalRandom"),
      fixed: weightedRatio("fixed"),
    },
  };
}
