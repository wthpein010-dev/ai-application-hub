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

export function assignRandomTypes(
  tiles,
  {
    seed = 1,
    blockTypeCount = 32,
    fullTypeMin = 1,
    fullTypeMax = 32,
  } = {},
) {
  const result = structuredClone(tiles ?? []);
  const rng = XorShift.fromSeed(seed);
  const normalMax = Math.trunc(blockTypeCount);
  if (normalMax < 1 || normalMax > 32) {
    throw new RangeError("block type range is invalid");
  }
  assignGroup(result, 0, 1, normalMax, rng);
  assignGroup(result, -1, Math.trunc(fullTypeMin), Math.trunc(fullTypeMax), rng);
  return result;
}
