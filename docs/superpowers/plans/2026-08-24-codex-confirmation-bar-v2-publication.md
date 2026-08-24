# Codex 待确认悬浮助手 v2.0.0 Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本机 Codex 待确认悬浮助手 v2.0.0 完整同步到 AI Application Hub，发布演示、视频、Windows/macOS 成品和可安装 iOS Web App。

**Architecture:** 保留 `codex-thread-workbench` 的公开 ID 和 URL，在 Hub 源码快照中同步当前 Avalonia 桌面应用；Windows 使用本机验证包和 Pages 分片下载，macOS 使用 GitHub Actions 双架构构建回写，iOS 使用明确标注边界的离线 PWA。Hub 卡片、发布审计和浏览器测试统一理解 `ios` 平台动作。

**Tech Stack:** .NET 8、Avalonia 11、PowerShell、Bash、Node.js 22、原生 HTML/CSS/JavaScript、Service Worker、Playwright、FFmpeg、GitHub Actions、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-08-24-codex-confirmation-bar-v2-publication-design.md`

## Global Constraints

- 保留项目 ID `codex-thread-workbench` 和现有公开路径，不新建重复卡片。
- Windows/macOS 原生应用版本为 `2.0.0`；Windows 文件名为 `CodexConfirmationBar-Windows-x64.zip`。
- iOS 入口必须称为可安装 Web App，不得声称能在 iOS 上创建桌面悬浮窗或直接读取电脑 Codex 线程。
- 视频必须是 H.264、1280×720、240 秒以内，中文字幕任一时刻一行。
- Windows 本机禁止运行 ClickFlow、禁止无过滤 `node --test`；只运行明确列名且不包含 ClickFlow 的测试。
- 所有下载在保存前验证每片长度/SHA-256和完整包长度/SHA-256。
- 不覆盖 `C:\Users\ASUS\Documents\AI Project\ai-application-hub` 中现有未提交改动。

---

### Task 1: 同步 v2.0.0 桌面源码快照和跨平台构建契约

**Files:**
- Replace: `build/codex-thread-workbench/**`
- Modify: `.github/workflows/build-codex-thread-workbench.yml`
- Test: `build/codex-thread-workbench/tests/CodexThreadWorkbench.Tests/Packaging/PackagingScriptTests.cs`

**Interfaces:**
- Consumes: 本机 `agent/confirmation-overlay` 工作树的 v2.0.0 源码和测试。
- Produces: Hub 内可由 Windows/macOS CI 复现的源码快照、`CodexConfirmationBar-macOS-{arm64|x64}.app.zip` 构建产物。

- [ ] **Step 1: 复制当前源码快照并保留 Hub 构建目录边界**

  使用同一 PowerShell 进程按相对路径同步 `.github`、`src`、`tests`、`scripts`、解决方案、README 和 `.gitignore`；排除 `bin`、`obj`、`.git`、`.worktrees` 和 `artifacts`。

- [ ] **Step 2: 运行快照 Release 测试并确认当前契约失败点**

  Run: `dotnet test build/codex-thread-workbench/CodexThreadWorkbench.sln -c Release --nologo`
  Expected: 现有 v2.0.0 测试通过；旧 Hub macOS workflow 因旧文件名/路径契约被后续聚焦测试指出。

- [ ] **Step 3: 更新 macOS workflow**

  将 workflow 的触发分支改为 `codex/workbench-v2-overlay-public`，打包和上传文件名改为 `CodexConfirmationBar-macOS-{architecture}.app.zip`，下载、切分和测试命令使用同一名称；保留双 runner、Release 测试、签名验证和 bot 回写。

- [ ] **Step 4: 运行桌面与 workflow 契约测试**

  Run: `dotnet test build/codex-thread-workbench/CodexThreadWorkbench.sln -c Release --nologo`
  Expected: 158 项或更多通过，0 失败。

- [ ] **Step 5: 提交源码快照**

  Run: `git add build/codex-thread-workbench .github/workflows/build-codex-thread-workbench.yml && git commit -m "build: sync confirmation bar v2 source snapshot"`

### Task 2: 扩展 Hub 卡片和发布审计的 iOS 平台能力

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `scripts/hub-publication-audit.mjs`
- Modify: `tests/codex-thread-workbench-page.test.mjs`
- Modify: `tests/codex-thread-workbench-local-storage-migration.test.mjs`
- Modify: `tests/hub-publication-audit.test.mjs`
- Modify: `tests/card-action-layout.test.mjs`

**Interfaces:**
- Consumes: `platforms.ios` 为字符串或 `{ href, label }`。
- Produces: `platformValue(app, "ios")`、主页 `data-action="ios"`、平台展示区 iOS 分组、发布审计 `ios` action。

- [ ] **Step 1: 写入失败测试**

  测试要求 Workbench 默认卡片名称为「Codex 待确认悬浮助手」，动作顺序为演示、视频、Wins下载、Mac下载、iOS安装，旧默认名称/简介迁移后补齐 iOS 入口，发布审计把 iOS PWA 作为 Web 安装入口而不是原生包。

- [ ] **Step 2: 运行聚焦测试确认 RED**

  Run: `node --test tests/codex-thread-workbench-page.test.mjs tests/codex-thread-workbench-local-storage-migration.test.mjs tests/hub-publication-audit.test.mjs tests/card-action-layout.test.mjs`
  Expected: 因缺少 `ios` 渲染、卡片内容和审计动作失败。

- [ ] **Step 3: 实现目录、迁移、渲染和审计**

  在平台组中加入 iOS；`renderActions` 输出 `iOS安装`；WorkBench 默认数据保留原 ID 并更新标题、简介、标签和三个平台 URL；迁移仅改写精确旧默认值；审计 actions 包含 iOS，但原生平台强制包检查仍只覆盖 Windows/macOS。

- [ ] **Step 4: 运行聚焦测试确认 GREEN**

  Run: `node --test tests/codex-thread-workbench-page.test.mjs tests/codex-thread-workbench-local-storage-migration.test.mjs tests/hub-publication-audit.test.mjs tests/card-action-layout.test.mjs`
  Expected: 全部通过。

- [ ] **Step 5: 提交 Hub 平台能力**

  Run: `git add app-20260706-restore-games.js scripts/hub-publication-audit.mjs tests && git commit -m "feat: add iOS install action for confirmation bar"`

### Task 3: 重做 v2.0.0 交互演示页

**Files:**
- Modify: `projects/codex-thread-workbench/index.html`
- Modify: `projects/codex-thread-workbench/styles.css`
- Modify: `projects/codex-thread-workbench/app.js`
- Modify: `tests/codex-thread-workbench-page.test.mjs`

**Interfaces:**
- Consumes: DOM actions `reveal-idle`, `simulate-candidates`, `simulate-error`, `confirm-one`, `confirm-all`, `reset-demo`。
- Produces: `data-overlay-state="retracted|idle|attention|error"` 状态机和可自动化观察的候选计数。

- [ ] **Step 1: 添加 v2 状态机静态与浏览器失败测试**

  断言初始贴顶、10px 把手、模拟候选后自动展开两项、逐条与一键确认、清空后收回、异常展开、键盘与移动视口可用。

- [ ] **Step 2: 运行页面测试确认 RED**

  Run: `node --test tests/codex-thread-workbench-page.test.mjs`
  Expected: 因旧多卡片演示不存在 v2 状态机而失败。

- [ ] **Step 3: 实现新的 HTML/CSS/JS**

  使用统一 Hub 子页背景；用单一状态机驱动贴顶把手、空闲条、候选列表和异常状态；所有按钮提供可访问名称，触摸设备提供显式展开按钮，离开延迟只在桌面指针启用。

- [ ] **Step 4: 运行页面测试确认 GREEN**

  Run: `node --test tests/codex-thread-workbench-page.test.mjs`
  Expected: 全部通过。

- [ ] **Step 5: 提交演示页**

  Run: `git add projects/codex-thread-workbench tests/codex-thread-workbench-page.test.mjs && git commit -m "feat: showcase confirmation overlay workflow"`

### Task 4: 发布可安装 iOS Web App

**Files:**
- Create: `projects/codex-thread-workbench/ios/index.html`
- Create: `projects/codex-thread-workbench/ios/styles.css`
- Create: `projects/codex-thread-workbench/ios/app.js`
- Create: `projects/codex-thread-workbench/ios/app.webmanifest`
- Create: `projects/codex-thread-workbench/ios/service-worker.js`
- Create: `projects/codex-thread-workbench/ios/icon-192.png`
- Create: `projects/codex-thread-workbench/ios/icon-512.png`
- Create: `tests/codex-thread-workbench-ios.test.mjs`

**Interfaces:**
- Consumes: Safari `beforeinstallprompt` 不可用的约束和 `navigator.serviceWorker`。
- Produces: `display: standalone` manifest、iOS meta tags、主屏幕安装步骤、离线静态外壳、示例确认状态机。

- [ ] **Step 1: 写入 PWA 失败测试**

  验证 manifest 名称、作用域、standalone、192/512 图标、Apple mobile web app meta、service worker 仅缓存 iOS 自身静态文件、页面明确桌面能力边界。

- [ ] **Step 2: 运行 iOS 测试确认 RED**

  Run: `node --test tests/codex-thread-workbench-ios.test.mjs`
  Expected: 文件不存在。

- [ ] **Step 3: 实现 iOS Web App 和图标**

  使用原生 HTML/CSS/JS；Safari 显示“分享 → 添加到主屏幕”步骤；其他浏览器显示兼容提示；离线时仍可进入演示和查看边界说明。图标从最终页面品牌画面生成 PNG，不使用 SVG 作为最终 PWA 图标。

- [ ] **Step 4: 运行 iOS 测试与 390px 浏览器检查**

  Run: `node --test tests/codex-thread-workbench-ios.test.mjs`
  Expected: 全部通过。

- [ ] **Step 5: 提交 iOS PWA**

  Run: `git add projects/codex-thread-workbench/ios tests/codex-thread-workbench-ios.test.mjs && git commit -m "feat: add installable iOS companion demo"`

### Task 5: 生成并接入 Windows v2.0.0 安全下载

**Files:**
- Modify: `scripts/split-codex-thread-workbench.mjs`
- Modify: `projects/codex-thread-workbench/download/index.html`
- Modify: `projects/codex-thread-workbench/download/manifest.json`
- Create: `projects/codex-thread-workbench/download/parts/v2.0.0/part-*.bin`
- Modify: `tests/codex-thread-workbench-download.test.mjs`

**Interfaces:**
- Consumes: 已验证的 `CodexConfirmationBar-Windows-x64.zip`。
- Produces: 固定 v2.0.0 清单和 8 MiB 分片，下载页逐片和完整包校验。

- [ ] **Step 1: 更新失败测试为 v2 文件名、版本、长度和 SHA**

  测试从本机最终 ZIP 的实际元数据生成精确期望，并断言页面/脚本/清单一致。

- [ ] **Step 2: 运行下载测试确认 RED**

  Run: `node --test tests/codex-thread-workbench-download.test.mjs`
  Expected: 旧 v1.3.0 文件名与清单不匹配。

- [ ] **Step 3: 构建和验证 Windows 包**

  Run: `powershell -File build/codex-thread-workbench/scripts/Publish-Windows.ps1 -OutputRoot C:\Users\ASUS\AppData\Local\Temp\codex-confirmation-bar-v2-release`
  随后对正式 EXE执行 `--smoke-test`，检查 ZIP 中 EXE/README，记录总字节数和 SHA-256。

- [ ] **Step 4: 更新切分器并生成 v2 分片**

  把实际文件名、总长度、完整 SHA 和 `RELEASE_DIRECTORY = "v2.0.0"` 写入切分器，运行脚本生成清单和分片。

- [ ] **Step 5: 运行下载测试确认 GREEN**

  Run: `node --test tests/codex-thread-workbench-download.test.mjs`
  Expected: 全部通过。

- [ ] **Step 6: 分片按安全提交策略提交**

  先提交脚本、清单和页面，再按每片独立提交，避免一次产生过大的 Git 对象批次。

### Task 6: 重新制作 v2.0.0 演示视频

**Files:**
- Modify: `scripts/render-codex-thread-workbench-video.mjs`
- Modify: `projects/codex-thread-workbench/video/tutorial-script.md`
- Modify: `projects/codex-thread-workbench/video/codex-thread-workbench-demo.vtt`
- Modify: `projects/codex-thread-workbench/video/codex-thread-workbench-demo.mp4`
- Modify: `projects/codex-thread-workbench/video/poster.jpg`
- Modify: `projects/codex-thread-workbench/video/index.html`
- Modify: `tests/codex-thread-workbench-video.test.mjs`

**Interfaces:**
- Consumes: v2 演示页状态机和 FFmpeg。
- Produces: H.264 1280×720 教程、单行 VTT、章节和海报。

- [ ] **Step 1: 更新视频失败测试**

  要求标题/描述/章节覆盖贴顶收纳、自动弹出、逐条确认、一键全部确认、扫描异常、Windows/macOS/iOS 边界；媒体为 H.264、≤240 秒、1280×720；VTT cue 文本无换行。

- [ ] **Step 2: 运行视频测试确认 RED**

  Run: `node --test tests/codex-thread-workbench-video.test.mjs`
  Expected: 旧视频内容不匹配。

- [ ] **Step 3: 更新脚本并生成媒体**

  用 Playwright/页面帧或现有渲染管线生成教程，调用可用 FFmpeg 编码 H.264/yuv420p 和 poster；字幕按连续短句分段。

- [ ] **Step 4: 运行媒体探测和视频测试确认 GREEN**

  Run: `node --test tests/codex-thread-workbench-video.test.mjs`
  Expected: 全部通过，媒体元数据符合约束。

- [ ] **Step 5: 提交视频**

  Run: `git add scripts/render-codex-thread-workbench-video.mjs projects/codex-thread-workbench/video tests/codex-thread-workbench-video.test.mjs && git commit -m "media: publish confirmation bar v2 tutorial"`

### Task 7: 完成本地门禁并触发 macOS 双架构构建

**Files:**
- Verify: 本计划涉及的全部文件
- Generated by CI: `projects/codex-thread-workbench/download/mac/manifest-*.json`
- Generated by CI: `projects/codex-thread-workbench/download/mac/parts/**`

**Interfaces:**
- Consumes: 发布分支完整提交和 GitHub Actions macOS artifacts。
- Produces: 经过 runner 验证的 arm64/x64 分片和清单。

- [ ] **Step 1: 运行明确列名的 Hub 测试**

  Run: `node --test tests/codex-thread-workbench-download.test.mjs tests/codex-thread-workbench-mac-download.test.mjs tests/codex-thread-workbench-page.test.mjs tests/codex-thread-workbench-local-storage-migration.test.mjs tests/codex-thread-workbench-ios.test.mjs tests/codex-thread-workbench-video.test.mjs tests/card-action-layout.test.mjs tests/hub-publication-audit.test.mjs tests/hub-tool-taxonomy.test.mjs`
  Expected: 全部通过，不运行 ClickFlow。

- [ ] **Step 2: 运行发布审计和差异检查**

  Run: `node scripts/hub-publication-audit.mjs --format json`
  Run: `git diff --check`
  Expected: 0 findings，退出码 0。

- [ ] **Step 3: 推送发布分支**

  Run: `git push -u origin codex/workbench-v2-overlay-public`

- [ ] **Step 4: 等待 macOS workflow 完成并拉取 bot 回写**

  使用 `gh run watch` 等待 arm64、x64 和 publish jobs 成功；随后 `git pull --rebase`，核对两个 manifest 的版本、文件名、长度、SHA 和分片数。

- [ ] **Step 5: 重新运行聚焦测试**

  Run: Task 7 Step 1 的同一明确列名命令。
  Expected: 全部通过。

### Task 8: 合并发布并完成公网验收

**Files:**
- Modify: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`
- Modify: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\CodexThreadWorkbench.md`

**Interfaces:**
- Consumes: ready PR、最终 main SHA、Pages/CI workflow、公开 URL。
- Produces: GitHub Pages 的正式 v2.0.0 页面与长期项目记录。

- [ ] **Step 1: 创建 PR 并等待远端检查**

  PR 描述列出平台边界、Windows/macOS 包证据、iOS PWA 限制、测试和回滚路径；所有 required checks 成功后合并，不强推 main。

- [ ] **Step 2: 等待最终 main 的 Pages 和完整验证**

  使用 GitHub Actions 查询最终合并 SHA 对应 workflow，要求 Pages 和完整远端验证成功。

- [ ] **Step 3: 公网 HTTP、Range 和哈希验收**

  检查 Hub `#apps`、演示、视频、iOS、Windows/macOS 清单、MP4/VTT/海报均为 200；MP4 和分片 Range 为 206；严格按清单重组 Windows/macOS 包并验证完整长度和 SHA。

- [ ] **Step 4: 公网真实浏览器验收**

  在桌面和 390×844 视口检查卡片动作顺序、演示状态机、iOS 安装步骤、无横向溢出、视频播放、字幕和浏览器日志 0 错误。

- [ ] **Step 5: 更新长期记忆**

  写入最终 main SHA、PR、workflow、页面 URL、三平台交付边界、包长度/SHA、测试数量和公网证据；不保存凭据。

- [ ] **Step 6: 完成前新鲜验证**

  重跑最终聚焦测试、发布审计和 `git diff --check`，再次查询公网关键 URL 与 Pages 状态，然后才向用户报告完成。
