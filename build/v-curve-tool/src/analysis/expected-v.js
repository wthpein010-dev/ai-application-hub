function buildAncestorCounts(structure) {
  const ancestors = Array.from({ length: structure.size }, () => new Set());
  const order = Array.from({ length: structure.size }, (_, id) => id)
    .sort((left, right) => (
      structure.tiles[right].layer - structure.tiles[left].layer
      || left - right
    ));

  for (const id of order) {
    for (const parent of structure.upperByTile[id]) {
      ancestors[id].add(parent);
      for (const ancestor of ancestors[parent]) ancestors[id].add(ancestor);
    }
  }
  return ancestors.map((set) => set.size);
}

function cleanNumber(value) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-12 ? rounded : value;
}

export function computeExpectedV(structure) {
  const n = structure.size;
  const ancestorCounts = buildAncestorCounts(structure);
  const histogram = new Uint32Array(n + 1);
  for (const count of ancestorCounts) histogram[count] += 1;

  const logFactorial = new Float64Array(n + 1);
  for (let value = 2; value <= n; value += 1) {
    logFactorial[value] = logFactorial[value - 1] + Math.log(value);
  }
  const logChoose = (total, picked) => {
    if (picked < 0 || picked > total || total < 0) return Number.NEGATIVE_INFINITY;
    return logFactorial[total]
      - logFactorial[picked]
      - logFactorial[total - picked];
  };

  const points = [];
  for (let removed = 0; removed < n; removed += 1) {
    const denominator = logChoose(n, removed);
    let expected = 0;
    for (let ancestors = 0; ancestors <= removed; ancestors += 1) {
      const count = histogram[ancestors];
      if (count === 0) continue;
      const numerator = logChoose(n - ancestors - 1, removed - ancestors);
      if (Number.isFinite(numerator)) {
        expected += count * Math.exp(numerator - denominator);
      }
    }
    points.push({ x: removed / n, removed, y: cleanNumber(expected) });
  }
  points.push({ x: 1, removed: n, y: 0 });
  return points;
}

export { buildAncestorCounts };
