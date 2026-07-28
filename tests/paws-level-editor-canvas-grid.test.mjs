import assert from "node:assert/strict";
import test from "node:test";

import { Canvas2DView } from "../projects/paws-level-editor/views/canvas-2d.mjs";

function recordingContext() {
  let path = [];
  return {
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "",
    textBaseline: "",
    lines: [],
    strokes: [],
    labels: [],
    rectangles: [],
    save() {},
    restore() {},
    beginPath() {
      path = [];
    },
    moveTo(x, y) {
      path.push({ x1: x, y1: y });
    },
    lineTo(x, y) {
      const current = path.at(-1);
      current.x2 = x;
      current.y2 = y;
    },
    stroke() {
      this.lines.push(...path.map((line) => ({ ...line })));
      this.strokes.push({
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        lines: path.map((line) => ({ ...line })),
      });
    },
    strokeRect(x, y, width, height) {
      this.rectangles.push({
        x,
        y,
        width,
        height,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
      });
    },
    fillText(text, x, y) {
      this.labels.push({
        text: String(text),
        x,
        y,
        fillStyle: this.fillStyle,
      });
    },
  };
}

test("2D edit draws a bounded Unity field grid and play draws no engineering grid", () => {
  const view = new Canvas2DView();
  view.document = { board: { width: 7, height: 8 }, tiles: [] };
  view.viewport = { scale: 10, offsetX: 100, offsetY: 80 };
  view.mode = "edit";
  const edit = recordingContext();

  view.drawFieldGrid(edit);

  assert.equal(
    edit.strokes.some(({ strokeStyle }) => strokeStyle === "rgba(255,255,255,0.72)"),
    true,
  );
  assert.equal(
    edit.strokes.some(({ strokeStyle }) => strokeStyle === "rgba(255,255,255,0.5)"),
    true,
  );
  assert.deepEqual(edit.rectangles, [{
    x: 100,
    y: 80,
    width: 560,
    height: 640,
    strokeStyle: "rgba(255,224,51,0.85)",
    lineWidth: 2,
  }]);
  assert.equal(
    edit.lines.every(({ x1, x2, y1, y2 }) =>
      x1 >= 100 && x2 <= 660 && y1 >= 80 && y2 <= 720),
    true,
  );
  assert.deepEqual(
    edit.labels.filter(({ text }) => /^\d+$/.test(text)).map(({ text }) => Number(text)),
    [0, 8, 16, 24, 32, 40, 48, 56, 0, 8, 16, 24, 32, 40, 48, 56, 64],
  );
  assert.deepEqual(
    edit.labels.filter(({ text }) => text === "X" || text === "Y").map(({ text }) => text),
    ["X", "Y"],
  );

  view.mode = "play";
  const play = recordingContext();
  view.drawFieldGrid(play);
  assert.equal(play.strokes.length, 0);
  assert.equal(play.rectangles.length, 0);
  assert.equal(play.labels.length, 0);
});

test("2D grid follows imported board dimensions instead of clamping to 7 by 8", () => {
  const view = new Canvas2DView();
  view.document = { board: { width: 3, height: 2 }, tiles: [] };
  view.viewport = { scale: 4, offsetX: 10, offsetY: 20 };
  const context = recordingContext();

  view.drawFieldGrid(context);

  assert.deepEqual(context.rectangles[0], {
    x: 10,
    y: 20,
    width: 96,
    height: 64,
    strokeStyle: "rgba(255,224,51,0.85)",
    lineWidth: 2,
  });
});
