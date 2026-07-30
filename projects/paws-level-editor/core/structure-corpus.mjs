const TILE_SIZE = 8;
const MAX_COMPONENT_GAP = 4;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function orderedTile(left, right) {
  return (
    finiteNumber(left.layer) - finiteNumber(right.layer)
    || finiteNumber(left.y) - finiteNumber(right.y)
    || finiteNumber(left.x) - finiteNumber(right.x)
    || String(left.uid ?? "").localeCompare(String(right.uid ?? ""))
  );
}

function positiveOverlap(left, right) {
  return (
    finiteNumber(left.x) < finiteNumber(right.x) + TILE_SIZE
    && finiteNumber(left.x) + TILE_SIZE > finiteNumber(right.x)
    && finiteNumber(left.y) < finiteNumber(right.y) + TILE_SIZE
    && finiteNumber(left.y) + TILE_SIZE > finiteNumber(right.y)
  );
}

function overlapArea(left, right) {
  const width = Math.min(
    finiteNumber(left.x) + TILE_SIZE,
    finiteNumber(right.x) + TILE_SIZE,
  ) - Math.max(finiteNumber(left.x), finiteNumber(right.x));
  const height = Math.min(
    finiteNumber(left.y) + TILE_SIZE,
    finiteNumber(right.y) + TILE_SIZE,
  ) - Math.max(finiteNumber(left.y), finiteNumber(right.y));
  return Math.max(0, width) * Math.max(0, height);
}

function footprintGap(left, right) {
  const gapX = Math.max(
    0,
    Math.abs(finiteNumber(left.x) - finiteNumber(right.x)) - TILE_SIZE,
  );
  const gapY = Math.max(
    0,
    Math.abs(finiteNumber(left.y) - finiteNumber(right.y)) - TILE_SIZE,
  );
  return Math.hypot(gapX, gapY);
}

function connectedComponents(values, connected) {
  const ordered = [...values].sort(orderedTile);
  const remaining = new Set(ordered.map((_, index) => index));
  const components = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    const component = [];
    while (queue.length) {
      const index = queue.shift();
      component.push(ordered[index]);
      for (const candidate of [...remaining]) {
        if (!connected(ordered[index], ordered[candidate])) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    components.push(component.sort(orderedTile));
  }
  return components.sort((left, right) =>
    orderedTile(left[0], right[0]));
}

export function spatialComponents(tiles) {
  return connectedComponents(
    Array.isArray(tiles) ? tiles : [],
    (left, right) =>
      finiteNumber(left.layer) === finiteNumber(right.layer)
      && !positiveOverlap(left, right)
      && footprintGap(left, right) <= MAX_COMPONENT_GAP,
  );
}

function groupLayers(tiles) {
  const byLayer = new Map();
  for (const tile of [...tiles].sort(orderedTile)) {
    const layer = finiteNumber(tile.layer, 1);
    const values = byLayer.get(layer) ?? [];
    values.push(tile);
    byLayer.set(layer, values);
  }
  return [...byLayer]
    .sort(([left], [right]) => left - right)
    .map(([layer, values]) => ({
      layer,
      tiles: values,
      components: spatialComponents(values),
    }));
}

function componentDescriptor(component, board, layer) {
  const xs = component.map(({ x }) => finiteNumber(x));
  const ys = component.map(({ y }) => finiteNumber(y));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs) + TILE_SIZE;
  const bottom = Math.max(...ys) + TILE_SIZE;
  const maxAnchorX = Math.max(1, finiteNumber(board?.width, 7) * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, finiteNumber(board?.height, 8) * TILE_SIZE - TILE_SIZE);
  const centroidX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const centroidY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  return {
    layer,
    size: component.length,
    centroid: {
      x: centroidX,
      y: centroidY,
      normalizedX: centroidX / maxAnchorX,
      normalizedY: centroidY / maxAnchorY,
    },
    bounds: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    anchors: component.map(({ x, y }) => ({
      x: finiteNumber(x),
      y: finiteNumber(y),
    })),
  };
}

function exposedEdgeRatio(tiles) {
  if (!tiles.length) return 0;
  const anchors = new Set(
    tiles.map(({ x, y }) => `${finiteNumber(x)}|${finiteNumber(y)}`),
  );
  let exposed = 0;
  for (const tile of tiles) {
    const x = finiteNumber(tile.x);
    const y = finiteNumber(tile.y);
    exposed += Number(!anchors.has(`${x - TILE_SIZE}|${y}`));
    exposed += Number(!anchors.has(`${x + TILE_SIZE}|${y}`));
    exposed += Number(!anchors.has(`${x}|${y - TILE_SIZE}`));
    exposed += Number(!anchors.has(`${x}|${y + TILE_SIZE}`));
  }
  return exposed / (tiles.length * 4);
}

function boundaryRatio(tiles, board) {
  if (!tiles.length) return 0;
  const maxX = Math.max(0, finiteNumber(board?.width, 7) * TILE_SIZE - TILE_SIZE);
  const maxY = Math.max(0, finiteNumber(board?.height, 8) * TILE_SIZE - TILE_SIZE);
  const boundaryTiles = tiles.filter(({ x, y }) => {
    const numericX = finiteNumber(x);
    const numericY = finiteNumber(y);
    return numericX <= 0 || numericX >= maxX || numericY <= 0 || numericY >= maxY;
  });
  return boundaryTiles.length / tiles.length;
}

function analyzeLayerRole(layerEntry, board, index, layers) {
  const { layer, tiles, components } = layerEntry;
  const ordinaryCount = tiles.filter((tile) =>
    Number(tile.presetColorType ?? 1) !== 3
    && Number(tile.moldType ?? 1) !== 2).length;
  const trackLowerCount = tiles.filter((tile) =>
    Number(tile.presetColorType ?? 1) === 3
    && Number(tile.moldType ?? 1) !== 2).length;
  const trackTopCount = tiles.filter((tile) =>
    Number(tile.moldType ?? 1) === 2).length;
  const centroid = tiles.length
    ? {
      x: tiles.reduce((sum, tile) => sum + finiteNumber(tile.x), 0) / tiles.length,
      y: tiles.reduce((sum, tile) => sum + finiteNumber(tile.y), 0) / tiles.length,
    }
    : { x: 0, y: 0 };
  const maxAnchorX = Math.max(1, finiteNumber(board?.width, 7) * TILE_SIZE - TILE_SIZE);
  const maxAnchorY = Math.max(1, finiteNumber(board?.height, 8) * TILE_SIZE - TILE_SIZE);
  const previousCount = index > 0 ? layers[index - 1].tiles.length : tiles.length;
  const nextCount = index + 1 < layers.length
    ? layers[index + 1].tiles.length
    : tiles.length;
  return {
    layer,
    normalizedDepth: layers.length > 1 ? index / (layers.length - 1) : 0,
    tileCount: tiles.length,
    ordinaryCount,
    trackLowerCount,
    trackTopCount,
    componentCount: components.length,
    componentSizes: components.map(({ length }) => length),
    components: components.map((component) =>
      componentDescriptor(component, board, layer)),
    exposedEdgeRatio: exposedEdgeRatio(tiles),
    boundaryRatio: boundaryRatio(tiles, board),
    centroid: {
      ...centroid,
      normalizedX: centroid.x / maxAnchorX,
      normalizedY: centroid.y / maxAnchorY,
    },
    previousCountDelta: index > 0 ? tiles.length - previousCount : 0,
    nextCountDelta: index + 1 < layers.length ? nextCount - tiles.length : 0,
  };
}

function transitionKind(lowerComponents, upperComponents, overlapEdges) {
  if (!overlapEdges.length) return "detached";
  if (upperComponents > lowerComponents) return "split";
  if (upperComponents < lowerComponents) return "merge";
  return "continue";
}

function analyzeTransition(lower, upper) {
  const lowerComponentByUid = new Map();
  lower.components.forEach((component, componentIndex) => {
    component.forEach(({ uid }) => lowerComponentByUid.set(uid, componentIndex));
  });
  const upperComponentByUid = new Map();
  upper.components.forEach((component, componentIndex) => {
    component.forEach(({ uid }) => upperComponentByUid.set(uid, componentIndex));
  });
  const overlapEdges = [];
  for (const lowerTile of lower.tiles) {
    for (const upperTile of upper.tiles) {
      const area = overlapArea(lowerTile, upperTile);
      if (area <= 0) continue;
      overlapEdges.push({
        lowerUid: lowerTile.uid,
        upperUid: upperTile.uid,
        lowerComponent: lowerComponentByUid.get(lowerTile.uid),
        upperComponent: upperComponentByUid.get(upperTile.uid),
        area,
        dx: finiteNumber(upperTile.x) - finiteNumber(lowerTile.x),
        dy: finiteNumber(upperTile.y) - finiteNumber(lowerTile.y),
      });
    }
  }
  return {
    lowerLayer: lower.layer,
    upperLayer: upper.layer,
    lowerTileCount: lower.tiles.length,
    upperTileCount: upper.tiles.length,
    tileCountDelta: upper.tiles.length - lower.tiles.length,
    lowerComponentCount: lower.components.length,
    upperComponentCount: upper.components.length,
    overlapEdges,
    overlapEdgeCount: overlapEdges.length,
    kind: transitionKind(
      lower.components.length,
      upper.components.length,
      overlapEdges,
    ),
  };
}

function buildTowerChains(layers, transitions) {
  const tileByUid = new Map(
    layers.flatMap(({ tiles }) => tiles).map((tile) => [tile.uid, tile]),
  );
  const adjacency = new Map();
  for (const transition of transitions) {
    for (const { lowerUid, upperUid } of transition.overlapEdges) {
      const lowerNeighbors = adjacency.get(lowerUid) ?? new Set();
      lowerNeighbors.add(upperUid);
      adjacency.set(lowerUid, lowerNeighbors);
      const upperNeighbors = adjacency.get(upperUid) ?? new Set();
      upperNeighbors.add(lowerUid);
      adjacency.set(upperUid, upperNeighbors);
    }
  }
  const remaining = new Set(adjacency.keys());
  const chains = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    const tileUids = [];
    while (queue.length) {
      const uid = queue.shift();
      tileUids.push(uid);
      for (const neighbor of adjacency.get(uid) ?? []) {
        if (!remaining.has(neighbor)) continue;
        remaining.delete(neighbor);
        queue.push(neighbor);
      }
    }
    const chainTiles = tileUids
      .map((uid) => tileByUid.get(uid))
      .filter(Boolean)
      .sort(orderedTile);
    const chainLayers = [...new Set(chainTiles.map(({ layer }) => finiteNumber(layer)))]
      .sort((left, right) => left - right);
    chains.push({
      depth: chainLayers.length,
      layerStart: chainLayers[0],
      layerEnd: chainLayers.at(-1),
      tileCount: chainTiles.length,
      tileUids: chainTiles.map(({ uid }) => uid),
      centroid: {
        x: chainTiles.reduce((sum, tile) => sum + finiteNumber(tile.x), 0)
          / chainTiles.length,
        y: chainTiles.reduce((sum, tile) => sum + finiteNumber(tile.y), 0)
          / chainTiles.length,
      },
    });
  }
  return chains.sort((left, right) =>
    right.depth - left.depth
    || right.tileCount - left.tileCount
    || left.layerStart - right.layerStart
    || left.centroid.y - right.centroid.y
    || left.centroid.x - right.centroid.x);
}

function analyzeSemanticFillTracks(tiles) {
  const lowerByLayer = new Map();
  for (const tile of tiles) {
    if (
      Number(tile.presetColorType ?? 1) !== 3
      || Number(tile.moldType ?? 1) === 2
    ) {
      continue;
    }
    const layer = finiteNumber(tile.layer, 1);
    const values = lowerByLayer.get(layer) ?? [];
    values.push(tile);
    lowerByLayer.set(layer, values);
  }
  const tracks = [];
  for (const [layer, layerTiles] of [...lowerByLayer]
    .sort(([left], [right]) => left - right)) {
    const orderedLayerTiles = [...layerTiles].sort(orderedTile);
    const candidates = tracks.flatMap((track, trackIndex) => {
      const previous = track.lowerTiles.at(-1);
      if (!previous || finiteNumber(previous.layer) !== layer - 1) return [];
      return orderedLayerTiles.flatMap((tile, tileIndex) => {
        const dx = Math.abs(finiteNumber(tile.x) - finiteNumber(previous.x));
        const dy = Math.abs(finiteNumber(tile.y) - finiteNumber(previous.y));
        if (dx > MAX_COMPONENT_GAP || dy > MAX_COMPONENT_GAP) return [];
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
    const usedTracks = new Set();
    const usedTiles = new Set();
    for (const candidate of candidates) {
      if (
        usedTracks.has(candidate.trackIndex)
        || usedTiles.has(candidate.tileIndex)
      ) {
        continue;
      }
      tracks[candidate.trackIndex].lowerTiles.push(
        orderedLayerTiles[candidate.tileIndex],
      );
      usedTracks.add(candidate.trackIndex);
      usedTiles.add(candidate.tileIndex);
    }
    orderedLayerTiles.forEach((tile, tileIndex) => {
        if (!usedTiles.has(tileIndex)) tracks.push({ lowerTiles: [tile] });
      });
  }

  const tops = tiles
    .filter(({ moldType }) => Number(moldType ?? 1) === 2)
    .sort(orderedTile);
  const usedTops = new Set();
  return tracks
    .map(({ lowerTiles }) => {
      const orderedLower = [...lowerTiles].sort(orderedTile);
      const last = orderedLower.at(-1);
      const topMatch = tops
        .map((top, topIndex) => ({
          top,
          topIndex,
          dx: Math.abs(finiteNumber(top.x) - finiteNumber(last.x)),
          dy: Math.abs(finiteNumber(top.y) - finiteNumber(last.y)),
        }))
        .filter(({ top, topIndex, dx, dy }) =>
          !usedTops.has(topIndex)
          && finiteNumber(top.layer) === finiteNumber(last.layer) + 1
          && dx <= MAX_COMPONENT_GAP
          && dy <= MAX_COMPONENT_GAP)
        .sort((left, right) =>
          Math.hypot(left.dx, left.dy) - Math.hypot(right.dx, right.dy)
          || left.topIndex - right.topIndex)[0];
      if (topMatch) usedTops.add(topMatch.topIndex);
      if (orderedLower.length < 2 && !topMatch) return null;
      return {
        lowerDepth: orderedLower.length,
        depth: orderedLower.length + Number(Boolean(topMatch)),
        explicitTop: Boolean(topMatch),
        layerStart: finiteNumber(orderedLower[0].layer),
        layerEnd: finiteNumber(topMatch?.top.layer, last.layer),
        lowerAnchors: orderedLower.map(({ layer, x, y }) => ({
          layer: finiteNumber(layer),
          x: finiteNumber(x),
          y: finiteNumber(y),
        })),
        topAnchor: topMatch
          ? {
            layer: finiteNumber(topMatch.top.layer),
            x: finiteNumber(topMatch.top.x),
            y: finiteNumber(topMatch.top.y),
          }
          : null,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.layerStart - right.layerStart
      || left.lowerAnchors[0].y - right.lowerAnchors[0].y
      || left.lowerAnchors[0].x - right.lowerAnchors[0].x);
}

function collectPlatformMotifs(layerRoles) {
  const maximumLayer = Math.max(1, ...layerRoles.map(({ layer }) => layer));
  return layerRoles.flatMap((role) =>
    role.components.map((component) => ({
      ...component,
      normalizedLayer: role.layer / maximumLayer,
      layerTileCount: role.tileCount,
      layerComponentCount: role.componentCount,
      layerExposedEdgeRatio: role.exposedEdgeRatio,
      layerBoundaryRatio: role.boundaryRatio,
    })));
}

function collectReleaseMotifs(layerRoles, layerTransitions) {
  return layerTransitions
    .filter((transition) =>
      transition.tileCountDelta < 0
      || transition.upperComponentCount < transition.lowerComponentCount)
    .map((transition) => ({
      ...transition,
      lowerRole: layerRoles.find(({ layer }) =>
        layer === transition.lowerLayer),
      upperRole: layerRoles.find(({ layer }) =>
        layer === transition.upperLayer),
    }));
}

export function extractStructureGrammar(document) {
  const tiles = (Array.isArray(document?.tiles) ? document.tiles : [])
    .map((tile, index) => ({
      ...tile,
      uid: tile.uid ?? `structure-tile-${index + 1}`,
    }));
  const board = {
    width: Math.max(1, finiteNumber(document?.board?.width, 7)),
    height: Math.max(1, finiteNumber(document?.board?.height, 8)),
  };
  const layers = groupLayers(tiles);
  const layerRoles = layers.map((layer, index) =>
    analyzeLayerRole(layer, board, index, layers));
  const layerTransitions = layers.slice(0, -1)
    .map((layer, index) => analyzeTransition(layer, layers[index + 1]));
  const towerChains = buildTowerChains(layers, layerTransitions);
  const platformMotifs = collectPlatformMotifs(layerRoles);
  const releaseMotifs = collectReleaseMotifs(
    layerRoles,
    layerTransitions,
  );
  const fillTracks = analyzeSemanticFillTracks(tiles);
  return {
    sourceFileName: String(document?.fileName ?? ""),
    board,
    tileCount: tiles.length,
    layerCount: layers.length,
    layerRoles,
    layerTransitions,
    towerChains,
    platformMotifs,
    releaseMotifs,
    fillTracks,
    fullRandomRatio: tiles.length
      ? tiles.filter(({ type }) => Number(type) === -1).length / tiles.length
      : 0,
    topologyHash: topologyHash({
      tiles,
      stagePlan: document?.designerNote?.aiGeneration?.stagePlan ?? [],
      fillTracks,
    }),
  };
}

function incrementDistribution(distribution, value) {
  const key = String(value);
  distribution[key] = (distribution[key] ?? 0) + 1;
}

export function mergeStructureGrammars(grammars) {
  const families = (Array.isArray(grammars) ? grammars : [])
    .filter((grammar) => grammar && typeof grammar === "object")
    .map((grammar, familyIndex) => ({
      ...structuredClone(grammar),
      familyIndex,
      familyKey: grammar.topologyHash
        ?? topologyHash({ tiles: [], stagePlan: [], fillTracks: [] }),
    }));
  if (!families.length) {
    throw new Error("没有可用于学习的结构语法。");
  }
  const distributions = {
    tileCounts: {},
    layerCounts: {},
    fillTrackCounts: {},
    componentCounts: {},
    towerDepths: {},
  };
  for (const family of families) {
    incrementDistribution(distributions.tileCounts, family.tileCount);
    incrementDistribution(distributions.layerCounts, family.layerCount);
    incrementDistribution(distributions.fillTrackCounts, family.fillTracks.length);
    family.layerRoles.forEach(({ componentCount }) =>
      incrementDistribution(distributions.componentCounts, componentCount));
    family.towerChains.forEach(({ depth }) =>
      incrementDistribution(distributions.towerDepths, depth));
  }
  return {
    sampleCount: families.length,
    families,
    distributions,
    platformMotifs: families.flatMap((family) =>
      family.platformMotifs.map((motif) => ({
        ...motif,
        familyIndex: family.familyIndex,
        sourceFileName: family.sourceFileName,
      }))),
    releaseMotifs: families.flatMap((family) =>
      family.releaseMotifs.map((motif) => ({
        ...motif,
        familyIndex: family.familyIndex,
        sourceFileName: family.sourceFileName,
      }))),
    towerChains: families.flatMap((family) =>
      family.towerChains.map((chain) => ({
        ...chain,
        familyIndex: family.familyIndex,
        sourceFileName: family.sourceFileName,
      }))),
  };
}

function stableStructure(value) {
  if (Array.isArray(value)) return value.map(stableStructure);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableStructure(nested)]),
  );
}

function fnv1a(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function topologyHash({
  tiles = [],
  stagePlan = [],
  fillTracks = [],
} = {}) {
  const structuralTiles = [...tiles]
    .sort(orderedTile)
    .map(({ x, y, layer, moldType = 1, presetColorType = 1 }) => ({
      x: finiteNumber(x),
      y: finiteNumber(y),
      layer: finiteNumber(layer),
      moldType: finiteNumber(moldType, 1),
      presetColorType: finiteNumber(presetColorType, 1),
    }));
  const structuralStages = stagePlan.map(({
    key,
    layerCount,
    tileCount,
    layerStart,
    layerEnd,
  }) => ({
    key: String(key ?? ""),
    layerCount: finiteNumber(layerCount),
    tileCount: finiteNumber(tileCount),
    layerStart: Number.isFinite(Number(layerStart))
      ? Number(layerStart)
      : null,
    layerEnd: Number.isFinite(Number(layerEnd))
      ? Number(layerEnd)
      : null,
  }));
  const structuralTracks = fillTracks.map((track) => ({
    lowerDepth: finiteNumber(track.lowerDepth),
    layerStart: finiteNumber(track.layerStart),
    layerEnd: finiteNumber(track.layerEnd),
    lowerAnchors: (track.lowerAnchors ?? []).map(({ layer, x, y }) => ({
      layer: finiteNumber(layer),
      x: finiteNumber(x),
      y: finiteNumber(y),
    })),
    topAnchor: track.topAnchor
      ? {
        layer: finiteNumber(track.topAnchor.layer),
        x: finiteNumber(track.topAnchor.x),
        y: finiteNumber(track.topAnchor.y),
      }
      : null,
  }));
  const serialized = JSON.stringify(stableStructure({
    tiles: structuralTiles,
    stagePlan: structuralStages,
    fillTracks: structuralTracks,
  }));
  return `topology-${fnv1a(serialized)}`;
}
