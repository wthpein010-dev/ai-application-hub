const TILE_SIZE = 8;

const SEVERITY_PRIORITY = Object.freeze({
  warning: 1,
  error: 2,
});

function isActiveBoardTile(tile) {
  return Boolean(tile?.uid) && !tile.removed && !Number.isInteger(tile.stashedSlot);
}

function overlapsWithPositiveArea(left, right) {
  return (
    left.x < right.x + TILE_SIZE
    && left.x + TILE_SIZE > right.x
    && left.y < right.y + TILE_SIZE
    && left.y + TILE_SIZE > right.y
  );
}

function relationType(source, target, activePositions) {
  if (target.layer > source.layer && overlapsWithPositiveArea(source, target)) {
    return "upper-blocker";
  }
  if (target.layer < source.layer && overlapsWithPositiveArea(source, target)) {
    return "lower-dependent";
  }
  if (
    target.layer === source.layer
    && target.y === source.y
    && Math.abs(target.x - source.x) === TILE_SIZE
    && activePositions.has(`${source.layer}|${source.x - TILE_SIZE}|${source.y}`)
    && activePositions.has(`${source.layer}|${source.x + TILE_SIZE}|${source.y}`)
  ) {
    return "side-blocker";
  }
  return null;
}

export function analyzeTileRelations(tiles, selectedUids) {
  const active = (Array.isArray(tiles) ? tiles : []).filter(isActiveBoardTile);
  const activePositions = new Set(
    active.map((tile) => `${tile.layer}|${tile.x}|${tile.y}`),
  );
  const selected = new Set(selectedUids ?? []);
  const selectedTiles = active.filter(({ uid }) => selected.has(uid));
  const targetTiles = active.filter(({ uid }) => !selected.has(uid));
  const edges = [];
  const edgeKeys = new Set();
  const relatedUids = new Set();

  for (const source of selectedTiles) {
    for (const target of targetTiles) {
      const type = relationType(source, target, activePositions);
      if (!type) continue;
      const key = `${source.uid}|${target.uid}|${type}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      relatedUids.add(target.uid);
      edges.push({ sourceUid: source.uid, targetUid: target.uid, type });
    }
  }

  return { edges, relatedUids };
}

export function buildIssueSeverityByUid(issues) {
  const result = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    const severity = issue?.severity;
    if (!(severity in SEVERITY_PRIORITY)) continue;
    for (const uid of issue.tileUids ?? []) {
      if (!uid) continue;
      const previous = result.get(uid);
      if (
        !previous
        || SEVERITY_PRIORITY[severity] > SEVERITY_PRIORITY[previous]
      ) {
        result.set(uid, severity);
      }
    }
  }
  return result;
}
