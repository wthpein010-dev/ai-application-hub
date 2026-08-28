import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("web workbench exposes the complete requirement-to-delivery workflow", async () => {
  const html = await read("../projects/gamespec-relay/app/index.html");
  const requiredIds = [
    "loadSample",
    "sourceInput",
    "analyzeButton",
    "decisionList",
    "questionList",
    "taskLanes",
    "healthPanel",
    "saveVersion",
    "loadChangeSample",
    "diffPanel",
    "exportMarkdown",
    "exportJson",
    "exportCsv",
    "copyCodex",
    "runModelAnalysis",
  ];
  for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /data-step-target="source"/);
  assert.match(html, /data-step-target="decisions"/);
  assert.match(html, /data-step-target="delivery"/);
  assert.match(html, /data-step-target="versions"/);
  for (const phrase of [
    "游戏需求开工台",
    "放入讨论与文档",
    "核对决定与疑问",
    "生成开工任务与验收",
    "查看改动影响",
    "输入材料",
    "整理判断",
    "开工输出",
    "文档版",
    "数据备份",
    "任务表格",
    "开发助手包",
  ]) assert.match(html, new RegExp(phrase));
  assert.doesNotMatch(html, /需求接力站/);
  assert.doesNotMatch(html, />\s*(?:GameSpec Relay|DELIVERY ROOM \/ LOCAL|Agent|IN \/ OUT|V1 \/ V2|Markdown|JSON|任务 CSV|复制 Codex 包|API Key|Endpoint|Model)\s*</);
});

test("outer Hub page keeps a home action and accessible loading shell", async () => {
  const html = await read("../projects/gamespec-relay/index.html");

  assert.match(html, /assets\/subpage-shell\.css/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /id="relayLoading"[^>]*role="progressbar"/);
  assert.match(html, /iframe[^>]+src="\.\/app\/index\.html"/s);
  assert.match(html, /<title>游戏需求开工台<\/title>/);
  assert.match(html, /title="游戏需求开工台交互演示"/);
  assert.match(html, /把游戏讨论和文档拆成能开工、能验收的任务/);
  assert.doesNotMatch(html, /需求接力站|GameSpec Relay|游戏需求接力 Agent|>GR</);
});

test("UI controller uses the shared core for analysis, quality, versions, exports, and persistence", async () => {
  const source = await read("../projects/gamespec-relay/app/main.js");

  for (const contract of [
    "analyzeSources",
    "evaluateDeliveryPack",
    "diffDeliveryPacks",
    "toMarkdown",
    "toJson",
    "toTaskCsv",
    "toCodexContext",
    "createRelayStore",
    "runCompatibleModel",
  ]) assert.match(source, new RegExp(`\\b${contract}\\b`));
});
