import { describe, expect, it } from "vitest";
import { completionStatus } from "../../src/ui/completion-state.js";

function comparison(simulation, leftSimulation = { valid: true }) {
  return {
    options: { seeds: 300 },
    left: { simulation: leftSimulation },
    right: { simulation },
  };
}

describe("analysis completion status", () => {
  it("uses the success status for a complete valid simulation", () => {
    expect(completionStatus(comparison({ valid: true }), "left_0010", "right_0020")).toEqual({
      message: "left_0010 vs right_0020 分析完成 · 300 seeds",
      tone: "success",
    });
  });

  it("uses a warning status when Monte Carlo is invalid", () => {
    expect(completionStatus(comparison({ valid: false, reason: "随机组为奇数" }), "left_0010", "right_0020")).toEqual({
      message: "结构分析完成，但 MC 无效",
      tone: "warning",
    });
  });

  it("uses a warning status when the left-side Monte Carlo is invalid", () => {
    expect(completionStatus(
      comparison({ valid: true }, { valid: false, reason: "随机组为奇数" }),
      "left_0010",
      "right_0020",
    )).toEqual({
      message: "结构分析完成，但 MC 无效",
      tone: "warning",
    });
  });

  it("uses a warning status when gameplay simulation is incomplete", () => {
    expect(completionStatus(comparison({ valid: true, incomplete: true }), "left_0010", "right_0020")).toEqual({
      message: "分析完成，玩法仿真不完整",
      tone: "warning",
    });
  });
});
