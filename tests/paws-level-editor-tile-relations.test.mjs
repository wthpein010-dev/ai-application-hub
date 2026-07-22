import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeTileRelations,
  buildIssueSeverityByUid,
} from "../projects/paws-level-editor/core/tile-relations.mjs";

function tile(uid, x, y, layer, overrides = {}) {
  return { uid, x, y, layer, type: 1, ...overrides };
}

test("tile relations identify upper blockers and lower dependents by positive overlap", () => {
  const tiles = [
    tile("selected", 8, 8, 3),
    tile("upper", 12, 8, 4),
    tile("lower", 7, 12, 2),
    tile("touching", 16, 8, 5),
    tile("unrelated", 40, 40, 4),
  ];
  const { edges } = analyzeTileRelations(tiles, ["selected"]);

  assert.deepEqual(edges, [
    { sourceUid: "selected", targetUid: "upper", type: "upper-blocker" },
    { sourceUid: "selected", targetUid: "lower", type: "lower-dependent" },
  ]);
});

test("tile relations identify exact same-layer left and right blockers", () => {
  const tiles = [
    tile("selected", 16, 8, 2),
    tile("left", 8, 8, 2),
    tile("right", 24, 8, 2),
    tile("diagonal", 8, 16, 2),
    tile("wrong-layer", 24, 8, 3),
  ];
  const { edges } = analyzeTileRelations(tiles, ["selected"]);

  assert.deepEqual(edges, [
    { sourceUid: "selected", targetUid: "left", type: "side-blocker" },
    { sourceUid: "selected", targetUid: "right", type: "side-blocker" },
  ]);
});

test("one same-layer neighbor alone is not a side blocker", () => {
  const tiles = [
    tile("selected", 16, 8, 2),
    tile("left-only", 8, 8, 2),
  ];

  assert.deepEqual(analyzeTileRelations(tiles, ["selected"]).edges, []);
});

test("multi-selection omits selected-to-selected edges and de-duplicates shared targets", () => {
  const tiles = [
    tile("a", 0, 0, 1),
    tile("b", 1, 0, 1),
    tile("shared-upper", 2, 2, 2),
  ];
  const { edges, relatedUids } = analyzeTileRelations(tiles, ["a", "b", "a"]);

  assert.deepEqual(edges, [
    { sourceUid: "a", targetUid: "shared-upper", type: "upper-blocker" },
    { sourceUid: "b", targetUid: "shared-upper", type: "upper-blocker" },
  ]);
  assert.deepEqual([...relatedUids], ["shared-upper"]);
});

test("removed, stashed and missing selected tiles are ignored", () => {
  const tiles = [
    tile("selected", 0, 0, 1),
    tile("removed", 0, 0, 2, { removed: true }),
    tile("stashed", 0, 0, 3, { stashedSlot: 0 }),
  ];

  assert.deepEqual(analyzeTileRelations(tiles, ["selected"]).edges, []);
  assert.deepEqual(analyzeTileRelations(tiles, ["missing"]).edges, []);
});

test("issue severity maps every tile and keeps error above warning", () => {
  const severity = buildIssueSeverityByUid([
    { severity: "warning", tileUids: ["a", "b"] },
    { severity: "error", tileUids: ["b", "c"] },
    { severity: "info", tileUids: ["ignored"] },
    { severity: "warning", tileUids: ["c"] },
  ]);

  assert.deepEqual([...severity], [
    ["a", "warning"],
    ["b", "error"],
    ["c", "error"],
  ]);
});
