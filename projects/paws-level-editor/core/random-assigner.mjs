import { XorShift } from "./xorshift.mjs";

function assignGroup(result, sourceType, min, maxInclusive, rng) {
  const indices = result
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile.type === sourceType)
    .map(({ index }) => index);
  if (indices.length % 2 !== 0) {
    throw new RangeError(`random type ${sourceType} count must be even`);
  }
  if (indices.length === 0) {
    return;
  }
  if (!Number.isInteger(min) || !Number.isInteger(maxInclusive) || maxInclusive < min) {
    throw new RangeError(`random type ${sourceType} range is invalid`);
  }

  const pool = [];
  for (let pair = 0; pair < indices.length / 2; pair += 1) {
    const type = rng.nextInt(min, maxInclusive + 1);
    pool.push(type, type);
  }
  const shuffledIndices = rng.shuffle(indices);
  const shuffledPool = rng.shuffle(pool);
  shuffledIndices.forEach((tileIndex, index) => {
    result[tileIndex] = { ...result[tileIndex], type: shuffledPool[index], randomSourceType: sourceType };
  });
}

function assignGroupFromMoves(
  result,
  sourceType,
  min,
  maxInclusive,
  rng,
  moves,
) {
  const indicesByUid = new Map(
    result.map((tile, index) => [tile.uid, index]),
  );
  const sourceIndices = result
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile.type === sourceType)
    .map(({ index }) => index);
  if (!sourceIndices.length) return true;
  if (sourceIndices.length % 2 !== 0) {
    throw new RangeError(`random type ${sourceType} count must be even`);
  }
  const sourceIndexSet = new Set(sourceIndices);
  const usedIndices = new Set();
  const pairs = [];
  for (const move of moves) {
    if (!Array.isArray(move) || move.length !== 2) continue;
    const firstIndex = indicesByUid.get(move[0]);
    const secondIndex = indicesByUid.get(move[1]);
    if (
      !sourceIndexSet.has(firstIndex)
      || !sourceIndexSet.has(secondIndex)
      || usedIndices.has(firstIndex)
      || usedIndices.has(secondIndex)
    ) {
      continue;
    }
    pairs.push([firstIndex, secondIndex]);
    usedIndices.add(firstIndex);
    usedIndices.add(secondIndex);
  }
  if (usedIndices.size !== sourceIndices.length) return false;
  const pairTypes = rng.shuffle(pairs.map(() =>
    rng.nextInt(min, maxInclusive + 1)));
  pairs.forEach(([firstIndex, secondIndex], pairIndex) => {
    const type = pairTypes[pairIndex];
    for (const tileIndex of [firstIndex, secondIndex]) {
      result[tileIndex] = {
        ...result[tileIndex],
        type,
        randomSourceType: sourceType,
      };
    }
  });
  return true;
}

function normalizedMovePairs(moves) {
  return (Array.isArray(moves) ? moves : [])
    .filter((move) => Array.isArray(move) && move.length === 2)
    .map(([first, second]) => [String(first), String(second)]);
}

function outsideIn(values) {
  const result = [];
  let left = 0;
  let right = values.length - 1;
  while (left <= right) {
    result.push(values[left]);
    if (right !== left) result.push(values[right]);
    left += 1;
    right -= 1;
  }
  return result;
}

function insideOut(values) {
  return outsideIn(values).reverse();
}

function assertVerifiedMoveCoverage(tiles, moves) {
  const randomTiles = tiles.filter(({ type }) => type === 0 || type === -1);
  const sourceTypeByUid = new Map(
    randomTiles.map(({ uid, type }) => [String(uid), type]),
  );
  const appearances = new Map(
    randomTiles.map(({ uid }) => [String(uid), 0]),
  );
  for (const [firstUid, secondUid] of moves) {
    const firstType = sourceTypeByUid.get(firstUid);
    const secondType = sourceTypeByUid.get(secondUid);
    if (firstType === undefined && secondType === undefined) continue;
    if (
      firstType === undefined
      || secondType === undefined
      || firstType !== secondType
    ) {
      throw new Error(
        "verified moves must pair random tiles from the same source pool",
      );
    }
    appearances.set(firstUid, (appearances.get(firstUid) ?? 0) + 1);
    appearances.set(secondUid, (appearances.get(secondUid) ?? 0) + 1);
  }
  if ([...appearances.values()].some((count) => count !== 1)) {
    throw new Error(
      "verified moves do not cover every random tile exactly once",
    );
  }
}

function assignDirectPairIndices(
  result,
  sourceType,
  min,
  maxInclusive,
  moves,
  seed,
) {
  const indicesByUid = new Map(
    result.map((tile, index) => [String(tile.uid), index]),
  );
  const range = maxInclusive - min + 1;
  let pairIndex = 0;
  for (const [firstUid, secondUid] of moves) {
    const firstIndex = indicesByUid.get(firstUid);
    const secondIndex = indicesByUid.get(secondUid);
    if (
      firstIndex === undefined
      || secondIndex === undefined
      || result[firstIndex].type !== sourceType
      || result[secondIndex].type !== sourceType
    ) {
      continue;
    }
    const type = min + ((pairIndex + (seed >>> 0)) % range);
    for (const tileIndex of [firstIndex, secondIndex]) {
      result[tileIndex] = {
        ...result[tileIndex],
        type,
        randomSourceType: sourceType,
      };
    }
    pairIndex += 1;
  }
}

export function assignSolvableRandomTypes(
  tiles,
  {
    seed = 1,
    blockTypeCount = 32,
    fullTypeMin = 1,
    fullTypeMax = 32,
    solvableMoves,
    isSolvable,
  } = {},
) {
  const source = structuredClone(tiles ?? []);
  const normalMax = Math.trunc(blockTypeCount);
  const normalizedFullTypeMin = Math.trunc(fullTypeMin);
  const normalizedFullTypeMax = Math.trunc(fullTypeMax);
  if (!Number.isInteger(normalMax) || normalMax < 1 || normalMax > 32) {
    throw new RangeError("block type range is invalid");
  }
  if (
    !Number.isInteger(normalizedFullTypeMin)
    || !Number.isInteger(normalizedFullTypeMax)
    || normalizedFullTypeMin < 1
    || normalizedFullTypeMax > 32
    || normalizedFullTypeMax < normalizedFullTypeMin
  ) {
    throw new RangeError("random type -1 range is invalid");
  }
  const moves = normalizedMovePairs(solvableMoves);
  assertVerifiedMoveCoverage(source, moves);
  const candidateGate = typeof isSolvable === "function"
    ? isSolvable
    : () => true;
  const strategies = [
    moves,
    [...moves].reverse(),
    outsideIn(moves),
    insideOut(moves),
  ];
  for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex += 1) {
    const candidate = structuredClone(source);
    const rng = XorShift.fromSeed(
      (Number(seed) + Math.imul(strategyIndex, 0x9e3779b9)) | 0,
    );
    const assignedNormal = assignGroupFromMoves(
      candidate,
      0,
      1,
      normalMax,
      rng,
      strategies[strategyIndex],
    );
    const assignedFull = assignGroupFromMoves(
      candidate,
      -1,
      normalizedFullTypeMin,
      normalizedFullTypeMax,
      rng,
      strategies[strategyIndex],
    );
    if (assignedNormal && assignedFull && candidateGate(candidate)) {
      return candidate;
    }
  }

  const finalCandidate = structuredClone(source);
  assignDirectPairIndices(
    finalCandidate,
    0,
    1,
    normalMax,
    moves,
    Number(seed) | 0,
  );
  assignDirectPairIndices(
    finalCandidate,
    -1,
    normalizedFullTypeMin,
    normalizedFullTypeMax,
    moves,
    Number(seed) | 0,
  );
  if (candidateGate(finalCandidate)) return finalCandidate;
  throw new RangeError(
    "verified random assignment remained unsolvable after 5 bounded strategies",
  );
}

function assignFirstRound(result, blockTypeCount, rng) {
  const byLayer = new Map();
  result.forEach((tile, index) => {
    if (tile.type !== 0 && tile.type !== -1) return;
    const layer = Number(tile.layer);
    const indices = byLayer.get(layer) ?? [];
    indices.push(index);
    byLayer.set(layer, indices);
  });
  if (byLayer.size === 0) return;

  const layers = [...byLayer.keys()].sort((left, right) => left - right);
  const oddLayers = layers.filter((layer) => byLayer.get(layer).length % 2 !== 0);
  if (oddLayers.length % 2 !== 0) {
    throw new RangeError("first round random tile count must be even");
  }

  const assignmentGroups = layers
    .filter((layer) => byLayer.get(layer).length % 2 === 0)
    .map((layer) => [layer]);
  const shuffledOddLayers = rng.shuffle(oddLayers);
  for (let index = 0; index < shuffledOddLayers.length; index += 2) {
    assignmentGroups.push(
      [shuffledOddLayers[index], shuffledOddLayers[index + 1]]
        .sort((left, right) => left - right),
    );
  }
  assignmentGroups.sort((left, right) => left[0] - right[0]);

  const distinctTypeCount = Math.min(
    32,
    Math.max(blockTypeCount, assignmentGroups.length),
  );
  const shuffledTypes = rng.shuffle(
    Array.from({ length: distinctTypeCount }, (_, index) => index + 1),
  );
  assignmentGroups.forEach((group, groupIndex) => {
    const type = shuffledTypes[groupIndex] ?? 1;
    for (const layer of group) {
      for (const tileIndex of byLayer.get(layer)) {
        const sourceType = result[tileIndex].type;
        result[tileIndex] = {
          ...result[tileIndex],
          type,
          randomSourceType: sourceType,
        };
      }
    }
  });
}

export function isFirstRoundDocument(document) {
  const match = String(document?.fileName ?? "").match(/_r(\d+)(?:_|$)/i);
  if (match) return Number(match[1]) === 1;
  return Number(document?.gameplay?.gameLevelOrder) === 1;
}

export function assignRandomTypes(
  tiles,
  {
    seed = 1,
    blockTypeCount = 32,
    fullTypeMin = 1,
    fullTypeMax = 32,
    firstRound = false,
    isSolvable,
    maxFirstRoundAttempts = 64,
    maxRandomAttempts = 64,
    solvableMoves,
  } = {},
) {
  const result = structuredClone(tiles ?? []);
  const rng = XorShift.fromSeed(seed);
  const normalMax = Math.trunc(blockTypeCount);
  if (normalMax < 1 || normalMax > 32) {
    throw new RangeError("block type range is invalid");
  }
  if (firstRound) {
    const candidateGate = typeof isSolvable === "function" ? isSolvable : null;
    const attemptLimit = candidateGate
      ? Math.trunc(Number(maxFirstRoundAttempts))
      : 1;
    if (!Number.isInteger(attemptLimit) || attemptLimit < 1) {
      throw new RangeError("first round attempt limit must be a positive integer");
    }
    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      const candidate = structuredClone(result);
      assignFirstRound(candidate, normalMax, rng);
      if (!candidateGate || candidateGate(candidate)) {
        return candidate;
      }
    }
    throw new RangeError(
      `unable to find a solvable first round assignment after ${attemptLimit} attempts`,
    );
  }
  const normalizedFullTypeMin = Math.trunc(fullTypeMin);
  const normalizedFullTypeMax = Math.trunc(fullTypeMax);
  if (
    !Number.isInteger(normalizedFullTypeMin)
    || !Number.isInteger(normalizedFullTypeMax)
    || normalizedFullTypeMin < 1
    || normalizedFullTypeMax > 32
    || normalizedFullTypeMax < normalizedFullTypeMin
  ) {
    throw new RangeError("random type -1 range is invalid");
  }
  const candidateGate = typeof isSolvable === "function" ? isSolvable : null;
  const attemptLimit = candidateGate
    ? Math.trunc(Number(maxRandomAttempts))
    : 1;
  if (!Number.isInteger(attemptLimit) || attemptLimit < 1) {
    throw new RangeError("random assignment attempt limit must be a positive integer");
  }
  if (candidateGate && Array.isArray(solvableMoves)) {
    const candidate = structuredClone(result);
    const assignedNormal = assignGroupFromMoves(
      candidate,
      0,
      1,
      normalMax,
      rng,
      solvableMoves,
    );
    const assignedFull = assignGroupFromMoves(
      candidate,
      -1,
      normalizedFullTypeMin,
      normalizedFullTypeMax,
      rng,
      solvableMoves,
    );
    if (assignedNormal && assignedFull && candidateGate(candidate)) {
      return candidate;
    }
  }
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const candidate = structuredClone(result);
    assignGroup(candidate, 0, 1, normalMax, rng);
    assignGroup(
      candidate,
      -1,
      normalizedFullTypeMin,
      normalizedFullTypeMax,
      rng,
    );
    if (!candidateGate || candidateGate(candidate)) {
      return candidate;
    }
  }
  throw new RangeError(
    `unable to find a solvable random assignment after ${attemptLimit} attempts`,
  );
}
