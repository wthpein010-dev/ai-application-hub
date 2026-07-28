const ACTIVE_BLOCK_TYPE_COUNT = 32;
const FULL_RANDOM_TYPE = -1;
const TILE_SIZE = 8;
const DOTNET_MAX = 2147483647;
const DOTNET_SEED = 161803398;

function clampInteger(value, minimum, maximum) {
  const integer = Math.trunc(Number(value));
  return Math.max(minimum, Math.min(maximum, Number.isFinite(integer) ? integer : minimum));
}

function toInt32(value) {
  return Number(value) | 0;
}

export function createDotNetRandom(seed) {
  const seedArray = new Int32Array(56);
  const signedSeed = toInt32(seed);
  const subtraction = signedSeed === -2147483648 ? DOTNET_MAX : Math.abs(signedSeed);
  let mj = DOTNET_SEED - subtraction;
  if (mj < 0) mj += DOTNET_MAX;
  seedArray[55] = mj;
  let mk = 1;
  for (let index = 1; index < 55; index += 1) {
    const slot = (21 * index) % 55;
    seedArray[slot] = mk;
    mk = mj - mk;
    if (mk < 0) mk += DOTNET_MAX;
    mj = seedArray[slot];
  }
  for (let pass = 1; pass < 5; pass += 1) {
    for (let index = 1; index < 56; index += 1) {
      seedArray[index] -= seedArray[1 + (index + 30) % 55];
      if (seedArray[index] < 0) seedArray[index] += DOTNET_MAX;
    }
  }
  let nextIndex = 0;
  let nextPairIndex = 21;

  function internalSample() {
    nextIndex += 1;
    if (nextIndex >= 56) nextIndex = 1;
    nextPairIndex += 1;
    if (nextPairIndex >= 56) nextPairIndex = 1;
    let value = seedArray[nextIndex] - seedArray[nextPairIndex];
    if (value === DOTNET_MAX) value -= 1;
    if (value < 0) value += DOTNET_MAX;
    seedArray[nextIndex] = value;
    return value;
  }

  return {
    next(minimum, maximum) {
      if (minimum === undefined) {
        return internalSample();
      }
      if (maximum === undefined) {
        const upper = Math.trunc(Number(minimum));
        if (upper < 0) throw new RangeError("随机上限不能为负数。");
        return Math.floor(internalSample() * (1 / DOTNET_MAX) * upper);
      }
      const lower = Math.trunc(Number(minimum));
      const upper = Math.trunc(Number(maximum));
      if (lower > upper) throw new RangeError("随机下限不能大于上限。");
      const range = upper - lower;
      return lower + Math.floor(internalSample() * (1 / DOTNET_MAX) * range);
    },
  };
}

export function resolvePassRateBudget(tileCount) {
  const count = Math.max(0, Math.trunc(Number(tileCount)) || 0);
  if (count <= 40) {
    return { trials: 24, rollouts: 6, nodesPerRollout: 2500 };
  }
  if (count <= 120) {
    return { trials: 16, rollouts: 5, nodesPerRollout: 6000 };
  }
  return { trials: 12, rollouts: 4, nodesPerRollout: 10000 };
}

function shuffle(list, random) {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const other = random.next(index + 1);
    [list[index], list[other]] = [list[other], list[index]];
  }
}

function shuffleRange(list, count, random) {
  const length = Math.min(count, list.length);
  for (let index = length - 1; index > 0; index -= 1) {
    const other = random.next(index + 1);
    [list[index], list[other]] = [list[other], list[index]];
  }
}

function cloneSimTiles(source) {
  const result = [];
  for (let index = 0; index < source.length; index += 1) {
    const tile = source[index];
    if (!tile) continue;
    result.push({
      uid: index + 1,
      x: Number(tile.x),
      y: Number(tile.y),
      layer: Number(tile.layer),
      type: Number(tile.type),
      removed: false,
      inTray: false,
      evacuated: false,
    });
  }
  return result;
}

function deepCloneTiles(source) {
  return source.map((tile) => ({ ...tile }));
}

function assignPairedTypes(tiles, typeMinimum, typeMaximum, random) {
  if (!tiles.length) return;
  const minimum = Math.max(1, typeMinimum);
  const maximum = Math.max(minimum, typeMaximum);
  const evenCount = tiles.length & ~1;
  const types = [];
  for (let index = 0; index < evenCount / 2; index += 1) {
    const type = random.next(minimum, maximum + 1);
    types.push(type, type);
  }
  shuffle(types, random);
  for (let index = 0; index < evenCount; index += 1) {
    tiles[index].type = types[index];
  }
  if (evenCount < tiles.length) {
    tiles.at(-1).type = random.next(minimum, maximum + 1);
  }
}

function assignFirstRound(tiles, typeMaximum, random) {
  const randomTiles = tiles.filter(({ type }) => type <= 0);
  if (!randomTiles.length) return;
  const byLayer = new Map();
  for (const tile of randomTiles) {
    if (!byLayer.has(tile.layer)) byLayer.set(tile.layer, []);
    byLayer.get(tile.layer).push(tile);
  }
  const layers = [...byLayer.keys()].sort((left, right) => left - right);
  const maximum = clampInteger(
    Math.max(typeMaximum, layers.length),
    1,
    ACTIVE_BLOCK_TYPE_COUNT,
  );
  const pool = Array.from({ length: maximum }, (_, index) => index + 1);
  shuffle(pool, random);
  const distinct = [];
  const used = new Set();
  for (const type of pool) {
    if (distinct.length >= layers.length) break;
    if (!used.has(type)) {
      used.add(type);
      distinct.push(type);
    }
  }
  let cursor = 1;
  while (distinct.length < layers.length) {
    if (!used.has(cursor)) {
      used.add(cursor);
      distinct.push(cursor);
    }
    cursor += 1;
    if (cursor > ACTIVE_BLOCK_TYPE_COUNT) {
      distinct.push(1);
    }
  }
  layers.forEach((layer, index) => {
    const type = distinct[Math.min(index, distinct.length - 1)];
    byLayer.get(layer).forEach((tile) => {
      tile.type = type;
    });
  });
}

function validateEvenCounts(tiles) {
  const counts = new Map();
  for (const tile of tiles) {
    if (tile.type <= 0) return false;
    counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
  }
  return [...counts.values()].every((count) => (count & 1) === 0);
}

function tryAssignDeal(tiles, firstRound, blockTypeCount, fullMinimum, fullMaximum, random) {
  if (firstRound) {
    assignFirstRound(tiles, blockTypeCount, random);
    return validateEvenCounts(tiles);
  }
  const limited = [];
  const full = [];
  for (const tile of tiles) {
    if (tile.type === FULL_RANDOM_TYPE) {
      full.push(tile);
    } else if (tile.type <= 0) {
      limited.push(tile);
    }
  }
  assignPairedTypes(limited, 1, blockTypeCount, random);
  assignPairedTypes(full, fullMinimum, fullMaximum, random);
  return validateEvenCounts(tiles);
}

function overlapsWithPositiveArea(left, right) {
  return (
    Math.min(left.x + TILE_SIZE, right.x + TILE_SIZE) - Math.max(left.x, right.x) > 0
    && Math.min(left.y + TILE_SIZE, right.y + TILE_SIZE) - Math.max(left.y, right.y) > 0
  );
}

function boardTiles(tiles) {
  return tiles.filter((tile) => !tile.removed && !tile.inTray && !tile.evacuated);
}

function isBlocked(tile, board) {
  const covered = board.some((other) =>
    other !== tile
    && other.layer > tile.layer
    && overlapsWithPositiveArea(tile, other));
  if (covered) return true;
  let hasLeft = false;
  let hasRight = false;
  for (const other of board) {
    if (other === tile || other.layer !== tile.layer || other.y !== tile.y) continue;
    if (other.x === tile.x - TILE_SIZE) hasLeft = true;
    if (other.x === tile.x + TILE_SIZE) hasRight = true;
  }
  return hasLeft && hasRight;
}

function collectVisiblePairs(tiles) {
  const board = boardTiles(tiles);
  const groups = new Map();
  for (const tile of tiles) {
    if (tile.removed || tile.type <= 0) continue;
    if (!tile.inTray && !tile.evacuated && isBlocked(tile, board)) continue;
    if (!groups.has(tile.type)) groups.set(tile.type, []);
    groups.get(tile.type).push(tile.uid);
  }
  const pairs = [];
  for (const uids of groups.values()) {
    if (uids.length < 2) continue;
    uids.sort((left, right) => left - right);
    for (let left = 0; left < uids.length; left += 1) {
      for (let right = left + 1; right < uids.length; right += 1) {
        pairs.push([uids[left], uids[right]]);
      }
    }
  }
  return pairs;
}

function collectStashCandidates(tiles) {
  const board = boardTiles(tiles);
  return tiles.filter((tile) =>
    !tile.removed
    && !tile.inTray
    && !tile.evacuated
    && !isBlocked(tile, board));
}

function removePair(tiles, firstUid, secondUid) {
  for (const tile of tiles) {
    if (tile.uid === firstUid || tile.uid === secondUid) {
      tile.removed = true;
      tile.inTray = false;
      tile.evacuated = false;
    }
  }
}

function restorePair(tiles, firstUid, secondUid) {
  for (const tile of tiles) {
    if (tile.uid === firstUid || tile.uid === secondUid) {
      tile.removed = false;
    }
  }
}

function clearMatchesGreedy(tiles, random) {
  while (true) {
    const pairs = collectVisiblePairs(tiles);
    if (!pairs.length) return;
    const [firstUid, secondUid] = pairs[random.next(0, Math.min(16, pairs.length))];
    removePair(tiles, firstUid, secondUid);
  }
}

function countRemaining(tiles) {
  return tiles.reduce((count, tile) => count + (tile.removed ? 0 : 1), 0);
}

function countTray(tiles) {
  return tiles.reduce(
    (count, tile) => count + (!tile.removed && tile.inTray ? 1 : 0),
    0,
  );
}

function buildFingerprint(tiles, shuffleLeft, evacuateLeft) {
  const parts = tiles
    .filter((tile) => !tile.removed)
    .map((tile) =>
      `${tile.uid}:${tile.type}:${tile.inTray ? 1 : 0}:${tile.evacuated ? 1 : 0}`)
    .sort();
  return `${parts.join("|")}#${shuffleLeft}:${evacuateLeft}`;
}

function tryShuffleBoardTypes(tiles, random) {
  const board = tiles.filter((tile) => !tile.removed && !tile.inTray);
  if (board.length < 2) return false;
  const types = board.map(({ type }) => type);
  for (let attempt = 0; attempt < 48; attempt += 1) {
    shuffle(types, random);
    board.forEach((tile, index) => {
      tile.type = types[index];
    });
    if (collectVisiblePairs(tiles).length > 0) return true;
  }
  return collectVisiblePairs(tiles).length > 0;
}

function dfsSolve(
  tiles,
  random,
  {
    shuffleLeft,
    evacuateLeft,
    maxTray,
    failMemo,
    budget,
  },
) {
  budget.remaining -= 1;
  if (budget.remaining < 0) return false;
  clearMatchesGreedy(tiles, random);
  if (countRemaining(tiles) === 0) return true;
  const key = buildFingerprint(tiles, shuffleLeft, evacuateLeft);
  if (failMemo.has(key)) return false;

  const pairs = collectVisiblePairs(tiles);
  if (pairs.length) {
    const take = Math.min(8, pairs.length);
    shuffleRange(pairs, take, random);
    for (let index = 0; index < take; index += 1) {
      const [firstUid, secondUid] = pairs[index];
      removePair(tiles, firstUid, secondUid);
      if (dfsSolve(tiles, random, {
        shuffleLeft,
        evacuateLeft,
        maxTray,
        failMemo,
        budget,
      })) return true;
      restorePair(tiles, firstUid, secondUid);
    }
    failMemo.add(key);
    return false;
  }

  if (countTray(tiles) < maxTray) {
    const candidates = collectStashCandidates(tiles);
    if (candidates.length) {
      const trayTypes = new Set(
        tiles
          .filter((tile) => !tile.removed && tile.inTray)
          .map(({ type }) => type),
      );
      candidates.sort((left, right) => {
        const leftScore = trayTypes.has(left.type) ? 5 : 0;
        const rightScore = trayTypes.has(right.type) ? 5 : 0;
        return rightScore - leftScore || left.uid - right.uid;
      });
      const branches = Math.min(6, candidates.length);
      for (let index = 0; index < branches; index += 1) {
        const tile = candidates[index];
        tile.inTray = true;
        if (dfsSolve(tiles, random, {
          shuffleLeft,
          evacuateLeft,
          maxTray,
          failMemo,
          budget,
        })) return true;
        tile.inTray = false;
      }
      failMemo.add(key);
      return false;
    }
  }

  if (evacuateLeft > 0 && countTray(tiles) > 0) {
    const moved = [];
    for (const tile of tiles) {
      if (!tile.removed && tile.inTray) {
        tile.inTray = false;
        tile.evacuated = true;
        moved.push(tile);
      }
    }
    if (dfsSolve(tiles, random, {
      shuffleLeft,
      evacuateLeft: evacuateLeft - 1,
      maxTray,
      failMemo,
      budget,
    })) return true;
    for (const tile of moved) {
      tile.evacuated = false;
      tile.inTray = true;
    }
  }

  if (shuffleLeft > 0) {
    const board = tiles.filter((tile) => !tile.removed && !tile.inTray);
    const oldTypes = board.map(({ type }) => type);
    if (board.length >= 2 && tryShuffleBoardTypes(tiles, random)) {
      if (dfsSolve(tiles, random, {
        shuffleLeft: shuffleLeft - 1,
        evacuateLeft,
        maxTray,
        failMemo,
        budget,
      })) return true;
    }
    board.forEach((tile, index) => {
      tile.type = oldTypes[index];
    });
  }

  failMemo.add(key);
  return false;
}

function trySolve(tiles, seed, rollouts, nodesPerRollout) {
  const baseRandom = createDotNetRandom(toInt32(seed ^ 0xA5A5A5A5));
  for (let rollout = 0; rollout < rollouts; rollout += 1) {
    const trialTiles = deepCloneTiles(tiles);
    const random = createDotNetRandom(toInt32(baseRandom.next() + rollout * 9973));
    if (dfsSolve(trialTiles, random, {
      shuffleLeft: 1,
      evacuateLeft: 1,
      maxTray: 2,
      failMemo: new Set(),
      budget: { remaining: nodesPerRollout },
    })) return true;
  }
  return false;
}

function roundToEven(value) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.max(1, Math.abs(value)) * 4) {
    return lower % 2 === 0 ? lower : lower + 1;
  }
  return Math.round(value);
}

function buildReasons(result, requestedTrials) {
  if (result.passPercent >= 100 && result.trialCount > 0) return [];
  if (result.trialCount <= 0) {
    return [`${requestedTrials} 次模拟均无法生成合法偶数配对出盘（盲盒/全随机池约束）。`];
  }
  if (result.passPercent <= 0) {
    const reasons = [
      `有效出盘 ${result.trialCount} 次全部未能清空（条件：2 槽+洗牌 1+清槽 1）。`,
    ];
    if (result.invalidDealCount > 0) {
      reasons.push(`另有 ${result.invalidDealCount} 次出盘因配对不成偶被丢弃。`);
    }
    reasons.push("建议：降低叠层/侧锁密度，或增加可消开口与牌池配对余量。");
    return reasons;
  }
  const reasons = [
    `模拟 ${result.passCount}/${result.trialCount} 通关，未达 100%。`,
    `有 ${result.failSolveCount} 次出盘在 2 槽+洗牌 1+清槽 1 下未能清空。`,
  ];
  if (result.invalidDealCount > 0) {
    reasons.push(`另有 ${result.invalidDealCount} 次出盘因配对不成偶被丢弃。`);
  }
  reasons.push("建议：检查高叠层开口、盲盒池大小与侧锁夹击导致的死局分支。");
  return reasons;
}

function defaultYieldTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function evaluateLevelPassRate(
  document,
  {
    onProgress,
    yieldTask = defaultYieldTask,
  } = {},
) {
  const sourceTiles = Array.isArray(document?.tiles) ? document.tiles : [];
  if (!sourceTiles.length) {
    return {
      passPercent: 0,
      passCount: 0,
      trialCount: 0,
      invalidDealCount: 0,
      failSolveCount: 0,
      reasons: ["未摆放方块，无法评估通关率。"],
    };
  }
  const { trials, rollouts, nodesPerRollout } = resolvePassRateBudget(sourceTiles.length);
  const blockTypeCount = clampInteger(
    document?.random?.blockTypeCount,
    1,
    ACTIVE_BLOCK_TYPE_COUNT,
  );
  const fullMinimum = clampInteger(
    document?.random?.fullTypeMin,
    1,
    ACTIVE_BLOCK_TYPE_COUNT,
  );
  const fullMaximum = clampInteger(
    document?.random?.fullTypeMax,
    fullMinimum,
    ACTIVE_BLOCK_TYPE_COUNT,
  );
  const firstRound = Number(document?.gameplay?.gameLevelOrder) <= 1;
  const levelId = Math.trunc(Number(document?.id)) || 0;
  let passCount = 0;
  let trialCount = 0;
  let invalidDealCount = 0;
  let failSolveCount = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = toInt32(100000 + levelId * 1000 + trial);
    const random = createDotNetRandom(seed);
    const tiles = cloneSimTiles(sourceTiles);
    if (!tryAssignDeal(
      tiles,
      firstRound,
      blockTypeCount,
      fullMinimum,
      fullMaximum,
      random,
    )) {
      invalidDealCount += 1;
    } else {
      trialCount += 1;
      if (trySolve(tiles, seed, rollouts, nodesPerRollout)) {
        passCount += 1;
      } else {
        failSolveCount += 1;
      }
    }
    onProgress?.({ completed: trial + 1, total: trials });
    await yieldTask();
  }

  const passPercent = trialCount > 0
    ? Math.max(0, Math.min(100, roundToEven(passCount * 100 / trialCount)))
    : 0;
  const result = {
    passPercent,
    passCount,
    trialCount,
    invalidDealCount,
    failSolveCount,
    reasons: [],
  };
  result.reasons = buildReasons(result, trials);
  return result;
}

export function readPassRateResult(designerNote) {
  const note = designerNote && typeof designerNote === "object" ? designerNote : {};
  if (!Object.hasOwn(note, "passRatePercent")) {
    return null;
  }
  const storedInteger = (key) => Number.isInteger(note[key]) ? note[key] : 0;
  const result = {
    passPercent: storedInteger("passRatePercent"),
    passCount: storedInteger("passRatePassCount"),
    trialCount: storedInteger("passRateTrialCount"),
    invalidDealCount: storedInteger("passRateInvalidDeal"),
    failSolveCount: storedInteger("passRateFailSolve"),
  };
  return {
    ...result,
    reasons: typeof note.passRateReasonsText === "string" && note.passRateReasonsText
      ? note.passRateReasonsText.split(/\r?\n/).filter(Boolean)
      : [],
  };
}

export function writePassRateResult(designerNote, result) {
  const note = structuredClone(
    designerNote && typeof designerNote === "object" ? designerNote : {},
  );
  note.passRatePercent = result.passPercent;
  note.passRatePassCount = result.passCount;
  note.passRateTrialCount = result.trialCount;
  note.passRateInvalidDeal = result.invalidDealCount;
  note.passRateFailSolve = result.failSolveCount;
  note.passRateReasonsText = (result.reasons ?? []).join("\n");
  return note;
}
