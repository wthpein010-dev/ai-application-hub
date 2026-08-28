# 随身小物交易市场 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publicly release an editable “随身小物交易市场” in the AI Application Hub engineering section.

**Architecture:** A static GitHub Pages project loads canonical item JSON, overlays browser-local edits, and renders a responsive draggable market grid. Focused modules keep item validation/storage, sorting/reorder logic, and DOM interaction independently testable; Hub metadata, showcase media, and the tutorial video remain publication-layer concerns.

**Tech Stack:** HTML, CSS, browser JavaScript modules, JSON, IndexedDB, Node test runner, Playwright, ffmpeg/H.264, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-28-trinket-market-design.md`

## Global Constraints

- Public project ID is exactly `trinket-market`; public title is exactly `随身小物交易市场`.
- Default theme is scheme A and reference estimates are hidden by default.
- Canonical IDs are `1..11` and render as `HAND-0001..HAND-0011`.
- The project is appended to the engineering collection and exposes only Demo and Video Hub actions.
- Browser edits are local only; permanent public edits use the public GitHub repository workflow.
- Do not publish local source paths, credentials, or empty platform downloads.
- Tutorial MP4 must be H.264, 1280×720, at most 240 seconds, with one visible caption line per cue.

---

### Task 1: Canonical item data and asset contract

**Files:**
- Create: `projects/trinket-market/data/items.json`
- Create: `projects/trinket-market/assets/items/hand_1.png` through `hand_11.png`
- Create: `projects/trinket-market/core/items.js`
- Create: `tests/trinket-market-core.test.mjs`

**Interfaces:**
- Consumes: PNG files from `J:\美术资源\动画资源\角色动画\hand` and the 11 approved item records in the spec.
- Produces: `validateItems(input): Item[]`, `sortItems(items, mode, direction, manualOrder): Item[]`, `applyAcquisitionCounts(items, counts): Item[]`, and canonical JSON records.

- [ ] **Step 1: Write failing canonical-data tests**

```js
test("canonical market data has 11 unique stable IDs and bundled images", () => {
  assert.deepEqual(items.map((item) => item.id), [1,2,3,4,5,6,7,8,9,10,11]);
  assert.equal(new Set(items.map((item) => item.image)).size, 11);
  assert.equal(items.every((item) => existsSync(resolve(projectRoot, item.image))), true);
});

test("acquisition updates reject unknown and negative counts", () => {
  const updated = applyAcquisitionCounts(items, { 1: 20000, 2: -1, 99: 3 });
  assert.equal(updated.find((item) => item.id === 1).acquired, 20000);
  assert.equal(updated.find((item) => item.id === 2).acquired, items[1].acquired);
  assert.equal(updated.some((item) => item.id === 99), false);
});
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `node --test tests/trinket-market-core.test.mjs`
Expected: FAIL because the files and exported functions do not exist.

- [ ] **Step 3: Copy the 11 source PNGs and add validated data/helpers**

```js
export function applyAcquisitionCounts(items, counts) {
  return items.map((item) => {
    const next = Number(counts?.[item.id]);
    return Number.isInteger(next) && next >= 0 ? { ...item, acquired: next } : { ...item };
  });
}
```

- [ ] **Step 4: Run the focused tests and confirm green**

Run: `node --test tests/trinket-market-core.test.mjs`
Expected: all Task 1 tests pass.

- [ ] **Step 5: Commit the canonical data slice**

```bash
git add projects/trinket-market/data projects/trinket-market/assets/items projects/trinket-market/core/items.js tests/trinket-market-core.test.mjs
git commit -m "feat: add trinket market item catalog"
```

### Task 2: Responsive market surface, sorting, and Apple-style reorder

**Files:**
- Create: `projects/trinket-market/index.html`
- Create: `projects/trinket-market/styles.css`
- Create: `projects/trinket-market/app.js`
- Create: `tests/trinket-market-page.test.mjs`
- Create: `tests/trinket-market-browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 1 item helpers and `data/items.json`.
- Produces: a complete public page; `window.TrinketMarketAPI.setAcquisitionCounts(counts)`; `trinket-market:counts` event handling; drag order persisted under `trinket-market-v1`.

- [ ] **Step 1: Write failing page and browser tests**

```js
test("page exposes the approved title and public count bridge", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const app = readFileSync(join(projectRoot, "app.js"), "utf8");
  assert.match(html, /<title>随身小物交易市场<\/title>/);
  assert.match(app, /TrinketMarketAPI/);
  assert.match(app, /trinket-market:counts/);
});
```

Browser assertions: 11 cards, 8 columns at 1024px, 6 at 736px, 3 at 360px, 163px images, no overflow, default scheme A, no visible `¥`, estimate toggle shows 11 prices, and first-to-second-row drag creates at most two grid child mutations.

- [ ] **Step 2: Run focused tests and confirm red**

Run: `node --test tests/trinket-market-page.test.mjs && node tests/trinket-market-browser-smoke.mjs`
Expected: FAIL because the page is absent.

- [ ] **Step 3: Build semantic HTML and theme-responsive CSS**

```html
<body class="hub-subpage" data-theme="a">
  <a class="hub-home-link" href="../../index.html#engineering">← 返回主页</a>
  <main id="market-app"><section id="item-grid" aria-label="随身小物列表"></section></main>
</body>
```

Use CSS grid breakpoints for 9/8/6/3 columns and keep card image boxes visually centered from alpha bounds.

- [ ] **Step 4: Implement state, sort, FLIP drag, and count bridge**

```js
window.TrinketMarketAPI = Object.freeze({
  setAcquisitionCounts(counts) {
    state.items = applyAcquisitionCounts(state.items, counts);
    render();
    return state.items.map(({ id, acquired }) => ({ id, acquired }));
  }
});
window.addEventListener("trinket-market:counts", (event) => {
  window.TrinketMarketAPI.setAcquisitionCounts(event.detail);
});
```

- [ ] **Step 5: Run the focused page and browser tests**

Run: `node --test tests/trinket-market-core.test.mjs tests/trinket-market-page.test.mjs && node tests/trinket-market-browser-smoke.mjs`
Expected: all focused tests and all viewport/drag assertions pass.

- [ ] **Step 6: Commit the working market surface**

```bash
git add projects/trinket-market tests/trinket-market-page.test.mjs tests/trinket-market-browser-smoke.mjs
git commit -m "feat: build draggable trinket market"
```

### Task 3: Public visitor editing and portable local data

**Files:**
- Create: `projects/trinket-market/core/storage.js`
- Modify: `projects/trinket-market/index.html`
- Modify: `projects/trinket-market/styles.css`
- Modify: `projects/trinket-market/app.js`
- Modify: `tests/trinket-market-core.test.mjs`
- Modify: `tests/trinket-market-browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 2 state and canonical items.
- Produces: `loadLocalState()`, `saveLocalState(state)`, `saveItemImage(id, blob)`, `loadItemImages()`, JSON import/export, reset, and an edit dialog.

- [ ] **Step 1: Add failing persistence and edit tests**

```js
test("local state schema rejects duplicate IDs", () => {
  assert.throws(() => validateImportedState({ items: [{ id: 1 }, { id: 1 }] }), /重复/);
});
```

Browser assertions edit HAND-0001 to `测试冰水壶`, set acquired to `20001`, reload, verify persistence, export JSON, import canonical JSON, replace image with PNG, restore official data, and verify invalid text/oversize image errors.

- [ ] **Step 2: Run focused tests and confirm red**

Run: `node --test tests/trinket-market-core.test.mjs && node tests/trinket-market-browser-smoke.mjs`
Expected: FAIL on missing storage/edit behavior.

- [ ] **Step 3: Implement storage and accessible edit controls**

```js
export function validateImportedState(value) {
  const items = validateItems(value?.items);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("物品 ID 不能重复");
  return { version: 1, items, order: validateOrder(value.order, items) };
}
```

Use one native `<dialog>` with labeled fields; keep file validation at `image/png`, `image/jpeg`, `image/webp`, and `8 * 1024 * 1024` bytes.

- [ ] **Step 4: Run focused persistence/browser tests**

Run: `node --test tests/trinket-market-core.test.mjs tests/trinket-market-page.test.mjs && node tests/trinket-market-browser-smoke.mjs`
Expected: all edit, import/export, image, reset, and reload assertions pass.

- [ ] **Step 5: Commit visitor editing**

```bash
git add projects/trinket-market tests/trinket-market-core.test.mjs tests/trinket-market-browser-smoke.mjs
git commit -m "feat: add public local editing to trinket market"
```

### Task 4: Hub catalog integration and real showcase image

**Files:**
- Create: `tests/trinket-market-publish.test.mjs`
- Create: `assets/hub-showcase/trinket-market.webp`
- Modify: `app-20260706-restore-games.js`
- Modify: `hub-project-media.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: finished project page.
- Produces: final engineering card with Demo/Video actions and a real 1440×900 product screenshot.

- [ ] **Step 1: Write failing publication tests**

```js
test("trinket market is the final engineering project with web and video only", () => {
  const project = apps.find((app) => app.id === "trinket-market");
  assert.equal(apps.filter((app) => ["engineering", "ai"].includes(app.status)).at(-1).id, project.id);
  assert.equal(project.platforms.web.label, "演示");
  assert.equal(project.platforms.windows, "");
  assert.equal(project.platforms.mac, "");
  assert.equal(project.video, "./projects/trinket-market/video/index.html");
});
```

- [ ] **Step 2: Run publication tests and confirm red**

Run: `node --test tests/trinket-market-publish.test.mjs tests/hub-subpage-contract.test.mjs tests/card-action-layout.test.mjs`
Expected: FAIL because the project is not registered.

- [ ] **Step 3: Register the project and add media metadata**

```js
{
  id: "trinket-market",
  name: "随身小物交易市场",
  category: "收藏品数据与美术资源",
  status: "engineering",
  badge: "工程体验",
  platforms: { web: { href: "./projects/trinket-market/index.html", label: "演示" }, windows: "", mac: "" }
}
```

- [ ] **Step 4: Capture and convert the real product screenshot**

Run the local page at 1440×900, capture `trinket-market.png`, then convert with ffmpeg to `assets/hub-showcase/trinket-market.webp`; verify decoded width/height are 1440×900 and image area is non-empty.

- [ ] **Step 5: Run publication and Hub contract tests**

Run: `node --test tests/trinket-market-publish.test.mjs tests/hub-subpage-contract.test.mjs tests/card-action-layout.test.mjs tests/hub-dynamic-showcase.test.mjs`
Expected: all focused publication tests pass.

- [ ] **Step 6: Commit Hub integration**

```bash
git add app-20260706-restore-games.js hub-project-media.js index.html assets/hub-showcase/trinket-market.webp tests/trinket-market-publish.test.mjs
git commit -m "feat: add trinket market to engineering hub"
```

### Task 5: Public tutorial video and shared player page

**Files:**
- Create: `scripts/record-trinket-market-video.mjs`
- Create: `scripts/build-trinket-market-video.mjs`
- Create: `projects/trinket-market/video/index.html`
- Create: `projects/trinket-market/video/trinket-market-demo.vtt`
- Create: `projects/trinket-market/video/tutorial-script.md`
- Generate: `projects/trinket-market/video/trinket-market-demo.mp4`
- Generate: `projects/trinket-market/video/poster.jpg`
- Modify: `tests/trinket-market-publish.test.mjs`

**Interfaces:**
- Consumes: finished public project page.
- Produces: 45–75 second 1280×720 H.264 tutorial, shared Hub video page, one-line Chinese captions, and chapter buttons.

- [ ] **Step 1: Write failing media contract tests**

```js
const media = inspectMedia(mediaPath);
assert.equal(media.videoCodec, "h264");
assert.deepEqual([media.width, media.height], [1280, 720]);
assert.ok(media.duration >= 45 && media.duration <= 75);
assert.equal(cues.every((cue) => cue.text.length === 1), true);
```

- [ ] **Step 2: Run the media test and confirm red**

Run: `node --test tests/trinket-market-publish.test.mjs`
Expected: FAIL because video assets are absent.

- [ ] **Step 3: Add recorder, encoder, player, script, and captions**

The recorder demonstrates sorting, estimate toggle, cross-row drag, edit mode, and JSON export. The encoder uses `libx264`, `yuv420p`, `+faststart`, 30fps, no audio, and hard limits output to 75 seconds.

- [ ] **Step 4: Record and encode the tutorial**

Run: `node scripts/record-trinket-market-video.mjs && node scripts/build-trinket-market-video.mjs`
Expected: MP4 and poster are created; recorder reports zero console/page/request errors.

- [ ] **Step 5: Run media and shared-player tests**

Run: `node --test tests/trinket-market-publish.test.mjs tests/project-video-coverage.test.mjs && node tests/hub-video-pages-browser-smoke.mjs`
Expected: H.264, duration, subtitles, lazy loading, playback progress, and shared player contract all pass.

- [ ] **Step 6: Commit the tutorial**

```bash
git add scripts/record-trinket-market-video.mjs scripts/build-trinket-market-video.mjs projects/trinket-market/video tests/trinket-market-publish.test.mjs
git commit -m "feat: add trinket market tutorial video"
```

### Task 6: Full verification, review, merge, and public Pages audit

**Files:**
- Modify only if a failing verification exposes a real defect.
- Update: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`
- Update: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: reviewed commit on public `main`, successful Pages deployment, public URLs, and durable project memory.

- [ ] **Step 1: Run focused trinket validation**

Run: `node --test tests/trinket-market-*.test.mjs && node tests/trinket-market-browser-smoke.mjs`
Expected: zero failures and zero browser errors.

- [ ] **Step 2: Run full repository validation**

Run: `node --test`
Run: `npm run audit:hub`
Run: `node tests/hub-entry-pages-browser-smoke.mjs`
Expected: zero failures and zero Important audit findings.

- [ ] **Step 3: Inspect the branch diff and request code review**

Run: `git diff --check origin/main...HEAD` and review every changed path against the spec. Resolve Critical/Important findings and rerun affected tests.

- [ ] **Step 4: Rebase on current remote main and rerun release gates**

Run: `git fetch origin main && git rebase origin/main`
Run: focused tests, `node --test`, and `npm run audit:hub` again.
Expected: clean rebase and all gates green.

- [ ] **Step 5: Push the feature branch and merge without force**

Run: `git push -u origin feat/trinket-market-20260828`
Create a pull request, verify checks, and merge normally to `main`.

- [ ] **Step 6: Wait for exact-SHA GitHub Pages and validation workflows**

Use `gh run list` and `gh run watch` for the merged SHA.
Expected: Pages and Hub validation workflows both conclude `success`.

- [ ] **Step 7: Verify public pages and media**

Check these URLs return valid public responses:

```text
https://wthpein010-dev.github.io/ai-application-hub/index.html#engineering
https://wthpein010-dev.github.io/ai-application-hub/projects/trinket-market/index.html
https://wthpein010-dev.github.io/ai-application-hub/projects/trinket-market/video/index.html
https://wthpein010-dev.github.io/ai-application-hub/projects/trinket-market/video/trinket-market-demo.mp4
```

Run public Playwright at desktop and 390×844, verify card order, editing, drag, no overflow/errors, MP4 Range `206`, playback progress, and caption track `showing`.

- [ ] **Step 8: Update durable project memory with exact evidence**

Record merged SHA, workflow IDs, public URLs, test counts, video duration/size/hash, and public browser evidence; do not store credentials.
