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

function overlapPatch(lower, upper) {
  const left = Math.max(lower.x, upper.x);
  const top = Math.max(lower.y, upper.y);
  const right = Math.min(lower.x + TILE_SIZE, upper.x + TILE_SIZE);
  const bottom = Math.min(lower.y + TILE_SIZE, upper.y + TILE_SIZE);
  if (right <= left || bottom <= top) return null;
  return {
    x: left - lower.x,
    y: top - lower.y,
    width: right - left,
    height: bottom - top,
    dx: upper.x - lower.x,
    dy: upper.y - lower.y,
  };
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
      result.set(tile.uid, {
        covered: false,
        sideBlocked: false,
        hiddenPattern: false,
        occlusionPatches: [],
      });
      continue;
    }
    const higherTiles = active.filter(
      (candidate) => candidate.layer > tile.layer && overlaps(tile, candidate),
    ).sort((left, right) =>
      Number(left.layer) - Number(right.layer)
      || Number(left.y) - Number(right.y)
      || Number(left.x) - Number(right.x)
      || String(left.uid).localeCompare(String(right.uid)));
    const sideBlocked =
      positions.has(`${tile.layer}|${tile.x - TILE_SIZE}|${tile.y}`) &&
      positions.has(`${tile.layer}|${tile.x + TILE_SIZE}|${tile.y}`);
    result.set(tile.uid, {
      covered: higherTiles.length > 0,
      sideBlocked,
      hiddenPattern: microcellCoverage(tile, higherTiles) >= 55,
      occlusionPatches: higherTiles
        .map((higher) => overlapPatch(tile, higher))
        .filter(Boolean),
    });
  }

  return result;
}
