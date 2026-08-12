# SimuAI Static Pages Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a reliable SimuAI engineering experience whose GitHub Pages search visibly matches 12 local experiments without attempting a server-only AI request.

**Architecture:** Preserve the six deterministic model engines and twelve validated templates. Add an explicit static/local capability to the resolver, return stable match evidence, and let the browser UI own an accessible search state machine and recommendation cards; integrate the resulting static app into the Hub and its shared video shell.

**Tech Stack:** Native HTML/CSS/ES modules, Node.js test runner, Playwright, SVG charts, FFmpeg/ffprobe, GitHub Actions and GitHub Pages.

## Global Constraints

- GitHub Pages public mode never requests `/api/compile`, stores credentials, or claims remote AI generation.
- High-confidence searches open and highlight the matched experiment; low-confidence searches keep the current experiment and show three explicit recommendations.
- The public catalog entry is `simuai`, named `SimuAI 万物实验室`, with `status: "engineering"`, appended after existing engineering entries.
- The Hub card has only Demo and Video actions and returns to `index.html#engineering`.
- The tutorial is H.264, `1280x720`, shorter than 240 seconds, and every caption cue is a single line.
- Desktop `1440x900` and mobile `390x844` must have no page-level horizontal overflow, console errors, page errors, failed requests, or missing resources.
- Work from the latest `origin/main`, preserve concurrent Hub changes, never force-push, and verify the deployed Pages result before reporting completion.

---

### Task 1: Synchronize the Isolated Release Workspace

**Files:**
- Modify on conflict only: `package.json`
- Materialize: existing Hub source, assets, scripts, tests, and project media through sparse-checkout

**Interfaces:**
- Consumes: clean `feat/simuai` branch at design commit `9553faf`; latest `origin/main`.
- Produces: a clean branch rebased on latest `origin/main` with all SimuAI commits retained and the complete Hub tree available.

- [ ] **Step 1: Record branch provenance and verify there are no uncommitted files**

Run: `git status --short --branch && git merge-base HEAD origin/main && git log --oneline origin/main..HEAD`

Expected: clean status and the fourteen existing SimuAI commits listed.

- [ ] **Step 2: Rebase onto latest main**

Run: `git rebase origin/main`

Expected: successful rebase; if `package.json` conflicts, retain every remote script and dependency and add the three SimuAI scripts plus `ffmpeg-static`/`playwright` only when not already present.

- [ ] **Step 3: Materialize the complete repository without changing tracked files**

Run: `git sparse-checkout disable`

Expected: `assets/`, `scripts/`, all published projects, and all tests are present; `git status --short` remains empty.

- [ ] **Step 4: Install locked dependencies and run the SimuAI baseline**

Run: `npm install && npm run test:simuai`

Expected: package lock remains consistent and the existing 60 SimuAI tests pass with zero failures.

### Task 2: Make Public Resolution Explicitly Static

**Files:**
- Modify: `tests/simuai-compiler.test.mjs`
- Modify: `tests/simuai-template.test.mjs`
- Modify: `projects/simuai/core/matcher.mjs`
- Modify: `projects/simuai/core/resolver.mjs`

**Interfaces:**
- Consumes: `rankExperiments(question, limit)` and the existing optional `compileImpl`.
- Produces: `rankExperiments` candidates with `matchedTerms`; `resolveQuestion(question, { mode: "static" | "proxy", ... })` returning `{ mode, experiment, recommendations, matchedTerms }` without a compile call in `static` mode.

- [ ] **Step 1: Write failing resolver and matcher tests**

Add assertions that `mode: "static"` makes zero compiler calls for an unmatched question, returns `mode: "recommendations"`, preserves three stable candidates, and reports matched terms for a strong result. Add an explicit stable no-match ranking assertion.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test tests/simuai-template.test.mjs tests/simuai-compiler.test.mjs`

Expected: FAIL because the resolver currently calls the compiler for an unmatched question and does not expose the new static result mode.

- [ ] **Step 3: Implement the smallest capability switch**

In `resolveQuestion`, compute matches once, return the strong local match with its evidence, and when `options.mode === "static"` return recommendations immediately. Keep the existing cache/compile behavior only for explicit `mode: "proxy"`; default to static so Pages cannot accidentally probe the API.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `node --test tests/simuai-template.test.mjs tests/simuai-compiler.test.mjs`

Expected: all focused tests pass and proxy-mode tests still prove exactly one compile call.

- [ ] **Step 5: Commit the resolver boundary**

Run: `git add projects/simuai/core/matcher.mjs projects/simuai/core/resolver.mjs tests/simuai-template.test.mjs tests/simuai-compiler.test.mjs && git commit -m "fix: make SimuAI Pages search fully local"`

### Task 3: Build Visible Search Results and Refine the Experiment Stage

**Files:**
- Modify: `tests/simuai-page.test.mjs`
- Modify: `tests/simuai-browser-smoke.mjs`
- Modify: `projects/simuai/index.html`
- Modify: `projects/simuai/app.mjs`
- Modify: `projects/simuai/styles.css`
- Modify: `projects/simuai/README.md`

**Interfaces:**
- Consumes: static resolver result from Task 2.
- Produces: DOM nodes `#searchResults`, `#searchResultSummary`, `#searchRecommendationList`, `#searchCapability`, submit button state, recommendation buttons with `data-recommendation-id`, and stage source labels `内置实验`/`搜索匹配`/`推荐打开`.

- [ ] **Step 1: Write failing page contract tests**

Assert the HTML contains the results region with `aria-live`, the public capability sentence, a fixed `.hub-home-link` to `../../index.html#engineering`, and the application source calls `resolveQuestion(question, { mode: "static" })` and renders recommendation buttons.

- [ ] **Step 2: Write the failing browser scenario**

Change the smoke test so a high-match query opens `game-payback`, shows the matching summary and sends no `/api/compile` request. Then submit `量子香蕉天气`, assert the current experiment is unchanged, exactly three recommendation buttons are visible, select one, and assert the stage source becomes `推荐打开`.

- [ ] **Step 3: Run the page and browser tests and confirm RED**

Run: `node --test tests/simuai-page.test.mjs && node tests/simuai-browser-smoke.mjs`

Expected: FAIL on missing result-region and static-mode behavior.

- [ ] **Step 4: Implement the search state machine and accessible result cards**

Add explicit `idle`, `matching`, `matched`, `recommended`, and `error` visual states. Disable the submit button only while matching, preserve input, render result content using `textContent`/DOM methods, keep the current experiment on low matches, and focus/highlight the experiment title only when an experiment opens.

- [ ] **Step 5: Refine layout and copy**

Strengthen the first-screen input treatment, place results immediately after the form, add source badges and a short highlight animation, preserve the dark blue/mint/violet palette, support `prefers-reduced-motion`, and keep the phone page within its viewport. Update README to require HTTP(S), document the static public mode, and keep local proxy instructions explicitly separate.

- [ ] **Step 6: Run page and browser tests and confirm GREEN**

Run: `node --test tests/simuai-page.test.mjs && node tests/simuai-browser-smoke.mjs`

Expected: contract tests pass; desktop and mobile print PASS, use no compile request, and report zero browser errors.

- [ ] **Step 7: Commit the search UX**

Run: `git add projects/simuai tests/simuai-page.test.mjs tests/simuai-browser-smoke.mjs && git commit -m "feat: add reliable SimuAI search results"`

### Task 4: Publish SimuAI in the Hub Engineering Catalog

**Files:**
- Create: `tests/simuai-publish.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- Consumes: the Hub `defaultApps` array, normalization/migration rules, and engineering renderer.
- Produces: one final engineering entry with `entry: "./projects/simuai/index.html"`, `video: "./projects/simuai/video/index.html"`, empty package/download fields, and cache-busted Hub runtime loading.

- [ ] **Step 1: Write a failing catalog publication test**

Load `defaultApps` in a VM and assert: exactly one `simuai` entry; it is the last engineering item; name/category/status/tags/copy are exact; Demo and Video URLs are exact; package, Windows, and Mac values are empty; the demo returns to `#engineering`; and the stored-default migration refreshes only legacy/default SimuAI metadata.

- [ ] **Step 2: Run the publication test and confirm RED**

Run: `node --test tests/simuai-publish.test.mjs`

Expected: FAIL because the Hub has no SimuAI catalog entry or video page.

- [ ] **Step 3: Add the catalog entry and migration**

Append SimuAI after the current last engineering entry, keep existing project order unchanged, use copy that says local controlled experiment matching, and update the runtime cache key in `index.html`. Add `test:simuai-publish` to `package.json`.

- [ ] **Step 4: Run publication and shared Hub contract tests**

Run: `node --test tests/simuai-publish.test.mjs tests/card-action-layout.test.mjs tests/hub-subpage-contract.test.mjs`

Expected: all tests pass and no existing card contract regresses.

- [ ] **Step 5: Commit the Hub catalog integration**

Run: `git add app-20260706-restore-games.js index.html package.json tests/simuai-publish.test.mjs && git commit -m "feat: publish SimuAI in engineering catalog"`

### Task 5: Create and Validate the Tutorial Video

**Files:**
- Create: `projects/simuai/video/index.html`
- Create: `projects/simuai/video/simuai-tutorial.mp4`
- Create: `projects/simuai/video/simuai-tutorial.vtt`
- Create: `projects/simuai/video/poster.jpg`
- Create: `projects/simuai/video/tutorial-script.md`
- Create: `scripts/build-simuai-tutorial.mjs`
- Modify: `tests/simuai-publish.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the real SimuAI page served over HTTP, Playwright screenshots, `ffmpeg-static`, and shared `assets/hub-video-player.css/js`.
- Produces: a reproducible current-product walkthrough, lazy-loaded shared player page, single-line Chinese captions, poster, and chapter markers.

- [ ] **Step 1: Extend the publication test with failing media assertions**

Assert the video page uses `data-hub-video-page`, `.hub-video-home`, `../../../index.html#engineering`, shared player assets, `preload="none"`, `data-src="./simuai-tutorial.mp4"`, default Chinese captions, at least five valid chapters, and existing non-empty MP4/VTT/poster/script files. Assert decoded media is H.264, `1280x720`, and `20 < duration < 240`; parse every VTT cue and reject newline-containing cue text.

- [ ] **Step 2: Run the publication test and confirm RED**

Run: `node --test tests/simuai-publish.test.mjs`

Expected: FAIL on the missing tutorial files.

- [ ] **Step 3: Implement the reproducible video builder**

Serve the Hub root locally, use Playwright at `1280x720` to record real product states for search match, recommendation selection, parameter adjustment, graph/metrics, explanation, and capability disclosure, then assemble the captured frames with FFmpeg into an H.264 `yuv420p` MP4. Generate a representative JPEG poster and record the exact narration/caption timing in the script and VTT.

- [ ] **Step 4: Implement the shared video page**

Reuse the repository's current video shell and lazy player without copying shared CSS/JS. Add chapter buttons for the recorded sequence and the fixed Hub return link.

- [ ] **Step 5: Build and verify the media**

Run: `node scripts/build-simuai-tutorial.mjs && node --test tests/simuai-publish.test.mjs`

Expected: media generation succeeds; the publication test decodes a valid H.264 720p video under four minutes with valid one-line captions.

- [ ] **Step 6: Commit the tutorial**

Run: `git add projects/simuai/video scripts/build-simuai-tutorial.mjs tests/simuai-publish.test.mjs package.json && git commit -m "feat: add SimuAI tutorial video"`

### Task 6: Complete Local Release Verification

**Files:**
- Modify as required by evidence only: relevant SimuAI or Hub files
- Create: `tests/artifacts/simuai-release/` screenshots and verification JSON only if the repository's artifact policy tracks them

**Interfaces:**
- Consumes: complete release tree from Tasks 1–5.
- Produces: fresh automatic, media, static audit, and real-browser evidence suitable for publishing.

- [ ] **Step 1: Run all focused SimuAI tests**

Run: `npm run test:simuai && npm run test:simuai-publish && npm run test:simuai-browser`

Expected: zero failures; browser output passes desktop and mobile.

- [ ] **Step 2: Run shared Hub publication gates**

Run: `node --test tests/project-video-coverage.test.mjs tests/hub-video-content.test.mjs tests/hub-subpage-contract.test.mjs tests/card-action-layout.test.mjs && npm run audit:hub`

Expected: zero failures and no missing catalog, page, video, subtitle, or return-route assets.

- [ ] **Step 3: Run the repository's complete test command**

Run: `npm test`

Expected: zero failures; documented conditional skips are allowed only when their own output identifies the environment condition.

- [ ] **Step 4: Inspect the exact release diff and secret scan**

Run: `git diff --check origin/main...HEAD && git status --short --branch && rg -n "(sk-[A-Za-z0-9_-]{16,}|gh[opsu]_[A-Za-z0-9]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)" projects/simuai tests/simuai* scripts/build-simuai-tutorial.mjs app-20260706-restore-games.js`

Expected: no whitespace errors, only intentional release files, and no secret matches.

### Task 7: Push, Merge, Deploy, and Verify GitHub Pages

**Files:**
- Update after successful public verification: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/AI-Application-Hub.md`

**Interfaces:**
- Consumes: green, committed release branch and confirmed repository push permission.
- Produces: merged `main`, successful Pages workflow for the final SHA, verified public demo/video/media links, and an updated long-term project record.

- [ ] **Step 1: Push the feature branch and open a PR**

Run: `git push -u origin feat/simuai` and create a PR into `main` describing root cause, static capability boundary, UX changes, video, and tests.

Expected: branch push succeeds without force and PR targets `wthpein010-dev/ai-application-hub:main`.

- [ ] **Step 2: Wait for PR checks and inspect failures if any**

Run: `gh pr checks <number> --watch`

Expected: all required checks pass; any failure is diagnosed from its actual Actions log before changes.

- [ ] **Step 3: Merge through GitHub and resolve concurrent movement safely**

Run: `gh pr merge <number> --merge --delete-branch`

Expected: PR merges normally; if `main` moved or the PR is not mergeable, fetch/rebase/test/push normally and never force-push.

- [ ] **Step 4: Wait for Pages and full verification workflows on the merged SHA**

Run: query `gh run list`/`gh run watch` for the merged commit until both deployment and repository verification succeed.

Expected: workflows report `success` for the exact merged SHA.

- [ ] **Step 5: Verify public HTTP and browser flows**

Check `https://wthpein010-dev.github.io/ai-application-hub/index.html#engineering`, `/projects/simuai/index.html`, `/projects/simuai/video/index.html`, the MP4, and VTT. Repeat high-match, low-match recommendation, parameter, explanation, video playback, caption, return-link, desktop, and mobile assertions against the public origin.

Expected: all URLs respond successfully, MP4 range requests return `206`, playback advances, no `/api/compile` request occurs, and browser error lists are empty.

- [ ] **Step 6: Update long-term project memory**

Replace the SimuAI “未发布” record with the final commit SHA, workflow results, public URLs, test counts, video metadata, and desktop/mobile/public search evidence. Do not record credentials or complete chat text.

- [ ] **Step 7: Report the public result**

Provide the public demo and video URLs, final commit SHA, deployment result, test count, video duration, and the key fact that public search is a reliable local 12-experiment matcher with no remote AI request.
