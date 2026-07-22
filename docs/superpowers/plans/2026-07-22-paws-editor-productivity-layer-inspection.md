# Paws Editor Productivity and Layer Inspection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Paws web editor safe and efficient for daily level production by adding collision-safe edits, high-frequency commands, layer inspection, correct edit-state coverage, working 3D deletion, JSON export, and 7×8 defaults.

**Architecture:** Add pure geometry, layer-view, shortcut, and export helpers; keep edit orchestration in `WorkbenchController`; make both renderers consume shared derived coverage and layer-filter state. Preserve the static GitHub Pages and browser-local persistence boundary.

**Tech Stack:** Browser ES modules, Canvas 2D, Three.js, Node.js built-in test runner, Playwright browser smoke tests, GitHub Pages.

## Global Constraints

- Preserve unknown top-level JSON and `designerNote` fields.
- Preserve historical bundled levels without silently rewriting their layers.
- Edge touching is legal; positive-area same-layer overlap is illegal for newly created edits.
- AI levels retain strict same-layer overlap errors, even tile counts, even type groups, and deterministic solvability.
- Board width is 4–16 fields, height is 4–20 fields, and the default is exactly 7×8.
- Editing and AI results remain browser-local; no credential or repository write token is embedded.
- Mobile/coarse-pointer mode remains read-only.

---

### Task 1: Pure editor geometry and layer filtering

**Files:**
- Create: `projects/paws-level-editor/core/editor-geometry.mjs`
- Test: `tests/paws-level-editor-editor-geometry.test.mjs`

**Interfaces:**
- Produces: `parseGridUnit(value)`, `buildGridUnit(width, height)`, `boardMicroBounds(document)`, `overlapsWithPositiveArea(left, right)`, `filterTilesByLayerView(tiles, layerView)`, `planTilePlacement(document, tile)`, `planTileMove(document, tileUids, delta)`, and `findPastePlacement(document, sourceTiles, options)`.
- All planning functions return `{ ok: true, ... }` or `{ ok: false, reason, code }` without mutating input.

- [ ] **Step 1: Write failing geometry tests**

Cover 7×8 bounds, grid-unit parsing/building, edge-touching versus area overlap, upward layer search, out-of-board rejection, atomic multi-move rejection, all/through/single filtering, and deterministic paste offsets.

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

Run: `node --test tests/paws-level-editor-editor-geometry.test.mjs`

Expected: FAIL because `core/editor-geometry.mjs` does not exist.

- [ ] **Step 3: Implement the pure geometry module**

Use 8 microcells per tile; scan candidate layers from the requested layer upward; compare move candidates against both selected and unselected tiles; never mutate the source document.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/paws-level-editor-editor-geometry.test.mjs`

Expected: all geometry tests pass.

- [ ] **Step 5: Commit**

Run: `git add projects/paws-level-editor/core/editor-geometry.mjs tests/paws-level-editor-editor-geometry.test.mjs && git commit -m "feat: add safe Paws editor geometry"`

### Task 2: Adapter defaults and expanded validation

**Files:**
- Modify: `projects/paws-level-editor/core/level-adapter.mjs`
- Modify: `projects/paws-level-editor/core/level-validator.mjs`
- Test: `tests/paws-level-editor-editor-geometry.test.mjs`
- Test: `tests/paws-level-editor-ai-generator.test.mjs`

**Interfaces:**
- Consumes: `parseGridUnit`, `buildGridUnit`, and `overlapsWithPositiveArea` from Task 1.
- Produces: parsed documents with consistent `board` and `gridUnit`; validation issues with `severity`, `code`, `message`, and `tileUids`.

- [ ] **Step 1: Add failing tests for 7×8 fallback, grid-unit inference, board/random ranges, integer coordinates, duplicate UID, grid mismatch, and manual overlap warnings**

- [ ] **Step 2: Run the focused tests and confirm the new assertions fail**

Run: `node --test tests/paws-level-editor-editor-geometry.test.mjs tests/paws-level-editor-ai-generator.test.mjs`

Expected: failures show the old 8×10 fallback and missing validation codes.

- [ ] **Step 3: Implement adapter and validator changes**

Derive dimensions from `designerNote` first, then `gridUnit`, then 7×8. Serialize `gridUnit` from the normalized board. Report manual same-layer overlap as `warning` and AI overlap as `error`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/paws-level-editor-editor-geometry.test.mjs tests/paws-level-editor-ai-generator.test.mjs`

Expected: all focused tests pass, including historical compatibility.

- [ ] **Step 5: Commit**

Run: `git add projects/paws-level-editor/core/level-adapter.mjs projects/paws-level-editor/core/level-validator.mjs tests/paws-level-editor-editor-geometry.test.mjs tests/paws-level-editor-ai-generator.test.mjs && git commit -m "fix: align Paws board defaults and validation"`

### Task 3: Derived edit-state coverage and renderer layer filters

**Files:**
- Modify: `projects/paws-level-editor/core/view-model.mjs`
- Modify: `projects/paws-level-editor/views/canvas-2d.mjs`
- Modify: `projects/paws-level-editor/views/three-3d.mjs`
- Test: `tests/paws-level-editor-editor-geometry.test.mjs`

**Interfaces:**
- Consumes: `computeCoverage` and `filterTilesByLayerView`.
- Produces: `deriveDisplayTiles(source, layerView)` plus renderer methods `setLayerView(layerView)`; `Three3DView` also produces `setTool(tool)` and consumes `onDelete`.

- [ ] **Step 1: Add failing tests for covered, side-blocked, hidden-pattern, through-layer, and single-layer display records**

- [ ] **Step 2: Run the focused test and confirm failures**

Run: `node --test tests/paws-level-editor-editor-geometry.test.mjs`

- [ ] **Step 3: Implement shared display derivation and renderer integration**

Do not persist derived flags. In 3D delete mode, a click calls `onDelete([uid])`; in other edit tools it keeps selection behavior.

- [ ] **Step 4: Run focused tests and module syntax checks**

Run: `node --test tests/paws-level-editor-editor-geometry.test.mjs`

Run: `node --check projects/paws-level-editor/core/view-model.mjs; node --check projects/paws-level-editor/views/canvas-2d.mjs; node --check projects/paws-level-editor/views/three-3d.mjs`

- [ ] **Step 5: Commit**

Run: `git add projects/paws-level-editor/core/view-model.mjs projects/paws-level-editor/views/canvas-2d.mjs projects/paws-level-editor/views/three-3d.mjs tests/paws-level-editor-editor-geometry.test.mjs && git commit -m "feat: add Paws layer-aware edit rendering"`

### Task 4: Shortcut command mapping and controller edit operations

**Files:**
- Create: `projects/paws-level-editor/ui/editor-shortcuts.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Test: `tests/paws-level-editor-editor-shortcuts.test.mjs`
- Test: `tests/paws-level-editor-controller-contract.test.mjs`

**Interfaces:**
- Produces: `commandFromKeyboardEvent(event)` returning `{ command, args } | null`.
- Controller adds `copySelection()`, `cutSelection()`, `pasteSelection()`, `duplicateSelection()`, `nudgeSelection(dx,dy)`, `nudgeSelectionLayer(delta)`, `selectAllVisible()`, and `executePlannedEdit(plan)`.

- [ ] **Step 1: Write failing shortcut tests**

Verify Ctrl/Meta commands, unmodified tool keys, F2/F5, arrows, PageUp/PageDown, brackets, L, and that Ctrl+D/Ctrl+F never become tool commands.

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `node --test tests/paws-level-editor-editor-shortcuts.test.mjs tests/paws-level-editor-controller-contract.test.mjs`

- [ ] **Step 3: Implement shortcut mapping and controller operations**

Use an in-memory tile clipboard; generate fresh UIDs for pasted/duplicated tiles; all coordinate/layer changes go through Task 1 planners; rejected plans only show a toast.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/paws-level-editor-editor-shortcuts.test.mjs tests/paws-level-editor-controller-contract.test.mjs`

- [ ] **Step 5: Commit**

Run: `git add projects/paws-level-editor/ui/editor-shortcuts.mjs projects/paws-level-editor/ui/workbench-controller.mjs tests/paws-level-editor-editor-shortcuts.test.mjs tests/paws-level-editor-controller-contract.test.mjs && git commit -m "feat: add Paws editor productivity commands"`

### Task 5: Layer controls, safe inspector editing, issue focus, and JSON export

**Files:**
- Create: `projects/paws-level-editor/ui/level-export.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `projects/paws-level-editor/ui/inspector.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Test: `tests/paws-level-editor-controller-contract.test.mjs`
- Test: `tests/paws-level-editor-assets.test.mjs`

**Interfaces:**
- Produces: `createLevelDownload(document, { fileName })` returning `{ fileName, text, blob }` and `triggerLevelDownload(download)`.
- Inspector adds callbacks `onExport`, `onIssueFocus`, and `onBoardPatch`.

- [ ] **Step 1: Add failing contract tests for layer controls, export, clickable issues, read-only grid unit, single-selection positions, and board patch callbacks**

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-assets.test.mjs`

- [ ] **Step 3: Implement the UI and controller state**

Add all/through/single mode, decrement/increment, current layer display, export button, issue buttons, and safe board patching. Multi-selection must not expose absolute X/Y inputs.

- [ ] **Step 4: Run focused tests and syntax checks**

Run: `node --test tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-assets.test.mjs`

Run: `node --check projects/paws-level-editor/ui/level-export.mjs; node --check projects/paws-level-editor/ui/inspector.mjs; node --check projects/paws-level-editor/ui/workbench-controller.mjs`

- [ ] **Step 5: Commit**

Run: `git add projects/paws-level-editor/ui/level-export.mjs projects/paws-level-editor/index.html projects/paws-level-editor/styles.css projects/paws-level-editor/ui/inspector.mjs projects/paws-level-editor/ui/workbench-controller.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-assets.test.mjs && git commit -m "feat: add Paws layer controls and JSON export"`

### Task 6: Browser regression and demo proof

**Files:**
- Modify: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: `scripts/record-paws-level-editor-demo.mjs`
- Modify: `projects/paws-level-editor/video/tutorial-script.md`
- Regenerate: `projects/paws-level-editor/video/paws-level-editor-tutorial.mp4`
- Regenerate: `projects/paws-level-editor/video/poster.jpg`
- Regenerate: `projects/paws-level-editor/video/recording-proof.json`

**Interfaces:**
- Browser smoke output adds `safeEditing`, `layerInspection`, `threeDeleteUndo`, and `exportRoundTrip` evidence.

- [ ] **Step 1: Extend the browser smoke test before production verification**

Cover a rejected overlap move, copy/paste/duplicate/nudge, layer parity in 2D/3D, 3D delete/undo, 7×8 new level, board shrink rejection, and exported JSON re-import round trip.

- [ ] **Step 2: Run the local browser smoke test**

Run: `node tests/paws-level-editor-browser-smoke.mjs`

Expected: all new fields are true; AI remains 200/15/60, zero overlap, 100 steps, won, remaining zero; all four error counters are zero.

- [ ] **Step 3: Update and rerun the recording script**

Run: `node scripts/record-paws-level-editor-demo.mjs`

Expected: a new H.264 16:9 tutorial with real layer inspection, safe editing, 3D, export, and playthrough state changes.

- [ ] **Step 4: Run video and proof tests**

Run: `node --test tests/paws-level-editor-recording-script.test.mjs tests/paws-level-editor-video.test.mjs`

- [ ] **Step 5: Commit**

Run: `git add tests/paws-level-editor-browser-smoke.mjs scripts/record-paws-level-editor-demo.mjs projects/paws-level-editor/video && git commit -m "test: refresh Paws editor workflow proof"`

### Task 7: Full verification, review, publish, and online acceptance

**Files:**
- Modify only if verification finds a defect.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a clean commit on `origin/main`, a successful Pages workflow, and online browser evidence.

- [ ] **Step 1: Run the complete Paws test suite**

Run: `$tests=(Get-ChildItem tests\paws-level-editor*.test.mjs).FullName; node --test $tests`

Expected: zero failures; only the documented Windows symlink-permission skip is allowed.

- [ ] **Step 2: Run syntax and whitespace gates**

Run: `Get-ChildItem projects\paws-level-editor,scripts,tests -Recurse -File -Filter *.mjs | ForEach-Object { node --check $_.FullName }; git diff --check`

Expected: every command exits 0.

- [ ] **Step 3: Inspect the final diff and current branch state**

Run: `git status -sb; git diff origin/main...HEAD --stat; git log --oneline origin/main..HEAD`

- [ ] **Step 4: Push the reviewed HEAD to authoritative main**

Run: `git push origin HEAD:main`

- [ ] **Step 5: Wait for Pages and run online HTTP/browser acceptance**

Run: `node tests/paws-level-editor-browser-smoke.mjs --base-url https://wthpein010-dev.github.io/ai-application-hub`

Expected: the same safe-editing, layer, export, AI and full-playthrough evidence as local, with zero browser/HTTP/page/request errors.
