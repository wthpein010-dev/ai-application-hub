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
