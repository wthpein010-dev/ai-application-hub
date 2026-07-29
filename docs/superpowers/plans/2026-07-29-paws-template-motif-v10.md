# Paws 模板母题 AI v10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 从全部第二关的连续层序列和 0/2/4 条盲盒平铺轨迹生成正式关卡风格的布局，并保证合法参数下生成不因随机容量不足而失败。

**Architecture:** `level-statistics.mjs` 提取连续层和跨层平铺轨迹，`template-motif-generator.mjs` 负责选模板、映射层、全局镜像、容量分配和安全补位，`ai-level-generator.mjs` 只编排候选、求解、难度与元数据。控制器的“全部参考”优先过滤第二关；外部 Unity 语料通过可选环境变量运行，不把关卡 JSON 发布进仓库。

**Tech Stack:** 原生 ES modules、Node `node:test`、现有 Paws 求解器/随机分配器、Playwright 浏览器验收、GitHub Pages。

## Global Constraints

- 棋盘固定 `7×8`，`gridUnit=sheep_7x8_mini8`。
- 总砖数为偶数且精确；有效层数精确；同层正面积重叠为 0。
- 所有生成砖均为 `type=-1`。
- 盲盒平铺下层为 `presetColorType=3, moldType=1`，顶层为 `presetColorType=1, moldType=2`。
- 平铺轨迹数量来自参考模板，允许 0、2、4；不得固定为 2。
- 不修改 Unity 关卡 JSON，不发布活动目录或 `_Trash`。
- 公网内置关卡索引继续为空。

---

### Task 1: 第二关连续层与盲盒轨迹画像

**Files:**
- Modify: `projects/paws-level-editor/core/level-statistics.mjs`
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`

**Interfaces:**
- Produces: `extractLevelStatistics(document).fillTracks`
- Produces: `extractLevelStatistics(document).layerSequence`
- Produces: `mergeLevelStatistics(samples).referenceProfiles[*].fillTracks`
- Preserves: `blindStacks` as a compatibility alias of normalized `fillTracks`

- [ ] **Step 1: Write failing tests for 0/2/4 tracks and missing explicit tops**

Add fixtures where:

```js
const noFill = makeDocument([
  tile("ordinary-a", 0, 0, 1, -1),
  tile("ordinary-b", 16, 0, 1, -1),
]);

const fourFill = makeDocument([
  ...[0, 12, 36, 48].flatMap((x, track) => [
    { ...tile(`fill-${track}-1`, x, 0, 1, -1), presetColorType: 3 },
    { ...tile(`fill-${track}-2`, x + (track < 2 ? 1 : -1), 0, 2, -1), presetColorType: 3 },
    { ...tile(`fill-${track}-top`, x + (track < 2 ? 2 : -2), 0, 3, -1), moldType: 2 },
  ]),
]);

const legacyFill = makeDocument([
  { ...tile("legacy-1", 0, 52, 1, -1), presetColorType: 3 },
  { ...tile("legacy-2", 1, 52, 2, -1), presetColorType: 3 },
]);
```

Assert 0, 4 and 1 inferred tracks respectively; inferred track has `explicitTop=false`, `lowerDepth=2`, `depth=3`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/paws-level-editor-ai-generator.test.mjs
```

Expected: FAIL because `fillTracks`, `explicitTop`, `lowerDepth` and `layerSequence` do not exist.

- [ ] **Step 3: Implement robust track extraction**

Split `analyzeLayerTemplates` into:

```js
function analyzeFillTracks(tiles, board, layerCount) { /* consecutive p3 tracks + optional/inferred top */ }
function analyzeLayerSequence(tiles, board, layerCount) { /* ordered full layer templates + rhythm metrics */ }
```

Match lower-track tiles only when layers are consecutive and both coordinate deltas are `<= 4`. Attach the nearest `moldType=2` tile on the next layer when present. Otherwise set `explicitTop=false` and infer the next-layer top for generation metadata without mutating the reference document.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Node test and confirm all existing and new statistics tests pass.

- [ ] **Step 5: Commit**

```powershell
git add projects/paws-level-editor/core/level-statistics.mjs tests/paws-level-editor-ai-generator.test.mjs
git commit -m "feat(paws): learn second-round fill tracks"
```

---

### Task 2: “全部参考”优先学习第二关

**Files:**
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `tests/paws-level-editor-ai-controller.test.mjs`

**Interfaces:**
- Produces: `selectSecondRoundReferences(references)`
- Consumes: parsed documents with `fileName` and `gameplay.gameLevelOrder`

- [ ] **Step 1: Write failing controller tests**

Add a source-contract test for:

```js
export function selectSecondRoundReferences(references) {
  const roundTwo = references.filter((document) =>
    Number(document.gameplay?.gameLevelOrder) === 2
    || /_r2_/i.test(document.fileName ?? ""));
  return roundTwo.length ? roundTwo : references;
}
```

Add behavioral fixtures proving a mixed r1/r2 list returns only r2, while an r1-only list falls back to r1.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/paws-level-editor-ai-controller.test.mjs
```

Expected: FAIL because the selector is absent and `loadAiReferenceDocuments()` returns every eligible non-AI level.

- [ ] **Step 3: Implement and integrate**

Export the pure selector, call it after successful document loads, and keep explicit “当前关卡” behavior unchanged. Update the success toast to report the filtered reference count.

- [ ] **Step 4: Run and verify GREEN**

Run the focused controller test.

- [ ] **Step 5: Commit**

```powershell
git add projects/paws-level-editor/ui/workbench-controller.mjs tests/paws-level-editor-ai-controller.test.mjs
git commit -m "feat(paws): prefer second-round AI references"
```

---

### Task 3: 模板层序列变形器与容量守恒

**Files:**
- Create: `projects/paws-level-editor/core/template-motif-generator.mjs`
- Create: `tests/paws-level-editor-template-motif.test.mjs`
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`

**Interfaces:**
- Produces:

```js
export function buildTemplateMotifGeometry({
  learned,
  target: { tileCount, layerCount },
  layout,
  seed,
  attempt = 0,
}) => {
  tiles,
  sourceProfile,
  sourceLayerMap,
  layerTileCounts,
  layerCapacities,
  preservedAnchorRatio,
  fillTracks,
}
```

- Consumes: `mergeLevelStatistics(...).referenceProfiles`

- [ ] **Step 1: Write failing geometry tests**

Cover:

```js
test("global transform preserves source layer order without per-layer wrapping", ...)
test("capacity-aware allocation returns exact totals instead of 29/32 failures", ...)
test("selected templates reproduce zero, two and four fill tracks", ...)
test("every generated tile uses full-random type -1", ...)
test("same-layer geometry never overlaps", ...)
test("same seed is deterministic and different seeds vary transform or archetype", ...)
```

For the capacity regression, use a 17-layer source rhythm containing a 27-tile peak and request `200/15`; assert exact counts, no throw and each count `<= layerCapacities[index]`.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/paws-level-editor-template-motif.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement profile ranking and source-layer mapping**

Rank by normalized tile/layer distance plus layout metrics. Map target layers monotonically through one source profile. Use only one global mirror pair for ordinary and fill anchors.

- [ ] **Step 4: Implement fill-track reconstruction**

Scale source start/top layers to the target. Interpolate track anchors, resolve same-layer collisions with nearest legal one-microgrid adjustment, write lower/top Unity semantics, and return track metadata.

- [ ] **Step 5: Implement capacity-aware allocation**

For each target layer:

1. Reserve semantic fill anchors.
2. Add transformed ordinary source anchors that do not overlap.
3. Add `7×8` grid anchors ordered by distance to the source silhouette.
4. Set capacity to the complete safe candidate count.

Distribute the exact total from `max(1, semanticCount)` using source rhythm weights, never exceeding capacity. Throw only when the target exceeds summed proven capacity.

- [ ] **Step 6: Verify GREEN and refactor**

Run the focused test, then remove the v9 `transformTemplateAnchor`, `blindAnchorsForLayer`, `difficultyBlindDepth`, and unconstrained `allocateLayerTileCounts` path from `ai-level-generator.mjs`.

- [ ] **Step 7: Commit**

```powershell
git add projects/paws-level-editor/core/template-motif-generator.mjs projects/paws-level-editor/core/ai-level-generator.mjs tests/paws-level-editor-template-motif.test.mjs
git commit -m "feat(paws): generate from continuous template motifs"
```

---

### Task 4: v10 编排、随机零失败与结构元数据

**Files:**
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Modify: `projects/paws-level-editor/core/random-assigner.mjs`
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`
- Modify: `tests/paws-level-editor-play-engine.test.mjs`

**Interfaces:**
- Algorithm version: `paws-local-stat-v10-template-motifs`
- Metadata: `designerNote.aiGeneration.templateLearning`
- Preserves: `assignRandomTypes(..., { solvableMoves })`

- [ ] **Step 1: Write failing v10 contract and stability tests**

Assert:

```js
assert.equal(version, "paws-local-stat-v10-template-motifs");
assert.equal(document.tiles.every(({ type }) => type === -1), true);
assert.deepEqual(templateLearning.sourceLayerMap.length, targetLayerCount);
assert.equal(templateLearning.fullRandomRatio, 1);
assert.equal(templateLearning.fillTrackCount, templateLearning.fillTracks.length);
```

Add 50-seed single-attempt sweeps for easy and normal using the synthetic 16-profile corpus; the old code must reproduce capacity failures.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/paws-level-editor-ai-generator.test.mjs tests/paws-level-editor-play-engine.test.mjs
```

- [ ] **Step 3: Integrate motif candidates**

For every attempt, call `buildTemplateMotifGeometry` with deterministic `attempt`. Try the ranked profile/transform sequence instead of repeatedly selecting from the top three at random. Keep the best solvable difficulty candidate; return it even when outside ±5.

Replace hard-coded “at least 3 towers” and “release drop” rejection with safety gates plus independent template similarity metadata. Real source templates with one tower or no synthetic five-stage pressure must remain valid.

- [ ] **Step 4: Preserve route-aligned random assignment**

Keep all stored types as `-1`. Use the raw `solveLevel(document).moves` for difficulty sampling and browser play. Add a test over 20 play seeds for each difficulty proving every assigned type count is even and `solveLevel(snapshot).solvable === true`.

- [ ] **Step 5: Run and verify GREEN**

Run focused tests, then the full Paws Node suite:

```powershell
$files = Get-ChildItem tests -Filter 'paws-level-editor-*.test.mjs' | Sort-Object Name | ForEach-Object FullName
node --test $files
```

- [ ] **Step 6: Commit**

```powershell
git add projects/paws-level-editor/core/ai-level-generator.mjs projects/paws-level-editor/core/random-assigner.mjs tests/paws-level-editor-ai-generator.test.mjs tests/paws-level-editor-play-engine.test.mjs
git commit -m "feat(paws): guarantee v10 full-random generation"
```

---

### Task 5: 全部 Unity 第二关语料门禁

**Files:**
- Create: `tests/paws-level-editor-ai-corpus.test.mjs`
- Create: `scripts/verify-paws-ai-corpus.mjs`
- Modify: `package.json`

**Interfaces:**
- Environment variable: `PAWS_EDITOR_LEVELS`
- Script output: JSON summary with corpus count, generation failures, overlap failures, type failures, fill-track mismatches and play-seed failures

- [ ] **Step 1: Write the corpus test first**

When `PAWS_EDITOR_LEVELS` is set, load root-level `_r2_*.json`, exclude `_Trash`, parse with `parseLevelDocument`, and run every source as a single reference at default target. Without the variable, skip with an explicit reason.

- [ ] **Step 2: Run against the Unity directory and verify RED**

```powershell
$env:PAWS_EDITOR_LEVELS='E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels'
node --test tests/paws-level-editor-ai-corpus.test.mjs
```

Expected before v10 integration: failures for missing/inaccurate fill tracks or capacity.

- [ ] **Step 3: Implement reusable verifier**

The script must run:

- all active second-round files;
- difficulty/layout 50-seed generation sweep;
- 10 generated levels per difficulty × 20 play seeds;
- same-layer overlap, exact count/layers, `type=-1`, fill-track and solver checks.

It must exit non-zero if any counter is non-zero.

- [ ] **Step 4: Add package script and run GREEN**

Add:

```json
"verify:paws-ai-corpus": "node scripts/verify-paws-ai-corpus.mjs"
```

Run with `PAWS_EDITOR_LEVELS` set and retain the JSON proof under `tests/artifacts/paws-ai-v10-corpus-proof.json`.

- [ ] **Step 5: Commit**

```powershell
git add tests/paws-level-editor-ai-corpus.test.mjs scripts/verify-paws-ai-corpus.mjs package.json tests/artifacts/paws-ai-v10-corpus-proof.json
git commit -m "test(paws): gate AI against Unity second rounds"
```

---

### Task 6: 浏览器视觉、发布与长期记忆

**Files:**
- Modify: `tests/paws-level-editor-ai-browser-smoke.mjs`
- Modify: `projects/paws-level-editor/video/recording-proof.json` only if current-source proof requires refresh
- Modify: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md`
- Modify: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`

**Interfaces:**
- Public URL: `https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/index.html`

- [ ] **Step 1: Add browser assertions before implementation refresh**

Assert the generated level exposes v10 metadata, all `type=-1`, non-fixed fill-track count, source-layer map, exact `7×8`, no overlap, and complete play.

- [ ] **Step 2: Run local browser RED/GREEN**

```powershell
node tests/paws-level-editor-ai-browser-smoke.mjs --update-artifacts
```

Visually inspect 2D all layers, representative single layers, 3D and play. Confirm alternating layers, long-tail towers and correct fill tracks are visible.

- [ ] **Step 3: Final verification**

Run:

```powershell
$files = Get-ChildItem tests -Filter 'paws-level-editor-*.test.mjs' | Sort-Object Name | ForEach-Object FullName
node --test $files
$env:PAWS_EDITOR_LEVELS='E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels'
npm run verify:paws-ai-corpus
node tests/paws-level-editor-ai-browser-smoke.mjs
git diff --check
```

- [ ] **Step 4: Publish**

Verify GitHub identity and write permission, commit any refreshed proof, push the current branch to `origin/main`, wait for the exact Pages workflow SHA, then run the online AI browser smoke with `--base-url`.

- [ ] **Step 5: Update memory and finish**

Record v10, 16-level corpus findings, zero-failure sweep, commit SHA, workflow and public browser results. Do not store credentials or Unity JSON content.
