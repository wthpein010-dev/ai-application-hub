import { boardMicroBounds, overlapsWithPositiveArea, tileFitsBoard } from "./editor-geometry.mjs";
import { solveLevel } from "./level-solver.mjs";
import { validateLevelForPublish } from "./level-validator.mjs";

const STANDARD_LAYER_CAPACITY = 7 * 8;
const GEOMETRY_RULE = "same-layer-zero-overlap-v1";

function failure(document, reason) {
  return {
    status: "failed",
    document,
    movedTileUids: [],
    reason,
  };
}

function collides(tile, placed) {
  return placed.some((other) => overlapsWithPositiveArea(tile, other));
}

function candidatePositions(tile, bounds) {
  const candidates = [];
  for (let y = 0; y <= bounds.maxY; y += 1) {
    for (let x = 0; x <= bounds.maxX; x += 1) {
      const dx = x - tile.x;
      const dy = y - tile.y;
      candidates.push({ x, y, dx, dy });
    }
  }
  return candidates.sort((left, right) => (
    left.dx ** 2 + left.dy ** 2 - right.dx ** 2 - right.dy ** 2
    || Math.abs(left.dy) - Math.abs(right.dy)
    || Math.abs(left.dx) - Math.abs(right.dx)
    || left.dy - right.dy
    || left.dx - right.dx
  ));
}

function repairLayer(layerTiles, bounds) {
  const placed = [];
  const movedTileUids = [];
  for (const tile of layerTiles) {
    if (tileFitsBoard(tile, bounds) && !collides(tile, placed)) {
      placed.push(tile);
      continue;
    }
    const candidate = candidatePositions(tile, bounds)
      .find(({ x, y }) => !collides({ ...tile, x, y }, placed));
    if (!candidate) return null;
    const repaired = { ...tile, x: candidate.x, y: candidate.y };
    placed.push(repaired);
    movedTileUids.push(tile.uid);
  }
  return { tiles: placed, movedTileUids };
}

function standardReflow(layerTiles, bounds) {
  const positions = [];
  for (let y = 0; y <= bounds.maxY; y += 8) {
    for (let x = 0; x <= bounds.maxX; x += 8) positions.push({ x, y });
  }
  if (layerTiles.length > positions.length) return null;
  return {
    tiles: layerTiles.map((tile, index) => ({ ...tile, ...positions[index] })),
    movedTileUids: layerTiles
      .filter((tile, index) => tile.x !== positions[index].x || tile.y !== positions[index].y)
      .map(({ uid }) => uid),
  };
}

function repairTiles(document) {
  const bounds = boardMicroBounds(document);
  const source = document.tiles;
  const groups = new Map();
  source.forEach((tile, index) => {
    const group = groups.get(tile.layer) ?? [];
    group.push({ tile, index });
    groups.set(tile.layer, group);
  });
  const repaired = [...source];
  const movedTileUids = [];

  for (const group of groups.values()) {
    const layerTiles = group.map(({ tile }) => tile);
    if (layerTiles.length > STANDARD_LAYER_CAPACITY) return null;
    const result = repairLayer(layerTiles, bounds) ?? standardReflow(layerTiles, bounds);
    if (!result) return null;
    result.tiles.forEach((tile, position) => {
      repaired[group[position].index] = tile;
    });
    movedTileUids.push(...result.movedTileUids);
  }
  return { tiles: repaired, movedTileUids };
}

export function upgradeLegacyAiGeometry(document) {
  if (!document?.designerNote?.aiGeneration) {
    return { status: "unchanged", document, movedTileUids: [] };
  }
  if (!Array.isArray(document.tiles)) return failure(document, "invalid-tiles");

  const repaired = repairTiles(document);
  if (!repaired) return failure(document, "layer-capacity-exceeded");

  const candidate = structuredClone(document);
  candidate.tiles = repaired.tiles;
  const errors = validateLevelForPublish(candidate)
    .filter(({ severity, code }) => severity === "error" && code !== "unsolvable-ai-level");
  if (errors.length) return failure(document, "publish-validation-failed");

  const solver = solveLevel(candidate);
  if (!solver.solvable || solver.steps !== candidate.tiles.length / 2) {
    return failure(document, "solver-incomplete");
  }
  candidate.designerNote.aiGeneration.geometryUpgrade = {
    rule: GEOMETRY_RULE,
    movedTileUids: repaired.movedTileUids,
    sameLayerOverlapPairs: 0,
  };
  return {
    status: repaired.movedTileUids.length ? "upgraded" : "unchanged",
    document: candidate,
    movedTileUids: repaired.movedTileUids,
  };
}
