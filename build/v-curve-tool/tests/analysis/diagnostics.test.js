import { describe, expect, it } from "vitest";
import { diagnoseReport } from "../../src/analysis/diagnostics.js";

function reportWithP50(points) {
  return {
    level: { tiles: 100 },
    curves: {
      mc: points.map(([progress, p50]) => ({ progress, p10: p50, p50, p90: p50 })),
      riverLower: [],
    },
    river: { lowerDeadlocks: 0, lowerDeadlockAverageProgress: null },
  };
}

describe("numeric curve diagnostics", () => {
  it("detects an early dive using measured percentages", () => {
    const notes = diagnoseReport(reportWithP50([
      [0, 24],
      [0.2, 10],
      [0.5, 9],
      [1, 0],
    ]));
    const note = notes.find((entry) => entry.code === "early-dive");

    expect(note).toMatchObject({ severity: "warning" });
    expect(note.message).toContain("20%");
    expect(note.message).toContain("24");
    expect(note.message).toContain("10");
  });

  it("detects a measured cliff from 40 to 60 percent", () => {
    const notes = diagnoseReport(reportWithP50([
      [0, 20],
      [0.2, 18],
      [0.4, 16],
      [0.6, 7],
      [1, 0],
    ]));

    expect(notes.find((entry) => entry.code === "mid-cliff")).toMatchObject({
      severity: "danger",
      evidence: { fromProgress: 0.4, toProgress: 0.6, fromV: 16, toV: 7 },
    });
  });

  it("does not invent dive or cliff warnings for a gradual curve", () => {
    const notes = diagnoseReport(reportWithP50([
      [0, 20],
      [0.2, 17],
      [0.4, 14],
      [0.6, 11],
      [0.8, 8],
      [1, 0],
    ]));

    expect(notes.some((entry) => ["early-dive", "mid-cliff"].includes(entry.code))).toBe(false);
  });

  it("does not diagnose 60 percent when represented MC data ends at 50 percent", () => {
    const notes = diagnoseReport(reportWithP50([
      [0, 20],
      [0.4, 16],
      [0.5, 7],
    ]));

    expect(notes.some((entry) => entry.code === "mid-cliff")).toBe(false);
  });

  it("uses the chart terminology in river-boundary diagnostics", () => {
    const report = reportWithP50([
      [0, 20],
      [0.5, 10],
    ]);
    report.river = { lowerDeadlocks: 4, lowerDeadlockAverageProgress: 0.62 };

    const note = diagnoseReport(report).find((entry) => entry.code === "no-slot-neck");

    expect(note).toMatchObject({
      title: "河道下界(min)出现无槽窄口",
      message: "4 次河道下界(min)重启在平均 62% 进度遇到 V<2。",
    });
  });
});
