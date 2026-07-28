const TOOL_METHODS = Object.freeze({
  shuffle: "useShuffleTool",
  match: "useMatchTool",
  undo: "useUndoTool",
});

export function runPlayTool(session, toolName) {
  const method = TOOL_METHODS[toolName];
  if (!session || !method || typeof session[method] !== "function") {
    return [];
  }
  return session[method]();
}
