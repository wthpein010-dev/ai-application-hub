# Web Media Collector Tutorial Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a Chinese-caption MP4 tutorial and a lazy-loading player page for the Web Media Collector card in the AI application hub.

**Architecture:** Generate six 16:9 instructional frames in a temporary workspace with Pillow, render them into an H.264 MP4 with FFmpeg, and keep only the compressed MP4 in the project. The active hub runtime script exposes a `video` field; its existing generic card action opens a dedicated player page that attaches the MP4 source only after a viewer action.

**Tech Stack:** Node.js built-in test runner, Python Pillow, FFmpeg 4.4.5 with libx264, static HTML/CSS/JavaScript, GitHub Pages.

## Global Constraints

- Use an H.264 MP4 in a 16:9 1280x720 frame for Windows, macOS, and browser playback.
- Use Chinese on-screen captions only; no narration or external media assets.
- Keep the player page light and defer MP4 loading until the viewer presses Play.
- Describe only publicly accessible web-resource scanning; do not imply bypassing authentication, payment, DRM, or site permissions.
- Do not stage or modify unrelated working-tree changes.

---

### Task 1: Add the regression contract

**Files:**
- Modify: `tests/web-media-collector-page.test.mjs`
- Modify: `app-20260706-restore-games.js:195-209,1032-1041`

**Interfaces:**
- Consumes: the home page's runtime script path from `index.html`.
- Produces: a `web-media-collector` object with `video` equal to `./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/演示视频.html`.

- [ ] **Step 1: Write the failing test**

```js
const videoPath = join(project, "视频资源", "web-media-collector-tutorial.mp4");
const playerPath = join(project, "视频资源", "演示视频.html");

test("web media collector publishes a tutorial player and MP4", () => {
  assert.equal(existsSync(playerPath), true);
  assert.equal(existsSync(videoPath), true);
  assert.match(app, /id: "web-media-collector",[\s\S]{0,1400}video: "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/视频资源\/演示视频\.html"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests\\web-media-collector-page.test.mjs`

Expected: FAIL because the runtime app has no video route and the tutorial files do not exist.

- [ ] **Step 3: Add the runtime video route**

```js
video: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/演示视频.html",
```

Place the property after `entry` in the default app, and set the same value in the `normalized.id === "web-media-collector"` branch so saved browser data is migrated.

- [ ] **Step 4: Re-run the test after Tasks 2 and 3**

Run: `node --test tests\\web-media-collector-page.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the tested route with the player assets**

```powershell
git add -- app-20260706-restore-games.js tests/web-media-collector-page.test.mjs "projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源"
git commit -m "feat: add media collector tutorial video"
```

### Task 2: Generate the MP4 tutorial

**Files:**
- Create: `projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/web-media-collector-tutorial.mp4`

**Interfaces:**
- Consumes: the five-step functional sequence in `docs/superpowers/specs/2026-07-14-web-media-collector-video-design.md`.
- Produces: a playable H.264 1280x720 MP4 of approximately 50 seconds.

- [ ] **Step 1: Create six temporary 1280x720 frames with Pillow**

Use the bundled Python executable and `C:\\Windows\\Fonts\\msyh.ttc`. Render dark desktop-tool scenes with the following captions: `网页素材一键收桌面版`, `输入公开网页地址`, `扫描图片、视频、音频与文档`, `筛选、预览、勾选素材`, `加入下载队列`, and `Windows / macOS 均可从源码包运行`. Write the frames to a temporary directory outside the repository.

- [ ] **Step 2: Render an H.264 MP4**

Run FFmpeg from `C:\\Users\\ASUS\\AppData\\Local\\kzip_sogou\\ffmpeg.exe` with a 25 fps input, six scenes of about eight seconds each, `libx264`, `yuv420p`, `crf 25`, `-movflags +faststart`, and no audio. Output the MP4 at the exact Task 2 path.

- [ ] **Step 3: Validate the MP4 container and stream**

Run:

```powershell
& 'C:\Users\ASUS\AppData\Local\kzip_sogou\ffmpeg.exe' -i "projects\朋友圈发图神器\01_作品体验入口\网页素材一键收桌面版\视频资源\web-media-collector-tutorial.mp4" -f null -
```

Expected: FFmpeg reports an H.264 video stream, 1280x720 dimensions, a duration near 48 seconds, and exits with code 0.

### Task 3: Replace the placeholder with a player page

**Files:**
- Modify: `projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/演示视频占位.html`
- Create: `projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/演示视频.html`

**Interfaces:**
- Consumes: `web-media-collector-tutorial.mp4` from Task 2.
- Produces: a static player page with a `#loadVideo` action and a `#introVideo` element whose source is assigned after interaction.

- [ ] **Step 1: Create the player page**

Use a responsive 16:9 `video` element with `preload="none"` and `data-src="./web-media-collector-tutorial.mp4"`. Add one button labeled `加载并播放视频`, a direct MP4 link, an `打开工具说明` link to `../index.html`, and a `返回全部项目总览` link to `../../../../../index.html#apps`.

- [ ] **Step 2: Implement lazy loading**

```js
const button = document.querySelector("#loadVideo");
const video = document.querySelector("#introVideo");
button.addEventListener("click", () => {
  if (!video.src) video.src = video.dataset.src;
  video.style.display = "block";
  button.closest(".load-card").style.display = "none";
  video.play().catch(() => video.load());
});
```

- [ ] **Step 3: Update the placeholder page**

Replace its immediate redirect with a compact link to `./演示视频.html` so old bookmarked placeholder URLs remain useful.

- [ ] **Step 4: Validate the player source**

Run: `node --test tests\\web-media-collector-page.test.mjs`

Expected: PASS with the player and MP4 asset present.

### Task 4: Publish and verify GitHub Pages

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: the updated runtime script and player page.
- Produces: a new cache version for the home script and a public player URL.

- [ ] **Step 1: Bump the runtime script query version**

Update the `app-20260706-restore-games.js` query version in `index.html` to `v=20260714-web-media-collector-video`.

- [ ] **Step 2: Run the full verification set**

Run:

```powershell
node --test tests\web-media-collector-page.test.mjs tests\planner-daily-quiz-admin-question-bank.test.mjs
node --check app-20260706-restore-games.js
git diff --check
```

Expected: all five tests pass, syntax check exits 0, and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Commit and push the cache update**

```powershell
git add -- index.html
git commit -m "fix: refresh hub for media collector video"
git push origin main
```

- [ ] **Step 4: Verify the public responses**

Check that the hub runtime script contains the player route, the player page returns `text/html`, and the MP4 returns a successful `video/mp4` response.
