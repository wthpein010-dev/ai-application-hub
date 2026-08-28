import { describe, expect, it } from "vitest";
import {
  VChart,
  createComparisonScales,
  reportToSeries,
  sampleSeriesValue,
} from "../../src/ui/chart.js";

function recordingCanvas(width = 640, height = 330) {
  const calls = [];
  const context = {
    calls,
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    arc(...args) { calls.push(["arc", ...args]); },
    fillText(...args) { calls.push(["fillText", ...args]); },
  };
  return {
    calls,
    canvas: {
      width: 0,
      height: 0,
      parentElement: { clientWidth: width },
      getContext: () => context,
      getBoundingClientRect: () => ({ width, height, left: 0 }),
      addEventListener() {},
      removeEventListener() {},
    },
  };
}

describe("comparison chart geometry", () => {
  it("uses the same y maximum for Sheep and Paws charts", () => {
    const sheepSeries = [{ points: [{ progress: 0, y: 33 }, { progress: 1, y: 0 }] }];
    const pawsSeries = [{ points: [{ progress: 0, y: 18 }, { progress: 1, y: 0 }] }];

    const scales = createComparisonScales(sheepSeries, pawsSeries, 900, 360);

    expect(scales.sheep.yMax).toBe(scales.paws.yMax);
    expect(scales.sheep.yMax).toBe(40);
  });

  it("maps the shared percentage axis to the plot edges", () => {
    const scales = createComparisonScales([], [], 700, 320);

    expect(scales.sheep.x(0)).toBe(scales.sheep.plot.left);
    expect(scales.sheep.x(1)).toBe(scales.sheep.plot.right);
    expect(scales.sheep.y(0)).toBe(scales.sheep.plot.bottom);
    expect(scales.sheep.y(scales.sheep.yMax)).toBe(scales.sheep.plot.top);
  });

  it("does not show stale hover values after a series has ended", () => {
    const series = {
      valueKey: "p50",
      points: [
        { progress: 0, p50: 20 },
        { progress: 0.5, p50: 8 },
      ],
    };

    expect(sampleSeriesValue(series, 0.4)).toBe(8);
    expect(sampleSeriesValue(series, 0.75)).toBeNull();
  });

  it("uses the reference terminology in chart labels", () => {
    const labels = reportToSeries({ curves: {} }).map((series) => series.label);

    expect(labels).toEqual([
      "河道上界(max)",
      "河道下界(min)",
      "E[V]近似",
      "MC P90",
      "MC P50",
      "MC P10",
    ]);
  });

  it("marks an early Monte Carlo endpoint without extending its data domain", () => {
    const report = {
      curves: {
        mc: [
          { progress: 0, samples: 300, p10: 18, p50: 22, p90: 26 },
          { progress: 146 / 258, samples: 15, p10: 6, p50: 7, p90: 8 },
        ],
      },
    };

    const mcSeries = reportToSeries(report).filter((series) => series.key.startsWith("mc"));

    expect(mcSeries.map((series) => series.terminalProgress)).toEqual([
      146 / 258,
      146 / 258,
      146 / 258,
    ]);
    expect(mcSeries.find((series) => series.key === "mcP50").terminalLabel).toBe(
      "MC 有效样本止于 57%",
    );
    expect(mcSeries.every((series) => series.points.at(-1).progress === 146 / 258)).toBe(true);
  });

  it("renders an early Monte Carlo endpoint as capped lines with one explanation", () => {
    const report = {
      curves: {
        mc: [
          { progress: 0, samples: 300, p10: 18, p50: 22, p90: 26 },
          { progress: 0.5, samples: 15, p10: 6, p50: 7, p90: 8 },
        ],
      },
    };
    const { canvas, calls } = recordingCanvas();

    new VChart(canvas, { series: reportToSeries(report), yMax: 40 });

    expect(calls.filter(([name]) => name === "arc")).toHaveLength(3);
    expect(calls.filter(([name, text]) => name === "fillText" && text === "MC 有效样本止于 50%"))
      .toHaveLength(1);
  });

  it.each([
    [0.995, "MC 有效样本止于 99.5%"],
    [0.999, "MC 有效样本止于 99.9%"],
  ])("marks a near-complete Monte Carlo endpoint at %s", (progress, label) => {
    const series = reportToSeries({
      curves: { mc: [{ progress, p10: 1, p50: 2, p90: 3 }] },
    });

    expect(series.find((entry) => entry.key === "mcP50")).toMatchObject({
      terminalProgress: progress,
      terminalLabel: label,
    });
  });

  it("does not mark a Monte Carlo curve that reaches 100 percent", () => {
    const report = {
      curves: { mc: [{ progress: 1, p10: 0, p50: 0, p90: 0 }] },
    };
    const series = reportToSeries(report);
    const { canvas, calls } = recordingCanvas();

    new VChart(canvas, { series, yMax: 40 });

    expect(series.filter((entry) => entry.key.startsWith("mc"))
      .every((entry) => entry.terminalProgress === undefined)).toBe(true);
    expect(calls.filter(([name]) => name === "arc")).toHaveLength(0);
  });
});
