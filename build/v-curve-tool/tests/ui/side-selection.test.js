import { describe, expect, it } from "vitest";
import {
  applyImportedLevelsToSide,
  createComparisonSelection,
  selectLevelOnSide,
} from "../../src/ui/side-selection.js";

function level(id) {
  return { id, tiles: [{ layer: 1 }], warnings: [] };
}

function imported(...ids) {
  const levels = ids.map(level);
  return {
    levels,
    selectedLevel: levels.at(-1) ?? null,
  };
}

describe("independent comparison-side selection", () => {
  it("starts with every built-in Sheep level and selects the first one", () => {
    const sheep90009 = level("90009");
    const sheep900121 = level("900121");

    expect(createComparisonSelection([sheep90009, sheep900121])).toEqual({
      defaultLeftLevels: [sheep90009, sheep900121],
      left: { levels: [sheep90009, sheep900121], selectedLevel: sheep90009 },
      right: { levels: [], selectedLevel: null },
    });
  });

  it("replaces right-side levels without changing the left selection", () => {
    const sheep = level("900121");
    const initial = createComparisonSelection([sheep]);

    const next = applyImportedLevelsToSide(initial, "right", imported("level_0001", "level_0020"));

    expect(next.left).toBe(initial.left);
    expect(next.right.levels.map((entry) => entry.id)).toEqual(["level_0001", "level_0020"]);
    expect(next.right.selectedLevel.id).toBe("level_0020");
  });

  it("keeps the full built-in Sheep library while replacing left imports", () => {
    const sheep90009 = level("90009");
    const sheep900121 = level("900121");
    const withRight = applyImportedLevelsToSide(
      createComparisonSelection([sheep90009, sheep900121]),
      "right",
      imported("right_0020"),
    );

    const next = applyImportedLevelsToSide(withRight, "left", imported("left_0001", "left_0010"));

    expect(next.left.levels.map((entry) => entry.id)).toEqual([
      "90009", "900121", "left_0001", "left_0010",
    ]);
    expect(next.left.selectedLevel.id).toBe("left_0010");
    expect(next.right).toBe(withRight.right);
  });

  it("keeps a Paws import whose id matches the built-in Sheep id visible and selected", () => {
    const sheep = { ...level("900121"), source: "sheep" };
    const paws = { ...level("900121"), source: "paws" };

    const next = applyImportedLevelsToSide(createComparisonSelection([sheep]), "left", {
      levels: [paws],
      selectedLevel: paws,
    });

    expect(next.left.levels).toEqual([sheep, paws]);
    expect(next.left.selectedLevel).toBe(paws);
    expect(next.left.levels.indexOf(next.left.selectedLevel)).toBe(1);
  });

  it("switches either side without changing the other side", () => {
    const sheep = level("900121");
    const withBoth = applyImportedLevelsToSide(
      applyImportedLevelsToSide(createComparisonSelection([sheep]), "left", imported("left_0010")),
      "right",
      imported("right_0001", "right_0020"),
    );

    const leftReset = selectLevelOnSide(withBoth, "left", 0);
    const rightChanged = selectLevelOnSide(leftReset, "right", 0);

    expect(leftReset.left.selectedLevel.id).toBe("900121");
    expect(leftReset.right).toBe(withBoth.right);
    expect(rightChanged.left).toBe(leftReset.left);
    expect(rightChanged.right.selectedLevel.id).toBe("right_0001");
  });

  it("rejects an unknown side or missing option", () => {
    const selection = createComparisonSelection([level("900121")]);

    expect(() => applyImportedLevelsToSide(selection, "middle", imported("x"))).toThrow(/left 或 right/);
    expect(() => selectLevelOnSide(selection, "right", 0)).toThrow(/有效关卡/);
  });
});
