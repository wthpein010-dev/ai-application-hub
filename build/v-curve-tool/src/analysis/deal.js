const FIRST_ROUND_ATTEMPTS = 96;
const PSEUDO_RANDOM_ATTEMPTS = 128;
const operableMaskCache = new WeakMap();

function finiteInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function randomType(minimum, maximum, random) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function createUnityRandom(seed) {
  let value = finiteInt(seed, 0) >>> 0;
  if (value === 0) value = 1;
  let state0Upper = value;
  let state0Lower = (value ^ 0x9e3779b9) >>> 0;
  let state1Upper = (Math.imul(value, 0x85ebca6b) + 1) >>> 0;
  let state1Lower = (value ^ 0xc2b2ae35) >>> 0;

  return function random() {
    let s1Upper = state0Upper;
    let s1Lower = state0Lower;
    const s0Upper = state1Upper;
    const s0Lower = state1Lower;
    const lowerSum = s0Lower + s1Lower;
    const resultLower = lowerSum >>> 0;
    const resultUpper = (s0Upper + s1Upper + Number(lowerSum >= 0x100000000)) >>> 0;
    state0Upper = s0Upper;
    state0Lower = s0Lower;

    let nextUpper = ((s1Upper << 23) | ((s1Lower & 0xfffffe00) >>> 9)) >>> 0;
    let nextLower = (s1Lower << 23) >>> 0;
    s1Upper = (s1Upper ^ nextUpper) >>> 0;
    s1Lower = (s1Lower ^ nextLower) >>> 0;
    nextUpper = (s1Upper ^ s0Upper) >>> 0;
    nextLower = (s1Lower ^ s0Lower) >>> 0;
    nextUpper = (nextUpper ^ (s1Upper >>> 18)) >>> 0;
    nextLower = (nextLower ^ ((s1Lower >>> 18) | ((s1Upper & 0x0003ffff) << 14))) >>> 0;
    nextUpper = (nextUpper ^ (s0Upper >>> 5)) >>> 0;
    nextLower = (nextLower ^ ((s0Lower >>> 5) | ((s0Upper & 0x0000001f) << 27))) >>> 0;
    state1Upper = nextUpper;
    state1Lower = nextLower;

    return resultUpper * 2.3283064365386963e-10
      + (resultLower >>> 12) * 2.220446049250313e-16;
  };
}

function unityShuffle(values, random) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function pairedPool(count, minimum, maximum, random, allowOdd = false) {
  const evenCount = count & ~1;
  const pool = [];
  for (let pair = 0; pair < evenCount / 2; pair += 1) {
    const type = randomType(minimum, maximum, random);
    pool.push(type, type);
  }
  unityShuffle(pool, random);
  if (allowOdd && evenCount < count) pool.push(randomType(minimum, maximum, random));
  return pool;
}

function invalidGroup(group, count) {
  return {
    valid: false,
    group,
    count,
    reason: `${group === "limited" ? "限定随机" : "全随机"}组砖数为奇数（${count}），无法成对出盘。`,
  };
}

function challengeRound(level) {
  const match = String(level?.sourceFile ?? "").match(/_r(\d+)(?:_|$)/iu);
  if (match) return Math.max(1, finiteInt(match[1], 2));
  return Math.max(1, finiteInt(level?.rules?.gameLevelOrder, 2));
}

function buildOperableMask(tiles) {
  const cached = operableMaskCache.get(tiles);
  if (cached) return cached;

  const mask = tiles.map((tile, id) => {
    if (tile?.faceDown === true) return false;
    return !tiles.some((other, otherId) => (
      otherId !== id
      && other?.layer > tile?.layer
      && Math.abs(other.x - tile.x) < 8
      && Math.abs(other.y - tile.y) < 8
    ));
  });
  operableMaskCache.set(tiles, mask);
  return mask;
}

function hasImmediatePair(types, groupIds, operableMask) {
  const groupSet = new Set(groupIds);
  const operableCounts = new Map();
  const groupOperableTypes = new Set();
  for (let id = 0; id < types.length; id += 1) {
    if (!operableMask[id] || types[id] <= 0) continue;
    operableCounts.set(types[id], (operableCounts.get(types[id]) ?? 0) + 1);
    if (groupSet.has(id)) groupOperableTypes.add(types[id]);
  }
  return [...groupOperableTypes].some((type) => operableCounts.get(type) >= 2);
}

function validatePseudoRandom(types, ids, mode, group, operableMask) {
  if (mode === 0 || ids.length === 0) return null;
  const immediatePair = hasImmediatePair(types, ids, operableMask);
  if (mode === 1 && immediatePair) return null;
  if (mode === 2 && !immediatePair) return null;
  const groupLabel = group === "limited" ? "限定盲盒" : "全随机盲盒";
  return {
    valid: false,
    group,
    mode,
    count: ids.length,
    reason: mode === 1
      ? `${groupLabel}伪随机「可消除」无合法结果：组内可操作图案无法与场上可操作砖或组内砖立刻成对。`
      : `${groupLabel}伪随机「不可消除」无合法结果：组内可操作图案会与场上可操作砖或组内砖立刻成对。`,
  };
}

function assignGroup(types, ids, minimum, maximum, random, allowOdd) {
  const pool = pairedPool(ids.length, minimum, maximum, random, allowOdd);
  ids.forEach((id, index) => { types[id] = pool[index]; });
}

function assignFirstRoundLimited(types, ids, random) {
  if (ids.length === 0) return;
  const allowedTypes = Array.from({ length: 8 }, (_, index) => index + 1);
  unityShuffle(allowedTypes, random);
  const evenCount = ids.length & ~1;
  const pool = [];
  for (let pair = 0; pair < evenCount / 2; pair += 1) {
    const type = allowedTypes[Math.floor(random() * allowedTypes.length)];
    pool.push(type, type);
  }
  unityShuffle(pool, random);
  for (let index = 0; index < evenCount; index += 1) types[ids[index]] = pool[index];
  if (evenCount < ids.length) {
    types[ids.at(-1)] = allowedTypes[Math.floor(random() * allowedTypes.length)];
  }
}

function restoreMarkers(types, limitedIds, fullIds) {
  limitedIds.forEach((id) => { types[id] = 0; });
  fullIds.forEach((id) => { types[id] = -1; });
}

export function assignTypes(level, seed = 0) {
  const tiles = Array.isArray(level?.tiles) ? level.tiles : [];
  const limitedIds = [];
  const fullIds = [];
  const types = tiles.map((tile, index) => {
    if (tile.type === 0) limitedIds.push(index);
    if (tile.type === -1) fullIds.push(index);
    return tile.type;
  });

  const firstRound = challengeRound(level) === 1;
  if (!firstRound && limitedIds.length % 2 !== 0) {
    return invalidGroup("limited", limitedIds.length);
  }
  if (!firstRound && fullIds.length % 2 !== 0) return invalidGroup("full", fullIds.length);
  if (limitedIds.length === 0 && fullIds.length === 0) return types;

  const limitedMaximum = firstRound
    ? 8
    : Math.min(32, Math.max(1, finiteInt(level?.rules?.limitedTypeMax, 8)));
  const fullMinimum = Math.min(32, Math.max(1, finiteInt(level?.rules?.fullTypeMin, 1)));
  const fullMaximum = Math.min(32, Math.max(
    fullMinimum,
    finiteInt(level?.rules?.fullTypeMax, 32),
  ));
  const limitedMode = Math.min(2, Math.max(
    0,
    finiteInt(level?.rules?.pseudoRandomLimitedMode, 0),
  ));
  const fullMode = Math.min(2, Math.max(
    0,
    finiteInt(level?.rules?.pseudoRandomFullMode, 0),
  ));
  const usesPseudoRandom = limitedMode !== 0 || fullMode !== 0;
  const attemptLimit = usesPseudoRandom
    ? (firstRound ? FIRST_ROUND_ATTEMPTS : PSEUDO_RANDOM_ATTEMPTS)
    : 1;
  const operableMask = usesPseudoRandom ? buildOperableMask(tiles) : null;
  let lastPseudoError = null;

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    restoreMarkers(types, limitedIds, fullIds);
    const random = createUnityRandom(finiteInt(seed, 0) + attempt);
    if (firstRound) assignFirstRoundLimited(types, limitedIds, random);
    else assignGroup(types, limitedIds, 1, limitedMaximum, random, false);
    lastPseudoError = validatePseudoRandom(
      types,
      limitedIds,
      limitedMode,
      "limited",
      operableMask,
    );
    if (lastPseudoError) continue;

    assignGroup(types, fullIds, fullMinimum, fullMaximum, random, firstRound);
    lastPseudoError = validatePseudoRandom(
      types,
      fullIds,
      fullMode,
      "full",
      operableMask,
    );
    if (lastPseudoError) continue;
    return types;
  }

  return {
    ...(lastPseudoError ?? {
      valid: false,
      group: "random",
      reason: "盲盒图案分配失败：尝试次数耗尽。",
    }),
    attempts: attemptLimit,
  };
}
