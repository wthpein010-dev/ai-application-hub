import assert from "node:assert/strict";
import test from "node:test";

import { commandFromKeyboardEvent } from "../projects/paws-level-editor/ui/editor-shortcuts.mjs";

function key(key, overrides = {}) {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...overrides };
}

test("Ctrl and Meta editing shortcuts map to commands without falling through to tools", () => {
  assert.deepEqual(commandFromKeyboardEvent(key("z", { ctrlKey: true })), { command: "undo" });
  assert.deepEqual(commandFromKeyboardEvent(key("Z", { metaKey: true, shiftKey: true })), { command: "redo" });
  assert.deepEqual(commandFromKeyboardEvent(key("y", { ctrlKey: true })), { command: "redo" });
  assert.deepEqual(commandFromKeyboardEvent(key("c", { ctrlKey: true })), { command: "copy" });
  assert.deepEqual(commandFromKeyboardEvent(key("x", { metaKey: true })), { command: "cut" });
  assert.deepEqual(commandFromKeyboardEvent(key("v", { ctrlKey: true })), { command: "paste" });
  assert.deepEqual(commandFromKeyboardEvent(key("d", { ctrlKey: true })), { command: "duplicate" });
  assert.deepEqual(commandFromKeyboardEvent(key("s", { ctrlKey: true })), { command: "save" });
  assert.deepEqual(commandFromKeyboardEvent(key("a", { metaKey: true })), { command: "select-all" });
  assert.equal(commandFromKeyboardEvent(key("f", { ctrlKey: true })), null);
});

test("unmodified keys map tools, fit, delete, escape and lifecycle commands", () => {
  assert.deepEqual(commandFromKeyboardEvent(key("v")), { command: "tool", args: { tool: "select" } });
  assert.deepEqual(commandFromKeyboardEvent(key("p")), { command: "tool", args: { tool: "place" } });
  assert.deepEqual(commandFromKeyboardEvent(key("d")), { command: "tool", args: { tool: "delete" } });
  assert.deepEqual(commandFromKeyboardEvent(key("b")), { command: "tool", args: { tool: "box" } });
  assert.deepEqual(commandFromKeyboardEvent(key("h")), { command: "tool", args: { tool: "pan" } });
  assert.deepEqual(commandFromKeyboardEvent(key("f")), { command: "fit" });
  assert.deepEqual(commandFromKeyboardEvent(key("Delete")), { command: "delete" });
  assert.deepEqual(commandFromKeyboardEvent(key("Escape")), { command: "clear-selection" });
  assert.deepEqual(commandFromKeyboardEvent(key("F2")), { command: "save-as" });
  assert.deepEqual(commandFromKeyboardEvent(key("F5")), { command: "toggle-play" });
});

test("navigation keys map deterministic micro nudges, layer changes and layer inspection", () => {
  assert.deepEqual(commandFromKeyboardEvent(key("ArrowLeft")), {
    command: "nudge",
    args: { dx: -1, dy: 0 },
  });
  assert.deepEqual(commandFromKeyboardEvent(key("ArrowDown", { shiftKey: true })), {
    command: "nudge",
    args: { dx: 0, dy: 8 },
  });
  assert.deepEqual(commandFromKeyboardEvent(key("PageUp")), {
    command: "nudge-layer",
    args: { delta: 1 },
  });
  assert.deepEqual(commandFromKeyboardEvent(key("PageDown")), {
    command: "nudge-layer",
    args: { delta: -1 },
  });
  assert.deepEqual(commandFromKeyboardEvent(key("[")), {
    command: "step-layer-view",
    args: { delta: -1 },
  });
  assert.deepEqual(commandFromKeyboardEvent(key("]")), {
    command: "step-layer-view",
    args: { delta: 1 },
  });
  assert.deepEqual(commandFromKeyboardEvent(key("l")), { command: "cycle-layer-view" });
  assert.equal(commandFromKeyboardEvent(key("d", { altKey: true })), null);
});
