import { describe, expect, it } from "vitest";
import {
  buildReportFilename,
  serializeReportJson,
} from "../../src/io/export-report.js";

const validComparison = {
  schemaVersion: "vcurve-comparison/2",
  options: { seeds: 300, traySlots: 1, policy: "greedy" },
  left: {
    level: { id: "left/0010" },
    curves: { mc: [{ progress: 0, p10: 20, p50: 22, p90: 24 }] },
    metrics: { openingV: 22 },
    diagnostics: [],
  },
  right: {
    level: { id: "right:0020/r2" },
    curves: { mc: [{ progress: 0, p10: 18, p50: 20, p90: 22 }] },
    metrics: { openingV: 20 },
    diagnostics: [],
  },
};

describe("comparison exports", () => {
  it("distinguishes exports of the same levels under different models", () => {
    const reference = buildReportFilename({...validComparison,model:{id:"reference"}}, "json");
    const runtime = buildReportFilename({...validComparison,model:{id:"runtime"}}, "json");
    expect(reference).not.toBe(runtime);
    expect(reference).toContain("reference");
  });
  it("serializes finite report data with the schema version", () => {
    const text = serializeReportJson(validComparison);

    expect(JSON.parse(text).schemaVersion).toBe("vcurve-comparison/2");
    expect(text).not.toMatch(/NaN|Infinity/);
  });

  it("rejects a non-finite report instead of hiding invalid analysis", () => {
    const invalid = structuredClone(validComparison);
    invalid.right.metrics.openingV = Number.NaN;

    expect(() => serializeReportJson(invalid)).toThrow(/有限数值/);
  });

  it("builds a filesystem-safe comparison filename", () => {
    expect(buildReportFilename(validComparison, "json")).toBe(
      "V曲线-left-0010-vs-right-0020-r2.json",
    );
  });

  it("bounds long level ids so the exported filename remains portable", () => {
    const comparison = structuredClone(validComparison);
    comparison.model = {id:"reference"};
    comparison.left.level.id = `left-${"甲".repeat(180)}`;
    comparison.right.level.id = `right-${"乙".repeat(180)}`;

    const filename = buildReportFilename(comparison, "json");

    expect(Array.from(filename).length).toBeLessThanOrEqual(150);
    expect(filename).toMatch(/^V曲线-left-/);
    expect(filename).toMatch(/-vs-right-/);
    expect(filename).toMatch(/\.json$/);
  });
});
