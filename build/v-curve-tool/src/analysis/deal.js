import { mulberry32, shuffleInPlace } from "./random.js";

function finiteInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function pairedPool(count, minimum, maximum, random) {
  const pool = [];
  for (let pair = 0; pair < count / 2; pair += 1) {
    const type = minimum + Math.floor(random() * (maximum - minimum + 1));
    pool.push(type, type);
  }
  return pool;
}

function invalidGroup(group, count, range) {
  return {
    valid: false,
    group,
    count,
    range,
    reason: `${group === "limited" ? "限定随机" : "全随机"}${range ? `（${range.join("–")}）` : ""}组砖数为奇数（${count}），无法成对出盘。`,
  };
}

function typeRange(tile, rules, full) {
  const custom = tile.metaType > 0 && tile.metaData > 0;
  const minimum = custom ? tile.metaType : full ? rules.fullTypeMin : 1;
  const maximum = custom ? tile.metaData : full ? rules.fullTypeMax : rules.limitedTypeMax;
  const range = [minimum, maximum].map((value) => Math.min(32, Math.max(1, value)));
  return range.sort((left, right) => left - right);
}

// Client CompareExpectedClearOrder uses initial face-up operability, then layer/y/x.
// Flip animation is omitted from play simulation, but its initial state affects dealing.
function expectedClearOrder(tiles, features = {}) {
  const open = tiles.map((tile, index) => {
    const covered = tiles.some((upper) => upper.layer > tile.layer
      && Math.abs(upper.x - tile.x) < 8 && Math.abs(upper.y - tile.y) < 8);
    const manualFlip = tile.presetColorType === 2;
    const periodicFlip = features.flipEvery > 0 && (index + 1) % features.flipEvery === 0;
    const faceDown = tile.presetColorType === 3 ? covered : manualFlip || periodicFlip;
    return !covered && !faceDown;
  });
  return (left, right) => Number(open[right]) - Number(open[left])
    || (tiles[right].layer ?? 1) - (tiles[left].layer ?? 1)
    || (tiles[left].y ?? 0) - (tiles[right].y ?? 0)
    || (tiles[left].x ?? 0) - (tiles[right].x ?? 0)
    || left - right;
}

function assignGroups(tiles, types, ids, rules, full, sequential, random) {
  const groups = new Map();
  for (const id of ids) {
    const range = typeRange(tiles[id], rules, full);
    const key = range.join("|");
    if (!groups.has(key)) groups.set(key, { range, ids: [] });
    groups.get(key).ids.push(id);
  }
  for (const { range, ids: groupIds } of groups.values()) {
    if (groupIds.length % 2) return invalidGroup(full ? "full" : "limited", groupIds.length, range);
    const pool = pairedPool(groupIds.length, ...range, random);
    if (!sequential) shuffleInPlace(pool, random);
    groupIds.forEach((id, index) => { types[id] = pool[index]; });
  }
  return null;
}

// Port of the client's same-depth fill-stack swap: preserve total pair counts.
function diversifyFillStacks(tiles, types, fullIds) {
  const stacks = new Map();
  for (const id of fullIds) {
    const tile = tiles[id];
    const legacyFillTop = tile.presetColorType === 1 && tiles.some((lower) => (
      lower.x === tile.x && lower.y === tile.y && lower.layer < tile.layer && lower.presetColorType === 3
    ));
    if (tile.moldType !== 2 && tile.presetColorType !== 3 && !legacyFillTop) continue;
    const key = `${tile.x}|${tile.y}`;
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(id);
  }
  if (stacks.size < 2) return;
  for (const stack of stacks.values()) stack.sort((a, b) => tiles[b].layer - tiles[a].layer);
  const maxDepth = Math.max(...[...stacks.values()].map((stack) => stack.length));
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const cohort = [...stacks.values()].filter((stack) => depth < stack.length).map((stack) => stack[depth]);
    for (let index = 0; index < cohort.length; index += 1) {
      const id = cohort[index];
      if (!cohort.slice(0, index).some((other) => types[other] === types[id])) continue;
      const cohortTypes = new Set(cohort.filter((other) => other !== id).map((other) => types[other]));
      const swapCandidates = fullIds.filter((other) => !cohort.includes(other) && types[other] !== types[id]);
      const swapId = swapCandidates.find((other) => !cohortTypes.has(types[other])) ?? swapCandidates[0];
      if (swapId !== undefined) [types[id], types[swapId]] = [types[swapId], types[id]];
    }
  }
}

export function assignTypes(level, seed = 0) {
  const sourceTiles = Array.isArray(level?.tiles) ? level.tiles : [];
  const tiles = level.source === "sheep" ? sourceTiles.map((tile) => ({
    ...tile, type: 0, metaType: 0, metaData: 0, presetColorType: 1,
  })) : sourceTiles;
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
  const rules = {
    limitedTypeMax: finiteInt(level?.rules?.limitedTypeMax, 8),
    fullTypeMin: finiteInt(level?.rules?.fullTypeMin, 1),
    fullTypeMax: finiteInt(level?.rules?.fullTypeMax, 32),
  };
  const funPercent = Math.min(100, Math.max(0, finiteInt(level?.rules?.funClearPercent, 0)));
  const compare = expectedClearOrder(tiles, level.features);
  const split = (ids) => {
    const sorted = [...ids].sort(compare);
    const count = Math.floor(sorted.length * funPercent / 100) & ~1;
    return [sorted.slice(0, count), sorted.slice(count)];
  };
  const [funLimited, restLimited] = split(limitedIds);
  const [funFull, restFull] = split(fullIds);
  for (const [ids, full, sequential] of [
    [funLimited, false, true], [funFull, true, true],
    [restLimited, false, false], [restFull, true, false],
  ]) {
    const error = assignGroups(tiles, types, ids, rules, full, sequential, random);
    if (error) return error;
  }
  if (funPercent === 0 && level.source !== "sheep") diversifyFillStacks(tiles, types, fullIds);
  return types;
}
