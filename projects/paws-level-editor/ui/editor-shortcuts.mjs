const TOOL_KEYS = Object.freeze({
  v: "select",
  p: "place",
  d: "delete",
  b: "box",
  h: "pan",
});

const MODIFIED_COMMANDS = Object.freeze({
  a: "select-all",
  c: "copy",
  d: "duplicate",
  s: "save",
  v: "paste",
  x: "cut",
  y: "redo",
  z: "undo",
});

const ARROW_DELTAS = Object.freeze({
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
});

export function commandFromKeyboardEvent(event) {
  const key = String(event?.key ?? "");
  const lower = key.toLowerCase();
  const commandModifier = Boolean(event?.ctrlKey || event?.metaKey);

  if (commandModifier) {
    if (event?.altKey) return null;
    if (lower === "f") return null;
    if (lower === "z" && event?.shiftKey) return { command: "redo" };
    const command = MODIFIED_COMMANDS[lower];
    return command ? { command } : null;
  }

  if (event?.altKey) return null;
  if (key in ARROW_DELTAS) {
    const multiplier = event?.shiftKey ? 8 : 1;
    const delta = ARROW_DELTAS[key];
    return {
      command: "nudge",
      args: { dx: delta.dx * multiplier, dy: delta.dy * multiplier },
    };
  }

  if (key === "PageUp") return { command: "nudge-layer", args: { delta: 1 } };
  if (key === "PageDown") return { command: "nudge-layer", args: { delta: -1 } };
  if (key === "[") return { command: "step-layer-view", args: { delta: -1 } };
  if (key === "]") return { command: "step-layer-view", args: { delta: 1 } };
  if (key === "Delete" || key === "Backspace") return { command: "delete" };
  if (key === "Escape") return { command: "clear-selection" };
  if (key === "F2") return { command: "save-as" };
  if (key === "F5") return { command: "toggle-play" };
  if (lower === "f") return { command: "fit" };
  if (lower === "l") return { command: "cycle-layer-view" };
  const tool = TOOL_KEYS[lower];
  return tool ? { command: "tool", args: { tool } } : null;
}
