# Paws Latest Request Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale level-open and catalog-refresh completions from overwriting the user's latest selection or directory state.

**Architecture:** Add independent monotonic epochs to `WorkbenchController`. Capture an epoch at operation start and check it after every awaited API/migration boundary and before every success/error state commit. Verify behavior through the real controller with deferred promises.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, browser DOM stubs, Playwright.

## Global Constraints

- The latest started open request is the only request allowed to activate a document.
- The latest started refresh request is the only request allowed to replace the catalog or connection state.
- A stale success, stale error, and stale recovery path are all silent.
- Cancelling a synchronous confirmation does not invalidate another operation.
- Existing local AI geometry migration and damaged-record recovery behavior remain unchanged for the current request.

---

### Task 1: Reproduce open and refresh races with the real controller

**Files:**
- Create: `tests/paws-level-editor-controller-race.test.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`

**Interfaces:**
- Adds controller fields `openLevelEpoch: number` and `refreshLevelsEpoch: number`.
- Preserves the public signatures of `openLevel()` and `refreshLevels()`.

- [ ] **Step 1: Build a minimal real-controller harness**

Stub `matchMedia`, pass a non-DOM root, replace rendering/UI methods with event recording functions, and provide deferred `loadLevel` / `listLevelCatalog` API methods. Use valid two-tile raw level payloads so parsing, scoring and history creation remain real.

- [ ] **Step 2: Write and verify RED races**

Start A then B, resolve B then A, and assert B remains active. Start old refresh then new refresh, resolve new then old, and assert only new catalog/default/connection commits. Run:

`node --test tests/paws-level-editor-controller-race.test.mjs`

Expected: both tests fail because the stale operations currently commit last.

- [ ] **Step 3: Add minimal epoch guards**

Initialize both counters to 0. Increment the matching counter once an operation genuinely starts. For refresh, check after `listLevelCatalog()` and at catch entry. For open, check after `resetLevel()`, `loadLevel()`, `upgradeLocalAiLevelOnOpen()`, recovery reset, and at catch entry before any state or toast mutation.

- [ ] **Step 4: Verify GREEN and recovery compatibility**

Run the race test and existing controller contract/static API tests. Expected: latest-wins tests pass and recovery contracts remain green.

### Task 2: Integrate into full local and public acceptance

**Files:**
- Modify only if acceptance exposes an in-scope defect.
- Verify: `tests/paws-level-editor-browser-smoke.mjs`

**Interfaces:**
- Consumes the existing local/public browser harness.
- Produces fresh proof that rapid selection, ordinary open, editing, 3D and play still work.

- [ ] **Step 1: Run all Paws Node and syntax checks**

Expected: zero failures; the existing Windows symlink permission test may skip.

- [ ] **Step 2: Run browser rapid-selection proof**

Delay one level JSON response, click another level, and verify the final active card/document remains the last clicked level after both responses finish.

- [ ] **Step 3: Include in the same verified release**

Fetch/rebase without force, push `HEAD:main`, wait for Pages, and repeat HTTP/browser gates against the deployed commit.
