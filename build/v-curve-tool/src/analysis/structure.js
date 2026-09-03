export const REMOVED = 0;
export const BOARD = 1;
export const TRAY = 2;

function footprintsOverlap(left, right) {
  return Math.abs(left.x - right.x) < 8 && Math.abs(left.y - right.y) < 8;
}

function positionKey(layer, x, y) {
  return `${layer}|${x}|${y}`;
}

export function buildStructure(tiles) {
  if (!Array.isArray(tiles) || tiles.length === 0) {
    throw new Error("结构至少需要一张砖。");
  }

  const normalizedTiles = [...tiles].sort((left, right) => left.id - right.id);
  const size = normalizedTiles.length;
  const upperByTile = Array.from({ length: size }, () => []);
  const childrenByTile = Array.from({ length: size }, () => []);

  for (let left = 0; left < size; left += 1) {
    for (let right = left + 1; right < size; right += 1) {
      const leftTile = normalizedTiles[left];
      const rightTile = normalizedTiles[right];
      if (leftTile.layer === rightTile.layer || !footprintsOverlap(leftTile, rightTile)) {
        continue;
      }
      const upper = leftTile.layer > rightTile.layer ? left : right;
      const lower = upper === left ? right : left;
      upperByTile[lower].push(upper);
      childrenByTile[upper].push(lower);
    }
  }

  const idsAtPosition = new Map();
  for (let id = 0; id < size; id += 1) {
    const tile = normalizedTiles[id];
    const key = positionKey(tile.layer, tile.x, tile.y);
    const ids = idsAtPosition.get(key) ?? [];
    ids.push(id);
    idsAtPosition.set(key, ids);
  }

  const leftNeighbors = Array.from({ length: size }, () => []);
  const rightNeighbors = Array.from({ length: size }, () => []);
  for (let id = 0; id < size; id += 1) {
    const tile = normalizedTiles[id];
    leftNeighbors[id] = [...(idsAtPosition.get(
      positionKey(tile.layer, tile.x - 8, tile.y),
    ) ?? [])];
    rightNeighbors[id] = [...(idsAtPosition.get(
      positionKey(tile.layer, tile.x + 8, tile.y),
    ) ?? [])];
  }

  return {
    tiles: normalizedTiles,
    size,
    upperByTile,
    childrenByTile,
    leftNeighbors,
    rightNeighbors,
  };
}

export function createBoardState(structure) {
  return {
    structure,
    status: new Uint8Array(structure.size).fill(BOARD),
    upperLiveCount: Uint16Array.from(
      structure.upperByTile,
      (parents) => parents.length,
    ),
    removedCount: 0,
    trayCount: 0,
  };
}

export function cloneBoardState(state) {
  return {
    structure: state.structure,
    status: state.status.slice(),
    upperLiveCount: state.upperLiveCount.slice(),
    removedCount: state.removedCount,
    trayCount: state.trayCount,
  };
}

function hasBoardNeighbor(state, ids) {
  for (const id of ids) {
    if (state.status[id] === BOARD) return true;
  }
  return false;
}

export function isAvailable(structure, state, id) {
  if (state.status[id] !== BOARD || state.upperLiveCount[id] !== 0) return false;
  return !(
    hasBoardNeighbor(state, structure.leftNeighbors[id])
    && hasBoardNeighbor(state, structure.rightNeighbors[id])
  );
}

export function availableIds(structure, state) {
  const result = [];
  for (let id = 0; id < structure.size; id += 1) {
    if (isAvailable(structure, state, id)) result.push(id);
  }
  return result;
}

export function countAvailable(structure, state) {
  let count = 0;
  for (let id = 0; id < structure.size; id += 1) {
    if (isAvailable(structure, state, id)) count += 1;
  }
  return count;
}

function leaveBoard(state, id) {
  if (state.status[id] !== BOARD) return;
  const { structure } = state;
  for (const child of structure.childrenByTile[id]) {
    if (state.status[child] === BOARD && state.upperLiveCount[child] > 0) {
      state.upperLiveCount[child] -= 1;
    }
  }
}

export function moveToTray(state, id) {
  if (state.status[id] !== BOARD) return false;
  leaveBoard(state, id);
  state.status[id] = TRAY;
  state.trayCount += 1;
  return true;
}

export function removeFromBoard(state, ids) {
  for (const id of ids) {
    if (state.status[id] === REMOVED) continue;
    if (state.status[id] === BOARD) leaveBoard(state, id);
    if (state.status[id] === TRAY) state.trayCount -= 1;
    state.status[id] = REMOVED;
    state.removedCount += 1;
  }
}
