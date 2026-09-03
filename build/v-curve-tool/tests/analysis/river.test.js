import { describe, expect, it } from "vitest";
import { empiricalRiver } from "../../src/analysis/river.js";
import { buildStructure } from "../../src/analysis/structure.js";

function tile(id, x, y, layer = 1) {
  return {
    id,
    x,
    y,
    layer,
    type: 1,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType: 1,
  };
}

describe("T=1 empirical river", () => {
  it("reports a no-slot narrow neck when only one tile is available", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 0, 0, 2),
    ]);

    const river = empiricalRiver(structure, 20);

    expect(river.lowerDeadlocks).toBe(20);
    expect(river.lower.at(-1)).toMatchObject({ removed: 0, y: 1 });
    expect(river.lowerDeadlockAverageProgress).toBe(0);
  });

  it("traces exact pair removals to zero on an independent board", () => {
    const structure = buildStructure([
      tile(0, 0, 0),
      tile(1, 16, 0),
      tile(2, 32, 0),
      tile(3, 48, 0),
    ]);

    const river = empiricalRiver(structure, 3);

    expect(river.upper.map(({ removed, y }) => [removed, y])).toEqual([
      [0, 4],
      [2, 2],
      [4, 0],
    ]);
    expect(river.lower.map(({ removed, y }) => [removed, y])).toEqual([
      [0, 4],
      [2, 2],
      [4, 0],
    ]);
    expect(river.upperDeadlocks).toBe(0);
    expect(river.lowerDeadlocks).toBe(0);
  });

  it("is byte-identical across repeated deterministic restarts", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 0, 0, 2),
      tile(2, 16, 0, 1),
      tile(3, 16, 0, 2),
    ]);

    expect(JSON.stringify(empiricalRiver(structure, 20))).toBe(
      JSON.stringify(empiricalRiver(structure, 20)),
    );
  });
});
