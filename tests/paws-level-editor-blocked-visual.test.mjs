import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_COVER_DIM_FACTOR,
  resolveTileVisualTone,
  toneFactorToHex,
} from "../projects/paws-level-editor/core/tile-visual-tone.mjs";

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
