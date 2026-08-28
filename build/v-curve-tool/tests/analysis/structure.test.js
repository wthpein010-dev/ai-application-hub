import { describe, expect, it } from "vitest";
import {
  availableIds,
  buildStructure,
  createBoardState,
  removeFromBoard,
} from "../../src/analysis/structure.js";

function tile(id, x, y, layer, extra = {}) {
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
    ...extra,
  };
}

describe("runtime-aligned structure availability", () => {
  it("treats a one-cell upper overlap as coverage", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 7, 7, 2),
    ]);

    expect(availableIds(structure, createBoardState(structure))).toEqual([1]);
  });

  it("does not cover when 8x8 footprints only touch at an edge", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 8, 0, 2),
    ]);

    expect(availableIds(structure, createBoardState(structure))).toEqual([0, 1]);
  });

  it("side-locks the middle tile with live neighbors at x plus and minus 8", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 8, 0, 1),
      tile(2, 16, 0, 1),
    ]);

    expect(availableIds(structure, createBoardState(structure))).toEqual([0, 2]);
  });

  it("unlocks the middle tile after either side is removed", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1),
      tile(1, 8, 0, 1),
      tile(2, 16, 0, 1),
    ]);
    const state = createBoardState(structure);

    removeFromBoard(state, [0]);

    expect(availableIds(structure, state)).toEqual([1, 2]);
  });

  it("counts a face-down tile when it is otherwise available", () => {
    const structure = buildStructure([
      tile(0, 0, 0, 1, { presetColorType: 2 }),
    ]);

    expect(availableIds(structure, createBoardState(structure))).toEqual([0]);
  });
});
