import test from "node:test";
import assert from "node:assert/strict";

import {
  checkCompleteness,
  createDefaultDraft,
  generateMarkdown,
  getVisibleQuestions,
  sanitizeFileName
} from "../projects/minigame-project-tool/core.mjs";

test("default draft uses the Unity WeChat baseline", () => {
  const draft = createDefaultDraft();

  assert.equal(draft.unity_version, "2022.3.62f3c1");
  assert.equal(draft.ui_technology, "UGUI");
  assert.equal(draft.reference_width, "750");
  assert.equal(draft.reference_height, "1624");
  assert.equal(draft.target_platform, "微信小游戏");
});

test("empty draft reports five critical quick-start issues", () => {
  const issues = checkCompleteness(createDefaultDraft());
  const critical = issues.filter(issue => issue.level === "critical");

  assert.equal(critical.length, 5);
  assert.deepEqual(critical.map(issue => issue.fieldId), [
    "project_name",
    "game_type",
    "core_gameplay",
    "art_style",
    "first_version_scope"
  ]);
});

test("completed quick start removes all critical issues", () => {
  const draft = {
    ...createDefaultDraft(),
    project_name: "星球收纳师",
    game_type: "休闲益智",
    core_gameplay: "拖动物品完成分类并扩大收纳空间",
    art_style: "科幻",
    first_version_scope: "完成一局三分钟的核心循环"
  };

  assert.equal(checkCompleteness(draft).filter(issue => issue.level === "critical").length, 0);
});

test("style-specific questions follow the selected art style", () => {
  const sciFiIds = getVisibleQuestions("科幻").map(question => question.id);
  const pixelIds = getVisibleQuestions("像素").map(question => question.id);

  assert.equal(sciFiIds.includes("sci_fi_tone"), true);
  assert.equal(sciFiIds.includes("pixel_density"), false);
  assert.equal(pixelIds.includes("pixel_density"), true);
});

test("markdown contains project baseline and Codex handoff", () => {
  const markdown = generateMarkdown({
    ...createDefaultDraft(),
    project_name: "星球收纳师",
    game_type: "休闲益智",
    core_gameplay: "拖动物品完成分类",
    art_style: "科幻",
    first_version_scope: "完成首个可玩关卡"
  }, "2026-07-12 10:00:00 +08:00");

  assert.match(markdown, /^# 游戏项目需求：星球收纳师/m);
  assert.match(markdown, /Unity 2022\.3\.62f3c1/);
  assert.match(markdown, /750×1624/);
  assert.match(markdown, /## Codex 开发指令/);
  assert.match(markdown, /UNITY_MINIGAME_MEMORY\.md/);
});

test("filename sanitizer removes Windows-invalid characters", () => {
  assert.equal(sanitizeFileName(' 星球<>:"/\\|?*收纳师 '), "星球收纳师");
  assert.equal(sanitizeFileName(""), "小游戏立项需求");
});
