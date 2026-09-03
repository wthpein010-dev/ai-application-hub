import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseCopy,
  visualPositionCount,
  wrapByVisualPositions,
} from "../projects/brick-character-copy-preview/core/copy-diagnostics.js";

test("visual positions count Chinese as one and half-width glyphs as one half", () => {
  assert.equal(visualPositionCount("黑帽快客"), 4);
  assert.equal(visualPositionCount("F1车手"), 3);
  assert.equal(visualPositionCount("Bug"), 1.5);
  assert.equal(visualPositionCount("你好，A1"), 4);
});

test("visual wrapping honors the 12-position gallery line contract", () => {
  assert.deepEqual(wrapByVisualPositions("没有配饰也敢直接出场，原皮才是最强皮肤。", 12), [
    "没有配饰也敢直接出场，原",
    "皮才是最强皮肤。",
  ]);
  assert.deepEqual(wrapByVisualPositions("F1车手今天准时到达", 6), ["F1车手今天准", "时到达"]);
});

test("diagnostics report copy limits, rendered overflow, and awkward line starts", () => {
  const diagnostic = diagnoseCopy({
    name: "超长角色名字测试",
    unlockDesc: "这是一段明显超过十五个视觉位置的角色获取说明",
    galleryDesc: "第一行文字很多很多，第二行，标点不能跑到行首。",
  }, {
    renderedLines: ["第一行文字很多很多", "，第二行，标点不能跑", "到行首。", "孤"],
    horizontalOverflow: false,
    verticalOverflow: true,
  });

  assert.equal(diagnostic.name.ok, false);
  assert.equal(diagnostic.unlock.ok, false);
  assert.equal(diagnostic.gallery.ok, false);
  assert.equal(diagnostic.gallery.renderedLineCount, 4);
  assert.equal(diagnostic.gallery.verticalOverflow, true);
  assert.equal(diagnostic.gallery.awkwardBreaks.some((issue) => issue.type === "leading-punctuation"), true);
  assert.equal(diagnostic.gallery.awkwardBreaks.some((issue) => issue.type === "orphan-line"), true);
});

test("diagnostics accept a normal game-copy sample", () => {
  const diagnostic = diagnoseCopy({
    name: "原皮战神",
    unlockDesc: "基础但绝不普通",
    galleryDesc: "没有配饰也敢直接出场，原皮才是最强皮肤。",
  }, {
    renderedLines: ["没有配饰也敢直接出场，原", "皮才是最强皮肤。"],
    horizontalOverflow: false,
    verticalOverflow: false,
  });

  assert.equal(diagnostic.name.ok, true);
  assert.equal(diagnostic.unlock.ok, true);
  assert.equal(diagnostic.gallery.ok, true);
  assert.equal(diagnostic.gallery.awkwardBreaks.length, 0);
});
