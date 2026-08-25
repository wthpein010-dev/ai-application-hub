# Hub Interactive Project Atlas Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate, locally served interactive redesign preview for the AI Application Hub using all 29 current projects and their real links, without changing or publishing the production homepage.

**Architecture:** A build script reads the production `defaultApps` data through the existing tested helper and emits a preview-only data module. The preview is a dependency-free static HTML/CSS/JavaScript application under `design-previews/hub-interactive-atlas/`; its state layer owns selection, filtering, ordering, theme persistence, reduced-motion behavior, and synchronized rendering of the featured stage and three catalog sections.

**Tech Stack:** Semantic HTML5, CSS custom properties and container/media queries, browser-native JavaScript modules, Node.js built-in test runner, existing Playwright dependency for browser verification.

**Spec:** `docs/superpowers/specs/2026-08-25-hub-interactive-project-atlas-design.md`

## Global Constraints

- Production `index.html`, `styles.css`, `app-20260706-restore-games.js`, project files, platform packages, and public GitHub Pages must remain unchanged.
- Preview data must contain exactly the 29 current `defaultApps` records in original order and retain real web, video, Windows, macOS, and iOS URLs; the Windows local renderer must exclude `clickflow` before creating DOM and must never request its assets or links.
- Default theme is clean white; alternate themes are mist, coral, and night.
- Visible interface text is at least 12px; normal body copy is at least 13px and reaches WCAG AA contrast.
- Desktop uses four catalog columns, tablet two, and mobile one; `1440x900`, `1024x768`, and `390x844` must not overflow horizontally.
- Entrance motion runs only on first load; filtering and selection do not replay it; `prefers-reduced-motion: reduce` removes parallax, magnetic motion, and movement transitions.
- Windows local commands must explicitly target preview tests and must never run, build, display, download, or regenerate ClickFlow.
- The preview must be served from the repository root so real relative project URLs resolve, but preview action clicks are intercepted and displayed as link destinations rather than launching downloads.

---

### Task 1: Real catalog data adapter

**Files:**
- Create: `scripts/build-hub-atlas-preview-data.mjs`
- Create: `design-previews/hub-interactive-atlas/data.generated.js`
- Create: `tests/hub-interactive-atlas-preview.test.mjs`
- Read: `tests/helpers/default-apps.mjs`
- Read: `app-20260706-restore-games.js`

**Interfaces:**
- Consumes: `loadDefaultAppsFromRuntime(runtime: string): object[]` from `tests/helpers/default-apps.mjs`.
- Produces: `buildPreviewProjects(apps: object[]): PreviewProject[]` and browser module export `projects: PreviewProject[]`.
- `PreviewProject` fields: `id`, `name`, `category`, `kind`, `badge`, `brief`, `problem`, `aiUse`, `tags`, `actions`, `visual`.

- [ ] **Step 1: Write the failing data coverage test**

```js
test("preview data mirrors every production project in order", async () => {
  const sourceApps = loadDefaultAppsFromRuntime(runtime);
  const generated = await import(pathToFileURL(dataFile));
  assert.equal(generated.projects.length, 29);
  assert.deepEqual(generated.projects.map(({ id }) => id), sourceApps.map(({ id }) => id));
  assert.ok(generated.projects.every(({ actions }) => actions.every(({ href }) => href && href !== "#")));
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: FAIL because `design-previews/hub-interactive-atlas/data.generated.js` does not exist.

- [ ] **Step 3: Implement deterministic data normalization and generation**

The build script must map `status === "game"` to `game`, `status === "ai" || status === "engineering"` to `engineering`, and every other status to `app`. It must normalize string and object platform values into action records using the labels `网页预览`, `介绍视频`, `Wins下载`, `Mac下载`, and `iOS安装`. It must assign deterministic visual tokens from a fixed palette based on project id and write an ES module with `export const projects = ...`.

- [ ] **Step 4: Generate data and rerun the focused test**

Run: `node scripts/build-hub-atlas-preview-data.mjs`

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: PASS with 29 projects, preserved order, three kinds, and no empty action URLs.

- [ ] **Step 5: Commit the adapter and generated data**

```powershell
git add --sparse -- scripts/build-hub-atlas-preview-data.mjs design-previews/hub-interactive-atlas/data.generated.js tests/hub-interactive-atlas-preview.test.mjs
git commit -m "feat: generate atlas preview catalog data"
```

### Task 2: Semantic preview shell and responsive visual system

**Files:**
- Create: `design-previews/hub-interactive-atlas/index.html`
- Create: `design-previews/hub-interactive-atlas/styles.css`
- Modify: `tests/hub-interactive-atlas-preview.test.mjs`

**Interfaces:**
- Consumes: DOM ids `themeToggle`, `themeMenu`, `heroStage`, `heroContent`, `heroVisual`, `typeRail`, `searchInput`, `sortSelect`, `appGrid`, `gameGrid`, `engineeringGrid`, and `linkInspector`.
- Produces: semantic regions and stable class hooks used by `app.js` and browser tests.

- [ ] **Step 1: Add failing structural and CSS contract tests**

```js
test("preview shell exposes the approved stage, filter rail, and three catalogs", () => {
  for (const id of ["heroStage", "typeRail", "searchInput", "appGrid", "gameGrid", "engineeringGrid"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "u"));
  }
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*grid-template-columns:\s*1fr/u);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  assert.doesNotMatch(css, /font-size:\s*(?:9|10|11)px/u);
});
```

- [ ] **Step 2: Run the focused test and verify the missing shell failure**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: FAIL because the preview HTML and CSS do not exist.

- [ ] **Step 3: Implement the semantic HTML shell**

Create a compact sticky header, a full-width featured stage, a single-line stat strip, a sticky search/category/sort rail, and separate application, game, and engineering sections. Include a non-blocking link inspector dialog so preview actions can reveal their real destination without starting downloads.

- [ ] **Step 4: Implement the four-theme responsive CSS system**

Define clean, mist, coral, and night token sets; an ink/white default; mint, orange, and blue kind accents; an 8px-or-less radius system; a subtle dot-field stage; four/two/one-column grids; stable card dimensions; visible keyboard focus; selected-card treatment; and reduced-motion overrides.

- [ ] **Step 5: Rerun the focused test**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: PASS for shell ids, responsive grid contracts, motion fallback, and text size floor.

- [ ] **Step 6: Commit the shell and visual system**

```powershell
git add --sparse -- design-previews/hub-interactive-atlas/index.html design-previews/hub-interactive-atlas/styles.css tests/hub-interactive-atlas-preview.test.mjs
git commit -m "feat: build interactive atlas preview shell"
```

### Task 3: State, filtering, selection, themes, and safe action inspection

**Files:**
- Create: `design-previews/hub-interactive-atlas/app.js`
- Modify: `tests/hub-interactive-atlas-preview.test.mjs`

**Interfaces:**
- Consumes: `projects` from `data.generated.js` and the DOM ids defined in Task 2.
- Produces: `createState(projects)`, `filterProjects(projects, state)`, `selectProject(id, options)`, `setTheme(theme)`, `renderHero(project)`, `renderCatalog()`, `openLinkInspector(action, project)`, and `initAtlas()`.

- [ ] **Step 1: Add failing source contracts for state and accessible selection**

```js
test("preview runtime owns synchronized selection without replaying entrance motion", () => {
  assert.match(appJs, /function selectProject\(/u);
  assert.match(appJs, /aria-current/u);
  assert.match(appJs, /history\.replaceState/u);
  assert.match(appJs, /hasCompletedIntro/u);
  assert.match(appJs, /function openLinkInspector\(/u);
  assert.match(appJs, /localStorage\.setItem\(THEME_STORAGE_KEY/u);
});
```

- [ ] **Step 2: Run the focused test and verify the missing runtime failure**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: FAIL because `app.js` does not exist.

- [ ] **Step 3: Implement state and pure filtering rules**

State fields are `selectedId`, `type`, `query`, `sort`, `theme`, and `hasCompletedIntro`. `createState` first derives `visibleProjects = projects.filter(({ id }) => id !== "clickflow")`; no renderer or interaction receives the excluded item. Filtering preserves production order unless sort is `name` or `category`; type values are `all`, the six app badges, `game`, and `engineering`. Search normalizes case and matches name, category, badge, brief, problem, and tags.

- [ ] **Step 4: Implement synchronized rendering and keyboard behavior**

Selecting a card updates `aria-current`, the featured stage, progress, the URL `?project=<id>`, and focus when selection originates from keyboard. Enter and Space select cards; ArrowLeft and ArrowRight switch projects in production order; actions stop card selection and open the inspector.

- [ ] **Step 5: Implement theme persistence and first-load-only motion**

Persist the four allowed themes under `hub-atlas-preview-theme`. Add `is-intro` only during the first render, remove it after animation completion, and never restore it during filtering or selection. Pointer effects must be disabled for coarse pointers and reduced motion.

- [ ] **Step 6: Rerun the focused test**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: PASS for state contracts, theme persistence, selected semantics, and first-load-only motion.

- [ ] **Step 7: Commit the runtime**

```powershell
git add --sparse -- design-previews/hub-interactive-atlas/app.js tests/hub-interactive-atlas-preview.test.mjs
git commit -m "feat: add atlas preview interactions"
```

### Task 4: Real visual assets, deterministic covers, and platform clarity

**Files:**
- Create: `design-previews/hub-interactive-atlas/visual-assets.js`
- Create: `design-previews/hub-interactive-atlas/assets/atlas-avatar.png`
- Create: `design-previews/hub-interactive-atlas/assets/game-preview.png`
- Create: `design-previews/hub-interactive-atlas/assets/companion-preview.png`
- Modify: `design-previews/hub-interactive-atlas/app.js`
- Modify: `design-previews/hub-interactive-atlas/styles.css`
- Modify: `tests/hub-interactive-atlas-preview.test.mjs`

**Interfaces:**
- Consumes: project id, name, kind, category, visual tokens, and selected action availability.
- Produces: `visualForProject(project): { src: string, alt: string } | { cover: true, mark: string }` and image fallback behavior that preserves card dimensions.

- [ ] **Step 1: Add failing visual and platform tests**

```js
test("preview uses real local imagery where available and deterministic covers elsewhere", () => {
  assert.match(visualJs, /visualForProject/u);
  assert.match(visualJs, /codex-quota-bar/u);
  assert.match(visualJs, /minigame-project-tool/u);
  assert.match(appJs, /data-platform/u);
  assert.match(appJs, /image-fallback/u);
});
```

- [ ] **Step 2: Run the focused test and verify the missing visual module failure**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Expected: FAIL because `visual-assets.js` and preview asset copies do not exist.

- [ ] **Step 3: Copy only the three existing Hub assets into the preview**

Use `assets/app-avatar.png`, `assets/minigame-project-simulator-preview.png`, and `assets/hero-ai-companion.png`. The preview copies keep the source bytes and document their project mapping in `visual-assets.js`; no project or video directories are copied.

- [ ] **Step 4: Implement deterministic typographic covers and image fallback**

Known mapped projects render real imagery. Every other project renders a CSS cover using the project initials, kind accent, fixed pattern, category, and platform marks. Image errors replace the image with the same cover without changing card or hero dimensions.

- [ ] **Step 5: Render platform availability directly in stage and cards**

Use labeled icon buttons for `网页预览`, `介绍视频`, `Wins下载`, `Mac下载`, and `iOS安装`; unavailable platforms render a compact muted state rather than an action. All action clicks open the link inspector with the exact URL.

- [ ] **Step 6: Rerun focused tests and verify copied hashes**

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Run: `Get-FileHash assets/app-avatar.png,design-previews/hub-interactive-atlas/assets/atlas-avatar.png,assets/minigame-project-simulator-preview.png,design-previews/hub-interactive-atlas/assets/game-preview.png,assets/hero-ai-companion.png,design-previews/hub-interactive-atlas/assets/companion-preview.png -Algorithm SHA256`

Expected: Tests PASS; each source/copy pair has identical SHA-256.

- [ ] **Step 7: Commit visual integration**

```powershell
git add --sparse -- design-previews/hub-interactive-atlas tests/hub-interactive-atlas-preview.test.mjs
git commit -m "feat: add atlas project visuals and platform states"
```

### Task 5: Browser QA, polish, and local review handoff

**Files:**
- Create: `tests/hub-interactive-atlas-preview-browser-smoke.mjs`
- Modify: `design-previews/hub-interactive-atlas/index.html`
- Modify: `design-previews/hub-interactive-atlas/styles.css`
- Modify: `design-previews/hub-interactive-atlas/app.js`
- Modify: `tests/hub-interactive-atlas-preview.test.mjs`

**Interfaces:**
- Consumes: static preview at `/design-previews/hub-interactive-atlas/index.html`.
- Produces: browser assertions and screenshots for desktop, tablet, mobile, clean/night themes, filtering, selection synchronization, action inspector, keyboard focus, reduced motion, and image fallback.

- [ ] **Step 1: Write browser smoke coverage before final polish**

The script must launch installed Chrome/Edge through Playwright, serve the repository root on an ephemeral loopback port, and assert at `1440x900`, `1024x768`, and `390x844`: no horizontal overflow, no console/page/request errors, readable text floor, exactly 28 rendered cards before filtering, zero `clickflow` nodes or requests, four/two/one columns, card-to-stage selection sync, no reintroduced `is-intro`, theme persistence, reduced-motion transform suppression, and image fallback stability.

- [ ] **Step 2: Run the browser smoke test and record any failures**

Run: `node tests/hub-interactive-atlas-preview-browser-smoke.mjs`

Expected: Initial run may report layout or interaction defects; every reported defect becomes a focused assertion before the fix.

- [ ] **Step 3: Apply focused CSS and runtime fixes**

Fix only defects proven by the browser checks: text contrast, overflow, clipping, control alignment, focus visibility, selection synchronization, or motion replay. Do not change production files.

- [ ] **Step 4: Run complete preview verification**

Run: `node scripts/build-hub-atlas-preview-data.mjs`

Run: `node --test tests/hub-interactive-atlas-preview.test.mjs`

Run: `node tests/hub-interactive-atlas-preview-browser-smoke.mjs`

Run: `git diff --check`

Expected: All preview checks PASS, no console/page/request failures, and no whitespace errors.

- [ ] **Step 5: Commit the verified preview**

```powershell
git add --sparse -- design-previews/hub-interactive-atlas scripts/build-hub-atlas-preview-data.mjs tests/hub-interactive-atlas-preview.test.mjs tests/hub-interactive-atlas-preview-browser-smoke.mjs
git commit -m "test: verify interactive atlas preview"
```

- [ ] **Step 6: Start the local preview and open it for review**

Run a repository-root static server on an unused loopback port, then open `/design-previews/hub-interactive-atlas/index.html` in the in-app browser. Keep the server running and provide the local URL. Do not push or publish the preview and do not modify the production homepage until the user explicitly confirms the rendered result.
