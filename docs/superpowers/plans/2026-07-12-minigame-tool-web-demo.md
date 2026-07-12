# 小游戏立项工具网页演示与视频实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小游戏立项工具迁入应用集合，交付可生成 Markdown 的完整网页演示和不超过 3 分钟的中文配音介绍视频。

**Architecture:** 首页继续使用现有 `defaultApps` 和统一卡片动作渲染。网页演示把可测试的问卷、完整度检查和 Markdown 生成放入 `core.mjs`，浏览器交互留在 `app.js`；视频由固定演示数据、页面关键状态截图、中文旁白、字幕和 FFmpeg 合成为可重复生成的 MP4。

**Tech Stack:** HTML5、CSS3、JavaScript ES Modules、Node.js `node:test`、PowerShell、Microsoft SAPI、FFmpeg、GitHub Pages。

## Global Constraints

- 名称必须为“小游戏立项工具”，类型为 `assistant`，分类为“游戏立项与需求工具”。
- 首页入口顺序必须为“演示”“Wins下载”“视频”。
- 网页演示必须纯静态运行，不依赖服务器。
- 草稿只保存在浏览器本地，不上传用户数据。
- 视频必须为 1920×1080 MP4，中文女声配音，带字幕，时长不超过 180 秒。
- Windows ZIP 内容及内部 EXE SHA256 `985EC9017A2EF5900DD53F3E1C27CDFB7C66ABFCE404717039F96ED86FD3D86E` 不得改变。

---

### Task 1: 首页卡片迁移与入口契约

**Files:**
- Modify: `tests/minigame-project-simulator.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: 现有 `defaultApps`、`renderGrid()`、`renderGameGrid()`、`renderActions()`。
- Produces: `minigame-project-simulator` 的新应用元数据与三个有效入口。

- [ ] **Step 1: 写失败测试**

把测试改为断言名称“小游戏立项工具”、`status: "assistant"`、分类、四个标签、网页入口和视频入口；同时断言不再存在该项目的游戏排序特例。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/minigame-project-simulator.test.mjs`
Expected: FAIL，提示仍为旧名称、`status: "game"` 且缺少网页与视频入口。

- [ ] **Step 3: 最小实现**

更新项目元数据：

```js
name: "小游戏立项工具",
category: "游戏立项与需求工具",
status: "assistant",
entry: "./projects/minigame-project-tool/index.html",
video: "./projects/minigame-project-tool/video/index.html",
platforms: {
  web: { href: "./projects/minigame-project-tool/index.html", label: "演示" },
  windows: { href: "./downloads/minigame-project-simulator-windows.zip", label: "Windows下载" },
  mac: ""
},
tags: ["微信小游戏", "Unity", "需求文档", "Codex"]
```

删除 `gameDisplayRank()` 中对应特例，并更新 `index.html` 的脚本缓存版本。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/minigame-project-simulator.test.mjs`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add tests/minigame-project-simulator.test.mjs app-20260706-restore-games.js index.html
git commit -m "feat: move minigame tool into app collection"
```

### Task 2: 可测试的问卷与 Markdown 核心

**Files:**
- Create: `projects/minigame-project-tool/core.mjs`
- Create: `tests/minigame-project-tool-core.test.mjs`

**Interfaces:**
- Produces: `quickQuestions`、`advancedSections`、`createDefaultDraft()`、`checkCompleteness(draft)`、`generateMarkdown(draft)`、`sanitizeFileName(name)`。
- Consumes: 无浏览器 API；所有函数可直接被 Node 测试导入。

- [ ] **Step 1: 写失败测试**

覆盖默认 Unity 基线、五项关键缺失、完整填写后关键缺失清零、风格联动字段、Markdown 标题与 Codex 指令、非法文件名清理。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/minigame-project-tool-core.test.mjs`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 最小实现**

实现纯数据与纯函数。默认值固定为 Unity `2022.3.62f3c1`、`UGUI`、`750×1624`、微信小游戏；关键字段固定为 `project_name`、`game_type`、`core_gameplay`、`art_style`、`first_version_scope`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/minigame-project-tool-core.test.mjs`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add projects/minigame-project-tool/core.mjs tests/minigame-project-tool-core.test.mjs
git commit -m "feat: add minigame brief web core"
```

### Task 3: 完整网页演示

**Files:**
- Create: `projects/minigame-project-tool/index.html`
- Create: `projects/minigame-project-tool/styles.css`
- Create: `projects/minigame-project-tool/app.js`
- Create: `tests/minigame-project-tool-page.test.mjs`

**Interfaces:**
- Consumes: Task 2 的纯函数与问卷定义。
- Produces: `data-field` 表单、`#progressText`、`#issueList`、`#markdownPreview`、`#memoryDialog`、`#downloadMarkdown`。

- [ ] **Step 1: 写失败测试**

断言页面引用样式与模块脚本，包含快速问题、高级问卷、缺失检查、Markdown 预览、下载、记忆弹窗和本地存储键 `minigame-project-tool-draft-v1`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/minigame-project-tool-page.test.mjs`
Expected: FAIL，页面文件不存在。

- [ ] **Step 3: 实现语义化页面与交互**

`app.js` 渲染问卷、绑定输入、保存/恢复草稿、更新进度、定位缺失字段、预览 Markdown、打开记忆弹窗，并通过 Blob 下载 `.md`。存储异常只显示提示，不中断使用。

- [ ] **Step 4: 实现高对比度响应式样式**

桌面宽度使用 280px 导航侧栏与内容区；`max-width: 760px` 改为单列。输入文字与背景对比清晰，下拉菜单显式设置深色背景和浅色文字。

- [ ] **Step 5: 运行页面测试与全部 Node 测试**

Run: `node --test tests/*.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add projects/minigame-project-tool tests/minigame-project-tool-page.test.mjs
git commit -m "feat: add interactive minigame brief demo"
```

### Task 4: 中文配音视频与播放页

**Files:**
- Create: `projects/minigame-project-tool/video/index.html`
- Create: `projects/minigame-project-tool/video/minigame-project-tool-intro.vtt`
- Create: `projects/minigame-project-tool/video/minigame-project-tool-intro.mp4`
- Create: `scripts/record-minigame-tool-demo.ps1`
- Create: `scripts/minigame-tool-video-script.json`
- Create: `tests/minigame-project-tool-video.test.mjs`

**Interfaces:**
- Consumes: Task 3 的演示页和固定演示数据；系统语音 `Microsoft Huihui Desktop`。
- Produces: 可重复生成的旁白、字幕、截图时间轴和最终 MP4。

- [ ] **Step 1: 写失败测试**

断言视频页存在、延迟加载 MP4、字幕轨道存在；用 `ffprobe` 断言 1920×1080、存在音频流且时长 `<= 180` 秒。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/minigame-project-tool-video.test.mjs`
Expected: FAIL，视频资源不存在。

- [ ] **Step 3: 安装或定位 FFmpeg**

优先使用已安装的 `ffmpeg`/`ffprobe`；不存在时通过 WinGet 安装用户级 FFmpeg，并在脚本中动态定位可执行文件，不提交二进制工具。

- [ ] **Step 4: 生成旁白、字幕与视频**

PowerShell 脚本读取 JSON 时间轴，用 SAPI 生成中文 WAV，以网页关键状态截图作为画面，使用 FFmpeg 合成 1920×1080 H.264/AAC MP4，并烧录同步中文字幕；总时长控制在 160–178 秒。

- [ ] **Step 5: 实现视频播放页**

页面初始不设置 `video.src`，点击“加载并播放”后再加载 MP4；提供直接打开 MP4、返回网页演示和返回主页的链接。

- [ ] **Step 6: 运行视频测试**

Run: `node --test tests/minigame-project-tool-video.test.mjs`
Expected: PASS，时长与音视频流均符合要求。

- [ ] **Step 7: 提交**

```bash
git add projects/minigame-project-tool/video scripts/record-minigame-tool-demo.ps1 scripts/minigame-tool-video-script.json tests/minigame-project-tool-video.test.mjs
git commit -m "feat: add narrated minigame tool walkthrough"
```

### Task 5: 集成、浏览器验证与发布

**Files:**
- Modify: `tests/minigame-project-simulator.test.mjs`
- Modify: `docs/superpowers/plans/2026-07-12-minigame-tool-web-demo.md`

**Interfaces:**
- Consumes: Tasks 1–4 的所有入口和资源。
- Produces: 已验证并部署的 GitHub Pages 版本。

- [ ] **Step 1: 运行完整自动测试**

```powershell
node --check app-20260706-restore-games.js
node --test tests/*.test.mjs
powershell -ExecutionPolicy Bypass -File tests/verify-minigame-package.ps1
```

Expected: 全部 PASS，EXE 哈希保持不变。

- [ ] **Step 2: 本地浏览器验证**

启动静态服务器，检查首页应用/小游戏数量、三个入口、演示表单、刷新恢复、缺失定位、Markdown 下载、视频播放；再以 390×844 验证无横向溢出。

- [ ] **Step 3: 最终提交并推送**

```bash
git status --short
git push -u origin codex/minigame-tool-web-demo
```

- [ ] **Step 4: 创建并合并 PR**

PR 描述列出卡片迁移、网页演示、视频、测试与资产大小。仅在远程状态为 `CLEAN` 且检查通过后压缩合并到 `main`。

- [ ] **Step 5: 线上验收**

等待 Pages 部署成功，验证首页、演示页、视频页、MP4 和 Windows ZIP 均为 HTTP 200，并确认线上 MP4 与仓库文件哈希一致。
