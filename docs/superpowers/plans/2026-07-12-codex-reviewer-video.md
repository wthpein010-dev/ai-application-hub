# Codex 对话评分工具介绍视频 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Codex 对话评分工具制作两至三分钟的真实流程中文介绍视频，并在应用卡片提供可在线访问的视频入口。

**Architecture:** 沿用现有应用元数据的 `video` 字段和独立视频播放页模式。视频由脱敏的固定分镜、中文配音、WebVTT 字幕和 FFmpeg 生成脚本构成；自动化测试分别验证入口迁移、页面懒加载和最终媒体参数。

**Tech Stack:** HTML/CSS、JavaScript、Node.js test runner、PowerShell、FFmpeg/ffprobe、Windows System.Speech、GitHub Pages。

## Global Constraints

- 输出必须为 1920×1080、H.264 视频和 AAC 音频的 MP4。
- 视频时长必须在 120 至 180 秒之间。
- 必须提供普通话中文配音、内嵌中文字幕和独立 WebVTT 字幕。
- 演示数据必须为虚构或脱敏内容，不得展示真实对话、令牌、密码或个人路径。
- 视频页面必须点击后才加载 MP4，并在窄屏下无横向溢出。
- 不修改评分算法、Excel 生成逻辑或现有 Windows/Mac 下载包。

---

## File Map

- Modify `app-20260706-restore-games.js`: 增加视频入口并迁移旧缓存元数据。
- Create `tests/codex-reviewer-video.test.mjs`: 验证元数据、播放页、字幕和媒体参数。
- Replace `projects/Codex对话评分工具/视频资源/演示视频占位.html` with `projects/Codex对话评分工具/视频资源/演示视频.html`: 独立懒加载播放页。
- Create `projects/Codex对话评分工具/视频资源/codex-reviewer-intro.vtt`: 网页字幕轨道。
- Create `projects/Codex对话评分工具/视频资源/codex-reviewer-intro.mp4`: 最终介绍视频。
- Create `projects/Codex对话评分工具/视频资源/frames/*.png`: 六个真实流程分镜。
- Create `scripts/codex-reviewer-video-script.json`: 分镜时间、配音和字幕源。
- Create `scripts/record-codex-reviewer-demo.ps1`: 可重复执行的视频生成脚本。

### Task 1: 应用视频入口与旧缓存迁移

**Files:**
- Modify: `app-20260706-restore-games.js:305-324`
- Test: `tests/codex-reviewer-video.test.mjs`

**Interfaces:**
- Consumes: `defaultApps`, `normalizeApp(app)`, `renderActions(app)`。
- Produces: `codex-reviewer.video = "./projects/Codex对话评分工具/视频资源/演示视频.html"`。

- [ ] **Step 1: 编写失败的元数据与迁移测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

test("codex reviewer exposes and migrates its video entry", () => {
  assert.match(source, /video:\s*"\.\/projects\/Codex对话评分工具\/视频资源\/演示视频\.html"/);
  assert.match(source, /if \(normalized\.id === "codex-reviewer"\)/);
  assert.match(source, /normalized\.video = "\.\/projects\/Codex对话评分工具\/视频资源\/演示视频\.html"/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/codex-reviewer-video.test.mjs`

Expected: FAIL，提示缺少新视频地址或缓存迁移分支。

- [ ] **Step 3: 添加默认入口与迁移逻辑**

```js
video: "./projects/Codex对话评分工具/视频资源/演示视频.html",
```

并在 `normalizeApp` 中添加：

```js
if (normalized.id === "codex-reviewer") {
  normalized.video = "./projects/Codex对话评分工具/视频资源/演示视频.html";
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/codex-reviewer-video.test.mjs`

Expected: 1 test passed。

- [ ] **Step 5: 提交入口改动**

```powershell
git add app-20260706-restore-games.js tests/codex-reviewer-video.test.mjs
git commit -m "feat: add codex reviewer video entry"
```

### Task 2: 懒加载视频页与字幕轨道

**Files:**
- Delete: `projects/Codex对话评分工具/视频资源/演示视频占位.html`
- Create: `projects/Codex对话评分工具/视频资源/演示视频.html`
- Create: `projects/Codex对话评分工具/视频资源/codex-reviewer-intro.vtt`
- Modify: `tests/codex-reviewer-video.test.mjs`

**Interfaces:**
- Consumes: `codex-reviewer-intro.mp4` 和 `codex-reviewer-intro.vtt` 相对地址。
- Produces: `#loadVideo` 按钮和初始无 `src` 的 `#walkthroughVideo` 播放器。

- [ ] **Step 1: 添加失败的视频页结构测试**

```js
test("codex reviewer video page lazy-loads media and subtitles", () => {
  const page = readFileSync(join(root, "projects", "Codex对话评分工具", "视频资源", "演示视频.html"), "utf8");
  assert.match(page, /id="loadVideo"/);
  assert.match(page, /id="walkthroughVideo"/);
  assert.doesNotMatch(page, /<video[^>]+src=/);
  assert.match(page, /codex-reviewer-intro\.mp4/);
  assert.match(page, /codex-reviewer-intro\.vtt/);
  assert.match(page, /overflow-x:\s*hidden/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/codex-reviewer-video.test.mjs`

Expected: FAIL，`演示视频.html` 不存在。

- [ ] **Step 3: 创建播放页**

页面必须包含以下加载逻辑：

```js
const button = document.querySelector("#loadVideo");
const video = document.querySelector("#walkthroughVideo");
button.addEventListener("click", () => {
  video.src = "./codex-reviewer-intro.mp4";
  video.hidden = false;
  button.hidden = true;
  video.load();
  video.play().catch(() => {});
}, { once: true });
```

播放器中添加：

```html
<track kind="subtitles" srclang="zh-CN" label="简体中文" src="./codex-reviewer-intro.vtt" default>
```

- [ ] **Step 4: 创建完整 WebVTT 字幕**

字幕至少覆盖七个内容段落：问题定位、启动、读取与脱敏、评分维度、四个工作表、复盘使用、结束引导；时间码必须连续落在最终视频时长内。

- [ ] **Step 5: 运行页面测试并确认通过**

Run: `node --test tests/codex-reviewer-video.test.mjs`

Expected: 2 tests passed。

- [ ] **Step 6: 提交页面与字幕**

```powershell
git add app-20260706-restore-games.js tests/codex-reviewer-video.test.mjs "projects/Codex对话评分工具/视频资源"
git commit -m "feat: add codex reviewer video page"
```

### Task 3: 真实流程分镜与可重复生成脚本

**Files:**
- Create: `scripts/codex-reviewer-video-script.json`
- Create: `scripts/record-codex-reviewer-demo.ps1`
- Create: `projects/Codex对话评分工具/视频资源/frames/01-problem.png`
- Create: `projects/Codex对话评分工具/视频资源/frames/02-launch.png`
- Create: `projects/Codex对话评分工具/视频资源/frames/03-redaction.png`
- Create: `projects/Codex对话评分工具/视频资源/frames/04-scoring.png`
- Create: `projects/Codex对话评分工具/视频资源/frames/05-workbook.png`
- Create: `projects/Codex对话评分工具/视频资源/frames/06-review.png`
- Create: `projects/Codex对话评分工具/视频资源/codex-reviewer-intro.mp4`
- Modify: `tests/codex-reviewer-video.test.mjs`

**Interfaces:**
- Consumes: JSON 数组元素 `{ frame, start, end, narration, subtitle }`。
- Produces: 1920×1080 H.264/AAC MP4 和与其时间轴一致的画面、配音、烧录字幕。

- [ ] **Step 1: 添加失败的媒体参数测试**

```js
test("codex reviewer walkthrough is 1080p with audio and under three minutes", () => {
  const probe = spawnSync(process.env.FFPROBE_PATH || "ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
    "-of", "json", join(root, "projects", "Codex对话评分工具", "视频资源", "codex-reviewer-intro.mp4")
  ], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const data = JSON.parse(probe.stdout);
  const video = data.streams.find(stream => stream.codec_type === "video");
  const audio = data.streams.find(stream => stream.codec_type === "audio");
  assert.deepEqual([video.width, video.height, video.codec_name], [1920, 1080, "h264"]);
  assert.equal(audio.codec_name, "aac");
  assert.ok(Number(data.format.duration) >= 120 && Number(data.format.duration) <= 180);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `$env:FFPROBE_PATH=(Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffprobe.exe | Select-Object -First 1 -ExpandProperty FullName); node --test tests/codex-reviewer-video.test.mjs`

Expected: FAIL，最终 MP4 不存在。

- [ ] **Step 3: 编写固定分镜与配音文案**

JSON 中六段时长合计控制在 150 至 175 秒。所有示例对话使用虚构项目名，敏感字段只展示 `sk-***`、`token_***` 和 `[已隐藏]`。

- [ ] **Step 4: 生成六张 1920×1080 分镜**

分镜依次展示：工具定位、Windows 启动、扫描与脱敏、逐条评分、Excel 四表、复盘和下载引导。使用站点页面与脱敏示例结果，不包含真实用户目录。

- [ ] **Step 5: 编写 PowerShell 生成脚本**

脚本必须：检查 FFmpeg；使用 `System.Speech.Synthesis.SpeechSynthesizer` 生成中文 WAV；按 JSON 合成分镜；烧录中文字幕；输出 H.264/AAC MP4；任何输入文件缺失时抛出包含文件名的错误。

- [ ] **Step 6: 运行脚本生成最终视频**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/record-codex-reviewer-demo.ps1`

Expected: 输出 `codex-reviewer-intro.mp4`，脚本退出码 0。

- [ ] **Step 7: 运行媒体测试并确认通过**

Run: `$env:FFPROBE_PATH=(Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffprobe.exe | Select-Object -First 1 -ExpandProperty FullName); node --test tests/codex-reviewer-video.test.mjs`

Expected: 3 tests passed，视频为 1920×1080 H.264/AAC，时长 120–180 秒。

- [ ] **Step 8: 提交视频资产与生成工具**

```powershell
git add scripts/codex-reviewer-video-script.json scripts/record-codex-reviewer-demo.ps1 tests/codex-reviewer-video.test.mjs "projects/Codex对话评分工具/视频资源"
git commit -m "feat: add codex reviewer narrated walkthrough"
```

### Task 4: 回归验证、浏览器验收与发布

**Files:**
- Verify: `app-20260706-restore-games.js`
- Verify: `projects/Codex对话评分工具/视频资源/演示视频.html`
- Verify: `projects/Codex对话评分工具/视频资源/codex-reviewer-intro.mp4`

**Interfaces:**
- Consumes: Task 1–3 的全部发布文件。
- Produces: 合并到 `main` 并通过 GitHub Pages 验证的线上入口。

- [ ] **Step 1: 运行完整自动化验证**

```powershell
node --check app-20260706-restore-games.js
$env:FFPROBE_PATH=(Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffprobe.exe | Select-Object -First 1 -ExpandProperty FullName)
node --test tests/*.test.mjs
git diff --check
```

Expected: 所有测试通过，无语法错误和空白错误。

- [ ] **Step 2: 本地浏览器验收**

启动静态服务器，验证首页卡片出现视频按钮；视频页打开时 MP4 未加载；点击后播放器显示且能播放；桌面宽度和 390×844 视口无横向溢出；控制台无错误。

- [ ] **Step 3: 推送并创建 PR**

```powershell
git push -u origin codex/codex-reviewer-video
gh pr create --base main --head codex/codex-reviewer-video --title "feat: add Codex 对话评分工具介绍视频"
```

Expected: PR 为 MERGEABLE/CLEAN。

- [ ] **Step 4: 合并并等待 Pages 部署**

```powershell
gh pr merge --squash --delete-branch
gh run list --limit 3
```

Expected: `pages build and deployment` conclusion 为 `success`。

- [ ] **Step 5: 验证线上发布文件**

验证主页脚本、播放页、VTT 和 MP4 均返回 HTTP 200；检查线上主页包含新视频地址；下载线上 MP4 并确认 SHA-256 与本地文件一致。

- [ ] **Step 6: 最终状态检查**

Run: `git status --short; git rev-parse HEAD; git rev-parse origin/main`

Expected: 工作区干净，`HEAD` 与 `origin/main` 相同。
