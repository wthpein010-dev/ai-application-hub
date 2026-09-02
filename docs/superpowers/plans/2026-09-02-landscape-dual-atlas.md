# 横版砖块小人与随身小物双图鉴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有砖块小人图鉴重构为左侧列表、右侧常驻详情的横版双图鉴，并补齐随身小物的游戏式换装、仓库和赠送演示，同时保持独立交易市场无回归。

**Architecture:** 静态页面继续消费 Unity 同步后的角色 JSON，并把交易市场的 `items.json` 扩展为双页面共享的小物目录。纯状态、草稿和库存逻辑进入独立 ES modules，页面 `app.js` 只负责协调数据、DOM 渲染、地址栏和浏览器存储；角色与小物视图分别由组件模块渲染到同一个右侧详情容器。

**Tech Stack:** HTML、CSS、浏览器 JavaScript ES modules、JSON、Node test runner、Playwright、ffmpeg/H.264、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-09-02-landscape-dual-atlas-design.md`

## Global Constraints

- 一级分类固定为“砖块小人 / 随身小物”，玩家侧不得恢复“皮肤 / 配饰”旧称。
- 桌面端左侧约 720px、右侧最小 520px；低于 1100px 上下排列，详情始终不是弹窗。
- 删除角色详情的 `detail-dialog`、`aria-modal`、遮罩、背景 `inert`、空白关闭和焦点围栏。
- 45 个砖块小人和当前 11 件随身小物默认全部解锁或拥有。
- 角色数据继续来自 `data/characters.json`；小物目录继续以 `projects/trinket-market/data/items.json` 为共享权威。
- 玩家本地 `ownedCount` 不得与市场全服 `acquired` 混用；价格、涨跌和全服排名只留在独立交易市场。
- 当前小物图片继续来自 `projects/trinket-market/assets/items/hand_*.png`，正式源目录只用于同步，不把本机绝对路径写入公开代码或数据。
- 赠送为明确标注的浏览器本地演示，不读取真实联系人，不创建真实订单。
- 不修改 `E:\Mahjong\PawsHomeClient`，不发布凭据、本机路径、Unity `.meta` 或无关资源。
- 不运行本地 ClickFlow 套件。
- 每个任务先写失败测试、确认红灯、写最小实现、确认绿灯，再提交。

---

### Task 1: 建立双图鉴纯状态、草稿和库存契约

**Files:**
- Create: `projects/brick-character-copy-preview/core/atlas-state.js`
- Create: `projects/brick-character-copy-preview/core/trinket-draft.js`
- Create: `projects/brick-character-copy-preview/core/trinket-inventory.js`
- Create: `scripts/sync-trinket-market-assets.mjs`
- Modify: `projects/trinket-market/data/items.json`
- Create: `tests/brick-gallery-atlas-state.test.mjs`
- Create: `tests/brick-gallery-trinket-state.test.mjs`
- Create: `tests/trinket-catalog-sync.test.mjs`
- Modify: `tests/trinket-market-core.test.mjs`

**Interfaces:**
- Produces: `createAtlasState()`, `setAtlasTab(state, tab)`, `setAtlasQuery(state, tab, query)`, `setAtlasPage(state, tab, page)`, `setAtlasSort(state, sort)`, `selectAtlasItem(state, tab, id)`, `parseAtlasLocation(url)`, `formatAtlasLocation(state)`.
- Produces: `createTrinketDraft(savedItemId)`, `toggleDraftItem(draft, item)`, `randomizeDraft(draft, candidates, random)`, `hasUnsavedDraft(draft)`, `saveDraft(draft)`, `discardDraft(draft)`.
- Produces: `availableGiftCount(item, equippedItemId, lockedCount)`, `ownedTrinkets(items)`, `sortTrinkets(items, mode)`, `applyGiftPreview(items, itemId)`.
- Produces: `syncTrinketCatalog({ sourceRoot, projectRoot })`, which copies `hand_<positive integer>.png` and appends only missing IDs with explicitly marked provisional catalog records.
- Consumes: Existing market item fields `id`, `name`, `pinyin`, `rarity`, `acquired`, `value`, `change`, `image`.

- [ ] **Step 1: Write failing atlas-state tests**

```js
test("character and trinket controls keep independent state", () => {
  let state = createAtlasState();
  state = setAtlasQuery(state, "characters", "哈吉米");
  state = setAtlasPage(state, "characters", 2);
  state = setAtlasTab(state, "trinkets");
  state = setAtlasQuery(state, "trinkets", "篮球");
  assert.deepEqual(state.characters, { query: "哈吉米", page: 2, selection: null });
  assert.equal(state.trinkets.query, "篮球");
  assert.equal(state.tab, "trinkets");
});

test("location parser accepts only valid atlas keys", () => {
  assert.deepEqual(parseAtlasLocation("https://example.test/?tab=trinkets&item=4"), {
    tab: "trinkets", characterId: null, itemId: 4,
  });
  assert.deepEqual(parseAtlasLocation("https://example.test/?tab=bad&item=nope"), {
    tab: "characters", characterId: null, itemId: null,
  });
});
```

- [ ] **Step 2: Write failing draft and inventory tests**

```js
const rose = { id: 4, slot: "hand", ownedCount: 2, giftable: true };
const ball = { id: 3, slot: "hand", ownedCount: 4, giftable: true };

test("same-slot selection replaces and second click removes the draft item", () => {
  let draft = createTrinketDraft(null);
  draft = toggleDraftItem(draft, rose);
  draft = toggleDraftItem(draft, ball);
  assert.equal(draft.draftItemId, 3);
  draft = toggleDraftItem(draft, ball);
  assert.equal(draft.draftItemId, null);
  assert.equal(hasUnsavedDraft(draft), false);
});

test("gift count excludes equipped and locked copies", () => {
  assert.equal(availableGiftCount(rose, 4, 0), 1);
  assert.equal(availableGiftCount(rose, null, 1), 1);
});
```

- [ ] **Step 3: Run focused tests and confirm missing-module failures**

Run: `node --test tests/brick-gallery-atlas-state.test.mjs tests/brick-gallery-trinket-state.test.mjs tests/trinket-market-core.test.mjs`

Expected: FAIL because the three new core modules and extended catalog fields do not exist.

- [ ] **Step 4: Implement immutable atlas state and URL helpers**

```js
export function createAtlasState() {
  return {
    tab: "characters",
    characters: { query: "", page: 1, selection: null },
    trinkets: { query: "", page: 1, sort: "default", selection: null },
  };
}

export function setAtlasTab(state, tab) {
  return { ...state, tab: tab === "trinkets" ? "trinkets" : "characters" };
}

export function selectAtlasItem(state, tab, id) {
  return { ...state, [tab]: { ...state[tab], selection: Number.isInteger(id) ? id : null } };
}
```

Implement `parseAtlasLocation` with `URL`, accept only `characters | trinkets`, positive integer IDs, and return null for invalid detail keys. Implement `formatAtlasLocation` to emit `tab`, then only the selected key for the active tab.

- [ ] **Step 5: Implement single-slot draft and inventory helpers**

```js
export function createTrinketDraft(savedItemId = null) {
  return { savedItemId, draftItemId: savedItemId };
}

export function toggleDraftItem(draft, item) {
  const nextId = draft.draftItemId === item.id ? null : item.id;
  return { ...draft, draftItemId: nextId };
}

export function hasUnsavedDraft(draft) {
  return draft.savedItemId !== draft.draftItemId;
}

export function availableGiftCount(item, equippedItemId, lockedCount = 0) {
  return Math.max(0, item.ownedCount - (equippedItemId === item.id ? 1 : 0) - lockedCount);
}
```

Implement stable sorts: `default` by `isNew` then `id`, `recent` by `obtainedAt` descending then `id`, `name` by existing `pinyin`, `quantity` by `ownedCount` descending then `id`, and `activity` by finite `activitySort` then `id`.

- [ ] **Step 6: Extend all 11 item records without changing existing market fields**

Add `slot: "hand"` to every record. Add deterministic preview fields using this contract:

```json
{
  "ownedCount": 3,
  "obtainedAt": "2026-08-28T14:00:00+08:00",
  "acquisitionText": "参与日常玩法或活动获得",
  "isNew": false,
  "giftable": true,
  "activitySort": null
}
```

Use positive `ownedCount` for every item; mark IDs 4, 10 and 11 as new; set ID 10 `giftable: false` to expose the disabled state; set finite `activitySort` only for IDs 4 and 10. Update market validation tests to prove extra fields are preserved and `acquired` still drives market sorting.

- [ ] **Step 7: Add the repeatable hand-asset synchronization contract**

Write a failing fixture test with `hand_1.png`, `hand_2.png` and a new `hand_12.png`; it must prove that the synchronizer copies only PNGs named `hand_<id>.png`, keeps existing catalog fields unchanged and creates a catalog record only for ID 12.

```js
test("trinket sync copies new hand art and marks unnamed catalog additions", async () => {
  const result = await syncTrinketCatalog({ sourceRoot, projectRoot });
  assert.deepEqual(result.addedIds, [12]);
  const entry = result.items.find((item) => item.id === 12);
  assert.equal(entry.name, "随身小物 12");
  assert.equal(entry.needsNaming, true);
  assert.equal(existsSync(join(projectRoot, "assets", "items", "hand_12.png")), true);
});
```

Implement a stable synchronizer that accepts `TRINKET_HAND_ROOT`, validates the exact numeric filename pattern, copies only missing or changed files, writes JSON in numeric ID order and never deletes an existing catalog entry. New items use `name: "随身小物 <id>"`, `pinyin: "hand<id>"`, `rarity: "待配置"`, `acquired: 0`, `value: 0`, `change: 0`, `ownedCount: 1`, `slot: "hand"`, `acquisitionText: "获取方式待配置"`, `isNew: true`, `giftable: false`, `activitySort: null`, `needsNaming: true`. Existing names and metadata stay authoritative until explicitly edited. This makes the user’s later “1” trigger deterministic without inventing an art-derived formal name.

- [ ] **Step 8: Run tests and commit**

Run: `node --test tests/brick-gallery-atlas-state.test.mjs tests/brick-gallery-trinket-state.test.mjs tests/trinket-catalog-sync.test.mjs tests/trinket-market-core.test.mjs`

Expected: PASS.

```bash
git add projects/brick-character-copy-preview/core projects/trinket-market/data/items.json scripts/sync-trinket-market-assets.mjs tests/brick-gallery-atlas-state.test.mjs tests/brick-gallery-trinket-state.test.mjs tests/trinket-catalog-sync.test.mjs tests/trinket-market-core.test.mjs
git commit -m "feat: add dual atlas state contracts"
```

---

### Task 2: 重构横版工作台结构并彻底移除详情弹板

**Files:**
- Modify: `projects/brick-character-copy-preview/index.html`
- Modify: `projects/brick-character-copy-preview/styles.css`
- Modify: `tests/brick-gallery-page.test.mjs`

**Interfaces:**
- Produces DOM: `#atlas-workbench`, `[role="tablist"]`, `#tab-characters`, `#tab-trinkets`, `#atlas-list-panel`, `#atlas-detail-panel`, `#character-grid`, `#trinket-grid`, `#detail-empty`, `#character-detail`, `#trinket-detail`.
- Removes DOM: `#detail-dialog`, `.detail-scrim`, `[aria-modal="true"]`.
- Consumes: Existing top navigation, character grid, diagnostic IDs and UI assets.

- [ ] **Step 1: Replace static page assertions with the horizontal contract**

```js
assert.match(html, /id="atlas-workbench"/);
assert.match(html, /id="atlas-list-panel"/);
assert.match(html, /id="atlas-detail-panel"/);
assert.match(html, /role="tablist"/);
assert.match(html, /id="tab-characters"/);
assert.match(html, /id="tab-trinkets"/);
assert.doesNotMatch(html, /detail-dialog|detail-scrim|aria-modal="true"/);
assert.doesNotMatch(app, /setModalBackgroundInert|trapDetailFocus/);
```

Add CSS assertions for `grid-template-columns: minmax(0, 720px) minmax(520px, 1fr)` and the `@media (max-width: 1099px)` stacked breakpoint.

- [ ] **Step 2: Run page test and confirm it fails on the modal layout**

Run: `node --test tests/brick-gallery-page.test.mjs`

Expected: FAIL on missing workbench/tabs/detail panel and still-present modal markup.

- [ ] **Step 3: Rewrite the page shell**

Use semantic tab buttons and two permanent columns:

```html
<main class="atlas-workbench" id="atlas-workbench">
  <section class="atlas-list-panel" id="atlas-list-panel">
    <div class="atlas-tabs" role="tablist" aria-label="换装分类">
      <button id="tab-characters" role="tab" aria-selected="true" aria-controls="characters-panel">砖块小人</button>
      <button id="tab-trinkets" role="tab" aria-selected="false" aria-controls="trinkets-panel">随身小物</button>
    </div>
    <section id="characters-panel" role="tabpanel" aria-labelledby="tab-characters">…</section>
    <section id="trinkets-panel" role="tabpanel" aria-labelledby="tab-trinkets" hidden>…</section>
  </section>
  <aside class="atlas-detail-panel" id="atlas-detail-panel" aria-live="polite">
    <section id="detail-empty">从左侧选择一项查看详情</section>
    <section id="character-detail" hidden>…</section>
    <section id="trinket-detail" hidden>…</section>
  </aside>
</main>
```

Move the existing role stage and copy inspector markup into `#character-detail`. Add empty structural containers for the trinket stage, metadata, actions and inline flows. Remove modal-only close button, scrim and “点击空白处关闭”。

- [ ] **Step 4: Replace modal CSS with landscape layout tokens**

```css
.atlas-workbench {
  width: min(1480px, calc(100% - 32px));
  margin: 24px auto 48px;
  display: grid;
  grid-template-columns: minmax(0, 720px) minmax(520px, 1fr);
  gap: 20px;
  align-items: start;
}

.atlas-detail-panel {
  min-height: 820px;
  position: sticky;
  top: 18px;
}

@media (max-width: 1099px) {
  .atlas-workbench { grid-template-columns: minmax(0, 1fr); }
  .atlas-detail-panel { position: static; min-height: 0; }
}
```

Keep exact character card geometry inside the 720px left panel. Delete `.detail-dialog`, `.detail-scrim` and fixed-overlay rules.

- [ ] **Step 5: Run page test and commit**

Run: `node --test tests/brick-gallery-page.test.mjs`

Expected: PASS.

```bash
git add projects/brick-character-copy-preview/index.html projects/brick-character-copy-preview/styles.css tests/brick-gallery-page.test.mjs
git commit -m "feat: build landscape dual atlas shell"
```

---

### Task 3: 迁移砖块小人到右侧常驻详情并保留文案诊断

**Files:**
- Create: `projects/brick-character-copy-preview/components/character-view.js`
- Modify: `projects/brick-character-copy-preview/app.js`
- Modify: `tests/brick-gallery-browser-smoke.mjs`
- Modify: `tests/brick-gallery-diagnostics.test.mjs`

**Interfaces:**
- Consumes: `characters`, `diagnoseCopy(character, renderedMetrics)`, shared atlas state and character-detail DOM.
- Produces: `renderCharacterGrid(context)`, `renderCharacterDetail(context)`, `measureCharacterCopy(element)`, `bindCharacterInteractions(context)`.
- Emits callbacks: `onSelect(blockId)`, `onMove(delta)`, `onFavorite(blockId)`, `onShare(blockId)`.

- [ ] **Step 1: Rewrite browser expectations for inline detail**

```js
assert.equal(await page.locator("#atlas-list-panel").isVisible(), true);
assert.equal(await page.locator("#detail-empty").isVisible(), true);
await page.locator('.character-card[data-block-id="100001"]').click();
assert.equal(await page.locator("#character-detail").isVisible(), true);
assert.equal(await page.locator("#atlas-list-panel").isVisible(), true);
assert.equal(await page.locator("#detail-dialog").count(), 0);
assert.equal(await page.locator('[aria-modal="true"]').count(), 0);
```

Add checks that clicking a second card changes only right-side content, previous/next synchronizes the left selected card and page, deep links restore details, and `document.querySelector("main").inert` is false.

- [ ] **Step 2: Run browser test and confirm failure**

Run: `node tests/brick-gallery-browser-smoke.mjs`

Expected: FAIL because `app.js` still expects modal nodes and the inline detail is not rendered.

- [ ] **Step 3: Extract character rendering and remove modal orchestration**

```js
export function renderCharacterDetail({ character, index, total, favorites, elements, diagnose }) {
  elements.empty.hidden = true;
  elements.characterDetail.hidden = false;
  elements.trinketDetail.hidden = true;
  elements.name.textContent = character.name;
  elements.description.textContent = character.galleryDesc;
  elements.unlock.textContent = character.unlockDesc;
  elements.position.textContent = `${index + 1} / ${total}`;
  elements.favorite.setAttribute("aria-pressed", String(favorites.has(character.blockId)));
  elements.diagnostics.replaceChildren(...diagnose(character));
}
```

Move character figure/card creation into this module. In `app.js`, delete `detailIsOpen`, `setModalBackgroundInert`, `detailFocusableControls`, `trapDetailFocus`, `openDetail`, `closeDetail` and modal escape/blank-close handlers. Replace them with `selectCharacter(blockId)` that updates state, renders the right panel and calls `history.pushState`.

- [ ] **Step 4: Preserve real rendered line measurement**

Keep range-based line grouping against `#detail-description`, but measure after the inline panel is visible using two `requestAnimationFrame` calls. Continue passing `{ lines, horizontalOverflow, verticalOverflow }` into `diagnoseCopy`.

- [ ] **Step 5: Run character unit/browser tests and commit**

Run: `node --test tests/brick-gallery-diagnostics.test.mjs tests/brick-gallery-page.test.mjs && node tests/brick-gallery-browser-smoke.mjs`

Expected: PASS at 1440×900, 750×1334 and 390×844 with no dialog, overflow, console errors or 404s.

```bash
git add projects/brick-character-copy-preview/components/character-view.js projects/brick-character-copy-preview/app.js tests/brick-gallery-browser-smoke.mjs tests/brick-gallery-diagnostics.test.mjs
git commit -m "feat: move character details into side panel"
```

---

### Task 4: 构建随身小物列表、详情和角色试穿

**Files:**
- Create: `projects/brick-character-copy-preview/components/trinket-view.js`
- Modify: `projects/brick-character-copy-preview/app.js`
- Modify: `projects/brick-character-copy-preview/styles.css`
- Create: `tests/brick-gallery-trinket-browser-smoke.mjs`
- Modify: `tests/brick-gallery-page.test.mjs`

**Interfaces:**
- Consumes: shared `items.json`, `sortTrinkets`, `createTrinketDraft`, `toggleDraftItem`, selected character preview, atlas-state callbacks.
- Produces: `renderTrinketGrid(context)`, `renderTrinketDetail(context)`, `renderEquippedPreview(context)`, `bindTrinketInteractions(context)`.
- Emits callbacks: `onSelect(itemId)`, `onToggleDraft(itemId)`, `onFavorite(itemId)`, `onRandomize()`, `onSaveIntent()`, `onOpenWarehouse()`, `onGiftIntent(itemId)`.

- [ ] **Step 1: Write browser coverage for catalog and detail**

```js
await page.locator("#tab-trinkets").click();
assert.equal(await page.locator("#tab-trinkets").getAttribute("aria-selected"), "true");
assert.equal(await page.locator(".trinket-card").count(), 11);
assert.equal(await page.locator(".trinket-card.is-locked").count(), 0);
assert.equal(await page.locator(".trinket-card").evaluateAll((cards) => {
  const top = cards[0].getBoundingClientRect().top;
  return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - top) < 2).length;
}), 4);
await page.locator('.trinket-card[data-item-id="4"]').click();
assert.equal(await page.locator("#trinket-detail-name").textContent(), "告白玫瑰");
assert.equal(await page.locator("#trinket-detail").isVisible(), true);
await page.locator("#trinket-favorite").click();
assert.equal(await page.locator("#trinket-favorite").getAttribute("aria-pressed"), "true");
```

Add sorting assertions for default/recent/name/quantity/activity and search persistence across tab changes.

- [ ] **Step 2: Run new browser smoke and confirm failure**

Run: `node tests/brick-gallery-trinket-browser-smoke.mjs`

Expected: FAIL because the tab has no loaded catalog or interaction module.

- [ ] **Step 3: Load the shared market catalog and initialize all-owned preview state**

```js
const [charactersResponse, trinketsResponse] = await Promise.all([
  fetch("./data/characters.json"),
  fetch("../trinket-market/data/items.json"),
]);
const [characters, trinkets] = await Promise.all([
  charactersResponse.json(),
  trinketsResponse.json(),
]);
```

Validate array shapes before rendering. If one request fails, keep the other tab usable and show the failed tab's inline retry state.

- [ ] **Step 4: Render four-column cards and right-side item metadata**

```js
export function renderTrinketGrid({ items, selectedId, draft, grid, onSelect }) {
  grid.replaceChildren(...items.map((item) => {
    const card = document.createElement("button");
    card.className = "trinket-card";
    card.dataset.itemId = String(item.id);
    card.setAttribute("aria-current", String(item.id === selectedId));
    card.innerHTML = `<span class="trinket-art"><img src="../trinket-market/${item.image.slice(2)}" alt=""></span><strong>${item.name}</strong><small>×${item.ownedCount}</small>`;
    card.addEventListener("click", () => onSelect(item.id));
    return card;
  }));
}
```

Use DOM creation or escaped content for all catalog text. Render `HAND-0004`, slot label“手持”、owned count, available gift count, acquisition text, new/equipped/draft/favorite states and disabled reason.

- [ ] **Step 5: Render character plus hand-item trial preview**

Reuse the selected character's complete preview image when available; otherwise reuse the layered figure. Place the selected hand PNG in a dedicated `.equipped-hand-layer` with `object-fit: contain`, stable transform tokens and pointer-events disabled. Switching draft items replaces the single layer node instead of appending, preventing first-item ghosting.

- [ ] **Step 6: Wire search, sorting, selection and deep links**

Update only the trinket slice in `atlas-state`; reset trinket page to 1 when search or sort changes; update `?tab=trinkets&item=<id>` on selection. Preserve character search/page/selection while using the trinket tab.

- [ ] **Step 7: Run tests and commit**

Run: `node --test tests/brick-gallery-page.test.mjs tests/brick-gallery-atlas-state.test.mjs tests/brick-gallery-trinket-state.test.mjs && node tests/brick-gallery-trinket-browser-smoke.mjs`

Expected: PASS with 11 images loaded, 4 first-row cards, all sort modes, search, right-side detail and no duplicate hand layer.

```bash
git add projects/brick-character-copy-preview/components/trinket-view.js projects/brick-character-copy-preview/app.js projects/brick-character-copy-preview/styles.css tests/brick-gallery-trinket-browser-smoke.mjs tests/brick-gallery-page.test.mjs
git commit -m "feat: add trinket atlas and trial preview"
```

---

### Task 5: 完成保存、未保存确认、仓库和赠送内联流程

**Files:**
- Create: `projects/brick-character-copy-preview/components/trinket-flow.js`
- Modify: `projects/brick-character-copy-preview/app.js`
- Modify: `projects/brick-character-copy-preview/styles.css`
- Modify: `tests/brick-gallery-trinket-browser-smoke.mjs`
- Modify: `tests/brick-gallery-trinket-state.test.mjs`

**Interfaces:**
- Consumes: draft/inventory helpers, `#trinket-inline-flow`, selected character/item and deferred navigation intent.
- Produces: `openSaveConfirm(context)`, `openUnsavedConfirm(context)`, `openWarehouse(context)`, `openGiftFlow(context)`, `closeInlineFlow(context)`.
- Persists: versioned `brick-gallery-trinket-preview-v1` containing `equippedByCharacter`, `favoriteItemIds`, `ownedCountByItemId`.

- [ ] **Step 1: Add browser tests for draft lifecycle**

```js
await page.locator('.trinket-card[data-item-id="4"]').click();
await page.locator("#trinket-toggle-draft").click();
assert.equal(await page.locator('.trinket-card[data-item-id="4"]').getAttribute("data-draft-selected"), "true");
assert.equal(await page.locator("#trinket-save").isEnabled(), true);
await page.locator("#trinket-save").click();
assert.equal(await page.locator("#trinket-inline-flow").getAttribute("data-flow"), "save");
await page.locator("#confirm-save").click();
await page.getByText("保存成功", { exact: true }).waitFor();
```

Add assertions for same-slot replacement, second-click unload, random draft, three unsaved actions, warehouse sorting, giftable disabled state, gift success, fixed failure demo and localStorage persistence after reload.

- [ ] **Step 2: Run browser smoke and confirm missing-flow failures**

Run: `node tests/brick-gallery-trinket-browser-smoke.mjs`

Expected: FAIL when trying to open or complete inline flows.

- [ ] **Step 3: Implement versioned local preview storage**

```js
const TRINKET_PREVIEW_KEY = "brick-gallery-trinket-preview-v1";

function saveTrinketPreview(storage, preview) {
  try {
    storage.setItem(TRINKET_PREVIEW_KEY, JSON.stringify({ version: 1, ...preview }));
    return true;
  } catch {
    return false;
  }
}
```

Validate `version === 1`, positive integer keys and non-negative counts on load. Invalid or unavailable storage returns all-owned defaults and sets a session-only notice.

- [ ] **Step 4: Implement save and unsaved navigation as right-side flows**

`openSaveConfirm` renders the current character and draft item with “确认保存 / 再想想”。`openUnsavedConfirm` captures exactly one deferred action and renders “保存并继续 / 放弃修改 / 继续编辑”。While it is open, ignore later tab/role navigation requests. No flow element uses `role="dialog"` or fixed positioning.

- [ ] **Step 5: Implement warehouse view**

Filter with `ownedTrinkets(items)`, render count and all five sorts in `#trinket-inline-flow`, and let card clicks return to that item's right-side detail. Closing returns to the previous detail and preserves the current draft.

- [ ] **Step 6: Implement local gift demonstration**

Use three fictional choices `小羊好友 A / 小羊好友 B / 测试好友 C`. Do not access contacts. Precheck `giftable`, available count and a fixed daily limit. Confirmation shows item name, chosen friend, quantity 1, remaining demonstrations and irreversible-copy text. Success calls `applyGiftPreview`, shows“赠送成功” and refreshes local counts. Provide “模拟失败” that leaves counts unchanged and “恢复演示数据” that restores the initial preview counts.

- [ ] **Step 7: Run tests and commit**

Run: `node --test tests/brick-gallery-trinket-state.test.mjs && node tests/brick-gallery-trinket-browser-smoke.mjs`

Expected: PASS for save, unsaved decisions, warehouse, gift states, persistence and no modal markup.

```bash
git add projects/brick-character-copy-preview/components/trinket-flow.js projects/brick-character-copy-preview/app.js projects/brick-character-copy-preview/styles.css tests/brick-gallery-trinket-browser-smoke.mjs tests/brick-gallery-trinket-state.test.mjs
git commit -m "feat: add inline trinket workflows"
```

---

### Task 6: 完成无障碍、响应式、动效和市场回归

**Files:**
- Modify: `projects/brick-character-copy-preview/app.js`
- Modify: `projects/brick-character-copy-preview/styles.css`
- Modify: `tests/brick-gallery-browser-smoke.mjs`
- Modify: `tests/brick-gallery-trinket-browser-smoke.mjs`
- Modify if shared catalog exposes a regression: `projects/trinket-market/core/items.js`

**Interfaces:**
- Consumes: completed character/trinket views and existing market implementation.
- Produces: keyboard tab navigation, focus restoration, reduced-motion behavior and verified responsive layout.

- [ ] **Step 1: Add responsive and accessibility assertions**

```js
const geometry = await page.evaluate(() => {
  const list = document.querySelector("#atlas-list-panel").getBoundingClientRect();
  const detail = document.querySelector("#atlas-detail-panel").getBoundingClientRect();
  return {
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sideBySide: list.right <= detail.left + 1,
  };
});
assert.equal(geometry.overflow, false);
if (viewport.width >= 1100) assert.equal(geometry.sideBySide, true);
```

Add keyboard checks for ArrowLeft/ArrowRight between tabs, Enter/Space on cards, `aria-current`, flow focus entry/return and reduced-motion computed durations.

- [ ] **Step 2: Run both atlas browser suites and capture real failures**

Run: `node tests/brick-gallery-browser-smoke.mjs && node tests/brick-gallery-trinket-browser-smoke.mjs`

Expected: FAIL only on newly asserted responsive/a11y gaps.

- [ ] **Step 3: Implement tab keyboard navigation and focus restoration**

On tab keydown, ArrowLeft/ArrowRight chooses the adjacent tab and focuses it; Home/End chooses first/last. When an inline flow opens, focus its heading with `tabindex="-1"`; when it closes, restore the saved triggering control if still connected.

- [ ] **Step 4: Finish visual states and low-motion behavior**

Use transform/opacity only for card selection and detail crossfade. Replace child nodes atomically before animation to prevent ghost images. Add a `prefers-reduced-motion: reduce` block that reduces every atlas animation and transition to `0.001ms` and disables idle movement.

- [ ] **Step 5: Run full atlas and market regression**

Run:

```bash
node --test tests/brick-gallery-data.test.mjs tests/brick-gallery-diagnostics.test.mjs tests/brick-gallery-atlas-state.test.mjs tests/brick-gallery-trinket-state.test.mjs tests/brick-gallery-page.test.mjs tests/trinket-market-core.test.mjs tests/trinket-market-page.test.mjs tests/trinket-market-publish.test.mjs
node tests/brick-gallery-browser-smoke.mjs
node tests/brick-gallery-trinket-browser-smoke.mjs
node tests/trinket-market-browser-smoke.mjs
```

Expected: PASS; market remains scheme A, white mode works, value starts hidden, edits/import/export work and cross-row Apple-style drag remains smooth.

- [ ] **Step 6: Commit**

```bash
git add projects/brick-character-copy-preview/app.js projects/brick-character-copy-preview/styles.css projects/trinket-market/core/items.js tests/brick-gallery-browser-smoke.mjs tests/brick-gallery-trinket-browser-smoke.mjs
git commit -m "fix: polish dual atlas interactions"
```

Only stage `projects/trinket-market/core/items.js` if a real shared-catalog compatibility fix was required.

---

### Task 7: 更新 Hub 文案、展示图和教学视频

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `hub-project-media.js`
- Modify: `scripts/hub-showcase-media-sources.json`
- Modify: `scripts/build-brick-character-copy-preview-video.mjs`
- Replace: `assets/hub-showcase/brick-character-copy-preview.webp`
- Modify: `projects/brick-character-copy-preview/video/index.html`
- Modify: `projects/brick-character-copy-preview/video/tutorial-script.md`
- Replace: `projects/brick-character-copy-preview/video/poster.jpg`
- Replace: `projects/brick-character-copy-preview/video/brick-character-copy-preview-demo.mp4`
- Modify: `projects/brick-character-copy-preview/video/brick-character-copy-preview-demo.vtt`
- Modify: `tests/brick-character-copy-preview-publish.test.mjs`
- Modify: `tests/brick-video-loading.test.mjs`
- Modify: `tests/project-video-coverage.test.mjs`

**Interfaces:**
- Consumes: completed public page and existing video builder.
- Produces: one Hub card, 1280×720 H.264 tutorial, matching poster, WebVTT and showcase image.

- [ ] **Step 1: Update publication tests first**

Require the Hub card name“砖块小人与随身小物图鉴”、brief mentioning“45 个砖块小人、11 件随身小物、右侧详情与换装检查”、and tags `双图鉴 / 文案换行 / 随身小物 / Unity同步`。Require tutorial copy and captions to mention tab switching, inline detail, item trial and save.

- [ ] **Step 2: Run publication tests and confirm copy/media failures**

Run: `node --test tests/brick-character-copy-preview-publish.test.mjs tests/brick-video-loading.test.mjs tests/project-video-coverage.test.mjs`

Expected: FAIL on old card metadata and old media narrative.

- [ ] **Step 3: Update metadata and recording script**

Record this sequence at 1280×720: open page empty detail → choose role → show diagnostics → switch to trinkets → choose rose → trial → save inline → follow the independent market link. Keep total duration 38–55 seconds and six or seven single-line Chinese cues.

- [ ] **Step 4: Generate and inspect media**

Run: `node scripts/build-brick-character-copy-preview-video.mjs`

Then run: `node --test tests/brick-character-copy-preview-publish.test.mjs tests/brick-video-loading.test.mjs tests/project-video-coverage.test.mjs`

Expected: PASS; codec `h264`, dimensions `1280×720`, duration `38–55`, caption cue count matches the script and every cue has one text line.

- [ ] **Step 5: Capture the real Hub showcase and commit**

Use the existing repository showcase capture flow against the finished local page, not a mockup. Verify the image visibly contains both columns and the trinket tab/detail. Commit metadata and regenerated media together.

```bash
git add app-20260706-restore-games.js hub-project-media.js scripts/hub-showcase-media-sources.json scripts/build-brick-character-copy-preview-video.mjs assets/hub-showcase/brick-character-copy-preview.webp projects/brick-character-copy-preview/video tests/brick-character-copy-preview-publish.test.mjs tests/brick-video-loading.test.mjs tests/project-video-coverage.test.mjs
git commit -m "docs: refresh dual atlas showcase media"
```

---

### Task 8: 完整验证、评审、PR、Pages 与长期记忆

**Files:**
- Modify only when verification exposes a real defect.
- Update after public verification: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`
- Update after public verification: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: merged main SHA, successful GitHub Pages deployment and verified public URLs.

- [ ] **Step 1: Read the release workflow memory immediately before publishing**

Read `FLOW-20260720-004` in `Workflows.md` and the current `AI-Application-Hub.md`. Verify Git identity, repository write access, `origin`, current branch and current `origin/main`; do not store credentials.

- [ ] **Step 2: Run repository release gates**

```bash
git diff --check origin/main...HEAD
node --test tests/brick-gallery-data.test.mjs tests/brick-gallery-diagnostics.test.mjs tests/brick-gallery-atlas-state.test.mjs tests/brick-gallery-trinket-state.test.mjs tests/brick-gallery-page.test.mjs tests/brick-character-copy-preview-publish.test.mjs tests/brick-video-loading.test.mjs tests/trinket-market-core.test.mjs tests/trinket-market-page.test.mjs tests/trinket-market-publish.test.mjs tests/project-video-coverage.test.mjs tests/hub-subpage-contract.test.mjs
node tests/brick-gallery-browser-smoke.mjs
node tests/brick-gallery-trinket-browser-smoke.mjs
node tests/trinket-market-browser-smoke.mjs
npm run audit:hub
```

Expected: every command exits 0; no console errors, page errors, failed assets, body overflow, ghost image or drag regression.

- [ ] **Step 3: Perform code review and resolve findings**

Review `origin/main...HEAD` against the approved spec. Fix every Critical or Important finding, rerun the affected focused suite, then rerun Step 2. Verify `git status --short` contains only intended files.

- [ ] **Step 4: Rebase, push and merge normally**

Fetch current `origin/main`, rebase the feature branch, rerun Step 2, push without force, open a PR, and merge only after required checks succeed. Record the exact merge SHA.

- [ ] **Step 5: Verify GitHub Pages for the exact merge SHA**

Wait for Pages and Hub validation workflows tied to the exact merged main SHA. Verify public Hub, dual atlas, old copy review, trinket market, video page, poster, VTT and MP4. Check MP4 Range returns `206`, both desktop and mobile interactions work, and public console/network logs have no errors.

- [ ] **Step 6: Update long-term memory and report**

Update the existing project records with date, source, confirmed status, public URL, PR, merge SHA, asset counts, test evidence and future `hand` resource sync rule. Do not add full chat logs, tokens, cookies or credentials.

```bash
git status --short --branch
git log -1 --oneline origin/main
```

Expected: clean working tree and `origin/main` at the verified deployed merge SHA.
