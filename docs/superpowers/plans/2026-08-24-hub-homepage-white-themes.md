# AI Application Hub White Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a clean white-first Hub homepage with a persistent four-theme switcher, a horizontal filter workspace, more scannable cards, and responsive interaction while preserving the catalog and editing behavior.

**Architecture:** Keep `app-20260706-restore-games.js` as the catalog and migration authority. Make bounded HTML changes for the header, theme menu, and filter toolbar; replace the accumulated homepage CSS with one token-driven responsive stylesheet; add small theme and filter-chip functions to the existing runtime. Protect the behavior with source-contract Node tests and browser checks.

**Tech Stack:** Static HTML, CSS custom properties, vanilla JavaScript, Node.js built-in test runner, browser automation.

**Spec:** `docs/superpowers/specs/2026-08-24-hub-homepage-white-themes-design.md`

## Global Constraints

- Default theme is clean white.
- Theme choices are `clean`, `mist`, `coral`, and `night` and persist independently from editable copy.
- Preserve existing catalog order, URLs, selected-card behavior, page-text storage, app storage, and corruption migration.
- Wide desktop uses four cards per row; tablet uses two; mobile uses one.
- Public action labels are `网页预览`, `介绍视频`, `Wins下载`, `Mac下载`, and `iOS安装`.
- Never run an unfiltered `node --test`; never run or build ClickFlow locally on Windows.

---

### Task 1: Homepage Redesign Contract

**Files:**
- Create: `tests/hub-home-redesign.test.mjs`
- Modify: `tests/card-action-layout.test.mjs`

**Interfaces:**
- Consumes: existing `index.html`, `styles.css`, and `app-20260706-restore-games.js` source contracts.
- Produces: executable assertions for theme markup, white default tokens, horizontal filtering, four-column layout, concise tags, and public action labels.

- [ ] **Step 1: Write failing tests**

Add assertions that `index.html` exposes `#themeToggle`, `#themeMenu`, `#typeChips`, and a `data-theme="clean"` default; that the runtime defines `THEME_STORAGE_KEY`, validates four theme IDs, persists the chosen theme, and synchronizes type chips; that card rendering slices tags to two; and that CSS defines a four-column application grid plus mobile breakpoints.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test tests/hub-home-redesign.test.mjs tests/card-action-layout.test.mjs
```

Expected: failures for missing theme/menu/chip markup and old `演示` / `视频` labels.

- [ ] **Step 3: Keep the failing output as the implementation target**

Do not weaken existing catalog, accessibility, carousel, or migration assertions.

### Task 2: Theme And Workspace Markup

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: existing IDs queried by the runtime and selectors in `pageTextTargets`.
- Produces: `#themeToggle`, `#themeMenu`, `#themeOptions`, `#typeChips`, and the horizontal `.filter-toolbar` structure.

- [ ] **Step 1: Add white-first boot markup**

Set `data-theme="clean"` on `<html>` and add a short head bootstrap that accepts only `clean`, `mist`, `coral`, or `night` from `ai-competition-hub-theme` before first paint.

- [ ] **Step 2: Add the theme control**

Place the theme button and menu before Update/Edit. Give the menu an accessible heading and a runtime-populated options host.

- [ ] **Step 3: Convert the filter rail into a toolbar**

Keep all existing input/select IDs and labels, add `#typeChips`, and group search, category, hidden-compatible type select, and sort controls in a single horizontal toolbar.

- [ ] **Step 4: Refresh asset versions**

Update CSS and runtime query strings with `20260824-white-workspace-themes`.

### Task 3: Theme And Filter Behavior

**Files:**
- Modify: `app-20260706-restore-games.js`

**Interfaces:**
- Consumes: `#themeToggle`, `#themeMenu`, `#themeOptions`, `#typeChips`, existing `state.status`, and existing `render()`.
- Produces: `normalizeTheme(theme)`, `loadTheme()`, `applyTheme(theme, persist)`, `renderThemeOptions()`, `setThemeMenu(open)`, `renderTypeChips()`, and `syncTypeChips()`.

- [ ] **Step 1: Implement the theme model**

Define four frozen theme records with Chinese names and descriptions. Validate stored values, update `document.documentElement.dataset.theme`, persist only on user selection, and update checked/expanded states.

- [ ] **Step 2: Implement menu interactions**

Support click toggle, option selection, Escape, click-outside close, and one-at-a-time `aria-checked` state.

- [ ] **Step 3: Implement public type chips**

Render `全部应用` plus the six application types. Clicking a chip updates `state.status`, mirrors `#statusFilter`, renders once, and keeps `aria-pressed` synchronized.

- [ ] **Step 4: Make card content concise**

Render two visible tags and a `+N` marker, keep type/category/title/description, and change public action labels without changing URLs or order.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the two Task 1 tests and keep editing until both pass.

### Task 4: Token-Driven Responsive Visual System

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: the existing semantic class names plus new `.theme-control`, `.theme-menu`, `.filter-toolbar`, and `.type-chips` markup.
- Produces: four theme token sets, a compact sticky header, reduced-height hero, sticky filter toolbar, four/two/one-column grids, aligned card actions, and accessible mobile layouts.

- [ ] **Step 1: Define four token sets**

Use semantic variables for page, surfaces, text, muted text, lines, primary/secondary accents, shadows, selected states, and platform actions. Keep `clean` as the unqualified fallback and declare `color-scheme` per theme.

- [ ] **Step 2: Rebuild header and hero layout**

Use a quiet white workspace default, stable button dimensions, a two-column hero under 520px tall on desktop, and a one-column mobile hero.

- [ ] **Step 3: Rebuild workspace and cards**

Make the toolbar sticky, use a four-column grid at wide desktop, clamp descriptions to three lines, align actions to the bottom, and show a clear selected outline without replaying entrance animation.

- [ ] **Step 4: Rebuild secondary sections and editor**

Style platforms, maintenance, and the existing editor panel using the same tokens. Avoid cards nested inside decorative cards.

- [ ] **Step 5: Add reduced-motion and focus rules**

Disable ambient and entrance movement under `prefers-reduced-motion`, and provide visible `:focus-visible` outlines in every theme.

### Task 5: Regression And Browser Verification

**Files:**
- Modify: `tests/hub-home-redesign.test.mjs` only if a genuine test defect is found before implementation.

**Interfaces:**
- Consumes: final homepage files served over HTTP.
- Produces: desktop/mobile screenshots and verified interaction behavior.

- [ ] **Step 1: Run scoped Node regression**

Run only the explicit Hub tests:

```powershell
node --test tests/hub-home-redesign.test.mjs tests/card-action-layout.test.mjs tests/hub-card-selection.test.mjs tests/hub-carousel-status.test.mjs tests/hub-home-accessibility.test.mjs tests/hub-page-text-migration.test.mjs tests/hub-tool-taxonomy.test.mjs
```

- [ ] **Step 2: Start a local static server**

Serve the worktree on an unused localhost port and keep the session alive through browser verification.

- [ ] **Step 3: Verify desktop**

At 1440x900 confirm clean theme by default, four cards per row, type-chip filtering, selected-card synchronization, theme menu behavior, theme persistence after reload, no horizontal overflow, and no console errors.

- [ ] **Step 4: Verify mobile**

At 390x844 confirm one-column cards, horizontally usable type chips, two-row header, reachable theme menu, readable hero, no overlaps, and no horizontal overflow.

- [ ] **Step 5: Verify local-storage preservation**

Inject custom page text and an existing selected project, reload, and verify both survive theme changes.

### Task 6: Publish And Public Acceptance

**Files:**
- Modify: project memory only after verified deployment.

**Interfaces:**
- Consumes: reviewed branch commit and GitHub Pages workflows.
- Produces: merged `main`, successful Pages deployment, and public desktop/mobile evidence.

- [ ] **Step 1: Review the final diff**

Confirm changes are limited to homepage design, runtime interaction, tests, and design documents; confirm no project links or catalog entries changed.

- [ ] **Step 2: Commit and push**

Commit on `feat/hub-homepage-white-themes-20260824`, rebase or merge latest `origin/main` without force, then push the reviewed commit to `main` according to the Hub release workflow.

- [ ] **Step 3: Wait for remote checks**

Require GitHub Pages and the applicable Hub verification workflow to complete for the exact published SHA. Do not run ClickFlow locally.

- [ ] **Step 4: Verify public Pages**

Repeat default theme, theme persistence, filter, selected-card, desktop/mobile overflow, resource, and console checks at `https://wthpein010-dev.github.io/ai-application-hub/index.html`.

- [ ] **Step 5: Record the confirmed release**

Update AI Application Hub project memory with date, final SHA, workflow results, public URL, and verification scope.
