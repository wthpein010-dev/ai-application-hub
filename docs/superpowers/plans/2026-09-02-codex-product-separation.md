# Codex Product Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public Hub visibly distinguish the confirmation helper from the multi-thread workbench and ensure each Windows/macOS download starts its intended product.

**Architecture:** Keep two independent Hub records and download directories. The shared Avalonia code uses a per-package JSON launch profile so one source snapshot can produce a confirmation-overlay package and a workbench package without sharing default startup behavior.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js tests, PowerShell packaging, .NET 8/Avalonia, GitHub Actions macOS runners, GitHub Pages.

**Spec:** User report that the two Codex tools are not distinguishable and the confirmation helper download opens the workbench.

## Global Constraints

- Do not run, build, open, download, or render ClickFlow on Windows.
- Never run an unfiltered `node --test`; only name scoped Hub tests explicitly.
- Preserve all existing multi-thread workbench release URLs and package files.
- Publish only after verifying the clean Hub worktree against current `origin/main`.

---

### Task 1: Lock the Hub product identity contract

**Files:**
- Modify: `tests/codex-thread-workbench-page.test.mjs`
- Modify: `app-20260706-restore-games.js`

**Interfaces:**
- Consumes: Hub records `codex-thread-workbench` and `codex-multi-thread-workbench`.
- Produces: Different visible badges, description text, and platform URLs for the two cards.

- [ ] **Step 1: Write a failing test**

Add assertions that the confirmation helper has badge `待确认助手`, the workbench has badge `桌面工作台`, and their Windows/Mac URLs are distinct.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/codex-thread-workbench-page.test.mjs`

Expected: FAIL because the confirmation helper has no dedicated badge.

- [ ] **Step 3: Implement the minimal catalog change**

Set `badge: "待确认助手"` on the confirmation helper record while retaining the workbench record, text, and URLs.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/codex-thread-workbench-page.test.mjs`

Expected: PASS.

### Task 2: Publish an identity-correct Windows helper package

**Files:**
- Modify: `scripts/split-codex-thread-workbench.mjs`
- Modify: `projects/codex-thread-workbench/download/manifest.json`
- Modify: `projects/codex-thread-workbench/download/index.html`
- Modify: `projects/codex-thread-workbench/download/parts/*`

**Interfaces:**
- Consumes: `build/codex-thread-workbench/scripts/Publish-Windows.ps1 -Profile ConfirmationBar`.
- Produces: A helper ZIP containing `CodexConfirmationBar.exe` and `codex-launch-profile.json` with `defaultMode=confirmation-overlay`.

- [ ] **Step 1: Write a failing test**

Extend the focused Windows download test to require `CodexConfirmationBar.exe`, the confirmation profile JSON, and the helper README from the reconstructed archive.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/codex-thread-workbench-download.test.mjs`

Expected: FAIL because the current package contains `CodexThreadWorkbench.exe` and uses the workbench identity.

- [ ] **Step 3: Build and split the dedicated package**

Generate the helper profile package, update splitter expectations, regenerate its manifest/parts, and update the download-page facts.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/codex-thread-workbench-download.test.mjs`

Expected: PASS with matching archive contents and SHA-256.

### Task 3: Rebuild the confirmation helper macOS packages remotely

**Files:**
- Modify: `.github/workflows/build-codex-thread-workbench.yml`
- Modify: `scripts/publish-codex-confirmation-bar-macos.sh`
- Modify: `scripts/test-codex-confirmation-bar-macos-package.sh`
- Modify: `tests/codex-thread-workbench-mac-download.test.mjs`

**Interfaces:**
- Consumes: GitHub Actions macOS runners and `build/codex-thread-workbench` source snapshot.
- Produces: arm64/x64 helper packages containing the confirmation launch profile.

- [ ] **Step 1: Run the focused Mac contract test against current assets**

Run: `node --test tests/codex-thread-workbench-mac-download.test.mjs`

Expected: FAIL because published packages lack the confirmation launch profile.

- [ ] **Step 2: Ensure the workflow can run on the feature branch**

Add this branch to the workflow trigger while preserving the existing release branch behavior.

- [ ] **Step 3: Trigger remote builds after pushing the feature branch**

Use the GitHub workflow dispatch or the branch push. Let the workflow commit verified macOS parts only after its runner tests and package smoke checks pass.

- [ ] **Step 4: Verify the post-publish Mac test**

Run: `node --test tests/codex-thread-workbench-mac-download.test.mjs`

Expected: PASS with both architecture archives containing the helper profile.

### Task 4: Protect and verify the independent workbench release

**Files:**
- Modify if source tree changes require it: `.github/workflows/build-codex-multi-thread-workbench.yml`
- Modify if source tree changes require it: `scripts/verify-codex-multi-thread-workbench-source.mjs`
- Test: `tests/codex-multi-thread-workbench-download.test.mjs`
- Test: `tests/codex-multi-thread-workbench-mac-download.test.mjs`

**Interfaces:**
- Consumes: Immutable workbench snapshot tree pin.
- Produces: Existing multi-thread Windows and macOS package identities unchanged.

- [ ] **Step 1: Inspect immutable snapshot verification rules**

Compare the source snapshot hash contract with the modified shared build directory; only update a pin if remote CI would otherwise read a mismatched source tree.

- [ ] **Step 2: Run separate workbench tests**

Run: `node --test tests/codex-multi-thread-workbench-download.test.mjs tests/codex-multi-thread-workbench-mac-download.test.mjs`

Expected: PASS with `CodexThreadWorkbench` archive identity and unchanged URLs.

### Task 5: Publish and externally verify

**Files:**
- Modify: project release files generated above

**Interfaces:**
- Consumes: clean Hub feature branch, GitHub Actions, GitHub Pages.
- Produces: public Pages cards and four platform download pages matching their products.

- [ ] **Step 1: Run scoped static verification**

Run the four Codex download/page tests and the exact platform-artifact test pattern; do not run the global suite.

- [ ] **Step 2: Commit, push, and merge through the normal GitHub flow**

Confirm remote write access, push the feature branch, merge without force push, then wait for Pages and macOS workflows.

- [ ] **Step 3: Verify public output**

Reconstruct the public Windows and Mac downloads; inspect file names, launch-profile JSON, README headings, URLs, and the two Hub card badges on desktop and mobile.
