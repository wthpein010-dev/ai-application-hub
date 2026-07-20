import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  describeGenerationOptions,
  normalizeGenerationOptions,
} from "../projects/paws-level-editor/ui/ai-level-dialog.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const editorRoot = join(repoRoot, "projects", "paws-level-editor");
const page = readFileSync(join(editorRoot, "index.html"), "utf8");
const controller = readFileSync(
  join(editorRoot, "ui", "workbench-controller.mjs"),
  "utf8",
);

test("AI generation options normalize the three intentional choices", () => {
  const form = new FormData();
  form.set("ai-difficulty", "hard");
  form.set("ai-layout", "progressive");
  form.set("ai-reference", "current");

  assert.deepEqual(normalizeGenerationOptions(form), {
    difficulty: "hard",
    layout: "progressive",
    reference: "current",
  });
  assert.equal(
    describeGenerationOptions({
      difficulty: "hard",
      layout: "progressive",
      reference: "current",
    }),
    "约 84–96 张、7–8 层；从当前关卡学习，层层推进，限制重叠并自动验证可解。",
  );
});

test("AI generation options reject values outside the compact choice set", () => {
  const form = new FormData();
  form.set("ai-difficulty", "nightmare");
  form.set("ai-layout", "balanced");
  form.set("ai-reference", "all");

  assert.throws(() => normalizeGenerationOptions(form), /选项无效/);
});

test("AI dialog exposes exactly three difficulty, three layout and two reference choices", () => {
  assert.match(page, /id="generate-ai-level"[^>]*>[^<]*AI 生成/);
  assert.match(page, /id="ai-level-dialog"/);
  assert.equal((page.match(/name="ai-difficulty"/g) ?? []).length, 3);
  assert.equal((page.match(/name="ai-layout"/g) ?? []).length, 3);
  assert.equal((page.match(/name="ai-reference"/g) ?? []).length, 2);
  assert.match(page, /id="confirm-ai-level"[^>]*>\s*生成并打开/);
});

test("controller loads references, generates, saves a collision-safe copy and opens it", () => {
  assert.match(controller, /from "\.\.\/core\/ai-level-generator\.mjs"/);
  assert.match(controller, /from "\.\/ai-level-dialog\.mjs"/);
  assert.match(controller, /async loadAiReferenceDocuments\(/);
  assert.match(controller, /this\.levels\.filter\(\(\{\s*bundled\s*\}\)\s*=>\s*bundled\)/);
  assert.match(controller, /generateAiLevel\(\{[\s\S]*references,[\s\S]*difficulty:[\s\S]*layout:/);
  assert.match(
    controller,
    /chooseImportedFileName\(\s*`ai_level_\$\{unsignedSeed\}\.json`,\s*this\.levels\.map/,
  );
  assert.match(controller, /value:\s*serializeLevelDocument\(generated\.document\)/);
  assert.match(controller, /saveAs:\s*true/);
  assert.match(controller, /activateImportedLevel\(fileName,\s*\{/);
  assert.match(controller, /openLevel:\s*\(\)\s*=>\s*this\.openLevel\(fileName,\s*\{\s*discardDirty:\s*true\s*\}\)/);
});

test("controller gates duplicate generation and disables current reference without a document", () => {
  assert.match(controller, /if \(this\.readonly \|\| this\.aiGenerationPending\)/);
  assert.match(controller, /this\.aiGenerationPending\s*=\s*true/);
  assert.match(controller, /finally\s*\{[\s\S]*this\.aiGenerationPending\s*=\s*false/);
  assert.match(controller, /aiCurrentReference\.disabled\s*=\s*!this\.document/);
  assert.match(controller, /generateAi\.disabled\s*=\s*this\.readonly\s*\|\|\s*this\.aiGenerationPending/);
});
