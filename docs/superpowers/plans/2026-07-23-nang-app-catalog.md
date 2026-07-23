# 馕饼拍拍响应用区发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已有的馕主题 WebGL 成品从 Hub 小游戏区迁移到 `#apps`，统一名称为“馕饼拍拍响”，保留且只展示“演示”和“视频”，并完成源分支 PR、Hub `main` 与 GitHub Pages 公网发布。

**Architecture:** 保留 `projects/nang-keng-pai-pai-xiang/` 内现有 WebGL 与媒体文件，只调整卡片默认数据、旧 localStorage 的项目级迁移以及两个页面的公开名称和返回锚点。Hub 通过 `status: "content"` 把卡片渲染到应用区，并使用 `badge: "休闲体验"` 展示准确的用户可见类别。

**Tech Stack:** 静态 HTML/CSS/JavaScript、Node.js `node:test`、GitHub Pages、Unity WebGL、H.264 MP4、Playwright/Chrome 公网验收。

## Global Constraints

- 公开主页必须为 `https://wthpein010-dev.github.io/ai-application-hub/index.html#apps`。
- 卡片名称必须是“馕饼拍拍响”，且在应用集合末尾唯一出现。
- 卡片只提供“演示”和“视频”；Windows、Mac、package 均为空。
- 不复制 Unity 源码、微信小游戏包或工程下载包到 Hub。
- 复用现有 WebGL Gzip 自解压构建和现有 H.264 视频，不重编码合格媒体。
- 不修改旧克隆中的未提交文件；Hub 发布只允许基于最新 `origin/main` 快进推送，不强推。

---

### Task 1: 用失败测试定义应用区卡片与缓存迁移

**Files:**
- Modify: `tests/nang-hub-catalog.test.mjs`

**Interfaces:**
- Consumes: `app-20260706-restore-games.js` 中的 `defaultApps`、`loadApps()` 和 `normalizeApp()`。
- Produces: 对卡片默认数据、旧缓存迁移、页面锚点和现有媒体资源的发布契约。

- [ ] **Step 1: 把旧小游戏断言改成应用区发布断言**

在测试中导入 `node:vm`，增加 `loadDefaultApps()` 与 `loadAppsWithStoredValue()`，并用以下核心断言替换旧的“Nang game”测试：

```js
test("Nang experience is published in apps with demo and video only", () => {
  const nang = catalogBlock("nang-keng-pai-pai-xiang");
  assert.match(nang, /name: "馕饼拍拍响"/);
  assert.match(nang, /category: "Unity WebGL 休闲体验"/);
  assert.match(nang, /status: "content"/);
  assert.match(nang, /badge: "休闲体验"/);
  assert.match(nang, /video: "\.\/projects\/nang-keng-pai-pai-xiang\/video\/index\.html"/);
  assert.match(nang, /windows: ""/);
  assert.match(nang, /mac: ""/);
  assert.match(nang, /package: ""/);
});

test("stored Nang game metadata migrates to the apps catalog", () => {
  const defaults = loadDefaultApps();
  const current = defaults.find(app => app.id === "nang-keng-pai-pai-xiang");
  const stored = { ...current, name: "馕了个馕", category: "Unity WebGL 小游戏", status: "game", badge: "" };
  const migrated = loadAppsWithStoredValue([stored]).find(app => app.id === current.id);
  assert.equal(migrated.name, "馕饼拍拍响");
  assert.equal(migrated.status, "content");
  assert.equal(migrated.badge, "休闲体验");
  assert.equal(migrated.platforms.windows, "");
  assert.equal(migrated.platforms.mac, "");
});
```

把页面断言改为 `#apps`，并增加 `doesNotMatch(..., /#games/)`。

- [ ] **Step 2: 运行测试并验证红灯原因正确**

Run: `node --test tests/nang-hub-catalog.test.mjs`

Expected: FAIL，明确显示旧名称、`status: "game"` 或 `#games` 与新契约不一致；现有 WebGL 资源测试仍通过。

---

### Task 2: 最小实现卡片迁移与统一页面名称

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `projects/nang-keng-pai-pai-xiang/index.html`
- Modify: `projects/nang-keng-pai-pai-xiang/video/index.html`
- Test: `tests/nang-hub-catalog.test.mjs`

**Interfaces:**
- Consumes: Task 1 的卡片与页面契约。
- Produces: `defaultApps` 中的应用区条目，以及 `normalizeApp()` 对固定项目 ID 的幂等迁移。

- [ ] **Step 1: 修改默认卡片**

把项目条目改为：

```js
{
  id: "nang-keng-pai-pai-xiang",
  name: "馕饼拍拍响",
  category: "Unity WebGL 休闲体验",
  status: "content",
  badge: "休闲体验",
  brief: "围绕新疆馕设计的竖屏休闲解谜体验：把不同馕放入烤位，利用火候、温区与订单顺序完成十个普通模式关卡。",
  problem: "将离散回合、烤位温差与交付顺序组合成可单手体验的轻量解谜流程，并用纯图形表达馕种类、熟度与订单。",
  aiUse: "AI 参与玩法规则、十关解法、纯图形馕资源、UGUI 产品流、WebGL 构建与发布验收。",
  folder: "./projects/nang-keng-pai-pai-xiang/",
  entry: "./projects/nang-keng-pai-pai-xiang/index.html",
  video: "./projects/nang-keng-pai-pai-xiang/video/index.html",
  package: "",
  platforms: { web: "./projects/nang-keng-pai-pai-xiang/index.html", windows: "", mac: "" },
  tags: ["Unity", "WebGL", "竖屏解谜", "新疆馕"],
  speed: 8,
  impact: 8,
  risk: 7,
  polish: 8
}
```

- [ ] **Step 2: 增加项目级缓存迁移**

在 `normalizeApp()` 中加入：

```js
if (normalized.id === "nang-keng-pai-pai-xiang") {
  normalized.name = base.name;
  normalized.category = base.category;
  normalized.status = base.status;
  normalized.badge = base.badge;
  normalized.brief = base.brief;
  normalized.problem = base.problem;
  normalized.aiUse = base.aiUse;
  normalized.entry = base.entry;
  normalized.video = base.video;
  normalized.package = "";
  normalized.platforms = { web: base.platforms.web, windows: "", mac: "" };
  normalized.tags = [...base.tags];
}
```

- [ ] **Step 3: 修改演示页与视频页**

将演示页标题、`aria-label`、`productName` 改为“馕饼拍拍响”，返回链接改为 `../../index.html#apps`。将视频页标题、`h1`、播放器标签改为“馕饼拍拍响”，返回链接改为 `../../../index.html#apps`。

- [ ] **Step 4: 运行相关测试并验证绿灯**

Run: `node --test tests/nang-hub-catalog.test.mjs tests/project-video-coverage.test.mjs tests/card-action-layout.test.mjs`

Expected: 全部通过，0 failure。

- [ ] **Step 5: 提交功能修改**

```bash
git add app-20260706-restore-games.js tests/nang-hub-catalog.test.mjs projects/nang-keng-pai-pai-xiang/index.html projects/nang-keng-pai-pai-xiang/video/index.html
git commit -m "fix: publish Nang experience in apps catalog"
```

---

### Task 3: 完整静态、媒体和本地浏览器验证

**Files:**
- Verify: `projects/nang-keng-pai-pai-xiang/Build/*`
- Verify: `projects/nang-keng-pai-pai-xiang/video/nang-keng-pai-pai-xiang-intro.mp4`
- Verify: repository test suite

**Interfaces:**
- Consumes: Task 2 的卡片、页面与资源。
- Produces: 发布前的测试、媒体与页面证据。

- [ ] **Step 1: 运行可执行的完整 Node 测试集合**

Run: `node --test tests/*.test.mjs`

Expected: 0 failure；若稀疏工作树导致与本项目无关的资源测试缺文件，先扩展 sparse checkout 到对应测试所需目录后重跑，不跳过真实失败。

- [ ] **Step 2: 探测视频编码与时长**

Run: `& (node -e "process.stdout.write(require('ffmpeg-static'))") -i projects/nang-keng-pai-pai-xiang/video/nang-keng-pai-pai-xiang-intro.mp4 -f null NUL`

Expected: H.264 可解码，时长小于 240 秒，exit code 0。

- [ ] **Step 3: 启动静态服务并做桌面与 390×844 验收**

打开本地主页 `#apps`，确认唯一“馕饼拍拍响”卡片位于应用集合末尾，只有“演示/视频”；打开演示和视频，确认返回按钮、WebGL 加载、视频播放、无横向溢出和控制台/请求错误。

- [ ] **Step 4: 执行提交质量检查**

Run: `git diff --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git show --check --oneline --stat HEAD`

Expected: exit code 0，工作树只包含计划内文档或无未提交修改。

---

### Task 4: 推送 Unity 源功能分支并创建草稿 PR

**Files:**
- Source repository: `C:/Users/ASUS/Documents/AI Project/nang-keng-pai-pai-xiang/.worktrees/visual-naan-assets`

**Interfaces:**
- Consumes: 已验证提交 `4156032` 和分支 `feat/visual-naan-assets`。
- Produces: 远端功能分支和以 `main` 为目标的草稿 Pull Request。

- [ ] **Step 1: 现场复核源工作树与测试**

Run: `git status -sb`, `.\scripts\build.ps1 -Target Test`, `node --test tests\build-script.test.mjs tests\publish-artifacts.test.mjs`

Expected: Unity `57/57` EditMode、`11/11` PlayMode，Node `8/8`，无用户改动。

- [ ] **Step 2: 推送功能分支**

Run: `git push -u origin feat/visual-naan-assets`

Expected: 远端分支指向 `4156032`。

- [ ] **Step 3: 创建草稿 PR**

使用 GitHub 连接器或 `gh pr create --draft --base main --head feat/visual-naan-assets`，PR 正文说明纯图形馕资源、普通模式、测试和构建证据。

---

### Task 5: 快进发布 Hub main 并完成公网验收

**Files:**
- Publish: Hub branch `agent/fix-nang-app-catalog`
- Update: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/馕饼拍拍响.md`
- Update: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/AI-Application-Hub.md`

**Interfaces:**
- Consumes: Task 2–4 的提交、测试和 PR。
- Produces: Hub `main` 提交、Pages 部署、公网链接和长期记忆。

- [ ] **Step 1: 发布前同步远端**

Run: `git fetch origin main`, then rebase only when `origin/main` advanced and the worktree is clean.

Expected: 分支可快进合入最新远端，无冲突、无强推。

- [ ] **Step 2: 推送到权威远端 main**

Run: `git push origin HEAD:main`

Expected: fast-forward success；记录远端 SHA。

- [ ] **Step 3: 等待 GitHub Pages 工作流**

Run: `gh run list --repo wthpein010-dev/ai-application-hub --branch main --limit 5`，并用 `gh run watch <run-id>` 等待终态。

Expected: Pages 工作流 success。

- [ ] **Step 4: 公网逐项验收**

验收 `index.html#apps`、演示页、视频页、MP4 与 WebGL 资源：HTTP 有效，卡片唯一且位于应用区，按钮顺序正确，桌面/390×844 无溢出，视频真实播放，控制台与请求错误为 0。

- [ ] **Step 5: 更新长期记忆并报告**

记录源 PR、Hub SHA、Pages run、公开 URL、视频时长与验收结果，不保存令牌、验证码或原始聊天。
