import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLevelDocument,
  serializeLevelDocument,
} from "../projects/paws-level-editor/core/level-adapter.mjs";
import { validateLevel } from "../projects/paws-level-editor/core/level-validator.mjs";

function rawLevel(designerNote = {}) {
  return {
    id: 12,
    name: "元数据测试",
    difficulty: "Normal",
    gridUnit: "sheep_7x8_mini8",
    customTop: { keep: true },
    designerNote: JSON.stringify({ customNote: "keep", ...designerNote }),
    tiles: [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 8, y: 0, layer: 1, type: 1 },
    ],
  };
}

test("adapter reads Unity gameplay metadata without losing false or zero", () => {
  const document = parseLevelDocument(rawLevel({
    levelKey: 91,
    gameLevelOrder: 3,
    cdNum: 0,
    showLayerNum: false,
  }));

  assert.deepEqual(document.gameplay, {
    levelKey: 91,
    gameLevelOrder: 3,
    cdNum: 0,
    showLayerNum: false,
  });
});

test("adapter supplies Unity-safe gameplay metadata defaults", () => {
  const document = parseLevelDocument(rawLevel());

  assert.deepEqual(document.gameplay, {
    levelKey: 12,
    gameLevelOrder: 1,
    cdNum: 0,
    showLayerNum: true,
  });
});

test("adapter preserves invalid Unity metadata for validation instead of coercing it", () => {
  const document = parseLevelDocument(rawLevel({
    levelKey: "12",
    gameLevelOrder: "3",
    cdNum: "0",
    showLayerNum: "false",
  }));

  assert.deepEqual(document.gameplay, {
    levelKey: "12",
    gameLevelOrder: "3",
    cdNum: "0",
    showLayerNum: "false",
  });
  assert.deepEqual(
    validateLevel(document)
      .filter(({ severity }) => severity === "error")
      .map(({ code }) => code),
    [
      "invalid-level-key",
      "invalid-game-level-order",
      "invalid-cd-num",
      "invalid-show-layer-num",
    ],
  );
  assert.throws(
    () => serializeLevelDocument(document),
    /Unity 游戏运行参数不合法/,
  );
});

test("gameplay patch normalization rejects the entire invalid input", async () => {
  const gameplayModule = await import(
    "../projects/paws-level-editor/core/gameplay-metadata.mjs"
  ).catch(() => ({}));
  assert.equal(typeof gameplayModule.normalizeGameplayPatch, "function");
  assert.deepEqual(
    gameplayModule.normalizeGameplayPatch({
      gameLevelOrder: 4,
      cdNum: 75,
      showLayerNum: false,
    }),
    { gameLevelOrder: 4, cdNum: 75, showLayerNum: false },
  );
  assert.doesNotThrow(() => gameplayModule.assertGameplayMetadata({
    levelKey: -101,
    gameLevelOrder: 1,
    cdNum: 0,
    showLayerNum: true,
  }));
  for (const patch of [
    { gameLevelOrder: 0 },
    { gameLevelOrder: 1.5 },
    { cdNum: -1 },
    { cdNum: Number.NaN },
    { showLayerNum: "false" },
  ]) {
    assert.throws(
      () => gameplayModule.normalizeGameplayPatch(patch),
      /挑战回合|限时秒数|显示层数/,
    );
  }
});

test("serialization syncs levelKey to ID and preserves unknown metadata", () => {
  const document = parseLevelDocument(rawLevel({
    levelKey: 12,
    gameLevelOrder: 2,
    cdNum: 60,
    showLayerNum: true,
  }));
  document.id = 23;
  document.gameplay = {
    levelKey: 999,
    gameLevelOrder: 4,
    cdNum: 75,
    showLayerNum: false,
  };
  const serialized = serializeLevelDocument(document);
  const note = JSON.parse(serialized.designerNote);

  assert.equal(serialized.id, 23);
  assert.equal(note.levelKey, 23);
  assert.equal(note.gameLevelOrder, 4);
  assert.equal(note.cdNum, 75);
  assert.equal(note.showLayerNum, false);
  assert.equal(note.customNote, "keep");
  assert.deepEqual(serialized.customTop, { keep: true });
});

test("serialization rejects a non-integer ID before syncing Level Key", () => {
  const document = parseLevelDocument(rawLevel());
  document.id = 12.5;

  assert.throws(
    () => serializeLevelDocument(document),
    /Unity 游戏运行参数不合法.*Level Key/,
  );
});

test("validator reports invalid gameplay metadata and level key drift", () => {
  const document = parseLevelDocument(rawLevel({ levelKey: 99 }));
  document.gameplay.gameLevelOrder = 0;
  document.gameplay.cdNum = -1;
  document.gameplay.showLayerNum = "yes";
  const issues = validateLevel(document);
  const byCode = new Map(issues.map((issue) => [issue.code, issue]));

  assert.equal(byCode.get("level-key-mismatch")?.severity, "warning");
  assert.equal(byCode.get("invalid-game-level-order")?.severity, "error");
  assert.equal(byCode.get("invalid-cd-num")?.severity, "error");
  assert.equal(byCode.get("invalid-show-layer-num")?.severity, "error");
});
