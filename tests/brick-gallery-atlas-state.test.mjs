import test from "node:test";
import assert from "node:assert/strict";

let atlas = {};
try {
  atlas = await import("../projects/brick-character-copy-preview/core/atlas-state.js");
} catch {
  // The first red run intentionally exercises the missing module as an empty API.
}

test("atlas keeps character and trinket controls independent", () => {
  let state = atlas.createAtlasState();
  state = atlas.setAtlasQuery(state, "characters", "哈吉米");
  state = atlas.setAtlasPage(state, "characters", 2);
  state = atlas.setAtlasTab(state, "trinkets");
  state = atlas.setAtlasQuery(state, "trinkets", "篮球");

  assert.deepEqual(state.characters, { query: "哈吉米", page: 2, selection: null });
  assert.deepEqual(state.trinkets, { query: "篮球", page: 1, sort: "default", selection: null });
  assert.equal(state.tab, "trinkets");
});

test("atlas selection accepts only positive integer IDs", () => {
  let state = atlas.createAtlasState();
  state = atlas.selectAtlasItem(state, "characters", 100014);
  state = atlas.selectAtlasItem(state, "trinkets", 4);
  state = atlas.selectAtlasItem(state, "trinkets", 0);

  assert.equal(state.characters.selection, 100014);
  assert.equal(state.trinkets.selection, null);
});

test("atlas locations only retain a valid detail key for the active tab", () => {
  assert.deepEqual(atlas.parseAtlasLocation("https://example.test/?tab=trinkets&item=4"), {
    tab: "trinkets",
    characterId: null,
    itemId: 4,
  });
  assert.deepEqual(atlas.parseAtlasLocation("https://example.test/?tab=characters&character=100014&item=4"), {
    tab: "characters",
    characterId: 100014,
    itemId: null,
  });
  assert.deepEqual(atlas.parseAtlasLocation("https://example.test/?tab=bad&item=nope"), {
    tab: "characters",
    characterId: null,
    itemId: null,
  });
});

test("atlas location formatter never leaks inactive selections", () => {
  let state = atlas.createAtlasState();
  state = atlas.selectAtlasItem(state, "characters", 100014);
  state = atlas.selectAtlasItem(state, "trinkets", 4);
  state = atlas.setAtlasTab(state, "trinkets");
  assert.equal(atlas.formatAtlasLocation(state), "?tab=trinkets&item=4");
});
