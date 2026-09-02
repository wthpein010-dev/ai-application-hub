import test from "node:test";
import assert from "node:assert/strict";

let draftApi = {};
let inventoryApi = {};
try {
  draftApi = await import("../projects/brick-character-copy-preview/core/trinket-draft.js");
} catch {
  // The first red run intentionally exercises the missing module as an empty API.
}
try {
  inventoryApi = await import("../projects/brick-character-copy-preview/core/trinket-inventory.js");
} catch {
  // The first red run intentionally exercises the missing module as an empty API.
}

const rose = { id: 4, slot: "hand", ownedCount: 2, giftable: true, pinyin: "gaobaimeigui", obtainedAt: "2026-08-29T10:00:00+08:00", isNew: true, activitySort: 2 };
const ball = { id: 3, slot: "hand", ownedCount: 4, giftable: true, pinyin: "rexuelanqiu", obtainedAt: "2026-08-28T10:00:00+08:00", isNew: false, activitySort: null };
const cup = { id: 6, slot: "hand", ownedCount: 1, giftable: false, pinyin: "qingyachazhan", obtainedAt: "2026-08-30T10:00:00+08:00", isNew: false, activitySort: 1 };

test("same-slot trial replaces the previous item and a second click removes it", () => {
  let draft = draftApi.createTrinketDraft(null);
  draft = draftApi.toggleDraftItem(draft, rose);
  draft = draftApi.toggleDraftItem(draft, ball);
  assert.equal(draft.draftItemId, 3);
  assert.equal(draftApi.hasUnsavedDraft(draft), true);
  draft = draftApi.toggleDraftItem(draft, ball);
  assert.equal(draft.draftItemId, null);
  assert.equal(draftApi.hasUnsavedDraft(draft), false);
});

test("random trial chooses only from owned compatible candidates", () => {
  const draft = draftApi.createTrinketDraft(null);
  const result = draftApi.randomizeDraft(draft, [rose, { ...ball, ownedCount: 0 }, cup], () => 0.99);
  assert.equal(result.draftItemId, 6);
});

test("save and discard settle a draft against the saved outfit", () => {
  let draft = draftApi.createTrinketDraft(4);
  draft = draftApi.toggleDraftItem(draft, ball);
  assert.equal(draftApi.saveDraft(draft).savedItemId, 3);
  assert.equal(draftApi.discardDraft(draft).draftItemId, 4);
});

test("inventory sorting has deterministic tie breakers and gift count excludes worn copies", () => {
  assert.deepEqual(inventoryApi.sortTrinkets([rose, ball, cup], "quantity").map((item) => item.id), [3, 4, 6]);
  assert.deepEqual(inventoryApi.sortTrinkets([rose, ball, cup], "activity").map((item) => item.id), [6, 4, 3]);
  assert.equal(inventoryApi.availableGiftCount(rose, 4, 0), 1);
  assert.equal(inventoryApi.availableGiftCount(rose, null, 1), 1);
  assert.equal(inventoryApi.availableGiftCount(cup, null, 1), 0);
});

test("gift preview removes one owned copy and leaves unrelated inventory intact", () => {
  const result = inventoryApi.applyGiftPreview([rose, ball], 4);
  assert.equal(result.find((item) => item.id === 4).ownedCount, 1);
  assert.equal(result.find((item) => item.id === 3).ownedCount, 4);
});
