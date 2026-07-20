# Paws Local Level Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe browser-only “导入 JSON” flow that opens a user-selected local Paws level as a persistent browser copy.

**Architecture:** A focused `ui/local-level-import.mjs` module validates the file, parses and normalizes its JSON, and chooses a collision-free local filename. `WorkbenchController` owns only browser interaction and composes that helper with the existing `saveLevel({ saveAs: true })`, list refresh, and open-level flows.

**Tech Stack:** Static HTML/CSS, browser ES modules, Node.js test runner, Playwright, GitHub Pages.

## Global Constraints

- Only read a file explicitly selected by the user; never upload it or request directory access.
- Accept `.json` files up to 5 MiB.
- Never overwrite an existing bundled or browser-local level during import.
- Preserve unknown top-level and `designerNote` fields through the existing adapter.
- Keep 390px/coarse-pointer mode read-only.
- Do not commit any real user or project level JSON.

---

### Task 1: Local import preparation module

**Files:**
- Create: `projects/paws-level-editor/ui/local-level-import.mjs`
- Create: `tests/paws-level-editor-local-import.test.mjs`
- Modify: `tests/paws-level-editor-assets.test.mjs`

**Interfaces:**
- Consumes: `isValidLevelFileName(fileName)`, `parseLevelDocument(raw, options)`, `serializeLevelDocument(document)`.
- Produces: `MAX_IMPORT_BYTES`, `LocalLevelImportError`, `chooseImportedFileName(fileName, occupiedFileNames)`, and `prepareImportedLevel(file, { occupiedFileNames }) -> Promise<{ fileName, value }>`.

- [x] **Step 1: Write failing helper tests**

Create tests that use file-like objects with `name`, `size`, and `text()`:

```js
test("prepares a Unicode JSON level and preserves unknown fields", async () => {
  const raw = {
    id: 7001,
    name: "本地关卡",
    unknownTopLevel: { keep: true },
    tiles: [{ x: 0, y: 0, layer: 1, type: 1 }],
  };
  const file = {
    name: "我的关卡.json",
    size: Buffer.byteLength(JSON.stringify(raw)),
    async text() { return JSON.stringify(raw); },
  };

  const imported = await prepareImportedLevel(file, { occupiedFileNames: [] });

  assert.equal(imported.fileName, "我的关卡.json");
  assert.deepEqual(imported.value.unknownTopLevel, { keep: true });
  assert.equal(JSON.parse(imported.value.designerNote).levelData["1"].length, 1);
});

test("deduplicates without overwriting existing levels", () => {
  assert.equal(
    chooseImportedFileName(
      "level_showcase.json",
      ["level_showcase.json", "level_showcase_import.json"],
    ),
    "level_showcase_import_2.json",
  );
});
```

Also assert stable `LocalLevelImportError.code` values for invalid filename, empty file, file over `MAX_IMPORT_BYTES`, invalid JSON, non-object JSON root, and read failure.

- [x] **Step 2: Run helper tests and verify RED**

Run:

```powershell
node --test tests/paws-level-editor-local-import.test.mjs tests/paws-level-editor-assets.test.mjs
```

Expected: FAIL because `local-level-import.mjs` and the required published module do not exist.

- [x] **Step 3: Implement the minimal helper**

Implement:

```js
import { parseLevelDocument, serializeLevelDocument } from "../core/level-adapter.mjs";
import { isValidLevelFileName } from "../static-api-client.mjs";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class LocalLevelImportError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "LocalLevelImportError";
    this.code = code;
  }
}

export function chooseImportedFileName(fileName, occupiedFileNames = []) {
  if (!isValidLevelFileName(fileName)) {
    throw new LocalLevelImportError(
      "请选择文件名合法的 .json 关卡文件。",
      "invalid-file-name",
    );
  }
  const occupied = new Set(occupiedFileNames);
  if (!occupied.has(fileName)) return fileName;
  const base = fileName.replace(/\.json$/iu, "");
  for (let ordinal = 1; ordinal < 10_000; ordinal += 1) {
    const suffix = ordinal === 1 ? "_import" : `_import_${ordinal}`;
    const candidate = `${base}${suffix}.json`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new LocalLevelImportError("无法生成可用的导入副本名称。", "name-exhausted");
}
```

`prepareImportedLevel` must validate before reading, catch `file.text()` failures, reject blank/invalid/non-object JSON, parse with the final deduplicated filename, and return `serializeLevelDocument(document)`.

- [x] **Step 4: Run helper tests and verify GREEN**

Run the same command.

Expected: all helper and asset tests PASS.

- [x] **Step 5: Commit Task 1**

```powershell
git add projects/paws-level-editor/ui/local-level-import.mjs tests/paws-level-editor-local-import.test.mjs tests/paws-level-editor-assets.test.mjs
git commit -m "feat: prepare local paws level imports"
```

### Task 2: Import controls and controller flow

**Files:**
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`
- Modify: `tests/paws-level-editor-publish.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `prepareImportedLevel(file, { occupiedFileNames })`.
- Produces: `requestLocalImport()` and `importLocalLevel(file)` controller methods plus `#import-level` and `#import-level-input`.

- [x] **Step 1: Write failing controller and page contract tests**

Assert:

```js
assert.match(page, /id="import-level"[^>]*>导入 JSON</);
assert.match(page, /id="import-level-input"[^>]*type="file"[^>]*accept="[^"]*\.json/);
assert.match(controller, /prepareImportedLevel\(file,\s*\{/);
assert.match(controller, /occupiedFileNames:\s*this\.levels\.map\(\(level\) => level\.fileName\)/);
assert.match(controller, /saveLevel\(\{[^}]*saveAs:\s*true/);
assert.match(controller, /openLevel\(fileName,\s*\{\s*discardDirty:\s*true\s*\}\)/);
```

Update the hub publish test to require “导入本地 JSON” in the Paws card copy and require the home script cache key `20260720-paws-local-import`.

- [x] **Step 2: Run contract tests and verify RED**

Run:

```powershell
node --test tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-publish.test.mjs
```

Expected: FAIL because the controls, controller methods, copy, and cache key are missing.

- [x] **Step 3: Add the HTML and responsive layout**

Add to the library action area:

```html
<button id="import-level" class="secondary-button edit-only" type="button">导入 JSON</button>
<input id="import-level-input" type="file" accept="application/json,.json" hidden />
```

Change `.panel-action-row` to a two-column grid so four buttons remain readable. Update the demo banner to state that selected local JSON is read and saved only in the current browser.

- [x] **Step 4: Wire the controller**

Import the helper, cache both elements, bind button and `change` events, then implement:

```js
requestLocalImport() {
  if (this.readonly) return;
  if (this.isDirty() && !confirm("当前关卡有未保存修改，确定导入本地关卡吗？")) return;
  this.elements.importLevelInput.value = "";
  this.elements.importLevelInput.click();
}

async importLocalLevel(file) {
  if (this.readonly || !file) return;
  try {
    const { fileName, value } = await prepareImportedLevel(file, {
      occupiedFileNames: this.levels.map((level) => level.fileName),
    });
    await this.api.saveLevel({
      fileName,
      value,
      expectedVersion: "",
      saveAs: true,
    });
    await this.refreshLevels();
    await this.openLevel(fileName, { discardDirty: true });
    this.showToast(`已导入 ${fileName}，仅保存在当前浏览器。`);
  } catch (error) {
    this.showToast(error.message, "error");
  } finally {
    this.elements.importLevelInput.value = "";
  }
}
```

- [x] **Step 5: Update application-center copy and cache key**

Mention local JSON import in the Paws card description and bump the `app-20260706-restore-games.js` query string in root `index.html`.

- [x] **Step 6: Run contract tests and verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [x] **Step 7: Commit Task 2**

```powershell
git add projects/paws-level-editor/index.html projects/paws-level-editor/styles.css projects/paws-level-editor/ui/workbench-controller.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-publish.test.mjs app-20260706-restore-games.js index.html
git commit -m "feat: import local paws level json"
```

### Task 3: Browser import regression and release verification

**Files:**
- Modify: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: `docs/superpowers/plans/2026-07-20-paws-local-level-import.md`

**Interfaces:**
- Consumes: public import button/input and browser-local save flow.
- Produces: browser evidence for import, persistence, collision naming, invalid-file isolation, and mobile hiding.

- [x] **Step 1: Extend the browser smoke test before relying on the feature**

Use a real Playwright file chooser:

```js
const [chooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.locator("#import-level").click(),
]);
await chooser.setFiles({
  name: "local_demo.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(importedLevel)),
});
```

Assert:

- list count changes from 1 to 2;
- the selected document is `local_demo.json`;
- imported ID/name and an unknown field survive;
- `localStorage` contains the local record;
- reload keeps the imported entry;
- a second same-name import opens `local_demo_import.json`;
- invalid JSON leaves the list and current document unchanged;
- mobile `#import-level` is hidden.

Add `importedFileName`, `importPersists`, `collisionFileName`, and `mobileImportHidden` to the printed JSON summary.

- [x] **Step 2: Run browser test and fix only observed failures**

Run:

```powershell
npm run test:paws-browser
```

Expected: desktop/mobile overflow false, import persistence true, collision name populated, mobile import hidden true, and all console/HTTP/page/request counts 0.

- [x] **Step 3: Run the complete relevant regression**

Run:

```powershell
$env:FFMPEG_PATH='C:\Users\ASUS\AppData\Local\Temp\codex-media-runtime\node_modules\ffmpeg-static\ffmpeg.exe'
node --test tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-level-summary.test.mjs tests/paws-level-editor-local-import.test.mjs tests/paws-level-editor-publish.test.mjs tests/paws-level-editor-recording-script.test.mjs tests/paws-level-editor-static-api.test.mjs tests/paws-level-editor-static-server.test.mjs tests/paws-level-editor-video.test.mjs tests/project-video-coverage.test.mjs
npm run test:paws-browser
```

Expected: 0 failures; only the existing Windows symlink permission condition may skip.

- [x] **Step 4: Run syntax, privacy, media, and diff checks**

Check every Paws `.mjs` module plus the recording scripts with `node --check`, fully decode the MP4, run `git diff --check origin/main...HEAD`, and scan the public project for local paths, `EditorLevels`, credentials, and the prior session password.

- [x] **Step 5: Mark plan complete and commit browser coverage**

Check completed plan boxes, then:

```powershell
git add tests/paws-level-editor-browser-smoke.mjs docs/superpowers/plans/2026-07-20-paws-local-level-import.md
git commit -m "test: verify paws local level import"
```

- [x] **Step 6: Publish and verify**

Push `codex/paws-local-level-import`, verify `origin/main` is its ancestor, then non-force fast-forward the feature branch to `origin/main`. Wait for the Pages workflow for the new commit.

Verify HTTP 200 for the hub, editor, helper module, and existing video resources. In a real browser, click “导入 JSON”, choose a temporary synthetic level, confirm it opens in 2D/3D and play mode, reload to confirm persistence, and verify error logs are empty.
