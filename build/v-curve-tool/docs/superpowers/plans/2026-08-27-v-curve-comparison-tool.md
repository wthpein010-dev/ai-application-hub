# V Curve Comparison Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file offline web tool that imports the current Paws `EditorLevels` folder and generates a visually verified V-curve comparison against the bundled Sheep 900121 structure.

**Architecture:** Normalize Paws and Sheep inputs into one tile model, run runtime-aligned structure and Monte Carlo analysis inside an inline Web Worker, then draw synchronized Canvas charts and a deterministic comparison report in the main thread. Vite builds the modular source into one self-contained HTML file.

**Tech Stack:** Vanilla JavaScript, Vite, `vite-plugin-singlefile`, Vitest, Canvas 2D, inline Vite Worker, `html2canvas`.

**Spec:** `docs/superpowers/specs/2026-08-27-v-curve-comparison-tool-design.md`

## Global Constraints

- Runtime output is exactly one offline file: `dist/V曲线对比工具.html`.
- Do not modify `E:\Mahjong\PawsHomeClient` or imported level files.
- Paws availability uses any positive upper-layer footprint overlap plus same-layer side lock at x±8.
- Sheep 900121 is structure-only and is simulated with the Paws pair-and-tray rules.
- River curves are labeled empirical envelopes; E[V] is labeled a cover-DAG reference that ignores side lock and legal-order constraints.
- Default analysis is 300 seeds, one tray slot, greedy policy, 20 river restarts.
- All runtime dependencies and Sheep data must be inlined; no CDN or network request is allowed.
- `_Trash`, `.meta`, malformed JSON, odd random groups, and unsupported special mechanics must be reported explicitly.

---

### Task 1: Project scaffold and input normalization

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/styles.css`
- Create: `src/data/sheep-900121.json`
- Create: `src/model/normalize.js`
- Create: `tests/model/normalize.test.js`
- Create: `tests/fixtures/paws-small.json`

**Interfaces:**
- Consumes: Paws JSON text and bundled Sheep 900121 object.
- Produces: `normalizePawsLevel(raw, sourceFile)`, `normalizeSheepLevel(raw)`, and `parseDesignerRules(note)` returning the normalized model from the spec.

- [ ] **Step 1: Add the failing normalization tests and exact fixture**

```js
import { describe, expect, it } from "vitest";
import { normalizePawsLevel, normalizeSheepLevel } from "../../src/model/normalize.js";
import pawsSmall from "../fixtures/paws-small.json";

describe("level normalization", () => {
  it("reads Paws rules from designerNote", () => {
    const level = normalizePawsLevel(pawsSmall, "level_0020.json");
    expect(level.tiles).toHaveLength(4);
    expect(level.rules).toMatchObject({
      gameLevelOrder: 2,
      limitedTypeMax: 4,
      fullTypeMin: 1,
      fullTypeMax: 15,
    });
  });

  it("flattens Sheep layer dictionaries", () => {
    const level = normalizeSheepLevel({
      levelKey: 900121,
      blockTypeData: { 1: 1, 2: 1 },
      levelData: {
        1: [{ rolNum: 0, rowNum: 0, layerNum: 1, type: 0 }],
        2: [{ rolNum: 4, rowNum: 4, layerNum: 2, type: 0 }],
      },
    });
    expect(level.tiles.map(({ x, y, layer }) => [x, y, layer])).toEqual([
      [0, 0, 1],
      [4, 4, 2],
    ]);
  });
});
```

Fixture `tests/fixtures/paws-small.json` contains four tiles and a serialized designer note with `gameLevelOrder=2`, `blockTypeCount=4`, and `fullRandomTypeMin/fullRandomTypeMax=1/15`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/model/normalize.test.js`

Expected: FAIL because `src/model/normalize.js` does not exist.

- [ ] **Step 3: Implement strict normalization**

```js
export function parseDesignerRules(note = "") {
  let data = {};
  try { data = note ? JSON.parse(note) : {}; } catch { data = {}; }
  return {
    gameLevelOrder: finiteInt(data.gameLevelOrder, 2),
    limitedTypeMax: clamp(finiteInt(data.blockTypeCount, 8), 1, 32),
    fullTypeMin: clamp(finiteInt(data.fullRandomTypeMin, 1), 1, 32),
    fullTypeMax: clamp(finiteInt(data.fullRandomTypeMax, 32), 1, 32),
    pseudoRandomLimitedMode: clamp(finiteInt(data.pseudoRandomLimitedMode, 0), 0, 2),
    pseudoRandomFullMode: clamp(finiteInt(data.pseudoRandomFullMode, 0), 0, 2),
  };
}
```

Normalize all tile numeric fields, attach stable numeric IDs, reject an empty tile array, and add warnings for duplicate `(x,y,layer)`, malformed designer notes, odd random groups, non-zero `metaType`, or dynamic types ≥1001.

- [ ] **Step 4: Copy the provided Sheep asset and assert its real counts**

Extract `900121.json` from `C:\Users\ASUS\Downloads\归档.zip` into `src/data/sheep-900121.json`, then add assertions that normalization returns 258 tiles, 23 distinct layers, and a 15-type baseline.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- tests/model/normalize.test.js`

Expected: all normalization tests PASS.

- [ ] **Step 6: Commit the independently working parser**

```powershell
git add package.json vite.config.js index.html src tests
git commit -m "feat: normalize Paws and Sheep level data"
```

### Task 2: Runtime-aligned structure engine and E[V]

**Files:**
- Create: `src/analysis/structure.js`
- Create: `src/analysis/expected-v.js`
- Create: `tests/analysis/structure.test.js`
- Create: `tests/analysis/expected-v.test.js`

**Interfaces:**
- Consumes: normalized `level.tiles`.
- Produces: `buildStructure(tiles)`, `createBoardState(structure)`, `availableIds(structure, state)`, `removeFromBoard(state, ids)`, `computeExpectedV(structure)`.

- [ ] **Step 1: Write failing runtime-parity tests**

```js
it("treats any positive upper overlap as coverage", () => {
  const s = buildStructure([
    tile(0, 0, 0, 1),
    tile(1, 7, 7, 2),
  ]);
  expect(availableIds(s, createBoardState(s))).toEqual([1]);
});

it("side-locks a tile with live neighbors at x plus/minus 8", () => {
  const s = buildStructure([
    tile(0, 0, 0, 1),
    tile(1, 8, 0, 1),
    tile(2, 16, 0, 1),
  ]);
  expect(availableIds(s, createBoardState(s))).toEqual([0, 2]);
});

it("unlocks the middle tile after either side is removed", () => {
  const s = buildStructure([
    tile(0, 0, 0, 1),
    tile(1, 8, 0, 1),
    tile(2, 16, 0, 1),
  ]);
  const state = createBoardState(s);
  removeFromBoard(state, [0]);
  expect(availableIds(s, state)).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run structure tests and verify RED**

Run: `npm test -- tests/analysis/structure.test.js`

Expected: FAIL because the structure engine is missing.

- [ ] **Step 3: Implement graph construction and availability**

Build `upperByTile`, `childrenByTile`, `leftNeighbor`, and `rightNeighbor`. Two 8×8 footprints overlap when both axis overlap lengths are greater than zero. A live tile is available when its upper-live count is zero and not both side neighbors are live.

```js
export function isAvailable(structure, state, id) {
  return state.status[id] === BOARD &&
    state.upperLiveCount[id] === 0 &&
    !(isBoard(state, structure.leftNeighbor[id]) &&
      isBoard(state, structure.rightNeighbor[id]));
}
```

- [ ] **Step 4: Add failing E[V] tests on independent and stacked tiles**

```js
it("returns N-m for independent tiles", () => {
  const s = buildStructure([tile(0, 0, 0, 1), tile(1, 16, 0, 1)]);
  expect(computeExpectedV(s).map((p) => p.y)).toEqual([2, 1, 0]);
});
```

- [ ] **Step 5: Implement ancestor closure and stable log-combinations**

Use `Set` union in descending layer order for N≤370, histogram ancestor counts, precompute log-factorials, and return one point for every `m=0..N`. Set final y to zero and sanitize subnormal rounding.

- [ ] **Step 6: Run structure and E[V] tests**

Run: `npm test -- tests/analysis/structure.test.js tests/analysis/expected-v.test.js`

Expected: all tests PASS with no `NaN`.

- [ ] **Step 7: Commit the structure engine**

```powershell
git add src/analysis tests/analysis
git commit -m "feat: model runtime V and theoretical expected V"
```

### Task 3: Deterministic deals, Monte Carlo band, and empirical river

**Files:**
- Create: `src/analysis/random.js`
- Create: `src/analysis/deal.js`
- Create: `src/analysis/simulate.js`
- Create: `src/analysis/river.js`
- Create: `tests/analysis/deal.test.js`
- Create: `tests/analysis/simulate.test.js`
- Create: `tests/analysis/river.test.js`

**Interfaces:**
- Consumes: normalized level, structure, `{ seeds, traySlots, policy, riverRestarts }`.
- Produces: `assignTypes(level, seed)`, `simulateOnce(level, structure, options, seed)`, `monteCarloBand(...)`, and `empiricalRiver(structure, restarts)`.

- [ ] **Step 1: Write failing deterministic deal tests**

```js
it("keeps fixed types and pairs type 0 and -1 groups separately", () => {
  const types = assignTypes(levelWithTypes([3, 3, 0, 0, -1, -1]), 42);
  expect(types.slice(0, 2)).toEqual([3, 3]);
  expect(types[2]).toBe(types[3]);
  expect(types[4]).toBe(types[5]);
  expect(types).toEqual(assignTypes(levelWithTypes([3, 3, 0, 0, -1, -1]), 42));
});
```

- [ ] **Step 2: Run deal tests and verify RED**

Run: `npm test -- tests/analysis/deal.test.js`

Expected: FAIL because the deal module is missing.

- [ ] **Step 3: Implement seeded RNG and type assignment**

Use Mulberry32 with Fisher-Yates shuffling. Build an even paired type pool for each random group, shuffle the pool, and assign by stable tile index. Return `{ valid:false, reason }` for odd group counts rather than inventing a match.

- [ ] **Step 4: Write failing tray and deadlock simulation tests**

```js
it("stashes one unmatched tile without advancing cleared progress", () => {
  const result = simulateOnce(unmatchedThenPairLevel(), structure, {
    traySlots: 1,
    policy: "greedy",
  }, 7);
  expect(result.trace[1].removed).toBe(result.trace[0].removed);
  expect(result.trace[1].trayCount).toBe(1);
});
```

- [ ] **Step 5: Implement one simulation and quantile aggregation**

At each action, group available board and tray tiles by type. Greedy candidates are scored by exact post-action V with stable UID tie-breaking; random policy uses the seeded RNG. Aggregate the latest V at each removed count, then produce P10/P50/P90 only where at least `max(3, ceil(seeds*0.05))` samples exist.

- [ ] **Step 6: Write failing river tests and implement pair-search restarts**

```js
it("reports a no-slot narrow neck when only one tile remains available", () => {
  const river = empiricalRiver(singleFrontStructure(), 20);
  expect(river.lowerDeadlocks).toBeGreaterThan(0);
  expect(river.lower.at(-1).y).toBe(1);
});
```

Evaluate all pairs when V≤24; above that, evaluate pairs among the 16 most promising single-tile gains. Use deterministic jitter only for tie diversification. Combine run-wise maxima/minima by removed count and retain deadlock counts/end progress.

- [ ] **Step 7: Run all stochastic tests twice**

Run twice: `npm test -- tests/analysis/deal.test.js tests/analysis/simulate.test.js tests/analysis/river.test.js`

Expected: both runs PASS and produce byte-identical serialized results.

- [ ] **Step 8: Commit analysis simulation**

```powershell
git add src/analysis tests/analysis
git commit -m "feat: add deterministic MC bands and empirical river"
```

### Task 4: Report aggregation, diagnostics, and inline worker

**Files:**
- Create: `src/analysis/report.js`
- Create: `src/analysis/diagnostics.js`
- Create: `src/worker/analysis-worker.js`
- Create: `tests/analysis/report.test.js`
- Create: `tests/analysis/diagnostics.test.js`

**Interfaces:**
- Consumes: normalized level and analysis options.
- Produces: `analyzeLevel(level, options, onProgress)`, `compareReports(sheep, paws)`, `diagnoseReport(report)`, worker messages `{ type:"progress"|"result"|"error", requestId, payload }`.

- [ ] **Step 1: Write failing metric extraction tests**

```js
it("returns requested percentile bands at 25 and 50 percent", () => {
  const metrics = summarizeReport(fakeBandReport());
  expect(metrics.mc25).toEqual({ p10: 6, p50: 8, p90: 10 });
  expect(metrics.mc50).toEqual({ p10: 4, p50: 6, p90: 8 });
});
```

- [ ] **Step 2: Implement phase aggregation and progress callbacks**

Emit progress after structure, E[V], river, MC, metrics, and diagnostics. Report objects include `schemaVersion:"vcurve-report/1"`, normalized options, curve arrays, metrics, warnings, diagnostics, and `modelNotes` strings copied from the spec.

- [ ] **Step 3: Write failing diagnosis tests and implement numeric rules**

```js
it("detects an early dive using measured percentages", () => {
  const notes = diagnoseReport(reportWithP50([[0, 24], [0.2, 10], [0.5, 9]]));
  expect(notes.some((n) => n.code === "early-dive" && n.severity === "warning")).toBe(true);
});
```

Rules use actual opening, 20%, 40%, 60%, plateau duration, and minimum values; every displayed sentence interpolates those values.

- [ ] **Step 4: Implement request-isolated worker messages**

The worker accepts `{ type:"analyze", requestId, level, baseline, options }`, analyzes Sheep and Paws sequentially while emitting side-tagged progress, and returns one comparison payload. Cancellation records request IDs and prevents further posts. Errors serialize name/message without stack paths.

- [ ] **Step 5: Run report tests**

Run: `npm test -- tests/analysis/report.test.js tests/analysis/diagnostics.test.js`

Expected: PASS with JSON serialization free of `NaN`, `Infinity`, or functions.

- [ ] **Step 6: Commit report orchestration**

```powershell
git add src/analysis src/worker tests/analysis
git commit -m "feat: aggregate V-curve comparison reports"
```

### Task 5: First meaningful dashboard preview and chart rendering

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Create: `src/app.js`
- Create: `src/ui/chart.js`
- Create: `src/ui/report-view.js`
- Create: `src/ui/state.js`
- Create: `tests/ui/chart.test.js`

**Interfaces:**
- Consumes: comparison report and app state.
- Produces: `VChart(canvas, options)`, `renderComparison(root, comparison)`, user-visible import/controls/report states.

- [ ] **Step 1: Write chart geometry tests before drawing code**

```js
it("uses the same y maximum for Sheep and Paws charts", () => {
  const scales = createComparisonScales(sheepSeries, pawsSeries, 900, 360);
  expect(scales.sheep.yMax).toBe(scales.paws.yMax);
});
```

- [ ] **Step 2: Build the recognizable first viewport**

Create the dark header, folder import card, path hint, controls, two empty chart panels, metrics table shell, and method note. Use concrete Sheep 900121 and Paws wording rather than starter content. Add accessible labels and visible keyboard focus.

- [ ] **Step 3: Start the retained dev server and verify the first route**

Run: `npm run dev -- --host 127.0.0.1`

Request the exact printed URL once and require HTTP 200. Open that URL in the Codex panel only after the meaningful dashboard viewport exists.

- [ ] **Step 4: Implement Canvas charts**

Draw shared grid/axes, normalized percentage x ticks, common y ticks, six legend items, anti-aliased line paths, and a vertical hover guide. HiDPI canvas size follows `devicePixelRatio`; `ResizeObserver` redraws without changing report data.

- [ ] **Step 5: Implement report cards and responsive layout**

Desktop ≥1100px uses side-by-side charts. Below 1100px charts stack. Metrics table horizontally scrolls only below 760px. Diagnostic cards show severity, numeric evidence, and concise suggested structural action.

- [ ] **Step 6: Run unit and build checks**

Run: `npm test -- tests/ui/chart.test.js`

Run: `npm run build`

Expected: tests PASS and the build has no unresolved asset or worker imports.

- [ ] **Step 7: Commit the visual report surface**

```powershell
git add index.html src/styles.css src/app.js src/ui tests/ui
git commit -m "feat: render V-curve comparison dashboard"
```

### Task 6: Folder import, worker lifecycle, and exports

**Files:**
- Create: `src/io/import-levels.js`
- Create: `src/io/export-report.js`
- Modify: `src/app.js`
- Modify: `src/ui/report-view.js`
- Create: `tests/io/import-levels.test.js`
- Create: `tests/io/export-report.test.js`

**Interfaces:**
- Consumes: `FileList`, normalized reports, `#report` element.
- Produces: `importLevelFiles(files)`, `downloadReportJson(comparison)`, `downloadReportPng(element, filename)`.

- [ ] **Step 1: Write failing folder filter tests**

```js
it("ignores meta files and every file under _Trash", async () => {
  const result = await importLevelFiles([
    fakeFile("level_0001.json", validJson, "EditorLevels/level_0001.json"),
    fakeFile("level_0001.json.meta", "x", "EditorLevels/level_0001.json.meta"),
    fakeFile("old.json", validJson, "EditorLevels/_Trash/old.json"),
  ]);
  expect(result.levels).toHaveLength(1);
  expect(result.ignored).toHaveLength(2);
});
```

- [ ] **Step 2: Implement batch import and selection rules**

Read valid files concurrently, preserve per-file errors, sort by level ID then filename, choose `level_0020` when present or the level with the most tiles otherwise, and update imported/ignored/warning counts.

- [ ] **Step 3: Wire one active worker request at a time**

Switching level or options cancels the old request, increments `requestId`, and ignores stale progress/results. Preserve the last valid report during recalculation. Disable export while no valid report exists.

- [ ] **Step 4: Write export tests and implement safe JSON output**

```js
it("serializes finite report data with the schema version", () => {
  const text = serializeReportJson(validComparison);
  expect(JSON.parse(text).schemaVersion).toBe("vcurve-comparison/1");
  expect(text).not.toMatch(/NaN|Infinity/);
});
```

PNG export uses `html2canvas(reportElement, { backgroundColor:"#11141b", scale:2 })`; both downloads use sanitized filenames containing `900121-vs-<level-id>`.

- [ ] **Step 5: Run IO tests and full unit suite**

Run: `npm test -- tests/io/import-levels.test.js tests/io/export-report.test.js`

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit complete interaction flow**

```powershell
git add src/io src/app.js src/ui tests/io
git commit -m "feat: import EditorLevels and export comparison reports"
```

### Task 7: Real-data, single-file, and visual completion audit

**Files:**
- Create: `scripts/verify-real-levels.mjs`
- Create: `scripts/verify-dist.mjs`
- Create: `README.md`
- Modify: `package.json`
- Modify: `vite.config.js`
- Test: `E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\EditorLevels`
- Test: `dist/V曲线对比工具.html`

**Interfaces:**
- Consumes: real EditorLevels directory and built HTML.
- Produces: a verified single-file artifact, validation summary, screenshots, and user instructions.

- [ ] **Step 1: Add real-data verifier**

The script imports the same parser/analysis modules and asserts:

```js
assert.equal(levels.length, 25);
assert.deepEqual(sheepSummary, { tiles: 258, layers: 23, types: 15 });
assert.deepEqual(level20Summary, {
  tiles: 280,
  layers: 22,
  fullTypeMin: 1,
  fullTypeMax: 15,
});
```

It analyzes current level 20 with 300 seeds and fails if any curve/table field is missing or non-finite.

- [ ] **Step 2: Build and verify a truly self-contained file**

Run: `npm run build`

Run: `node scripts/verify-dist.mjs`

The verifier asserts that the dist directory contains only `V曲线对比工具.html`, that it contains inlined Sheep data and worker code, and that it has no `http://`, `https://`, external `src=`, or external stylesheet reference.

- [ ] **Step 3: Test the final file without the dev server**

Open the absolute `file:///.../dist/V曲线对比工具.html`, select the real `EditorLevels` folder, select `level_0020`, run 300 seeds, and verify the report displays 25 imported levels, Sheep 258/23/15, and Paws 280/22/1–15.

- [ ] **Step 4: Perform visual QA at all required sizes**

Inspect 2048×1180, 1440×900, and 750×1624. Save screenshots under `artifacts/visual/`. Compare with the reference for dark contrast, dual chart alignment, legend readability, table hierarchy, no overlap, and responsive stacking. Fix concrete defects and rerun build/unit/real-data checks after every patch.

- [ ] **Step 5: Verify PNG and JSON downloads**

Click both export buttons. Reopen the PNG to verify both charts, table, notes, and diagnosis are visible at 2× resolution. Parse the JSON and verify schema/version, options, curves, metrics, and diagnostics.

- [ ] **Step 6: Write concise user instructions**

README covers: double-click the final HTML, choose the specified folder, select a level, wait for analysis, adjust seeds/slots/policy, and export. It also explains the current runtime V definition and the empirical/theoretical caveats.

- [ ] **Step 7: Run the completion suite**

Run: `npm test`

Run: `npm run verify:real`

Run: `npm run build`

Run: `npm run verify:dist`

Expected: every command exits 0; visual and export checks are complete; no console error appears in the final file.

- [ ] **Step 8: Commit the verified deliverable**

```powershell
git add README.md package.json vite.config.js scripts dist artifacts docs
git commit -m "release: deliver offline V-curve comparison tool"
```
