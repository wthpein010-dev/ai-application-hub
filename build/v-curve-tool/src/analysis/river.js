import { mulberry32 } from "./random.js";
import { scoreAvailableAfterLeaving } from "./simulate.js";
import {
  availableIds,
  countAvailable,
  createBoardState,
  removeFromBoard,
} from "./structure.js";

function candidateIds(structure, state, available, mode, random) {
  if (available.length <= 24) return available;
  const currentV = available.length;
  return available
    .map((id) => ({
      id,
      score: scoreAvailableAfterLeaving(structure, state, [id], currentV),
      jitter: random(),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return mode === "upper"
          ? right.score - left.score
          : left.score - right.score;
      }
      if (left.jitter !== right.jitter) return right.jitter - left.jitter;
      return left.id - right.id;
    })
    .slice(0, 16)
    .map(({ id }) => id)
    .sort((left, right) => left - right);
}

function choosePair(structure, state, available, mode, random) {
  const ids = candidateIds(structure, state, available, mode, random);
  const currentV = available.length;
  let best = null;
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const pair = [ids[left], ids[right]];
      const candidate = {
        pair,
        score: scoreAvailableAfterLeaving(structure, state, pair, currentV),
        jitter: random(),
      };
      const betterScore = !best || (mode === "upper"
        ? candidate.score > best.score
        : candidate.score < best.score);
      const tiedScore = best && candidate.score === best.score;
      if (betterScore || (tiedScore && candidate.jitter > best.jitter)) best = candidate;
    }
  }
  return best?.pair ?? null;
}

function riverRun(structure, mode, restart) {
  const salt = mode === "upper" ? 0x51f15e : 0xa11ce;
  const random = mulberry32((restart + 1) ^ salt);
  const state = createBoardState(structure);
  const points = [{
    removed: 0,
    progress: 0,
    y: countAvailable(structure, state),
  }];

  while (state.removedCount < structure.size) {
    const available = availableIds(structure, state);
    if (available.length < 2) {
      return {
        completed: false,
        deadlocked: true,
        endProgress: state.removedCount / structure.size,
        points,
      };
    }
    const pair = choosePair(structure, state, available, mode, random);
    removeFromBoard(state, pair);
    points.push({
      removed: state.removedCount,
      progress: state.removedCount / structure.size,
      y: countAvailable(structure, state),
    });
  }

  return {
    completed: true,
    deadlocked: false,
    endProgress: 1,
    points,
  };
}

function envelope(runs, mode, size) {
  const values = new Map();
  for (const run of runs) {
    for (const point of run.points) {
      const bucket = values.get(point.removed) ?? [];
      bucket.push(point.y);
      values.set(point.removed, bucket);
    }
  }
  return [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([removed, bucket]) => ({
      removed,
      progress: removed / size,
      y: mode === "upper" ? Math.max(...bucket) : Math.min(...bucket),
      samples: bucket.length,
    }));
}

export function empiricalRiver(structure, restarts = 20) {
  const runCount = Math.max(1, Math.trunc(Number(restarts)) || 1);
  const upperRuns = [];
  const lowerRuns = [];
  for (let restart = 0; restart < runCount; restart += 1) {
    upperRuns.push(riverRun(structure, "upper", restart));
    lowerRuns.push(riverRun(structure, "lower", restart));
  }
  const upperDeadlocks = upperRuns.filter((run) => run.deadlocked);
  const lowerDeadlocks = lowerRuns.filter((run) => run.deadlocked);

  return {
    restarts: runCount,
    upper: envelope(upperRuns, "upper", structure.size),
    lower: envelope(lowerRuns, "lower", structure.size),
    upperDeadlocks: upperDeadlocks.length,
    lowerDeadlocks: lowerDeadlocks.length,
    upperDeadlockAverageProgress: upperDeadlocks.length
      ? upperDeadlocks.reduce((sum, run) => sum + run.endProgress, 0) / upperDeadlocks.length
      : null,
    lowerDeadlockAverageProgress: lowerDeadlocks.length
      ? lowerDeadlocks.reduce((sum, run) => sum + run.endProgress, 0) / lowerDeadlocks.length
      : null,
  };
}
