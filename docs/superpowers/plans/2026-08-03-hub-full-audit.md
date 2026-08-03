# AI Application Hub 全站审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 逐项修复 24 个公开项目的文案、分类、视频、子页、按钮、资源与 Windows/macOS 声明，并完成 GitHub Pages 公网验收。

**Architecture:** 以 `app-20260706-restore-games.js` 为单一目录源，新增可重复运行的审计模块，把卡片、页面、视频、下载与平台证据转成结构化结果。先通过失败测试固定真实性规则，再分目录数据、媒体页面、演示外壳和平台资产四个边界修复，最后使用同一浏览器门禁检查本地与公网。

**Tech Stack:** 静态 HTML/CSS/JavaScript、Node.js 24 test runner、Playwright 1.61.1、ffmpeg-static 5.2.0、PowerShell、GitHub Actions、GitHub Pages。

## Global Constraints

- 保留用户已固化的主页标题、副标题和其他自定义文案；只修正已证明错误的项目字段。
- 小游戏、AI 版、工程体验和纯网页工具只显示“演示 / 视频”。
- 只有真实可运行且有双平台证据的桌面产品显示“演示 / 视频 / Wins下载 / Mac下载”。
- 源码、说明页、WebGL、Unity 工程和错误项目压缩包不得冒充系统成品。
- 所有视频页返回正确分区，统一播放器，H.264、4 分钟以内，字幕单行且不越过视频时长。
- 所有本地子页在 `1440x900` 与 `390x844` 无横向溢出、遮挡和控制台错误。
- 修改使用 TDD；每个行为先观察失败，再最小修复并运行覆盖测试。
- 发布必须基于最新 `origin/main`，推送后等待 Pages 与完整工作流，并在公网重复验收。

---

### Task 1: 可重复的全站审计门禁

**Files:**
- Create: `scripts/hub-publication-audit.mjs`
- Create: `tests/hub-publication-audit.test.mjs`
- Create: `docs/audits/2026-08-03-hub-publication-baseline.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadDefaultAppsFromRuntime(runtime)` from `tests/helpers/default-apps.mjs`.
- Produces: `auditCatalog({ root, runtime, onlineBaseUrl? }) -> Promise<{summary, projects, findings}>` and CLI JSON/Markdown output.

- [ ] **Step 1: Write the failing catalog policy tests**

```js
test("public cards expose only truthful platform actions", async () => {
  const report = await auditCatalog({ root, runtime });
  assert.deepEqual(report.findings.filter((item) => item.rule === "platform-artifact"), []);
});

test("every video returns to the owning catalog section", async () => {
  const report = await auditCatalog({ root, runtime });
  assert.deepEqual(report.findings.filter((item) => item.rule === "video-home-target"), []);
});
```

- [ ] **Step 2: Run the tests and verify they fail on current false downloads and bare video-home links**

Run: `node --test tests/hub-publication-audit.test.mjs`

Expected: FAIL naming the affected card IDs and video pages.

- [ ] **Step 3: Implement the read-only auditor**

The module must parse all 24 cards, resolve local targets without escaping the repository, classify action types, inspect ZIP member names, inspect video HTML/MP4/VTT, detect orphan placeholder projects, and optionally issue bounded HTTP requests for public targets. It must never mutate source files.

- [ ] **Step 4: Add a stable CLI and baseline report**

Add `"audit:hub": "node scripts/hub-publication-audit.mjs"` to `package.json`. Run it once against the unmodified catalog and record every current finding with exact paths and counts in the baseline Markdown.

- [ ] **Step 5: Verify unit coverage**

Run: `node --test tests/hub-publication-audit.test.mjs tests/default-apps-helper.test.mjs`

Expected: parser tests pass; policy tests remain red until Tasks 2-5.

### Task 2: 目录分类、旧缓存与公开文案

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `projects/icecream/index.html`
- Modify: `projects/clickflow/index.html`
- Modify: `projects/pureshrink/index.html`
- Modify: `tests/nang-hub-catalog.test.mjs`
- Create: `tests/hub-catalog-copy-and-migration.test.mjs`

**Interfaces:**
- Consumes: Task 1 audit rules.
- Produces: normalized 24-card catalog and `normalizeApp(app)` migrations that preserve custom text except safety-critical identity/classification fields.

- [ ] **Step 1: Add failing tests for Planner migration and exact public identity**

```js
test("legacy Planner metadata cannot move the training tool into games", () => {
  const planner = migrate({ id: "planner-daily-quiz", status: "game" });
  assert.equal(planner.status, "training");
});

test("project page titles use their catalog names", () => {
  assert.equal(readTitle("projects/icecream/index.html"), "吃了个冰");
  assert.equal(readTitle("projects/clickflow/index.html"), "ClickFlow 鼠标自动化");
  assert.equal(readTitle("projects/pureshrink/index.html"), "无损压缩工坊");
});
```

- [ ] **Step 2: Verify the new tests fail for stale storage and title drift**

Run: `node --test tests/hub-catalog-copy-and-migration.test.mjs`

- [ ] **Step 3: Correct the Hub brief and focused card copy**

Replace the HyperFrames claim with a concise catalog description; make Codex Reviewer explicitly mention conversation scoring, issue suggestions and Excel export. Do not alter page-level user text stored in `index.html`.

- [ ] **Step 4: Add field-level migrations**

Force Planner `status/category/badge` to current defaults and keep the existing forced Nang identity. Keep `vita-mahjong` in `status: "ai"` and `#engineering` per the confirmed user decision.

- [ ] **Step 5: Align project titles and rerun tests**

Run: `node --test tests/hub-catalog-copy-and-migration.test.mjs tests/nang-hub-catalog.test.mjs tests/planner-daily-quiz-admin-question-bank.test.mjs`

Expected: all pass.

### Task 3: 真实按钮与下载资源清理

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `projects/codex-habit-tool/index.html`
- Modify: `projects/Codex对话评分工具/index.html`
- Modify: `tests/card-action-layout.test.mjs`
- Modify: `tests/codex-habit-tool-publish.test.mjs`
- Create: `tests/hub-platform-artifacts.test.mjs`
- Delete: unreferenced placeholder/source/wrong-product archives identified by Task 1
- Delete: `projects/AI面试陪练小剧场/`
- Delete: `projects/备选应用工具创意库/`

**Interfaces:**
- Consumes: `isDirectPackageHref`, `platformValue`, archive classifications from Task 1.
- Produces: card actions whose labels match artifact truth and a downloads directory containing only referenced, valid public artifacts.

- [ ] **Step 1: Write failing tests for action policy**

```js
for (const id of ["hub", "icecream", "vita-mahjong", "fill-what", "web-media-collector", "travel-generator", "codex-habit-tool", "wanhuatong"]) {
  test(`${id} is cross-platform through the web and has no fake OS actions`, () => {
    assert.deepEqual(actionsFor(id), ["web", "video"]);
  });
}
```

Add exact archive assertions that reject the unrelated Reviewer folder inside the Habit ZIP and the unrelated Web Media Collector files inside the Travel Mac ZIP.

- [ ] **Step 2: Verify the tests fail on the current catalog and archives**

Run: `node --test tests/hub-platform-artifacts.test.mjs tests/card-action-layout.test.mjs tests/codex-habit-tool-publish.test.mjs`

- [ ] **Step 3: Remove invalid public platform fields**

Clear `package`, `platforms.windows` and `platforms.mac` for web-first tools and games. Keep four actions only for the verified native products; keep the Feishu extension package only when both platform entries are explicitly tested as the same valid browser extension.

- [ ] **Step 4: Make Windows-only tools truthful**

Keep their cross-platform web preview and remove source-only Mac buttons. Remove embedded download CTAs from demo pages when those CTAs point to polluted or unsupported packages; explain platform limits in visible copy without calling source an app.

- [ ] **Step 5: Delete orphan placeholders and invalid archives**

Before each deletion, run `rg` to prove no active card, page, test, workflow or documentation references it. Preserve real release assets and source used to reproduce products.

- [ ] **Step 6: Verify action rows and repository cleanliness**

Run: `node --test tests/hub-platform-artifacts.test.mjs tests/card-action-layout.test.mjs tests/project-video-coverage.test.mjs`

Expected: no fake OS actions, no broken local targets, card order remains `演示 / 视频 / Wins下载 / Mac下载` where all four exist.

### Task 4: 视频返回、字幕与竖屏呈现

**Files:**
- Modify: 21 affected video HTML pages listed by Task 1
- Modify: `projects/gamepulse-mini-radar/video/gamepulse-mini-radar-demo.vtt`
- Modify: `assets/hub-video-player.css`
- Modify: `tests/project-video-coverage.test.mjs`
- Modify: `tests/hub-video-pages-browser-smoke.mjs`
- Create: `tests/hub-video-content.test.mjs`

**Interfaces:**
- Consumes: catalog section resolver from Task 1.
- Produces: `data-video-orientation="portrait|landscape"` page metadata and correct return anchors.

- [ ] **Step 1: Add failing tests for all 24 return anchors and caption duration**

```js
assert.equal(homeHrefFor(app), expectedHomeHref(app));
assert.ok(lastCueEnd <= mediaDuration + 0.001);
assert.equal(cues.some((cue) => cue.lines.length !== 1), false);
```

- [ ] **Step 2: Verify failures identify the 21 bare links and stale GamePulse cue**

Run: `node --test tests/hub-video-content.test.mjs tests/project-video-coverage.test.mjs`

- [ ] **Step 3: Patch every return link to its owning section**

Use `#games` for `status: game`, `#engineering` for `ai/engineering`, and `#apps` for all other cards. Preserve each page's relative root depth.

- [ ] **Step 4: Repair GamePulse captions and portrait presentation**

Rename the stale cue to“小游戏每日排行”, end the final cue no later than `00:01:14.800`, and add portrait stage styling for `馕了个馕` without changing the shared desktop maximum width.

- [ ] **Step 5: Run static and browser video gates**

Run: `node --test tests/hub-video-content.test.mjs tests/project-video-coverage.test.mjs`

Run: `node tests/hub-video-pages-browser-smoke.mjs`

Expected: 24 pages pass at desktop/mobile, no failed resources or console errors, portrait page remains legible.

### Task 5: 演示子页统一外壳与返回路径

**Files:**
- Modify: local project `index.html` pages that lack `hub-subpage` / `hub-home-link`
- Modify: `assets/subpage-shell.css`
- Create: `tests/hub-entry-pages-browser-smoke.mjs`
- Create: `tests/hub-subpage-contract.test.mjs`

**Interfaces:**
- Consumes: expected section resolver from Task 1.
- Produces: a browser report per page `{id, viewport, returnHref, overflow, consoleErrors, httpErrors}`.

- [ ] **Step 1: Write a failing static shell test**

For every local entry, assert one visible `.hub-home-link`, exact return anchor, current document title and no obsolete `全部项目总览.html` target.

- [ ] **Step 2: Write a failing browser smoke**

At `1440x900` and `390x844`, navigate all local entries, collect console/page/response errors, horizontal overflow, visible return button and nonblank primary content.

- [ ] **Step 3: Verify failures before changing pages**

Run: `node --test tests/hub-subpage-contract.test.mjs`

Run: `node tests/hub-entry-pages-browser-smoke.mjs`

- [ ] **Step 4: Apply the shared shell without flattening project-specific UI**

Add the common body class, stylesheet and fixed return link. Keep each tool/game's real working surface, aspect ratio and interaction design.

- [ ] **Step 5: Verify desktop/mobile rendering**

Run the static and browser commands again; expected 0 overflow, 0 console errors, 0 failed local resources.

### Task 6: 原生平台证据与公开清单

**Files:**
- Modify: platform manifests/tests for `codex-quota-bar`, `codex-thread-workbench`, `clickflow`, `pureshrink` when evidence is incomplete
- Create: `docs/audits/2026-08-03-platform-compatibility.md`
- Modify: `.github/workflows/verify-clickflow-publish.yml`

**Interfaces:**
- Consumes: Task 1 archive inspection and existing release manifests.
- Produces: one evidence row per card and CI enforcement for every visible native download.

- [ ] **Step 1: Add failing evidence tests for visible OS actions**

Each visible native action must resolve to a production asset with platform/architecture metadata, archive member proof and a native CI or recorded machine smoke result.

- [ ] **Step 2: Remove claims that cannot be proven rather than inventing evidence**

If an existing release has no durable proof, add a bounded workflow smoke or record the existing native workflow run and immutable asset digest. Do not relabel source packages as native apps.

- [ ] **Step 3: Generate the compatibility matrix**

Document all 24 cards as `web cross-platform`, `browser extension`, `native Windows+macOS`, or `engineering/game demo`, with exact URLs and evidence.

- [ ] **Step 4: Run platform tests and archive checks**

Run: `node --test tests/hub-platform-artifacts.test.mjs tests/codex-quota-bar-download.test.mjs tests/codex-thread-workbench-download.test.mjs tests/clickflow-packaging.test.mjs tests/pureshrink-publish.test.mjs`

Expected: all visible download actions have real artifacts and evidence.

### Task 7: 全量本地验收与独立代码审查

**Files:**
- Modify: only defects found by the gates
- Create: `docs/audits/2026-08-03-hub-local-acceptance.md`

**Interfaces:**
- Consumes: all previous tests and reports.
- Produces: final local acceptance evidence tied to a commit SHA.

- [ ] **Step 1: Run syntax and repository checks**

Run: `node --check app-20260706-restore-games.js`

Run: `git diff --check`

- [ ] **Step 2: Run the complete Node suite with locked FFmpeg**

PowerShell:

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
node --test
```

- [ ] **Step 3: Run both complete browser gates**

Run: `node tests/hub-video-pages-browser-smoke.mjs`

Run: `node tests/hub-entry-pages-browser-smoke.mjs`

- [ ] **Step 4: Run the audit CLI in local mode**

Run: `npm run audit:hub -- --format markdown`

Expected: 24 cards, 0 Critical/Important findings, all local targets present.

- [ ] **Step 5: Request independent whole-branch review**

Review the complete diff against the design spec; fix all Critical/Important findings and re-run their covering tests.

### Task 8: GitHub Pages 发布与公网逐项验收

**Files:**
- Modify: `docs/audits/2026-08-03-hub-public-acceptance.md`
- Modify: Obsidian project memory after publication

**Interfaces:**
- Consumes: clean local acceptance commit.
- Produces: public SHA, workflow IDs, online audit JSON and browser evidence.

- [ ] **Step 1: Confirm permissions and synchronize `origin/main`**

Run: `gh auth status`, `gh api repos/wthpein010-dev/ai-application-hub --jq .permissions.push`, `git fetch origin main`.

- [ ] **Step 2: Commit only audited files and push to `main`**

Use explicit `git add` paths; do not stage unrelated user files.

- [ ] **Step 3: Wait for both Pages and full verification workflows**

Require success for the exact pushed SHA.

- [ ] **Step 4: Run the audit CLI against GitHub Pages**

Run: `npm run audit:hub -- --online-base https://wthpein010-dev.github.io/ai-application-hub/ --format markdown`.

- [ ] **Step 5: Run public desktop/mobile browser acceptance**

Check Hub, all entry pages, all video pages, all visible actions and bounded media playback. Require 0 console/page/request errors and correct return navigation.

- [ ] **Step 6: Update project memory and close the audit only with complete evidence**

Record the final SHA, workflow IDs, test counts, remaining conditional skips and any truthful platform limitation. Mark the active goal complete only when no required work remains.
