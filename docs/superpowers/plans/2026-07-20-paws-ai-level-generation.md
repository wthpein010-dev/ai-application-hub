# Paws 工程关卡库与浏览器 AI 生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 发布 30 个工程关卡、默认打开 `level_0020_r2_第二关模板12.json`，并增加浏览器本地统计学习、约束生成和自动求解的 AI 关卡生成器。

**Architecture:** 静态发布脚本把明确传入目录中的工程 JSON 复制到 Pages 关卡目录并生成带默认项的索引。浏览器端由相互独立的统计、求解和生成纯模块完成算法，控制器只负责收集参考关卡、保存浏览器副本和打开结果；现有编辑、2D、3D和试玩流程不分叉。

**Tech Stack:** Node.js ESM、浏览器原生 DOM/localStorage、Three.js、`node:test`、Playwright、GitHub Pages。

## Global Constraints

- 公开关卡库恰好包含源目录当前 30 个 JSON，默认文件名精确为 `level_0020_r2_第二关模板12.json`。
- 不在公开文件中写入 `E:\Mahjong\...` 绝对路径、密码、Token、Cookie或其他凭据。
- AI 生成仅使用浏览器本地算法，不增加后端、模型 API、API Key 或网络写入。
- UI 只提供难度、布局、参考三组选项；桌面可生成，390px/粗指针只读模式不可生成。
- AI 候选必须通过现有 `validateLevel`、重叠预算、精确堆叠深度和自动求解。
- 生成结果只保存到当前浏览器，文件名以 `ai_level_<seed>.json` 为基础且永不覆盖现有记录。
- 发布前必须通过数据、单元、契约、静态服务器、浏览器和视觉验收；推送后必须通过 GitHub Pages 在线验收。

---

### Task 1: 发布关卡同步与默认目录

**Files:**
- Create: `scripts/sync-paws-published-levels.mjs`
- Create: `tests/paws-level-editor-published-levels.test.mjs`
- Modify: `projects/paws-level-editor/static-api-client.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Replace generated: `projects/paws-level-editor/levels/index.json`
- Add generated: `projects/paws-level-editor/levels/level_*.json`

**Interfaces:**
- Produces: `syncPublishedLevels({ sourceDir, targetDir, defaultFileName, modifiedAt }): Promise<{ defaultFileName: string, levels: LevelSummary[] }>`
- Produces: `api.listLevelCatalog(): Promise<{ defaultFileName: string, levels: LevelSummary[] }>`
- Consumes: existing `parseLevelDocument(raw)` to count normalized tiles and layers.

- [x] **Step 1: Write the failing publication tests**

```js
test("published catalog contains the 30 authorized project levels and the requested default", async () => {
  const catalog = JSON.parse(await readFile(join(editorRoot, "levels/index.json"), "utf8"));
  assert.equal(catalog.levels.length, 30);
  assert.equal(catalog.defaultFileName, "level_0020_r2_第二关模板12.json");
  const selected = catalog.levels.find(({ fileName }) => fileName === catalog.defaultFileName);
  assert.deepEqual(
    { id: selected.id, name: selected.name, tileCount: selected.tileCount, layerCount: selected.layerCount },
    { id: 20, name: "第二关模板12", tileCount: 198, layerCount: 17 },
  );
  assert.equal(catalog.levels.some(({ fileName }) => fileName === "level_showcase.json"), false);
});

test("published levels parse and contain no source path or credential-shaped top-level keys", async () => {
  for (const entry of catalog.levels) {
    const raw = await readFile(join(editorRoot, "levels", entry.fileName), "utf8");
    const value = JSON.parse(raw);
    assert.equal(raw.includes(":\\\\"), false);
    assert.equal(Object.keys(value).some((key) => /token|password|secret|cookie|auth|path/i.test(key)), false);
  }
});
```

- [x] **Step 2: Run the publication tests and verify RED**

Run: `node --test tests/paws-level-editor-published-levels.test.mjs`

Expected: FAIL because `index.json` still contains one showcase and has no `defaultFileName`.

- [x] **Step 3: Implement the synchronization script**

```js
export async function syncPublishedLevels({
  sourceDir,
  targetDir,
  defaultFileName,
  modifiedAt = "2026-07-20T00:00:00.000Z",
}) {
  const names = (await readdir(sourceDir))
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  if (!names.includes(defaultFileName)) throw new Error(`默认关卡不存在：${defaultFileName}`);
  const prepared = await Promise.all(names.map(async (fileName) => {
    const raw = await readFile(join(sourceDir, fileName), "utf8");
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`关卡根节点必须是对象：${fileName}`);
    }
    const document = parseLevelDocument(value, { fileName });
    return {
      fileName,
      raw,
      summary: {
        id: document.id,
        fileName,
        name: document.name || fileName.replace(/\.json$/i, ""),
        difficulty: document.difficulty,
        tileCount: document.tiles.length,
        layerCount: Math.max(0, ...document.tiles.map((tile) => tile.layer)),
        modifiedAt,
      },
    };
  }));
  await mkdir(targetDir, { recursive: true });
  await Promise.all(prepared.map(({ fileName, raw }) => writeFile(join(targetDir, fileName), raw, "utf8")));
  const catalog = { defaultFileName, levels: prepared.map(({ summary }) => summary) };
  await writeFile(join(targetDir, "index.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}
```

- [x] **Step 4: Generate the authorized public files**

Run:

```powershell
node scripts/sync-paws-published-levels.mjs `
  "E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels" `
  "projects\paws-level-editor\levels" `
  "level_0020_r2_第二关模板12.json"
```

Expected: `Synced 30 levels; default=level_0020_r2_第二关模板12.json`.

- [x] **Step 5: Add catalog API and controller default selection**

```js
async listLevelCatalog() {
  const index = await fetchJson(fetchImpl, INDEX_URL);
  if (!Array.isArray(index?.levels)) {
    throw new WorkbenchApiError("内置关卡索引格式无效。", { code: "invalid-level-index" });
  }
  return {
    defaultFileName: typeof index.defaultFileName === "string" ? index.defaultFileName : "",
    levels: mergeBundledAndLocal(index.levels, storage),
  };
},
async listLevels() {
  return (await this.listLevelCatalog()).levels;
},
```

Controller:

```js
const catalog = await this.api.listLevelCatalog();
this.levels = catalog.levels;
this.defaultFileName = catalog.defaultFileName;
if (!this.document && this.levels.length) {
  const initial = this.levels.find(({ fileName }) => fileName === this.defaultFileName) ?? this.levels[0];
  await this.openLevel(initial.fileName, { recoverable: initial.recoverable });
}
```

- [x] **Step 6: Run Task 1 tests and commit**

Run: `node --test tests/paws-level-editor-published-levels.test.mjs tests/paws-level-editor-static-api.test.mjs tests/paws-level-editor-controller-contract.test.mjs`

Expected: all tests PASS.

Commit:

```powershell
git add scripts/sync-paws-published-levels.mjs tests/paws-level-editor-published-levels.test.mjs projects/paws-level-editor/levels projects/paws-level-editor/static-api-client.mjs projects/paws-level-editor/ui/workbench-controller.mjs
git commit -m "feat: publish paws project level library"
```

---

### Task 2: 统计、求解和受约束生成核心

**Files:**
- Create: `projects/paws-level-editor/core/level-statistics.mjs`
- Create: `projects/paws-level-editor/core/level-solver.mjs`
- Create: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Create: `tests/paws-level-editor-ai-generator.test.mjs`

**Interfaces:**
- Produces: `extractLevelStatistics(document): LevelStatistics`
- Produces: `mergeLevelStatistics(statistics): ReferenceProfile`
- Produces: `solveLevel(document, { maxNodes = 20000 } = {}): SolverReport`
- Produces: `generateAiLevel({ references, difficulty, layout, seed, maxAttempts = 32 }): { document, report, seed, attempts }`
- Consumes: `computeCoverage(tiles)`, `validateLevel(document)`, `XorShift32`.

- [x] **Step 1: Write failing statistic and solver tests**

```js
test("statistics report layers, overlap, exact stacks, and initial pairs", () => {
  const stats = extractLevelStatistics(makeDocument([
    tile("a", 0, 0, 1, 1), tile("b", 16, 0, 1, 1),
    tile("c", 4, 4, 2, 2), tile("d", 20, 4, 2, 2),
  ]));
  assert.equal(stats.tileCount, 4);
  assert.equal(stats.layerCount, 2);
  assert.equal(stats.layerHistogram[1], 2);
  assert.equal(stats.intersectingCrossLayerPairs, 2);
  assert.equal(stats.maxExactStackDepth, 1);
  assert.equal(stats.initialAccessiblePairs, 1);
});

test("solver distinguishes a removable level from a blocked level", () => {
  assert.equal(solveLevel(makeDocument([
    tile("a", 0, 0, 1, 1), tile("b", 16, 0, 1, 1),
  ])).solvable, true);
  assert.equal(solveLevel(makeDocument([
    tile("left", 0, 0, 1, 1),
    tile("middle-a", 8, 0, 1, 2),
    tile("middle-b", 8, 16, 1, 2),
    tile("right", 16, 0, 1, 1),
  ])).solvable, false);
});
```

- [x] **Step 2: Run core tests and verify RED**

Run: `node --test tests/paws-level-editor-ai-generator.test.mjs`

Expected: FAIL with module-not-found for `level-statistics.mjs`.

- [x] **Step 3: Implement statistics**

```js
export function extractLevelStatistics(document) {
  const tiles = Array.isArray(document?.tiles) ? document.tiles : [];
  const coverage = computeCoverage(tiles);
  const layerHistogram = Object.fromEntries(
    [...groupBy(tiles, (tile) => tile.layer)].map(([layer, values]) => [layer, values.length]),
  );
  const overlap = countCrossLayerOverlap(tiles);
  return {
    board: { width: Number(document?.board?.width) || 8, height: Number(document?.board?.height) || 10 },
    tileCount: tiles.length,
    layerCount: Math.max(0, ...tiles.map((tile) => tile.layer)),
    layerHistogram,
    normalizedAnchors: tiles.map((tile) => normalizeAnchor(tile, document.board)),
    intersectingCrossLayerPairs: overlap.count,
    overlapRatio: overlap.possible ? overlap.count / overlap.possible : 0,
    maxExactStackDepth: maximumExactStackDepth(tiles),
    initialAccessiblePairs: countAccessiblePairs(tiles, coverage),
  };
}
```

- [x] **Step 4: Implement deterministic solver**

```js
export function solveLevel(document, { maxNodes = 20000 } = {}) {
  const source = (document?.tiles ?? []).map((tile, index) => ({ ...tile, uid: tile.uid || `tile-${index + 1}` }));
  const visited = new Set();
  let nodes = 0;
  const search = (active) => {
    if (!active.length) return [];
    const key = active.map(({ uid }) => uid).sort().join("|");
    if (visited.has(key) || nodes >= maxNodes) return null;
    visited.add(key);
    nodes += 1;
    const coverage = computeCoverage(active);
    const available = active.filter((tile) => {
      const state = coverage.get(tile.uid);
      return !state.covered && !state.sideBlocked;
    });
    for (const [first, second] of rankedPairs(available, active)) {
      const removed = new Set([first.uid, second.uid]);
      const suffix = search(active.filter(({ uid }) => !removed.has(uid)));
      if (suffix) return [[first.uid, second.uid], ...suffix];
    }
    return null;
  };
  const solution = search(source);
  return {
    solvable: Array.isArray(solution),
    moves: solution ?? [],
    steps: solution?.length ?? 0,
    nodes,
    exhausted: nodes >= maxNodes && !solution,
    initialAccessiblePairs: availablePairCount(source),
  };
}
```

- [x] **Step 5: Write failing generator matrix test**

```js
for (const difficulty of ["easy", "normal", "hard"]) {
  for (const layout of ["balanced", "progressive", "open"]) {
    test(`generates constrained solvable ${difficulty}/${layout}`, () => {
      const generated = generateAiLevel({ references: [reference], difficulty, layout, seed: 73125 });
      const profile = DIFFICULTY_PROFILES[difficulty];
      const stats = extractLevelStatistics(generated.document);
      assert.equal(validateLevel(generated.document).filter(({ severity }) => severity === "error").length, 0);
      assert.equal(generated.report.solvable, true);
      assert.ok(stats.tileCount >= profile.tiles[0] && stats.tileCount <= profile.tiles[1]);
      assert.ok(stats.layerCount >= profile.layers[0] && stats.layerCount <= profile.layers[1]);
      assert.ok(stats.overlapRatio <= profile.maxOverlap);
      assert.ok(stats.maxExactStackDepth <= 2);
    });
  }
}
```

- [x] **Step 6: Implement deterministic constrained generator**

```js
export const DIFFICULTY_PROFILES = Object.freeze({
  easy: { tiles: [36, 48], layers: [3, 4], minInitialPairs: 4, maxOverlap: 0.25 },
  normal: { tiles: [60, 72], layers: [5, 6], minInitialPairs: 2, maxOverlap: 0.40 },
  hard: { tiles: [84, 96], layers: [7, 8], minInitialPairs: 1, maxOverlap: 0.50 },
});

export function generateAiLevel({ references, difficulty, layout, seed, maxAttempts = 32 }) {
  const profile = DIFFICULTY_PROFILES[difficulty];
  if (!profile || !LAYOUT_PROFILES[layout]) throw new Error("AI 生成选项无效。");
  const learned = mergeLevelStatistics(references.map(extractLevelStatistics));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptSeed = (Number(seed) + Math.imul(attempt - 1, 0x9e3779b9)) | 0;
    const document = buildCandidate({ learned, profile, difficulty, layout, seed: attemptSeed });
    const stats = extractLevelStatistics(document);
    const issues = validateLevel(document).filter(({ severity }) => severity === "error");
    if (issues.length || stats.overlapRatio > profile.maxOverlap || stats.maxExactStackDepth > 2) continue;
    const report = solveLevel(document);
    if (report.solvable && report.initialAccessiblePairs >= profile.minInitialPairs) {
      return { document, report: { ...report, statistics: stats }, seed: attemptSeed, attempts: attempt };
    }
  }
  throw new Error("在当前约束内未找到可解关卡，请重试或降低难度。");
}
```

- [x] **Step 7: Run Task 2 tests and commit**

Run: `node --test tests/paws-level-editor-ai-generator.test.mjs`

Expected: all tests PASS, including the 9 difficulty/layout combinations.

Commit:

```powershell
git add projects/paws-level-editor/core/level-statistics.mjs projects/paws-level-editor/core/level-solver.mjs projects/paws-level-editor/core/ai-level-generator.mjs tests/paws-level-editor-ai-generator.test.mjs
git commit -m "feat: generate solvable paws levels locally"
```

---

### Task 3: AI 生成对话框与控制器接入

**Files:**
- Create: `projects/paws-level-editor/ui/ai-level-dialog.mjs`
- Create: `tests/paws-level-editor-ai-controller.test.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `projects/paws-level-editor/static-api-client.mjs`

**Interfaces:**
- Produces: `normalizeGenerationOptions(formData): { difficulty, layout, reference }`
- Produces: `describeGenerationOptions(options): string`
- Produces controller method: `generateAiLevelFromDialog(): Promise<boolean>`
- Consumes: `generateAiLevel`, `serializeLevelDocument`, `chooseImportedFileName`, `api.loadLevel`, `api.saveLevel`.

- [x] **Step 1: Write failing option and controller contract tests**

```js
test("AI dialog keeps the choice set intentionally small", () => {
  assert.match(page, /id="generate-ai-level"/);
  assert.equal((page.match(/name="ai-difficulty"/g) ?? []).length, 3);
  assert.equal((page.match(/name="ai-layout"/g) ?? []).length, 3);
  assert.equal((page.match(/name="ai-reference"/g) ?? []).length, 2);
});

test("controller saves a collision-safe browser copy and opens it", () => {
  assert.match(controller, /chooseImportedFileName\(`ai_level_\$\{[^}]+\}\.json`/);
  assert.match(controller, /saveLevel\(\{[\s\S]*saveAs:\s*true/);
  assert.match(controller, /openLevel\(fileName,\s*\{\s*discardDirty:\s*true\s*\}\)/);
});
```

- [x] **Step 2: Run UI contract tests and verify RED**

Run: `node --test tests/paws-level-editor-ai-controller.test.mjs`

Expected: FAIL because the dialog and controller method do not exist.

- [x] **Step 3: Add dialog markup and pure option helpers**

```html
<button id="generate-ai-level" class="ai-button edit-only" type="button">✦ AI 生成</button>
<dialog id="ai-level-dialog" class="workbench-dialog ai-level-dialog">
  <form id="ai-level-form" method="dialog">
    <p class="section-kicker">LOCAL GENERATOR</p>
    <h2>AI 生成关卡</h2>
    <fieldset><legend>难度</legend>
      <label><input type="radio" name="ai-difficulty" value="easy">简单</label>
      <label><input type="radio" name="ai-difficulty" value="normal" checked>标准</label>
      <label><input type="radio" name="ai-difficulty" value="hard">困难</label>
    </fieldset>
    <fieldset><legend>布局</legend>
      <label><input type="radio" name="ai-layout" value="balanced" checked>均衡布局</label>
      <label><input type="radio" name="ai-layout" value="progressive">层层推进</label>
      <label><input type="radio" name="ai-layout" value="open">开阔分布</label>
    </fieldset>
    <fieldset><legend>参考</legend>
      <label><input type="radio" name="ai-reference" value="current">当前关卡</label>
      <label><input type="radio" name="ai-reference" value="all" checked>全部关卡</label>
    </fieldset>
    <p id="ai-level-hint">约 60–72 张、5–6 层，优先保证可解并限制重叠。</p>
    <p id="ai-level-error" class="form-error" role="alert"></p>
    <div class="dialog-actions">
      <button value="cancel" class="secondary-button">取消</button>
      <button id="confirm-ai-level" value="default" class="primary-button">生成并打开</button>
    </div>
  </form>
</dialog>
```

```js
export function normalizeGenerationOptions(formData) {
  const difficulty = String(formData.get("ai-difficulty") ?? "normal");
  const layout = String(formData.get("ai-layout") ?? "balanced");
  const reference = String(formData.get("ai-reference") ?? "all");
  if (!["easy", "normal", "hard"].includes(difficulty)
    || !["balanced", "progressive", "open"].includes(layout)
    || !["current", "all"].includes(reference)) {
    throw new Error("AI 生成选项无效。");
  }
  return { difficulty, layout, reference };
}
```

- [x] **Step 4: Add controller generation flow**

```js
async generateAiLevelFromDialog(options) {
  if (this.readonly || this.aiGenerationPending) return false;
  this.aiGenerationPending = true;
  this.updateUI();
  try {
    const references = options.reference === "current"
      ? [this.document]
      : await this.loadBundledReferenceDocuments();
    const requestedSeed = nextSeed();
    const generated = generateAiLevel({ references, ...options, seed: requestedSeed });
    const unsignedSeed = generated.seed >>> 0;
    const fileName = chooseImportedFileName(
      `ai_level_${unsignedSeed}.json`,
      this.levels.map((level) => level.fileName),
    );
    await this.api.saveLevel({
      fileName,
      value: serializeLevelDocument(generated.document),
      expectedVersion: "",
      saveAs: true,
    });
    await this.refreshLevels({ openDefault: false });
    await this.openLevel(fileName, { discardDirty: true });
    this.showToast(`已生成可解关卡 ${fileName}，种子 ${unsignedSeed}。`);
    return true;
  } catch (error) {
    this.showToast(error.message, "error");
    return false;
  } finally {
    this.aiGenerationPending = false;
    this.updateUI();
  }
}
```

- [x] **Step 5: Run Task 3 tests and commit**

Run: `node --test tests/paws-level-editor-ai-controller.test.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-static-api.test.mjs`

Expected: all tests PASS.

Commit:

```powershell
git add projects/paws-level-editor/index.html projects/paws-level-editor/ui/ai-level-dialog.mjs projects/paws-level-editor/ui/workbench-controller.mjs projects/paws-level-editor/static-api-client.mjs tests/paws-level-editor-ai-controller.test.mjs
git commit -m "feat: add local ai level generation flow"
```

---

### Task 4: 发布文案、样式和应用中心缓存版本

**Files:**
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`
- Modify: `tests/paws-level-editor-assets.test.mjs`
- Modify: `tests/paws-level-editor-publish.test.mjs`

**Interfaces:**
- Consumes: IDs and classes from Task 3.
- Produces: desktop AI button/dialog styles and truthful public copy.

- [x] **Step 1: Write failing publication-copy tests**

```js
test("public editor describes the published project library and browser-local writes", () => {
  assert.match(editorPage, /30 个工程关卡/);
  assert.match(editorPage, /编辑和 AI 生成结果只保存到当前浏览器/);
  assert.doesNotMatch(editorPage, /仅使用独立示例关卡/);
});

test("hub cache-bust version includes the AI release", () => {
  assert.match(hubPage, /app-20260706-restore-games\.js\?v=20260720-paws-ai-levels/);
});
```

- [x] **Step 2: Run copy tests and verify RED**

Run: `node --test tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-publish.test.mjs`

Expected: FAIL on old “独立示例关卡” copy and old cache version.

- [x] **Step 3: Update copy and responsive styles**

```css
.ai-button {
  background: linear-gradient(135deg, #a9ffcb, #75e9ff);
  border: 0;
  color: #102021;
  font-weight: 800;
}
.ai-level-dialog fieldset {
  border: 0;
  display: grid;
  gap: 8px;
  margin: 18px 0;
  padding: 0;
}
.ai-choice-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 900px), (pointer: coarse) {
  #generate-ai-level { display: none !important; }
}
```

Update the banner to:

```html
<div class="demo-banner" role="note">
  已发布 30 个工程关卡 · 编辑和 AI 生成结果只保存到当前浏览器，不会写回工程
</div>
```

- [x] **Step 4: Run Task 4 tests and commit**

Run: `node --test tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-publish.test.mjs`

Expected: all tests PASS.

Commit:

```powershell
git add projects/paws-level-editor/index.html projects/paws-level-editor/styles.css app-20260706-restore-games.js index.html tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-publish.test.mjs
git commit -m "feat: present paws ai level library"
```

---

### Task 5: 浏览器门禁和完整回归

**Files:**
- Modify: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: `tests/paws-level-editor-static-server.test.mjs`
- Create: `tests/paws-level-editor-ai-browser-smoke.mjs`
- Create generated proof: `tests/artifacts/paws-ai-level-proof.json`
- Create generated screenshot: `tests/artifacts/paws-ai-level-desktop.png`

**Interfaces:**
- Consumes: production browser UI and `window.pawsWorkbench`.
- Produces: machine-readable proof for default level, catalog, generation, 2D/3D/play, persistence and zero-error gates.

- [x] **Step 1: Add failing browser acceptance**

```js
await page.goto(`${baseUrl}/projects/paws-level-editor/`, { waitUntil: "networkidle" });
await expect.poll(() => page.locator(".level-card").count()).toBe(30);
await expect(page.locator("#status-level")).toHaveText("第二关模板12");
await page.click("#generate-ai-level");
await page.locator('input[name="ai-difficulty"][value="normal"]').check();
await page.locator('input[name="ai-layout"][value="balanced"]').check();
await page.locator('input[name="ai-reference"][value="all"]').check();
await page.click("#confirm-ai-level");
await expect(page.locator("#status-level")).toContainText("AI 标准");
await page.click("#view-3d");
await expect.poll(() => page.locator("canvas").count()).toBe(1);
await page.click("#mode-play");
assert.equal(await page.evaluate(() => window.pawsWorkbench.playSnapshot.tiles.length > 0), true);
await page.reload({ waitUntil: "networkidle" });
assert.equal(await page.locator(".level-card").count(), 31);
```

- [x] **Step 2: Run browser test and verify RED**

Run: `node tests/paws-level-editor-ai-browser-smoke.mjs`

Expected: FAIL until the production UI and test fixture are fully connected.

- [x] **Step 3: Complete browser proof capture**

Record:

```js
const proof = {
  catalogCount: await page.locator(".level-card").count(),
  defaultFileName: await page.evaluate(() => window.pawsWorkbench.defaultFileName),
  openedFileName: await page.evaluate(() => window.pawsWorkbench.document.fileName),
  localAiLevels: await page.evaluate(() => window.pawsWorkbench.levels.filter((level) => level.local && level.fileName.startsWith("ai_level_")).length),
  webgl: await page.evaluate(() => Boolean(document.querySelector("canvas"))),
  consoleErrors,
  pageErrors,
  requestFailures,
};
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
await page.screenshot({ path: screenshotPath, fullPage: true });
```

- [x] **Step 4: Run all tests and syntax checks**

Run:

```powershell
node --test tests/paws-level-editor-*.test.mjs
Get-ChildItem projects\paws-level-editor -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node tests/paws-level-editor-browser-smoke.mjs
node tests/paws-level-editor-ai-browser-smoke.mjs
```

Expected: every test PASS, every module syntax check exits 0, browser console/page/request error arrays are empty.

- [x] **Step 5: Inspect the desktop screenshot and commit**

Run: inspect `tests/artifacts/paws-ai-level-desktop.png` at original resolution.

Expected: all 30 entries are reachable by scrolling, default level is visible and selected, AI dialog has exactly three compact option groups, 3D canvas is not clipped, and no text overlaps.

Commit:

```powershell
git add tests/paws-level-editor-browser-smoke.mjs tests/paws-level-editor-static-server.test.mjs tests/paws-level-editor-ai-browser-smoke.mjs tests/artifacts/paws-ai-level-proof.json tests/artifacts/paws-ai-level-desktop.png
git commit -m "test: verify paws ai level release"
```

---

### Task 6: 发布与线上验收

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-paws-ai-level-generation-design.md` only if implementation discovered a factual deviation.
- Modify: `docs/superpowers/plans/2026-07-20-paws-ai-level-generation.md` checkboxes as tasks complete.

**Interfaces:**
- Consumes: clean tested branch and GitHub Pages workflow.
- Produces: updated `origin/main` and verified production URL.

- [x] **Step 1: Run final clean-tree release gate**

Run:

```powershell
git diff --check
git status --short
node --test tests/paws-level-editor-*.test.mjs
node tests/paws-level-editor-ai-browser-smoke.mjs
```

Expected: no whitespace errors, only intentional plan checkbox edits before their final commit, all tests PASS.

- [x] **Step 2: Commit release documentation**

```powershell
git add docs/superpowers/specs/2026-07-20-paws-ai-level-generation-design.md docs/superpowers/plans/2026-07-20-paws-ai-level-generation.md
git commit -m "docs: complete paws ai level release"
```

- [x] **Step 3: Push current HEAD to `origin/main`**

Run: `git push origin HEAD:main`

Expected: non-force fast-forward update succeeds.

- [x] **Step 4: Wait for GitHub Pages success**

Run: `gh run list --workflow pages-build-deployment --limit 3 --json databaseId,headSha,status,conclusion,url`

Then: `gh run watch <databaseId> --exit-status`

Expected: workflow for the pushed SHA finishes with `conclusion: success`.

- [x] **Step 5: Run online HTTP checks**

```powershell
$base = "https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor"
Invoke-WebRequest "$base/" -UseBasicParsing
Invoke-WebRequest "$base/levels/index.json" -UseBasicParsing
Invoke-WebRequest "$base/levels/level_0020_r2_%E7%AC%AC%E4%BA%8C%E5%85%B3%E6%A8%A1%E6%9D%BF12.json" -UseBasicParsing
```

Expected: all status codes are 200 and the online index contains 30 entries with the requested default.

- [x] **Step 6: Run online Playwright acceptance**

Run: `node tests/paws-level-editor-ai-browser-smoke.mjs --base-url "https://wthpein010-dev.github.io/ai-application-hub"`

Expected: default level, 30-item catalog, AI generation, 2D/3D, play and refresh persistence all PASS with zero console/page/request failures.
