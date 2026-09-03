import { describe, expect, it } from "vitest";
import { assignTypes } from "../../src/analysis/deal.js";
import { normalizePawsLevel } from "../../src/model/normalize.js";
import pseudoRandomLevel from "../../bundled-levels/Editorlevel/level_0008_r2_第二关模板2.json";

function levelWithTypes(types, rules = {}) {
  return {
    id: "deal-fixture",
    source: "paws",
    rules: {
      limitedTypeMax: 4,
      fullTypeMin: 5,
      fullTypeMax: 7,
      ...rules,
    },
    tiles: types.map((type, id) => ({ id, type })),
  };
}

function coveredByUpperLayer(tiles, id) {
  const tile = tiles[id];
  return tiles.some((other, otherId) => (
    otherId !== id
    && other.layer > tile.layer
    && Math.abs(other.x - tile.x) < 8
    && Math.abs(other.y - tile.y) < 8
  ));
}

function hasImmediatePair(level, assigned, groupType) {
  const counts = new Map();
  const groupTypes = new Set();
  level.tiles.forEach((tile, id) => {
    if (coveredByUpperLayer(level.tiles, id)) return;
    const type = assigned[id];
    if (type <= 0) return;
    counts.set(type, (counts.get(type) ?? 0) + 1);
    if (tile.type === groupType) groupTypes.add(type);
  });
  return [...groupTypes].some((type) => counts.get(type) >= 2);
}

function pseudoFixture(mode) {
  return {
    id: `pseudo-${mode}`,
    source: "paws",
    rules: {
      gameLevelOrder: 2,
      limitedTypeMax: 3,
      fullTypeMin: 1,
      fullTypeMax: 3,
      pseudoRandomLimitedMode: 0,
      pseudoRandomFullMode: mode,
    },
    tiles: [
      { id: 0, type: -1, x: 0, y: 0, layer: 2 },
      { id: 1, type: -1, x: 16, y: 0, layer: 2 },
      { id: 2, type: -1, x: 0, y: 0, layer: 1 },
      { id: 3, type: -1, x: 16, y: 0, layer: 1 },
    ],
  };
}

describe("deterministic paired deals", () => {
  it("preserves fixed types and pairs type 0 and -1 pools separately", () => {
    const level = levelWithTypes([3, 3, 0, 0, -1, -1]);

    const types = assignTypes(level, 42);

    expect(types.slice(0, 2)).toEqual([3, 3]);
    expect(types[2]).toBe(types[3]);
    expect(types[4]).toBe(types[5]);
    expect(types[2]).toBeGreaterThanOrEqual(1);
    expect(types[2]).toBeLessThanOrEqual(4);
    expect(types[4]).toBeGreaterThanOrEqual(5);
    expect(types[4]).toBeLessThanOrEqual(7);
    expect(types).toEqual(assignTypes(level, 42));
  });

  it("matches the Unity XorShift deal for a fixed runtime seed", () => {
    const level = levelWithTypes(Array(6).fill(0), { gameLevelOrder: 2 });

    expect(assignTypes(level, 42)).toEqual([4, 4, 3, 3, 4, 4]);
  });

  it("reports an odd random group as invalid instead of inventing a match", () => {
    const result = assignTypes(levelWithTypes([0, 0, 0, -1, -1]), 7);

    expect(result).toMatchObject({
      valid: false,
      group: "limited",
      count: 3,
    });
    expect(result.reason).toContain("奇数");
  });

  it("retries a matchable pseudo-random deal until an exposed group pair exists", () => {
    const level = pseudoFixture(1);

    const assigned = assignTypes(level, 0);

    expect(Array.isArray(assigned)).toBe(true);
    expect(hasImmediatePair(level, assigned, -1)).toBe(true);
  });

  it("retries an unmatchable pseudo-random deal until no exposed group pair exists", () => {
    const level = pseudoFixture(2);

    const assigned = assignTypes(level, 4);

    expect(Array.isArray(assigned)).toBe(true);
    expect(hasImmediatePair(level, assigned, -1)).toBe(false);
  });

  it("rejects an impossible unmatchable pseudo-random deal after bounded retries", () => {
    const level = pseudoFixture(2);
    level.tiles.forEach((tile) => { tile.layer = 1; });

    const result = assignTypes(level, 4);

    expect(result).toMatchObject({
      valid: false,
      group: "full",
      mode: 2,
      attempts: 128,
    });
    expect(result.reason).toContain("不可消除");
  });

  it("uses the runtime 1–8 limited pool for first-round levels", () => {
    const level = levelWithTypes(Array(16).fill(0), {
      gameLevelOrder: 1,
      limitedTypeMax: 2,
      pseudoRandomLimitedMode: 0,
      pseudoRandomFullMode: 0,
    });

    const assigned = assignTypes(level, 0);

    expect(Math.min(...assigned)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...assigned)).toBeLessThanOrEqual(8);
    expect(assigned.some((type) => type > 2)).toBe(true);
  });

  it("honors matchable pseudo-random semantics on a bundled Unity level", () => {
    const level = normalizePawsLevel(pseudoRandomLevel, "level_0008_r2_第二关模板2.json");

    const assigned = assignTypes(level, 0);

    expect(Array.isArray(assigned)).toBe(true);
    expect(hasImmediatePair(level, assigned, -1)).toBe(true);
  });
});
