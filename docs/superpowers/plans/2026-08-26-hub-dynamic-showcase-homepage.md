# Hub Dynamic Showcase Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI Application Hub production homepage with the approved A “动态作品展馆” design while preserving all project data, editing behavior, platform links, ordering, themes, accessibility, and cross-platform browser support.

**Architecture:** Keep the current static HTML/CSS/JavaScript application and its existing project data as the single source of truth. Add a small project-media registry keyed by project id, render that registry through the existing spotlight and card functions, and replace only the homepage shell and visual layer; the existing editor, storage migration, taxonomy, action URLs, and navigation order remain intact.

**Tech Stack:** Semantic HTML5, CSS custom properties and responsive grid, browser-native JavaScript, Node.js built-in test runner, existing Playwright browser smoke infrastructure, committed WebP/JPEG/PNG media assets.

**Spec:** `docs/superpowers/specs/2026-08-26-hub-dynamic-showcase-homepage-design.md`

## Global Constraints

- Default theme is `clean`; existing `clean / mist / coral / night` persistence remains compatible with `ai-competition-hub-theme`.
- Preserve all 29 production project records, real action URLs, user-editable copy, six application categories, and navigation order `applications → games → engineering → first application`.
- The Windows local renderer must exclude `clickflow` before creating DOM; local browser tests must assert zero ClickFlow nodes and requests. Never locally run, build, display, download, or regenerate ClickFlow.
- Never run unfiltered `node --test`. Every local test command explicitly names non-ClickFlow test files.
- Visible UI text is at least `12px`; body copy is at least `13px`; clean, mist, coral, and night themes meet WCAG AA contrast.
- Desktop uses a four-column Bento baseline, tablet two columns, and mobile one column; layout spans are deterministic and disabled on mobile.
- Full entrance motion runs once. Selection, filtering, searching, sorting, editing, and theme changes do not replay it.
- Preserve `prefers-reduced-motion`, keyboard selection, `aria-current`, `aria-pressed`, editor `inert`, image failure fallback, and local-storage failure fallback.
- Do not modify project subpages, shared return buttons, video players, Unity/WebGL builds, or Windows/macOS/iOS packages.
- Production GitHub Pages is not changed until local static and browser verification passes.

## File Structure

- `hub-project-media.js`: browser global project-media registry; owns only `id → media metadata` and no project copy or URLs.
- `assets/hub-showcase/`: optimized project-owned thumbnails and stage images committed for GitHub Pages.
- `scripts/build-hub-showcase-media.mjs`: validates source definitions and creates bounded WebP/JPEG assets with the bundled `sharp` dependency; skips ClickFlow unconditionally on Windows.
- `scripts/hub-showcase-media-sources.json`: deterministic source path/capture specification for each non-ClickFlow project.
- `index.html`: semantic showcase stage, compact filter rail, three collection shells, unchanged editor fields, and cache-versioned asset references.
- `styles.css`: approved A visual system, four themes, Bento spans, responsive layouts, focus states, motion, and fallbacks.
- `app-20260706-restore-games.js`: existing state/data/editor runtime extended with media lookup, showcase rendering, media field editing, and Windows-local ClickFlow exclusion.
- `tests/hub-dynamic-showcase.test.mjs`: static contracts for media coverage, shell, CSS, runtime integration, motion, and production invariants.
- `tests/hub-dynamic-showcase-browser-smoke.mjs`: real-browser desktop/tablet/mobile, theme, selection, image, accessibility, reduced-motion, and ClickFlow-exclusion checks.
- Existing homepage tests: updated only where selectors or approved structure change; data, copy, taxonomy, action, storage, and ordering assertions remain.

---

### Task 1: Project media registry and optimized assets

**Files:**
- Create: `hub-project-media.js`
- Create: `assets/hub-showcase/*.webp`
- Create: `scripts/hub-showcase-media-sources.json`
- Create: `scripts/build-hub-showcase-media.mjs`
- Create: `tests/hub-dynamic-showcase.test.mjs`
- Read: `app-20260706-restore-games.js`
- Read: `tests/helpers/default-apps.mjs`

**Interfaces:**
- Produces: `globalThis.HUB_PROJECT_MEDIA: Readonly<Record<string, ProjectMedia>>`.
- `ProjectMedia`: `{ src: string, alt: string, position: string, layout: "standard" | "wide" | "tall", fallback: string }`.
- Consumes: production project ids returned by `loadDefaultAppsFromRuntime(runtime)`.

- [ ] **Step 1: Write the failing registry coverage test**

```js
test("project media registry covers every production id without loading ClickFlow locally", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const media = loadMediaRegistry(mediaRuntime);
  assert.deepEqual(Object.keys(media), apps.map(({ id }) => id));
  assert.equal(media.clickflow.src, "");
  assert.equal(media.clickflow.fallback, "ClickFlow 鼠标自动化");
  for (const app of apps.filter(({ id }) => id !== "clickflow")) {
    assert.match(media[app.id].src, /^\.\/assets\/hub-showcase\/[a-z0-9-]+\.(?:webp|jpg|png)$/u);
    const assetPath = join(root, media[app.id].src);
    assert.ok(existsSync(assetPath));
    assert.ok(statSync(assetPath).size <= 750 * 1024);
    assert.ok(media[app.id].alt.includes(app.name));
    assert.ok(["standard", "wide", "tall"].includes(media[app.id].layout));
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-registry failure**

Run: `node --test tests/hub-dynamic-showcase.test.mjs`

Expected: FAIL because `hub-project-media.js` and showcase assets do not exist.

- [ ] **Step 3: Define deterministic sources for all non-ClickFlow projects**

Write `scripts/hub-showcase-media-sources.json` in production order. Use existing UI screenshots, tutorial frames, posters, or public-page captures for the corresponding project only. The exact source groups are:

```json
{
  "hub": { "mode": "file", "source": "assets/hero-ai-companion.png", "layout": "wide" },
  "gamepulse-mini-radar": { "mode": "capture", "entry": "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site", "layout": "wide" },
  "icecream": { "mode": "capture", "entry": "./projects/icecream/index.html", "layout": "standard" },
  "vita-mahjong": { "mode": "capture", "entry": "./projects/vita-mahjong/index.html", "layout": "standard" },
  "zhuanglege-sha": { "mode": "capture", "entry": "./projects/zhuanglege-sha/index.html", "layout": "standard" },
  "paws-home-client": { "mode": "capture", "entry": "./projects/paws-home-client/index.html", "layout": "wide" },
  "paws-level-editor": { "mode": "capture", "entry": "./projects/paws-level-editor/index.html", "layout": "wide" },
  "fill-what": { "mode": "capture", "entry": "./projects/fill-what/index.html", "layout": "standard" },
  "codex-quota-bar": { "mode": "capture", "entry": "./projects/codex-quota-bar/index.html", "layout": "standard" },
  "codex-thread-workbench": { "mode": "capture", "entry": "./projects/codex-thread-workbench/index.html", "layout": "wide" },
  "web-media-collector": { "mode": "capture", "entry": "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html", "layout": "standard" },
  "xiang-le-ge-xiang": { "mode": "capture", "entry": "./projects/xiang-le-ge-xiang/index.html", "layout": "standard" },
  "minigame-project-simulator": { "mode": "file", "source": "projects/minigame-project-tool/video/frames/05-output.png", "layout": "wide" },
  "ai-game-requirements-workshop": { "mode": "file", "source": "projects/ai-game-requirements-workshop/video/poster.jpg", "layout": "wide" },
  "planner-daily-quiz": { "mode": "capture", "entry": "./projects/planner-daily-quiz/index.html", "layout": "standard" },
  "travel-generator": { "mode": "file", "source": "projects/朋友圈发图神器/01_作品体验入口/app/assets/demo/xinjiang/ff7859e9-705f-4f32-b07d-4da6b989449c.png", "layout": "tall" },
  "feishu-downloader": { "mode": "capture", "entry": "./projects/飞书文件批量下载插件/index.html", "layout": "standard" },
  "codex-reviewer": { "mode": "file", "source": "projects/Codex对话评分工具/视频资源/frames/05-workbook.png", "layout": "wide" },
  "codex-habit-tool": { "mode": "capture", "entry": "./projects/codex-habit-tool/index.html", "layout": "standard" },
  "wanhuatong": { "mode": "capture", "entry": "./projects/万话筒/index.html", "layout": "standard" },
  "brick-light-motion-lab": { "mode": "capture", "entry": "./projects/brick-light-motion-lab/index.html", "layout": "wide" },
  "nang-keng-pai-pai-xiang": { "mode": "capture", "entry": "./projects/nang-keng-pai-pai-xiang/index.html", "layout": "standard" },
  "pureshrink": { "mode": "capture", "entry": "./projects/pureshrink/index.html", "layout": "standard" },
  "planmap": { "mode": "capture", "entry": "./projects/planmap/index.html", "layout": "wide" },
  "simuai": { "mode": "capture", "entry": "./projects/simuai/index.html", "layout": "wide" },
  "brick-character-copy-preview": { "mode": "capture", "entry": "./projects/brick-character-copy-preview/index.html", "layout": "standard" },
  "gamespec-relay": { "mode": "capture", "entry": "./projects/gamespec-relay/index.html", "layout": "wide" },
  "x-ai-codex-radar": { "mode": "capture", "entry": "./projects/x-ai-codex-radar/index.html", "layout": "wide" }
}
```

The script adds the `clickflow` fallback entry in the generated registry without opening or reading its project page.

- [ ] **Step 4: Implement asset generation and the browser registry**

`build-hub-showcase-media.mjs` must resolve `sharp` with `createRequire` from `CODEX_NODE_MODULES` and the bundled runtime path, resize file sources to at most `1440×900`, encode WebP at quality `82`, and emit lowercase ASCII filenames. Capture sources use the existing Playwright resolution pattern and an installed Chrome/Edge executable, wait for `document.fonts.ready`, disable animation, and save a `1440×900` screenshot before the same WebP conversion. On Windows, the script rejects any source id or URL containing `clickflow` before launching a browser.

Generate `hub-project-media.js` as:

```js
globalThis.HUB_PROJECT_MEDIA = Object.freeze({
  hub: Object.freeze({
    src: "./assets/hub-showcase/hub.webp",
    alt: "AI 应用方案整理器功能画面",
    position: "center",
    layout: "wide",
    fallback: "AI 应用方案整理器"
  })
});
```

The actual output includes every production id in production order. Non-ClickFlow `src` values point to committed files; `clickflow` has `src: ""`, `layout: "standard"`, and its project-specific fallback text.

- [ ] **Step 5: Build assets and rerun the focused test**

Run:

```powershell
$env:CODEX_NODE_MODULES='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:HUB_SOURCE_ROOT='C:\Users\ASUS\Documents\AI Project\ai-application-hub'
node scripts/build-hub-showcase-media.mjs
node --test tests/hub-dynamic-showcase.test.mjs
```

Expected: PASS; 28 non-ClickFlow image files exist, each is no larger than `750 KB`, registry order matches production, and no ClickFlow path or request is used.

- [ ] **Step 6: Commit the media registry and assets**

```powershell
git add --sparse -- hub-project-media.js assets/hub-showcase scripts/hub-showcase-media-sources.json scripts/build-hub-showcase-media.mjs tests/hub-dynamic-showcase.test.mjs
git commit -m "feat: add project-owned showcase media"
```

---

### Task 2: Semantic production showcase shell

**Files:**
- Modify: `index.html`
- Modify: `tests/hub-dynamic-showcase.test.mjs`
- Modify: `tests/hub-home-accessibility.test.mjs`

**Interfaces:**
- Produces DOM ids: `showcaseStage`, `showcaseCopy`, `showcaseMedia`, `showcaseImage`, `showcaseCaption`, `showcaseProgress`, `typeChips`, `searchInput`, `appGrid`, `gameGrid`, `engineeringGrid`, and existing editor ids.
- Consumes existing event bindings for `prevApp`, `nextApp`, filters, theme, editor, and maintenance controls.

- [ ] **Step 1: Add failing structural and accessibility contracts**

```js
test("homepage exposes the approved dynamic showcase shell", () => {
  for (const id of ["showcaseStage", "showcaseCopy", "showcaseMedia", "showcaseImage", "showcaseCaption", "showcaseProgress"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "u"));
  }
  assert.match(html, /<section id="apps"[^>]*>[\s\S]*id="appGrid"/u);
  assert.match(html, /<section id="games"[^>]*>[\s\S]*id="gameGrid"/u);
  assert.match(html, /<section id="engineering"[^>]*>[\s\S]*id="engineeringGrid"/u);
  assert.match(html, /<aside id="editPanel"[^>]+aria-hidden="true"[^>]+inert/u);
});
```

- [ ] **Step 2: Run the focused shell tests and confirm failure**

Run: `node --test tests/hub-dynamic-showcase.test.mjs tests/hub-home-accessibility.test.mjs`

Expected: FAIL because the old split hero lacks the approved showcase ids.

- [ ] **Step 3: Replace the old hero and toolbar markup**

Replace `#overview.hero` with a single `#showcaseStage.showcase-stage` containing `.showcase-copy` and `.showcase-media`. Keep the current editable title and lead selectors inside `.showcase-copy`; keep `prevApp`, `nextApp`, and the progress host. Move the compact project counts below the stage. Keep `#apps`, `#games`, `#engineering`, `#platforms`, `#maintain`, and the complete editor form so existing saved text and edit behavior remain addressable.

Load the registry before the runtime:

```html
<script src="./hub-project-media.js?v=20260826-dynamic-showcase"></script>
<script src="./app-20260706-restore-games.js?v=20260826-dynamic-showcase"></script>
```

- [ ] **Step 4: Preserve editable selectors and navigation labels**

Update `PAGE_TEXT_TARGETS` only where the old selector no longer exists. `hero.title` still resolves to `.showcase-copy h1`, `hero.description` to `.showcase-lead`, and section titles remain inside their current section ids. Do not change stored keys or default user-visible text.

- [ ] **Step 5: Rerun shell and accessibility tests**

Run: `node --test tests/hub-dynamic-showcase.test.mjs tests/hub-home-accessibility.test.mjs tests/hub-page-text-migration.test.mjs`

Expected: PASS for the new shell, editor inert state, metadata, and page-text storage keys.

- [ ] **Step 6: Commit the semantic shell**

```powershell
git add --sparse -- index.html app-20260706-restore-games.js tests/hub-dynamic-showcase.test.mjs tests/hub-home-accessibility.test.mjs tests/hub-page-text-migration.test.mjs
git commit -m "feat: add dynamic showcase homepage shell"
```

---

### Task 3: Four-theme Bento visual system

**Files:**
- Modify: `styles.css`
- Modify: `tests/hub-dynamic-showcase.test.mjs`
- Modify: `tests/hub-home-redesign.test.mjs`
- Modify: `tests/card-action-layout.test.mjs`

**Interfaces:**
- Consumes: classes from Task 2 and card modifiers `media-wide`, `media-tall`, `selected`, `media-fallback`.
- Produces: stable four/two/one-column layouts, theme tokens, stage depth, hover/focus states, and reduced-motion overrides.

- [ ] **Step 1: Add failing CSS contracts**

```js
test("approved showcase uses image-led Bento layouts with responsive fallbacks", () => {
  assert.match(rule(".showcase-stage"), /grid-template-columns:\s*minmax\([^)]*\)\s+minmax\([^)]*\)/u);
  assert.match(rule(".app-grid"), /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(rule(".app-card.media-wide"), /grid-column:\s*span\s+2/u);
  assert.match(rule(".app-card.media-tall"), /grid-row:\s*span\s+2/u);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.app-card\.media-wide[^{]*\{[^}]*grid-column:\s*auto/u);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});
```

- [ ] **Step 2: Run the CSS contract tests and confirm failure**

Run: `node --test tests/hub-dynamic-showcase.test.mjs tests/hub-home-redesign.test.mjs tests/card-action-layout.test.mjs`

Expected: FAIL because the old cards do not contain media spans or the new showcase layout.

- [ ] **Step 3: Implement theme tokens and the stage layout**

Keep existing theme token names required by regression tests and add `--showcase-surface`, `--showcase-overlay`, `--selection`, `--game-accent`, and `--engineering-accent`. Make the media column approximately 60% of desktop stage width, cap stage height with responsive `min()`/`clamp()`, preserve `8px` maximum card radius, and use image overlays only where text needs contrast.

- [ ] **Step 4: Implement deterministic Bento cards and aligned actions**

Use four columns at desktop, two at `<= 1100px`, and one at `<= 720px`. Standard cards use one row, wide cards span two columns, tall cards span two rows only when the media registry requests it. Card media uses fixed aspect ratios and `object-fit`; action grids stay equal width and align to the card bottom. Mobile clears all spans and uses a stable single-column card height.

- [ ] **Step 5: Implement controlled motion and focus behavior**

Use one body-level `showcase-intro-complete` gate. First paint may animate navigation, stage, and initial visible cards. Hover uses at most `scale(1.04)` and a small image translation; stage pointer depth is capped at `3deg`. `prefers-reduced-motion` removes transforms and transitions. Focus rings remain at least `3px` and never depend on color alone.

- [ ] **Step 6: Rerun CSS and action-layout tests**

Run: `node --test tests/hub-dynamic-showcase.test.mjs tests/hub-home-redesign.test.mjs tests/card-action-layout.test.mjs`

Expected: PASS; no `9px`/`10px` text, all four themes remain defined, card actions retain approved labels and order.

- [ ] **Step 7: Commit the visual system**

```powershell
git add --sparse -- styles.css tests/hub-dynamic-showcase.test.mjs tests/hub-home-redesign.test.mjs tests/card-action-layout.test.mjs
git commit -m "feat: style image-led showcase catalog"
```

---

### Task 4: Media rendering, selection synchronization, and editing

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`
- Modify: `tests/hub-dynamic-showcase.test.mjs`
- Modify: `tests/hub-card-selection.test.mjs`
- Modify: `tests/hub-carousel-status.test.mjs`
- Modify: `tests/hub-catalog-copy-and-migration.test.mjs`
- Modify: `tests/hub-tool-taxonomy.test.mjs`

**Interfaces:**
- Produces: `projectMedia(app)`, `isWindowsLocalPreview()`, `visibleApps()`, `renderMedia(app, context)`, and updated `renderSpotlight()` / `renderAppCard()`.
- Consumes: `globalThis.HUB_PROJECT_MEDIA`, current `apps`, existing `state`, existing action renderer and editor persistence.

- [ ] **Step 1: Add failing runtime contracts**

```js
test("runtime renders project-owned media and excludes ClickFlow from Windows-local DOM", () => {
  assert.match(runtime, /function projectMedia\(/u);
  assert.match(runtime, /function isWindowsLocalPreview\(/u);
  assert.match(runtime, /function visibleApps\(/u);
  assert.match(runtime, /app\.id\s*!==\s*["']clickflow["']/u);
  assert.match(runtime, /loading="lazy"/u);
  assert.match(runtime, /aria-current/u);
  assert.match(runtime, /history\.replaceState/u);
});
```

- [ ] **Step 2: Run focused runtime tests and confirm failure**

Run: `node --test tests/hub-dynamic-showcase.test.mjs tests/hub-card-selection.test.mjs tests/hub-carousel-status.test.mjs`

Expected: FAIL because media helpers and local ClickFlow exclusion are absent.

- [ ] **Step 3: Add media lookup and local exclusion before rendering**

`isWindowsLocalPreview()` returns true only for `localhost`, `127.0.0.1`, or `file:` when `navigator.platform`/`userAgent` identifies Windows. `visibleApps()` returns `apps.filter(app => app.id !== "clickflow")` in that condition and `apps` elsewhere. Every render, filter, navigation, statistic, and editor selector that creates public DOM must consume `visibleApps()`; static data and migration helpers retain all 29 records.

`projectMedia(app)` first accepts a user-edited `app.visual` relative path, then falls back to `HUB_PROJECT_MEDIA[app.id]`, and finally returns `{ src: "", fallback: app.name, layout: "standard", position: "center" }`.

- [ ] **Step 4: Render the selected stage and card media**

`renderSpotlight()` writes the selected media, category, extended brief, platform badges, actions, caption, and position into the Task 2 stage nodes. `renderAppCard()` adds a `.card-media` figure before textual content, applies `media-${layout}`, includes project-specific fallback markup, and sets `loading="lazy"` for catalog images. Stage media loads eagerly and preloads only the next thumbnail.

Image `error` handlers hide the broken image, add `.media-fallback`, and leave readable fallback text without changing dimensions.

- [ ] **Step 5: Preserve selection, order, actions, and one-time motion**

Keep `getNavigationApps()` ordering unchanged. `selectApp(id)` persists the id, updates stage/card/progress states, and updates `new URL(location.href).searchParams.set("project", id)` through `history.replaceState` without replacing an existing `#apps`, `#games`, or `#engineering` anchor and without rebuilding the complete catalog. Card action clicks remain excluded by `handleAppCardClick`; filter/search/theme changes call the existing intro-complete gate before rendering.

- [ ] **Step 6: Add media-path editing without changing stored text keys**

Add `#editVisual` labeled `展示图片地址` after `#editVideo`. `renderEditForm()` sets it from `app.visual || projectMedia(app).src`; `saveEditForm()` stores a trimmed relative or HTTPS value in `visual`; `normalizeApp()` preserves a valid `visual` and drops `javascript:`, `data:`, and empty values. Existing name, brief, taxonomy, action and page-text fields stay unchanged.

- [ ] **Step 7: Rerun state, migration, taxonomy, and action tests**

Run:

```powershell
node --test tests/hub-dynamic-showcase.test.mjs tests/hub-card-selection.test.mjs tests/hub-carousel-status.test.mjs tests/hub-catalog-copy-and-migration.test.mjs tests/hub-tool-taxonomy.test.mjs tests/hub-page-text-migration.test.mjs tests/card-action-layout.test.mjs
```

Expected: PASS; order and labels remain unchanged, selected cards and stage synchronize, user-edited copy migrates, and actions remain `网页预览 / 介绍视频 / Wins下载 / Mac下载 / iOS安装`.

- [ ] **Step 8: Commit runtime integration**

```powershell
git add --sparse -- app-20260706-restore-games.js index.html tests/hub-dynamic-showcase.test.mjs tests/hub-card-selection.test.mjs tests/hub-carousel-status.test.mjs tests/hub-catalog-copy-and-migration.test.mjs tests/hub-tool-taxonomy.test.mjs tests/hub-page-text-migration.test.mjs tests/card-action-layout.test.mjs
git commit -m "feat: connect showcase media and catalog state"
```

---

### Task 5: Real-browser responsive, accessibility, and performance verification

**Files:**
- Create: `tests/hub-dynamic-showcase-browser-smoke.mjs`
- Modify: `tests/hub-dynamic-showcase.test.mjs`

**Interfaces:**
- Consumes: final production homepage from Tasks 1-4.
- Produces: deterministic screenshots and assertions at desktop, tablet, mobile, reduced-motion, and four themes.

- [ ] **Step 1: Write the failing browser smoke**

The smoke server serves the repository root and launches installed Chrome/Edge using the existing `createRequire` Playwright resolution. Before navigation it sets a Windows user agent so the page must exclude ClickFlow. For each viewport `1440×900`, `1024×768`, and `390×844`, assert:

```js
assert.equal(await page.locator('[data-app-id="clickflow"]').count(), 0);
assert.equal(requests.some((url) => /clickflow/iu.test(url)), false);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
assert.equal(await page.locator(".app-card").count(), 28);
assert.equal(await page.locator(".card-media img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), true);
assert.ok(await page.locator(".app-card.selected").count() === 1);
```

Also click a standard card, game card, and engineering card and assert stage name, `aria-current`, progress, and the `project` query parameter synchronize while the current section hash remains intact. Click a card action and assert selection does not change. Exercise one application category chip, a cross-collection search, and reset; assert the filtered count, selected fallback, and production order. Test all four themes, reload persistence, `prefers-reduced-motion: reduce`, keyboard Enter/Space, failed-image fallback, editor inert state, and visible text minimum `12px`. In a separate browser context, override `Storage.prototype.getItem` and `setItem` to throw before page scripts execute and assert the default theme, first visible project, filters, and editor still operate without an uncaught error.

- [ ] **Step 2: Run the smoke and confirm any remaining integration failures**

Run:

```powershell
$env:CODEX_NODE_MODULES='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:HUB_SHOWCASE_SCREENSHOT_DIR='C:\Users\ASUS\Documents\AI Project\ai-application-hub\.worktrees\hub-homepage-white-themes-20260824\test-results\hub-showcase'
node tests/hub-dynamic-showcase-browser-smoke.mjs
```

Expected: initial FAIL pinpoints remaining layout, image, or state mismatches; no ClickFlow page or asset is opened.

- [ ] **Step 3: Fix only verified browser failures**

Adjust the responsible production HTML/CSS/runtime or media metadata. Do not weaken assertions, hide browser errors, or restore generic media. Rerun the exact smoke after each fix.

- [ ] **Step 4: Run focused static and browser regression**

Run:

```powershell
node --check app-20260706-restore-games.js
node --check hub-project-media.js
node --test tests/default-apps-helper.test.mjs tests/hub-dynamic-showcase.test.mjs tests/hub-home-redesign.test.mjs tests/hub-home-accessibility.test.mjs tests/hub-card-selection.test.mjs tests/hub-carousel-status.test.mjs tests/hub-catalog-copy-and-migration.test.mjs tests/hub-page-text-migration.test.mjs tests/hub-tool-taxonomy.test.mjs tests/card-action-layout.test.mjs tests/hub-platform-artifacts.test.mjs tests/hub-publication-audit.test.mjs
node tests/hub-dynamic-showcase-browser-smoke.mjs
git diff --check
```

Expected: all named tests pass, browser smoke reports zero errors/overflow/ClickFlow nodes, and screenshots show the approved A layout at all three sizes.

- [ ] **Step 5: Commit browser verification**

```powershell
git add --sparse -- tests/hub-dynamic-showcase-browser-smoke.mjs tests/hub-dynamic-showcase.test.mjs index.html styles.css app-20260706-restore-games.js hub-project-media.js assets/hub-showcase
git commit -m "test: verify dynamic showcase homepage"
```

---

### Task 6: Production integration, GitHub Pages deployment, and public acceptance

**Files:**
- Modify: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`
- Read: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\03-工作流\Workflows.md` section `FLOW-20260720-004`
- Read: `.github/workflows/*`

**Interfaces:**
- Consumes: verified feature branch commits from Tasks 1-5.
- Produces: updated `origin/main`, successful GitHub Pages workflow for the exact SHA, public browser evidence, and updated project memory.

- [ ] **Step 1: Rebase or merge current remote main without losing user changes**

Fetch `origin`, compare `origin/main` with the feature base, and inspect every incoming homepage change. Rebase the feature branch only when conflicts can be resolved by preserving both the approved showcase and newer user copy/data. Never overwrite remote text or unrelated project updates with the older base.

- [ ] **Step 2: Rerun the named local verification on the integrated tree**

Run the exact static and browser commands from Task 5. Do not run unfiltered `node --test`. Confirm `git diff --check`, no unintended project/package changes, and no local ClickFlow display or request.

- [ ] **Step 3: Push the reviewed branch and integrate through the repository’s current GitHub workflow**

Verify SSH identity and write permission, push the feature branch, and create/merge a PR or fast-forward through the repository’s established protected-branch process. Record the exact final `main` SHA. Do not force-push `main`.

- [ ] **Step 4: Wait for Pages and remote full-suite workflows on the exact SHA**

Use GitHub CLI/API or the authenticated browser to verify that the Pages deployment and complete remote Hub suite both target the recorded SHA and succeed. The remote full suite is responsible for ClickFlow coverage; local Windows remains excluded.

- [ ] **Step 5: Verify the public homepage**

Open `https://wthpein010-dev.github.io/ai-application-hub/index.html` at desktop and mobile sizes. Assert HTTP `200` for the homepage, registry, stylesheet, runtime, and every referenced showcase image. Verify A layout, four themes, project selection, applications→games→engineering wrap, search/filter, action links, editor open/close, reduced-motion, no horizontal overflow, no console/resource errors, and correct cache markers.

- [ ] **Step 6: Update durable project memory and report release evidence**

Replace the “production not yet modified” state with the final SHA, workflow ids, public URL, media count, browser sizes, test totals, and any remote-only ClickFlow evidence. Mark the goal complete only after the public page matches the exact deployed commit.
