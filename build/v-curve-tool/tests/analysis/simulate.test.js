import { describe, expect, it } from "vitest";
import { buildStructure } from "../../src/analysis/structure.js";
import { monteCarloBand, simulateOnce } from "../../src/analysis/simulate.js";

function tile(id, x, y, layer, type) {
  return {
    id,
    x,
    y,
    layer,
    type,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType: 1,
  };
}

function level(tiles) {
  return {
    id: "simulation-fixture",
    source: "paws",
    tiles,
    rules: {
      limitedTypeMax: 4,
      fullTypeMin: 1,
      fullTypeMax: 4,
    },
  };
}

function unmatchedThenPairLevel() {
  return level([
    tile(0, 0, 0, 1, 1),
    tile(1, 0, 0, 2, 2),
    tile(2, 16, 0, 1, 2),
    tile(3, 16, 0, 2, 1),
  ]);
}

function lockedAfterStashLevel() {
  return level([
    tile(0, 0, 0, 1, 1),
    tile(1, 1, 0, 1, 2),
    tile(2, 0, 0, 2, 1),
    tile(3, 1, 0, 2, 2),
  ]);
}

function stashRevealLevel() {
  return level([
    tile(0, 0, 0, 1, 2),
    tile(1, 4, 0, 1, 2),
    tile(2, 2, 0, 2, 1),
    tile(3, 24, 0, 1, 1),
    tile(4, 28, 0, 1, 3),
    tile(5, 26, 0, 2, 3),
  ]);
}

describe("pair-and-tray simulation", () => {
  it("stashes one unmatched tile without advancing cleared progress", () => {
    const fixture = unmatchedThenPairLevel();
    const result = simulateOnce(fixture, buildStructure(fixture.tiles), {
      traySlots: 1,
      policy: "greedy",
    }, 7);

    expect(result.trace[1]).toMatchObject({
      action: "stash",
      removed: result.trace[0].removed,
      trayCount: 1,
    });
    expect(result.trace[1].ids).toEqual([1]);
    expect(result.completed).toBe(true);
  });

  it("deadlocks when no pair exists and the tray is full", () => {
    const fixture = lockedAfterStashLevel();
    const result = simulateOnce(fixture, buildStructure(fixture.tiles), {
      traySlots: 1,
      policy: "greedy",
    }, 3);

    expect(result).toMatchObject({
      completed: false,
      deadlocked: true,
      removed: 0,
      trayCount: 1,
    });
  });

  it("breaks equal greedy pair scores by stable tile UID", () => {
    const fixture = level([
      tile(0, 0, 0, 1, 1),
      tile(1, 16, 0, 1, 1),
      tile(2, 32, 0, 1, 1),
      tile(3, 48, 0, 1, 1),
    ]);
    const result = simulateOnce(fixture, buildStructure(fixture.tiles), {
      traySlots: 1,
      policy: "greedy",
    }, 19);

    expect(result.trace[1]).toMatchObject({ action: "pair", ids: [0, 1] });
  });

  it("aggregates the latest V at a repeated removed count", () => {
    const fixture = stashRevealLevel();
    const band = monteCarloBand(fixture, buildStructure(fixture.tiles), {
      seeds: 5,
      traySlots: 1,
      policy: "greedy",
    });

    expect(band.representedThreshold).toBe(3);
    expect(band.points.find((point) => point.removed === 0)).toMatchObject({
      samples: 5,
      p10: 3,
      p50: 3,
      p90: 3,
    });
  });

  it("returns byte-identical random-policy bands for the same seeds", () => {
    const fixture = unmatchedThenPairLevel();
    const structure = buildStructure(fixture.tiles);
    const options = { seeds: 20, traySlots: 1, policy: "random" };

    expect(JSON.stringify(monteCarloBand(fixture, structure, options))).toBe(
      JSON.stringify(monteCarloBand(fixture, structure, options)),
    );
  });
});
