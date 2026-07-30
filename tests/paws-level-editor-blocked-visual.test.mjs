import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computeCoverage } from "../projects/paws-level-editor/core/coverage.mjs";
import {
  GAME_COVER_DIM_FACTOR,
  resolveTileVisualTone,
  toneFactorToHex,
} from "../projects/paws-level-editor/core/tile-visual-tone.mjs";
import { buildRenderTiles } from "../projects/paws-level-editor/core/view-model.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canvasSource = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "views", "canvas-2d.mjs"),
  "utf8",
);
const threeSource = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "views", "three-3d.mjs"),
  "utf8",
);

function tile(uid, x, y, layer, overrides = {}) {
  return {
    uid,
    x,
    y,
    layer,
    type: 1,
    moldType: 1,
    presetColorType: 1,
    ...overrides,
  };
}

test("coverage returns tile-local patches for actual upper overlap", () => {
  const coverage = computeCoverage([
    tile("lower", 0, 0, 1),
    tile("upper", 4, 2, 2),
  ]);

  assert.deepEqual(coverage.get("lower").occlusionPatches, [{
    x: 4,
    y: 2,
    width: 4,
    height: 6,
    dx: 4,
    dy: 2,
  }]);
  assert.deepEqual(coverage.get("upper").occlusionPatches, []);
});

test("removed and tray tiles do not leave stale contact patches", () => {
  const coverage = computeCoverage([
    tile("lower", 0, 0, 1),
    tile("removed-upper", 4, 2, 2, { removed: true }),
    tile("tray-upper", 2, 2, 3, { stashedSlot: 0 }),
  ]);

  assert.deepEqual(coverage.get("lower").occlusionPatches, []);
  assert.deepEqual(coverage.get("removed-upper").occlusionPatches, []);
  assert.deepEqual(coverage.get("tray-upper").occlusionPatches, []);
});

test("play mode uses the Unity 0.58 cover dim factor for blocked board tiles", () => {
  assert.equal(GAME_COVER_DIM_FACTOR, 0.58);
  assert.deepEqual(
    resolveTileVisualTone(
      { covered: true, sideBlocked: false, location: "board" },
      { mode: "play" },
    ),
    {
      blocked: true,
      factor: 0.58,
      overlayAlpha: 0.42,
      innerShadowAlpha: 0.34,
      contactShadowAlpha: 0.3,
    },
  );
  assert.equal(toneFactorToHex(0.58), 0x949494);
});

test("side locks dim exactly like upper coverage and edit mode remains readable", () => {
  const sideBlocked = resolveTileVisualTone(
    { covered: false, sideBlocked: true, location: "board" },
    { mode: "play" },
  );
  const covered = resolveTileVisualTone(
    { covered: true, sideBlocked: false, location: "board" },
    { mode: "play" },
  );
  const edit = resolveTileVisualTone(
    { covered: true, sideBlocked: false, location: "board" },
    { mode: "edit" },
  );

  assert.deepEqual(sideBlocked, covered);
  assert.equal(edit.blocked, true);
  assert.equal(edit.factor > covered.factor, true);
  assert.equal(edit.overlayAlpha < covered.overlayAlpha, true);
});

test("free and tray tiles stay fully lit even if a stale coverage flag is present", () => {
  assert.deepEqual(
    resolveTileVisualTone(
      { covered: false, sideBlocked: false, location: "board" },
      { mode: "play" },
    ),
    {
      blocked: false,
      factor: 1,
      overlayAlpha: 0,
      innerShadowAlpha: 0,
      contactShadowAlpha: 0,
    },
  );
  assert.equal(
    resolveTileVisualTone(
      { covered: true, sideBlocked: true, location: "tray" },
      { mode: "play" },
    ).factor,
    1,
  );
});

test("a covered blind-box back does not receive the normal black cover twice", () => {
  assert.deepEqual(
    resolveTileVisualTone(
      {
        covered: true,
        sideBlocked: false,
        location: "board",
        presetColorType: 3,
        faceDown: true,
      },
      { mode: "play" },
    ),
    {
      blocked: true,
      factor: 1,
      overlayAlpha: 0,
      innerShadowAlpha: 0.2,
      contactShadowAlpha: 0,
    },
  );
});

test("render records preserve blind-box semantics for the shared 2D/3D tone model", () => {
  const [record] = buildRenderTiles({
    tiles: [{
      uid: "blind-base",
      type: -1,
      layer: 1,
      x: 0,
      y: 0,
      moldType: 1,
      presetColorType: 3,
      faceDown: true,
      covered: true,
      occlusionPatches: [{
        x: 2,
        y: 2,
        width: 4,
        height: 4,
        dx: 2,
        dy: 2,
      }],
    }],
  });

  assert.equal(record.moldType, 1);
  assert.equal(record.presetColorType, 3);
  assert.equal(record.faceDown, true);
  assert.deepEqual(record.occlusionPatches, [{
    x: 2,
    y: 2,
    width: 4,
    height: 4,
    dx: 2,
    dy: 2,
  }]);
  assert.equal(resolveTileVisualTone(record, { mode: "play" }).factor, 1);
});

test("2D uses localized gradients and 3D uses calibrated real shadows", () => {
  assert.match(canvasSource, /occlusionPatches/);
  assert.match(canvasSource, /createLinearGradient/);
  assert.match(threeSource, /keyLight\.shadow\.bias\s*=\s*-0\.0002/);
  assert.match(threeSource, /keyLight\.shadow\.normalBias\s*=\s*0\.02/);
  assert.doesNotMatch(threeSource, /contactShadowMesh|coplanarShadow/i);
});
