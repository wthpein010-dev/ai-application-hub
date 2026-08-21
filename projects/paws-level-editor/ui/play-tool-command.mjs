const TOOL_METHODS = Object.freeze({
  slot: "useSlotTool",
  shuffle: "useShuffleTool",
  match: "useMatchTool",
});

export function runPlayTool(session, toolName) {
  const method = TOOL_METHODS[toolName];
  if (!session || !method || typeof session[method] !== "function") {
    return [];
  }
  return session[method]();
}
