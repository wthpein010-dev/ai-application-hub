# Unified Video Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 21 Hub tutorial video pages share one responsive 16:9 player, visual system, lazy loading behavior, and fixed Return Home action.

**Architecture:** Root CSS and JavaScript assets define the visual and behavior contract. A Node generator reads published Hub metadata and every page's existing media references, then rewrites only the 21 declared video pages to a shared static shell. Generated pages keep relative media URLs and work from GitHub Pages or a copied local Hub folder.

**Tech Stack:** Static HTML/CSS, browser HTML5 video APIs, Node.js built-ins, `node:test`, Playwright.

## Global Constraints

- Keep existing MP4, VTT, poster, card video URL, project demo URL, and download URL unchanged.
- The fixed top-left Return Home action resolves to root `index.html` without a hash.
- The player stage is responsive 16:9 and at most 960px wide; portrait media is letterboxed with `object-fit: contain`.
- Do not set `video.src` until a visitor selects load/play or a chapter.
- Use static relative paths; no server feature, external dependency, or platform-specific behavior is allowed.
- The same pages must work in current Windows and macOS browsers.

---

### Task 1: Add the shared-player contract test

**Files:**
- Modify: `tests/project-video-coverage.test.mjs`
- Test: `tests/project-video-coverage.test.mjs`

**Interfaces:**
- Consumes: `defaultApps` from `app-20260706-restore-games.js` and each `app.video`.
- Produces: a regression gate for shared CSS/JS assets, standard page markup, stage, lazy source, and home link.

- [ ] **Step 1: Write the failing test**

Import `relative` and `sep` from `node:path`, add an `escapeRegExp(value)` helper, then add:

```js
test("every video page follows the shared Hub player contract", () => {
  assert.equal(existsSync(join(root, "assets", "hub-video-player.css")), true);
  assert.equal(existsSync(join(root, "assets", "hub-video-player.js")), true);

  for (const app of loadDefaultApps()) {
    const pagePath = join(root, ...app.video.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    const relativeRoot = relative(dirname(pagePath), root).replaceAll(sep, "/") || ".";
    assert.match(html, /data-hub-video-page/);
    assert.match(html, /class="hub-video-home"/);
    assert.match(html, new RegExp(`href="${escapeRegExp(`${relativeRoot}/index.html`)}"`));
    assert.match(html, /class="hub-video-stage"/);
    assert.match(html, /<video[^>]+preload="none"[^>]+data-src=/);
    assert.match(html, /assets\/hub-video-player\.css/);
    assert.match(html, /assets\/hub-video-player\.js/);
  }
});
```

- [ ] **Step 2: Run the test to verify red**

Run: `node --test tests/project-video-coverage.test.mjs`

Expected: FAIL because the shared assets do not exist.

- [ ] **Step 3: Commit the regression test**

```powershell
git add tests/project-video-coverage.test.mjs
git commit -m "test: require shared video player contract"
```

### Task 2: Implement shared visual and behavior assets

**Files:**
- Create: `assets/hub-video-player.css`
- Create: `assets/hub-video-player.js`
- Test: `tests/project-video-coverage.test.mjs`

**Interfaces:**
- Consumes: `body[data-hub-video-page]`, `.hub-video-stage`, `#introVideo[data-src]`, `#loadVideo`, `#loadCard`, and optional `[data-time]` buttons.
- Produces: fixed home placement, responsive stage, lazy media attachment, playback, chapter seeking, and retry UI after media errors.

- [ ] **Step 1: Add CSS for the common player**

Use charcoal `#0d1218`, panel `#151d26`, line `#2c3947`, text `#f3f6f8`, muted `#a5b2bd`, teal action `#2fd3bd`, 8px radii, and no decorative gradients. Include:

```css
.hub-video-stage {
  position: relative;
  width: min(960px, 100%);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--hub-video-line);
  border-radius: 8px;
  background: #000;
}
.hub-video-stage video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
```

Style the 40px fixed home action, overlay, controls, action links, chapters, keyboard focus, and a `max-width: 600px` layout without viewport-scaled font sizes.

- [ ] **Step 2: Add the JavaScript behavior**

Create a module that validates elements and uses:

```js
function revealVideo() {
  if (!video?.dataset.src) return false;
  if (!video.src) {
    video.src = video.dataset.src;
    video.load();
  }
  loadCard.hidden = true;
  video.hidden = false;
  return true;
}
```

The load action calls `revealVideo()` then `video.play()`. A chapter waits for `loadedmetadata` before setting `currentTime`. A media error restores the overlay, changes the button to retry wording, and leaves the original `data-src` unchanged.

- [ ] **Step 3: Run the focused test**

Run: `node --test tests/project-video-coverage.test.mjs`

Expected: FAIL because pages have not adopted the contract.

### Task 3: Generate 21 static pages from one template

**Files:**
- Create: `scripts/standardize-hub-video-pages.mjs`
- Modify: the 21 `app.video` paths declared in `app-20260706-restore-games.js`
- Test: `tests/project-video-coverage.test.mjs`

**Interfaces:**
- Consumes: each app's id, name, brief, video path, existing `data-src`, optional poster, optional caption track, and optional chapter buttons.
- Produces: ASCII-safe static HTML referencing the shared player assets while retaining existing media references.

- [ ] **Step 1: Implement metadata and media extraction**

Evaluate only the `defaultApps` declaration in a VM. For each video page extract:

```js
const source = existingHtml.match(/data-src=["']([^"']+\.mp4)["']/)?.[1];
const poster = existingHtml.match(/poster=["']([^"']+)["']/)?.[1] || "";
const track = existingHtml.match(/<track\b[\s\S]*?>/)?.[0] || "";
const chapters = [...existingHtml.matchAll(/<button\b[^>]*data-time=["'][^"']+["'][^>]*>[\s\S]*?<\/button>/g)];
```

Throw when a page has no MP4 source. Convert displayed project text to numeric HTML entities. Compute the relative Hub root with `relative(dirname(pagePath), root).replaceAll(sep, "/") || "."`.

- [ ] **Step 2: Implement the page template**

Every output must contain:

```html
<body data-hub-video-page>
  <a class="hub-video-home" href="ROOT/index.html">&#36820;&#22238;&#20027;&#39029;</a>
  <main class="hub-video-page">
    <h1>PROJECT_NAME</h1>
    <p class="hub-video-description">PROJECT_BRIEF</p>
    <section class="hub-video-player">
      <div class="hub-video-stage">
        <div class="hub-video-load-card" id="loadCard">
          <button id="loadVideo" type="button">&#21152;&#36733;&#24182;&#25773;&#25918;&#35270;&#39057;</button>
        </div>
        <video id="introVideo" controls playsinline preload="none" data-src="VIDEO_SOURCE" hidden>TRACK</video>
      </div>
    </section>
    <section class="hub-video-chapters">CHAPTERS</section>
  </main>
  <script type="module" src="ROOT/assets/hub-video-player.js"></script>
</body>
```

The head links `ROOT/assets/hub-video-player.css`. Normalize extracted chapter buttons to `class="hub-video-chapter"`, preserving their `data-time` and inner content.

- [ ] **Step 3: Run generator and green test**

Run:

```powershell
node scripts/standardize-hub-video-pages.mjs
node --test tests/project-video-coverage.test.mjs
```

Expected: generator reports exactly 21 pages; both coverage tests PASS.

- [ ] **Step 4: Commit feature implementation**

```powershell
git add assets/hub-video-player.css assets/hub-video-player.js scripts/standardize-hub-video-pages.mjs tests/project-video-coverage.test.mjs projects videos
git commit -m "feat: unify Hub tutorial video pages"
```

### Task 4: Browser and cross-platform verification

**Files:**
- Create: `tests/hub-video-pages-browser-smoke.mjs`
- Test: `tests/hub-video-pages-browser-smoke.mjs`

**Interfaces:**
- Consumes: a local static URL, the 21 card paths, Playwright Chromium, and the player contract.
- Produces: desktop/mobile evidence for no overflow, correct home link, stable stage geometry, and representative playback.

- [ ] **Step 1: Write browser smoke test**

Use a local static server. At `1440x900` and `390x844`, assert every page has a top-left home link, stage width no more than 960px on desktop, ratio within `0.01` of `16 / 9`, `scrollWidth <= innerWidth`, and no console errors. Click load/play on one landscape and one portrait page; assert `currentSrc` is set and `currentTime` advances.

- [ ] **Step 2: Run browser and existing tests**

Run:

```powershell
node tests/hub-video-pages-browser-smoke.mjs
node --test tests/project-video-coverage.test.mjs tests/minigame-project-tool-video.test.mjs tests/gamepulse-video.test.mjs tests/paws-level-editor-video.test.mjs
```

Expected: PASS with no overflow or console errors. Set `FFMPEG_PATH` only if the existing media tests require it.

- [ ] **Step 3: Commit smoke coverage**

```powershell
git add tests/hub-video-pages-browser-smoke.mjs
git commit -m "test: smoke test unified video pages"
```

### Task 5: Publish and record verification

**Files:**
- Modify: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/AI-Application-Hub.md`

**Interfaces:**
- Consumes: final commits, SSH write access, the Pages deployment, and public URLs.
- Produces: published `main` and a durable record of the shared 21-page player contract.

- [ ] **Step 1: Recheck remote and update scope**

Run `git ls-remote origin main`, `ssh -T git@github.com`, and `git fetch origin main`. Rebase the feature branch onto latest `origin/main`; resolve only files changed by this feature.

- [ ] **Step 2: Publish and verify**

Push scoped commits to `origin/main`, wait for Pages, then open the public Hub and representative video pages. Verify the video card target, top-left home action, explicit source load, and desktop/mobile layout.

- [ ] **Step 3: Update project memory**

Record final SHA, Pages result, shared asset paths, scope of 21 pages, and verification evidence. Do not record credentials, private keys, cookies, or tokens.

