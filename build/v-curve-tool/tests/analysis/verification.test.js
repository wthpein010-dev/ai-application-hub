import { describe, expect, it } from "vitest";
import { hasValidAverageDeadlockProgress } from "../../src/analysis/verification.js";

describe("real-data verifier deadlock metric contract", () => {
  it("requires null without deadlocks and a finite average when deadlocks exist", () => {
    expect(hasValidAverageDeadlockProgress({ deadlockedCount: 0, averageDeadlockProgress: null })).toBe(true);
    expect(hasValidAverageDeadlockProgress({ deadlockedCount: 0, averageDeadlockProgress: 0.5 })).toBe(false);
    expect(hasValidAverageDeadlockProgress({ deadlockedCount: 2, averageDeadlockProgress: 0.5 })).toBe(true);
    expect(hasValidAverageDeadlockProgress({ deadlockedCount: 2, averageDeadlockProgress: null })).toBe(false);
  });
});
