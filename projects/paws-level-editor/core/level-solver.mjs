import { computeCoverage } from "./coverage.mjs";

const TILE_SIZE = 8;

function overlaps(left, right) {
  return (
    left.x < right.x + TILE_SIZE
    && left.x + TILE_SIZE > right.x
    && left.y < right.y + TILE_SIZE
    && left.y + TILE_SIZE > right.y
  );
}

function accessibleTiles(tiles) {
  const coverage = computeCoverage(tiles);
  return tiles.filter((tile) => {
    const state = coverage.get(tile.uid);
    return !state?.covered && !state?.sideBlocked;
  });
}

function countPairs(tiles) {
  const counts = new Map();
  for (const tile of accessibleTiles(tiles)) {
    counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
  }
  return [...counts.values()]
    .reduce((total, count) => total + Math.floor(count / 2), 0);
}

function releaseScore(tile, active) {
  return active.filter((candidate) =>
    candidate.layer < tile.layer && overlaps(tile, candidate)).length;
}

function rankedPairs(available, active) {
  const pairs = [];
  for (let firstIndex = 0; firstIndex < available.length; firstIndex += 1) {
    const first = available[firstIndex];
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < available.length;
      secondIndex += 1
    ) {
      const second = available[secondIndex];
      if (first.type !== second.type) continue;
      pairs.push({
        first,
        second,
        score:
          (first.layer === second.layer ? 100000 : 0)
          + (first.layer + second.layer) * 100
          + releaseScore(first, active)
          + releaseScore(second, active),
      });
    }
  }
  return pairs
    .sort((left, right) =>
      right.score - left.score
      || left.first.uid.localeCompare(right.first.uid)
      || left.second.uid.localeCompare(right.second.uid))
    .map(({ first, second }) => [first, second]);
}

export function solveLevel(document, { maxNodes = 20000 } = {}) {
  const nodeLimit = Math.max(1, Math.trunc(Number(maxNodes) || 0));
  const source = (Array.isArray(document?.tiles) ? document.tiles : [])
    .map((tile, index) => ({
      ...tile,
      uid: tile.uid || `solver-tile-${index + 1}`,
    }));
  const visited = new Set();
  let nodes = 0;

  const search = (active) => {
    if (!active.length) return [];
    if (nodes >= nodeLimit) return null;
    const key = active.map(({ uid }) => uid).sort().join("|");
    if (visited.has(key)) return null;
    visited.add(key);
    nodes += 1;
    const available = accessibleTiles(active);
    for (const [first, second] of rankedPairs(available, active)) {
      const removed = new Set([first.uid, second.uid]);
      const suffix = search(
        active.filter(({ uid }) => !removed.has(uid)),
      );
      if (suffix) return [[first.uid, second.uid], ...suffix];
    }
    return null;
  };

  const solution = search(source);
  return {
    solvable: Array.isArray(solution),
    moves: solution ?? [],
    steps: solution?.length ?? 0,
    nodes,
    exhausted: !solution && nodes >= nodeLimit,
    initialAccessiblePairs: countPairs(source),
  };
}
