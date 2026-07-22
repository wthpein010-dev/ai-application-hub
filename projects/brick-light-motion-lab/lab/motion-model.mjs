export function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0, edge1, value) {
  if (![edge0, edge1, value].every(Number.isFinite)) {
    return 0;
  }

  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const progress = clamp01((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

export function getRevealProgress(distance, tileWidth) {
  if (!Number.isFinite(distance) || !Number.isFinite(tileWidth) || tileWidth <= 0) {
    return 0;
  }

  return smoothstep(tileWidth * 0.28, tileWidth * 0.88, Math.max(0, distance));
}

export function sampleRecordedPath(points, progress) {
  if (!Array.isArray(points) || points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return normalizePoint(points[0]);
  }

  const unitProgress = clamp01(progress);
  const scaled = unitProgress * (points.length - 1);
  const startIndex = Math.min(Math.floor(scaled), points.length - 2);
  const localProgress = scaled - startIndex;
  const start = normalizePoint(points[startIndex]);
  const end = normalizePoint(points[startIndex + 1]);

  return {
    x: start.x + (end.x - start.x) * localProgress,
    y: start.y + (end.y - start.y) * localProgress,
  };
}

function normalizePoint(point) {
  return {
    x: Number.isFinite(point?.x) ? point.x : 0,
    y: Number.isFinite(point?.y) ? point.y : 0,
  };
}
