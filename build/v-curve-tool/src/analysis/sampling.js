// Reference curves alternate tray-state samples: do not average adjacent buckets.
// Runtime percentiles interpolate; sample counts remain the actual reached bucket.
export function sampleMonteCarlo(points, progress, model = "runtime") {
  if (!Array.isArray(points) || points.length === 0) return null;
  const sorted = [...points].sort((left, right) => left.progress - right.progress);
  if (progress < sorted[0].progress || progress > sorted.at(-1).progress) return null;
  const index = sorted.findIndex((point) => point.progress >= progress);
  const right = sorted[index];
  if (model === "reference") return { ...right, sampleProgress: right.progress };
  const left = sorted[Math.max(0, index - 1)];
  const span = right.progress - left.progress;
  const weight = span === 0 ? 0 : (progress - left.progress) / span;
  const result = { samples: right.samples ?? null, sampleProgress: right.progress };
  for (const field of ["p10", "p50", "p90"]) {
    result[field] = Number.isFinite(left[field]) && Number.isFinite(right[field])
      ? left[field] + (right[field] - left[field]) * weight : null;
  }
  return result;
}
