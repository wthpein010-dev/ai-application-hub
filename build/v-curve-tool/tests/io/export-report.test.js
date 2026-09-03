import { describe, expect, it } from "vitest";
import {
  buildReportFilename,
  serializeReportJson,
} from "../../src/io/export-report.js";

const validComparison = {
  schemaVersion: "vcurve-comparison/1",
  options: { seeds: 300, traySlots: 1, policy: "greedy" },
  sheep: {
    level: { id: "900121" },
    curves: { mc: [{ progress: 0, p10: 20, p50: 22, p90: 24 }] },
    metrics: { openingV: 22 },
    diagnostics: [],
  },
  paws: {
    level: { id: "level_0020/r2" },
    curves: { mc: [{ progress: 0, p10: 18, p50: 20, p90: 22 }] },
    metrics: { openingV: 20 },
    diagnostics: [],
  },
};

describe("comparison exports", () => {
  it("serializes finite report data with the schema version", () => {
    const text = serializeReportJson(validComparison);

    expect(JSON.parse(text).schemaVersion).toBe("vcurve-comparison/1");
    expect(text).not.toMatch(/NaN|Infinity/);
  });

  it("rejects a non-finite report instead of hiding invalid analysis", () => {
    const invalid = structuredClone(validComparison);
    invalid.paws.metrics.openingV = Number.NaN;

    expect(() => serializeReportJson(invalid)).toThrow(/有限数值/);
  });

  it("builds a filesystem-safe comparison filename", () => {
    expect(buildReportFilename(validComparison, "json")).toBe(
      "V曲线-900121-vs-level_0020-r2.json",
    );
  });
});
