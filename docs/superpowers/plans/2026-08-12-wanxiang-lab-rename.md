# 「万象实验室」品牌改名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `simuai` 项目的公开品牌统一改为「万象实验室」，保留所有内部标识、既有链接、静态可靠行为与用户自定义卡片名称，并完成 GitHub Pages 重新发布。

**Architecture:** 保持现有静态应用和 Hub 数据结构不变，只在用户可见界面与当前公开文档中替换品牌，并在 `normalizeApp` 增加一条精确旧默认值迁移。教程录制器继续从真实演示页录屏，因此在页面改名后重新生成海报和 H.264 MP4，即可让媒体画面与新品牌保持一致。

**Tech Stack:** 静态 HTML/CSS/ES modules、Node.js 20 `node:test`、Playwright、FFmpeg、GitHub Pages、GitHub Actions

## Global Constraints

- 公开品牌固定为「万象实验室」，不显示「SimuAI · 万象实验室」双品牌。
- 保留内部 ID `simuai`、目录 `/projects/simuai/`、npm 脚本、环境变量、localhost 代理协议与既有 URL。
- 只迁移精确旧默认名称「SimuAI 万物实验室」，不得覆盖用户自行修改的卡片名称。
- 公开版继续在浏览器本地匹配 30 个实验，不新增远程 AI 请求；六类实验、九种模型、五种图表模式保持不变。
- Hub 分类继续为 `#apps`，卡片顺序与“演示 / 视频”两个入口保持不变。
- 视频必须为 H.264 `1280×720`、少于 240 秒；中文字幕每条只占一行且不超过 18 个字符。
- 历史规格、历史计划、历史审计记录和兼容迁移常量允许保留旧名称，当前公开内容不允许残留旧品牌。

---

### Task 1: 锁定公开品牌与安全迁移契约

**Files:**
- Modify: `tests/simuai-publish.test.mjs`
- Modify: `tests/simuai-page.test.mjs`
- Modify: `tests/hub-carousel-status.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`
- Modify: `projects/simuai/index.html`

**Interfaces:**
- Consumes: `defaultApps` 中 `id === "simuai"` 的卡片；`normalizeApp(app)` 的现有本地存储兼容入口。
- Produces: 默认公开名称 `万象实验室`；`normalizeApp({ ...simuai, name: "SimuAI 万物实验室" }).name === "万象实验室"`；任意其他自定义名称保持不变。

- [ ] **Step 1: 写入会捕获公开旧品牌和过度迁移的失败测试**

在 `tests/simuai-publish.test.mjs` 复用真实 `defaultApps`，加载真实 `normalizeApp` 函数，并加入以下行为断言：

```js
assert.equal(app.name, "万象实验室");
assert.equal(normalizeApp({ ...app, name: "SimuAI 万物实验室" }).name, "万象实验室");
assert.equal(normalizeApp({ ...app, name: "我的实验工具" }).name, "我的实验工具");
```

同时断言演示页的 `<title>`、主品牌、`aria-label` 都包含「万象实验室」且不包含「SimuAI 万物实验室」。将 `tests/hub-carousel-status.test.mjs` 的测试目录名称与期望文本改为「万象实验室」，并在 `tests/simuai-page.test.mjs` 验证品牌链接和页脚署名。视频页契约留在 Task 2，与视频文案和媒体更新作为同一个可独立验证的交付物。

- [ ] **Step 2: 运行测试并确认因产品仍使用旧品牌而失败**

Run:

```powershell
node --test tests/simuai-publish.test.mjs tests/simuai-page.test.mjs tests/hub-carousel-status.test.mjs
```

Expected: FAIL，至少包含 `actual: 'SimuAI 万物实验室'`、缺少新演示页品牌或缺少旧名称迁移中的一种；不得是语法错误或测试装载错误。

- [ ] **Step 3: 用最小修改统一 Hub 与演示页品牌**

将 `defaultApps` 的 `simuai.name` 改为 `万象实验室`。在 `normalizeApp` 现有 `simuai` 分支加入精确迁移：

```js
if (normalized.id === "simuai" && normalized.name === "SimuAI 万物实验室") {
  normalized.name = base.name;
}
```

将 `projects/simuai/index.html` 的浏览器标题、品牌链接无障碍名称、主品牌文本和页脚署名改为「万象实验室」；保留路径、脚本和所有实验 UI。将 `index.html` 的运行时查询字符串末尾更新为 `20260812-wanxiang-lab-rename`，确保 Pages 客户端不复用旧目录缓存。

- [ ] **Step 4: 运行聚焦测试并确认通过**

Run:

```powershell
node --test tests/simuai-publish.test.mjs tests/simuai-page.test.mjs tests/hub-carousel-status.test.mjs
```

Expected: 全部通过，0 失败。

- [ ] **Step 5: 提交品牌和迁移实现**

```powershell
git add tests/simuai-publish.test.mjs tests/simuai-page.test.mjs tests/hub-carousel-status.test.mjs app-20260706-restore-games.js index.html projects/simuai/index.html
git commit -m "feat: rename SimuAI to 万象实验室"
```

---

### Task 2: 更新当前文档和教程媒体

**Files:**
- Modify: `projects/simuai/README.md`
- Modify: `docs/audits/2026-08-03-platform-compatibility.md`
- Modify: `projects/simuai/video/index.html`
- Modify: `projects/simuai/video/tutorial-script.md`
- Modify: `projects/simuai/video/simuai-tutorial.vtt`
- Modify: `projects/simuai/video/poster.jpg`
- Modify: `projects/simuai/video/simuai-tutorial.mp4`
- Modify if recording selectors require it: `scripts/build-simuai-tutorial.mjs`
- Test: `tests/simuai-publish.test.mjs`

**Interfaces:**
- Consumes: 已改名的真实 `projects/simuai/index.html` 和现有 `npm run build:simuai-video` 录制流程。
- Produces: 使用「万象实验室」的当前 README、兼容性清单、视频页、教程脚本、海报和真实录屏；媒体路径保持原值。

- [ ] **Step 1: 扩充失败契约，覆盖视频公开名称与当前文档状态**

在 `tests/simuai-publish.test.mjs` 读取 `projects/simuai/README.md`、`projects/simuai/video/index.html`、`projects/simuai/video/tutorial-script.md` 和当前兼容性清单，断言：

```js
assert.match(videoHtml, /万象实验室/);
assert.doesNotMatch(videoHtml, /SimuAI 万物实验室/);
assert.match(readme, /^# 万象实验室/m);
assert.match(readme, /30 个受控实验/);
assert.match(compatibility, /\| `simuai` \| 万象实验室 \|/);
```

保留现有媒体编码、尺寸、时长和字幕单行断言。

- [ ] **Step 2: 运行发布契约并确认当前文档/视频页失败**

Run:

```powershell
npm run test:simuai-publish
```

Expected: FAIL，原因是视频页、README 或兼容性清单仍含旧公开品牌或旧 12 实验说明。

- [ ] **Step 3: 更新当前公开文档和视频文案**

将视频页标题、主标题、播放器 `aria-label`、第一章节改为「万象实验室」；教程脚本标题及首章节改为新名称。README 统一使用新公开名称，并把过时的 12 实验/六模型说明更新为 30 个实验和九种模型：`linear / compound / decay / funnel / inventory / payback / logistic / queue / probability`。兼容性清单名称改为「万象实验室」，说明更新为 30 个本地受控实验。

将第一条字幕改为不超过 18 个字符的 `欢迎来到万象实验室`，其余时间轴保持无重叠。

- [ ] **Step 4: 从真实改名页面重新生成海报和 MP4**

Run:

```powershell
npm run build:simuai-video
```

Expected: 生成 `projects/simuai/video/poster.jpg` 和 `simuai-tutorial.mp4`，命令退出码为 0，录制过程无 console/page/request 错误。

- [ ] **Step 5: 运行发布契约和视频解码检查**

Run:

```powershell
npm run test:simuai-publish
```

Expected: 公开名称、文档、文件存在性、H.264、`1280×720`、时长和字幕全部通过，0 失败。

- [ ] **Step 6: 搜索当前发布面旧品牌残留并提交**

Run:

```powershell
rg -n -S "SimuAI 万物实验室|万物实验室" app-20260706-restore-games.js index.html projects/simuai tests/simuai-publish.test.mjs tests/simuai-page.test.mjs tests/hub-carousel-status.test.mjs docs/audits/2026-08-03-platform-compatibility.md
```

Expected: 只允许 `normalizeApp` 的精确旧默认名称、迁移测试输入和历史说明上下文；任何用户当前可见内容中的命中都先修复。

```powershell
git add projects/simuai docs/audits/2026-08-03-platform-compatibility.md scripts/build-simuai-tutorial.mjs tests/simuai-publish.test.mjs
git commit -m "docs: refresh 万象实验室 tutorial"
```

---

### Task 3: 完整验证与独立发布检查

**Files:**
- Verify: repository test suite and publication artifacts
- Update only if evidence finds a regression: the directly responsible file and its test

**Interfaces:**
- Consumes: Tasks 1–2 的改名、迁移和媒体产物。
- Produces: 可发布的分支状态、桌面/手机证据、Hub 审计证据和全仓回归结果。

- [ ] **Step 1: 运行全部 SimuAI 聚焦测试和桌面/手机浏览器冒烟**

```powershell
npm run test:simuai
npm run test:simuai-publish
npm run test:simuai-browser
```

Expected: Node 测试 0 失败；浏览器输出桌面 `1440×900` 与手机 `390×844` 均 PASS，无控制台、请求或横向溢出错误。

- [ ] **Step 2: 运行 Hub 发布审计和全仓回归**

```powershell
npm run audit:hub
$env:FFMPEG_PATH = (node -e "process.stdout.write(require('ffmpeg-static'))")
node --test
```

Expected: Hub 审计 0 findings；全仓测试 0 失败。环境条件跳过必须逐条确认属于现有平台条件，不能掩盖本次改名回归。

- [ ] **Step 3: 运行语法、差异和需求检查**

```powershell
git diff --check origin/main...HEAD
node --check app-20260706-restore-games.js
Get-ChildItem projects/simuai -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "syntax failed: $($_.FullName)" } }
git status --short
git diff --stat origin/main...HEAD
```

Expected: 无空白错误、无 JavaScript 语法错误，只包含本计划文件及品牌改名相关内容。

- [ ] **Step 4: 按完成前验证与代码审查流程检查需求覆盖**

逐条对照设计规格确认：公开品牌、精确迁移、自定义名称、内部 ID/路径、30 实验行为、视频、桌面/手机、发布路径均有直接证据。若发现问题，先补失败测试，再修复并重新运行受影响和完整验证。

---

### Task 4: GitHub Pages 发布与公网验收

**Files:**
- Update after successful release: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`

**Interfaces:**
- Consumes: 已验证的 `agent/rename-simuai-wanxiang-20260812` 分支和 `wthpein010-dev/ai-application-hub` 远端。
- Produces: 合入 `main` 的精确 SHA、成功的 Pages/完整验证工作流、公网页面与媒体验收、更新后的项目长期记忆。

- [ ] **Step 1: 现场确认 GitHub 身份、写权限、远端和发布差异**

```powershell
gh --version
gh auth status
gh repo view wthpein010-dev/ai-application-hub --json nameWithOwner,viewerPermission,defaultBranchRef
git fetch origin --prune
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: 当前身份已认证且 `viewerPermission` 为 `WRITE`、`MAINTAIN` 或 `ADMIN`；默认分支为 `main`；工作树干净且差异仅属于本次改名。

- [ ] **Step 2: 推送分支、创建 PR 并等待检查**

```powershell
git push -u origin agent/rename-simuai-wanxiang-20260812
gh pr create --base main --head agent/rename-simuai-wanxiang-20260812 --title "feat: rename SimuAI to 万象实验室" --body-file <temporary-pr-body-file>
gh pr checks <pr-number> --watch
```

PR 正文必须说明公开品牌改名、兼容迁移、视频重制和全部验证。若仓库没有必需检查，继续执行本地证据和合并前 `origin/main` 祖先检查。

- [ ] **Step 3: 合并 PR 并等待精确 SHA 的 Pages 与完整验证**

```powershell
gh pr merge <pr-number> --merge --delete-branch
git fetch origin main
git rev-parse origin/main
gh run list --branch main --limit 20 --json databaseId,headSha,name,status,conclusion,url
```

只接受 `headSha` 等于最终 `origin/main` 的 Pages 和完整 Hub 验证成功；若工作流由定时或手动触发，再按仓库现有方式触发并等待完成。

- [ ] **Step 4: 验收公网 Hub、演示页、视频页和媒体**

检查以下 URL 返回有效响应，并带缓存规避参数：

```text
https://wthpein010-dev.github.io/ai-application-hub/index.html?verify=<sha>#apps
https://wthpein010-dev.github.io/ai-application-hub/projects/simuai/index.html?verify=<sha>
https://wthpein010-dev.github.io/ai-application-hub/projects/simuai/video/index.html?verify=<sha>
https://wthpein010-dev.github.io/ai-application-hub/projects/simuai/video/simuai-tutorial.mp4?verify=<sha>
```

真实浏览器在桌面和手机断言 Hub 卡片、演示页和视频页只显示「万象实验室」；30 实验、搜索、图表切换、返回 `#apps` 正常；视频点击后 `readyState >= 3` 且 `currentTime > 0`；无控制台、请求或横向溢出错误。校验公网关键文本/媒体字节与最终提交一致。

- [ ] **Step 5: 更新长期记忆并报告**

将 AI Application Hub 项目记忆中的当前正式名称更新为「万象实验室」，记录最终 `main` SHA、PR、Pages/完整验证 workflow、公网地址、测试计数、视频元数据和桌面/手机验收；保留历史来源上下文，不写入凭据。
