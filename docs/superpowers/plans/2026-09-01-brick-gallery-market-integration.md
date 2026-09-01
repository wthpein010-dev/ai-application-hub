# 砖块小人图鉴与随身小物市场联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing brick copy preview into a 45-character, game-faithful gallery with detail copy diagnostics, link it with the trinket market, and publish the complete experience through the AI Application Hub.

**Architecture:** A deterministic Node synchronizer joins the Unity skin, block, and language tables and copies only referenced art into the static Hub project. The new default page is a modular gallery/detail application; the former monolithic table moves unchanged to a legacy copy-review page. Focused data/diagnostic modules are unit-tested, Playwright owns actual layout and interactions, and existing market tests protect drag/theme/edit behavior.

**Tech Stack:** HTML, CSS, browser JavaScript modules, JSON, Node test runner, Playwright, ffmpeg/H.264, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-01-brick-gallery-market-integration-design.md`

## Global Constraints

- Use the confirmed local PawsHomeClient checkout via `PAWS_HOME_CLIENT_ROOT`; do not publish its absolute path or modify its tracked/untracked files.
- Public project ID remains `brick-character-copy-preview`; do not create a duplicate Hub project.
- Sync exactly 45 `show == "1"` records, sorted by `stringsequence`, with exact `zh` copy.
- Default state is all unlocked and the game-style gallery; the old table remains at `copy-review.html`.
- Preserve all trinket-market behavior and its public editing affordances.
- Do not run ClickFlow suites locally.
- Do not publish local paths, credentials, empty downloads, Unity `.meta` files, or unrelated assets.
- Tutorial MP4 must be H.264, 1280×720, 30–60 seconds, with one visible subtitle line per cue.

---

### Task 1: Lock the Unity synchronization and diagnostic contracts

**Files:**
- Create: `scripts/sync-brick-gallery-from-unity.mjs`
- Create: `projects/brick-character-copy-preview/core/copy-diagnostics.js`
- Generate: `projects/brick-character-copy-preview/data/characters.json`
- Generate: `projects/brick-character-copy-preview/assets/skin/**`
- Sync: `projects/brick-character-copy-preview/assets/ui/**`
- Create: `tests/brick-gallery-data.test.mjs`
- Create: `tests/brick-gallery-diagnostics.test.mjs`

**Interfaces:**
- `syncBrickGallery({ unityRoot, projectRoot }): Promise<Character[]>`
- `visualPositionCount(text): number`
- `wrapByVisualPositions(text, limit): string[]`
- `diagnoseCopy(character, renderedMetrics?): CopyDiagnostic`

- [ ] Write failing tests for 45 unique roles, exact approved display order, resolved copy, referenced asset existence, stable sequence, 3–5/15/12×3 limits, punctuation/orphan detection, and half-width counting.
- [ ] Run `node --test tests/brick-gallery-data.test.mjs tests/brick-gallery-diagnostics.test.mjs` and confirm red on missing modules/data.
- [ ] Implement the synchronizer and diagnostic helpers, then run the synchronizer against the confirmed Unity root.
- [ ] Run the same focused tests and confirm green; run the synchronizer twice and assert the second `git diff` is empty for generated paths.

### Task 2: Build the default 3×4 gallery and game-style detail

**Files:**
- Move: `projects/brick-character-copy-preview/index.html` to `copy-review.html`
- Create: `projects/brick-character-copy-preview/index.html`
- Create: `projects/brick-character-copy-preview/styles.css`
- Create: `projects/brick-character-copy-preview/app.js`
- Rewrite: `tests/brick-character-copy-preview-browser-smoke.mjs`
- Modify: `tests/brick-character-copy-preview-publish.test.mjs`

**Interfaces:**
- Consumes generated `data/characters.json` and copied layer/UI assets.
- Exposes stable DOM contracts for `#character-grid`, `#gallery-count`, `#gallery-page`, `#detail-dialog`, `#detail-description`, `#copy-diagnostics`, previous/next/favorite/share controls, and `?character=<blockId>` deep links.

- [ ] Update static and browser tests first: default 45/45, 12 cards on page 1, 3×4 geometry, search, four pages, all unlocked, click/keyboard detail, previous/next across pages, favorites, close/restore focus, exact text, measured line count, no overflow, and old page upload regression.
- [ ] Run the focused tests and confirm failures against the old table-first implementation.
- [ ] Preserve the old page as `copy-review.html`; implement semantic gallery/detail HTML, responsive 750-unit CSS, layered character art, entrance/idle motion, search/pagination/favorites, copy diagnostics, deep links, and accessible focus behavior.
- [ ] Run static/unit/browser tests at 1440×900, 750×1334, and 390×844; confirm zero failures/errors/404s and no body overflow.

### Task 3: Add two-way navigation without regressing the market

**Files:**
- Modify: `projects/trinket-market/index.html`
- Modify only if necessary: `projects/trinket-market/styles.css`
- Modify: `tests/trinket-market-page.test.mjs`
- Modify: `tests/trinket-market-browser-smoke.mjs`
- Modify: `tests/brick-character-copy-preview-browser-smoke.mjs`

- [ ] Add failing assertions for a visible `砖块小人图鉴` market-header link and a `随身小物交易市场` gallery link.
- [ ] Run the focused market/gallery tests and confirm red only on missing navigation.
- [ ] Add the two links with keyboard-visible states and responsive header layout.
- [ ] Rerun all trinket-market core/page/publish/browser tests plus gallery tests; verify scheme A, daylight theme, price toggle, local editing, sort, count bridge, and cross-row drag are unchanged.

### Task 4: Update Hub metadata, showcase media, and tutorial

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `hub-project-media.js`
- Replace: `assets/hub-showcase/brick-character-copy-preview.webp`
- Modify: `scripts/build-brick-character-copy-preview-video.mjs`
- Modify: `projects/brick-character-copy-preview/video/index.html`
- Modify: `projects/brick-character-copy-preview/video/tutorial-script.md`
- Replace: `projects/brick-character-copy-preview/video/poster.jpg`
- Replace: `projects/brick-character-copy-preview/video/brick-character-copy-preview-demo.mp4`
- Modify: `projects/brick-character-copy-preview/video/brick-character-copy-preview-demo.vtt`
- Modify: `tests/brick-character-copy-preview-publish.test.mjs`
- Modify: `tests/brick-video-loading.test.mjs`

- [ ] Write failing publication/media assertions for the updated Hub name/45-role copy, real gallery showcase, video contents, H.264 1280×720 30–60 seconds, and one-line captions.
- [ ] Update metadata and browser recorder to demonstrate gallery, character detail, line diagnostics, previous/next, favorite, old copy review, and market navigation.
- [ ] Capture the real 1440×900 showcase and generate the tutorial/poster; verify dimensions, duration, codec, lazy player, captions and absence of recorder errors.
- [ ] Run the Hub publication, media, subpage, card layout, video coverage and browser player tests (excluding ClickFlow).

### Task 5: Release verification, review, merge, Pages audit, and memory

**Files:**
- Modify only when verification exposes a real defect.
- Update: the external `AI-Application-Hub.md` project-memory record after public verification.
- Update the matching PawsHome/麻将竞品 project memory when present.

- [ ] Run `git diff --check origin/main...HEAD`, focused brick/market tests, applicable Hub tests, `npm run audit:hub`, and real-browser entry/video smoke tests. Do not run local ClickFlow suites.
- [ ] Request code review against the spec and `origin/main`; resolve every Critical/Important finding and rerun affected gates.
- [ ] Fetch/rebase current `origin/main`, rerun release gates, push the feature branch, open and normally merge a PR without force.
- [ ] Wait for the exact merged-main SHA in Pages and Hub validation workflows; require `success`.
- [ ] Verify public Hub, gallery, legacy review, market, video, poster, VTT and MP4 URLs, including desktop/mobile interactions, MP4 Range `206`, caption playback, media hashes, no console errors/404s and no horizontal overflow.
- [ ] Record the merged SHA, workflow evidence, public URLs, test counts, media metadata/hash and final project state in long-term memory without credentials.
