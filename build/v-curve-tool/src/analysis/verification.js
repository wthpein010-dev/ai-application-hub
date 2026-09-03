export function hasValidAverageDeadlockProgress(simulation) {
  const count = simulation?.deadlockedCount;
  if (!Number.isInteger(count) || count < 0) return false;
  return count === 0
    ? simulation.averageDeadlockProgress === null
    : Number.isFinite(simulation.averageDeadlockProgress);
}
