import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as localImport from "../projects/paws-level-editor/ui/local-level-import.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const controller = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "ui", "workbench-controller.mjs"),
  "utf8",
);
const page = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "index.html"),
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
const executeBody = controller.slice(
  controller.indexOf("  execute(command)"),
  controller.indexOf("  executePlannedEdit("),
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

test("controller opens the catalog default instead of relying on a single item", () => {
  assert.match(controller, /api\.listLevelCatalog\(\)/);
  assert.match(controller, /this\.defaultFileName\s*=\s*catalog\.defaultFileName/);
  assert.match(
    controller,
    /this\.levels\.find\(\s*\(\{\s*fileName\s*\}\)\s*=>\s*fileName\s*===\s*this\.defaultFileName,\s*\)\s*\?\?\s*this\.levels\[0\]/,
  );
});

test("controller imports a local JSON level into browser-local storage", () => {
  assert.match(page, /id="import-level"[^>]*>导入 JSON</);
  assert.match(page, /id="import-level-input"[^>]*type="file"[^>]*accept="[^"]*\.json/);
  assert.match(controller, /prepareImportedLevel\(file,\s*\{/);
  assert.match(controller, /occupiedFileNames:\s*this\.levels\.map\(\(level\) => level\.fileName\)/);
  assert.match(controller, /saveLevel\(\{[^}]*saveAs:\s*true/);
  assert.match(controller, /saveLevel\(\{[^}]*source:\s*"import"/);
  assert.match(controller, /openLevel\(fileName,\s*\{\s*discardDirty:\s*true\s*\}\)/);
});

test("desktop users can delete only the current saved non-bundled local level", () => {
  assert.match(page, /id="delete-local-level"[^>]*class="[^"]*edit-only[^"]*"[^>]*>删除本地</);
  assert.match(controller, /deleteLocalLevel:\s*byId\("delete-local-level"\)/);
  assert.match(controller, /deleteLocalLevel\.addEventListener\("click",\s*\(\)\s*=>\s*this\.deleteCurrentLevel\(\)\)/);
  assert.match(
    controller,
    /deleteLocalLevel\.disabled\s*=\s*this\.readonly\s*\|\|\s*!this\.document\?\.local\s*\|\|\s*this\.document\?\.bundled/,
  );
  assert.match(controller, /async deleteCurrentLevel\(\)/);
  assert.match(controller, /删除后无法撤销，AI 下次生成将不再学习这关/);
  assert.match(controller, /api\.deleteLevel\(fileName\)/);
  assert.match(controller, /this\.document\s*=\s*null/);
  assert.match(controller, /this\.defaultFileName/);
  assert.match(controller, /剩余 AI 学习参考/);
});

test("controller preserves local source metadata and marks manual saves", () => {
  assert.match(openLevelBody, /this\.document\.local\s*=\s*response\.local\s*===\s*true/);
  assert.match(openLevelBody, /this\.document\.source\s*=\s*response\.source/);
  assert.match(controller, /const source\s*=\s*saveAs\s*\?\s*"manual"/);
  assert.match(controller, /saveLevel\(\{\s*fileName,\s*value,\s*expectedVersion,\s*saveAs,\s*source\s*\}\)/);
  assert.match(controller, /this\.document\.source\s*=\s*saved\.source/);
});

test("import activation rejects a refresh failure that was caught by the controller", async () => {
  const refreshError = new Error("refresh failed");
  let openCalled = false;

  await assert.rejects(
    () => localImport.activateImportedLevel("local_demo.json", {
      async refreshLevels() {
        try {
          throw refreshError;
        } catch {
          // Mirrors refreshLevels rendering its own error state.
        }
      },
      getLevels: () => [{ fileName: "level_showcase.json" }],
      async openLevel() { openCalled = true; },
      getDocument: () => ({ fileName: "level_showcase.json" }),
    }),
    { code: "import-refresh-failed" },
  );
  assert.equal(openCalled, false);
});

test("import activation rejects an open failure that was caught by the controller", async () => {
  const openError = new Error("open failed");

  await assert.rejects(
    () => localImport.activateImportedLevel("local_demo.json", {
      async refreshLevels() {},
      getLevels: () => [{ fileName: "local_demo.json" }],
      async openLevel() {
        try {
          throw openError;
        } catch {
          // Mirrors openLevel preserving the previously open document.
        }
      },
      getDocument: () => ({ fileName: "level_showcase.json" }),
    }),
    { code: "import-open-failed" },
  );
});

test("controller gates the import success toast on refreshed and opened postconditions", () => {
  assert.match(controller, /activateImportedLevel\(fileName,\s*\{/);
  assert.match(controller, /getLevels:\s*\(\)\s*=>\s*this\.levels/);
  assert.match(controller, /getDocument:\s*\(\)\s*=>\s*this\.document/);
});

test("controller routes high-frequency edits through safe geometry plans", () => {
  assert.match(controller, /commandFromKeyboardEvent/);
  assert.match(controller, /planTilePlacement/);
  assert.match(controller, /planTileMove/);
  assert.match(controller, /findPastePlacement/);
  assert.match(controller, /copySelection\(\)/);
  assert.match(controller, /cutSelection\(\)/);
  assert.match(controller, /pasteSelection\(\)/);
  assert.match(controller, /duplicateSelection\(\)/);
  assert.match(controller, /nudgeSelection\(dx,\s*dy\)/);
  assert.match(controller, /nudgeSelectionLayer\(delta\)/);
  assert.match(controller, /selectAllVisible\(\)/);
  assert.match(controller, /executePlannedEdit\(plan/);
  assert.match(controller, /createMoveTilesCommand\([^)]*plan\.dx[^)]*plan\.dy[^)]*plan\.layerDelta/);
});

test("controller keyboard handler dispatches commands instead of interpreting modified tool keys", () => {
  assert.match(controller, /const command\s*=\s*commandFromKeyboardEvent\(event\)/);
  assert.match(controller, /case "duplicate"/);
  assert.match(controller, /case "nudge-layer"/);
  assert.match(controller, /case "toggle-play"/);
  assert.doesNotMatch(controller, /const shortcuts\s*=\s*\{\s*v:\s*"select"/);
});

test("history mutations stay disabled while a play session is active", () => {
  assert.match(executeBody, /this\.mode\s*!==\s*"edit"/);
});
