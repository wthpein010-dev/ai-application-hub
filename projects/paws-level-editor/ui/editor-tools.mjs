const TILE_SIZE = 8;

export function boardToScreen(point, viewport) {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

export function screenToBoard(point, viewport) {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  };
}

export function snapValue(value, step = 8) {
  const safeStep = [1, 2, 4, 8].includes(Number(step)) ? Number(step) : 8;
  const snapped = Math.round(value / safeStep) * safeStep;
  return snapped === 0 ? 0 : snapped;
}

export function topmostHit(tiles, point) {
  let result = null;
  let resultIndex = -1;
  tiles.forEach((tile, index) => {
    if (tile.removed) {
      return;
    }
    const hit =
      point.x >= tile.x &&
      point.x < tile.x + TILE_SIZE &&
      point.y >= tile.y &&
      point.y < tile.y + TILE_SIZE;
    if (
      hit &&
      (!result || tile.layer > result.layer || (tile.layer === result.layer && index > resultIndex))
    ) {
      result = tile;
      resultIndex = index;
    }
  });
  return result;
}

export function modifySelection(current, uid, { shiftKey = false, altKey = false } = {}) {
  const next = shiftKey || altKey ? new Set(current) : new Set();
  if (altKey) {
    next.delete(uid);
  } else if (uid) {
    next.add(uid);
  }
  return next;
}

export function boxSelect(tiles, rectangle) {
  const left = Math.min(rectangle.x1, rectangle.x2);
  const right = Math.max(rectangle.x1, rectangle.x2);
  const top = Math.min(rectangle.y1, rectangle.y2);
  const bottom = Math.max(rectangle.y1, rectangle.y2);
  return tiles
    .filter(
      (tile) =>
        !tile.removed &&
        tile.x < right &&
        tile.x + TILE_SIZE > left &&
        tile.y < bottom &&
        tile.y + TILE_SIZE > top,
    )
    .map((tile) => tile.uid);
}

export function dragDelta(startScreen, endScreen, viewport, snapStep = 8) {
  const start = screenToBoard(startScreen, viewport);
  const end = screenToBoard(endScreen, viewport);
  return {
    dx: snapValue(end.x - start.x, snapStep),
    dy: snapValue(end.y - start.y, snapStep),
  };
}
