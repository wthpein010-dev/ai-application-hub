import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  describeGenerationOptions,
  getDifficultyDefaults,
  normalizeGenerationOptions,
} from "../projects/paws-level-editor/ui/ai-level-dialog.mjs";
import {
  selectSecondRoundReferences,
} from "../projects/paws-level-editor/ui/ai-reference-selection.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const editorRoot = join(repoRoot, "projects", "paws-level-editor");
const page = readFileSync(join(editorRoot, "index.html"), "utf8");
const controller = readFileSync(
  join(editorRoot, "ui", "workbench-controller.mjs"),
  "utf8",
);
const browserSmoke = readFileSync(
  join(repoRoot, "tests", "paws-level-editor-ai-browser-smoke.mjs"),
  "utf8",
);

test("AI generation options normalize the three intentional choices", () => {
  const form = new FormData();
  form.set("ai-difficulty", "hard");
  form.set("ai-layout", "progressive");
  form.set("ai-reference", "current");
  form.set("ai-tile-count", "241");
  form.set("ai-layer-count", "32");
  form.set("ai-target-score", "80");

  assert.deepEqual(normalizeGenerationOptions(form), {
    difficulty: "hard",
    layout: "progressive",
    reference: "current",
    tileCount: 242,
    layerCount: 32,
    targetScore: 80,
    tileCountAdjusted: true,
    capacity: {
      supported: true,
      maxTiles: 400,
      minimumLayers: 9,
      maxLayerTiles: 14,
      message: "当前组合可生成；单层上限 14 张。",
    },
  });
  assert.equal(
    describeGenerationOptions({
      difficulty: "hard",
      layout: "progressive",
      reference: "current",
      tileCount: 242,
      layerCount: 32,
      targetScore: 80,
      tileCountAdjusted: true,
    }),
    "精确 242 张、32 个有效层，目标 80 分（极难挑战）；输入砖块数已自动补为偶数。从当前关卡学习，层层推进。建议 220–280 张、28–36 层。当前组合可生成；困难档单层上限 14 张。",
  );
});

test("difficulty presets expose the confirmed 200/15 baseline and deep hard template", () => {
  assert.deepEqual(getDifficultyDefaults("easy"), {
    tileCount: 180,
    layerCount: 12,
    targetScore: 40,
  });
  assert.deepEqual(getDifficultyDefaults("normal"), {
    tileCount: 200,
    layerCount: 15,
    targetScore: 60,
  });
  assert.deepEqual(getDifficultyDefaults("hard"), {
    tileCount: 240,
    layerCount: 32,
    targetScore: 80,
  });
});

test("AI generation options reject values outside the compact choice set", () => {
  const form = new FormData();
  form.set("ai-difficulty", "nightmare");
  form.set("ai-layout", "balanced");
  form.set("ai-reference", "all");

  assert.throws(() => normalizeGenerationOptions(form), /选项无效/);
});

test("AI generation exposes and enforces the five-stage layer minimum", () => {
  const form = new FormData();
  form.set("ai-difficulty", "normal");
  form.set("ai-layout", "balanced");
  form.set("ai-reference", "all");
  form.set("ai-tile-count", "200");
  form.set("ai-layer-count", "4");
  form.set("ai-target-score", "60");

  assert.throws(
    () => normalizeGenerationOptions(form),
    /有效层数必须在 5–40 之间/,
  );
  assert.match(page, /name="ai-layer-count"[^>]*min="5"/);
});

test("AI generation rejects dense shallow plans before starting generation", () => {
  const dense = new FormData();
  dense.set("ai-difficulty", "normal");
  dense.set("ai-layout", "balanced");
  dense.set("ai-reference", "all");
  dense.set("ai-tile-count", "200");
  dense.set("ai-layer-count", "5");
  dense.set("ai-target-score", "60");

  assert.throws(
    () => normalizeGenerationOptions(dense),
    /200 张砖块至少需要 9 个有效层；当前 5 层最多支持 104 张/,
  );

  const shallow = new FormData();
  shallow.set("ai-difficulty", "normal");
  shallow.set("ai-layout", "balanced");
  shallow.set("ai-reference", "all");
  shallow.set("ai-tile-count", "100");
  shallow.set("ai-layer-count", "6");
  shallow.set("ai-target-score", "60");

  assert.equal(normalizeGenerationOptions(shallow).layerCount, 6);
});

test("dialog rejects capacity-invalid options before generation", () => {
  const form = new FormData();
  form.set("ai-difficulty", "normal");
  form.set("ai-layout", "balanced");
  form.set("ai-reference", "all");
  form.set("ai-tile-count", "400");
  form.set("ai-layer-count", "5");
  form.set("ai-target-score", "60");

  assert.throws(
    () => normalizeGenerationOptions(form),
    /400 张砖块至少需要 14 个有效层；当前 5 层最多支持 104 张/,
  );
});

test("AI dialog exposes exactly three difficulty, three layout and two reference choices", () => {
  assert.match(page, /id="generate-ai-level"[^>]*>[^<]*AI 生成/);
  assert.match(page, /id="ai-level-dialog"/);
  assert.equal((page.match(/name="ai-difficulty"/g) ?? []).length, 3);
  assert.equal((page.match(/name="ai-layout"/g) ?? []).length, 3);
  assert.equal((page.match(/name="ai-reference"/g) ?? []).length, 2);
  assert.equal((page.match(/name="ai-tile-count"/g) ?? []).length, 1);
  assert.equal((page.match(/name="ai-layer-count"/g) ?? []).length, 1);
  assert.equal((page.match(/name="ai-target-score"/g) ?? []).length, 1);
  assert.match(page, /name="ai-tile-count"[^>]*value="200"/);
  assert.match(page, /name="ai-layer-count"[^>]*value="15"/);
  assert.match(page, /name="ai-target-score"[^>]*value="60"/);
  assert.match(page, /id="status-difficulty"/);
  assert.match(page, /id="confirm-ai-level"[^>]*>\s*生成并打开/);
});

test("controller loads references, generates, saves a collision-safe copy and opens it", () => {
  assert.match(controller, /from "\.\.\/core\/ai-level-generator\.mjs"/);
  assert.match(controller, /scoreLevelDifficulty/);
  assert.match(controller, /from "\.\/ai-level-dialog\.mjs"/);
  assert.match(controller, /async loadAiReferenceDocuments\(/);
  assert.match(controller, /await this\.api\.listLevelCatalog\(\)/);
  assert.match(controller, /this\.levels\.filter\(\(\{\s*aiReferenceEligible\s*\}\)\s*=>\s*aiReferenceEligible\)/);
  assert.match(controller, /selectSecondRoundReferences\(loadedReferences\)/);
  assert.match(controller, /generateAiLevel\(\{[\s\S]*references,[\s\S]*difficulty:[\s\S]*layout:[\s\S]*tileCount:[\s\S]*layerCount:[\s\S]*targetScore:/);
  assert.match(
    controller,
    /chooseImportedFileName\(\s*`ai_level_\$\{unsignedSeed\}\.json`,\s*this\.levels\.map/,
  );
  assert.match(controller, /value:\s*serializeLevelDocument\(generated\.document\)/);
  assert.match(controller, /source:\s*"ai"/);
  assert.match(controller, /saveAs:\s*true/);
  assert.match(controller, /activateImportedLevel\(fileName,\s*\{/);
  assert.match(controller, /openLevel:\s*\(\)\s*=>\s*this\.openLevel\(fileName,\s*\{\s*discardDirty:\s*true\s*\}\)/);
  assert.match(controller, /难度\s*\$\{difficulty\.score\}/);
  assert.match(controller, /statusDifficulty\.textContent/);
});

test("all-reference learning prefers second-round documents", () => {
  const roundOne = {
    fileName: "level_0001_r1_第一关模板.json",
    gameplay: { gameLevelOrder: 1 },
  };
  const roundTwoByOrder = {
    fileName: "legacy-second-round.json",
    gameplay: { gameLevelOrder: 2 },
  };
  const roundTwoByName = {
    fileName: "level_0012_r2_第二关模板12.json",
    gameplay: {},
  };

  assert.deepEqual(
    selectSecondRoundReferences([
      roundOne,
      roundTwoByOrder,
      roundTwoByName,
    ]),
    [roundTwoByOrder, roundTwoByName],
  );
});

test("all-reference learning falls back when the library has no second round", () => {
  const onlyRoundOne = [
    {
      fileName: "level_0001_r1_第一关模板.json",
      gameplay: { gameLevelOrder: 1 },
    },
  ];

  assert.deepEqual(selectSecondRoundReferences(onlyRoundOne), onlyRoundOne);
});

test("controller gates duplicate generation and disables current reference without a document", () => {
  assert.match(controller, /if \(this\.readonly \|\| this\.aiGenerationPending\)/);
  assert.match(controller, /this\.aiGenerationPending\s*=\s*true/);
  assert.match(controller, /finally\s*\{[\s\S]*this\.aiGenerationPending\s*=\s*false/);
  assert.match(controller, /aiCurrentReference\.disabled\s*=\s*!this\.document/);
  assert.match(controller, /generateAi\.disabled\s*=\s*this\.readonly\s*\|\|\s*this\.aiGenerationPending/);
});

test("online browser acceptance allows for slow Pages resources without relaxing local waits", () => {
  assert.match(
    browserSmoke,
    /const browserTimeout = externalBaseUrl \? 120_000 : 30_000;/,
  );
  assert.match(browserSmoke, /page\.setDefaultNavigationTimeout\(browserTimeout\)/);
  assert.match(browserSmoke, /page\.setDefaultTimeout\(browserTimeout\)/);
});
