import { computeCoverage } from "./coverage.mjs";
import {
  filterTilesByLayerView,
  overlapsWithPositiveArea,
} from "./editor-geometry.mjs";

const TILE_SIZE = 8;
const WORLD_TILE_SIZE = 1;
const LAYER_HEIGHT = 0.22;

export function computeSameLayerVisualBias(
  tiles,
  { step = 0.004, maxTotalBias = 0.04 } = {},
) {
  const biasStep = Number(step);
  if (!Number.isFinite(biasStep) || biasStep <= 0) {
    throw new RangeError("visual depth step must be a positive number");
  }
  const totalBiasLimit = Number(maxTotalBias);
  if (!Number.isFinite(totalBiasLimit) || totalBiasLimit <= 0) {
    throw new RangeError("maximum visual depth bias must be a positive number");
  }
  const source = Array.isArray(tiles) ? tiles : [];
  const result = new Map(source.map((tile) => [tile.uid, 0]));
  const orderedTiles = [...source]
    .sort((left, right) =>
      Number(left.layer) - Number(right.layer)
      || Number(left.y) - Number(right.y)
      || Number(left.x) - Number(right.x)
      || String(left.uid).localeCompare(String(right.uid)));
  const colors = new Map();

  for (let index = 0; index < orderedTiles.length; index += 1) {
    const tile = orderedTiles[index];
    const unavailable = new Set();
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = orderedTiles[previousIndex];
      if (Number(previous.layer) !== Number(tile.layer)) continue;
      if (!overlapsWithPositiveArea(previous, tile)) continue;
      unavailable.add(colors.get(previous.uid) ?? 0);
    }
    let color = 0;
    while (unavailable.has(color)) color += 1;
    colors.set(tile.uid, color);
  }
  const maxColor = Math.max(0, ...colors.values());
  const effectiveStep = maxColor > 0
    ? Math.min(biasStep, totalBiasLimit / maxColor)
    : biasStep;
  for (const [uid, color] of colors) {
    result.set(
      uid,
      Math.min(totalBiasLimit, Number((color * effectiveStep).toFixed(6))),
    );
  }
  return result;
}

export function deriveDisplayTiles(sourceTiles, layerView = { mode: "all", layer: 1 }) {
  const source = Array.isArray(sourceTiles) ? sourceTiles : [];
  const coverage = computeCoverage(source);
  const derived = source.map((tile) => {
    const state = coverage.get(tile.uid) ?? {
      covered: false,
      sideBlocked: false,
      hiddenPattern: false,
    };
    return {
      ...tile,
      covered: state.covered,
      sideBlocked: state.sideBlocked,
      hiddenPattern: state.hiddenPattern,
    };
  });
  return filterTilesByLayerView(derived, layerView);
}

export function containImageRect({
  sourceWidth,
  sourceHeight,
  targetX = 0,
  targetY = 0,
  targetWidth,
  targetHeight,
}) {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new TypeError("Image and target dimensions must be positive numbers.");
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: targetX + (targetWidth - width) / 2,
    y: targetY + (targetHeight - height) / 2,
    width,
    height,
  };
}

function boundsFromSource(tiles) {
  const boardTiles = tiles.filter((tile) => !tile.removed && !Number.isInteger(tile.stashedSlot));
  if (boardTiles.length === 0) {
    return { minX: 0, maxX: TILE_SIZE, minY: 0, maxY: TILE_SIZE };
  }
  return {
    minX: Math.min(...boardTiles.map((tile) => tile.x)),
    maxX: Math.max(...boardTiles.map((tile) => tile.x + TILE_SIZE)),
    minY: Math.min(...boardTiles.map((tile) => tile.y)),
    maxY: Math.max(...boardTiles.map((tile) => tile.y + TILE_SIZE)),
  };
}

export function buildRenderTiles(
  documentOrSnapshot,
  { blockImageUrl = (type) => `/api/assets/blocks/${type}` } = {},
) {
  const sourceTiles = Array.isArray(documentOrSnapshot?.tiles) ? documentOrSnapshot.tiles : [];
  const visibleTiles = sourceTiles.filter((tile) => !tile.removed);
  const depthBiasByUid = computeSameLayerVisualBias(sourceTiles);
  const bounds = boundsFromSource(sourceTiles);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const boardDepth = Math.max(WORLD_TILE_SIZE, (bounds.maxY - bounds.minY) / TILE_SIZE);

  return visibleTiles.map((tile) => {
    const inTray = Number.isInteger(tile.stashedSlot);
    const visualDepthBias = inTray ? 0 : (depthBiasByUid.get(tile.uid) ?? 0);
    const traySlot = inTray ? tile.stashedSlot : null;
    const worldX = inTray
      ? (traySlot - 0.5) * 1.35
      : (tile.x + TILE_SIZE / 2 - centerX) / TILE_SIZE;
    const worldZ = inTray
      ? boardDepth / 2 + 2
      : (tile.y + TILE_SIZE / 2 - centerY) / TILE_SIZE;
    return Object.freeze({
      uid: tile.uid,
      type: tile.type,
      layer: tile.layer,
      boardX: tile.x,
      boardY: tile.y,
      worldX,
      worldY: inTray
        ? 0.12
        : Number((tile.layer * LAYER_HEIGHT + visualDepthBias).toFixed(6)),
      worldZ,
      width: WORLD_TILE_SIZE,
      height: 0.16,
      depth: WORLD_TILE_SIZE,
      textureUrl: blockImageUrl(tile.type),
      faceDown: Boolean(tile.faceDown ?? tile.presetColorType === 2),
      covered: Boolean(tile.covered),
      sideBlocked: Boolean(tile.sideBlocked),
      blocked: Boolean(tile.covered || tile.sideBlocked),
      hiddenPattern: Boolean(tile.hiddenPattern),
      selected: Boolean(tile.selected),
      location: inTray ? "tray" : "board",
      traySlot,
      visualDepthBias,
    });
  });
}

export function computeRenderBounds(renderTiles) {
  const tiles = renderTiles.filter((tile) => tile.location === "board");
  if (tiles.length === 0) {
    return { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5, width: 1, depth: 1 };
  }
  const minX = Math.min(...tiles.map((tile) => tile.worldX - tile.width / 2));
  const maxX = Math.max(...tiles.map((tile) => tile.worldX + tile.width / 2));
  const minZ = Math.min(...tiles.map((tile) => tile.worldZ - tile.depth / 2));
  const maxZ = Math.max(...tiles.map((tile) => tile.worldZ + tile.depth / 2));
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}
