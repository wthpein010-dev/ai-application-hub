import { describe, expect, it } from "vitest";
import { buildStructure } from "../../src/analysis/structure.js";
import { computeExpectedV } from "../../src/analysis/expected-v.js";

function tile(id, x, y, layer) {
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

describe("cover-DAG expected V reference", () => {
  it("returns N minus m for independent tiles", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 16, 0, 1),
    ]);

    expect(computeExpectedV(structure).map(({ y }) => y)).toEqual([2, 1, 0]);
  });

  it("returns one visible tile throughout a two-tile vertical stack", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 0, 0, 2),
    ]);

    expect(computeExpectedV(structure).map(({ y }) => y)).toEqual([1, 1, 0]);
  });

  it("never emits non-finite values", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 4, 4, 2),
      tile(2, 8, 8, 3),
    ]);

    expect(computeExpectedV(structure).every(({ x, y }) => (
      Number.isFinite(x) && Number.isFinite(y)
    ))).toBe(true);
  });
});
