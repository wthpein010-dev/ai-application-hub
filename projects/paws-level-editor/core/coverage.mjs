const TILE_SIZE = 8;

function isActive(tile) {
  return !tile.removed && tile.stashedSlot === undefined && tile.stashedSlot !== null;
}

function overlaps(left, right) {
  return (
    left.x < right.x + TILE_SIZE &&
    left.x + TILE_SIZE > right.x &&
    left.y < right.y + TILE_SIZE &&
    left.y + TILE_SIZE > right.y
  );
}

function microcellCoverage(tile, higherTiles) {
  let count = 0;
  for (let row = 0; row < TILE_SIZE; row += 1) {
    for (let column = 0; column < TILE_SIZE; column += 1) {
      const cell = { x: tile.x + column, y: tile.y + row };
      const covered = higherTiles.some(
        (higher) =>
          cell.x < higher.x + TILE_SIZE &&
          cell.x + 1 > higher.x &&
          cell.y < higher.y + TILE_SIZE &&
          cell.y + 1 > higher.y,
      );
      if (covered) {
        count += 1;
      }
    }
  }
  return count;
}

export function computeCoverage(tiles) {
  const list = Array.isArray(tiles) ? tiles : [];
  const active = list.filter(isActive);
  const positions = new Set(
    active.map((tile) => `${tile.layer}|${tile.x}|${tile.y}`),
  );
  const result = new Map();

  for (const tile of list) {
    if (!isActive(tile)) {
      result.set(tile.uid, { covered: false, sideBlocked: false, hiddenPattern: false });
      continue;
    }
    const higherTiles = active.filter(
      (candidate) => candidate.layer > tile.layer && overlaps(tile, candidate),
    );
    const sideBlocked =
      positions.has(`${tile.layer}|${tile.x - TILE_SIZE}|${tile.y}`) &&
      positions.has(`${tile.layer}|${tile.x + TILE_SIZE}|${tile.y}`);
    result.set(tile.uid, {
      covered: higherTiles.length > 0,
      sideBlocked,
      hiddenPattern: microcellCoverage(tile, higherTiles) >= 55,
    });
  }

  return result;
}
