import assert from "node:assert/strict";
import test from "node:test";

import { createPlaySession } from "../projects/paws-level-editor/core/play-engine.mjs";
import { runPlayTool } from "../projects/paws-level-editor/ui/play-tool-command.mjs";

function tile(uid, x, type) {
  return {
    uid,
    x,
    y: 0,
    layer: 1,
    type,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType: 1,
  };
}

test("play tool command dispatches through the real session", () => {
  const session = createPlaySession({
    fileName: "level_0099_r2_controller_tool.json",
    gameplay: { gameLevelOrder: 2 },
    tiles: [
      tile("a", 0, 1),
      tile("b", 16, 1),
      tile("c", 32, 2),
      tile("d", 48, 2),
    ],
  });
  const events = runPlayTool(session, "match");
  const snapshot = session.getSnapshot();

  assert.equal(events[0].type, "tool-match-removed");
  assert.equal(snapshot.tools.match.remaining, 0);
  assert.deepEqual(
    snapshot.tiles.filter(({ removed }) => removed).map(({ uid }) => uid),
    ["a", "b"],
  );
});

test("unknown play tool command does not change the session", () => {
  const session = createPlaySession({
    fileName: "level_0099_r2_controller_tool_guard.json",
    gameplay: { gameLevelOrder: 2 },
    tiles: [tile("a", 0, 1), tile("b", 16, 1)],
  });
  const before = session.getSnapshot();

  assert.deepEqual(runPlayTool(session, "unknown"), []);

  assert.deepEqual(session.getSnapshot(), before);
});
