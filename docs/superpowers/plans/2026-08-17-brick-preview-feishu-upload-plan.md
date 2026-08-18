# Brick Preview Feishu Sync And Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a better-laid-out brick character preview whose bundled copy and images match the two confirmed Feishu sheets and whose per-role image overrides persist locally in the browser.

**Architecture:** Keep the existing static single-page project and add a small IndexedDB-backed image override layer inside its current inline script. Ship 20 bundled PNG assets: ten skin images sourced from Feishu sheet 1 and ten career images sourced from Feishu sheet 2. Browser tests own the upload, persistence, restore, and layout contracts so GitHub Pages remains backend-free.

**Tech Stack:** Static HTML/CSS/JavaScript, IndexedDB, Canvas image processing, Node test runner, Playwright, GitHub Pages.

## Global Constraints

- Feishu workbook `ZWUqsjcJrhdB12tYS1gcEs5Inbh` revision 369 is the content source of truth.
- Sheet `砖块角色文案` provides final skin-role names, summaries, catalog copy, and images for IDs 1-10.
- Sheet `砖块皮肤配置` provides final career-role images for IDs 1-10.
- Uploaded files stay in the current browser; the page never uploads them to GitHub or another service.
- Accept PNG, JPEG, and WebP up to 8 MB; resize either edge above 1024px and persist processed WebP Blobs in IndexedDB.
- Keep the Hub card in `#engineering` with badge `工程体验`; keep project and video return links pointing to `#engineering`.
- Preserve all ten existing career-role names and copy.

---

### Task 1: Lock The Feishu Content And Asset Contract

**Files:**
- Modify: `tests/brick-character-copy-preview-publish.test.mjs`
- Modify: `tests/brick-character-copy-preview-browser-smoke.mjs`
- Create: `projects/brick-character-copy-preview/assets/career-meituan-rider.png`
- Create: `projects/brick-character-copy-preview/assets/career-taobao-flash-rider.png`
- Create: `projects/brick-character-copy-preview/assets/career-jd-courier.png`
- Create: `projects/brick-character-copy-preview/assets/career-sf-courier.png`
- Create: `projects/brick-character-copy-preview/assets/career-basketball-player.png`
- Create: `projects/brick-character-copy-preview/assets/career-suited-boss.png`
- Create: `projects/brick-character-copy-preview/assets/career-grid-programmer.png`
- Create: `projects/brick-character-copy-preview/assets/career-construction-worker.png`
- Create: `projects/brick-character-copy-preview/assets/career-male-server.png`
- Create: `projects/brick-character-copy-preview/assets/career-female-server.png`
- Replace: the ten existing skin PNGs in `projects/brick-character-copy-preview/assets/`

**Interfaces:**
- Consumes: exported Feishu workbook images mapped by drawing row, sheet ID, and ID column.
- Produces: 20 bundled image paths referenced by the page and exact skin copy assertions.

- [ ] **Step 1: Write failing static assertions for final content**

Update the publish test to assert all 20 roles have an `image` property and assert the final skin tuples, including:

```js
assert.deepEqual(skinRoles.map(({ name, summary, copy }) => ({ name, summary, copy })), [
  { name: "原皮战神", summary: "/", copy: "没有配饰也敢直接出场，原皮才是最强皮肤。" },
  { name: "邻家甜妹", summary: "甜妹能量满格，烦恼暂不接待", copy: "少女能量上线，专治阴天、困倦和隔壁那位的坏心情。" },
  { name: "冬帽草团子", summary: "帽檐压住寒风，没压住一脸小脾气", copy: "红色暖帽裹住嫩青草，疲惫感瞬间被自然气息治愈。" },
  { name: "满眼心动", summary: "爱心镜片映出主角，快乐这回不用向外借", copy: "粉红滤镜只认本人，所有温柔最后都回到自己身上。" },
  { name: "草场从容哥", summary: "绿帽压着青草，松弛感铺满草场", copy: "出门太急拿错了那顶，回头率却直接拉满；小尴尬也算限定装扮。" },
  { name: "萝卜界甜心", summary: "蓝蝴蝶结晃一下，甜妹能量满格", copy: "蓝蝶结搭配橙色胡萝卜，甜妹能量已经全部补充完毕。" },
  { name: "枯木逢春", summary: "不是不开心，只是笑容正在冬眠，预计开春重新加载", copy: "身体还是老木桩，头顶已经偷偷把春天更新到最新版。" },
  { name: "咩羊哥", summary: "不是哥们，棉花怎么突然长出羊脸了！", copy: "只要没人说破，它就同时保持棉花和小羊两种状态。" },
  { name: "超前毛线团", summary: "粉镜配毛线团，也能走出时尚秀", copy: "粉色镜框镇住混乱，纠缠半天反而织出了高级感。" },
  { name: "黑镜麦霸总", summary: "墨镜一戴气场全开，麦穗也当霸总", copy: "别的庄稼迎风弯腰，他扶了扶墨镜，静候秋天亲自递上分红。" },
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/brick-character-copy-preview-publish.test.mjs`

Expected: FAIL because career roles lack images and the current skin copy differs from Feishu.

- [ ] **Step 3: Prepare the Feishu images**

Use the exported XLSX drawing relationships so sheet 1 rows 2-11 map to media images 1-10 and sheet 2 rows 2-11 map to media images 11-20. Convert sheet 1 images to the existing skin filenames. Prepare sheet 2 images as transparent, consistently padded career PNGs with this semantic mapping: IDs 1-6 map to career roles 1-6; programmer uses ID 9; construction worker uses ID 7; male server uses ID 10; female server uses ID 8. Do not redraw the supplied artwork.

- [ ] **Step 4: Verify the new assets**

Run a Node/Sharp inspection that asserts all 20 paths decode, have nonzero dimensions, and the ten career PNGs contain transparent edge pixels and visible nontransparent pixels.

- [ ] **Step 5: Commit the asset contract**

```bash
git add tests/brick-character-copy-preview-publish.test.mjs projects/brick-character-copy-preview/assets
git commit -m "assets: sync brick roles from Feishu"
```

### Task 2: Fix Layout And Synchronize Page Content

**Files:**
- Modify: `projects/brick-character-copy-preview/index.html`
- Modify: `tests/brick-character-copy-preview-browser-smoke.mjs`

**Interfaces:**
- Consumes: the 20 bundled image paths from Task 1.
- Produces: final role data, single-line preview controls, image-action cells, and stable selectors used by Task 3.

- [ ] **Step 1: Write failing layout and content browser assertions**

Add assertions that all 20 rows contain a thumbnail, the skin names match Feishu, and every `.preview-btn` satisfies:

```js
const previewGeometry = await page.locator(".preview-btn").evaluateAll((buttons) => buttons.map((button) => {
  const cell = button.closest("td");
  const buttonRect = button.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  return {
    oneLine: button.scrollHeight <= button.clientHeight,
    inside: buttonRect.left >= cellRect.left && buttonRect.right <= cellRect.right,
  };
}));
assert.equal(previewGeometry.every(({ oneLine, inside }) => oneLine && inside), true);
```

- [ ] **Step 2: Run browser smoke and verify RED**

Run: `node tests/brick-character-copy-preview-browser-smoke.mjs`

Expected: FAIL because only ten rows have images, old skin copy remains, and the preview control wraps at affected widths.

- [ ] **Step 3: Implement the minimal content and layout update**

Update the 20 role objects with the new bundled image paths and Feishu skin copy. Make the preview button content-sized and single-line:

```css
.col-action { width: 72px; padding-inline: 6px; }
.preview-btn {
  display: inline-flex;
  width: max-content;
  min-width: 0;
  height: 30px;
  padding: 0 7px;
  align-items: center;
  justify-content: center;
  line-height: 1;
  white-space: nowrap;
}
```

Render each thumbnail as a button with `data-upload-index`, `aria-label="上传或替换<角色名>图片"`, and a visible `上传` or `替换` affordance. Add a hidden `#role-image-input`, polite `#upload-status`, and conditional `data-restore-index` control.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/brick-character-copy-preview-publish.test.mjs
node tests/brick-character-copy-preview-browser-smoke.mjs
```

Expected: PASS for content, assets, search, image previews, and layout geometry before persistence assertions are enabled.

- [ ] **Step 5: Commit the page sync**

```bash
git add projects/brick-character-copy-preview/index.html tests/brick-character-copy-preview-browser-smoke.mjs
git commit -m "feat: sync brick preview content and layout"
```

### Task 3: Add Browser-Local Image Uploads

**Files:**
- Modify: `projects/brick-character-copy-preview/index.html`
- Modify: `tests/brick-character-copy-preview-browser-smoke.mjs`

**Interfaces:**
- Produces: IndexedDB database `brick-character-copy-preview-v1`, object store `image-overrides`, keyed by `role.code`.
- Provides DOM behavior through `#role-image-input`, `[data-upload-index]`, `[data-restore-index]`, and `#upload-status`.

- [ ] **Step 1: Write the failing upload persistence test**

Use Playwright `setInputFiles` with an in-memory PNG fixture, then assert the selected role thumbnail and `#preview-image` use a Blob URL. Reload, select the same role, and assert the override still appears. Click restore, reload again, and assert the bundled asset URL returns.

- [ ] **Step 2: Run browser smoke and verify RED**

Run: `node tests/brick-character-copy-preview-browser-smoke.mjs`

Expected: FAIL because no upload event, IndexedDB record, or restore action exists.

- [ ] **Step 3: Implement IndexedDB and image processing**

Add focused functions with these signatures:

```js
openImageDatabase(): Promise<IDBDatabase>
getImageOverrides(): Promise<Map<string, Blob>>
saveImageOverride(roleCode: string, blob: Blob): Promise<void>
deleteImageOverride(roleCode: string): Promise<void>
prepareImage(file: File): Promise<Blob>
setRoleImageOverride(index: number, blob: Blob): Promise<void>
restoreRoleImage(index: number): Promise<void>
```

`prepareImage` validates the MIME allowlist and 8 MB limit, decodes the file, preserves aspect ratio, caps either edge at 1024px, and returns a WebP Blob. Store Blobs, not data URLs. Keep a role-to-object-URL map and revoke replaced URLs.

If IndexedDB fails, retain the Blob URL for the session and announce `图片已用于本次预览，但当前浏览器无法在刷新后保留。` through `#upload-status`.

- [ ] **Step 4: Add validation tests**

Test an unsupported text file and a file larger than 8 MB. Assert the current image remains unchanged and the status text describes the rejection.

- [ ] **Step 5: Run browser smoke and verify GREEN**

Run: `node tests/brick-character-copy-preview-browser-smoke.mjs`

Expected: PASS at desktop and mobile widths with upload, reload persistence, restore, validation, no console errors, and no body overflow.

- [ ] **Step 6: Commit local upload support**

```bash
git add projects/brick-character-copy-preview/index.html tests/brick-character-copy-preview-browser-smoke.mjs
git commit -m "feat: persist local brick role images"
```

### Task 4: Refresh Media And Run The Complete Local Gate

**Files:**
- Modify: `projects/brick-character-copy-preview/video/brick-character-copy-preview-demo.mp4`
- Modify: `projects/brick-character-copy-preview/video/poster.jpg`
- Modify: `projects/brick-character-copy-preview/video/brick-character-copy-preview-demo.vtt`
- Modify: `projects/brick-character-copy-preview/video/tutorial-script.md`

**Interfaces:**
- Consumes: final page behavior from Tasks 2-3.
- Produces: a truthful walkthrough and final local release evidence.

- [ ] **Step 1: Rebuild the walkthrough from the current page**

Run: `node scripts/build-brick-character-copy-preview-video.mjs`

Expected: H.264 `1280x720` media showing the final copy, 20 bundled images, compact preview controls, and local upload action.

- [ ] **Step 2: Run focused project gates**

```bash
node --test tests/brick-character-copy-preview-publish.test.mjs
node tests/brick-character-copy-preview-browser-smoke.mjs
node scripts/hub-publication-audit.mjs
```

Expected: all focused tests pass and publication audit findings equal zero.

- [ ] **Step 3: Run the complete Hub suite**

Run the exact repository commands used by `.github/workflows/verify-clickflow-publish.yml`:

```bash
node --test
npm run audit:hub -- --check-external
node tests/hub-video-pages-browser-smoke.mjs
node tests/hub-entry-pages-browser-smoke.mjs
node tests/clickflow-browser-smoke.mjs
```

Expected: no new failures; environment-only skips remain documented.

- [ ] **Step 4: Commit media and final test adjustments**

```bash
git add projects/brick-character-copy-preview/video tests scripts
git commit -m "test: verify refreshed brick preview"
```

### Task 5: Publish And Verify GitHub Pages

**Files:**
- Modify if cache busting is required: `index.html`
- Modify: `app-20260706-restore-games.js`

**Interfaces:**
- Produces: merged `main`, successful Pages deployment, successful full Hub workflow, and public acceptance evidence.

- [ ] **Step 1: Refresh the Hub cache version if project HTML changed**

Append the unique `20260817-brick-preview-feishu-upload` marker to the homepage runtime query suffix and assert that exact marker in `tests/brick-character-copy-preview-publish.test.mjs`.

- [ ] **Step 2: Push and open a draft PR**

```bash
git push -u origin agent/brick-preview-upload
gh pr create --repo wthpein010-dev/ai-application-hub --base main --head agent/brick-preview-upload --draft --title "更新砖块角色预览内容和图片上传" --body "同步飞书确认的角色文案和20张默认图，修复预览按钮换行，并新增浏览器本地图片上传、持久化和恢复。"
```

- [ ] **Step 3: Run the complete branch publication workflow**

Dispatch `Verify ClickFlow publication` for `agent/brick-preview-upload` and require success before making the PR ready.

- [ ] **Step 4: Merge and wait for final workflows**

Merge the ready PR to `main`; require Pages, complete Hub/browser verification, and macOS download audit to succeed for the exact merge SHA.

- [ ] **Step 5: Perform fresh public acceptance**

At `1440x900` and `390x844`, verify 20 correct rows and images, Feishu-confirmed copy, single-line preview controls, local upload persistence after reload, restore behavior, no duplicate Hub card, engineering badge, valid return links, video playback, no horizontal body overflow, and no console/resource errors.

- [ ] **Step 6: Update project memory**

Record the final merge SHA, PR, workflow IDs, public URLs, Feishu revision, upload behavior, media details, and acceptance results in `AI-Application-Hub.md`.
