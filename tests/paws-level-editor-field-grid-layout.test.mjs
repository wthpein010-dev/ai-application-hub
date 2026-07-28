import assert from "node:assert/strict";
import test from "node:test";

import { buildFieldGridLayout } from "../projects/paws-level-editor/core/field-grid-layout.mjs";

test("7 by 8 board exposes bounded major lines, center crosses and micro-coordinate labels", () => {
  const layout = buildFieldGridLayout({ width: 7, height: 8 });

  assert.deepEqual(layout.bounds, {
    minX: 0,
    minY: 0,
    maxX: 56,
    maxY: 64,
  });
  assert.equal(layout.majorLines.length, 17);
  assert.equal(layout.centerLines.length, 15);
  assert.deepEqual(
    layout.labels.filter(({ axis }) => axis === "x").map(({ value }) => value),
    [0, 8, 16, 24, 32, 40, 48, 56],
  );
  assert.deepEqual(
    layout.labels.filter(({ axis }) => axis === "y").map(({ value }) => value),
    [0, 8, 16, 24, 32, 40, 48, 56, 64],
  );
  assert.deepEqual(layout.axisLabels, [
    { text: "X", x: 60, y: 68 },
    { text: "Y", x: -4, y: -4 },
  ]);
});

test("imported legal board dimensions determine the full grid without a 7 by 8 clamp", () => {
  const layout = buildFieldGridLayout({ width: 3, height: 2 });

  assert.deepEqual(layout.bounds, {
    minX: 0,
    minY: 0,
    maxX: 24,
    maxY: 16,
  });
  assert.equal(layout.majorLines.length, 7);
  assert.equal(layout.centerLines.length, 5);
  assert.deepEqual(
    layout.labels.filter(({ axis }) => axis === "x").map(({ value }) => value),
    [0, 8, 16, 24],
  );
  assert.deepEqual(
    layout.labels.filter(({ axis }) => axis === "y").map(({ value }) => value),
    [0, 8, 16],
  );
});
