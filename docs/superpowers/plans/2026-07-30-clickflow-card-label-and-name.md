# ClickFlow Card Label and Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the shorter “ClickFlow 鼠标自动化” card name and the “辅助工具” blue badge while preserving downloads and migrating cached legacy defaults.

**Architecture:** Keep the change inside the Hub catalog runtime and its tests. Update the ClickFlow default record, add an exact-default migration inside `normalizeApp`, assert the rendered card in the existing headless browser smoke test, and cache-bust the homepage runtime before publishing to `main`.

**Tech Stack:** Vanilla JavaScript, Node.js test runner, Node `vm`, Playwright Chromium, GitHub Actions, GitHub Pages.

## Global Constraints

- Public card name must be exactly `ClickFlow 鼠标自动化`.
- Blue badge must be exactly `辅助工具`; catalog status must be `assistant`.
- Category must remain `桌面自动化工具`.
- The four actions must remain `演示 / 视频 / Wins下载 / Mac下载` with unchanged URLs and order.
- Demo page, video page, desktop application title, package filenames, and Release tag must not change.
- Cached old defaults migrate; a user-customized ClickFlow name must remain unchanged.

---

## File Structure

- Modify `app-20260706-restore-games.js`: ClickFlow default catalog metadata and exact-default cache migration.
- Modify `tests/clickflow-publish.test.mjs`: catalog and local-storage migration regression coverage.
- Modify `tests/clickflow-browser-smoke.mjs`: rendered title, badge, category, and action-order acceptance.
- Modify `index.html`: runtime cache version for existing public visitors.

### Task 1: Lock the new catalog contract with failing tests

**Files:**
- Modify: `tests/clickflow-publish.test.mjs`
- Modify: `tests/clickflow-browser-smoke.mjs`

**Interfaces:**
- Consumes: `loadDefaultAppsFromRuntime(runtime: string): object[]` from `tests/helpers/default-apps.mjs`.
- Produces: regression coverage for default metadata, cached-default migration, customized-name preservation, and rendered card copy.

- [ ] **Step 1: Add the default metadata assertions**

In the existing test `ClickFlow is the final application and exposes the four publication actions`, add:

```js
assert.equal(clickFlow.name, "ClickFlow 鼠标自动化");
assert.equal(clickFlow.category, "桌面自动化工具");
assert.equal(clickFlow.status, "assistant");
assert.equal(clickFlow.badge, "辅助工具");
```

Replace the existing `desktop` status assertion with the `assistant` assertion.

- [ ] **Step 2: Add a real cached-catalog harness and migration tests**

Read the runtime once and evaluate its real `loadApps`, `normalizeApp`, and `cloneApp` functions:

```js
import vm from "node:vm";

const runtime = readFileSync(runtimePath, "utf8");

function loadAppsWithStoredValue(stored) {
  const start = runtime.indexOf("function loadApps");
  const end = runtime.indexOf("function projectHref", start);
  const storage = new Map([
    ["ai-competition-hub-v2-apps", JSON.stringify(stored)],
  ]);
  const context = {
    globalThis: { defaultApps: loadDefaultApps() },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
  };
  const source = [
    'const STORAGE_KEY = "ai-competition-hub-v2-apps";',
    "const statusLabel = { desktop: true, assistant: true };",
    'const OLD_HUB_BRIEF = "";',
    'const HUB_BRIEF = "";',
    "const defaultApps = globalThis.defaultApps;",
    runtime.slice(start, end),
    "globalThis.loadApps = loadApps;",
  ].join("\n");
  vm.runInNewContext(source, context);
  return context.globalThis.loadApps();
}
```

Add two tests:

```js
test("legacy ClickFlow defaults migrate to the shorter auxiliary-tool card", () => {
  const current = loadDefaultApps().find((app) => app.id === "clickflow");
  const legacy = {
    ...current,
    name: "ClickFlow 鼠标自动化工作台",
    status: "desktop",
    badge: "Windows · macOS",
  };

  const migrated = loadAppsWithStoredValue([legacy]).find(
    (app) => app.id === "clickflow",
  );

  assert.equal(migrated.name, "ClickFlow 鼠标自动化");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
  assert.equal(migrated.category, "桌面自动化工具");
});

test("ClickFlow migration preserves a customized name", () => {
  const current = loadDefaultApps().find((app) => app.id === "clickflow");
  const customized = {
    ...current,
    name: "我的鼠标工具",
    status: "desktop",
    badge: "Windows · macOS",
  };

  const migrated = loadAppsWithStoredValue([customized]).find(
    (app) => app.id === "clickflow",
  );

  assert.equal(migrated.name, "我的鼠标工具");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
});
```

- [ ] **Step 3: Add rendered-card assertions**

After locating `clickFlowCard` in `tests/clickflow-browser-smoke.mjs`, add:

```js
assert.equal(
  await clickFlowCard.locator("h3").textContent(),
  "ClickFlow 鼠标自动化",
);
assert.equal(
  await clickFlowCard.locator(".status-badge").textContent(),
  "辅助工具",
);
assert.equal(
  await clickFlowCard.locator(".card-meta > span").nth(1).textContent(),
  "桌面自动化工具",
);
```

- [ ] **Step 4: Run the tests and verify the expected failures**

Run:

```powershell
node --test tests/clickflow-publish.test.mjs
node tests/clickflow-browser-smoke.mjs
```

Expected: the catalog test fails because the default status is still `desktop`; browser smoke fails because the card still renders the old title and `Windows · macOS` badge.

### Task 2: Implement the exact-default migration and card metadata

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: the ClickFlow catalog contract established in Task 1.
- Produces: a default ClickFlow record with `name`, `status`, and `badge` set to the approved values; `normalizeApp(app)` migrates only legacy defaults.

- [ ] **Step 1: Update the ClickFlow default record**

Change only these fields:

```js
name: "ClickFlow 鼠标自动化",
category: "桌面自动化工具",
status: "assistant",
badge: "辅助工具",
```

- [ ] **Step 2: Add exact-default migration in `normalizeApp`**

Before the `icecream` migration block, add:

```js
if (normalized.id === "clickflow") {
  if (normalized.name === "ClickFlow 鼠标自动化工作台") {
    normalized.name = base.name;
  }
  if (normalized.status === "desktop") {
    normalized.status = base.status;
  }
  if (normalized.badge === "Windows · macOS") {
    normalized.badge = base.badge;
  }
}
```

- [ ] **Step 3: Cache-bust the homepage runtime**

Change the script query in `index.html` from:

```html
<script src="./app-20260706-restore-games.js?v=20260729-clickflow"></script>
```

to:

```html
<script src="./app-20260706-restore-games.js?v=20260730-clickflow-card"></script>
```

- [ ] **Step 4: Run focused green verification**

Run:

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
node --test tests/clickflow-publish.test.mjs tests/card-action-layout.test.mjs tests/default-apps-helper.test.mjs
node tests/clickflow-browser-smoke.mjs
git diff --check
```

Expected: all Node tests and browser smoke pass; `git diff --check` exits 0.

- [ ] **Step 5: Commit implementation**

```powershell
git add -- app-20260706-restore-games.js index.html tests/clickflow-publish.test.mjs tests/clickflow-browser-smoke.mjs tests/artifacts/clickflow/browser
git commit -m "feat: simplify ClickFlow card identity"
```

### Task 3: Publish and verify the public card

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the committed catalog and migration behavior from Task 2.
- Produces: updated `origin/main`, successful verification and Pages runs, and public-browser evidence.

- [ ] **Step 1: Verify branch currency**

```powershell
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git status --short
```

Expected: remote-left count is `0`; the only local-ahead commits are the design, plan, and implementation commits; working tree is clean.

- [ ] **Step 2: Push the feature branch and wait for full verification**

```powershell
git push origin agent/clickflow-publish
$run = gh run list --branch agent/clickflow-publish --workflow verify-clickflow-publish.yml --limit 1 --json databaseId,headSha | ConvertFrom-Json
gh run watch $run.databaseId --interval 10 --exit-status
```

Expected: the returned `headSha` equals `git rev-parse HEAD`; full Hub suite and ClickFlow browser acceptance both succeed.

- [ ] **Step 3: Fast-forward `main`**

```powershell
git fetch origin main
git push origin HEAD:main
```

Only push if `origin/main` has not advanced independently.

- [ ] **Step 4: Wait for `main` verification and Pages**

Run:

```powershell
$headSha = git rev-parse HEAD
$runs = gh run list --branch main --limit 10 --json databaseId,workflowName,headSha | ConvertFrom-Json | Where-Object headSha -eq $headSha
$runs | ForEach-Object { gh run watch $_.databaseId --interval 10 --exit-status }
gh api repos/wthpein010-dev/ai-application-hub/pages --jq '{status,html_url,source}'
```

Expected: both the ClickFlow verification and Pages deployment conclude `success`; Pages reports `status: built`.

- [ ] **Step 5: Run public Playwright acceptance**

Run a fresh headless browser context:

```powershell
@'
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--headless=new"],
  });
  const errors = [];
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("requestfailed", (request) => {
        errors.push(`${request.url()} ${request.failure()?.errorText}`);
      });
      await page.goto(
        "https://wthpein010-dev.github.io/ai-application-hub/index.html?verify=clickflow-card#apps",
        { waitUntil: "domcontentloaded", timeout: 60000 },
      );
      const card = page.locator('#appGrid article[data-app-id="clickflow"]');
      await card.waitFor({ state: "visible" });
      assert.equal(await card.locator("h3").textContent(), "ClickFlow 鼠标自动化");
      assert.equal(await card.locator(".status-badge").textContent(), "辅助工具");
      assert.equal(
        await card.locator(".card-meta > span").nth(1).textContent(),
        "桌面自动化工具",
      );
      assert.deepEqual(
        await card.locator(".card-actions a").allTextContents(),
        ["演示", "视频", "Wins下载", "Mac下载"],
      );
      assert.equal(
        await page.locator("#appGrid .app-card").last().getAttribute("data-app-id"),
        "clickflow",
      );
      const layout = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        innerWidth,
      ]);
      assert.ok(layout[0] <= layout[1]);
      await page.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@ | node
```

After the browser assertion, verify the four public URLs still return HTTP 200:

```powershell
curl.exe -L -s -o NUL -w "%{http_code}" "https://wthpein010-dev.github.io/ai-application-hub/projects/clickflow/index.html"
curl.exe -L -s -o NUL -w "%{http_code}" "https://wthpein010-dev.github.io/ai-application-hub/projects/clickflow/video/index.html"
curl.exe -L -s -I -o NUL -w "%{http_code}" "https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-Windows-x64.zip"
curl.exe -L -s -I -o NUL -w "%{http_code}" "https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-macOS.zip"
```

- [ ] **Step 6: Update long-term memory**

Update the existing ClickFlow and AI Application Hub project-memory entries with the final `main` SHA, Pages run, verification run, public name, badge, and test result. Do not create duplicate project files.
