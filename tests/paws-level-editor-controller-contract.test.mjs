import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as localImport from "../projects/paws-level-editor/ui/local-level-import.mjs";
import { createLevelDownload } from "../projects/paws-level-editor/ui/level-export.mjs";
import { upgradeLocalAiLevelOnOpen } from "../projects/paws-level-editor/ui/legacy-ai-open-upgrade.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const controller = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "ui", "workbench-controller.mjs"),
  "utf8",
);
const page = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "index.html"),
  "utf8",
);
const inspector = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "ui", "inspector.mjs"),
  "utf8",
);
const threeView = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "views", "three-3d.mjs"),
  "utf8",
);
const legacyOpenUpgrade = readFileSync(
  join(repoRoot, "projects", "paws-level-editor", "ui", "legacy-ai-open-upgrade.mjs"),
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
const createNewLevelBody = controller.slice(
  controller.indexOf("  createNewLevel()"),
  controller.indexOf("  isDirty()"),
);
const exportLevelBody = controller.slice(
  controller.indexOf("  exportLevel()"),
  controller.indexOf("  deleteTiles("),
);
const performSaveBody = controller.slice(
  controller.indexOf("  async performSave("),
  controller.indexOf("  onKeyDown("),
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

test("controller enables browser reset only in static mode", () => {
  assert.match(controller, /if \(!this\.canResetBundled\s*\|\|\s*!document\?\.bundled\)/);
  assert.match(
    controller,
    /resetLevel\.disabled\s*=\s*!this\.canResetBundled\s*\|\|\s*!this\.document\?\.bundled/,
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

test("controller restores the last-open level and falls back to the catalog default", () => {
  assert.match(controller, /api\.listLevelCatalog\(\)/);
  assert.match(controller, /this\.defaultFileName\s*=\s*catalog\.defaultFileName/);
  assert.match(controller, /createLastOpenedLevelStore/);
  assert.match(controller, /this\.lastOpenedLevels\.read\(this\.runtimeMode\)/);
  assert.match(controller, /this\.lastOpenedLevels\.clear\(this\.runtimeMode\)/);
  assert.match(controller, /fileName\s*===\s*this\.defaultFileName/);
  assert.match(controller, /this\.lastOpenedLevels\.write\(this\.runtimeMode,\s*fileName\)/);
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

test("static users delete browser-local levels while LAN users move project levels to trash", () => {
  assert.match(page, /id="delete-local-level"[^>]*class="[^"]*edit-only[^"]*"[^>]*>删除本地</);
  assert.match(page, /id="open-trash"/);
  assert.match(page, /id="trash-dialog"/);
  assert.match(page, /id="trash-list"/);
  assert.match(page, /id="login-dialog"/);
  assert.match(controller, /deleteLocalLevel:\s*byId\("delete-local-level"\)/);
  assert.match(controller, /deleteLocalLevel\.addEventListener\("click",\s*\(\)\s*=>\s*this\.deleteCurrentLevel\(\)\)/);
  assert.match(
    controller,
    /const canDeleteCurrent[\s\S]*this\.canDeleteBundled[\s\S]*this\.document\?\.local/,
  );
  assert.match(controller, /async deleteCurrentLevel\(\)/);
  assert.match(controller, /移动到工程 _Trash，可在回收站恢复/);
  assert.match(controller, /api\.deleteLevel\(fileName,\s*\{\s*expectedVersion:/);
  assert.match(controller, /withWriteAuthentication/);
  assert.match(controller, /api\.restoreLevel\(trashId\)/);
  assert.match(controller, /api\.subscribeCatalog/);
  assert.match(controller, /服务器已删除当前关卡/);
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

function legacyAiDocument() {
  return {
    original: { id: 88, name: "旧 AI 关卡", difficulty: "Normal" },
    designerNote: { aiGeneration: { seed: 20260722 } },
    fileName: "ai_legacy_overlap.json",
    version: "v1",
    id: 88,
    name: "旧 AI 关卡",
    difficulty: "Normal",
    gridUnit: "sheep_7x8_mini8",
    board: { width: 7, height: 8, scale: 1 },
    random: { blockTypeCount: 32, fullTypeMin: 1, fullTypeMax: 32 },
    tiles: [
      { uid: "a", x: 0, y: 0, layer: 1, type: 1 },
      { uid: "b", x: 7, y: 0, layer: 1, type: 2 },
      { uid: "c", x: 16, y: 0, layer: 1, type: 2 },
      { uid: "d", x: 24, y: 0, layer: 1, type: 1 },
    ],
    warnings: [],
  };
}

test("opening a browser-local AI level upgrades and persists geometry with optimistic versioning", async () => {
  const calls = [];
  const result = await upgradeLocalAiLevelOnOpen({
    api: {
      async saveLevel(payload) {
        calls.push(payload);
        return { version: "v2", local: true, source: "ai" };
      },
    },
    fileName: "ai_legacy_overlap.json",
    response: { local: true, version: "v1", source: "ai" },
    document: legacyAiDocument(),
  });

  assert.equal(result.status, "upgraded");
  assert.equal(result.persisted, true);
  assert.equal(result.document.version, "v2");
  assert.equal(result.movedTileUids.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fileName, "ai_legacy_overlap.json");
  assert.equal(calls[0].expectedVersion, "v1");
  assert.equal(calls[0].saveAs, false);
  assert.equal(calls[0].source, "ai");
  assert.equal(
    calls[0].value.designerNote.includes("geometryUpgrade"),
    true,
  );
});

test("open-time geometry upgrade never mutates bundled or non-AI levels", async () => {
  let saves = 0;
  const api = { async saveLevel() { saves += 1; } };
  const aiDocument = legacyAiDocument();
  const bundled = await upgradeLocalAiLevelOnOpen({
    api,
    fileName: aiDocument.fileName,
    response: { local: false, version: "bundled-v1", source: "bundled" },
    document: aiDocument,
  });
  const manualDocument = {
    ...legacyAiDocument(),
    designerNote: {},
  };
  const manual = await upgradeLocalAiLevelOnOpen({
    api,
    fileName: manualDocument.fileName,
    response: { local: true, version: "manual-v1", source: "manual" },
    document: manualDocument,
  });

  assert.equal(bundled.status, "unchanged");
  assert.equal(bundled.document, aiDocument);
  assert.equal(manual.status, "unchanged");
  assert.equal(manual.document, manualDocument);
  assert.equal(saves, 0);
});

test("a failed legacy AI write-back still returns safe repaired geometry", async () => {
  const result = await upgradeLocalAiLevelOnOpen({
    api: {
      async saveLevel() {
        const error = new Error("浏览器版本已变化。");
        error.code = "version-conflict";
        throw error;
      },
    },
    fileName: "ai_legacy_overlap.json",
    response: { local: true, version: "v1", source: "ai" },
    document: legacyAiDocument(),
  });

  assert.equal(result.status, "upgraded");
  assert.equal(result.persisted, false);
  assert.equal(result.document.version, "v1");
  assert.equal(result.movedTileUids.length, 1);
  assert.match(result.reason, /浏览器版本已变化/);
  assert.notDeepEqual(
    result.document.tiles.map(({ x, y }) => [x, y]),
    legacyAiDocument().tiles.map(({ x, y }) => [x, y]),
  );
});

test("controller upgrades local AI geometry before history and renderer initialization", () => {
  assert.match(
    controller,
    /upgradeLocalAiLevelOnOpen\([\s\S]*new EditHistory\(this\.document\)/,
  );
  assert.match(legacyOpenUpgrade, /expectedVersion:\s*response\.version/);
  assert.match(controller, /旧 AI 关卡已修复/);
  assert.match(controller, /修复结果尚未写回浏览器/);
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

test("AI save-as and export rerun the release validator before producing output", () => {
  assert.match(controller, /validateLevelForPublish/);
  assert.match(exportLevelBody, /validateLevelForPublish\(this\.document\)/);
  assert.match(exportLevelBody, /unsolvable|AI|发布/u);
  assert.match(performSaveBody, /validateLevelForPublish\(this\.document\)/);
  assert.match(performSaveBody, /return false/);
  assert.match(
    performSaveBody,
    /try\s*\{\s*const value\s*=\s*serializeLevelDocument\(this\.document\)/,
    "serialization errors must stay inside the save error boundary",
  );
});

test("every validation issue update is propagated to the active renderer", () => {
  assert.match(
    controller,
    /setIssues\(issues\)\s*\{\s*this\.issues\s*=\s*issues;\s*this\.renderer\?\.setIssues\?\.\(this\.issues\);\s*\}/,
  );
  assert.equal(
    [...controller.matchAll(/this\.issues\s*=/g)].length,
    1,
    "issue state must only be assigned by the renderer-synchronizing setter",
  );
  assert.match(exportLevelBody, /this\.setIssues\([\s\S]*validateLevelForPublish\(this\.document\)/);
  assert.match(performSaveBody, /this\.setIssues\([\s\S]*validateLevelForPublish\(this\.document\)/);
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

test("toolbar exposes all, cross-section and single-layer inspection controls", () => {
  assert.match(page, /id="layer-view-mode"[\s\S]*value="all"[\s\S]*value="through"[\s\S]*value="single"/);
  assert.match(page, /id="layer-view-prev"/);
  assert.match(page, /id="layer-view-current"/);
  assert.match(page, /id="layer-view-next"/);
  assert.match(controller, /layerViewMode\.addEventListener\("change"/);
  assert.match(controller, /renderer\.setLayerView\?\.\(this\.layerView\)/);
});

test("inspector uses safe board patches, read-only grid units and clickable issues", () => {
  assert.match(inspector, /data-grid-unit[^>]*readonly/);
  assert.match(inspector, /data-board-field="width"/);
  assert.match(inspector, /data-board-field="height"/);
  assert.match(inspector, /onBoardPatch/);
  assert.match(inspector, /data-issue-index/);
  assert.match(inspector, /onIssueFocus/);
  assert.match(controller, /planBoardResize/);
  assert.match(controller, /focusIssue\(issue\)/);
});

test("multi-selection never exposes absolute X or Y editors", () => {
  assert.match(inspector, /selected\.length\s*===\s*1[\s\S]*data-tile-field="x"[\s\S]*data-tile-field="y"/);
  assert.match(inspector, /selected\.length\s*>\s*1[\s\S]*方向键微移/);
});

test("new manual levels use the real 7 by 8 Unity board", () => {
  assert.match(createNewLevelBody, /widthNum:\s*7/);
  assert.match(createNewLevelBody, /heightNum:\s*8/);
  assert.match(createNewLevelBody, /gridUnit:\s*"sheep_7x8_mini8"/);
  assert.doesNotMatch(createNewLevelBody, /sheep_8x10_mini8/);
});

test("JSON export serializes the current board and preserves unknown fields", async () => {
  const download = createLevelDownload({
    fileName: "level_demo.json",
    original: { id: 9, customServerField: { enabled: true } },
    designerNote: { customDesignerField: "keep" },
    id: 9,
    name: "导出关卡",
    difficulty: "Normal",
    gridUnit: "sheep_7x8_mini8",
    board: { width: 7, height: 8, scale: 1 },
    random: { blockTypeCount: 32, fullTypeMin: 1, fullTypeMax: 32 },
    tiles: [
      { uid: "a", x: 0, y: 0, layer: 1, type: 1 },
      { uid: "b", x: 8, y: 0, layer: 1, type: 1 },
    ],
  });
  assert.equal(download.fileName, "level_demo.json");
  assert.equal(download.blob.type, "application/json");
  assert.equal(await download.blob.text(), download.text);
  const exported = JSON.parse(download.text);
  assert.deepEqual(exported.customServerField, { enabled: true });
  assert.equal(JSON.parse(exported.designerNote).customDesignerField, "keep");
  assert.equal(exported.gridUnit, "sheep_7x8_mini8");
});

test("3D inspection exposes camera presets, focus, exploded layers and relationships", () => {
  for (const preset of ["iso", "top", "front", "side"]) {
    assert.match(page, new RegExp(`data-camera-preset="${preset}"`));
  }
  assert.match(page, /id="focus-3d-selection"/);
  assert.match(page, /id="layer-separation"[^>]*type="range"/);
  assert.match(page, /id="layer-separation-value"/);
  assert.match(controller, /querySelectorAll\("\[data-camera-preset\]"\)/);
  assert.match(controller, /setCameraPreset\(button\.dataset\.cameraPreset\)/);
  assert.match(controller, /focusSelection\(\)/);
  assert.match(controller, /setLayerSeparation\?\.\(this\.layerSeparation\)/);
  assert.match(controller, /setIssues\?\.\(this\.issues\)/);
  assert.match(threeView, /analyzeTileRelations/);
  assert.match(threeView, /buildIssueSeverityByUid/);
  assert.match(threeView, /setCameraPreset\(preset\)/);
  assert.match(threeView, /focusSelection\(\)/);
  assert.match(threeView, /setLayerSeparation\(value\)/);
  assert.match(threeView, /setIssues\(issues\)/);
  assert.match(threeView, /upper-blocker/);
  assert.match(threeView, /lower-dependent/);
  assert.match(threeView, /side-blocker/);
});

test("inspector edits Unity gameplay metadata and controller keeps levelKey with ID", () => {
  assert.match(inspector, /data-gameplay-field="gameLevelOrder"/);
  assert.match(inspector, /data-gameplay-field="cdNum"/);
  assert.match(inspector, /data-gameplay-field="showLayerNum"/);
  assert.match(inspector, /Level Key/);
  assert.match(inspector, /onGameplayPatch/);
  assert.match(controller, /onGameplayPatch:\s*\(patch\)\s*=>\s*this\.patchGameplay\(patch\)/);
  assert.match(controller, /patchGameplay\(patch\)/);
  assert.match(controller, /path === "id"/);
  assert.match(controller, /target\.gameplay\.levelKey\s*=\s*Number\(value\)/);
});
