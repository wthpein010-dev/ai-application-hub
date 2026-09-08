import { describe, expect, it } from "vitest";
import {
  analyzeLevel,
  analyzeComparisonLevels,
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
  it("reports custom random subranges and fixed patterns together", () => {
    const fixture = smallLevel([0, 0, -1, -1, 8, 8]);
    fixture.tiles[0].metaType = 12; fixture.tiles[0].metaData = 17;
    fixture.tiles[1].metaType = 12; fixture.tiles[1].metaData = 17;
    fixture.tiles[2].metaType = 3; fixture.tiles[2].metaData = 9;
    fixture.tiles[3].metaType = 3; fixture.tiles[3].metaData = 9;
    const report = analyzeLevel(fixture, { model: "runtime", seeds: 3, riverRestarts: 1 });
    expect(report.level.typePoolLabel).toBe("限定 12–17 + 全随机 3–9 + 固定 8");
  });

  it("keeps actual sample counts and their progress while interpolating runtime percentile values", () => {
    const report = fakeBandReport();
    report.curves.mc = [
      { progress: 0.2, samples: 20, p10: 10, p50: 12, p90: 14 },
      { progress: 0.3, samples: 16, p10: 6, p50: 8, p90: 10 },
    ];
    expect(summarizeReport(report).mc25).toMatchObject({
      p10: 8, p50: 10, p90: 12, samples: 16, sampleProgress: 0.3,
    });
  });

  it("reports the reached reference bucket without averaging adjacent tray states", () => {
    const report = fakeBandReport();
    report.model = { id: "reference" };
    report.curves.mc = [
      { progress: 0.24, samples: 30, p10: 10, p50: 12, p90: 14 },
      { progress: 0.26, samples: 17, p10: 5, p50: 7, p90: 9 },
    ];
    expect(summarizeReport(report).mc25).toMatchObject({
      p10: 5, p50: 7, p90: 9, samples: 17, sampleProgress: 0.26,
    });
  });
  it("returns requested percentile bands at 25 and 50 percent", () => {
    const metrics = summarizeReport(fakeBandReport());

    expect(metrics.mc25).toMatchObject({ p10: 6, p50: 8, p90: 10 });
    expect(metrics.mc50).toMatchObject({ p10: 4, p50: 6, p90: 8 });
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
    special.modelLimitations = ["包含动态砖：玩法仿真不完整。"];
    special.warnings = [...special.modelLimitations];

    const report = analyzeLevel(special, { seeds: 3, riverRestarts: 1 });

    expect(report.simulation).toMatchObject({
      valid: true,
      incomplete: true,
    });
    expect(report.simulation.incompleteReason).toContain("玩法仿真不完整");
  });

  it("builds a versioned left-versus-right comparison", () => {
    const left = analyzeLevel(smallLevel(undefined, "900121"), {
      seeds: 3,
      riverRestarts: 1,
    });
    const right = analyzeLevel(smallLevel(undefined, "level_0020"), {
      seeds: 3,
      riverRestarts: 1,
    });

    const comparison = compareReports(left, right);

    expect(comparison).toMatchObject({
      schemaVersion: "vcurve-comparison/2",
      left: { level: { id: "900121" } },
      right: { level: { id: "level_0020" } },
    });
  });

  it("keeps same-id warnings distinguishable by comparison side", () => {
    const left = analyzeLevel({ ...smallLevel(), id: "level_0020", warnings: ["同一告警"] }, {
      seeds: 3,
      riverRestarts: 1,
    });
    const right = analyzeLevel({ ...smallLevel(), id: "level_0020", warnings: ["同一告警"] }, {
      seeds: 3,
      riverRestarts: 1,
    });

    expect(compareReports(left, right).warnings).toEqual(expect.arrayContaining([
      "左侧 level_0020：同一告警",
      "右侧 level_0020：同一告警",
    ]));
  });

  it("analyzes both selected levels and labels progress by side", () => {
    const progress = [];

    const comparison = analyzeComparisonLevels(
      smallLevel(undefined, "left_0010"),
      smallLevel(undefined, "right_0020"),
      { seeds: 3, riverRestarts: 1 },
      (event) => progress.push(event),
    );

    expect(comparison.left.level.id).toBe("left_0010");
    expect(comparison.right.level.id).toBe("right_0020");
    expect(progress[0]).toMatchObject({ side: "left", payload: { stage: "structure" } });
    expect(progress.at(-1)).toMatchObject({ side: "right", payload: { stage: "diagnostics" } });
    expect(progress.filter((event) => event.side === "left")).toHaveLength(6);
    expect(progress.filter((event) => event.side === "right")).toHaveLength(6);
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
