import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { parseLevelDocument } from "../projects/paws-level-editor/core/level-adapter.mjs";
import { solveLevel } from "../projects/paws-level-editor/core/level-solver.mjs";
import { createPlaySession } from "../projects/paws-level-editor/core/play-engine.mjs";

function tile(uid, x, y, layer, type, presetColorType = 1) {
  return {
    uid,
    x,
    y,
    layer,
    type,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType,
  };
}

function level(tiles, overrides = {}) {
  return {
    fileName: "level_0099_r2_play_test.json",
    gameplay: { gameLevelOrder: 2 },
    random: { blockTypeCount: 4, fullTypeMin: 5, fullTypeMax: 8 },
    tiles,
    ...overrides,
  };
}

function eventTypes(events) {
  return events.map(({ type }) => type);
}

test("first round assigns one distinct concrete type to every random layer", () => {
  const tiles = [];
  for (let layer = 1; layer <= 3; layer += 1) {
    for (let index = 0; index < 4; index += 1) {
      tiles.push(tile(
        `tile-${layer}-${index}`,
        index * 8,
        (layer - 1) * 8,
        layer,
        index % 2 === 0 ? 0 : -1,
      ));
    }
  }
  const source = structuredClone(tiles);
  const session = createPlaySession(level(tiles, {
    fileName: "level_0021_r1_play_test.json",
    gameplay: { gameLevelOrder: 1 },
    random: { blockTypeCount: 2, fullTypeMin: 20, fullTypeMax: 24 },
  }), 20260722);
  const assigned = session.getSnapshot().tiles;
  const layerTypes = [1, 2, 3].map((layer) => new Set(
    assigned.filter((record) => record.layer === layer).map((record) => record.type),
  ));

  assert.deepEqual(layerTypes.map((types) => types.size), [1, 1, 1]);
  assert.equal(new Set(layerTypes.map((types) => [...types][0])).size, 3);
  assert.equal(assigned.every(({ type }) => Number.isInteger(type) && type >= 1 && type <= 32), true);
  assert.equal(assigned.every(({ randomSourceType }) => randomSourceType === 0 || randomSourceType === -1), true);
  const counts = Map.groupBy(assigned, ({ type }) => type);
  assert.equal([...counts.values()].every((records) => records.length % 2 === 0), true);
  assert.deepEqual(tiles, source);
});

test("first round pairs odd-sized random layers onto one shared concrete type", () => {
  const layerSizes = [3, 5, 4];
  const tiles = layerSizes.flatMap((count, layerIndex) =>
    Array.from({ length: count }, (_, index) => tile(
      `odd-${layerIndex + 1}-${index}`,
      index * 8,
      layerIndex * 8,
      layerIndex + 1,
      index % 2 === 0 ? 0 : -1,
    )));
  const session = createPlaySession(level(tiles, {
    fileName: "level_0026_r1_odd_layers.json",
    gameplay: { gameLevelOrder: 1 },
    random: { blockTypeCount: 2, fullTypeMin: 20, fullTypeMax: 24 },
  }), 26);
  const assigned = session.getSnapshot().tiles;
  const typeByLayer = layerSizes.map((_, layerIndex) => [
    ...new Set(
      assigned
        .filter(({ layer }) => layer === layerIndex + 1)
        .map(({ type }) => type),
    ),
  ]);

  assert.deepEqual(typeByLayer.map((types) => types.length), [1, 1, 1]);
  assert.equal(typeByLayer[0][0], typeByLayer[1][0]);
  assert.notEqual(typeByLayer[1][0], typeByLayer[2][0]);
  assert.equal(
    [...Map.groupBy(assigned, ({ type }) => type).values()]
      .every((records) => records.length % 2 === 0),
    true,
  );
});

test("second round keeps both random pools globally paired", () => {
  const tiles = Array.from({ length: 12 }, (_, index) => tile(
    `random-${index}`,
    (index % 6) * 8,
    Math.floor(index / 6) * 8,
    index < 6 ? 1 : 2,
    index % 2 === 0 ? 0 : -1,
  ));
  const assigned = createPlaySession(level(tiles), 77).getSnapshot().tiles;
  const grouped = Map.groupBy(
    assigned,
    ({ randomSourceType, type }) => `${randomSourceType}|${type}`,
  );

  assert.equal([...grouped.values()].every((records) => records.length % 2 === 0), true);
  assert.equal(assigned.filter(({ randomSourceType }) => randomSourceType === 0)
    .every(({ type }) => type >= 1 && type <= 4), true);
  assert.equal(assigned.filter(({ randomSourceType }) => randomSourceType === -1)
    .every(({ type }) => type >= 5 && type <= 8), true);
});

test("selection can be cancelled without changing a face-up tile", () => {
  const session = createPlaySession(level([
    tile("a", 0, 0, 1, 1),
    tile("b", 16, 0, 1, 1),
  ]));

  assert.deepEqual(eventTypes(session.interact("a")), ["tile-selected"]);
  assert.equal(session.getSnapshot().selectedTileUid, "a");
  assert.deepEqual(eventTypes(session.interact("a")), ["selection-cleared"]);
  assert.equal(session.getSnapshot().selectedTileUid, null);
  assert.equal(session.getSnapshot().tiles.find(({ uid }) => uid === "a").faceDown, false);
});

test("flip tiles turn back after a mismatch and stay open when matched", () => {
  const mismatch = createPlaySession(level([
    tile("a", 0, 0, 1, 1, 2),
    tile("b", 16, 0, 1, 2, 2),
  ]));
  assert.deepEqual(eventTypes(mismatch.interact("a")), ["tile-face-changed", "tile-selected"]);
  const mismatchEvents = mismatch.interact("b");
  assert.equal(eventTypes(mismatchEvents).includes("tiles-mismatched"), true);
  assert.deepEqual(
    mismatch.getSnapshot().tiles.map(({ faceDown }) => faceDown),
    [true, true],
  );

  const match = createPlaySession(level([
    tile("a", 0, 0, 1, 3, 2),
    tile("b", 16, 0, 1, 3, 2),
  ]));
  match.interact("a");
  const matchEvents = match.interact("b");
  assert.equal(eventTypes(matchEvents).includes("tiles-removed"), true);
  assert.equal(eventTypes(matchEvents).includes("won"), true);
  assert.equal(match.getSnapshot().tiles.every(({ removed }) => removed), true);
});

test("both tray slots participate in matching and are cleared with their pairs", () => {
  const session = createPlaySession(level([
    tile("a", 0, 0, 1, 1),
    tile("b", 16, 0, 1, 1),
    tile("c", 32, 0, 1, 2),
    tile("d", 48, 0, 1, 2),
  ]));
  session.stash("a", 0);
  session.stash("c", 1);
  assert.deepEqual(session.getSnapshot().tray, ["a", "c"]);

  session.interact("a");
  session.interact("b");
  assert.deepEqual(session.getSnapshot().tray, [null, "c"]);
  session.interact("c");
  const events = session.interact("d");
  assert.equal(eventTypes(events).includes("won"), true);
  assert.deepEqual(session.getSnapshot().tray, [null, null]);
});

test("a special pair automatically removes up to two additional pairs", () => {
  const session = createPlaySession(level([
    tile("special-a", 0, 0, 1, 1001),
    tile("special-b", 16, 0, 1, 1001),
    tile("pair-a1", 32, 0, 1, 1),
    tile("pair-a2", 48, 0, 1, 1),
    tile("pair-b1", 0, 16, 1, 2),
    tile("pair-b2", 16, 16, 1, 2),
  ]));
  session.interact("special-a");
  const events = session.interact("special-b");

  assert.equal(events.filter(({ type }) => type === "special-auto-removed").length, 2);
  assert.equal(eventTypes(events).includes("won"), true);
  assert.equal(session.getSnapshot().tiles.every(({ removed }) => removed), true);
});

test("a full usable tray with no match reports a deadlock", () => {
  const session = createPlaySession(level([
    tile("a", 0, 0, 1, 1),
    tile("b", 16, 0, 1, 2),
  ]), 1, { secondSlotUnlocked: false });
  const events = session.stash("a", 0);

  assert.equal(eventTypes(events).includes("deadlocked"), true);
  assert.equal(session.getSnapshot().deadlocked, true);
});

test("restart repeats one seed and changes the random assignment for a new seed", () => {
  const tiles = Array.from({ length: 16 }, (_, index) => tile(
    `random-${index}`,
    (index % 8) * 8,
    Math.floor(index / 8) * 16,
    1,
    0,
  ));
  const session = createPlaySession(level(tiles, {
    random: { blockTypeCount: 32, fullTypeMin: 1, fullTypeMax: 32 },
  }), 12);
  const types = () => session.getSnapshot().tiles.map(({ type }) => type);
  const first = types();

  session.restart({ seed: 12 });
  assert.deepEqual(types(), first);
  session.restart({ seed: 13 });
  assert.notDeepEqual(types(), first);
});

test("ordinary pairs can clear a level and emit one win", () => {
  const session = createPlaySession(level([
    tile("a1", 0, 0, 1, 1),
    tile("a2", 16, 0, 1, 1),
    tile("b1", 32, 0, 1, 2),
    tile("b2", 48, 0, 1, 2),
  ]));
  session.interact("a1");
  assert.equal(eventTypes(session.interact("a2")).includes("won"), false);
  session.interact("b1");
  const finalEvents = session.interact("b2");

  assert.equal(finalEvents.filter(({ type }) => type === "won").length, 1);
  assert.equal(session.getSnapshot().won, true);
});

test("every published r1 level keeps layer-mono random types and plays to a win", async () => {
  const levelsRoot = new URL("../projects/paws-level-editor/levels/", import.meta.url);
  const fileNames = (await readdir(levelsRoot))
    .filter((fileName) => /_r1_/i.test(fileName))
    .sort();
  assert.equal(fileNames.length > 0, true);

  for (const fileName of fileNames) {
    const raw = JSON.parse(await readFile(new URL(fileName, levelsRoot), "utf8"));
    const document = parseLevelDocument(raw, { fileName });
    const markerLayers = new Set(
      document.tiles
        .filter(({ type }) => type === 0 || type === -1)
        .map(({ layer }) => layer),
    );
    const session = createPlaySession(document, 20260722);
    const initial = session.getSnapshot();
    for (const layer of markerLayers) {
      const layerTypes = new Set(
        initial.tiles
          .filter((record) => record.layer === layer && Number.isInteger(record.randomSourceType))
          .map(({ type }) => type),
      );
      assert.equal(layerTypes.size, 1, `${fileName} layer ${layer}`);
    }
    assert.equal(
      [...Map.groupBy(initial.tiles, ({ type }) => type).values()]
        .every((records) => records.length % 2 === 0),
      true,
      fileName,
    );

    const solution = solveLevel({ tiles: initial.tiles }, { maxNodes: 500000 });
    assert.equal(solution.solvable, true, fileName);
    for (const [first, second] of solution.moves) {
      session.interact(first);
      session.interact(second);
    }
    assert.equal(session.getSnapshot().won, true, fileName);
  }
});
