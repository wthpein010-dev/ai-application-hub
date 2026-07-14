# Minigame Subpage Shell Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one “小游戏立项工具” subpage pilot with a unified top-left home button and the homepage background visual.

**Architecture:** Add a shared CSS shell under `assets/`, then opt the pilot HTML into it with one body class and one native relative home link. Keep the existing app CSS, form markup, JavaScript, and content unchanged; the shared shell loads last and only controls the page background, home button, and collision spacing.

**Tech Stack:** Static HTML/CSS, Node.js built-in test runner, local HTTP server, Chromium/Playwright, GitHub Pages.

## Global Constraints

- The pilot page is `projects/minigame-project-tool/index.html`.
- The home button text is exactly `返回主页` and links to `../../index.html` without a hash.
- Reuse `assets/hero-ai-companion.png`; add no external font, icon CDN, or runtime script.
- Preserve all existing page content, form behavior, download links, video link, and responsive layout.
- Use relative paths that work on GitHub Pages, Windows copies, and macOS copies.
- Do not stage or commit the unrelated deletion of `downloads/fill-what-unity-project.zip`.

---

### Task 1: Add the Shared Subpage Shell Pilot

**Files:**
- Create: `assets/subpage-shell.css`
- Modify: `projects/minigame-project-tool/index.html`
- Modify: `tests/minigame-project-tool-page.test.mjs`

**Interfaces:**
- Consumes: `assets/hero-ai-companion.png` and the pilot page's existing `.topbar`, `.brand`, and `.top-actions` classes.
- Produces: `.hub-subpage`, `.hub-home-link`, and `.hub-home-link__icon`, reusable by later app, video, and game pages.

- [ ] **Step 1: Write the failing shell test**

Extend the `node:fs` import and add this test to `tests/minigame-project-tool-page.test.mjs`:

```js
import { existsSync, readFileSync } from "node:fs";

test("web demo uses the shared subpage shell and one root home link", () => {
  const html = readFileSync(join(project, "index.html"), "utf8");
  const shellPath = join(root, "assets", "subpage-shell.css");

  assert.equal(existsSync(shellPath), true, "shared subpage shell should exist");
  const shellCss = readFileSync(shellPath, "utf8");

  assert.match(html, /<body class="hub-subpage">/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/subpage-shell\.css"/);
  assert.equal((html.match(/class="hub-home-link"/g) || []).length, 1);
  assert.match(html, /<a class="hub-home-link" href="\.\.\/\.\.\/index\.html" aria-label="返回主页">/);
  assert.match(html, /<span class="hub-home-link__icon" aria-hidden="true">←<\/span>/);
  assert.doesNotMatch(html, /<a class="home-link"/);
  assert.doesNotMatch(html, /class="brand" href="\.\.\/\.\.\/index\.html"/);
  assert.match(shellCss, /url\("\.\/hero-ai-companion\.png"\)/);
  assert.match(shellCss, /min-height:\s*42px/);
  assert.match(shellCss, /env\(safe-area-inset-top/);
});
```

- [ ] **Step 2: Run the targeted test and confirm the expected failure**

Run:

```powershell
node --test tests/minigame-project-tool-page.test.mjs
```

Expected: the new test fails because `assets/subpage-shell.css` does not exist.

- [ ] **Step 3: Create the shared shell stylesheet**

Create `assets/subpage-shell.css` with:

```css
body.hub-subpage {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  background: #07101e;
}

body.hub-subpage::before,
body.hub-subpage::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
}

body.hub-subpage::before {
  z-index: -2;
  background: url("./hero-ai-companion.png") right center / cover no-repeat;
  opacity: 0.2;
}

body.hub-subpage::after {
  z-index: -1;
  background: rgba(5, 10, 18, 0.78);
}

.hub-home-link {
  position: fixed;
  top: max(15px, env(safe-area-inset-top));
  left: max(18px, env(safe-area-inset-left));
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 130px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(224, 235, 248, 0.28);
  border-radius: 8px;
  color: #f7f9fc;
  text-decoration: none;
  font: 800 14px/1 "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
  background: rgba(9, 17, 29, 0.86);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(14px);
}

.hub-home-link:hover {
  border-color: rgba(95, 224, 211, 0.7);
  background: rgba(20, 38, 59, 0.96);
}

.hub-home-link:focus-visible {
  outline: 3px solid rgba(107, 164, 255, 0.52);
  outline-offset: 3px;
}

.hub-home-link__icon {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  flex: 0 0 20px;
  font-size: 20px;
  line-height: 20px;
}

.hub-subpage .topbar {
  padding-left: max(172px, calc(env(safe-area-inset-left) + 172px));
}

@media (max-width: 760px) {
  .hub-home-link {
    position: absolute;
    right: max(14px, env(safe-area-inset-right));
    left: max(14px, env(safe-area-inset-left));
    width: max-content;
  }

  .hub-subpage .topbar {
    padding-top: calc(max(15px, env(safe-area-inset-top)) + 56px);
    padding-left: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hub-home-link {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 4: Opt the pilot HTML into the shared shell**

Load the shared CSS after the existing app CSS:

```html
<link rel="stylesheet" href="../../assets/subpage-shell.css" />
```

Change the body opening and insert the single shared link:

```html
<body class="hub-subpage">
  <a class="hub-home-link" href="../../index.html" aria-label="返回主页">
    <span class="hub-home-link__icon" aria-hidden="true">←</span>
    <span>返回主页</span>
  </a>
```

Change the linked brand to a non-linking container while preserving its children:

```html
<div class="brand">
  <span class="brand-mark" aria-hidden="true">立</span>
  <span><strong>小游戏立项工具</strong><small>Game Brief Studio · Web</small></span>
</div>
```

Remove only this duplicate navigation item:

```html
<a class="home-link" href="../../index.html">返回主页</a>
```

- [ ] **Step 5: Run targeted and related tests**

Run:

```powershell
node --test tests/minigame-project-tool-page.test.mjs tests/minigame-project-tool-core.test.mjs tests/minigame-project-simulator.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 6: Commit the pilot implementation**

```powershell
git add -- assets/subpage-shell.css projects/minigame-project-tool/index.html tests/minigame-project-tool-page.test.mjs docs/superpowers/specs/2026-07-14-unified-subpage-shell-design.md docs/superpowers/plans/2026-07-14-minigame-subpage-shell-pilot.md
git diff --cached --check
git commit -m "feat: add unified subpage shell pilot"
```

### Task 2: Verify and Publish the Pilot

**Files:**
- Verify: `projects/minigame-project-tool/index.html`
- Verify: `assets/subpage-shell.css`

**Interfaces:**
- Consumes: the static pilot produced by Task 1.
- Produces: a verified GitHub Pages URL for user review.

- [ ] **Step 1: Start a local static server**

Run from the repository root:

```powershell
python -m http.server 4176 --bind 127.0.0.1
```

Expected: `http://127.0.0.1:4176/projects/minigame-project-tool/index.html` returns HTTP 200.

- [ ] **Step 2: Verify desktop and mobile rendering**

Open the pilot at 1440×1000 and 390×844. Confirm:

- exactly one `返回主页` control is visible;
- the arrow is centered and the control does not overlap the brand or mobile navigation;
- the homepage AI background is visible but does not reduce text or form contrast;
- no horizontal overflow is present;
- clicking the control reaches `/index.html`.

- [ ] **Step 3: Run final automated verification**

```powershell
node --test tests/minigame-project-tool-page.test.mjs tests/minigame-project-tool-core.test.mjs tests/minigame-project-simulator.test.mjs
git diff --check HEAD^ HEAD
git status --short
```

Expected: tests have zero failures; the only unrelated worktree state remains the pre-existing deletion of `downloads/fill-what-unity-project.zip`.

- [ ] **Step 4: Push and verify GitHub Pages**

```powershell
git push origin main
```

Poll this URL with the commit hash as a cache buster until it contains `hub-home-link` and returns HTTP 200:

```text
https://wthpein010-dev.github.io/ai-application-hub/projects/minigame-project-tool/index.html?v=<commit>
```

- [ ] **Step 5: Open the verified live page**

Open the cache-busted GitHub Pages URL in the user's browser for visual review.
