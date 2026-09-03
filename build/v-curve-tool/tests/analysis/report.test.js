import { describe, expect, it } from "vitest";
import {
  analyzeLevel,
  compareReports,
  summarizeReport,
} from "../../src/analysis/report.js";

function tile(id, x, type = 1) {
  return {
    id,
    x,
    y: 0,
    layer: 1,
    type,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType: 1,
  };
}

function smallLevel(types = [1, 1, 2, 2], id = "small") {
  return {
    id,
    name: id,
    source: "paws",
    sourceFile: `${id}.json`,
    tiles: types.map((type, index) => tile(index, index * 16, type)),
    rules: {
      gameLevelOrder: 2,
      limitedTypeMax: 4,
      fullTypeMin: 1,
      fullTypeMax: 4,
      pseudoRandomLimitedMode: 0,
      pseudoRandomFullMode: 0,
    },
    warnings: [],
  };
}

function fakeBandReport() {
  return {
    level: {
      tiles: 100,
      layers: 6,
      typePoolLabel: "1–8",
    },
    curves: {
      mc: [
        { progress: 0, p10: 12, p50: 14, p90: 16 },
        { progress: 0.25, p10: 6, p50: 8, p90: 10 },
        { progress: 0.5, p10: 4, p50: 6, p90: 8 },
      ],
      riverUpper: [{ progress: 0.5, y: 12 }],
      riverLower: [{ progress: 0.5, y: 3 }],
    },
    simulation: {
      valid: true,
      completionRate: 0.2,
      averageDeadlockProgress: 0.64,
    },
    river: {
      lowerDeadlocks: 7,
      lowerDeadlockAverageProgress: 0.72,
    },
  };
}

describe("analysis report aggregation", () => {
  it("returns requested percentile bands at 25 and 50 percent", () => {
    const metrics = summarizeReport(fakeBandReport());

    expect(metrics.mc25).toEqual({ p10: 6, p50: 8, p90: 10 });
    expect(metrics.mc50).toEqual({ p10: 4, p50: 6, p90: 8 });
    expect(metrics.midRiver).toEqual({ lower: 3, upper: 12 });
  });

  it("does not extrapolate MC metrics beyond the represented sample domain", () => {
    const report = fakeBandReport();
    report.curves.mc = [
      { progress: 0, p10: 10, p50: 12, p90: 14 },
      { progress: 0.2, p10: 4, p50: 5, p90: 6 },
    ];

    const metrics = summarizeReport(report);

    expect(metrics.mc25).toBeNull();
    expect(metrics.mc50).toBeNull();
  });

  it("emits each analysis stage and returns finite serializable data", () => {
    const stages = [];
    const report = analyzeLevel(smallLevel(), {
      seeds: 5,
      traySlots: 1,
      policy: "greedy",
      riverRestarts: 2,
    }, (event) => stages.push(event.stage));

    expect(stages).toEqual([
      "structure",
      "expected-v",
      "river",
      "monte-carlo",
      "metrics",
      "diagnostics",
    ]);
    expect(report.schemaVersion).toBe("vcurve-report/1");
    expect(report.metrics).toMatchObject({ tiles: 4, layers: 1, completionRate: 1 });
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });

  it("keeps structure results but marks Monte Carlo invalid for an odd pool", () => {
    const report = analyzeLevel(smallLevel([0, 0, 0, 1], "odd"), {
      seeds: 5,
      riverRestarts: 1,
    });

    expect(report.curves.expected).not.toHaveLength(0);
    expect(report.simulation.valid).toBe(false);
    expect(report.warnings.some((warning) => warning.includes("奇数"))).toBe(true);
  });

  it("marks special mechanics as an incomplete gameplay simulation", () => {
    const special = smallLevel();
    special.tiles[0].metaType = 2;
    special.warnings = ["包含动态砖或非零 metaType：结构可分析，但玩法 MC 可能不完整。"];

    const report = analyzeLevel(special, { seeds: 3, riverRestarts: 1 });

    expect(report.simulation).toMatchObject({
      valid: true,
      incomplete: true,
    });
    expect(report.simulation.incompleteReason).toContain("玩法仿真不完整");
  });

  it("builds a versioned Sheep-versus-Paws comparison", () => {
    const sheep = analyzeLevel(smallLevel(undefined, "900121"), {
      seeds: 3,
      riverRestarts: 1,
    });
    const paws = analyzeLevel(smallLevel(undefined, "level_0020"), {
      seeds: 3,
      riverRestarts: 1,
    });

    const comparison = compareReports(sheep, paws);

    expect(comparison).toMatchObject({
      schemaVersion: "vcurve-comparison/1",
      sheep: { level: { id: "900121" } },
      paws: { level: { id: "level_0020" } },
    });
  });

  it("labels Sheep structure-only type zero tiles as the 1–15 baseline pool", () => {
    const sheepLevel = {
      ...smallLevel([0, 0, 0, 0], "900121"),
      source: "sheep",
      rules: {
        ...smallLevel().rules,
        limitedTypeMax: 15,
        fullTypeMin: 1,
        fullTypeMax: 15,
      },
    };

    const report = analyzeLevel(sheepLevel, { seeds: 3, riverRestarts: 1 });

    expect(report.level.typePoolLabel).toBe("1–15");
  });
});
