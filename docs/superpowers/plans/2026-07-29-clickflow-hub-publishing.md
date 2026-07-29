# ClickFlow Hub Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish ClickFlow in the AI Application Hub with a safe interactive guide, tutorial video, expanded instructions, and verified Windows/macOS downloads.

**Architecture:** Add one `clickflow` catalog object to the Hub runtime, keep the public experience in an isolated `projects/clickflow` directory, and keep reproducible desktop build inputs in `build/clickflow`. GitHub Actions builds and validates native macOS apps, while GitHub Release assets provide stable download URLs.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js test runner, Playwright, ffmpeg/H.264, Python 3.13, Tkinter, pynput, PyInstaller, GitHub Actions, GitHub Releases, GitHub Pages.

## Global Constraints

- Append ClickFlow at the end of the application collection without reordering existing projects.
- Card buttons are exactly `演示 / 视频 / Wins下载 / Mac下载`.
- Tutorial video is 1280×720 H.264, shorter than four minutes, and shows one caption line at a time.
- The public guide never controls the visitor's operating-system mouse.
- Windows and macOS downloads are runnable products, not source placeholders.
- Do not move or click the user's physical mouse while producing the tutorial.
- Publish to `wthpein010-dev/ai-application-hub` and verify the public GitHub Pages site.

---

### Task 1: Catalog and guide contract

**Files:**
- Create: `tests/clickflow-publish.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`
- Create: `projects/clickflow/index.html`
- Create: `projects/clickflow/styles.css`
- Create: `projects/clickflow/app.js`
- Create: `projects/clickflow/README.md`
- Modify: `tests/project-video-coverage.test.mjs`

**Interfaces:**
- Consumes: the Hub `defaultApps` array and shared `assets/subpage-shell.css`.
- Produces: project id `clickflow`, page-local controls with `data-mode`, `data-action`, and `data-status` attributes, and release URLs under tag `clickflow-v2.0.0`.

- [ ] **Step 1: Write the failing catalog and guide test**

```js
test("ClickFlow is the final application and exposes four ordered actions", () => {
  const apps = loadDefaultApps();
  const clickFlow = apps.find((app) => app.id === "clickflow");
  assert.equal(apps.filter(isApplication).at(-1)?.id, "clickflow");
  assert.equal(clickFlow.video, "./projects/clickflow/video/index.html");
  assert.equal(clickFlow.platforms.web, "./projects/clickflow/index.html");
  assert.match(clickFlow.platforms.windows.href, /clickflow-v2\.0\.0\/ClickFlow-Windows-x64\.zip$/);
  assert.match(clickFlow.platforms.mac.href, /clickflow-v2\.0\.0\/ClickFlow-macOS\.zip$/);
});

test("ClickFlow guide documents both modes, shortcuts, permissions, and cursor limits", () => {
  const html = readFileSync(project("index.html"), "utf8");
  assert.match(html, /定点点击/);
  assert.match(html, /录制回放/);
  assert.match(html, /F6/);
  assert.match(html, /F9/);
  assert.match(html, /辅助功能/);
  assert.match(html, /输入监控/);
  assert.match(html, /点击瞬间/);
});
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `node --test tests/clickflow-publish.test.mjs`

Expected: FAIL because the ClickFlow catalog entry and project page do not exist.

- [ ] **Step 3: Implement the catalog entry and safe interactive guide**

Append one `status: "desktop"` object to `defaultApps`. Build the guide with local-only UI state:

```js
const state = { mode: "point", running: false, recording: false, steps: [] };

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.modePanel !== mode;
  });
}
```

Use release asset objects:

```js
platforms: {
  web: "./projects/clickflow/index.html",
  windows: {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-Windows-x64.zip",
    label: "Wins下载"
  },
  mac: {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-macOS.zip",
    label: "Mac下载"
  }
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `node --test tests/clickflow-publish.test.mjs tests/card-action-layout.test.mjs tests/project-video-coverage.test.mjs`

Expected: both test files pass.

- [ ] **Step 5: Commit the catalog and guide**

```powershell
git add app-20260706-restore-games.js index.html projects/clickflow tests/clickflow-publish.test.mjs
git commit -m "feat: add ClickFlow Hub guide"
```

### Task 2: Reproducible desktop build inputs

**Files:**
- Create: `build/clickflow/auto_clicker.py`
- Create: `build/clickflow/clickflow_core.py`
- Create: `build/clickflow/clickflow_input.py`
- Create: `build/clickflow/clickflow_theme.py`
- Create: `build/clickflow/ClickFlow.spec`
- Create: `build/clickflow/requirements.txt`
- Create: `build/clickflow/requirements-build.txt`
- Create: `build/clickflow/scripts/build_macos.sh`
- Create: `build/clickflow/tests/*.py`
- Create: `.github/workflows/build-clickflow-macos.yml`
- Create: `tests/clickflow-packaging.test.mjs`

**Interfaces:**
- Consumes: the verified local ClickFlow 2.0 source snapshot.
- Produces: two native `ClickFlow.app` artifacts and one combined `ClickFlow-macOS.zip` workflow artifact.

- [ ] **Step 1: Write the failing build contract test**

```js
test("ClickFlow macOS workflow builds and verifies both architectures", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "build-clickflow-macos.yml"), "utf8");
  assert.match(workflow, /macos-14/);
  assert.match(workflow, /macos-15-intel/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /ClickFlow-macOS\.zip/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
```

- [ ] **Step 2: Run the packaging test and confirm the expected failure**

Run: `node --test tests/clickflow-packaging.test.mjs`

Expected: FAIL because the workflow and source snapshot do not exist.

- [ ] **Step 3: Copy the source snapshot and implement the macOS workflow**

Copy only source, requirements, spec, scripts, and tests. Exclude `.venv*`, `build`, `dist`, `release`, and `__pycache__`.

The build job must run:

```bash
python -m py_compile auto_clicker.py clickflow_core.py clickflow_input.py clickflow_theme.py
python -m unittest discover -s tests -v
bash scripts/build_macos.sh
codesign --deep --force --sign - dist/ClickFlow.app
codesign --verify --deep --strict dist/ClickFlow.app
file dist/ClickFlow.app/Contents/MacOS/ClickFlow
```

- [ ] **Step 4: Run Python and packaging tests**

Run:

```powershell
python -m unittest discover -s build/clickflow/tests -v
node --test tests/clickflow-packaging.test.mjs
```

Expected: 51 Python tests and the Node packaging tests pass.

- [ ] **Step 5: Commit build inputs**

```powershell
git add .github/workflows/build-clickflow-macos.yml build/clickflow tests/clickflow-packaging.test.mjs
git commit -m "build: add verified ClickFlow macOS pipeline"
```

### Task 3: Tutorial video and shared player

**Files:**
- Create: `scripts/render-clickflow-video.mjs`
- Create: `projects/clickflow/video/index.html`
- Create: `projects/clickflow/video/clickflow-demo.vtt`
- Create: `projects/clickflow/video/tutorial-script.md`
- Create: `projects/clickflow/video/poster.jpg`
- Create: `projects/clickflow/video/clickflow-demo.mp4`
- Create: `tests/clickflow-video.test.mjs`

**Interfaces:**
- Consumes: Playwright and `FFMPEG_PATH`.
- Produces: deterministic 1280×720 H.264 video, JPEG poster, single-line WebVTT captions, and shared lazy-player page.

- [ ] **Step 1: Write the failing video contract test**

```js
test("ClickFlow tutorial is decodable 720p H.264 with one-line captions", () => {
  const media = inspectMedia(join(videoRoot, "clickflow-demo.mp4"));
  assert.deepEqual([media.videoCodec, media.width, media.height], ["h264", 1280, 720]);
  assert.ok(media.duration > 30 && media.duration < 240);
  const cues = parseVtt(readFileSync(join(videoRoot, "clickflow-demo.vtt"), "utf8"));
  assert.ok(cues.length >= 5);
  assert.ok(cues.every((cue) => !cue.text.includes("\n")));
  assert.ok(cues.every((cue, index) => index === 0 || cue.start >= cues[index - 1].end));
});
```

- [ ] **Step 2: Run the video test and confirm the expected failure**

Run: `node --test tests/clickflow-video.test.mjs`

Expected: FAIL because the video assets do not exist.

- [ ] **Step 3: Implement deterministic scenes, captions, and video page**

Record five 10-second browser scenes. Convert the Playwright WebM with:

```text
-an -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -r 30
```

The HTML player uses `data-hub-video-page`, `class="hub-video-home"`, `class="hub-video-stage"`, `preload="none"`, `data-src="./clickflow-demo.mp4"`, and the shared Hub CSS/JS.

- [ ] **Step 4: Render and verify the tutorial**

Run:

```powershell
$env:FFMPEG_PATH=(node -e "process.stdout.write(require('ffmpeg-static'))")
node scripts/render-clickflow-video.mjs
node --test tests/clickflow-video.test.mjs
```

Expected: the video test passes and ffmpeg decoding returns exit code 0.

- [ ] **Step 5: Commit video assets**

```powershell
git add scripts/render-clickflow-video.mjs projects/clickflow/video tests/clickflow-video.test.mjs
git commit -m "feat: add ClickFlow tutorial video"
```

### Task 4: Browser and full repository verification

**Files:**
- Create: `tests/clickflow-browser-smoke.mjs`
- Create: `tests/artifacts/clickflow/browser/*`

**Interfaces:**
- Consumes: the local static files and Playwright Chromium.
- Produces: desktop/mobile screenshots and machine assertions for layout, interactions, and video playback.

- [ ] **Step 1: Write the browser smoke test**

```js
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  await page.goto(`${origin}/projects/clickflow/index.html`, { waitUntil: "networkidle" });
  assert.ok(await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth));
  await page.locator('[data-mode="sequence"]').click();
  await page.locator('[data-action="record"]').click();
  await page.locator('[data-action="add-step"]').click();
  assert.equal(await page.locator("[data-step]").count(), 1);
}
```

- [ ] **Step 2: Run the smoke test and fix only observed failures**

Run: `node tests/clickflow-browser-smoke.mjs`

Expected: PASS with no console, page, or request errors.

- [ ] **Step 3: Run focused and full Hub tests**

Run:

```powershell
node --test
node tests/clickflow-browser-smoke.mjs
```

Expected: all included static tests and the ClickFlow browser smoke test pass.

- [ ] **Step 4: Commit browser verification**

```powershell
git add tests/clickflow-browser-smoke.mjs tests/artifacts/clickflow
git commit -m "test: verify ClickFlow public experience"
```

### Task 5: Native packages and GitHub Release

**Files:**
- Create: `projects/clickflow/release-manifest.json`
- Create: `projects/clickflow/release-notes.md`
- Modify: `projects/clickflow/README.md`

**Interfaces:**
- Consumes: local Windows ZIP and macOS Actions artifacts.
- Produces: GitHub Release `clickflow-v2.0.0` and manifest with byte size and SHA-256 for both downloads.

- [ ] **Step 1: Verify and upload the branch**

Run:

```powershell
git status -sb
git diff --check origin/main...HEAD
git push -u origin agent/clickflow-publish
```

- [ ] **Step 2: Wait for and download the macOS workflow artifact**

Run:

```powershell
$runId = gh run list --repo wthpein010-dev/ai-application-hub --workflow build-clickflow-macos.yml --branch agent/clickflow-publish --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --repo wthpein010-dev/ai-application-hub --exit-status
gh run download $runId --repo wthpein010-dev/ai-application-hub --name clickflow-macos-release --dir artifacts/clickflow-macos-release
```

Expected: workflow conclusion `success` and a combined `ClickFlow-macOS.zip`.

- [ ] **Step 3: Verify both final archives**

For Windows, confirm `ClickFlow-Windows-x64/ClickFlow.exe`, run the EXE startup smoke check, and recompute SHA-256.

For macOS, list both:

```text
arm64/ClickFlow.app/Contents/Info.plist
arm64/ClickFlow.app/Contents/MacOS/ClickFlow
x64/ClickFlow.app/Contents/Info.plist
x64/ClickFlow.app/Contents/MacOS/ClickFlow
```

Recompute the macOS ZIP SHA-256 and compare it with the workflow checksum.

- [ ] **Step 4: Add the release manifest and create the release**

Print the exact manifest data from the observed files:

```powershell
$windowsPath = 'C:\Users\ASUS\Documents\AI Project\auto-clicker\release\ClickFlow-Windows-x64.zip'
$macPath = 'artifacts\clickflow-macos-release\ClickFlow-macOS.zip'
$manifest = [ordered]@{
  tag = 'clickflow-v2.0.0'
  assets = [ordered]@{
    windows = [ordered]@{
      name = 'ClickFlow-Windows-x64.zip'
      bytes = (Get-Item -LiteralPath $windowsPath).Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $windowsPath).Hash.ToLowerInvariant()
    }
    mac = [ordered]@{
      name = 'ClickFlow-macOS.zip'
      bytes = (Get-Item -LiteralPath $macPath).Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $macPath).Hash.ToLowerInvariant()
    }
  }
}
$manifest | ConvertTo-Json -Depth 4
```

Apply the printed values to `release-manifest.json`, write release notes to `release-notes.md`, commit both files, push the branch, then run:

```powershell
gh release create clickflow-v2.0.0 --repo wthpein010-dev/ai-application-hub --target agent/clickflow-publish --title "ClickFlow 2.0.0" --notes-file projects/clickflow/release-notes.md 'C:\Users\ASUS\Documents\AI Project\auto-clicker\release\ClickFlow-Windows-x64.zip' 'artifacts\clickflow-macos-release\ClickFlow-macOS.zip'
```

Expected: both release asset URLs return HTTP 200 and their downloaded hashes match the manifest.

### Task 6: Main, Pages, and public acceptance

**Files:**
- Modify only if verification finds a reproducible issue: files already listed above.

**Interfaces:**
- Consumes: verified release assets and the finished publication branch.
- Produces: deployed public ClickFlow card, guide, video, and downloads.

- [ ] **Step 1: Synchronize with current remote main**

Run:

```powershell
git fetch origin main
git rebase origin/main
node --test
node tests/clickflow-browser-smoke.mjs
```

Expected: rebase succeeds without overwriting unrelated work and verification passes.

- [ ] **Step 2: Fast-forward the authoritative main branch**

Run:

```powershell
git push origin HEAD:main
```

- [ ] **Step 3: Wait for Pages**

Use `gh run list` to find the Pages run for the pushed SHA and `gh run watch --exit-status` until it succeeds.

- [ ] **Step 4: Verify the public site**

Check:

- Hub card is the final application card.
- Buttons are `演示 / 视频 / Wins下载 / Mac下载`.
- Desktop and mobile pages have no horizontal overflow or console errors.
- Video loads on click and advances beyond 0.5 seconds with captions enabled.
- Both release assets download, extract, match their recorded hashes, and contain the expected entry programs.
- The public commit SHA includes the ClickFlow publishing commits.

- [ ] **Step 5: Update long-term memory**

Update `ClickFlow.md` and `AI-Application-Hub.md` with the final commit SHA, workflow/run ids, Pages result, release URL, asset sizes, hashes, test counts, and any platform caveats. Do not store credentials.
