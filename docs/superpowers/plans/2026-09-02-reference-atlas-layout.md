# Reference Atlas Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the brick-character atlas as a screenshot-aligned landscape workspace driven by blockskin and language spreadsheet data.

**Architecture:** A small zero-dependency XLSX reader feeds a spreadsheet sync function that emits the existing public character JSON contract plus source keys. The selected character is the state source for the reward preview, list card, detail stage and diagnostics.

**Tech Stack:** Node.js ESM, Node test runner, Playwright, static HTML/CSS/JavaScript, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-02-reference-atlas-design.md`

## Global Constraints

- Source tables are read-only; source machine paths never enter public files.
- Use `Sheet1/show/stringsequence` from blockskin and `language0/id/zh` from language.
- Preserve 45 roles, layered fallback, complete preview art and default-unlocked behavior.
- Keep desktop panels aligned horizontally; narrow screens cannot overflow.

### Task 1: Spreadsheet catalog

**Files:** Create `scripts/lib/xlsx-sheet-reader.mjs`, `scripts/sync-brick-gallery-from-spreadsheets.mjs`; modify `scripts/sync-brick-gallery-from-unity.mjs`, `tests/brick-gallery-data.test.mjs`.

**Interfaces:** `readWorkbookSheet(xlsxPath, sheetName): string[][]`; `buildBrickGalleryDataFromSpreadsheets({ dataRoot }): Character[]`; `Character.sourceKeys = { name, unowned, unlock, gallery }`.

- [ ] Write a data test that expects 45 visible skins, first block ID `100001`, four source keys and Chinese name `原皮战神`.
- [ ] Run `node --test tests/brick-gallery-data.test.mjs`; verify the test fails because the spreadsheet module does not exist.
- [ ] Implement the ZIP/XML reader and mapper; reject missing sheets, duplicate IDs, missing language values and non-contiguous sequences.
- [ ] Run `node --test tests/brick-gallery-data.test.mjs`; verify all data tests pass.
- [ ] Commit with `feat: read brick gallery copy from spreadsheets`.

### Task 2: Reference composition

**Files:** Modify `projects/brick-character-copy-preview/index.html`, `components/character-view.js`, `app.js`, `styles.css`, `tests/brick-gallery-page.test.mjs`.

**Interfaces:** `renderRewardPreview({ character, elements })`; card `data-state` is `equipped`, `new` or `owned`; existing `renderCharacterDetail` remains available.

- [ ] Write a static page test for `#reward-preview`, `#atlas-close`, three desktop columns, and image-containment selectors.
- [ ] Run `node --test tests/brick-gallery-page.test.mjs`; verify it fails because the reward panel is absent.
- [ ] Add the reward stage, game-style close action, state labels, a compact detail stage and three aligned panels.
- [ ] Run `node --test tests/brick-gallery-page.test.mjs tests/brick-gallery-atlas-state.test.mjs`; verify all pass.
- [ ] Commit with `feat: align brick atlas with reward reference`.

### Task 3: Browser checks and release

**Files:** Modify `tests/brick-gallery-browser-smoke.mjs`, `tests/brick-gallery-inline-detail-browser-smoke.mjs`; refresh showcase/video only if their current composition is inaccurate.

- [ ] Write browser assertions that selecting block `100014` updates both `#reward-name` and `#detail-name`, and that card/detail images stay inside their containers.
- [ ] Run the new smoke suite and verify it fails before the responsive behavior is implemented.
- [ ] Apply the minimal style/rendering corrections and verify the smoke suite passes.
- [ ] Run focused Node and browser tests, market regression and `npm run audit:hub`.
- [ ] Commit remaining changes, publish through PR and GitHub Pages, then validate public Hub, atlas and video URLs.
