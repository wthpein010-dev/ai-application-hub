# Paws AI Same-Layer Zero-Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI-generated Paws level contain no positive-area overlap between tiles on the same layer while preserving even pairing and deterministic solvability.

**Architecture:** Enforce the geometry invariant at placement time, then verify it again in the AI validation gate. Keep legacy imported levels compatible by enabling the new validation error automatically only for documents marked with `designerNote.aiGeneration`, while the generator explicitly requests strict validation.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Playwright, GitHub Pages.

## Global Constraints

- AI board remains exactly 7×8 with 8×8 micro-grid tile footprints.
- Same-layer tiles may touch at an edge but must not share positive area.
- Cross-layer overlap remains available for cover and difficulty.
- Requested odd tile counts are rounded up to an even count.
- Every concrete type count is even globally and within each generated layer.
- A generated candidate is publishable only when `solveLevel` clears it in `tileCount / 2` moves.
- Legacy built-in and imported levels remain loadable even when they contain historical same-layer overlaps.

---

### Task 1: Add failing geometry and pairing regressions

**Files:**
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`
- Test: `tests/paws-level-editor-ai-generator.test.mjs`

**Interfaces:**
- Consumes: `validateLevel(document, options?)` and `generateAiLevel(options)`.
- Produces: test helper `sameLayerOverlapPairs(tiles)` and regression assertions for AI geometry, pairing, and solver completeness.

- [ ] **Step 1: Add the validator regression tests**

```js
function sameLayerOverlapPairs(tiles) {
  const pairs = [];
  for (let left = 0; left < tiles.length; left += 1) {
    for (let right = left + 1; right < tiles.length; right += 1) {
      const a = tiles[left];
      const b = tiles[right];
      if (a.layer === b.layer
        && Math.abs(a.x - b.x) < 8
        && Math.abs(a.y - b.y) < 8) {
        pairs.push([a.uid, b.uid]);
      }
    }
  }
  return pairs;
}

test("AI validation rejects positive-area overlap on one layer", () => {
  const document = makeDocument([
    tile("a", 0, 0, 1, 1),
    tile("b", 7, 0, 1, 1),
  ]);
  document.designerNote.aiGeneration = {};
  assert.equal(
    validateLevel(document).some(({ code }) => code === "same-layer-overlap"),
    true,
  );
});

test("AI validation permits edge-touching tiles", () => {
  const document = makeDocument([
    tile("a", 0, 0, 1, 1),
    tile("b", 8, 0, 1, 1),
  ]);
  document.designerNote.aiGeneration = {};
  assert.equal(
    validateLevel(document).some(({ code }) => code === "same-layer-overlap"),
    false,
  );
});
```

- [ ] **Step 2: Run the targeted tests and verify RED**

Run: `node --test --test-name-pattern="AI validation|200 tiles" tests/paws-level-editor-ai-generator.test.mjs`

Expected: the positive-area test fails because `same-layer-overlap` does not exist yet, and the existing 200-tile generated level still contains overlap pairs once the zero-overlap assertion is added.

- [ ] **Step 3: Add generated-level invariant assertions**

In the existing nine-combination generator test, assert:

```js
assert.deepEqual(sameLayerOverlapPairs(generated.document.tiles), []);

const globalTypes = new Map();
const layerTypes = new Map();
for (const tileValue of generated.document.tiles) {
  globalTypes.set(tileValue.type, (globalTypes.get(tileValue.type) ?? 0) + 1);
  const key = `${tileValue.layer}|${tileValue.type}`;
  layerTypes.set(key, (layerTypes.get(key) ?? 0) + 1);
}
assert.equal([...globalTypes.values()].every((count) => count % 2 === 0), true);
assert.equal([...layerTypes.values()].every((count) => count % 2 === 0), true);
assert.equal(generated.document.tiles.length % 2, 0);
assert.equal(generated.report.steps, generated.document.tiles.length / 2);
```

- [ ] **Step 4: Run the generator test and verify RED**

Run: `node --test tests/paws-level-editor-ai-generator.test.mjs`

Expected: at least one generated-level test fails with non-empty same-layer overlap pairs.

### Task 2: Enforce the invariant in generation and validation

**Files:**
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Modify: `projects/paws-level-editor/core/level-validator.mjs`
- Test: `tests/paws-level-editor-ai-generator.test.mjs`

**Interfaces:**
- Consumes: existing 8×8 `overlaps(left, right)` geometry predicate.
- Produces: `validateLevel(document, { rejectSameLayerOverlap } = {})`; generated tower layers whose same-layer footprints never intersect.

- [ ] **Step 1: Add strict AI overlap validation**

Update the validator signature and collect same-layer intersections:

```js
export function validateLevel(document, options = {}) {
  const rejectSameLayerOverlap = options.rejectSameLayerOverlap
    ?? Boolean(document?.designerNote?.aiGeneration);
  // Group tiles by layer, compare each pair with the strict < 8 rule,
  // and emit one same-layer-overlap error with every affected uid.
}
```

Update the generator gate to call:

```js
validateLevel(document, { rejectSameLayerOverlap: true })
```

- [ ] **Step 2: Prevent overlap while selecting each lower layer**

In `chooseChildAnchor`, reject candidates that intersect any coordinate already stored in `layerAnchors`:

```js
if ([...layerAnchors].some((value) => overlaps(anchor, value))) continue;
```

Store coordinate objects in `layerAnchors`; retain `globalAnchors` for cross-layer exact-anchor uniqueness.

- [ ] **Step 3: Space tower-top anchors without overlap**

Replace jittered top-Y placement with an interval-aware distribution:

```js
const requiredSpan = (count - 1) * TILE_SIZE;
if (requiredSpan > maximum - minimum) {
  throw new Error("塔顶入口无法满足同层零重叠约束。");
}
const start = Math.max(
  minimum,
  Math.min(maximum - requiredSpan, Math.round(center - requiredSpan / 2)),
);
return Array.from({ length: count }, (_, index) => start + index * TILE_SIZE);
```

Use the full legal Y range `0..maxY`; do not reduce spacing to force a candidate.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `node --test tests/paws-level-editor-ai-generator.test.mjs`

Expected: every test passes; all nine generator combinations have zero same-layer overlaps, even global/layer type counts, and complete solver reports.

- [ ] **Step 5: Commit the focused implementation**

```bash
git add projects/paws-level-editor/core/ai-level-generator.mjs projects/paws-level-editor/core/level-validator.mjs tests/paws-level-editor-ai-generator.test.mjs
git commit -m "fix: prevent same-layer overlap in Paws AI levels"
```

### Task 3: Complete local, browser, and public verification

**Files:**
- Modify only if a test exposes a scoped defect.
- Verify: `projects/paws-level-editor/index.html`
- Verify: `tests/paws-level-editor-browser-smoke.mjs`

**Interfaces:**
- Consumes: repository test commands and the existing Paws browser acceptance script.
- Produces: fresh local and public evidence tied to the final commit SHA.

- [ ] **Step 1: Run the full automated regression**

Run every `tests/*.test.mjs` file with Node's test runner, then run all repository `.mjs` files through `node --check` and run `git diff --check`.

Expected: zero failures and zero syntax or whitespace errors; only the existing Windows symlink permission test may skip.

- [ ] **Step 2: Run local desktop browser acceptance**

Run the existing static server and `tests/paws-level-editor-browser-smoke.mjs`. Generate the standard 200-tile/15-layer level, enter 3D, and complete the solver-driven playthrough.

Expected: 7×8 board, zero same-layer overlap, 100 successful removal steps, and no console, page, request, or HTTP errors.

- [ ] **Step 3: Push the verified commits**

Confirm `origin/main`, current SSH identity, and fast-forward relationship. Push the current branch commit to `origin/main` without force.

- [ ] **Step 4: Wait for Pages and verify the public build**

Poll GitHub Pages until the public source hash matches the final commit, then run HTTP checks and the browser acceptance script with the public `--base-url`.

Expected: index and core modules return HTTP 200, media Range remains 206, 3D generation and full play succeed, and all browser error collections remain empty.
