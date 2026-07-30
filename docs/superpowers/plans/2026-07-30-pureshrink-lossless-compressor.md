# PureShrink Lossless Compressor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publicly release PureShrink as a private-by-default online batch media compressor with verified Windows and macOS desktop packages.

**Architecture:** A shared static HTML/CSS/JavaScript product owns queue state, policy copy, metrics, and interactions. The browser engine lazily uses a version-locked FFmpeg.wasm and fflate, while an isolated Electron preload selects a native engine backed by ffmpeg-static. The Hub, video page, release workflow, manifest, and publication tests make the product one auditable release unit.

**Tech Stack:** ECMAScript modules, Node.js 24 test runner, FFmpeg.wasm 0.11.6, fflate 0.8.2, Electron 37, electron-builder 26, ffmpeg-static 5.2.0, Playwright 1.61.1, GitHub Actions, GitHub Pages.

## Global Constraints

- Product name is `PureShrink 无损压缩工坊`; release tag is `pureshrink-v1.0.0`.
- Strict lossless mode is the default and never exposes a larger output as an optimized result.
- High-fidelity mode is always labeled as non-lossless.
- Online processing stays on-device and contains no upload API.
- Source files are never overwritten; desktop outputs use a `-pureshrink` suffix.
- Browser work is sequential and recommends desktop for files over 500 MB.
- Electron uses `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Windows and macOS assets must be produced on their corresponding GitHub-hosted runners.
- The Hub action order is `演示 / 视频 / Wins下载 / Mac下载`.
- The tutorial is H.264, no longer than 240 seconds, with one subtitle line at a time.

---

### Task 1: Compression policy, queue, and metrics

**Files:**
- Create: `projects/pureshrink/core/policy.mjs`
- Create: `projects/pureshrink/core/queue.mjs`
- Create: `projects/pureshrink/core/metrics.mjs`
- Create: `tests/pureshrink-core.test.mjs`

**Interfaces:**
- Produces: `classifyFile(fileLike)`, `createPlan(fileLike, mode)`, `createQueue(executor)`, `formatBytes(bytes)`, `savingRatio(inputBytes, outputBytes)`, and `summarizeTasks(tasks)`.
- `createPlan` returns `{ kind, mode, outputExtension, strategy, isLossless, recommendedDesktop }`.
- Queue tasks expose `{ id, file, plan, status, progress, result, error }`.

- [ ] **Step 1: Write failing policy and metrics tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createPlan } from "../projects/pureshrink/core/policy.mjs";
import { formatBytes, savingRatio } from "../projects/pureshrink/core/metrics.mjs";

test("strict PNG uses pixel-lossless optimization", () => {
  assert.deepEqual(createPlan({ name: "hero.png", type: "image/png", size: 1024 }, "lossless"), {
    kind: "image",
    mode: "lossless",
    outputExtension: "png",
    strategy: "像素无损 PNG 重编码",
    isLossless: true,
    recommendedDesktop: false,
  });
});

test("high fidelity video is explicitly non-lossless", () => {
  const plan = createPlan({ name: "clip.mov", type: "video/quicktime", size: 700_000_000 }, "fidelity");
  assert.equal(plan.kind, "video");
  assert.equal(plan.outputExtension, "mp4");
  assert.equal(plan.isLossless, false);
  assert.equal(plan.recommendedDesktop, true);
});

test("metrics are stable for empty and larger outputs", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(savingRatio(0, 0), 0);
  assert.equal(savingRatio(100, 120), -20);
});
```

- [ ] **Step 2: Run the focused test and confirm module-not-found failures**

Run: `node --test tests/pureshrink-core.test.mjs`

Expected: FAIL because `policy.mjs` and `metrics.mjs` do not exist.

- [ ] **Step 3: Implement policy and metrics**

```js
const EXTENSIONS = {
  image: new Set(["png", "jpg", "jpeg", "webp", "avif", "heic"]),
  gif: new Set(["gif"]),
  video: new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v"]),
  audio: new Set(["mp3", "m4a", "wav", "flac", "ogg", "aac"]),
};

export function classifyFile(file) {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  return Object.entries(EXTENSIONS).find(([, values]) => values.has(extension))?.[0] || "archive";
}

export function createPlan(file, mode = "lossless") {
  const kind = classifyFile(file);
  const recommendedDesktop = file.size > 500_000_000;
  if (mode === "fidelity") {
    const outputExtension = kind === "image" ? "webp" : kind === "video" ? "mp4" : kind === "gif" ? "gif" : "zip";
    return { kind, mode, outputExtension, strategy: "高保真重新编码", isLossless: false, recommendedDesktop };
  }
  const outputExtension = kind === "archive" ? "zip" : file.name.toLowerCase().split(".").pop() || "bin";
  const strategy = kind === "image" && outputExtension === "png"
    ? "像素无损 PNG 重编码"
    : kind === "archive"
      ? "字节级无损 ZIP 归档"
      : "码流复制与元数据精简";
  return { kind, mode, outputExtension, strategy, isLossless: true, recommendedDesktop };
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / (1024 ** index)).toFixed(index ? 1 : 0))} ${units[index]}`;
}

export function savingRatio(inputBytes, outputBytes) {
  if (!inputBytes) return 0;
  return Number((((inputBytes - outputBytes) / inputBytes) * 100).toFixed(1));
}
```

- [ ] **Step 4: Add queue transition tests and implementation**

```js
test("queue runs one task at a time and preserves failures", async () => {
  const order = [];
  const queue = createQueue(async (task, report) => {
    order.push(`start:${task.id}`);
    report(50);
    order.push(`end:${task.id}`);
    return { outputBytes: task.file.size - 1 };
  });
  queue.add([{ name: "a.png", size: 10 }, { name: "b.png", size: 20 }], "lossless");
  await queue.start();
  assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
  assert.deepEqual(queue.tasks.map((task) => task.status), ["completed", "completed"]);
});
```

Implement `createQueue` with an internal incrementing ID, sequential `for...of` execution, progress clamping, `cancelCurrent`, `clearCompleted`, and subscription callbacks. Treat `{ outputBytes >= inputBytes }` in lossless mode as `kept-original`.

- [ ] **Step 5: Run core tests and commit**

Run: `node --test tests/pureshrink-core.test.mjs`

Expected: PASS.

```powershell
git add projects/pureshrink/core tests/pureshrink-core.test.mjs
git commit -m "feat: add PureShrink compression core"
```

### Task 2: Shared web workbench and browser engine

**Files:**
- Create: `projects/pureshrink/index.html`
- Create: `projects/pureshrink/styles.css`
- Create: `projects/pureshrink/app.js`
- Create: `projects/pureshrink/engines/browser-engine.mjs`
- Create: `projects/pureshrink/engines/desktop-engine.mjs`
- Create: `projects/pureshrink/README.md`
- Create: `tests/pureshrink-page.test.mjs`
- Create: `tests/pureshrink-browser-engine.test.mjs`

**Interfaces:**
- Consumes: Task 1 policy, queue, and metrics modules.
- Produces: `createBrowserEngine(options)`, `createDesktopEngine(bridge)`, and browser DOM selectors prefixed with `data-pureshrink`.
- Engine method: `compress(task, onProgress): Promise<{ name, outputBytes, blob?: Blob, path?: string, verification: string }>`.

- [ ] **Step 1: Write failing page-contract tests**

```js
test("page exposes privacy, two modes, queue, and all actions", () => {
  const html = readFileSync(project("index.html"), "utf8");
  assert.match(html, /文件不离开设备，原件永不覆盖/);
  assert.match(html, /data-pureshrink-dropzone/);
  assert.match(html, /value="lossless"[\s\S]*checked/);
  assert.match(html, /高保真[\s\S]*非无损/);
  assert.match(html, /data-pureshrink-start/);
  assert.match(html, /data-pureshrink-cancel/);
  assert.match(html, /data-pureshrink-download-all/);
  assert.match(html, /返回主页/);
});
```

- [ ] **Step 2: Run page tests and confirm missing-file failures**

Run: `node --test tests/pureshrink-page.test.mjs`

Expected: FAIL because the PureShrink page does not exist.

- [ ] **Step 3: Build the accessible workbench**

Create semantic HTML with:

```html
<input id="filePicker" type="file" multiple accept="image/*,video/*,audio/*,.gif,.pdf,.zip" hidden />
<button class="dropzone" type="button" data-pureshrink-dropzone aria-describedby="privacyNote">
  <strong>拖入图片、视频、GIF 或其他文件</strong>
  <span>也可以点击选择 · 支持批量队列</span>
</button>
<fieldset class="mode-picker">
  <label><input type="radio" name="mode" value="lossless" checked />严格无损</label>
  <label><input type="radio" name="mode" value="fidelity" />高保真 <em>非无损</em></label>
</fieldset>
<ol class="queue-list" data-pureshrink-queue aria-live="polite"></ol>
```

Use a dark ink-green background, warm white typography, lime status accents, a visible focus ring, a single-column layout below 760 px, and no fixed minimum width.

- [ ] **Step 4: Implement browser and desktop engines**

The browser engine must:

- load `@ffmpeg/ffmpeg@0.11.6` only on first media task;
- use exact CDN URLs stored as constants;
- use `fflate@0.8.2` only for archive fallback and batch ZIP;
- execute `-map 0 -c copy -map_metadata -1` for strict media remux;
- execute PNG lossless re-encode for PNG;
- execute WebP or H.264/AAC high-fidelity commands only when the selected mode is `fidelity`;
- delete temporary FFmpeg files in `finally`;
- discard strict outputs that are not smaller.

The desktop engine must reject a missing or malformed bridge:

```js
export function createDesktopEngine(bridge) {
  if (!bridge || typeof bridge.compress !== "function") {
    throw new TypeError("PureShrink desktop bridge is unavailable");
  }
  return {
    compress(task, onProgress) {
      return bridge.compress({
        id: task.id,
        sourcePath: task.file.nativePath,
        name: task.file.name,
        size: task.file.size,
        plan: task.plan,
      }, onProgress);
    },
  };
}
```

- [ ] **Step 5: Bind queue interactions and safe downloads**

`app.js` must handle click selection, drag enter/leave/drop, keyboard activation, mode choice, sequential start, current cancellation, per-item download, batch ZIP, output URL revocation, and desktop-native selection. Set `beforeunload` only while unfinished Blob results exist.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test tests/pureshrink-core.test.mjs tests/pureshrink-page.test.mjs tests/pureshrink-browser-engine.test.mjs`

Expected: PASS.

```powershell
git add projects/pureshrink tests/pureshrink-page.test.mjs tests/pureshrink-browser-engine.test.mjs
git commit -m "feat: build PureShrink web workbench"
```

### Task 3: Secure Electron desktop engine

**Files:**
- Create: `build/pureshrink-desktop/package.json`
- Create: `build/pureshrink-desktop/package-lock.json`
- Create: `build/pureshrink-desktop/main.cjs`
- Create: `build/pureshrink-desktop/preload.cjs`
- Create: `build/pureshrink-desktop/native/policy.cjs`
- Create: `build/pureshrink-desktop/native/runner.cjs`
- Create: `build/pureshrink-desktop/scripts/verify-package.mjs`
- Create: `build/pureshrink-desktop/README.md`
- Create: `tests/pureshrink-desktop.test.mjs`

**Interfaces:**
- Consumes: shared page from Task 2 through electron-builder `extraResources`.
- Produces: preload bridge methods `pickFiles`, `chooseOutputDirectory`, `compress`, `cancel`, `showItem`, `getEnvironment`.
- Native `buildArguments(request, outputPath)` returns an argument array and never a command string.

- [ ] **Step 1: Write failing desktop security tests**

```js
test("desktop window is isolated and runner never invokes a shell", () => {
  const main = readFileSync(desktop("main.cjs"), "utf8");
  const runner = readFileSync(desktop("native", "runner.cjs"), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(runner, /spawn\([^,]+,\s*args,\s*\{\s*shell:\s*false/);
  assert.doesNotMatch(runner, /exec\(|execSync\(|shell:\s*true/);
});
```

- [ ] **Step 2: Run test and confirm missing-file failures**

Run: `node --test tests/pureshrink-desktop.test.mjs`

Expected: FAIL because the desktop source does not exist.

- [ ] **Step 3: Implement whitelisted native policy**

Map plan kinds to argument arrays:

```js
function losslessArgs(kind, input, output) {
  if (kind === "image" && output.toLowerCase().endsWith(".png")) {
    return ["-y", "-i", input, "-map_metadata", "-1", "-compression_level", "100", output];
  }
  return ["-y", "-i", input, "-map", "0", "-c", "copy", "-map_metadata", "-1", output];
}

function fidelityArgs(kind, input, output) {
  if (kind === "image") {
    return ["-y", "-i", input, "-c:v", "libwebp", "-quality", "95", output];
  }
  return ["-y", "-i", input, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", output];
}
```

Archive fallback uses Node `zlib.createDeflateRaw` inside a standards-compliant ZIP writer or the locked `fflate` package. Output paths are produced with `path.parse`, the `-pureshrink` suffix, and collision-safe numbering.

- [ ] **Step 4: Implement Electron shell and cancellation**

Use `dialog.showOpenDialog`, `dialog.showOpenDialog({ properties: ["openDirectory"] })`, `ipcMain.handle`, and an in-memory `Map` of task IDs to child processes. Reject source paths that are not absolute. Sanitize errors before returning them to the renderer. Restrict `will-navigate` and `setWindowOpenHandler` to local files and external HTTPS browser links.

- [ ] **Step 5: Install locked desktop dependencies and verify tests**

Run: `npm install --package-lock-only` in `build/pureshrink-desktop`, then `npm ci`.

Run: `node --test tests/pureshrink-desktop.test.mjs`

Expected: PASS.

- [ ] **Step 6: Build and smoke-test Windows package**

Run: `npm run dist:win` in `build/pureshrink-desktop`.

Run: `node scripts/verify-package.mjs dist windows`.

Expected: the verifier finds a Windows executable, bundled FFmpeg, shared app resources, and package metadata.

- [ ] **Step 7: Commit desktop implementation**

```powershell
git add build/pureshrink-desktop tests/pureshrink-desktop.test.mjs
git commit -m "feat: add PureShrink desktop engine"
```

### Task 4: Cross-platform release workflow

**Files:**
- Create: `.github/workflows/build-pureshrink-release.yml`
- Create: `tests/pureshrink-release-workflow.test.mjs`
- Create: `projects/pureshrink/release-notes.md`

**Interfaces:**
- Consumes: desktop scripts from Task 3.
- Produces: `PureShrink-Windows-x64.zip`, `PureShrink-macOS.zip`, and GitHub Release `pureshrink-v1.0.0`.

- [ ] **Step 1: Write failing workflow contract test**

```js
test("release workflow builds on Windows and both macOS architectures", () => {
  const yaml = readFileSync(workflow, "utf8");
  assert.match(yaml, /windows-latest/);
  assert.match(yaml, /macos-13/);
  assert.match(yaml, /macos-14/);
  assert.match(yaml, /pureshrink-v1\.0\.0/);
  assert.match(yaml, /PureShrink-Windows-x64\.zip/);
  assert.match(yaml, /PureShrink-macOS\.zip/);
  assert.match(yaml, /contents:\s*write/);
});
```

- [ ] **Step 2: Run test and confirm missing-workflow failure**

Run: `node --test tests/pureshrink-release-workflow.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement build matrix and release job**

The workflow must:

- run on `workflow_dispatch` and tag `pureshrink-v*`;
- use `windows-latest`, `macos-13` x64, and `macos-14` arm64;
- run `npm ci`, unit tests, platform build, package verifier, and a minimal FFmpeg command;
- upload each platform artifact with retention of 14 days;
- download all artifacts in a Linux release job;
- combine macOS arm64/x64 apps into one ZIP with separate architecture directories;
- calculate SHA-256 and byte counts;
- publish assets with `gh release create` or `gh release upload --clobber`.

- [ ] **Step 4: Run workflow tests and commit**

Run: `node --test tests/pureshrink-release-workflow.test.mjs tests/pureshrink-desktop.test.mjs`

Expected: PASS.

```powershell
git add .github/workflows/build-pureshrink-release.yml projects/pureshrink/release-notes.md tests/pureshrink-release-workflow.test.mjs
git commit -m "ci: build PureShrink desktop releases"
```

### Task 5: Hub registration and publication tests

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`
- Create: `tests/pureshrink-publish.test.mjs`
- Create: `projects/pureshrink/release-manifest.json`

**Interfaces:**
- Consumes: public page and release asset names from Tasks 2–4.
- Produces: final application card with ID `pureshrink`.

- [ ] **Step 1: Write failing Hub tests**

```js
test("PureShrink is the final application with four actions", () => {
  const apps = loadDefaultAppsFromRuntime(readFileSync(runtimePath, "utf8"));
  const item = apps.find((app) => app.id === "pureshrink");
  assert.ok(item);
  assert.equal(apps.filter(isApplication).at(-1)?.id, "pureshrink");
  assert.equal(item.platforms.web, "./projects/pureshrink/index.html");
  assert.equal(item.video, "./projects/pureshrink/video/index.html");
  assert.equal(item.platforms.windows.label, "Wins下载");
  assert.equal(item.platforms.mac.label, "Mac下载");
});
```

- [ ] **Step 2: Run focused Hub test and confirm missing-card failure**

Run: `node --test tests/pureshrink-publish.test.mjs`

Expected: FAIL because the card is not registered.

- [ ] **Step 3: Register the card**

Append after ClickFlow:

```js
{
  id: "pureshrink",
  name: "PureShrink 无损压缩工坊",
  category: "媒体压缩工具",
  status: "desktop",
  badge: "网页 · Windows · macOS",
  brief: "在设备本地批量压缩图片、视频、GIF、音频和一般文件，严格无损默认开启，原件永不覆盖。",
  problem: "媒体资源散落在不同工具中处理，上传等待、隐私风险和误覆盖原件让批量压缩变得低效。",
  aiUse: "AI 参与压缩策略编排、无损边界说明、跨平台执行引擎、自动测试和公开教程制作。",
  folder: "./projects/pureshrink/",
  entry: "./projects/pureshrink/index.html",
  video: "./projects/pureshrink/video/index.html",
  package: "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.0",
  platforms: {
    web: "./projects/pureshrink/index.html",
    windows: {
      href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.0/PureShrink-Windows-x64.zip",
      label: "Wins下载"
    },
    mac: {
      href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.0/PureShrink-macOS.zip",
      label: "Mac下载"
    }
  },
  tags: ["无损压缩", "图片视频", "GIF", "本地处理"],
  speed: 9,
  impact: 9,
  risk: 9,
  polish: 9
}
```

Change the index cache query to `v=20260730-pureshrink`.

- [ ] **Step 4: Verify focused and shared card tests**

Run: `node --test tests/pureshrink-publish.test.mjs tests/default-apps-helper.test.mjs tests/card-action-layout.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Hub integration**

```powershell
git add app-20260706-restore-games.js index.html projects/pureshrink/release-manifest.json tests/pureshrink-publish.test.mjs
git commit -m "feat: add PureShrink to application hub"
```

### Task 6: Tutorial video and unified player

**Files:**
- Create: `projects/pureshrink/video/index.html`
- Create: `projects/pureshrink/video/pureshrink-demo.vtt`
- Create: `projects/pureshrink/video/tutorial-script.md`
- Create: `scripts/render-pureshrink-video.mjs`
- Create: `tests/pureshrink-video.test.mjs`
- Generate: `projects/pureshrink/video/pureshrink-demo.mp4`
- Generate: `projects/pureshrink/video/poster.jpg`

**Interfaces:**
- Consumes: shared Hub video CSS/JavaScript and working PureShrink page.
- Produces: H.264 1280×720 tutorial under 90 seconds with non-overlapping single-line subtitles.

- [ ] **Step 1: Write failing video contract tests**

```js
test("PureShrink video page uses the shared player and safe captions", async () => {
  const html = readFileSync(video("index.html"), "utf8");
  const captions = readFileSync(video("pureshrink-demo.vtt"), "utf8");
  assert.match(html, /hub-video-player\.css/);
  assert.match(html, /hub-video-player\.js/);
  assert.match(html, /pureshrink-demo\.mp4/);
  assert.match(html, /kind="captions"/);
  assert.equal(captions.split(/\r?\n/).filter((line) => line && !line.includes("-->") && line !== "WEBVTT").every((line) => line.length <= 32), true);
  const media = await inspectMedia(video("pureshrink-demo.mp4"));
  assert.equal(media.videoCodec, "h264");
  assert.ok(media.duration <= 240);
});
```

- [ ] **Step 2: Implement tutorial storyboard and renderer**

The script captures these six chapters:

1. privacy promise and drag/drop;
2. strict lossless versus high fidelity;
3. mixed image/GIF/video queue;
4. per-file progress and strategy;
5. output sizes, kept-original behavior, and batch download;
6. Windows/macOS desktop recommendation for large files.

Every caption is one Chinese line of at most 32 characters. The renderer uses Playwright screenshots and the repository-locked `ffmpeg-static` to encode H.264 `yuv420p` at 1280×720.

- [ ] **Step 3: Generate media and inspect it**

Run: `node scripts/render-pureshrink-video.mjs`

Run: `node --test tests/pureshrink-video.test.mjs`

Expected: PASS with H.264, duration below 90 seconds, and no overlapping cues.

- [ ] **Step 4: Commit the tutorial**

```powershell
git add projects/pureshrink/video scripts/render-pureshrink-video.mjs tests/pureshrink-video.test.mjs
git commit -m "feat: add PureShrink tutorial video"
```

### Task 7: Full validation, release, Pages deployment, and public proof

**Files:**
- Update: `projects/pureshrink/release-manifest.json`
- Update: `projects/pureshrink/README.md`
- Create: `tests/pureshrink-browser-smoke.mjs`

**Interfaces:**
- Consumes all prior tasks.
- Produces final release hashes, public URLs, Pages deployment, and validation evidence.

- [ ] **Step 1: Add local desktop/mobile browser smoke**

Use Playwright at `1440×900` and `390×844`. Verify no horizontal overflow, no page/console/request errors, correct default mode, drag/drop affordance, mode copy, queue state transitions with deterministic engine stubs, and enabled keyboard focus.

- [ ] **Step 2: Run the complete local gate**

Run:

```powershell
npm ci
$env:FFMPEG_PATH=(node -e "process.stdout.write(require('ffmpeg-static'))")
node --test tests/*.test.mjs
node tests/pureshrink-browser-smoke.mjs
git diff --check
```

Expected: all applicable tests pass; Windows symlink-only conditional skips are reported but not treated as failures.

- [ ] **Step 3: Rebase onto latest remote main and push the feature branch**

Run:

```powershell
git fetch origin main
git rebase origin/main
git push -u origin agent/pureshrink-lossless-compressor
```

Expected: fast, non-forced push.

- [ ] **Step 4: Merge to main and trigger desktop release**

Create and merge the publication change through GitHub, then tag the exact merged commit:

```powershell
git switch main
git pull --ff-only origin main
git tag -a pureshrink-v1.0.0 -m "PureShrink v1.0.0"
git push origin pureshrink-v1.0.0
```

Wait for `.github/workflows/build-pureshrink-release.yml` to succeed on all three platform runners.

- [ ] **Step 5: Download and verify release assets**

Download both release assets, calculate local byte counts and SHA-256, unzip each, verify Windows EXE, macOS arm64/x64 apps, bundled FFmpeg, README, and minimum processing proof. Update `release-manifest.json` with the exact observed values, commit to `main`, and push with no force.

- [ ] **Step 6: Wait for Pages and perform public validation**

Verify:

- Hub home and `#apps`;
- `projects/pureshrink/index.html`;
- `projects/pureshrink/video/index.html`;
- MP4 Range request and real playback progress;
- both Release download URLs;
- application card uniqueness, final position, and four-action order;
- desktop and 390 px layouts;
- browser console, page, HTTP, and request errors;
- public commit content equals the final `main` SHA.

- [ ] **Step 7: Record release evidence and commit**

Add exact release bytes, SHA-256, workflow runs, final main SHA, video duration, and public verification results to `projects/pureshrink/README.md` and `release-manifest.json`.

```powershell
git add projects/pureshrink/README.md projects/pureshrink/release-manifest.json
git commit -m "docs: record PureShrink release evidence"
git push origin main
```

Expected: the final Pages workflow succeeds for the evidence commit and all public links remain valid.
