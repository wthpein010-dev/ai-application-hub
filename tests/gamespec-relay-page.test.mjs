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
});

test("outer Hub page keeps a home action and accessible loading shell", async () => {
  const html = await read("../projects/gamespec-relay/index.html");

  assert.match(html, /assets\/subpage-shell\.css/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /id="relayLoading"[^>]*role="progressbar"/);
  assert.match(html, /iframe[^>]+src="\.\/app\/index\.html"/s);
  assert.match(html, /title="GameSpec Relay 交互演示"/);
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
