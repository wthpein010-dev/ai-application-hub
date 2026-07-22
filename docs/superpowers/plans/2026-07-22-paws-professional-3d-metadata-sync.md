# Paws Professional 3D, Metadata and Level Sync Implementation Plan

> **Execution:** Follow TDD task by task, keeping the existing static Pages and browser-local persistence boundary.

**Goal:** Add professional 3D inspection, Unity gameplay metadata editing, and authoritative Unity-to-Pages level synchronization.

**Architecture:** Keep relation analysis pure, expose narrow state setters on `Three3DView`, orchestrate controls in `WorkbenchController`, normalize Unity metadata in the adapter, and reuse the existing atomic level synchronization script.

---

### Task 1: Pure tile relations and issue severity

**Files:**
- Create: `projects/paws-level-editor/core/tile-relations.mjs`
- Create: `tests/paws-level-editor-tile-relations.test.mjs`

- [ ] Write failing tests for upper blockers, lower dependents, side blockers, deduplication, inactive tiles and issue severity priority.
- [ ] Run `node --test tests/paws-level-editor-tile-relations.test.mjs` and observe the missing module failure.
- [ ] Implement the minimum pure relation helpers.
- [ ] Run the focused test to green.

### Task 2: 3D inspection controls and renderer behavior

**Files:**
- Modify: `projects/paws-level-editor/views/three-3d.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`

- [ ] Add failing contract assertions for four presets, focus, layer separation, issue propagation and relationship rendering.
- [ ] Implement toolbar controls and controller wiring.
- [ ] Implement camera presets, selection focus, exploded Y layout, relationship lines and color priority.
- [ ] Run focused tests and module syntax checks.

### Task 3: Unity gameplay metadata round trip

**Files:**
- Modify: `projects/paws-level-editor/core/level-adapter.mjs`
- Modify: `projects/paws-level-editor/core/level-validator.mjs`
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Modify: `projects/paws-level-editor/ui/inspector.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `tests/paws-level-editor-adapter.test.mjs`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`

- [ ] Add failing round-trip/default/validation/inspector tests.
- [ ] Normalize `levelKey`, `gameLevelOrder`, `cdNum` and `showLayerNum` into `document.gameplay`.
- [ ] Serialize gameplay fields while preserving unknown metadata and sync `levelKey` on ID changes.
- [ ] Add safe inspector controls and new/AI defaults.
- [ ] Run focused tests and syntax checks.

### Task 4: Authoritative Unity level synchronization

**Files:**
- Modify: `projects/paws-level-editor/levels/*`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: affected catalog, fallback, video and proof tests/scripts

- [ ] Run the sync script with the current Unity source and default `level_0021_r2_第二关模板12.json`.
- [ ] Confirm target/source JSON file sets and catalog counts are identical.
- [ ] Update every hard-coded old default/count and adjust semantic assertions to the current source file.
- [ ] Run catalog, fallback, adapter, browser and controller tests.

### Task 5: Browser proof and tutorial media

**Files:**
- Modify: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: `scripts/record-paws-level-editor-tutorial.mjs`
- Modify: `projects/paws-level-editor/video/*`

- [ ] Extend the browser smoke test for 3D presets, focus, explosion, relationship lines and metadata round trip.
- [ ] Run desktop and 390×844 mobile smoke tests locally.
- [ ] Record updated tutorial video and refresh poster, captions and proof JSON.
- [ ] Run media codec, duration, one-line subtitle and proof consistency gates.

### Task 6: Full verification and publishing

- [ ] Run the complete Paws test suite and all Paws `.mjs` syntax checks.
- [ ] Run `git diff --check` and review the final diff for unrelated changes.
- [ ] Verify GitHub identity/write access and fast-forward safety.
- [ ] Commit intentionally and push reviewed HEAD to authoritative `origin/main`.
- [ ] Wait for Pages success, then run public HTTP, desktop browser, mobile browser and media playback acceptance.
- [ ] Update long-term project memory with the verified SHA, workflow and acceptance evidence.
