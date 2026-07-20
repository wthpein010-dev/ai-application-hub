import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const controller = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "ui", "workbench-controller.mjs"),
  "utf8",
);
const openLevelBody = controller.slice(
  controller.indexOf("async openLevel("),
  controller.indexOf("async resetCurrentLevel("),
);
const resetLevelBody = controller.slice(
  controller.indexOf("async resetCurrentLevel("),
  controller.indexOf("createNewLevel()"),
);

test("controller offers recovery for a recoverable bundled list entry", () => {
  assert.match(
    controller,
    /openLevel\(level\.fileName,\s*\{\s*recoverable:\s*level\.recoverable\s*\}\)/,
  );
  assert.match(controller, /recoverable[\s\S]*confirm\([^)]*恢复内置示例/);
  assert.match(controller, /api\.resetLevel\(fileName\)/);
});

test("controller recovers an invalid bundled local record instead of trapping the user", () => {
  assert.match(openLevelBody, /error\.code === "invalid-local-record"/);
  assert.match(openLevelBody, /confirm\([^)]*浏览器保存已损坏/);
  assert.match(openLevelBody, /openLevel\(fileName,\s*\{[^}]*discardDirty:\s*true[^}]*\}\)/);
  assert.doesNotMatch(resetLevelBody, /recoveryAttempted/);
});

test("controller enables reset only for bundled levels", () => {
  assert.match(controller, /if \(!document\?\.bundled\)/);
  assert.match(
    controller,
    /resetLevel\.disabled\s*=\s*!this\.document\?\.bundled/,
  );
});

test("controller shares file name validation and displays API save errors", () => {
  assert.match(
    controller,
    /import\s*\{[^}]*isValidLevelFileName[^}]*\}\s*from "\.\.\/static-api-client\.mjs"/,
  );
  assert.match(controller, /if \(!isValidLevelFileName\(fileName\)\)/);
  assert.match(controller, /catch \(error\)[\s\S]*this\.showToast\(error\.message,\s*"error"\)/);
  assert.match(controller, /level_\$\{String\(this\.document\.id\)[^`]*_copy\.json/);
});
