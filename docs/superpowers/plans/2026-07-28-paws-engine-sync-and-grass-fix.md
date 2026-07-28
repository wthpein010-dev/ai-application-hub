# Paws Engine Sync and Grass Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Paws web level editor with Unity commit `76464973`, including half-size rotated grass, current project assets and levels, fill-stack editing, pass-rate evaluation, last-open recovery, and verified LAN trash behavior.

**Architecture:** Keep Unity as a read-only rule and asset source. Add three focused pure modules (`fill-tool`, `pass-rate-evaluator`, and `last-opened-level`) and let the existing controller orchestrate UI, persistence, and history. Reuse the existing LAN transactional trash service and SSE channel, changing only resource discovery and regression coverage.

**Tech Stack:** Browser ES modules, Canvas 2D, Three.js/WebGL, Node.js test runner, Playwright, Node HTTP LAN service, PowerShell launcher, GitHub Actions/Pages.

## Global Constraints

- Do not modify `E:\Mahjong\PawsHomeClient` or its untracked `level_0050_r2_50 第二关第一版.json` / `.meta`.
- Public Pages stays read-only with browser-local writes and never publishes `_Trash`, `.meta`, source paths, or credentials.
- LAN deletion moves JSON and matching `.json.meta` into `EditorLevels\_Trash`, emits SSE immediately, and remains recoverable.
- Default level is `level_0021_r2_第二关模板12.json`.
- Board generation and manual new levels remain fixed at the real 7×8 Unity board.
- Dynamic block frame animations remain intentionally simplified; do not publish the `DynamicBlocks` frame library.
- Every production behavior change starts with a failing automated test and completes with a fresh full verification run.

---

### Task 1: Stabilize the Existing Static Server Test

**Files:**
- Modify: `tests/paws-level-editor-static-server.test.mjs`

**Interfaces:**
- Consumes: `startStaticServer({ root }) -> { address, baseUrl, close }`
- Produces: a server security test independent of Fetch forbidden-port policy

- [ ] **Step 1: Reproduce the baseline failure**

Run:

```powershell
node --test tests/paws-level-editor-static-server.test.mjs
```

Expected intermittent failure: `TypeError: fetch failed`, cause `bad port`, when the OS assigns an Undici-forbidden ephemeral port.

- [ ] **Step 2: Replace Fetch with Node HTTP for this server-only assertion**

Add a test-local helper:

```js
function httpGet(url) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    }).once("error", reject);
  });
}
```

The assertion must continue checking loopback binding, `403/404`, and absence of outside file content.

- [ ] **Step 3: Verify the test repeatedly**

Run:

```powershell
1..20 | ForEach-Object { node --test tests/paws-level-editor-static-server.test.mjs }
```

Expected: every run exits `0`.

- [ ] **Step 4: Commit**

```powershell
git add tests/paws-level-editor-static-server.test.mjs
git commit -m "test(paws): avoid forbidden ephemeral fetch ports"
```

### Task 2: Share Half-Size and 180-Degree Grass Rendering

**Files:**
- Modify: `tests/paws-level-editor-grass.test.mjs`
- Modify: `tests/paws-level-editor-grass-browser-smoke.mjs`
- Modify: `projects/paws-level-editor/core/grass-layout.mjs`
- Modify: `projects/paws-level-editor/ui/grass-field.mjs`
- Modify: `projects/paws-level-editor/views/three-3d.mjs`

**Interfaces:**
- Produces: `GRASS_VISUAL_SCALE: 0.5`
- Produces: `GRASS_ROTATION_RADIANS: Math.PI`
- Extends: `drawGrassAtlasPatch(context, image, variant, { centerX, baseY, pixelScale, scaleY, alpha, rotationRadians })`

- [ ] **Step 1: Write failing unit and source-contract assertions**

Add assertions equivalent to:

```js
assert.equal(GRASS_VISUAL_SCALE, 0.5);
assert.equal(GRASS_ROTATION_RADIANS, Math.PI);
assert.match(field, /GRASS_VISUAL_SCALE/);
assert.match(source, /GRASS_ROTATION_RADIANS/);
```

Use a recording canvas context to prove rotation happens after translating to `baseY - height / 2`, not around the base.

- [ ] **Step 2: Run the grass unit test and confirm red**

Run:

```powershell
node --test tests/paws-level-editor-grass.test.mjs
```

Expected: missing exports and center-rotation assertions fail.

- [ ] **Step 3: Implement shared geometry**

Export the two constants. In `drawGrassAtlasPatch`, translate to the visual rectangle center, apply `rotationRadians`, then draw Grass1 centered or rotate the Grass2 atlas slice `-Math.PI / 2` around the same center.

Use:

```js
const scale =
  Math.min(this.width, this.height * 0.8) / SPINE_STAGE_WIDTH
  * GRASS_VISUAL_SCALE;
```

Create Three.js planes with:

```js
new THREE.PlaneGeometry(
  region.width * 0.025 * GRASS_VISUAL_SCALE,
  region.height * 0.025 * GRASS_VISUAL_SCALE,
);
```

Apply the global rotation to the cropped texture while leaving camera-facing mesh rotation unchanged.

- [ ] **Step 4: Verify unit and browser grass behavior**

Run:

```powershell
node --test tests/paws-level-editor-grass.test.mjs
node tests/paws-level-editor-grass-browser-smoke.mjs
```

Expected: both exit `0`; browser proof reports 12 grass patches in 2D and 3D, half-size geometry, animated pulse, rotated texture, and static reduced motion.

- [ ] **Step 5: Commit**

```powershell
git add tests/paws-level-editor-grass.test.mjs tests/paws-level-editor-grass-browser-smoke.mjs projects/paws-level-editor/core/grass-layout.mjs projects/paws-level-editor/ui/grass-field.mjs projects/paws-level-editor/views/three-3d.mjs
git commit -m "fix(paws): halve and rotate Unity grass"
```

### Task 3: Sync Current Unity Paths and 23-Level Library

**Files:**
- Modify: `tests/paws-level-editor-assets.test.mjs`
- Modify: `tests/paws-level-editor-published-levels.test.mjs`
- Modify: `tests/paws-level-editor-lan-server.test.mjs`
- Modify: `scripts/start-paws-level-editor-lan.ps1`
- Modify: `tools/paws-level-editor-lan/server.mjs`
- Modify: `docs/paws-level-editor-lan.md`
- Replace: `projects/paws-level-editor/levels/*.json`

**Interfaces:**
- Consumes: Unity `EditorLevels` containing exactly 23 JSON files
- Consumes: Unity `Res\SheepLevelEditor\Blocks`
- Produces: a deterministic public `levels/index.json` and compatible LAN defaults

- [ ] **Step 1: Make path and catalog expectations fail**

Assert the new default resource path contains:

```text
Assets\SheepLevelEditor\Res\SheepLevelEditor\Blocks
```

Assert the catalog names exactly match the current Unity directory and include IDs 41–44 while excluding removed files such as `level_0040_r2_40第二关模板19.json`.

- [ ] **Step 2: Run targeted tests and confirm red**

Run:

```powershell
node --test tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-published-levels.test.mjs tests/paws-level-editor-lan-server.test.mjs
```

Expected: old resource path and stale level catalog assertions fail.

- [ ] **Step 3: Update new-path-first compatibility**

Set the launcher and LAN server default to the `Res` path. In PowerShell, only when `BlockAssetDir` was not explicitly passed and the new default does not exist, probe the legacy `Resources` directory.

- [ ] **Step 4: Sync the public library atomically**

Run:

```powershell
node scripts/sync-paws-published-levels.mjs `
  'E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels' `
  'projects/paws-level-editor/levels' `
  'level_0021_r2_第二关模板12.json'
```

Expected: `Synced 23 levels`.

- [ ] **Step 5: Verify assets and catalog**

Run the targeted tests again and compare all 38 public block PNG dimensions and SHA-256 hashes with Unity `Res\SheepLevelEditor\Blocks`.

- [ ] **Step 6: Commit**

```powershell
git add scripts/start-paws-level-editor-lan.ps1 tools/paws-level-editor-lan/server.mjs docs/paws-level-editor-lan.md projects/paws-level-editor/levels tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-published-levels.test.mjs tests/paws-level-editor-lan-server.test.mjs
git commit -m "feat(paws): sync current Unity assets and levels"
```

### Task 4: Restore the Last Successfully Opened Level

**Files:**
- Create: `projects/paws-level-editor/ui/last-opened-level.mjs`
- Create: `tests/paws-level-editor-last-opened.test.mjs`
- Modify: `tests/paws-level-editor-controller-race.test.mjs`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`

**Interfaces:**
- Produces: `createLastOpenedLevelStore({ storage, validateFileName })`
- Produces store methods: `read(mode)`, `write(mode, fileName)`, `clear(mode)`
- Controller writes only after the winning `performOpenLevel` commits

- [ ] **Step 1: Write store and controller failing tests**

Cover:

```js
store.write("static", "level_a.json");
store.write("lan", "level_b.json");
assert.equal(store.read("static"), "level_a.json");
assert.equal(store.read("lan"), "level_b.json");
```

Add controller assertions for startup priority, missing-file fallback, and an older open request not replacing the last-open record.

- [ ] **Step 2: Run targeted tests and confirm red**

Run:

```powershell
node --test tests/paws-level-editor-last-opened.test.mjs tests/paws-level-editor-controller-race.test.mjs tests/paws-level-editor-controller-contract.test.mjs
```

Expected: module not found and controller behavior failures.

- [ ] **Step 3: Implement safe storage and controller integration**

Catch localStorage access errors. In `refreshLevels`, choose:

```js
const remembered = this.lastOpenedLevels.read(this.runtimeMode);
const level =
  this.levels.find(({ fileName }) => fileName === remembered)
  ?? this.levels.find(({ fileName }) => fileName === this.defaultFileName)
  ?? this.levels[0];
```

Clear a missing remembered name before fallback. Persist only after `isCurrentOpen()` succeeds and the document has been committed.

- [ ] **Step 4: Verify and commit**

Run the targeted tests, then:

```powershell
git add projects/paws-level-editor/ui/last-opened-level.mjs projects/paws-level-editor/ui/workbench-controller.mjs tests/paws-level-editor-last-opened.test.mjs tests/paws-level-editor-controller-race.test.mjs tests/paws-level-editor-controller-contract.test.mjs
git commit -m "feat(paws): restore the last opened level"
```

### Task 5: Add Unity-Compatible Full-Random Fill Editing

**Files:**
- Create: `projects/paws-level-editor/core/fill-tool.mjs`
- Create: `tests/paws-level-editor-fill-tool.test.mjs`
- Modify: `projects/paws-level-editor/views/canvas-2d.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `projects/paws-level-editor/ui/inspector.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`
- Modify: `tests/paws-level-editor-browser-smoke.mjs`

**Interfaces:**
- Produces: `buildFillCells(start, end, board) -> Array<{x,y}>`
- Produces: `planFillPlacement(document, cells, { startLayer, uidFactory }) -> { additions, skipped }`
- Adds renderer callback: `onFill({ start, end })`
- Adds controller method: `fillTiles({ start, end })`

- [ ] **Step 1: Write failing pure planning tests**

Test a rightward drag:

```js
const plan = planFillPlacement(document, [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
], { startLayer: 7, uidFactory });

assert.deepEqual(plan.additions.map(({ layer }) => layer), [7, 8, 9]);
assert.equal(plan.additions.every(({ type }) => type === -1), true);
assert.deepEqual(
  plan.additions.map(({ presetColorType, moldType }) => [presetColorType, moldType]),
  [[3, 1], [3, 1], [1, 2]],
);
```

Also cover invalid start layer, board bounds, same-layer positive overlap, upper-layer collision, vertical direction, and one-cell tap.

- [ ] **Step 2: Run fill tests and confirm red**

Run:

```powershell
node --test tests/paws-level-editor-fill-tool.test.mjs
```

Expected: module not found.

- [ ] **Step 3: Implement the pure planner**

Use tile size 8, fixed board micro-bounds, dominant-axis path selection, `startLayer + index`, and positive-area overlap checks. Determine final fill flip/top metadata after assembling `existing + additions`.

- [ ] **Step 4: Add failing controller and browser contracts**

Require:

- a `[data-tool="fill"]` toolbar button;
- `平铺起点层` input in Inspector;
- controller `onFill` wiring;
- one `createAddTilesCommand(additions)` call per gesture;
- 3D tool disabling for `fill`;
- browser drag creates multiple `type=-1` tiles and one undo removes the whole batch.

- [ ] **Step 5: Implement 2D gesture, preview, Inspector and controller**

Canvas pointer state stores `startBoard/currentBoard`, draws translucent path cells with their target layer, and invokes `onFill` on pointer up. Controller uses `this.placement.fillStartLayer`, executes one history command, selects additions, validates, and reports skipped cells.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --test tests/paws-level-editor-fill-tool.test.mjs tests/paws-level-editor-controller-contract.test.mjs
node tests/paws-level-editor-browser-smoke.mjs
```

Then commit:

```powershell
git add projects/paws-level-editor/core/fill-tool.mjs projects/paws-level-editor/views/canvas-2d.mjs projects/paws-level-editor/ui/workbench-controller.mjs projects/paws-level-editor/ui/inspector.mjs projects/paws-level-editor/index.html projects/paws-level-editor/styles.css tests/paws-level-editor-fill-tool.test.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-browser-smoke.mjs
git commit -m "feat(paws): add full-random fill stacks"
```

### Task 6: Port Unity Pass-Rate Evaluation and Persistence

**Files:**
- Create: `projects/paws-level-editor/core/pass-rate-evaluator.mjs`
- Create: `tests/paws-level-editor-pass-rate.test.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `projects/paws-level-editor/ui/inspector.mjs`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `tests/paws-level-editor-metadata.test.mjs`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`
- Modify: `tests/paws-level-editor-browser-smoke.mjs`

**Interfaces:**
- Produces: `evaluateLevelPassRate(document, options) -> Promise<Result>`
- Produces: `readPassRateResult(designerNote) -> Result | null`
- Produces: `writePassRateResult(designerNote, result) -> object`
- Result: `{ passPercent, passCount, trialCount, invalidDealCount, failSolveCount, reasons }`

- [ ] **Step 1: Write failing evaluator tests**

Cover:

- empty level returns 0% with the Unity empty-level reason;
- a legal exposed pair reaches 100%;
- an odd random pool creates no valid deal and returns 0%;
- deterministic repeated evaluation produces identical result;
- large/small thresholds resolve to the exact Unity trial/rollout/node budgets;
- `designerNote` read/write preserves unrelated keys.

- [ ] **Step 2: Run evaluator tests and confirm red**

Run:

```powershell
node --test tests/paws-level-editor-pass-rate.test.mjs
```

Expected: module not found.

- [ ] **Step 3: Implement the C# algorithm port**

Port `System.Random` semantics, pairing assignment, even-count validation, greedy pair removal, DFS branches, two-slot stash, one evacuation, one shuffle, fingerprint memoization, and blocking rules. Yield after each trial:

```js
await yieldTask();
onProgress?.({ completed: trial + 1, total: trials });
```

- [ ] **Step 4: Add failing persistence and UI tests**

Require save and save-as to await a fresh evaluation before `serializeLevelDocument`. Require reopen to display stored results, any edit/undo/redo to mark them stale, and the Inspector button to run an evaluation without saving.

- [ ] **Step 5: Implement controller and Inspector integration**

Inject the evaluator through the controller constructor for tests. Maintain `passRateState = { result, stale, pending, progress }`. Before saving, await evaluation, merge result into `document.designerNote`, then serialize. If evaluation throws, do not call the API.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --test tests/paws-level-editor-pass-rate.test.mjs tests/paws-level-editor-metadata.test.mjs tests/paws-level-editor-controller-contract.test.mjs
node tests/paws-level-editor-browser-smoke.mjs
```

Then commit:

```powershell
git add projects/paws-level-editor/core/pass-rate-evaluator.mjs projects/paws-level-editor/ui/workbench-controller.mjs projects/paws-level-editor/ui/inspector.mjs projects/paws-level-editor/styles.css tests/paws-level-editor-pass-rate.test.mjs tests/paws-level-editor-metadata.test.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-browser-smoke.mjs
git commit -m "feat(paws): evaluate Unity pass rate before save"
```

### Task 7: Full Local and LAN Verification

**Files:**
- Modify only if a demonstrated regression needs a test-first fix
- Produce: local screenshots and machine-readable smoke summaries outside tracked source unless the existing proof format requires refresh

**Interfaces:**
- Consumes all prior tasks
- Produces fresh release evidence

- [ ] **Step 1: Run every Paws Node test**

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
$tests = (Get-ChildItem tests -Filter 'paws-level-editor-*.test.mjs').FullName
node --test $tests
```

Expected: zero failures and only the existing Windows file-symlink permission skip.

- [ ] **Step 2: Check every changed module and diff**

```powershell
$modules = git diff --name-only origin/main -- '*.mjs'
$modules | ForEach-Object { node --check $_ }
git diff --check origin/main
```

Expected: all exit `0`.

- [ ] **Step 3: Run specialized browser gates**

```powershell
node tests/paws-level-editor-grass-browser-smoke.mjs
node tests/paws-level-editor-ai-browser-smoke.mjs
node tests/paws-level-editor-lan-browser-smoke.mjs
node tests/paws-level-editor-browser-smoke.mjs
```

Expected: desktop 2D/3D, fill, pass rate, LAN trash restore, AI generation, full playthrough, last-open reload, and 390×844 read-only checks all pass with no console/page/request/HTTP errors.

- [ ] **Step 4: Visually inspect screenshots**

Confirm:

- 2D grass is half the prior linear size and rotated 180° around each patch center;
- 3D grass uses the same size and orientation without clipping;
- animation runs and reduced-motion mode is static;
- fill preview shows target layers and produces no same-layer overlap;
- pass-rate card remains readable at desktop width;
- mobile has no horizontal overflow.

- [ ] **Step 5: Run a real isolated LAN service**

Start the service against a temporary copied level directory and the real read-only `Res` block directory. Delete a copied JSON/meta pair from browser A, observe browser B update through SSE, restore from browser B, and confirm both exact files return. Never point a destructive smoke action at the real Unity `EditorLevels`.

### Task 8: Integrate, Publish, and Verify GitHub Pages

**Files:**
- Modify: application catalog/version proof only when required by the existing AI Hub workflow
- Update: Obsidian project memories after public verification

**Interfaces:**
- Consumes: verified feature branch and current `origin/main`
- Produces: public GitHub Pages deployment whose workflow SHA equals the pushed commit

- [ ] **Step 1: Fetch and integrate current main without force**

```powershell
git fetch origin main
git rebase origin/main
```

Resolve only overlapping Paws files, preserve unrelated upstream changes, and rerun Tasks 7.1–7.3 after the rebase.

- [ ] **Step 2: Commit any final proof metadata**

```powershell
git status --short
git diff --check origin/main
git add projects/paws-level-editor/video/recording-proof.json
git commit -m "test(paws): refresh Unity sync release proof"
```

Run the `git add` and commit only when the existing recording proof was regenerated and changed; otherwise skip this commit.

- [ ] **Step 3: Push the verified commit to main**

```powershell
git push origin HEAD:main
```

Expected: fast-forward success.

- [ ] **Step 4: Wait for Pages SHA alignment**

Use GitHub workflow inspection until the Pages deployment for the exact pushed SHA succeeds. A successful older workflow is not acceptable evidence.

- [ ] **Step 5: Perform online HTTP and browser acceptance**

Verify HTTP `200` for the Hub, editor, `levels/index.json`, default level, current new levels, video and captions; verify `404` for removed stale levels and `_Trash`. In a fresh browser context, repeat last-open, grass, WebGL 3D, AI generation, pass-rate display, full playthrough, and 390×844 checks with zero browser errors.

- [ ] **Step 6: Update long-term memory**

Update:

```text
C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md
C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md
```

Record the final commit SHA, Pages workflow ID, test counts, current 23-level catalog, Unity path migration, grass constants, fill/pass-rate/last-open behavior, and LAN trash verification. Do not record the workbench password or any credential.
