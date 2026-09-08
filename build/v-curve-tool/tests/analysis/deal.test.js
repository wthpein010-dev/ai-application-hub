import { describe, expect, it } from "vitest";
import { assignTypes } from "../../src/analysis/deal.js";

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

describe("deterministic paired deals", () => {
  it("draws every pair independently instead of guaranteeing a balanced type count", () => {
    const fixture = levelWithTypes(Array(8).fill(0));
    const distinctCounts = Array.from({ length: 12 }, (_, seed) => (
      new Set(assignTypes(fixture, seed)).size
    ));
    expect(distinctCounts.some((count) => count < 4)).toBe(true);
    for (let seed = 0; seed < 12; seed += 1) {
      const counts = new Map();
      for (const type of assignTypes(fixture, seed)) counts.set(type, (counts.get(type) ?? 0) + 1);
      expect([...counts.values()].every((count) => count % 2 === 0)).toBe(true);
    }
  });

  it("honors per-tile ranges for both random pools and rejects odd subgroups", () => {
    const fixture = levelWithTypes([0, 0, -1, -1]);
    fixture.tiles[0].metaType = 12; fixture.tiles[0].metaData = 12;
    fixture.tiles[1].metaType = 12; fixture.tiles[1].metaData = 12;
    fixture.tiles[2].metaType = 19; fixture.tiles[2].metaData = 19;
    fixture.tiles[3].metaType = 19; fixture.tiles[3].metaData = 19;
    expect(assignTypes(fixture, 7)).toEqual([12, 12, 19, 19]);
    fixture.tiles[1].metaData = 13;
    expect(assignTypes(fixture, 7)).toMatchObject({ valid: false, group: "limited", count: 1 });
  });

  it("pairs the fun-clear segment in expected open/high-layer/y/x order", () => {
    const fixture = levelWithTypes(Array(8).fill(-1), { funClearPercent: 50 });
    fixture.tiles = fixture.tiles.map((tile, index) => ({ ...tile, x: (7 - index) * 16, y: 0, layer: 1 }));
    for (let seed = 0; seed < 8; seed += 1) {
      const types = assignTypes(fixture, seed);
      expect(types[7]).toBe(types[6]);
      expect(types[5]).toBe(types[4]);
    }
  });

  it("uses Sheep tiles only as a layout and draws Paws pairs regardless of source types or metadata", () => {
    const fixture = levelWithTypes([1001, 5, 1, 8], { limitedTypeMax: 1 });
    fixture.source = "sheep";
    fixture.tiles.forEach((tile) => { tile.metaType = 20; tile.metaData = 20; });
    expect(assignTypes(fixture, 0)).toEqual([1, 1, 1, 1]);
    expect(fixture.tiles.map((tile) => tile.type)).toEqual([1001, 5, 1, 8]);
  });

  it("keeps 100% fun-clear pairs intact instead of running fill-stack diversity afterwards", () => {
    const fixture = levelWithTypes(Array(8).fill(-1), { fullTypeMin: 1, fullTypeMax: 4, funClearPercent: 100 });
    fixture.tiles = fixture.tiles.map((tile, index) => ({
      ...tile, x: index % 2 * 16, y: 0, layer: 4 - Math.floor(index / 2), presetColorType: 3,
    }));
    for (let seed = 0; seed < 12; seed += 1) {
      const types = assignTypes(fixture, seed);
      expect(types[0]).toBe(types[1]);
      expect(types[2]).toBe(types[3]);
      expect(types[4]).toBe(types[5]);
      expect(types[6]).toBe(types[7]);
    }
  });

  it("diversifies simultaneous fill-stack tops by swapping without changing the pair pool", () => {
    const fixture = levelWithTypes(Array(8).fill(-1), { fullTypeMin: 1, fullTypeMax: 4 });
    fixture.tiles = fixture.tiles.map((tile, index) => ({
      ...tile, x: index % 2 * 16, y: 0, layer: 4 - Math.floor(index / 2), presetColorType: 3,
    }));
    const ordinary = { ...fixture, tiles: fixture.tiles.map((tile) => ({ ...tile, presetColorType: 1 })) };
    const mixedSeeds = Array.from({ length: 20 }, (_, seed) => seed).filter((seed) => {
      const types = assignTypes(ordinary, seed);
      return types[0] === types[1] && new Set(types).size > 1;
    });
    expect(mixedSeeds.length).toBeGreaterThan(0);
    expect(mixedSeeds.some((seed) => {
      const types = assignTypes(fixture, seed);
      const original = assignTypes(ordinary, seed);
      expect([...types].sort()).toEqual([...original].sort());
      return types[0] !== types[1];
    })).toBe(true);
  });
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

  it("reports an odd random group as invalid instead of inventing a match", () => {
    const result = assignTypes(levelWithTypes([0, 0, 0, -1, -1]), 7);

    expect(result).toMatchObject({
      valid: false,
      group: "limited",
      count: 3,
    });
    expect(result.reason).toContain("奇数");
  });
});
