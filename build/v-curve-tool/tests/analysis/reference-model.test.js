import { describe, expect, it } from "vitest";
import referenceSamples from "../../src/data/reference-sample.json";
import referenceCurves from "../fixtures/reference-curves.json";
import { analyzeReferenceModel } from "../../src/analysis/reference-model.js";
import { normalizeSheepLevel } from "../../src/model/normalize.js";
import sheep900121Source from "../../src/data/sheep-900121.json";

function levelFrom(tiles, rules = {}) {
  return {
    id: "independent-small-board",
    source: "paws",
    rules: { limitedTypeMax: 1, fullTypeMin: 5, fullTypeMax: 5, ...rules },
    warnings: [],
    tiles: tiles.map((tile, id) => ({
      id, x: id * 16, y: 0, layer: 1, type: 1,
      moldType: 1, metaType: 0, metaData: 0, presetColorType: 0, ...tile,
    })),
  };
}

const quick = { seeds: 3, riverRestarts: 2, traySlots: 1 };
const chartPoints = (points, field = "y") => points.map((p) => ({
  x: Number((p.progress * 100).toFixed(2)),
  y: Number(p[field].toFixed(2)),
}));

describe("audited screenshot reference model", () => {
  for (const [key, sample] of [
    ["sheep", referenceSamples.sheep900121],
    ["paws", referenceSamples.pawsLevel0020],
  ]) {
    it(`reproduces all six ${key} screenshot curves and repairs only the lower tail`, () => {
      const result = analyzeReferenceModel(sample, {
        seeds: 300, traySlots: 1, policy: "greedy", riverRestarts: 20,
      });
      const original = referenceCurves[key];
      expect(result.openingV).toBe(key === "sheep" ? 25 : 32);
      expect(chartPoints(result.expected.filter((p) => p.removed % 2 === 0))).toEqual(original.ev);
      expect(chartPoints(result.river.upper)).toEqual(original.hi);
      const lower = chartPoints(result.river.lower);
      expect(lower.slice(0, original.lo.length)).toEqual(original.lo);
      expect(lower.length).toBeGreaterThan(original.lo.length);
      expect(result.river.lower.at(-1).removed).toBe(key === "sheep" ? 258 : 360);
      for (const field of ["p10", "p50", "p90"]) {
        expect(chartPoints(result.simulation.points, field)).toEqual(original[field]);
      }
      expect(result.simulation.valid).toBe(true);
      expect(result.simulation.completionRate).toBe(0);
      expect(result.simulation.averageDeadlockProgress).toBeCloseTo(original.stuck, 12);
      expect(result.simulation.points.at(-1)).toMatchObject(
        key === "sheep" ? { removed: 151, samples: 23 } : { removed: 256, samples: 17 },
      );
      expect(result.river.lowerDeadlocks).toBe(key === "sheep" ? 19 : 20);
    });
  }

  it("keeps the source order immutable and is not tied to sample IDs", () => {
    const level = levelFrom([{ x: 0 }, { x: 8 }, { x: 16 }, { x: 24 }]);
    const before = JSON.stringify(level);
    const result = analyzeReferenceModel(level, quick);
    expect(result.openingV).toBe(4);
    expect(result.simulation.completionRate).toBe(1);
    expect(result.simulation.points).toEqual([
      { removed: 0, progress: 0, samples: 3, p10: 4, p50: 4, p90: 4 },
      { removed: 2, progress: 0.5, samples: 3, p10: 2, p50: 2, p90: 2 },
      { removed: 4, progress: 1, samples: 3, p10: 0, p50: 0, p90: 0 },
    ]);
    expect(JSON.stringify(level)).toBe(before);
  });

  it("uses 25-percent footprint coverage, including the exact threshold", () => {
    const thinOverlap = levelFrom([{ x: 0 }, { x: 7, layer: 2 }]);
    const thresholdOverlap = levelFrom([{ x: 0 }, { x: 6, layer: 2 }]);
    expect(analyzeReferenceModel(thinOverlap, quick).openingV).toBe(2);
    expect(analyzeReferenceModel(thresholdOverlap, quick).openingV).toBe(1);
  });

  it("preserves fixed types and cannot clear mismatched tiles by filling the tray", () => {
    const result = analyzeReferenceModel(levelFrom([{ type: 4 }, { type: 5 }]), {
      ...quick, traySlots: 2,
    });
    expect(result.simulation.valid).toBe(true);
    expect(result.simulation.completionRate).toBe(0);
    expect(result.simulation.completedCount).toBe(0);
    expect(result.simulation.deadlockedCount).toBe(3);
    expect(result.simulation.points.at(-1)).toMatchObject({ removed: 2, p50: 0 });
  });

  it("keeps limited and full-random pools in their configured ranges", () => {
    // Exposed 1/5 cannot pair with zero trays. Ignoring the full range would clear this board.
    const level = levelFrom([
      { x: 0, type: 0 },
      { x: 24, type: -1 },
      { x: 24, layer: 2, type: 0 },
      { x: 0, layer: 2, type: -1 },
    ]);
    const blocked = analyzeReferenceModel(level, { ...quick, traySlots: 0 });
    expect(blocked.simulation.averageDeadlockProgress).toBe(0);
    expect(blocked.simulation.completionRate).toBe(0);
    expect(analyzeReferenceModel(level, quick).simulation.completionRate).toBe(1);
  });

  it.each([
    [[0, 0, 0, -1, -1], "limited", 3],
    [[0, 0, -1], "full", 1],
  ])("rejects odd independent random groups without inventing a pair", (types, group, count) => {
    const result = analyzeReferenceModel(levelFrom(types.map((type) => ({ type }))), quick);
    expect(result.simulation).toMatchObject({
      valid: false, points: [], dealError: { group, count },
    });
    expect(result.simulation.reason).toContain("奇数");
  });

  it("requires the original minimum of three represented seeds", () => {
    const result = analyzeReferenceModel(levelFrom([{}, {}]), { ...quick, seeds: 2 });
    expect(result.simulation.representedThreshold).toBe(3);
    expect(result.simulation.points).toEqual([]);
    expect(result.simulation.completionRate).toBe(1);
  });

  it("counts a stash as board departure before it has matched", () => {
    const result = analyzeReferenceModel(levelFrom([{ x: 0 }, { x: 0, layer: 2 }]), quick);
    expect(result.simulation.points).toEqual([
      { removed: 0, progress: 0, samples: 3, p10: 1, p50: 1, p90: 1 },
      { removed: 1, progress: 0.5, samples: 3, p10: 1, p50: 1, p90: 1 },
      { removed: 2, progress: 1, samples: 3, p10: 0, p50: 0, p90: 0 },
    ]);
  });

  it("marks special mechanics incomplete even without precomputed warnings", () => {
    const result = analyzeReferenceModel(levelFrom([{ metaType: 1 }, {}]), quick);
    expect(result.simulation.incomplete).toBe(true);
    expect(result.simulation.incompleteReason).toContain("不完整");
  });

  it("rejects an empty board instead of returning NaN progress", () => {
    expect(() => analyzeReferenceModel(levelFrom([]), quick)).toThrow(/砖块/);
  });

  it("uses original-order referenceTiles when a normalized level carries both orders", () => {
    const level = structuredClone(referenceSamples.sheep900121);
    level.referenceTiles = [...level.tiles];
    level.tiles.sort((left, right) => left.layer - right.layer);
    const result = analyzeReferenceModel(level, { seeds: 300, riverRestarts: 20 });
    expect(chartPoints(result.simulation.points, "p50")).toEqual(referenceCurves.sheep.p50);
  });

  it("supports seeded random policy on arbitrary fixed and random pools", () => {
    const level = levelFrom([{ type: 0 }, { type: 0 }, { type: -1 }, { type: -1 }]);
    const first = analyzeReferenceModel(level, { ...quick, policy: "random" });
    const second = analyzeReferenceModel(level, { ...quick, policy: "random" });
    expect(first).toEqual(second);
    expect(first.simulation.completionRate).toBe(1);
  });

  it("reproduces the six original sheep curves from the actual 900121 source file", () => {
    const normalized = normalizeSheepLevel(sheep900121Source, "900121.json");
    const runtimeOrder = normalized.tiles.map((tile) => tile.layer);
    expect(runtimeOrder).toEqual([...runtimeOrder].sort((a, b) => a - b));
    const result = analyzeReferenceModel(normalized, { seeds: 300, riverRestarts: 20 });
    const original = referenceCurves.sheep;
    expect(chartPoints(result.expected.filter((point) => point.removed % 2 === 0))).toEqual(original.ev);
    expect(chartPoints(result.river.upper)).toEqual(original.hi);
    expect(chartPoints(result.river.lower).slice(0, original.lo.length)).toEqual(original.lo);
    for (const field of ["p10", "p50", "p90"]) {
      expect(chartPoints(result.simulation.points, field)).toEqual(original[field]);
    }
    expect(normalized.tiles.map((tile) => tile.layer)).toEqual(runtimeOrder);
  });
});
