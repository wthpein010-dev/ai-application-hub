import { mulberry32 } from "./random.js";

// Audited screenshot model. These rules deliberately stay independent of the
// current-game engine: source tile order affects deterministic greedy ties.
const FOOTPRINT = 8;
const MIN_COVER_AREA = 16;

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(number)))
    : fallback;
}

function coverage(tiles) {
  const size = tiles.length;
  const parents = Array.from({ length: size }, () => []);
  const children = Array.from({ length: size }, () => []);
  for (let upper = 0; upper < size; upper += 1) {
    for (let lower = 0; lower < size; lower += 1) {
      if (tiles[upper].layer <= tiles[lower].layer) continue;
      const width = FOOTPRINT - Math.abs(tiles[upper].x - tiles[lower].x);
      const height = FOOTPRINT - Math.abs(tiles[upper].y - tiles[lower].y);
      if (width > 0 && height > 0 && width * height >= MIN_COVER_AREA) {
        parents[lower].push(upper);
        children[upper].push(lower);
      }
    }
  }
  const ancestors = Array.from({ length: size }, () => new Set());
  const order = tiles.map((_, index) => index)
    .sort((left, right) => tiles[right].layer - tiles[left].layer);
  for (const id of order) {
    for (const parent of parents[id]) {
      ancestors[id].add(parent);
      for (const ancestor of ancestors[parent]) ancestors[id].add(ancestor);
    }
  }
  return { size, parents, children, coneSizes: ancestors.map((set) => set.size) };
}

function expectedCurve(dag) {
  const { size } = dag;
  const logFactorial = new Array(size + 1).fill(0);
  for (let value = 2; value <= size; value += 1) {
    logFactorial[value] = logFactorial[value - 1] + Math.log(value);
  }
  const logChoose = (n, k) => k < 0 || k > n
    ? -Infinity
    : logFactorial[n] - logFactorial[k] - logFactorial[n - k];
  const histogram = new Array(size + 1).fill(0);
  for (const count of dag.coneSizes) histogram[count] += 1;
  const points = [];
  for (let removed = 0; removed < size; removed += 1) {
    let y = 0;
    const denominator = logChoose(size, removed);
    for (let count = 0; count <= removed; count += 1) {
      if (!histogram[count]) continue;
      const exponent = logChoose(size - count - 1, removed - count) - denominator;
      if (exponent > -Infinity) y += histogram[count] * Math.exp(exponent);
    }
    points.push({ progress: removed / size, removed, y });
  }
  points.push({ progress: 1, removed: size, y: 0 });
  return points;
}

function boardState(dag) {
  const departed = new Array(dag.size).fill(false);
  const covers = dag.parents.map((parents) => parents.length);
  const free = new Set();
  for (let id = 0; id < dag.size; id += 1) if (covers[id] === 0) free.add(id);
  const gain = (id) => {
    let count = 0;
    for (const child of dag.children[id]) {
      if (!departed[child] && covers[child] === 1) count += 1;
    }
    return count;
  };
  const lift = (id) => {
    departed[id] = true;
    free.delete(id);
    for (const child of dag.children[id]) {
      if (!departed[child]) {
        covers[child] -= 1;
        if (covers[child] === 0) free.add(child);
      }
    }
  };
  return { departed, covers, free, gain, lift };
}

function shuffle(values, random) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
}

function dealGroups(level) {
  const limited = [];
  const full = [];
  level.tiles.forEach((tile, index) => {
    if (tile.type === 0) limited.push(index);
    if (tile.type === -1) full.push(index);
  });
  for (const [group, ids] of [["limited", limited], ["full", full]]) {
    if (ids.length % 2 !== 0) {
      return {
        valid: false, group, count: ids.length,
        reason: `${group === "limited" ? "限定随机" : "全随机"}组砖数为奇数（${ids.length}），无法成对出盘。`,
      };
    }
  }
  const limitedMax = boundedInteger(level.rules?.limitedTypeMax, 8, 1, 32);
  const fullMin = boundedInteger(level.rules?.fullTypeMin, 1, 1, 32);
  const fullMax = boundedInteger(level.rules?.fullTypeMax, 32, fullMin, 32);
  return {
    valid: true,
    groups: [
      { ids: limited, minimum: 1, maximum: limitedMax },
      { ids: full, minimum: fullMin, maximum: fullMax },
    ],
  };
}

function deal(level, groups, random) {
  const types = level.tiles.map((tile) => tile.type);
  for (const { ids, minimum, maximum } of groups) {
    // Shuffle positions first, then draw each pair independently. A balanced
    // type pool is a different probability distribution from the screenshot.
    const positions = [...ids];
    shuffle(positions, random);
    for (let index = 0; index < positions.length; index += 2) {
      const type = minimum + Math.floor(random() * (maximum - minimum + 1));
      types[positions[index]] = type;
      types[positions[index + 1]] = type;
    }
  }
  return types;
}

function simulate(dag, types, options, random, seed) {
  const state = boardState(dag);
  const tray = [];
  let removed = 0; // Board departures, including unmatched tiles in the tray.
  const trace = [{ removed, v: state.free.size }];
  while (removed < dag.size) {
    const byType = new Map();
    for (const id of state.free) {
      if (!byType.has(types[id])) byType.set(types[id], []);
      byType.get(types[id]).push(id);
    }
    const candidates = [];
    for (const [type, ids] of byType) {
      if (ids.length >= 2) candidates.push({ ids, trayIndex: -1 });
      const trayIndex = tray.findIndex((id) => types[id] === type);
      if (trayIndex >= 0) candidates.push({ ids, trayIndex });
    }

    if (candidates.length > 0) {
      let choice;
      if (options.policy === "greedy") {
        let best = -1;
        for (const candidate of candidates) {
          const sorted = [...candidate.ids].sort((a, b) => state.gain(b) - state.gain(a));
          // Original heuristic: individual reveal gains, not the joint union.
          const score = candidate.trayIndex >= 0
            ? state.gain(sorted[0]) + 0.5
            : state.gain(sorted[0]) + state.gain(sorted[1]);
          if (score > best) {
            best = score;
            choice = { ...candidate, sorted };
          }
        }
      } else {
        const candidate = candidates[Math.floor(random() * candidates.length)];
        const sorted = [...candidate.ids];
        shuffle(sorted, random);
        choice = { ...candidate, sorted };
      }
      state.lift(choice.sorted[0]);
      removed += 1;
      if (choice.trayIndex >= 0) {
        tray.splice(choice.trayIndex, 1);
      } else {
        state.lift(choice.sorted[1]);
        removed += 1;
      }
    } else if (tray.length < options.traySlots && state.free.size > 0) {
      const available = [...state.free];
      let selected = available[0];
      if (options.policy === "greedy") {
        let best = -1;
        for (const id of available) {
          const score = state.gain(id);
          if (score > best) { selected = id; best = score; }
        }
      } else {
        selected = available[Math.floor(random() * available.length)];
      }
      state.lift(selected);
      tray.push(selected);
      removed += 1;
    } else {
      break;
    }
    trace.push({ removed, v: state.free.size });
  }
  // With arbitrary fixed types, an empty board can still leave unmatched tray
  // tiles. The original all-paired fixture never hit that edge case.
  const completed = removed === dag.size && tray.length === 0;
  return {
    seed, completed, deadlocked: !completed, removed,
    endProgress: removed / dag.size, trayCount: tray.length, trace,
  };
}

function monteCarlo(level, dag, options) {
  const { seeds } = options;
  const representedThreshold = Math.max(3, Math.ceil(seeds * 0.05));
  const assignment = dealGroups(level);
  if (!assignment.valid) {
    return {
      valid: false, seeds, representedThreshold,
      reason: assignment.reason, dealError: assignment, points: [], runs: [],
      completionRate: null, averageDeadlockProgress: null,
      completedCount: 0, deadlockedCount: 0,
    };
  }
  const samples = Array.from({ length: dag.size + 1 }, () => []);
  const runs = [];
  for (let index = 0; index < seeds; index += 1) {
    // Keep ordinary JS multiplication, as in the audited original seed stream.
    const seed = 0x9e3779b9 ^ ((options.seedBase + index) * 2654435761);
    const random = mulberry32(seed);
    const run = simulate(dag, deal(level, assignment.groups, random), options, random, seed);
    for (const point of run.trace) samples[point.removed].push(point.v);
    const { trace, ...summary } = run;
    runs.push(summary);
  }
  const points = [];
  samples.forEach((bucket, removed) => {
    if (bucket.length < representedThreshold) return;
    bucket.sort((a, b) => a - b);
    const quantile = (fraction) => bucket[Math.min(bucket.length - 1, Math.floor(fraction * bucket.length))];
    points.push({
      removed, progress: removed / dag.size, samples: bucket.length,
      p10: quantile(0.1), p50: quantile(0.5), p90: quantile(0.9),
    });
  });
  const deadlocks = runs.filter((run) => run.deadlocked);
  const completedCount = seeds - deadlocks.length;
  return {
    valid: true, seeds, representedThreshold, points, runs, completedCount,
    deadlockedCount: deadlocks.length, completionRate: completedCount / seeds,
    averageDeadlockProgress: deadlocks.length
      ? deadlocks.reduce((sum, run) => sum + run.removed, 0) / deadlocks.length / dag.size
      : null,
  };
}

function riverRun(dag, mode, restart) {
  const state = boardState(dag);
  const random = mulberry32((mode === "upper" ? 1000 : 2000) + restart);
  const points = [{ removed: 0, progress: 0, y: state.free.size }];
  let removed = 0;
  while (removed < dag.size && state.free.size >= 2) {
    const available = [...state.free];
    const gains = new Map(available.map((id) => [id, state.gain(id)]));
    available.sort((a, b) => mode === "upper" ? gains.get(b) - gains.get(a) : gains.get(a) - gains.get(b));
    const count = Math.min(available.length, 8);
    let bestPair;
    let bestScore = mode === "upper" ? -1 : Infinity;
    for (let left = 0; left < count; left += 1) {
      for (let right = left + 1; right < count; right += 1) {
        const first = available[left];
        const second = available[right];
        let joint = 0;
        const secondChildren = new Set(dag.children[second]);
        for (const child of dag.children[first]) {
          if (!state.departed[child] && state.covers[child] === 2 && secondChildren.has(child)) joint += 1;
        }
        const score = gains.get(first) + gains.get(second) + joint + random() * 0.01;
        if (mode === "upper" ? score > bestScore : score < bestScore) {
          bestScore = score;
          bestPair = [first, second];
        }
      }
    }
    for (const id of bestPair) state.lift(id);
    removed += 2;
    points.push({ removed, progress: removed / dag.size, y: state.free.size });
  }
  return {
    points, completed: removed === dag.size,
    deadlocked: removed < dag.size, endProgress: removed / dag.size,
  };
}

function envelope(runs, mode, size) {
  const values = new Map();
  for (const run of runs) {
    for (const point of run.points) {
      if (!values.has(point.removed)) values.set(point.removed, []);
      values.get(point.removed).push(point.y);
    }
  }
  // Union all observed progress buckets. The original lower loop incorrectly
  // restricted this to the first run's length and hid later reachable points.
  return [...values.entries()].sort(([a], [b]) => a - b).map(([removed, bucket]) => ({
    removed, progress: removed / size, samples: bucket.length,
    y: mode === "upper" ? Math.max(...bucket) : Math.min(...bucket),
  }));
}

function empiricalRiver(dag, restarts) {
  const upperRuns = [];
  const lowerRuns = [];
  for (let restart = 0; restart < restarts; restart += 1) {
    upperRuns.push(riverRun(dag, "upper", restart));
    lowerRuns.push(riverRun(dag, "lower", restart));
  }
  const upperDeadlocks = upperRuns.filter((run) => run.deadlocked);
  const lowerDeadlocks = lowerRuns.filter((run) => run.deadlocked);
  const average = (runs) => runs.length
    ? runs.reduce((sum, run) => sum + run.endProgress, 0) / runs.length
    : null;
  return {
    restarts,
    upper: envelope(upperRuns, "upper", dag.size),
    lower: envelope(lowerRuns, "lower", dag.size),
    upperDeadlocks: upperDeadlocks.length,
    lowerDeadlocks: lowerDeadlocks.length,
    upperDeadlockAverageProgress: average(upperDeadlocks),
    lowerDeadlockAverageProgress: average(lowerDeadlocks),
  };
}

export function analyzeReferenceModel(level, options = {}) {
  if (Array.isArray(level?.referenceTiles) && level.referenceTiles.length > 0) {
    level = { ...level, tiles: level.referenceTiles };
  }
  if (!Array.isArray(level?.tiles) || level.tiles.length === 0) {
    throw new Error("关卡没有可分析砖块。");
  }
  for (const tile of level.tiles) {
    if (![tile.x, tile.y, tile.layer, tile.type].every(Number.isFinite)
      || !Number.isInteger(tile.type) || tile.type < -1) {
      throw new Error("砖块坐标或图案配置无效。");
    }
  }
  const normalized = {
    seeds: boundedInteger(options.seeds, 300, 1, 2000),
    traySlots: boundedInteger(options.traySlots, 1, 0, 2),
    riverRestarts: boundedInteger(options.riverRestarts, 20, 1, 100),
    seedBase: boundedInteger(options.seedBase, 0, 0, Number.MAX_SAFE_INTEGER),
    policy: options.policy === "random" ? "random" : "greedy",
  };
  const dag = coverage(level.tiles);
  const simulation = monteCarlo(level, dag, normalized);
  if (level.tiles.some((tile) => tile.type >= 1001 || (tile.metaType ?? 0) !== 0)) {
    simulation.incomplete = true;
    simulation.incompleteReason = "包含动态砖或非零 metaType，参考模型玩法仿真不完整。";
  }
  return {
    openingV: dag.parents.filter((parents) => parents.length === 0).length,
    expected: expectedCurve(dag),
    river: empiricalRiver(dag, normalized.riverRestarts),
    simulation,
  };
}
