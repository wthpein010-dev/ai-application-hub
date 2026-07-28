import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFillCells,
  planFillPlacement,
} from "../projects/paws-level-editor/core/fill-tool.mjs";

function level(tiles = []) {
  return {
    board: { width: 7, height: 8 },
    tiles: tiles.map((tile, index) => ({
      uid: tile.uid ?? `existing-${index}`,
      type: 1,
      moldType: 1,
      metaType: 0,
      metaData: 0,
      presetColorType: 1,
      ...tile,
    })),
  };
}

function uidFactory() {
  let next = 0;
  return () => `fill-${++next}`;
}

test("fill cells follow the dominant axis one micro-grid at a time", () => {
  assert.deepEqual(
    buildFillCells({ x: 0, y: 0 }, { x: 3, y: 1 }, { width: 7, height: 8 }),
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
  );
  assert.deepEqual(
    buildFillCells({ x: 4, y: 4 }, { x: 3, y: 1 }, { width: 7, height: 8 }),
    [
      { x: 4, y: 4 },
      { x: 4, y: 3 },
      { x: 4, y: 2 },
      { x: 4, y: 1 },
    ],
  );
  assert.deepEqual(
    buildFillCells({ x: 48, y: 56 }, { x: 80, y: 56 }, { width: 7, height: 8 }),
    [{ x: 48, y: 56 }],
  );
});

test("fill placement creates full-random layers and marks covered and top stack tiles", () => {
  const plan = planFillPlacement(
    level(),
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
    { startLayer: 7, uidFactory: uidFactory() },
  );

  assert.deepEqual(plan.additions.map(({ uid, x, y, layer, type }) => ({
    uid,
    x,
    y,
    layer,
    type,
  })), [
    { uid: "fill-1", x: 0, y: 0, layer: 7, type: -1 },
    { uid: "fill-2", x: 1, y: 0, layer: 8, type: -1 },
    { uid: "fill-3", x: 2, y: 0, layer: 9, type: -1 },
  ]);
  assert.deepEqual(
    plan.additions.map(({ presetColorType, moldType }) => [presetColorType, moldType]),
    [[3, 1], [3, 1], [1, 2]],
  );
  assert.equal(plan.skipped.length, 0);
});

test("fill placement rejects invalid layers and skips unsafe cells without mutating the level", () => {
  const document = level([
    { x: 1, y: 0, layer: 7 },
    { x: 16, y: 0, layer: 10 },
  ]);
  const before = structuredClone(document);

  assert.throws(
    () => planFillPlacement(document, [{ x: 0, y: 0 }], {
      startLayer: 0,
      uidFactory: uidFactory(),
    }),
    /平铺起点层须为 ≥1 的整数/,
  );

  const plan = planFillPlacement(
    document,
    [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 49, y: 0 },
      { x: 32, y: 0 },
    ],
    { startLayer: 7, uidFactory: uidFactory() },
  );

  assert.deepEqual(plan.additions.map(({ x, layer }) => ({ x, layer })), [
    { x: 32, layer: 10 },
  ]);
  assert.deepEqual(
    plan.skipped.map(({ reason }) => reason),
    ["same-layer-overlap", "upper-layer-overlap", "out-of-bounds"],
  );
  assert.deepEqual(document, before);
});
