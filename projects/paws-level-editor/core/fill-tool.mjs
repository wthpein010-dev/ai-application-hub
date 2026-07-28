import {
  TILE_SIZE,
  overlapsWithPositiveArea,
  tileFitsBoard,
} from "./editor-geometry.mjs";

function normalizeBoard(board = {}) {
  const width = Number(board.width);
  const height = Number(board.height);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError("棋盘尺寸无效。");
  }
  return {
    width,
    height,
    maxX: width * TILE_SIZE - TILE_SIZE,
    maxY: height * TILE_SIZE - TILE_SIZE,
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || 0)));
}

export function buildFillCells(start, end, board) {
  const bounds = normalizeBoard(board);
  const startX = clamp(start?.x, 0, bounds.maxX);
  const startY = clamp(start?.y, 0, bounds.maxY);
  const endX = clamp(end?.x, 0, bounds.maxX);
  const endY = clamp(end?.y, 0, bounds.maxY);
  const dx = endX - startX;
  const dy = endY - startY;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const distance = horizontal ? Math.abs(dx) : Math.abs(dy);
  const direction = Math.sign(horizontal ? dx : dy);
  const cells = [];
  for (let index = 0; index <= distance; index += 1) {
    cells.push({
      x: horizontal ? startX + index * direction : startX,
      y: horizontal ? startY : startY + index * direction,
    });
  }
  return cells;
}

function isCoveredByUpperLayer(tile, tiles) {
  return tiles.some((other) =>
    other !== tile
    && Number(other.layer) > Number(tile.layer)
    && overlapsWithPositiveArea(tile, other));
}

export function planFillPlacement(
  document,
  cells,
  {
    startLayer,
    uidFactory = (_, index) => `fill-${Date.now()}-${index + 1}`,
  } = {},
) {
  const firstLayer = Number(startLayer);
  if (!Number.isInteger(firstLayer) || firstLayer < 1) {
    throw new RangeError("平铺起点层须为 ≥1 的整数。");
  }
  const bounds = normalizeBoard(document?.board);
  const existing = Array.isArray(document?.tiles) ? document.tiles : [];
  const additions = [];
  const skipped = [];
  for (const [index, cell] of (cells ?? []).entries()) {
    const candidate = {
      uid: uidFactory(cell, index, firstLayer + index),
      x: Math.round(Number(cell?.x) || 0),
      y: Math.round(Number(cell?.y) || 0),
      layer: firstLayer + index,
      type: -1,
      moldType: 1,
      metaType: 0,
      metaData: 0,
      presetColorType: 3,
    };
    if (!tileFitsBoard(candidate, bounds)) {
      skipped.push({ cell: structuredClone(cell), layer: candidate.layer, reason: "out-of-bounds" });
      continue;
    }
    const working = [...existing, ...additions];
    if (working.some((tile) =>
      Number(tile.layer) === candidate.layer
      && overlapsWithPositiveArea(tile, candidate))) {
      skipped.push({
        cell: structuredClone(cell),
        layer: candidate.layer,
        reason: "same-layer-overlap",
      });
      continue;
    }
    if (working.some((tile) =>
      Number(tile.layer) > candidate.layer
      && overlapsWithPositiveArea(tile, candidate))) {
      skipped.push({
        cell: structuredClone(cell),
        layer: candidate.layer,
        reason: "upper-layer-overlap",
      });
      continue;
    }
    additions.push(candidate);
  }

  const allTiles = [...existing, ...additions];
  for (const tile of additions) {
    if (isCoveredByUpperLayer(tile, allTiles)) {
      tile.presetColorType = 3;
      tile.moldType = 1;
    } else {
      tile.presetColorType = 1;
      tile.moldType = 2;
    }
  }
  return { additions, skipped };
}
