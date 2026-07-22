# Paws Runtime Parity and 3D Depth Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Unity first-round random type assignment and prevent 3D z-fighting for compatible historical overlaps without weakening AI geometry guarantees.

**Architecture:** Extend the pure random assignment module with document round detection and a Unity-style first-round layer assignment. Compute a separate, deterministic render-only depth bias from same-layer conflicts in the view model; keep level data and coverage untouched. Exercise the play engine directly through Node tests before changing production code.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Three.js, Playwright, GitHub Pages.

## Global Constraints

- AI generated geometry remains strictly zero-overlap on each layer; visual bias never relaxes validation.
- Tile totals and every concrete generated type count remain even and pair-removable.
- `_r1_` is first round, `_r2_` and later are not; missing markers fall back to `gameplay.gameLevelOrder === 1`.
- First round merges `type=0` and `type=-1`, uses one concrete type per random layer, and rejects an odd random count on any layer.
- Second round retains the existing separate limited/full random pools.
- Historical JSON coordinates, layers, types and coverage behavior remain byte-for-byte unaffected by render bias.
- Same-layer edge touching and every cross-layer overlap receive zero render bias.

---

### Task 1: Add failing first-round and play-engine regressions

**Files:**
- Create: `tests/paws-level-editor-play-engine.test.mjs`
- Modify: `projects/paws-level-editor/core/random-assigner.mjs`
- Modify: `projects/paws-level-editor/core/play-engine.mjs`

**Interfaces:**
- Produces: `isFirstRoundDocument(document): boolean`.
- Extends: `assignRandomTypes(tiles, { firstRound, seed, blockTypeCount, fullTypeMin, fullTypeMax })`.
- Consumes: `createPlaySession(document, seed, options)` with `options.firstRound` as an optional explicit override.

- [ ] **Step 1: Write the first-round RED test**

Create a three-layer document with four `type=0/-1` tiles per layer, `fileName: "level_0021_r1_test.json"`, `gameplay.gameLevelOrder: 1`, and `blockTypeCount: 2`. Assert that every layer has exactly one concrete type, the three layer types are distinct after range expansion, every type count is even, and all original tile objects remain unchanged.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern="first round" tests/paws-level-editor-play-engine.test.mjs`

Expected: FAIL because the current assigner mixes multiple types inside a layer and no document-round classifier exists.

- [ ] **Step 3: Implement the minimum Unity-style branch**

Add:

```js
export function isFirstRoundDocument(document) {
  const match = String(document?.fileName ?? "").match(/_r(\d+)(?:_|$)/i);
  if (match) return Number(match[1]) === 1;
  return Number(document?.gameplay?.gameLevelOrder) === 1;
}
```

For `firstRound: true`, collect both marker types, group indices by layer, reject odd group sizes, construct and shuffle a distinct type pool from `1..max(blockTypeCount, layerCount)` capped at 32, and assign one type to each layer. Preserve `randomSourceType` per tile. Pass `options.firstRound ?? isFirstRoundDocument(sourceDocument)` from `createPlaySession`.

- [ ] **Step 4: Add characterization tests for existing play rules**

Cover selection/cancel, flip mismatch and match, tray slots, special auto-removal, deadlock, deterministic restart, and a complete win. These use the real engine without mocks.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/paws-level-editor-play-engine.test.mjs`

Expected: all new play-engine tests pass.

### Task 2: Add deterministic render-only conflict depth

**Files:**
- Modify: `projects/paws-level-editor/core/view-model.mjs`
- Modify: `tests/paws-level-editor-editor-geometry.test.mjs`

**Interfaces:**
- Produces: `computeSameLayerVisualBias(tiles, { step = 0.001 } = {}): Map<string, number>`.
- Extends each `buildRenderTiles` record with `visualDepthBias` and adds it to board `worldY` only.

- [ ] **Step 1: Write the render-bias RED tests**

Assert that two positive-area overlapping same-layer tiles get different biases; reversing input order preserves the UID-to-bias mapping; edge touching, cross-layer overlaps and tray tiles all get 0; source tile objects are unchanged.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern="visual depth" tests/paws-level-editor-editor-geometry.test.mjs`

Expected: FAIL because the helper and `visualDepthBias` field do not exist.

- [ ] **Step 3: Implement stable greedy conflict coloring**

Filter active board tiles, sort by layer/Y/X/UID, compare only equal layers with `overlapsWithPositiveArea`, and assign each tile the smallest non-conflicting non-negative color. Return `color * step`; tiles without conflicts return 0. `buildRenderTiles` computes the map once and uses:

```js
const visualDepthBias = inTray ? 0 : (depthBiasByUid.get(tile.uid) ?? 0);
worldY: inTray ? 0.12 : Number((tile.layer * LAYER_HEIGHT + visualDepthBias).toFixed(6));
```

- [ ] **Step 4: Verify GREEN and unaffected AI output**

Run the geometry test and the complete AI generator test. Expected: depth tests pass and all generated AI overlap assertions remain 0.

### Task 3: Full regression, browser proof and release

**Files:**
- Verify: all `tests/paws-level-editor-*.test.mjs`
- Verify: `tests/paws-level-editor-browser-smoke.mjs`
- Verify: `tests/paws-level-editor-ai-browser-smoke.mjs`

**Interfaces:**
- Consumes: repository tests, local static server, public GitHub Pages URL.
- Produces: fresh local/public evidence tied to the final commit SHA.

- [ ] **Step 1: Run full automated checks**

Run every Paws Node test, `node --check` for every Paws `.mjs`, and `git diff --check`. Expected: zero failures; the existing Windows symlink-permission test may skip.

- [ ] **Step 2: Run local browser acceptance**

Verify a bundled `_r1_` file starts with one type per random layer and can be cleared; verify the standard AI generation remains 200/15, zero-overlap and wins in 100 steps; inspect a historical warning level in 3D and confirm conflicting records have distinct `worldY` without document mutation.

- [ ] **Step 3: Commit and publish**

Read the Hub release workflow and `github:yeet`, fetch/rebase without force, push `HEAD:main`, and wait for the Pages workflow for the pushed SHA.

- [ ] **Step 4: Verify public deployment**

Run HTTP checks and real-browser acceptance against the Pages URL. Expected: HTML/modules/media respond correctly, `_r1_` play and AI full play both win, 3D uses WebGL, and console/page/request/HTTP error collections are empty.
