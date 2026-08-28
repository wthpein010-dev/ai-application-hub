import { mulberry32, shuffleInPlace } from "./random.js";

function finiteInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function pairedPool(count, minimum, maximum, random) {
  const candidates = [];
  for (let type = minimum; type <= maximum; type += 1) candidates.push(type);
  shuffleInPlace(candidates, random);

  const pool = [];
  for (let pair = 0; pair < count / 2; pair += 1) {
    const type = candidates[pair % candidates.length];
    pool.push(type, type);
  }
  return shuffleInPlace(pool, random);
}

function invalidGroup(group, count) {
  return {
    valid: false,
    group,
    count,
    reason: `${group === "limited" ? "限定随机" : "全随机"}组砖数为奇数（${count}），无法成对出盘。`,
  };
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

  if (limitedIds.length % 2 !== 0) return invalidGroup("limited", limitedIds.length);
  if (fullIds.length % 2 !== 0) return invalidGroup("full", fullIds.length);

  const random = mulberry32(seed);
  const limitedMax = Math.max(1, finiteInt(level?.rules?.limitedTypeMax, 8));
  const fullMin = Math.max(1, finiteInt(level?.rules?.fullTypeMin, 1));
  const fullMax = Math.max(fullMin, finiteInt(level?.rules?.fullTypeMax, 32));
  const limitedPool = pairedPool(limitedIds.length, 1, limitedMax, random);
  const fullPool = pairedPool(fullIds.length, fullMin, fullMax, random);

  limitedIds.forEach((id, index) => { types[id] = limitedPool[index]; });
  fullIds.forEach((id, index) => { types[id] = fullPool[index]; });
  return types;
}
