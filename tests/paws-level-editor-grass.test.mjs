import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GRASS_ATLAS_REGIONS,
  GRASS_PATCHES,
  grassPulseScale,
} from "../projects/paws-level-editor/core/grass-layout.mjs";

const root = new URL("../projects/paws-level-editor/", import.meta.url);
const readProject = (relativePath) => readFile(new URL(relativePath, root), "utf8");

function closeTo(actual, expected, tolerance = 0.0001) {
  assert.equal(
    Math.abs(actual - expected) <= tolerance,
    true,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("grass layout preserves the two Unity atlas regions and all 12 Spine bones", () => {
  assert.deepEqual(GRASS_ATLAS_REGIONS.Grass1, {
    x: 2,
    y: 3,
    width: 53,
    height: 29,
    rotated: false,
  });
  assert.deepEqual(GRASS_ATLAS_REGIONS.Grass2, {
    x: 57,
    y: 2,
    width: 30,
    height: 35,
    rotated: true,
  });
  assert.equal(GRASS_PATCHES.length, 12);
  assert.deepEqual(
    GRASS_PATCHES.map(({ id, variant, spineX, spineY }) => ({ id, variant, spineX, spineY })),
    [
      { id: "Grass1_1", variant: "Grass1", spineX: -79, spineY: 579 },
      { id: "Grass1_2", variant: "Grass1", spineX: -210, spineY: 423 },
      { id: "Grass1_3", variant: "Grass1", spineX: 205, spineY: 498 },
      { id: "Grass1_4", variant: "Grass1", spineX: 206, spineY: 285 },
      { id: "Grass1_5", variant: "Grass1", spineX: -247, spineY: 134 },
      { id: "Grass1_6", variant: "Grass1", spineX: -107, spineY: 46 },
      { id: "Grass2_1", variant: "Grass2", spineX: 66.14, spineY: 317 },
      { id: "Grass2_2", variant: "Grass2", spineX: -315.86, spineY: 217 },
      { id: "Grass2_3", variant: "Grass2", spineX: -273.86, spineY: -281 },
      { id: "Grass2_4", variant: "Grass2", spineX: -119.86, spineY: -560 },
      { id: "Grass2_5", variant: "Grass2", spineX: 196.14, spineY: -560 },
      { id: "Grass2_6", variant: "Grass2", spineX: 315.14, spineY: -295 },
    ],
  );
  assert.equal(new Set(GRASS_PATCHES.map(({ normalizedX }) => normalizedX)).size, 12);
  assert.equal(GRASS_PATCHES.every(({ normalizedX, normalizedY }) =>
    normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1), true);
});

test("grass pulse follows the Unity Spine scale keys and reduced motion stays static", () => {
  closeTo(grassPulseScale(0), 1);
  closeTo(grassPulseScale(0.4333), 1);
  closeTo(grassPulseScale(0.4667), 1.3);
  closeTo(grassPulseScale(0.5), 0.9);
  closeTo(grassPulseScale(0.5333), 1);
  closeTo(grassPulseScale(0.8), 1);
  closeTo(grassPulseScale(1), 1.3);
  closeTo(grassPulseScale(1.0333), 0.9);
  closeTo(grassPulseScale(1.0667), 1);
  closeTo(grassPulseScale(2.0667), 1.3);
  closeTo(grassPulseScale(0.4667, { reducedMotion: true }), 1);
});

test("2D and play mount one non-interactive grass canvas behind the level renderer", async () => {
  const [controller, field, styles] = await Promise.all([
    readProject("ui/workbench-controller.mjs"),
    readProject("ui/grass-field.mjs"),
    readProject("styles.css"),
  ]);
  assert.match(controller, /new GrassField\(\)\.mount\(this\.elements\.canvasHost\)/);
  assert.match(controller, /this\.grassField\?\.destroy\(\)/);
  assert.match(field, /class GrassField/);
  assert.match(field, /GAMEPLAY_ASSETS\.grass/);
  assert.match(field, /drawGrassAtlasPatch/);
  assert.match(field, /document\.visibilityState/);
  assert.match(field, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.level-grass-field\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*2;[^}]*pointer-events:\s*none;/s);
  assert.match(styles, /\.canvas-host > \.level-canvas\s*\{[^}]*z-index:\s*3;/s);
  assert.doesNotMatch(styles, /background-image:\s*\n\s*var\(--gameplay-grass\)/);
});

test("3D uses the shared layout, cropped canvases, upright double-sided planes and shared pulse", async () => {
  const source = await readProject("views/three-3d.mjs");
  assert.match(source, /GRASS_PATCHES/);
  assert.match(source, /drawGrassAtlasPatch/);
  assert.match(source, /new THREE\.CanvasTexture/);
  assert.match(source, /side:\s*THREE\.DoubleSide/);
  assert.match(source, /depthWrite:\s*false/);
  assert.match(source, /grassPulseScale\(/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /grass\.position\.y\s*=\s*grass\.userData\.baseY/);
  assert.doesNotMatch(source, /const grassPositions = \[/);
  assert.doesNotMatch(source, /grass\.rotation\.x = -Math\.PI \/ 2/);
});
