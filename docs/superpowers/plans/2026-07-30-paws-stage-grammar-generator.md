# Paws Stage Grammar Generator v11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Paws v10 dense template replay with a deterministic five-stage tower grammar that learns all active Unity second-round structures, preserves full-random and blind-fill semantics, produces solvable levels without random generation failures, and strengthens blocked-tile contact shadows.

**Architecture:** Extract structural grammar from every active second-round reference into a focused corpus model, compile each AI request into a bounded stage blueprint, then construct coordinates from local tower/platform motifs without any board-wide lattice fallback. Keep `generateAiLevel()` as the public facade and reuse the existing coverage, solver, random assigner, difficulty scorer, views, LAN/static APIs, and publish pipeline.

**Tech Stack:** Browser-native ES modules, Node.js `node:test`, Canvas 2D, Three.js, Playwright, Unity JSON corpus, GitHub Pages.

## Global Constraints

- The board is always `7×8` with grid unit `sheep_7x8_mini8`; legal anchors are `0≤x≤48`, `0≤y≤56`.
- Ordinary generated tiles are exactly `type=-1, moldType=1, presetColorType=1`.
- Blind-fill lower tiles are `type=-1, moldType=1, presetColorType=3`; the explicit top is `type=-1, moldType=2, presetColorType=1`.
- Blind-fill track counts are exactly one of `0`, `2`, or `4`; never `1` or `3`.
- Total tile count is exact and even, effective layer count is exact, and same-layer positive-area overlap is zero.
- For the default 200-tile/15-layer request, the per-layer peak is at most `22`.
- At least 65% of non-thin/non-release layers have `2–4` spatial components; a normal platform component has `3–8` tiles and never exceeds `10`.
- No three consecutive layers may each contain a component holding more than 60% of that layer.
- A valid default level has at least four tower entrances and includes high, medium, and small tower roles.
- Supported inputs generate without seed-dependent errors. Capacity-invalid inputs fail before random construction with exact minimum-layer or maximum-tile guidance.
- Play-mode ordinary blocked tiles use Unity `CoverDimFactor=0.58`; edit mode uses `0.76`; blind-fill backs do not receive a duplicate ordinary black overlay.
- Unity `EditorLevels/_Trash` is never read as training data and no Unity JSON is modified.
- The public built-in level catalog remains empty.

---

### Task 1: Extract a Structural Grammar Corpus

**Files:**
- Create: `projects/paws-level-editor/core/structure-corpus.mjs`
- Modify: `projects/paws-level-editor/core/level-statistics.mjs`
- Create: `tests/paws-level-editor-structure-corpus.test.mjs`

**Interfaces:**
- Consumes: normalized level documents from `parseLevelDocument(raw, { fileName })`.
- Produces:
  - `spatialComponents(tiles): Tile[][]`
  - `extractStructureGrammar(document): StructureGrammar`
  - `mergeStructureGrammars(grammars): StructureCorpus`
  - `topologyHash({ tiles, stagePlan, fillTracks }): string`
  - `extractLevelStatistics(document).structureGrammar`
  - `mergeLevelStatistics(samples).structureCorpus`

- [ ] **Step 1: Write failing component, transition, tower, and topology tests**

```js
import {
  extractStructureGrammar,
  spatialComponents,
  topologyHash,
} from "../projects/paws-level-editor/core/structure-corpus.mjs";

test("spatial components use a four-microcell maximum footprint gap", () => {
  const layer = [
    tile("a", 0, 0, 1),
    tile("b", 12, 0, 1),
    tile("c", 32, 0, 1),
  ];
  assert.deepEqual(
    spatialComponents(layer).map((component) => component.map(({ uid }) => uid)),
    [["a", "b"], ["c"]],
  );
});

test("grammar records split/merge transitions and adjacent-layer tower chains", () => {
  const grammar = extractStructureGrammar(makeDocument([
    tile("base-a", 0, 0, 1),
    tile("base-b", 24, 0, 1),
    tile("upper-a", 4, 0, 2),
    tile("upper-b", 28, 0, 2),
    tile("top-a", 6, 0, 3),
  ]));
  assert.equal(grammar.layerRoles.length, 3);
  assert.equal(grammar.layerTransitions.length, 2);
  assert.equal(grammar.towerChains.some(({ depth }) => depth === 3), true);
});

test("topology hash ignores uid and pattern-only changes", () => {
  assert.equal(topologyHash(first), topologyHash(patternAndUidOnlyChange));
  assert.notEqual(topologyHash(first), topologyHash(movedPlatform));
});
```

- [ ] **Step 2: Run the focused test and verify module-not-found failure**

Run:

```powershell
node --test tests/paws-level-editor-structure-corpus.test.mjs
```

Expected: FAIL because `core/structure-corpus.mjs` does not exist.

- [ ] **Step 3: Implement spatial components and adjacent-layer transitions**

```js
const TILE_SIZE = 8;
const MAX_COMPONENT_GAP = 4;

function footprintGap(left, right) {
  const gapX = Math.max(0, Math.abs(left.x - right.x) - TILE_SIZE);
  const gapY = Math.max(0, Math.abs(left.y - right.y) - TILE_SIZE);
  return Math.hypot(gapX, gapY);
}

export function spatialComponents(tiles) {
  return connectedComponents(
    [...tiles],
    (left, right) =>
      left.layer === right.layer
      && !overlaps(left, right)
      && footprintGap(left, right) <= MAX_COMPONENT_GAP,
  );
}
```

For every ordered layer, record ordinary/track counts, component sizes, exposed-edge ratio, centroid, boundary ratio, previous/next count delta, and adjacent-layer overlap edges. Build tower chains only from positive-area overlap edges between layer `L` and `L+1`.

- [ ] **Step 4: Implement motif, release, fill-track, and corpus aggregation**

```js
export function extractStructureGrammar(document) {
  const layers = orderedLayers(document.tiles);
  const layerRoles = layers.map(analyzeLayerRole);
  const layerTransitions = adjacentPairs(layers).map(analyzeTransition);
  return {
    sourceFileName: String(document.fileName ?? ""),
    tileCount: document.tiles.length,
    layerCount: layers.length,
    layerRoles,
    layerTransitions,
    towerChains: buildTowerChains(layers, layerTransitions),
    platformMotifs: collectPlatformMotifs(layerRoles),
    releaseMotifs: collectReleaseMotifs(layerRoles, layerTransitions),
    fillTracks: analyzeSemanticFillTracks(document.tiles),
    fullRandomRatio: ratio(document.tiles, ({ type }) => Number(type) === -1),
  };
}
```

`mergeStructureGrammars()` must preserve per-reference families and build categorical distributions instead of averaging coordinates. Add the result to `extractLevelStatistics()` and `mergeLevelStatistics()` without changing existing properties.

- [ ] **Step 5: Add the real Unity corpus gate**

Use `PAWS_EDITOR_LEVELS` and root-only `readdir(..., { withFileTypes: true })`. Assert:

```js
assert.equal(fileNames.length, 16);
assert.deepEqual(
  grammars.map(({ fillTracks }) => fillTracks.length).every((count) =>
    [0, 2, 4].includes(count)),
  true,
);
assert.equal(fileNames.some((name) => /_Trash/i.test(name)), false);
```

- [ ] **Step 6: Run structure and existing statistics tests**

Run:

```powershell
$env:PAWS_EDITOR_LEVELS='E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels'
node --test tests/paws-level-editor-structure-corpus.test.mjs tests/paws-level-editor-ai-generator.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the corpus extractor**

```powershell
git add projects/paws-level-editor/core/structure-corpus.mjs projects/paws-level-editor/core/level-statistics.mjs tests/paws-level-editor-structure-corpus.test.mjs
git commit -m "feat(paws): learn structural grammar from level corpus"
```

### Task 2: Compile Deterministic Five-Stage Blueprints

**Files:**
- Create: `projects/paws-level-editor/core/stage-blueprint.mjs`
- Create: `tests/paws-level-editor-stage-blueprint.test.mjs`
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`

**Interfaces:**
- Consumes: `{ structureCorpus, difficulty, difficultyProfile, layout, tileCount, layerCount, targetScore, seed }`.
- Produces:
  - `layerTileLimit({ tileCount, layerCount, difficulty }): number`
  - `validateBlueprintCapacity(options): { supported, maxTiles, minimumLayers, message }`
  - `buildStageBlueprint(options): StageBlueprint`
- `StageBlueprint` contains `stagePlan`, physical-order `layerPlans`, exact `layerTileCounts`, `towerEntrances`, `fillTrackPlan`, `maxLayerTiles`, `familyIds`, and `topologyFamily`.

- [ ] **Step 1: Write failing default-budget and capacity tests**

```js
test("200/15 compiles the approved five-stage layer and tile budgets", () => {
  const blueprint = buildStageBlueprint(normalOptions({ seed: 20260730 }));
  assert.deepEqual(
    blueprint.stagePlan.map(({ key, layerCount, tileCount }) => [
      key, layerCount, tileCount,
    ]),
    [
      ["surface", 3, 44],
      ["shelter", 2, 30],
      ["middle", 5, 68],
      ["crisis", 3, 40],
      ["release", 2, 18],
    ],
  );
  assert.equal(blueprint.layerTileCounts.reduce((sum, value) => sum + value), 200);
  assert.equal(Math.max(...blueprint.layerTileCounts) <= 22, true);
});

test("capacity errors are deterministic and include exact guidance", () => {
  const gate = validateBlueprintCapacity({
    difficulty: "normal",
    tileCount: 400,
    layerCount: 5,
  });
  assert.equal(gate.supported, false);
  assert.match(gate.message, /至少需要 \d+ 个有效层/);
  assert.equal(gate.minimumLayers > 5, true);
});
```

- [ ] **Step 2: Run the focused test and verify module-not-found failure**

Run:

```powershell
node --test tests/paws-level-editor-stage-blueprint.test.mjs
```

Expected: FAIL because `core/stage-blueprint.mjs` does not exist.

- [ ] **Step 3: Implement stage allocation and the dynamic layer limit**

```js
const STAGES = Object.freeze([
  { key: "surface", layerWeight: 3, tileWeight: 22 },
  { key: "shelter", layerWeight: 2, tileWeight: 15 },
  { key: "middle", layerWeight: 5, tileWeight: 34 },
  { key: "crisis", layerWeight: 3, tileWeight: 20 },
  { key: "release", layerWeight: 2, tileWeight: 9 },
]);

export function layerTileLimit({ tileCount, layerCount, difficulty }) {
  const factor = { easy: 1.45, normal: 1.65, hard: 1.85 }[difficulty];
  return Math.min(56, Math.max(10, Math.ceil(tileCount / layerCount * factor)));
}
```

Allocate stages with largest-remainder arithmetic. For the exact default `normal/200/15`, preserve the approved `3/2/5/3/2` and `44/30/68/40/18` budgets. Allocate physical layers from release at layer 1 through surface at the highest layer.

- [ ] **Step 4: Implement deterministic family, tower, and track planning**

```js
export function buildStageBlueprint(options) {
  const rng = XorShift.fromSeed(options.seed);
  const gate = validateBlueprintCapacity(options);
  if (!gate.supported) throw new RangeError(gate.message);
  const families = rankFamilies(options.structureCorpus, options)
    .slice(0, 4);
  const selected = families[rng.nextInt(0, families.length)];
  return {
    stagePlan: allocateStagePlan(options),
    layerPlans: buildPhysicalLayerPlans(options),
    layerTileCounts: allocateLayerCounts(options),
    towerEntrances: planMixedTowerEntrances(selected, options, rng),
    fillTrackPlan: planFillTracks(selected, options, rng),
    maxLayerTiles: gate.maxLayerTiles,
    familyIds: [selected.sourceFileName],
    topologyFamily: selected.familyKey,
  };
}
```

Track counts come from the selected family and are clamped to the categorical set `[0, 2, 4]`. Tower entrances are 4–6, include `high`, `medium`, and at least two `small` roles, and use mirrored/rotated corpus positions plus bounded jitter.

- [ ] **Step 5: Route target normalization through the capacity gate**

Replace `minimumStructuralLayerCount()`'s pair-only cap with `validateBlueprintCapacity()`. Keep the current public `normalizeGenerationTargets()` result shape and exact even-number adjustment.

- [ ] **Step 6: Run blueprint and target-normalization tests**

Run:

```powershell
node --test tests/paws-level-editor-stage-blueprint.test.mjs tests/paws-level-editor-ai-generator.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit blueprint compilation**

```powershell
git add projects/paws-level-editor/core/stage-blueprint.mjs projects/paws-level-editor/core/ai-level-generator.mjs tests/paws-level-editor-stage-blueprint.test.mjs
git commit -m "feat(paws): compile deterministic stage blueprints"
```

### Task 3: Construct Tower, Platform, Release, and Blind-Fill Geometry

**Files:**
- Create: `projects/paws-level-editor/core/stage-grammar-generator.mjs`
- Create: `tests/paws-level-editor-stage-grammar.test.mjs`
- Modify: `projects/paws-level-editor/core/level-statistics.mjs`

**Interfaces:**
- Consumes: `{ blueprint, structureCorpus, seed }`.
- Produces:
  - `buildStageGrammarGeometry(options): StageGeometry`
  - `measureStageGeometry({ tiles, stagePlan, fillTracks }): StageGeometryMetrics`
- `StageGeometry` contains `tiles`, `fillTracks`, `layerTileCounts`, `towerEntrances`, `motifUses`, `repairLog`, `topologyHash`, and `metrics`.

- [ ] **Step 1: Write failing structural acceptance tests**

```js
test("default geometry is tower-shaped instead of a dense lattice", () => {
  const result = buildStageGrammarGeometry(defaultGeometryOptions());
  assert.equal(result.tiles.length, 200);
  assert.equal(new Set(result.tiles.map(({ layer }) => layer)).size, 15);
  assert.equal(Math.max(...result.layerTileCounts) <= 22, true);
  assert.deepEqual(sameLayerOverlapPairs(result.tiles), []);
  assert.equal(result.metrics.multiComponentLayerRatio >= 0.65, true);
  assert.equal(result.metrics.maximumPlatformSize <= 10, true);
  assert.equal(result.metrics.threeLayerGiantRun, false);
  assert.equal(result.metrics.towerEntranceCount >= 4, true);
  assert.equal(result.metrics.releaseDependencyDrop > 0, true);
});

test("fill tracks preserve Unity shortcut 3 semantics", () => {
  for (const trackCount of [0, 2, 4]) {
    const result = buildStageGrammarGeometry(
      optionsWithTrackFamily(trackCount),
    );
    assert.equal(result.fillTracks.length, trackCount);
    assert.equal(
      result.tiles.filter(({ presetColorType }) => presetColorType === 3).length,
      result.fillTracks.reduce((sum, track) => sum + track.lowerDepth, 0),
    );
    assert.equal(
      result.tiles.filter(({ moldType }) => moldType === 2).length,
      trackCount,
    );
  }
});
```

- [ ] **Step 2: Run the focused test and verify module-not-found failure**

Run:

```powershell
node --test tests/paws-level-editor-stage-grammar.test.mjs
```

Expected: FAIL because `core/stage-grammar-generator.mjs` does not exist.

- [ ] **Step 3: Implement blind-track reservation**

Build every track before ordinary motifs. Resample relative depth to the target layer count, preserve a one-microcell maximum delta per layer, mirror direction through the blueprint RNG, and reserve anchors in `occupiedByLayer`.

```js
function semanticTrackTile(anchor, { top }) {
  return {
    x: anchor.x,
    y: anchor.y,
    layer: anchor.layer,
    type: -1,
    moldType: top ? 2 : 1,
    metaType: 0,
    metaData: 0,
    presetColorType: top ? 1 : 3,
  };
}
```

- [ ] **Step 4: Implement local motif placement without lattice fallback**

Represent motifs as small relative anchor sets:

```js
const MOTIFS = Object.freeze({
  island3: [[0, 0], [8, 0], [4, 12]],
  stair4: [[0, 0], [8, 0], [4, 10], [12, 10]],
  crossGap6: [[0, 0], [16, 0], [0, 16], [16, 16], [8, -8], [8, 24]],
  split8: [[0, 0], [8, 0], [0, 8], [8, 8], [28, 0], [36, 0], [28, 8], [36, 8]],
});
```

Transform a motif only by mirror, quarter-turn, and legal microgrid translation. Rank candidates by tower-role distance, desired upper overlap, exposed boundary, parent reuse, and stage role. Reject candidates that overlap same-layer reservations, exceed component size 10, or create a third consecutive giant layer.

- [ ] **Step 5: Implement deterministic budget repair**

When a layer lacks capacity:

1. Try every remaining motif transform in deterministic score order.
2. Reduce the largest optional motif in that layer and transfer the exact deficit to the nearest stage-compatible layer below its cap.
3. Switch to the next ranked corpus family.
4. If all families fail, use the built-in sparse motif library above; never scan a full-board lattice by distance.

Record each action in `repairLog`. Exact total and exact effective layer count must remain unchanged.

- [ ] **Step 6: Implement stage metrics and topology hashing**

`measureStageGeometry()` must return:

```js
{
  layerTileCounts,
  multiComponentLayerRatio,
  maximumPlatformSize,
  maximumComponentShareByLayer,
  threeLayerGiantRun,
  towerEntranceCount,
  towerRoleCounts,
  maximumTowerDepth,
  releaseDependencyDrop,
  boundaryRatio,
}
```

Reuse the same component and tower definitions as Task 1. Add the metrics to `extractLevelStatistics()` so generator gates and proof artifacts share one definition.

- [ ] **Step 7: Run geometry, corpus, and overlap tests**

Run:

```powershell
node --test tests/paws-level-editor-stage-grammar.test.mjs tests/paws-level-editor-structure-corpus.test.mjs tests/paws-level-editor-template-motif.test.mjs
```

Expected: PASS. Update v10-only template tests to assert v11 no longer calls the lattice fallback rather than deleting coverage.

- [ ] **Step 8: Commit the stage grammar**

```powershell
git add projects/paws-level-editor/core/stage-grammar-generator.mjs projects/paws-level-editor/core/level-statistics.mjs tests/paws-level-editor-stage-grammar.test.mjs tests/paws-level-editor-template-motif.test.mjs
git commit -m "feat(paws): generate sparse five-stage tower geometry"
```

### Task 4: Integrate v11 and Guarantee a Solvable Random Assignment

**Files:**
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Modify: `projects/paws-level-editor/core/random-assigner.mjs`
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`

**Interfaces:**
- Consumes: Task 2 `buildStageBlueprint()` and Task 3 `buildStageGrammarGeometry()`.
- Produces:
  - algorithm version `paws-local-stat-v11-stage-grammar`
  - `assignSolvableRandomTypes(tiles, options): Tile[]`
  - enriched `designerNote.aiGeneration.blueprint`, `structure`, `templateLearning`, and `solver`

- [ ] **Step 1: Write failing v11 integration and bounded fallback tests**

```js
test("AI facade returns v11 geometry with Unity random semantics", () => {
  const generated = generateAiLevel(defaultRequest({ maxAttempts: 1 }));
  const ai = generated.document.designerNote.aiGeneration;
  assert.equal(ai.algorithmVersion, "paws-local-stat-v11-stage-grammar");
  assert.equal(generated.document.tiles.every(({ type }) => type === -1), true);
  assert.equal(ai.blueprint.stagePlan.length, 5);
  assert.equal(ai.structure.towerEntranceCount >= 4, true);
  assert.equal(solveLevel(generated.document).solvable, true);
});

test("move-order fallback is bounded and solvable", () => {
  const assigned = assignSolvableRandomTypes(tiles, {
    seed: 7,
    fullTypeMin: 1,
    fullTypeMax: 15,
    solvableMoves,
    isSolvable: (candidate) => solveLevel({ tiles: candidate }).solvable,
  });
  assert.equal(typeCounts(assigned).every((count) => count % 2 === 0), true);
  assert.equal(solveLevel({ tiles: assigned }).solvable, true);
});
```

- [ ] **Step 2: Run focused tests and verify version/fallback failures**

Run:

```powershell
node --test tests/paws-level-editor-ai-generator.test.mjs
```

Expected: FAIL on v10 version and missing `assignSolvableRandomTypes`.

- [ ] **Step 3: Replace v10 coordinate selection in `buildDocument()`**

```js
const blueprint = buildStageBlueprint({
  structureCorpus: learned.structureCorpus,
  difficulty,
  difficultyProfile: profile,
  layout,
  tileCount,
  layerCount,
  targetScore: target.score,
  seed,
});
const generatedGeometry = buildStageGrammarGeometry({
  blueprint,
  structureCorpus: learned.structureCorpus,
  seed,
});
const tiles = generatedGeometry.tiles;
```

Remove `buildTemplateMotifGeometry()` from the final-coordinate path. Preserve its old metadata only when opening legacy v10 documents.

- [ ] **Step 4: Enforce complete structural issues**

Restore `generatedStructureIssues()` gates for:

- initial accessible entry count by difficulty
- per-layer limit
- multi-component ratio
- maximum platform size
- three-layer giant run
- mixed tower roles and minimum tower entrances
- positive release dependency drop
- exact track count and top semantics

Return specific issue text in `aiGeneration.rejections`; do not silently accept a dense geometry because its difficulty score is close.

- [ ] **Step 5: Implement the bounded random fallback**

Export `assignSolvableRandomTypes()` from `random-assigner.mjs`. Try:

1. direct `assignGroupFromMoves`
2. reverse move order
3. alternating outside-in move order
4. alternating inside-out move order
5. final direct pair-index mapping along the verified moves

All mappings use the seeded type pool and assign each type exactly twice per pair. If the verified move list does not cover every random tile, throw a deterministic invariant error; do not start random retries.

- [ ] **Step 6: Store blueprint, metrics, source families, and recommended seed**

The v11 metadata must include:

```js
aiGeneration: {
  algorithmVersion: "paws-local-stat-v11-stage-grammar",
  seed: unsignedSeed,
  blueprint,
  structure: generatedGeometry.metrics,
  templateLearning: {
    sourceFileNames: blueprint.familyIds,
    fillTrackCount: generatedGeometry.fillTracks.length,
    fillTracks: generatedGeometry.fillTracks,
    motifUses: generatedGeometry.motifUses,
    repairLog: generatedGeometry.repairLog,
    topologyHash: generatedGeometry.topologyHash,
    fullRandomRatio: 1,
  },
  solver: {
    solvable: true,
    recommendedPlaySeed: attemptSeed >>> 0,
  },
}
```

- [ ] **Step 7: Run generator, assigner, solver, difficulty, and play tests**

Run:

```powershell
node --test tests/paws-level-editor-ai-generator.test.mjs tests/paws-level-editor-play-engine.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit v11 integration**

```powershell
git add projects/paws-level-editor/core/ai-level-generator.mjs projects/paws-level-editor/core/random-assigner.mjs tests/paws-level-editor-ai-generator.test.mjs
git commit -m "feat(paws): integrate solvable stage grammar generation"
```

### Task 5: Surface Deterministic Capacity Guidance in the AI Dialog

**Files:**
- Modify: `projects/paws-level-editor/ui/ai-level-dialog.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `tests/paws-level-editor-ai-controller.test.mjs`
- Modify: `tests/paws-level-editor-browser-smoke.mjs`

**Interfaces:**
- Consumes: `validateBlueprintCapacity()` from Task 2.
- Produces: normalized dialog options with `capacity`, exact inline guidance, and no save attempt for invalid requests.

- [ ] **Step 1: Write failing preflight and no-save tests**

```js
test("dialog rejects capacity-invalid options before generation", () => {
  assert.throws(
    () => normalizeGenerationOptions(form({
      difficulty: "normal",
      tileCount: 400,
      layerCount: 5,
    })),
    /至少需要 \d+ 个有效层/,
  );
});

test("capacity rejection does not save an AI level", async () => {
  await controller.generateAiLevelFromDialog(invalidCapacityOptions);
  assert.equal(api.saveCalls.length, 0);
  assert.match(elements.aiLevelError.textContent, /当前 5 层最多/);
});
```

- [ ] **Step 2: Run dialog tests and verify generic-message failure**

Run:

```powershell
node --test tests/paws-level-editor-ai-controller.test.mjs tests/paws-level-editor-controller-race.test.mjs
```

Expected: FAIL because the dialog still delegates to the old structural minimum message.

- [ ] **Step 3: Add shared preflight to normalization and hints**

Call `validateBlueprintCapacity()` after even-number adjustment. `describeGenerationOptions()` must append one of:

```text
当前组合可生成；标准档单层上限 22 张。
400 张至少需要 12 个有效层；当前 5 层最多 170 张。
```

Use the exact returned numbers. Keep only the existing difficulty/layout/reference controls; add no new options.

- [ ] **Step 4: Keep generation failures actionable**

In `generateAiLevelFromDialog()`, distinguish:

- `RangeError` capacity guidance: show inline, no save.
- invariant error: show “结构门禁异常” with the first exact issue.
- network/auth save error: retain the existing write-auth flow.

- [ ] **Step 5: Extend browser smoke for valid and invalid paths**

In the browser smoke:

1. enter `400/5`, click generate, assert guidance and zero new catalog entries;
2. enter `200/15`, generate, assert v11 metadata, exact count/layers, peak ≤22, and no error text.

- [ ] **Step 6: Run dialog and browser smoke tests**

Run:

```powershell
node --test tests/paws-level-editor-ai-controller.test.mjs tests/paws-level-editor-controller-race.test.mjs
npm run test:paws-browser
```

Expected: PASS.

- [ ] **Step 7: Commit capacity guidance**

```powershell
git add projects/paws-level-editor/ui/ai-level-dialog.mjs projects/paws-level-editor/ui/workbench-controller.mjs tests/paws-level-editor-ai-controller.test.mjs tests/paws-level-editor-browser-smoke.mjs
git commit -m "feat(paws): explain AI generation capacity before build"
```

### Task 6: Add Localized Blocked-Tile Contact Shadows

**Files:**
- Modify: `projects/paws-level-editor/core/coverage.mjs`
- Modify: `projects/paws-level-editor/core/view-model.mjs`
- Modify: `projects/paws-level-editor/core/tile-visual-tone.mjs`
- Modify: `projects/paws-level-editor/views/canvas-2d.mjs`
- Modify: `projects/paws-level-editor/views/three-3d.mjs`
- Modify: `tests/paws-level-editor-blocked-visual.test.mjs`
- Modify: `tests/paws-level-editor-editor-geometry.test.mjs`

**Interfaces:**
- Produces `coverage.get(uid).occlusionPatches`, an array of tile-local `{ x, y, width, height, dx, dy }`.
- `deriveDisplayTiles()` and `buildRenderTiles()` preserve `occlusionPatches`.
- `resolveTileVisualTone()` keeps existing factors and returns `contactShadowAlpha`.

- [ ] **Step 1: Write failing overlap-patch and tone tests**

```js
test("coverage returns tile-local patches for actual upper overlap", () => {
  const coverage = computeCoverage([
    tile("lower", 0, 0, 1),
    tile("upper", 4, 2, 2),
  ]);
  assert.deepEqual(coverage.get("lower").occlusionPatches, [{
    x: 4, y: 2, width: 4, height: 6, dx: 4, dy: 2,
  }]);
});

test("play blocked tone preserves 0.58 and adds contact shadow", () => {
  assert.deepEqual(
    resolveTileVisualTone({ covered: true }, { mode: "play" }),
    {
      blocked: true,
      factor: 0.58,
      overlayAlpha: 0.42,
      innerShadowAlpha: 0.34,
      contactShadowAlpha: 0.3,
    },
  );
});
```

- [ ] **Step 2: Run visual core tests and verify missing-patch failure**

Run:

```powershell
node --test tests/paws-level-editor-blocked-visual.test.mjs tests/paws-level-editor-editor-geometry.test.mjs
```

Expected: FAIL because `occlusionPatches` and `contactShadowAlpha` are absent.

- [ ] **Step 3: Compute and propagate overlap patches**

```js
function overlapPatch(lower, upper) {
  const left = Math.max(lower.x, upper.x);
  const top = Math.max(lower.y, upper.y);
  const right = Math.min(lower.x + 8, upper.x + 8);
  const bottom = Math.min(lower.y + 8, upper.y + 8);
  if (right <= left || bottom <= top) return null;
  return {
    x: left - lower.x,
    y: top - lower.y,
    width: right - left,
    height: bottom - top,
    dx: upper.x - lower.x,
    dy: upper.y - lower.y,
  };
}
```

Add patches only for active higher tiles. Removed/tray tiles produce none.

- [ ] **Step 4: Draw localized 2D contact shadows**

After the existing 42% overlay and inner stroke, scale each patch by `viewport.scale`, clip it to the rounded tile face, and draw a directional gradient from `contactShadowAlpha` to zero along `dx/dy`. Blind-fill backs with `overlayAlpha=0` still skip the ordinary overlay; they may receive the existing lock-mask presentation only.

- [ ] **Step 5: Calibrate Three.js real shadows without coplanar overlays**

Set:

```js
this.keyLight.shadow.bias = -0.0002;
this.keyLight.shadow.normalBias = 0.02;
```

Keep every tile `castShadow=true` and `receiveShadow=true`. Continue multiplying top and side colors by the tone factor. Do not add a same-plane shadow mesh.

- [ ] **Step 6: Run visual unit tests**

Run:

```powershell
node --test tests/paws-level-editor-blocked-visual.test.mjs tests/paws-level-editor-editor-geometry.test.mjs tests/paws-level-editor-play-engine.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit contact shadows**

```powershell
git add projects/paws-level-editor/core/coverage.mjs projects/paws-level-editor/core/view-model.mjs projects/paws-level-editor/core/tile-visual-tone.mjs projects/paws-level-editor/views/canvas-2d.mjs projects/paws-level-editor/views/three-3d.mjs tests/paws-level-editor-blocked-visual.test.mjs tests/paws-level-editor-editor-geometry.test.mjs
git commit -m "feat(paws): render localized blocked tile shadows"
```

### Task 7: Prove Corpus Fidelity, Diversity, and Failure-Free Generation

**Files:**
- Modify: `scripts/verify-paws-ai-corpus.mjs`
- Modify: `tests/paws-level-editor-ai-corpus.test.mjs`
- Create: `tests/paws-level-editor-stage-grammar-stress.test.mjs`
- Create: `tests/artifacts/paws-ai-v11-corpus-proof.json`

**Interfaces:**
- Produces a v11 proof JSON containing corpus inventory, 500+ geometry cases, 600+ play assignments, topology diversity, density/structure distributions, performance, and zero-failure counters.

- [ ] **Step 1: Write failing stress assertions**

```js
assert.equal(proof.algorithmVersion, "paws-local-stat-v11-stage-grammar");
assert.equal(proof.corpus.activeSecondRoundFiles, 16);
assert.equal(proof.corpus.trashFilesRead, 0);
assert.equal(proof.geometry.cases >= 500, true);
assert.deepEqual(proof.geometry.failures, {
  build: 0, count: 0, layers: 0, bounds: 0, overlap: 0,
  density: 0, structure: 0, solve: 0,
});
assert.equal(proof.play.cases >= 600, true);
assert.deepEqual(proof.play.failures, {
  oddTypes: 0, assignment: 0, solve: 0,
});
assert.equal(proof.diversity.uniqueTopologyHashes >= 24, true);
assert.equal(proof.default200x15.maximumLayerPeak <= 22, true);
```

- [ ] **Step 2: Run the verifier and confirm v10-proof failure**

Run:

```powershell
$env:PAWS_EDITOR_LEVELS='E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels'
npm run verify:paws-ai-corpus
```

Expected: FAIL because the verifier/proof still targets v10 and lacks stage metrics.

- [ ] **Step 3: Expand the matrix and proof schema**

Use all 16 active sources, all three difficulties, all three layouts, default plus boundary-valid tile/layer pairs, and deterministic seeds. Generate at least 500 geometries and at least 600 concrete play assignments. Record:

- layer peak histogram
- component-count and maximum-component histograms
- tower entrance/role/depth distributions
- release dependency drop
- `0/2/4` fill-track distribution
- topology hashes for 30 fixed normal seeds
- per-case duration and p95 duration
- every failure category separately

- [ ] **Step 4: Require source-family diversity**

For 30 normal default seeds:

```js
assert.equal(uniqueTopologyHashes.size >= 24, true);
assert.equal(
  Math.max(...sourceUseCounts.values()) / 30 <= 0.4,
  true,
);
```

If the corpus contains fewer than three compatible families for a request, report that count and apply the ratio to topology families rather than raw source filenames.

- [ ] **Step 5: Run stress, corpus, and proof tests**

Run:

```powershell
$env:PAWS_EDITOR_LEVELS='E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels'
node --test tests/paws-level-editor-stage-grammar-stress.test.mjs tests/paws-level-editor-ai-corpus.test.mjs
npm run verify:paws-ai-corpus
```

Expected: PASS with zero failures and a refreshed v11 proof.

- [ ] **Step 6: Commit proof gates**

```powershell
git add scripts/verify-paws-ai-corpus.mjs tests/paws-level-editor-ai-corpus.test.mjs tests/paws-level-editor-stage-grammar-stress.test.mjs tests/artifacts/paws-ai-v11-corpus-proof.json
git commit -m "test(paws): prove v11 corpus fidelity and stability"
```

### Task 8: Browser QA, Tutorial Media, Review, and Public Release

**Files:**
- Modify: `tests/paws-level-editor-ai-browser-smoke.mjs`
- Modify: `tests/artifacts/paws-ai-level-proof.json`
- Modify: `tests/artifacts/paws-ai-level-desktop.png`
- Modify: `tests/artifacts/paws-ai-play-2d-blocked.png`
- Modify: `tests/artifacts/paws-ai-play-3d-blocked.png`
- Modify: `scripts/record-paws-level-editor-demo.mjs`
- Modify: `projects/paws-level-editor/video/paws-level-editor-tutorial.mp4`
- Modify: `projects/paws-level-editor/video/poster.jpg`
- Modify: `projects/paws-level-editor/video/recording-proof.json`

**Interfaces:**
- Produces local and public browser proof, updated tutorial media, exact source commit, GitHub Pages deployment, and online HTTP/browser acceptance.

- [ ] **Step 1: Extend browser smoke to inspect all five stages**

Generate a normal `200/15` level, switch to single-layer view, and inspect:

- surface layers 13–15
- shelter layers 11–12
- middle layers 6–10
- crisis layers 3–5
- release layers 1–2

Capture one all-layer 3D image plus single-layer 2D evidence. Assert the page metadata reports v11, peak ≤22, at least four entrances, no three-layer giant run, and valid fill-track semantics.

- [ ] **Step 2: Add blocked-state visual checkpoints**

In a real play session:

1. capture a covered ordinary tile in 2D;
2. capture the same state in 3D;
3. remove the upper tile and assert the lower tile returns to factor 1;
4. cover/uncover a blind-fill lower tile and assert no duplicate overlay;
5. assert no WebGL warning, page error, console error, request failure, or horizontal overflow.

- [ ] **Step 3: Run local browser QA and visually inspect screenshots**

Run:

```powershell
node tests/paws-level-editor-ai-browser-smoke.mjs
```

Open the three generated PNGs and verify tower separation, stage release, correct block art, readable 0.58 dimming, localized contact shadow, and no 2D/3D z-fighting.

- [ ] **Step 4: Record the v11 tutorial**

Update `record-paws-level-editor-demo.mjs` to show:

- AI dialog at 200/15
- generated five-stage 2D layers
- 3D tower overview
- blind-fill track
- playable blocked/contact shadow behavior

Record H.264 `1280×720`, keep captions to one line, rebuild poster and recording proof, and verify duration/media metadata with the existing video tests.

- [ ] **Step 5: Run the full local gate**

Run:

```powershell
$env:PAWS_EDITOR_LEVELS='E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels'
node --test (Get-ChildItem tests -Filter 'paws-level-editor-*.test.mjs' | ForEach-Object FullName)
Get-ChildItem projects/paws-level-editor,scripts,tests -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($_.FullName)" } }
npm run verify:paws-ai-corpus
npm run test:paws-browser
```

Expected: all applicable tests and syntax checks pass; environment-only skips are named; corpus/build/play failure counters are zero.

- [ ] **Step 6: Perform a focused code review and fix every finding**

Review the complete diff against:

- the approved design spec
- the 16-file corpus
- Unity shortcut 2/3 semantics
- density/tower/release gates
- failure-free generation and bounded fallback
- 2D/3D visual fidelity
- public empty-catalog preservation

Resolve all Critical and Important findings; rerun every affected gate.

- [ ] **Step 7: Commit final browser and media evidence**

```powershell
git add tests/paws-level-editor-ai-browser-smoke.mjs tests/artifacts scripts/record-paws-level-editor-demo.mjs projects/paws-level-editor/video
git commit -m "test(paws): verify v11 browser and tutorial flows"
```

- [ ] **Step 8: Verify authoritative remote access and publish**

```powershell
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git ls-remote --heads origin main
git push origin HEAD:main
```

Do not force-push. If `origin/main` advanced, rebase or merge only after confirming the incoming commits and rerunning relevant tests.

- [ ] **Step 9: Wait for the exact GitHub Pages deployment**

Use GitHub Actions/Pages status to locate the deployment whose source SHA equals the pushed `HEAD`. Wait until it succeeds; a local build is not a public deployment.

- [ ] **Step 10: Complete public HTTP and real-browser acceptance**

Verify:

- Hub card and Paws page return HTTP 200.
- v11 scripts and critical assets return HTTP 200 and match the pushed bytes/hashes.
- tutorial MP4 supports Range requests with HTTP 206 and plays past 27 seconds.
- public level index remains `defaultFileName=""` and `levels=[]`.
- desktop `1440×900` and mobile `390×844` have no horizontal overflow.
- public AI generation, 2D/3D switching, full playthrough, blocked/contact shadow, persistence, and deletion all work.
- console, page, request, and WebGL errors are zero.

- [ ] **Step 11: Update long-term project memory**

Replace the v10 current-state entry in `AI-Application-Hub.md` with the confirmed v11 algorithm version, exact pushed SHA, workflow/deployment ID, corpus/stress counts, test totals, public URL, and any real environment-only skips. Do not store passwords, cookies, tokens, or the LAN口令.
