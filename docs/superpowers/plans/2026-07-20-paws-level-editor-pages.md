# 关卡3D编辑器 GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Paws 关卡工作台的安全静态快照、实际操作教学视频和应用中心入口发布到 `wthpein010-dev/ai-application-hub` 的 GitHub Pages。

**Architecture:** 复用已验证的浏览器端编辑、校验和试玩模块，用 `StaticWorkbenchApi` 把原 Node API 替换为同域 JSON、相对资源 URL 和浏览器 `localStorage`。应用中心只新增默认项目数据和工程卡片视频入口；教学视频由自动化浏览器实际操作静态页录制，再转码为 H.264 MP4。

**Tech Stack:** 原生 HTML/CSS/JavaScript ES modules、Node.js `node:test`、Three.js 0.145.0、Playwright、FFmpeg H.264、GitHub Pages

## Global Constraints

- 公开版只能提交独立示例关卡，不能提交 `E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels` 的真实 JSON。
- 公开版不能包含本机绝对路径、保存口令、Cookie、备份或其他凭据。
- 使用 `Blocks` 目录的 `block_1.png` 至 `block_32.png`、`block_1001.png` 至 `block_1006.png`，图案按原始比例完整显示。
- 修改保存在浏览器 `localStorage`，键前缀固定为 `paws-level-editor-demo-v1`。
- 应用中心卡片名称固定为 `关卡3D编辑器`，同时提供“演示”和“视频”。
- 视频时长为 75–110 秒、16:9、H.264 MP4，并包含中文 WebVTT 字幕、封面、章节和网页播放器。
- 390px 窄屏不得产生横向溢出；窄屏保持只读试玩策略。
- 发布目标为 `origin/main`，推送后必须执行线上 HTTP 与浏览器验收。

---

### Task 1: 锁定应用中心和静态发布契约

**Files:**
- Create: `tests/paws-level-editor-publish.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: 现有 `defaultApps`、`renderActions(app, stopPropagation, mode)`、`loadApps()`。
- Produces: 唯一的 `paws-level-editor` 默认项目；工程卡片的“演示/视频”链接；旧本地数据与新增默认项目的合并行为。

- [ ] **Step 1: 写应用中心失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const page = readFileSync(join(root, "index.html"), "utf8");

function loadDefaults() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));
  const source = runtime
    .slice(start, start + closing.index + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}

test("hub publishes one 关卡3D编辑器 engineering card", () => {
  const matches = loadDefaults().filter((app) => app.id === "paws-level-editor");
  assert.equal(matches.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(matches[0].platforms)),
    { web: "./projects/paws-level-editor/index.html", windows: "", mac: "" },
  );
  assert.equal(matches[0].name, "关卡3D编辑器");
  assert.equal(matches[0].status, "engineering");
  assert.equal(matches[0].video, "./projects/paws-level-editor/video/index.html");
});

test("stored app merge iterates current defaults so an old browser sees new cards", () => {
  const loader = runtime.slice(runtime.indexOf("function loadApps"), runtime.indexOf("function normalizeApp"));
  assert.match(loader, /return defaultApps\.map\(app => normalizeApp\(storedById\.get\(app\.id\) \|\| app\)\)/);
});

test("home page cache key changes for the published runtime", () => {
  assert.match(page, /app-20260706-restore-games\.js\?v=20260720-paws-level-editor/);
});
```

- [ ] **Step 2: 运行测试并确认因缺少新项目而失败**

Run: `node --test tests/paws-level-editor-publish.test.mjs`

Expected: FAIL at `matches.length` with actual value `0`。

- [ ] **Step 3: 加入默认项目并刷新运行文件缓存键**

在 `paws-home-client` 工程卡片之后加入：

```js
{
  id: "paws-level-editor",
  name: "关卡3D编辑器",
  category: "关卡编辑与3D预览",
  status: "engineering",
  brief: "公开演示版关卡工作台：编辑示例关卡、切换 2D/3D 检查层级，并直接试玩验证。",
  problem: "关卡布局、遮挡关系与实际试玩分散在不同工具中，修改后难以快速确认空间层级和可玩性。",
  aiUse: "AI 参与关卡 JSON 兼容、2D/3D 编辑视图、试玩规则、静态发布、隐私边界和自动化验收。",
  folder: "./projects/paws-level-editor/",
  entry: "./projects/paws-level-editor/index.html",
  video: "./projects/paws-level-editor/video/index.html",
  package: "",
  platforms: {
    web: "./projects/paws-level-editor/index.html",
    windows: "",
    mac: ""
  },
  tags: ["关卡编辑", "Three.js", "2D/3D", "试玩"],
  speed: 9,
  impact: 9,
  risk: 9,
  polish: 9
}
```

把 `index.html` 的脚本查询串改为：

```html
<script src="./app-20260706-restore-games.js?v=20260720-paws-level-editor"></script>
```

- [ ] **Step 4: 运行契约测试和卡片回归测试**

Run: `node --test tests/paws-level-editor-publish.test.mjs tests/card-action-layout.test.mjs`

Expected: PASS，0 failures。

- [ ] **Step 5: 提交应用中心契约**

```powershell
git add -- tests/paws-level-editor-publish.test.mjs app-20260706-restore-games.js index.html
git commit -m "test: define paws level editor pages release"
```

### Task 2: 实现可测试的静态关卡 API

**Files:**
- Create: `projects/paws-level-editor/static-api-client.mjs`
- Create: `projects/paws-level-editor/levels/index.json`
- Create: `projects/paws-level-editor/levels/level_showcase.json`
- Create: `tests/paws-level-editor-static-api.test.mjs`

**Interfaces:**
- Consumes: Fetch API、Storage 风格对象和内置关卡 JSON。
- Produces: `createApiClient({ fetchImpl, storage, now })`、`WorkbenchApiError`、`health()`、`listLevels()`、`loadLevel(fileName)`、`saveLevel(payload)`、`login()`、`logout()`、`blockImageUrl(type)`、`resetLevel(fileName)`。

- [ ] **Step 1: 写静态 API 失败测试**

测试使用内存 `Map` 形式的 Storage 和返回 `levels/index.json`、`levels/level_showcase.json` 的假 Fetch，验证：

```js
test("lists and loads the bundled showcase", async () => {
  const api = createApiClient({ fetchImpl, storage, now: () => "2026-07-20T00:00:00.000Z" });
  assert.equal((await api.listLevels())[0].fileName, "level_showcase.json");
  assert.equal((await api.loadLevel("level_showcase.json")).value.name, "3D层级展示关");
});

test("save survives a new client and reset restores the bundle", async () => {
  const first = createApiClient({ fetchImpl, storage });
  const loaded = await first.loadLevel("level_showcase.json");
  loaded.value.name = "浏览器修改版";
  const saved = await first.saveLevel({
    fileName: "level_showcase.json",
    value: loaded.value,
    expectedVersion: loaded.version,
    saveAs: false,
  });
  const second = createApiClient({ fetchImpl, storage });
  assert.equal((await second.loadLevel("level_showcase.json")).value.name, "浏览器修改版");
  assert.equal((await second.listLevels())[0].local, true);
  await second.resetLevel("level_showcase.json");
  assert.equal((await second.loadLevel("level_showcase.json")).value.name, "3D层级展示关");
  assert.notEqual(saved.version, loaded.version);
});

test("rejects path traversal and stale versions", async () => {
  await assert.rejects(() => api.loadLevel("../secret.json"), { code: "invalid-file-name" });
  await assert.rejects(
    () => api.saveLevel({ fileName: "level_showcase.json", value: {}, expectedVersion: "stale", saveAs: false }),
    { status: 409, code: "version-conflict" },
  );
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `node --test tests/paws-level-editor-static-api.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `static-api-client.mjs`。

- [ ] **Step 3: 实现静态 API 最小行为**

实现固定前缀、文件名校验、稳定 JSON 哈希、深拷贝、本地覆盖读写和重置。返回值保持原控制器所需形状：

```js
const STORAGE_PREFIX = "paws-level-editor-demo-v1";
const INDEX_URL = "./levels/index.json";

export function createApiClient({
  fetchImpl = globalThis.fetch.bind(globalThis),
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
} = {}) {
  return {
    async health() {
      return { online: true, authenticated: true, writable: true, staticDemo: true };
    },
    async listLevels() {
      const index = await fetchJson(fetchImpl, INDEX_URL);
      return index.levels.map((entry) => mergeStoredSummary(entry, storage));
    },
    async loadLevel(fileName) {
      assertFileName(fileName);
      return readStored(storage, fileName) ?? loadBundled(fetchImpl, fileName);
    },
    async saveLevel({ fileName, value, expectedVersion = "", saveAs = false }) {
      assertFileName(fileName);
      const current = await this.loadLevel(fileName).catch(() => null);
      if (saveAs && current) throw new WorkbenchApiError("文件已存在。", { status: 409, code: "file-exists" });
      if (!saveAs && current?.version !== expectedVersion) {
        throw new WorkbenchApiError("浏览器版本已变化。", { status: 409, code: "version-conflict" });
      }
      const saved = makeRecord(fileName, value, now());
      writeStored(storage, fileName, saved);
      return clone(saved);
    },
    async login() { return { authenticated: true }; },
    async logout() { return { authenticated: true }; },
    blockImageUrl(type) { return `./assets/blocks/block_${encodeURIComponent(type)}.png`; },
    async resetLevel(fileName) {
      assertFileName(fileName);
      storage.removeItem(storageKey(fileName));
      return loadBundled(fetchImpl, fileName);
    },
  };
}
```

- [ ] **Step 4: 创建不含真实工程数据的示例关卡**

`levels/index.json` 只登记 `level_showcase.json`。示例 JSON 使用自行生成的对称坐标，覆盖多层遮挡、`type: -1` 局部随机、`type: -2` 全随机、`presetColorType: 2` 翻转牌和 `1001–1006` 特效牌，并让每种普通试玩牌至少成对出现。`designerNote.levelData` 与顶层 `tiles` 表示相同牌集合。

- [ ] **Step 5: 运行静态 API 测试**

Run: `node --test tests/paws-level-editor-static-api.test.mjs`

Expected: PASS，0 failures。

- [ ] **Step 6: 提交静态数据层**

```powershell
git add -- projects/paws-level-editor/static-api-client.mjs projects/paws-level-editor/levels tests/paws-level-editor-static-api.test.mjs
git commit -m "feat: add static paws level storage"
```

### Task 3: 迁移编辑、2D/3D 和试玩工作台

**Files:**
- Create: `projects/paws-level-editor/index.html`
- Create: `projects/paws-level-editor/styles.css`
- Create: `projects/paws-level-editor/app.mjs`
- Create: `projects/paws-level-editor/core/*.mjs`
- Create: `projects/paws-level-editor/ui/*.mjs`
- Create: `projects/paws-level-editor/views/*.mjs`
- Create: `projects/paws-level-editor/vendor/three.module.js`
- Create: `projects/paws-level-editor/vendor/OrbitControls.js`
- Create: `projects/paws-level-editor/assets/blocks/*.png`
- Create: `tests/paws-level-editor-assets.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `createApiClient()` 和相对资源 URL。
- Produces: 可在任意子路径静态服务器打开的完整工作台；`window.pawsWorkbench` 浏览器验收入口。

- [ ] **Step 1: 写静态资源和隐私边界失败测试**

```js
test("static editor has all modules, vendor files and exactly 38 block images", () => {
  for (const file of requiredFiles) assert.equal(existsSync(join(editorRoot, file)), true, file);
  const blocks = readdirSync(join(editorRoot, "assets/blocks")).filter((name) => name.endsWith(".png"));
  assert.equal(blocks.length, 38);
  assert.deepEqual(blocks.sort(naturalSort), expectedBlockNames);
});

test("public files contain no private level path or credential material", () => {
  const text = readPublicTextFiles(editorRoot);
  assert.doesNotMatch(text, /EditorLevels|E:\\\\Mahjong|maque|cookie|password/i);
});

test("entry uses relative GitHub Pages module and Three paths", () => {
  const html = readFileSync(join(editorRoot, "index.html"), "utf8");
  assert.match(html, /"\.\/vendor\/three\.module\.js"/);
  assert.match(html, /src="\.\/app\.mjs"/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
});
```

- [ ] **Step 2: 运行测试并确认静态入口缺失**

Run: `node --test tests/paws-level-editor-assets.test.mjs`

Expected: FAIL because `projects/paws-level-editor/index.html` does not exist。

- [ ] **Step 3: 复制已验证的浏览器模块和 Three.js 文件**

```powershell
$source = 'E:\麻将竞品\03_工具脚本与日志\sheep'
$target = 'projects\paws-level-editor'
Copy-Item "$source\workbench\core" "$target\core" -Recurse
Copy-Item "$source\workbench\ui" "$target\ui" -Recurse
Copy-Item "$source\workbench\views" "$target\views" -Recurse
Copy-Item "$source\workbench\styles.css" "$target\styles.css"
Copy-Item "$source\node_modules\three\build\three.module.js" "$target\vendor\three.module.js"
Copy-Item "$source\node_modules\three\examples\jsm\controls\OrbitControls.js" "$target\vendor\OrbitControls.js"
```

只在公开快照中把控制器 import 从 `../api-client.mjs` 改成 `../static-api-client.mjs`，把 `three-3d.mjs` 的 OrbitControls 路径改成 `../vendor/OrbitControls.js`。

- [ ] **Step 4: 复制用户指定的 38 张真实砖块图**

```powershell
$blocks = 'E:\Mahjong\PawsHomeClient\Assets\SheepLevelEditor\Resources\SheepLevelEditor\Blocks'
1..32 | ForEach-Object { Copy-Item "$blocks\block_$_.png" "projects\paws-level-editor\assets\blocks\" }
1001..1006 | ForEach-Object { Copy-Item "$blocks\block_$_.png" "projects\paws-level-editor\assets\blocks\" }
```

- [ ] **Step 5: 创建公开入口并标明静态演示边界**

入口保留原工作台控件，标题改为“关卡3D编辑器”，增加固定提示：

```html
<div class="demo-banner" role="note">
  公开演示版 · 仅使用独立示例关卡 · 保存到当前浏览器，不会写回工程
</div>
```

相对路径固定为：

```html
<link rel="stylesheet" href="./styles.css" />
<script type="importmap">
  { "imports": { "three": "./vendor/three.module.js" } }
</script>
<script type="module" src="./app.mjs"></script>
```

- [ ] **Step 6: 接入浏览器保存恢复按钮**

在关卡库操作区增加 `id="reset-level"` 的“恢复内置”按钮。控制器缓存并绑定该按钮，确认后调用 `api.resetLevel(document.fileName)`、重新 `openLevel(fileName, { discardDirty: true })`，提示“已恢复内置示例”。

- [ ] **Step 7: 运行资源、模块语法和原工作台核心回归测试**

```powershell
node --test tests/paws-level-editor-assets.test.mjs
Get-ChildItem projects\paws-level-editor -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node --test E:\麻将竞品\03_工具脚本与日志\sheep\test\level-adapter.test.mjs E:\麻将竞品\03_工具脚本与日志\sheep\test\level-rules.test.mjs E:\麻将竞品\03_工具脚本与日志\sheep\test\play-engine.test.mjs E:\麻将竞品\03_工具脚本与日志\sheep\test\edit-history.test.mjs E:\麻将竞品\03_工具脚本与日志\sheep\test\editor-tools.test.mjs E:\麻将竞品\03_工具脚本与日志\sheep\test\view-model.test.mjs
```

Expected: all commands exit `0`，0 failures。

- [ ] **Step 8: 提交工作台静态快照**

```powershell
git add -- projects/paws-level-editor tests/paws-level-editor-assets.test.mjs
git commit -m "feat: publish paws level editor demo"
```

### Task 4: 自动化验证真实页面交互

**Files:**
- Create: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`

**Interfaces:**
- Consumes: Task 3 静态入口和 `window.pawsWorkbench`。
- Produces: 可重复运行的桌面/390px 浏览器验收，验证 2D、3D、试玩、本地保存、刷新恢复和内置重置。

- [ ] **Step 1: 写浏览器失败测试**

测试启动绑定 `127.0.0.1` 随机端口的静态服务器，打开编辑器后验证：

```js
await page.goto(`${baseUrl}/projects/paws-level-editor/index.html`);
await expect(page.locator("#connection-state")).toContainText("静态演示");
await page.locator('[role="option"]').first().click();
await expect(page.locator("#status-tiles")).not.toHaveText("—");
await page.locator("#view-3d").click();
await expect(page.locator("#canvas-host canvas")).toBeVisible();
await page.locator("#mode-play").click();
await expect(page.locator("#status-seed")).not.toHaveText("—");
```

另一个 390×844 context 验证：

```js
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
assert.equal(await page.locator("#readonly-banner").isVisible(), true);
```

捕获 `pageerror` 和 `console.error`，两者都必须为空。

- [ ] **Step 2: 运行浏览器测试并确认至少一个用户可见契约失败**

Run: `node tests/paws-level-editor-browser-smoke.mjs`

Expected: FAIL until connection copy、auto-open/save/reset hooks and responsive rules match the assertions。

- [ ] **Step 3: 实现最小浏览器行为修正**

连接成功文案包含“静态演示在线”；只有一个关卡时自动打开；保存成功文案明确为“已保存到当前浏览器”；恢复按钮在无关卡时禁用。为 `.demo-banner` 和三栏工作区增加 390px 响应式规则，确保 `html/body` 无横向滚动。

- [ ] **Step 4: 重跑桌面与窄屏浏览器测试**

Run: `node tests/paws-level-editor-browser-smoke.mjs`

Expected: PASS；console errors `0`；desktop overflow `false`；mobile overflow `false`。

- [ ] **Step 5: 提交浏览器验收**

```powershell
git add -- tests/paws-level-editor-browser-smoke.mjs projects/paws-level-editor
git commit -m "test: verify paws editor in browsers"
```

### Task 5: 录制实际操作教学视频并接入播放器

**Files:**
- Create: `scripts/record-paws-level-editor-demo.mjs`
- Create: `projects/paws-level-editor/video/tutorial-script.md`
- Create: `projects/paws-level-editor/video/paws-level-editor-tutorial.vtt`
- Create: `projects/paws-level-editor/video/poster.jpg`
- Create: `projects/paws-level-editor/video/paws-level-editor-tutorial.mp4`
- Create: `projects/paws-level-editor/video/index.html`
- Create: `tests/paws-level-editor-video.test.mjs`
- Modify: `tests/project-video-coverage.test.mjs`

**Interfaces:**
- Consumes: 实际静态演示页和浏览器测试服务器。
- Produces: 75–110 秒 H.264 MP4、中文字幕、封面、五个章节和延迟加载播放器。

- [ ] **Step 1: 写视频资产失败测试**

```js
test("tutorial player exposes lazy loading, captions and five chapters", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /data-src="\.\/paws-level-editor-tutorial\.mp4"/);
  assert.match(html, /<track[^>]+kind="captions"[^>]+paws-level-editor-tutorial\.vtt/);
  assert.equal((html.match(/data-time="/g) || []).length, 5);
});

test("tutorial is 16:9 H.264 and lasts 75 to 110 seconds", async () => {
  const media = await inspectMedia(join(videoRoot, "paws-level-editor-tutorial.mp4"));
  assert.equal(media.codec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 75 && media.duration <= 110);
});
```

- [ ] **Step 2: 运行测试并确认视频资产缺失**

Run: `node --test tests/paws-level-editor-video.test.mjs`

Expected: FAIL because `video/index.html` and MP4 do not exist。

- [ ] **Step 3: 写操作脚本、字幕和播放器**

字幕和章节使用固定时间：

```text
00:00 工具定位与示例关卡
00:12 2D 选择、移动和属性修改
00:32 3D 层级与遮挡检查
00:50 试玩配对
01:10 浏览器保存与恢复
```

播放器使用 `<video controls playsinline preload="none">`，点击 `#loadVideo` 后设置 MP4 `src`，并始终挂载中文 `<track kind="captions" srclang="zh" default>`。五个章节按钮通过 `data-time` 设置 `video.currentTime`。

- [ ] **Step 4: 录制实际页面并转码**

Playwright 以 1280×720 打开实际编辑器，依次操作示例关卡、2D 点选/属性、3D 旋转、试玩配对、保存和恢复；每个章节保持足够可读停顿。浏览器录制 WebM 后执行：

```powershell
& 'C:\Users\ASUS\AppData\Local\Temp\codex-media-runtime\node_modules\ffmpeg-static\ffmpeg.exe' `
  -y -i $webm -vf 'scale=1280:720:flags=lanczos,fps=30' `
  -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -movflags +faststart `
  -an projects\paws-level-editor\video\paws-level-editor-tutorial.mp4
```

从视频的 3D 章节取帧生成 `poster.jpg`。

- [ ] **Step 5: 运行视频和全项目视频覆盖测试**

```powershell
node --test tests/paws-level-editor-video.test.mjs tests/project-video-coverage.test.mjs
node tests/media-inspect.mjs projects/paws-level-editor/video/paws-level-editor-tutorial.mp4
```

Expected: PASS；codec `h264`；resolution `1280x720`；duration within `75..110`。

- [ ] **Step 6: 提交教学视频**

```powershell
git add -- scripts/record-paws-level-editor-demo.mjs projects/paws-level-editor/video tests/paws-level-editor-video.test.mjs tests/project-video-coverage.test.mjs
git commit -m "feat: add paws level editor tutorial"
```

### Task 6: 完整回归、发布和线上验收

**Files:**
- Modify: `docs/superpowers/plans/2026-07-20-paws-level-editor-pages.md`

**Interfaces:**
- Consumes: Tasks 1–5 的提交。
- Produces: 已推送的 `origin/main`、GitHub Pages 线上页面和可追溯验收证据。

- [ ] **Step 1: 运行全部 Node 测试**

Run: `node --test`

Expected: PASS，0 failures。

- [ ] **Step 2: 运行浏览器、语法、隐私和 Git 检查**

```powershell
node tests/paws-level-editor-browser-smoke.mjs
Get-ChildItem projects\paws-level-editor -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
rg -n -i 'E:\\\\Mahjong|EditorLevels|maque|password|cookie|token' projects/paws-level-editor
git diff --check origin/main...HEAD
git status --short
```

Expected: browser PASS；syntax exit `0`；敏感文本扫描无匹配；diff check exit `0`；工作树干净。

- [ ] **Step 3: 检查提交范围并推送功能分支**

```powershell
git status -sb
git diff --stat origin/main...HEAD
git push -u origin codex/paws-level-editor-publish
```

Expected: push exit `0`，远端分支指向当前 HEAD。

- [ ] **Step 4: 快进发布到 main**

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git merge --ff-only codex/paws-level-editor-publish
git push origin main
```

Expected: `origin/main` 指向发布提交。

- [ ] **Step 5: 轮询 GitHub Pages 并执行 HTTP 验收**

对以下 URL 逐个等待 HTTP 200：

```text
https://wthpein010-dev.github.io/ai-application-hub/index.html#games
https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/index.html
https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/levels/level_showcase.json
https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/assets/blocks/block_1.png
https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/video/index.html
https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/video/paws-level-editor-tutorial.mp4
```

线上浏览器复查工程卡片、“演示”、“视频”、2D/3D、试玩和视频加载；控制台错误必须为 `0`。

- [ ] **Step 6: 标记计划执行并记录长期项目状态**

将本计划已执行步骤勾选，更新 `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md` 中的 Paws 工作台记录，写明公开 URL、发布提交、静态版边界和测试证据，不写任何凭据。
