import assert from "node:assert/strict";
import test from "node:test";

import {
  boardMicroBounds,
  buildGridUnit,
  filterTilesByLayerView,
  findPastePlacement,
  overlapsWithPositiveArea,
  parseGridUnit,
  planBoardResize,
  planTileMove,
  planTilePlacement,
} from "../projects/paws-level-editor/core/editor-geometry.mjs";
import {
  parseLevelDocument,
  serializeLevelDocument,
} from "../projects/paws-level-editor/core/level-adapter.mjs";
import { validateLevel } from "../projects/paws-level-editor/core/level-validator.mjs";

function tile(uid, x, y, layer, type = 1) {
  return { uid, x, y, layer, type, moldType: 1, metaType: 0, metaData: 0, presetColorType: 1 };
}

function documentWith(tiles = [], { width = 7, height = 8 } = {}) {
  return {
    board: { width, height, scale: 1 },
    gridUnit: `sheep_${width}x${height}_mini8`,
    tiles,
  };
}

test("grid units and board bounds match the Unity 7x8 micro-grid", () => {
  assert.deepEqual(parseGridUnit("sheep_7x8_mini8"), { width: 7, height: 8 });
  assert.equal(parseGridUnit("other_7x8"), null);
  assert.equal(buildGridUnit(7, 8), "sheep_7x8_mini8");
  assert.throws(() => buildGridUnit(3, 8), /width/i);
  assert.deepEqual(boardMicroBounds(documentWith()), {
    widthFields: 7,
    heightFields: 8,
    width: 56,
    height: 64,
    maxX: 48,
    maxY: 56,
  });
});

test("positive-area overlap rejects intersections but permits touching edges", () => {
  assert.equal(overlapsWithPositiveArea(tile("a", 0, 0, 1), tile("b", 7, 0, 1)), true);
  assert.equal(overlapsWithPositiveArea(tile("a", 0, 0, 1), tile("b", 8, 0, 1)), false);
  assert.equal(overlapsWithPositiveArea(tile("a", 0, 0, 1), tile("b", 0, 8, 1)), false);
});

test("placement stays in bounds and finds the first overlap-free layer", () => {
  const document = documentWith([
    tile("base", 0, 0, 1),
    tile("upper", 4, 0, 2),
  ]);
  const planned = planTilePlacement(document, tile("new", 4, 0, 1, 2));
  assert.equal(planned.ok, true);
  assert.equal(planned.tile.layer, 3);
  assert.equal(planned.adjustedLayer, true);

  const touching = planTilePlacement(document, tile("touch", 12, 0, 1, 2));
  assert.equal(touching.ok, true);
  assert.equal(touching.tile.layer, 1);

  const outside = planTilePlacement(document, tile("outside", 49, 0, 1, 2));
  assert.deepEqual(
    { ok: outside.ok, code: outside.code },
    { ok: false, code: "out-of-board" },
  );
});

test("multi-tile moves are atomic and reject new same-layer overlap or overflow", () => {
  const source = [
    tile("moving-a", 0, 0, 1),
    tile("moving-b", 0, 8, 1),
    tile("fixed", 16, 0, 1),
  ];
  const document = documentWith(structuredClone(source));

  const collision = planTileMove(document, ["moving-a", "moving-b"], { dx: 9, dy: 0 });
  assert.deepEqual(
    { ok: collision.ok, code: collision.code },
    { ok: false, code: "same-layer-overlap" },
  );
  assert.deepEqual(document.tiles, source);

  const overflow = planTileMove(document, ["moving-a", "moving-b"], { dx: -1, dy: 0 });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.code, "out-of-board");
  assert.deepEqual(document.tiles, source);

  const valid = planTileMove(document, ["moving-a", "moving-b"], { dx: 8, dy: 0 });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.tiles.map(({ x, y }) => [x, y]), [[8, 0], [8, 8]]);
});

test("layer views expose all, a cross-section, or one exact layer", () => {
  const tiles = [tile("l1", 0, 0, 1), tile("l2", 0, 0, 2), tile("l3", 0, 0, 3)];
  assert.deepEqual(
    filterTilesByLayerView(tiles, { mode: "all", layer: 1 }).map(({ uid }) => uid),
    ["l1", "l2", "l3"],
  );
  assert.deepEqual(
    filterTilesByLayerView(tiles, { mode: "through", layer: 2 }).map(({ uid }) => uid),
    ["l1", "l2"],
  );
  assert.deepEqual(
    filterTilesByLayerView(tiles, { mode: "single", layer: 2 }).map(({ uid }) => uid),
    ["l2"],
  );
});

test("paste placement searches deterministic safe offsets without mutating the source", () => {
  const existing = [
    tile("source-a", 0, 0, 1),
    tile("source-b", 0, 8, 1),
    tile("block-right", 8, 0, 1),
    tile("block-right-2", 8, 8, 1),
  ];
  const clipboard = [tile("clip-a", 0, 0, 1, 2), tile("clip-b", 0, 8, 1, 2)];
  const sourceSnapshot = structuredClone(clipboard);
  const planned = findPastePlacement(documentWith(existing), clipboard, { step: 8 });
  assert.equal(planned.ok, true);
  assert.deepEqual({ dx: planned.dx, dy: planned.dy }, { dx: 16, dy: 0 });
  assert.deepEqual(planned.tiles.map(({ x, y }) => [x, y]), [[16, 0], [16, 8]]);
  assert.deepEqual(clipboard, sourceSnapshot);
});

test("board resize is range-checked, updates gridUnit and never crops tiles", () => {
  const document = documentWith([tile("edge", 48, 56, 1)]);
  const same = planBoardResize(document, { width: 7, height: 8 });
  assert.equal(same.ok, true);
  assert.equal(same.gridUnit, "sheep_7x8_mini8");

  const cropped = planBoardResize(document, { width: 6, height: 8 });
  assert.equal(cropped.ok, false);
  assert.equal(cropped.code, "tiles-out-of-board");

  const invalid = planBoardResize(document, { width: 17, height: 8 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-board-size");
});

test("adapter defaults to 7x8, infers grid units and serializes one consistent board", () => {
  const fallback = parseLevelDocument({
    id: 1,
    name: "缺省棋盘",
    tiles: [tile("ignored-a", 0, 0, 1), tile("ignored-b", 8, 0, 1)],
  });
  assert.deepEqual(fallback.board, { width: 7, height: 8, scale: 1 });
  assert.equal(fallback.gridUnit, "sheep_7x8_mini8");

  const inferred = parseLevelDocument({
    id: 2,
    name: "从 Grid Unit 推导",
    gridUnit: "sheep_6x9_mini8",
    tiles: [tile("ignored-a", 0, 0, 1), tile("ignored-b", 8, 0, 1)],
  });
  assert.deepEqual(inferred.board, { width: 6, height: 9, scale: 1 });
  assert.equal(inferred.gridUnit, "sheep_6x9_mini8");

  const fromNote = parseLevelDocument({
    id: 3,
    name: "设计器尺寸优先",
    gridUnit: "sheep_8x10_mini8",
    designerNote: JSON.stringify({ widthNum: 5, heightNum: 6, levelData: {} }),
    tiles: [tile("ignored-a", 0, 0, 1), tile("ignored-b", 8, 0, 1)],
  });
  assert.deepEqual(fromNote.board, { width: 5, height: 6, scale: 1 });
  assert.equal(fromNote.gridUnit, "sheep_5x6_mini8");
  const serialized = serializeLevelDocument(fromNote);
  assert.equal(serialized.gridUnit, "sheep_5x6_mini8");
  assert.deepEqual(
    (({ widthNum, heightNum }) => ({ widthNum, heightNum }))(JSON.parse(serialized.designerNote)),
    { widthNum: 5, heightNum: 6 },
  );
});

test("validator reports structural editor errors with stable issue codes", () => {
  const invalid = {
    board: { width: 3, height: 8, scale: 1 },
    gridUnit: "sheep_7x8_mini8",
    random: { blockTypeCount: 0, fullTypeMin: 12, fullTypeMax: 2 },
    designerNote: {},
    tiles: [
      tile("duplicate", 0.5, 0, 1),
      tile("duplicate", 8, 0, 1),
    ],
  };
  const issues = validateLevel(invalid);
  const codes = new Set(issues.map(({ code }) => code));
  for (const code of [
    "invalid-board-size",
    "grid-unit-mismatch",
    "invalid-random-range",
    "invalid-coordinate",
    "duplicate-uid",
  ]) {
    assert.equal(codes.has(code), true, `missing validation issue ${code}`);
  }
});

test("manual overlap is visible as a warning while AI overlap remains an error", () => {
  const manual = {
    ...documentWith([tile("left", 0, 0, 1), tile("right", 7, 0, 1)]),
    random: { blockTypeCount: 32, fullTypeMin: 1, fullTypeMax: 32 },
    designerNote: {},
  };
  const manualIssue = validateLevel(manual).find(({ code }) => code === "same-layer-overlap");
  assert.equal(manualIssue?.severity, "warning");
  assert.deepEqual(new Set(manualIssue.tileUids), new Set(["left", "right"]));

  const aiIssue = validateLevel({
    ...manual,
    designerNote: { aiGeneration: { algorithm: "test" } },
  }).find(({ code }) => code === "same-layer-overlap");
  assert.equal(aiIssue?.severity, "error");
});
