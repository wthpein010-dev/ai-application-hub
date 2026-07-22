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
  for (let index = 0; index < oddLayers.length; index += 2) {
    assignmentGroups.push([oddLayers[index], oddLayers[index + 1]]);
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
  } = {},
) {
  const result = structuredClone(tiles ?? []);
  const rng = XorShift.fromSeed(seed);
  const normalMax = Math.trunc(blockTypeCount);
  if (normalMax < 1 || normalMax > 32) {
    throw new RangeError("block type range is invalid");
  }
  if (firstRound) {
    assignFirstRound(result, normalMax, rng);
    return result;
  }
  assignGroup(result, 0, 1, normalMax, rng);
  assignGroup(result, -1, Math.trunc(fullTypeMin), Math.trunc(fullTypeMax), rng);
  return result;
}
