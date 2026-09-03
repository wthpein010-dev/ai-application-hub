import { assignTypes } from "./deal.js";
import { mulberry32 } from "./random.js";
import {
  BOARD,
  TRAY,
  availableIds,
  countAvailable,
  createBoardState,
  isAvailable,
  moveToTray,
  removeFromBoard,
} from "./structure.js";

const sideDependentsCache = new WeakMap();

function sideDependents(structure) {
  let cached = sideDependentsCache.get(structure);
  if (cached) return cached;
  cached = Array.from({ length: structure.size }, () => []);
  for (let id = 0; id < structure.size; id += 1) {
    for (const neighbor of structure.leftNeighbors[id]) cached[neighbor].push(id);
    for (const neighbor of structure.rightNeighbors[id]) cached[neighbor].push(id);
  }
  sideDependentsCache.set(structure, cached);
  return cached;
}

function hasBoard(state, ids, leaving) {
  for (const id of ids) {
    if (state.status[id] === BOARD && !leaving.has(id)) return true;
  }
  return false;
}

function isAvailableAfterLeaving(structure, state, id, leaving) {
  if (state.status[id] !== BOARD || leaving.has(id)) return false;
  let upperLiveCount = state.upperLiveCount[id];
  for (const upperId of structure.upperByTile[id]) {
    if (leaving.has(upperId)) upperLiveCount -= 1;
  }
  if (upperLiveCount !== 0) return false;
  return !(
    hasBoard(state, structure.leftNeighbors[id], leaving)
    && hasBoard(state, structure.rightNeighbors[id], leaving)
  );
}

function vAfterLeaving(structure, state, ids, currentV) {
  const leaving = new Set(ids.filter((id) => state.status[id] === BOARD));
  if (leaving.size === 0) return currentV;
  const affected = new Set(leaving);
  const dependents = sideDependents(structure);
  for (const id of leaving) {
    for (const child of structure.childrenByTile[id]) affected.add(child);
    for (const dependent of dependents[id]) affected.add(dependent);
  }

  let nextV = currentV;
  for (const id of affected) {
    const before = isAvailable(structure, state, id);
    const after = isAvailableAfterLeaving(structure, state, id, leaving);
    nextV += Number(after) - Number(before);
  }
  return nextV;
}

export function scoreAvailableAfterLeaving(structure, state, ids, currentV) {
  return vAfterLeaving(
    structure,
    state,
    ids,
    currentV ?? countAvailable(structure, state),
  );
}

function hasPotentialEffect(structure, state, id) {
  for (const child of structure.childrenByTile[id]) {
    if (state.status[child] === BOARD && state.upperLiveCount[child] <= 2) return true;
  }
  for (const dependent of sideDependents(structure)[id]) {
    if (state.status[dependent] === BOARD && state.upperLiveCount[dependent] === 0) {
      return true;
    }
  }
  return false;
}

function compactGreedyIds(structure, state, ids, neutralLimit = 2) {
  const impactful = [];
  const neutral = [];
  for (const id of ids) {
    if (hasPotentialEffect(structure, state, id)) impactful.push(id);
    else if (neutral.length < neutralLimit) neutral.push(id);
  }
  return [...impactful, ...neutral].sort((left, right) => left - right);
}

function compareIdLists(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function chooseGreedyPair(structure, state, boardByType, trayByType, currentV) {
  let best = null;
  for (const [type, boardIds] of boardByType) {
    const candidates = compactGreedyIds(structure, state, boardIds);
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const boardPair = [candidates[left], candidates[right]];
        const ids = [...boardPair].sort((a, b) => a - b);
        const candidate = {
          ids,
          boardIds: boardPair,
          score: vAfterLeaving(structure, state, boardPair, currentV),
        };
        if (!best || candidate.score > best.score
          || (candidate.score === best.score && compareIdLists(ids, best.ids) < 0)) {
          best = candidate;
        }
      }
    }

    const trayIds = trayByType.get(type) ?? [];
    if (trayIds.length > 0 && candidates.length > 0) {
      const trayId = trayIds[0];
      for (const boardId of candidates) {
        const ids = [trayId, boardId].sort((a, b) => a - b);
        const candidate = {
          ids,
          boardIds: [boardId],
          score: vAfterLeaving(structure, state, [boardId], currentV),
        };
        if (!best || candidate.score > best.score
          || (candidate.score === best.score && compareIdLists(ids, best.ids) < 0)) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

function chooseRandomPair(boardByType, trayByType, random) {
  const groups = [];
  let total = 0;
  for (const [type, boardIds] of boardByType) {
    const trayIds = trayByType.get(type) ?? [];
    const boardPairs = (boardIds.length * (boardIds.length - 1)) / 2;
    const trayPairs = boardIds.length * trayIds.length;
    if (boardPairs + trayPairs === 0) continue;
    groups.push({ boardIds, trayIds, boardPairs, trayPairs, start: total });
    total += boardPairs + trayPairs;
  }
  if (total === 0) return null;

  let pick = Math.floor(random() * total);
  const group = groups.find((entry) => pick < entry.start + entry.boardPairs + entry.trayPairs);
  pick -= group.start;
  if (pick < group.boardPairs) {
    const left = Math.floor(random() * group.boardIds.length);
    let right = Math.floor(random() * (group.boardIds.length - 1));
    if (right >= left) right += 1;
    const ids = [group.boardIds[left], group.boardIds[right]].sort((a, b) => a - b);
    return { ids, boardIds: ids };
  }
  const boardId = group.boardIds[Math.floor(random() * group.boardIds.length)];
  const trayId = group.trayIds[Math.floor(random() * group.trayIds.length)];
  return { ids: [boardId, trayId].sort((a, b) => a - b), boardIds: [boardId] };
}

function groupLiveIds(state, types, available) {
  const boardByType = new Map();
  const trayByType = new Map();
  for (const id of available) {
    const ids = boardByType.get(types[id]) ?? [];
    ids.push(id);
    boardByType.set(types[id], ids);
  }
  for (let id = 0; id < state.status.length; id += 1) {
    if (state.status[id] !== TRAY) continue;
    const ids = trayByType.get(types[id]) ?? [];
    ids.push(id);
    trayByType.set(types[id], ids);
  }
  return { boardByType, trayByType };
}

function tracePoint(state, structure, action, ids = []) {
  return {
    action,
    ids: [...ids],
    removed: state.removedCount,
    progress: state.removedCount / structure.size,
    v: countAvailable(structure, state),
    trayCount: state.trayCount,
  };
}

export function simulateOnce(level, structure, options = {}, seed = 0) {
  const assigned = assignTypes(level, seed);
  if (!Array.isArray(assigned)) {
    return {
      valid: false,
      reason: assigned.reason,
      dealError: assigned,
      completed: false,
      deadlocked: false,
      removed: 0,
      trayCount: 0,
      trace: [],
    };
  }

  const typeByTileId = new Map(level.tiles.map((tile, index) => [tile.id, assigned[index]]));
  const types = structure.tiles.map((tile) => typeByTileId.get(tile.id));
  const traySlots = Math.max(0, Math.trunc(Number(options.traySlots ?? 1)) || 0);
  const policy = options.policy === "random" ? "random" : "greedy";
  const random = mulberry32(seed ^ 0x9e3779b9);
  const state = createBoardState(structure);
  const trace = [tracePoint(state, structure, "start")];

  while (state.removedCount < structure.size) {
    const available = availableIds(structure, state);
    const currentV = available.length;
    const { boardByType, trayByType } = groupLiveIds(state, types, available);
    const pair = policy === "random"
      ? chooseRandomPair(boardByType, trayByType, random)
      : chooseGreedyPair(structure, state, boardByType, trayByType, currentV);

    if (pair) {
      removeFromBoard(state, pair.ids);
      trace.push(tracePoint(state, structure, "pair", pair.ids));
      continue;
    }

    if (available.length === 0 || state.trayCount >= traySlots) {
      return {
        valid: true,
        seed,
        completed: false,
        deadlocked: true,
        removed: state.removedCount,
        endProgress: state.removedCount / structure.size,
        trayCount: state.trayCount,
        trace,
      };
    }

    let stashId;
    if (policy === "random") {
      stashId = available[Math.floor(random() * available.length)];
    } else {
      const candidates = compactGreedyIds(structure, state, available, 1);
      stashId = candidates.reduce((bestId, id) => {
        if (bestId === undefined) return id;
        const score = vAfterLeaving(structure, state, [id], currentV);
        const bestScore = vAfterLeaving(structure, state, [bestId], currentV);
        return score > bestScore || (score === bestScore && id < bestId) ? id : bestId;
      }, undefined);
    }
    moveToTray(state, stashId);
    trace.push(tracePoint(state, structure, "stash", [stashId]));
  }

  return {
    valid: true,
    seed,
    completed: true,
    deadlocked: false,
    removed: state.removedCount,
    endProgress: 1,
    trayCount: state.trayCount,
    trace,
  };
}

function quantile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function monteCarloBand(level, structure, options = {}) {
  const seeds = Math.max(1, Math.trunc(Number(options.seeds ?? 300)) || 1);
  const seedBase = Math.trunc(Number(options.seedBase ?? 0)) || 0;
  const representedThreshold = Math.max(3, Math.ceil(seeds * 0.05));
  const valuesByRemoved = new Map();
  const runSummaries = [];

  for (let index = 0; index < seeds; index += 1) {
    const run = simulateOnce(level, structure, options, seedBase + index);
    if (!run.valid) {
      return {
        valid: false,
        reason: run.reason,
        dealError: run.dealError,
        seeds,
        representedThreshold,
        points: [],
      };
    }
    const latest = new Map();
    for (const point of run.trace) latest.set(point.removed, point.v);
    for (const [removed, value] of latest) {
      const values = valuesByRemoved.get(removed) ?? [];
      values.push(value);
      valuesByRemoved.set(removed, values);
    }
    runSummaries.push({
      seed: run.seed,
      completed: run.completed,
      deadlocked: run.deadlocked,
      removed: run.removed,
      endProgress: run.endProgress,
    });
  }

  const points = [...valuesByRemoved.entries()]
    .sort(([left], [right]) => left - right)
    .filter(([, values]) => values.length >= representedThreshold)
    .map(([removed, values]) => ({
      removed,
      progress: removed / structure.size,
      samples: values.length,
      p10: quantile(values, 0.1),
      p50: quantile(values, 0.5),
      p90: quantile(values, 0.9),
    }));
  const completedCount = runSummaries.filter((run) => run.completed).length;
  const deadlocks = runSummaries.filter((run) => run.deadlocked);

  return {
    valid: true,
    seeds,
    representedThreshold,
    completedCount,
    deadlockedCount: deadlocks.length,
    completionRate: completedCount / seeds,
    averageDeadlockProgress: deadlocks.length
      ? deadlocks.reduce((sum, run) => sum + run.endProgress, 0) / deadlocks.length
      : null,
    points,
    runs: runSummaries,
  };
}
