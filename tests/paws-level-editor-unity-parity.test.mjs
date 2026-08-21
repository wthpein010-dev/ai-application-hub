import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "../projects/paws-level-editor/vendor/three.module.js";
import { Canvas2DView } from "../projects/paws-level-editor/views/canvas-2d.mjs";
import { createTileMaterialSet } from "../projects/paws-level-editor/views/three-tile-materials.mjs";

test("2D tray stays centered while locked and becomes two separated trays after unlock", () => {
  const view = new Canvas2DView();
  view.width = 1000;
  view.height = 800;
  view.snapshot = { secondSlotUnlocked: false, tray: [null, null] };

  const locked = view.trayLayout();
  assert.equal(locked.length, 1);
  assert.equal(locked[0].slot, 0);
  assert.equal(locked[0].x + locked[0].width / 2, 500);

  view.snapshot.secondSlotUnlocked = true;
  const unlocked = view.trayLayout();
  assert.deepEqual(unlocked.map(({ slot }) => slot), [0, 1]);
  assert.equal(unlocked[0].x + unlocked[0].width < 500, true);
  assert.equal(unlocked[1].x > 500, true);
});

test("3D tile art uses an unlit top while keeping softly lit sides", () => {
  const texture = new THREE.Texture();
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f7d0a,
    roughness: 0.9,
    metalness: 0,
  });

  const result = createTileMaterialSet(THREE, { texture, sideMaterial });

  assert.equal(result.top.isMeshBasicMaterial, true);
  assert.equal(result.side.isMeshStandardMaterial, true);
  assert.equal(result.side.roughness, 0.9);
  assert.equal(result.materials[2], result.top);
  assert.deepEqual(
    result.materials.map((material) => material === result.top ? "top" : "side"),
    ["side", "side", "top", "side", "side", "side"],
  );

  texture.dispose();
  sideMaterial.dispose();
  result.top.dispose();
  result.side.dispose();
});
