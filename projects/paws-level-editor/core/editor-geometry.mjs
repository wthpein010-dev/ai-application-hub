export const TILE_SIZE = 8;
export const DEFAULT_BOARD = Object.freeze({ width: 7, height: 8 });
export const BOARD_LIMITS = Object.freeze({
  minWidth: 4,
  maxWidth: 16,
  minHeight: 4,
  maxHeight: 20,
});

const GRID_UNIT_PATTERN = /^sheep_(\d+)x(\d+)_mini8$/iu;

function integer(value) {
  const result = Number(value);
  return Number.isInteger(result) ? result : null;
}

function validBoardSize(width, height) {
  return (
    Number.isInteger(width)
    && Number.isInteger(height)
    && width >= BOARD_LIMITS.minWidth
    && width <= BOARD_LIMITS.maxWidth
    && height >= BOARD_LIMITS.minHeight
    && height <= BOARD_LIMITS.maxHeight
  );
}

export function parseGridUnit(value) {
  const match = GRID_UNIT_PATTERN.exec(String(value ?? ""));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return validBoardSize(width, height) ? { width, height } : null;
}

export function buildGridUnit(widthValue, heightValue) {
  const width = integer(widthValue);
  const height = integer(heightValue);
  if (width === null || width < BOARD_LIMITS.minWidth || width > BOARD_LIMITS.maxWidth) {
    throw new RangeError(`board width must be ${BOARD_LIMITS.minWidth}-${BOARD_LIMITS.maxWidth}`);
  }
  if (height === null || height < BOARD_LIMITS.minHeight || height > BOARD_LIMITS.maxHeight) {
    throw new RangeError(`board height must be ${BOARD_LIMITS.minHeight}-${BOARD_LIMITS.maxHeight}`);
  }
  return `sheep_${width}x${height}_mini8`;
}

export function boardMicroBounds(document) {
  const parsed = parseGridUnit(document?.gridUnit);
  const requestedWidth = integer(document?.board?.width);
  const requestedHeight = integer(document?.board?.height);
  const widthFields = validBoardSize(requestedWidth, requestedHeight)
    ? requestedWidth
    : parsed?.width ?? DEFAULT_BOARD.width;
  const heightFields = validBoardSize(requestedWidth, requestedHeight)
    ? requestedHeight
    : parsed?.height ?? DEFAULT_BOARD.height;
  const width = widthFields * TILE_SIZE;
  const height = heightFields * TILE_SIZE;
  return {
    widthFields,
    heightFields,
    width,
    height,
    maxX: width - TILE_SIZE,
    maxY: height - TILE_SIZE,
  };
}

export function overlapsWithPositiveArea(left, right) {
  return (
    Number(left?.x) < Number(right?.x) + TILE_SIZE
    && Number(left?.x) + TILE_SIZE > Number(right?.x)
    && Number(left?.y) < Number(right?.y) + TILE_SIZE
    && Number(left?.y) + TILE_SIZE > Number(right?.y)
  );
}

export function tileFitsBoard(tile, bounds) {
  return (
    Number.isInteger(tile?.x)
    && Number.isInteger(tile?.y)
    && tile.x >= 0
    && tile.y >= 0
    && tile.x <= bounds.maxX
    && tile.y <= bounds.maxY
  );
}

function failure(code, reason) {
  return { ok: false, code, reason };
}

function sameLayerCollision(tile, other) {
  return Number(tile.layer) === Number(other.layer) && overlapsWithPositiveArea(tile, other);
}

export function planTilePlacement(document, tile) {
  const bounds = boardMicroBounds(document);
  const requested = structuredClone(tile ?? {});
  if (!tileFitsBoard(requested, bounds)) {
    return failure("out-of-board", "砖块超出当前棋盘范围。");
  }
  if (!Number.isInteger(requested.layer) || requested.layer < 1) {
    return failure("invalid-layer", "砖块层级必须是大于 0 的整数。");
  }
  const existing = Array.isArray(document?.tiles) ? document.tiles : [];
  const startLayer = requested.layer;
  const highest = existing.reduce(
    (maximum, current) => Math.max(maximum, Number(current?.layer) || 1),
    startLayer,
  );
  const endLayer = Math.max(startLayer, highest + existing.length + 64);
  for (let layer = startLayer; layer <= endLayer; layer += 1) {
    const candidate = { ...requested, layer };
    if (!existing.some((other) => sameLayerCollision(candidate, other))) {
      return {
        ok: true,
        tile: candidate,
        adjustedLayer: layer !== startLayer,
      };
    }
  }
  return failure("no-free-layer", "当前位置没有可用层级。");
}

export function planTileMove(document, tileUids, {
  dx = 0,
  dy = 0,
  layerDelta = 0,
} = {}) {
  const values = { dx: integer(dx), dy: integer(dy), layerDelta: integer(layerDelta) };
  if (Object.values(values).some((value) => value === null)) {
    return failure("invalid-delta", "移动距离和层级变化必须是整数。");
  }
  const wanted = new Set(tileUids ?? []);
  const source = Array.isArray(document?.tiles) ? document.tiles : [];
  const selected = source.filter(({ uid }) => wanted.has(uid));
  if (!selected.length) {
    return failure("empty-selection", "请先选择要移动的砖块。");
  }
  const moved = selected.map((tile) => ({
    ...structuredClone(tile),
    x: tile.x + values.dx,
    y: tile.y + values.dy,
    layer: tile.layer + values.layerDelta,
  }));
  const bounds = boardMicroBounds(document);
  if (moved.some((tile) => !tileFitsBoard(tile, bounds))) {
    return failure("out-of-board", "移动后砖块会超出棋盘范围。");
  }
  if (moved.some((tile) => !Number.isInteger(tile.layer) || tile.layer < 1)) {
    return failure("invalid-layer", "移动后层级不能低于 1。");
  }
  const unselected = source.filter(({ uid }) => !wanted.has(uid));
  if (moved.some((tile) => unselected.some((other) => sameLayerCollision(tile, other)))) {
    return failure("same-layer-overlap", "移动后会与同层砖块发生面积重叠。");
  }
  return { ok: true, tiles: moved, dx: values.dx, dy: values.dy, layerDelta: values.layerDelta };
}

export function filterTilesByLayerView(tiles, layerView = { mode: "all", layer: 1 }) {
  const source = Array.isArray(tiles) ? tiles : [];
  const mode = ["all", "through", "single"].includes(layerView?.mode)
    ? layerView.mode
    : "all";
  const layer = Math.max(1, integer(layerView?.layer) ?? 1);
  if (mode === "through") return source.filter((tile) => Number(tile.layer) <= layer);
  if (mode === "single") return source.filter((tile) => Number(tile.layer) === layer);
  return source;
}

function pasteCandidateOffsets(bounds, step) {
  const offsets = [];
  for (let dx = -bounds.width; dx <= bounds.width; dx += step) {
    for (let dy = -bounds.height; dy <= bounds.height; dy += step) {
      if (dx || dy) offsets.push({ dx, dy });
    }
  }
  const directionRank = ({ dx, dy }) => {
    if (dx > 0 && dy === 0) return 0;
    if (dx === 0 && dy > 0) return 1;
    if (dx < 0 && dy === 0) return 2;
    if (dx === 0 && dy < 0) return 3;
    return 4;
  };
  return offsets.sort((left, right) => (
    left.dx ** 2 + left.dy ** 2 - (right.dx ** 2 + right.dy ** 2)
    || directionRank(left) - directionRank(right)
    || Math.abs(left.dy) - Math.abs(right.dy)
    || left.dy - right.dy
    || left.dx - right.dx
  ));
}

function candidatesAreSafe(document, candidates) {
  const bounds = boardMicroBounds(document);
  if (candidates.some((tile) => !tileFitsBoard(tile, bounds))) return false;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      if (sameLayerCollision(candidates[leftIndex], candidates[rightIndex])) return false;
    }
  }
  const existing = Array.isArray(document?.tiles) ? document.tiles : [];
  return !candidates.some((tile) => existing.some((other) => sameLayerCollision(tile, other)));
}

export function findPastePlacement(document, sourceTiles, { step = TILE_SIZE } = {}) {
  const clipboard = structuredClone(Array.isArray(sourceTiles) ? sourceTiles : []);
  if (!clipboard.length) return failure("empty-clipboard", "没有可粘贴的砖块。");
  const safeStep = [1, 2, 4, 8].includes(Number(step)) ? Number(step) : TILE_SIZE;
  const bounds = boardMicroBounds(document);
  for (const { dx, dy } of pasteCandidateOffsets(bounds, safeStep)) {
    const candidates = clipboard.map((tile) => ({ ...tile, x: tile.x + dx, y: tile.y + dy }));
    if (candidatesAreSafe(document, candidates)) {
      return { ok: true, dx, dy, tiles: candidates };
    }
  }
  return failure("no-paste-position", "棋盘内没有可容纳当前砖块组合的位置。");
}

export function planBoardResize(document, { width: widthValue, height: heightValue } = {}) {
  const width = integer(widthValue);
  const height = integer(heightValue);
  if (!validBoardSize(width, height)) {
    return failure(
      "invalid-board-size",
      `棋盘宽度需为 ${BOARD_LIMITS.minWidth}–${BOARD_LIMITS.maxWidth}，高度需为 ${BOARD_LIMITS.minHeight}–${BOARD_LIMITS.maxHeight}。`,
    );
  }
  const bounds = boardMicroBounds({ board: { width, height } });
  const outside = (document?.tiles ?? []).filter((tile) => !tileFitsBoard(tile, bounds));
  if (outside.length) {
    return {
      ...failure("tiles-out-of-board", `新棋盘尺寸会裁掉 ${outside.length} 张砖块。`),
      tileUids: outside.map(({ uid }) => uid),
    };
  }
  return {
    ok: true,
    board: { ...structuredClone(document?.board ?? {}), width, height },
    gridUnit: buildGridUnit(width, height),
  };
}
