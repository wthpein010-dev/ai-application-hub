# Loop BGM Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publicly release “循环乐工房”, a privacy-first browser tool that turns local music references into controlled Suno prompt batches, compares generated candidates, tracks licensing, and exports portable project memory.

**Architecture:** A static GitHub Pages application keeps all audio decoding and feature extraction in the browser. Pure ES modules own DSP, prompt/state logic, and candidate scoring so Node tests can exercise them with synthetic PCM; `app.js` only coordinates Web Audio, DOM state, object URLs, persistence, and explicit user-triggered links. Hub metadata, real showcase media, and a silent tutorial video are publication-layer concerns.

**Tech Stack:** HTML, CSS, browser JavaScript modules, Web Audio API, Web Crypto, Node test runner, Playwright, ffmpeg/H.264, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-loop-bgm-lab-design.md`

## Global Constraints

- Public project ID is exactly `loop-bgm-lab`; public title is exactly `循环乐工房`.
- User audio stays local and is never committed, uploaded, persisted as bytes, or included in exports.
- The default integration only copies prompts and opens the official `https://suno.com/create` page from an explicit user gesture.
- Never store or request a Suno Cookie, Token, browser session, recovery key, or API key in the static application.
- Daily planning is labeled as a local plan based on rules checked on 2026-08-30, never as the account's actual balance.
- Prompt variants are deterministic and each non-baseline variant changes exactly one named variable group.
- Similarity is a conservative creative-risk gate, not a copyright or legal conclusion.
- Only synthetic PCM/WAV fixtures may enter tests and demos.
- The Hub card belongs at the end of the `assistant` collection and exposes only Demo and Video actions.
- Tutorial MP4 must be H.264, 1280×720, 45–90 seconds, silent, and use one visible Chinese caption line per cue.

---

### Task 1: Portable project state, prompt queue, and credit plan

**Files:**
- Create: `projects/loop-bgm-lab/core/project-state.mjs`
- Create: `projects/loop-bgm-lab/core/prompt-engine.mjs`
- Create: `tests/loop-bgm-lab-core.test.mjs`

**Interfaces:**
- Produces: `normalizeStyleSpec(input)`, `createPromptVariants(styleSpec)`, `createDailyPlan(options)`, `transitionBatch(plan, batchId, status, patch)`, `stableStringify(value)`, `validateProject(input)`, `exportProjectJson(project)`, `importProjectJson(text)`, and `exportProjectMarkdown(project)`.
- State schema: version 1; five batches at 10 planned credits by default; batch status enum `planned|submitted|downloaded|reviewed|rejected`.

- [ ] **Step 1: Write failing schema and prompt tests**

Cover stable key ordering, default D minor/112 BPM style, five deterministic variants, exactly one `changedAxis` for variants 2–5, 50 planned credits, legal status transitions, deep-copy validation, rejection of audio byte fields and secrets, lossless JSON round-trip, and Markdown exclusion of absolute paths/secrets.

- [ ] **Step 2: Run the focused test and confirm red**

Run: `node --test tests/loop-bgm-lab-core.test.mjs`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add the minimum pure implementation**

Use explicit allowlists for schema fields and status transitions. Preserve forward-compatible unknown top-level data under `extensions`; reject secret or binary keys matching `audioBytes`, `cookie`, `token`, `apiKey`, or `recoveryKey`, and reject absolute Windows/POSIX paths only in local-path fields while continuing to allow `https://` source URLs.

- [ ] **Step 4: Run the focused test and confirm green**

Run: `node --test tests/loop-bgm-lab-core.test.mjs`
Expected: all Task 1 assertions pass.

- [ ] **Step 5: Commit the state/prompt slice**

```bash
git add projects/loop-bgm-lab/core/project-state.mjs projects/loop-bgm-lab/core/prompt-engine.mjs tests/loop-bgm-lab-core.test.mjs
git commit -m "feat: add loop bgm prompt project core"
```

### Task 2: Local PCM analysis and loop compatibility

**Files:**
- Create: `projects/loop-bgm-lab/core/audio-analysis.mjs`
- Create: `tests/loop-bgm-lab-audio.test.mjs`

**Interfaces:**
- Consumes: `{ sampleRate, channels: Float32Array[] }` PCM and optional analysis limits.
- Produces: `analyzePcm(pcm, options)`, `mixToMono(channels)`, `estimateTempo(samples, sampleRate)`, `estimateKey(samples, sampleRate)`, `measureSpectrum(samples, sampleRate)`, `scoreLoopBoundary(samples, sampleRate)`, and normalized warnings.

- [ ] **Step 1: Write failing synthetic-audio tests**

Generate in-memory sine tones, 110/115 BPM impulse trains, D-minor triads, smooth/reversed endpoint pairs, silence, low sample rate, short duration, and phase-inverted stereo. Assert bounded numeric outputs, tempo within ±3 BPM, D minor key confidence, smooth loop score above discontinuous score, deterministic results, and correct Chinese warning codes.

- [ ] **Step 2: Run the audio test and confirm red**

Run: `node --test tests/loop-bgm-lab-audio.test.mjs`
Expected: FAIL because the analyzer is absent.

- [ ] **Step 3: Implement bounded DSP**

Use a radix-2 2048-point FFT, Hann window, 512 hop, spectral-flux autocorrelation over 70–160 BPM with half/double-tempo comb scoring, frequency-to-pitch-class chroma from 55 Hz to `min(5000, 0.45 * sampleRate)`, Krumhansl key profiles, and endpoint comparison weights envelope 0.30/chroma 0.35/centroid 0.20/boundary 0.15. Cap sampled STFT frames for long inputs.

- [ ] **Step 4: Run the audio tests and confirm green**

Run: `node --test tests/loop-bgm-lab-audio.test.mjs`
Expected: all numerical and warning assertions pass on repeated runs.

- [ ] **Step 5: Commit the analysis slice**

```bash
git add projects/loop-bgm-lab/core/audio-analysis.mjs tests/loop-bgm-lab-audio.test.mjs
git commit -m "feat: add local loop music analysis"
```

### Task 3: Candidate comparison, risk gate, and iteration advice

**Files:**
- Create: `projects/loop-bgm-lab/core/candidate-score.mjs`
- Modify: `projects/loop-bgm-lab/core/project-state.mjs`
- Modify: `tests/loop-bgm-lab-core.test.mjs`
- Create: `tests/loop-bgm-lab-candidate.test.mjs`

**Interfaces:**
- Produces: `compareCandidate(reference, candidate)`, `classifySimilarity(comparison)`, `recommendNextVariant(comparison)`, `validateLicenseEntry(entry)`, and immutable experiment records.

- [ ] **Step 1: Write failing comparison and license tests**

Cover weighted tempo/key/brightness/dynamics/loop/duration scores, missing-feature coverage, `insufficient|too-close|review|distinct` classes, exact 0.70/0.75/0.86 boundaries, requirement that core tempo/key/brightness all match before `too-close`, one-axis iteration advice, CC0/CC-BY/NC warnings, and hash/source/attribution validation.

- [ ] **Step 2: Run the candidate tests and confirm red**

Run: `node --test tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-candidate.test.mjs`
Expected: FAIL on missing comparison interfaces.

- [ ] **Step 3: Implement explainable scoring and immutable records**

Return every component score and raw delta beside the aggregate. Treat thresholds as inclusive exactly as the spec states. Ensure advice returns one `changedAxis` and a Chinese reason; never return legal clearance language.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `node --test tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-candidate.test.mjs`
Expected: all Task 3 tests pass.

- [ ] **Step 5: Commit candidate comparison**

```bash
git add projects/loop-bgm-lab/core tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-candidate.test.mjs
git commit -m "feat: add candidate comparison and licensing"
```

### Task 4: Complete local-first browser application

**Files:**
- Create: `projects/loop-bgm-lab/index.html`
- Create: `projects/loop-bgm-lab/styles.css`
- Create: `projects/loop-bgm-lab/app.js`
- Create: `projects/loop-bgm-lab/assets/demo-reference.wav`
- Create: `tests/loop-bgm-lab-page.test.mjs`
- Create: `tests/loop-bgm-lab-browser-smoke.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 modules and browser-selected audio.
- Produces: reference/candidate file analysis, aggregated `StyleSpec`, five-batch queue, copy/open actions, local persistence under `loop-bgm-lab-v1`, candidate A/B playback, license ledger, JSON/Markdown export/import, and search links.

- [ ] **Step 1: Write failing page-contract and browser tests**

Static assertions cover exact title, `hub-subpage` shell, `../../index.html#apps`, official Suno URL and current-rule date, privacy/rights text, module imports, CSP-safe markup, Demo/Video-only language, and absence of credential fields. Browser assertions cover synthetic WAV import, five prompt cards, single-variable labels, copy fallback, explicit external-link opening, candidate comparison, batch status persistence, JSON round-trip, Markdown download, license entry, responsive viewports, reduced motion, and zero page/console/request errors.

- [ ] **Step 2: Run focused page/browser tests and confirm red**

Run: `node --test tests/loop-bgm-lab-page.test.mjs && node tests/loop-bgm-lab-browser-smoke.mjs`
Expected: FAIL because the application page is absent.

- [ ] **Step 3: Build semantic HTML and responsive CSS**

Create six ordered regions: reference analysis, style portrait, daily queue, candidate comparison, license ledger, and portable handoff. Use a two-column desktop layout and one-column mobile flow; add accessible labels, progress/live regions, keyboard focus styles, non-color status text, and reduced-motion rules.

- [ ] **Step 4: Implement browser coordination**

Decode files with `AudioContext.decodeAudioData`, hash bytes with `crypto.subtle.digest`, analyze one file at a time, release object URLs, sanitize all rendered text, validate before replacing state, and make each Suno/search link an explicit `noopener,noreferrer` user action. Opening a link must not change a batch to `submitted`.

- [ ] **Step 5: Generate the synthetic demo WAV**

Use a deterministic checked-in build script or test helper to create an 8–12 second mono 44.1 kHz PCM WAV containing original synthesized pulses and tones only. Verify its SHA-256 and that analysis succeeds; do not include any user reference audio.

- [ ] **Step 6: Run all focused application tests**

Run: `node --test tests/loop-bgm-lab-{core,audio,candidate,page}.test.mjs && node tests/loop-bgm-lab-browser-smoke.mjs`
Expected: all unit, page, interaction, persistence, privacy, and viewport assertions pass.

- [ ] **Step 7: Commit the browser application**

```bash
git add projects/loop-bgm-lab tests/loop-bgm-lab-*.test.mjs tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "feat: build loop bgm lab browser workflow"
```

### Task 5: Hub catalog integration and real showcase image

**Files:**
- Create: `tests/loop-bgm-lab-publish.test.mjs`
- Create: `assets/hub-showcase/loop-bgm-lab.webp`
- Modify: `app-20260706-restore-games.js`
- Modify: `hub-project-media.js`

**Interfaces:**
- Consumes: finished application page.
- Produces: final `assistant` card with Demo/Video actions and a real 1440×900 product screenshot.

- [ ] **Step 1: Write failing publication tests**

Assert exactly one `loop-bgm-lab` record, final position in the assistant collection, `./projects/loop-bgm-lab/index.html`, `./projects/loop-bgm-lab/video/index.html`, blank Windows/macOS actions, a real showcase mapping, correct `#apps` return links, and no collision with existing project IDs.

- [ ] **Step 2: Run focused publication tests and confirm red**

Run: `node --test tests/loop-bgm-lab-publish.test.mjs tests/hub-subpage-contract.test.mjs tests/project-video-coverage.test.mjs`
Expected: FAIL because the project is not registered and media is absent.

- [ ] **Step 3: Register the card and media mapping**

Append the project without reordering existing entries. Use `status: "assistant"`, badge/category copy consistent with nearby AI apps, and only web/video actions.

- [ ] **Step 4: Capture the finished UI and convert to WebP**

Run the local page at 1440×900 with its deterministic demo state, capture PNG, and convert to `assets/hub-showcase/loop-bgm-lab.webp`. Verify decoded dimensions, non-empty image area, and no local path or personal filename in the screenshot.

- [ ] **Step 5: Run publication and Hub contract tests**

Run: `node --test tests/loop-bgm-lab-publish.test.mjs tests/hub-subpage-contract.test.mjs tests/card-action-layout.test.mjs tests/hub-dynamic-showcase.test.mjs`
Expected: all focused Hub tests pass.

- [ ] **Step 6: Commit Hub integration**

```bash
git add app-20260706-restore-games.js hub-project-media.js assets/hub-showcase/loop-bgm-lab.webp tests/loop-bgm-lab-publish.test.mjs
git commit -m "feat: publish loop bgm lab in hub"
```

### Task 6: Silent public tutorial and shared video page

**Files:**
- Create: `scripts/record-loop-bgm-lab-video.mjs`
- Create: `scripts/build-loop-bgm-lab-video.mjs`
- Create: `projects/loop-bgm-lab/video/index.html`
- Create: `projects/loop-bgm-lab/video/loop-bgm-lab-demo.vtt`
- Create: `projects/loop-bgm-lab/video/tutorial-script.md`
- Generate: `projects/loop-bgm-lab/video/loop-bgm-lab-demo.mp4`
- Generate: `projects/loop-bgm-lab/video/poster.jpg`
- Modify: `tests/loop-bgm-lab-publish.test.mjs`

**Interfaces:**
- Consumes: finished public application and synthetic demo WAV.
- Produces: 45–90 second 1280×720 silent H.264 tutorial, shared Hub player page, one-line Chinese captions, poster, and deterministic media metadata.

- [ ] **Step 1: Add failing media contract tests**

Assert H.264/yuv420p, exact 1280×720, duration 45–90 seconds, faststart-compatible output, no audio stream, valid VTT timing, one text line per cue, poster dimensions, chapter buttons, and relative return link `../../../index.html#apps`.

- [ ] **Step 2: Run media tests and confirm red**

Run: `node --test tests/loop-bgm-lab-publish.test.mjs tests/project-video-coverage.test.mjs`
Expected: FAIL because video assets are absent.

- [ ] **Step 3: Add deterministic recorder, encoder, player, captions, and script**

Demonstrate local privacy, reference analysis, five controlled variants, candidate risk classification, license ledger, and portable export. Blur or omit personal filenames. Record without copyrighted audio; encode with `libx264`, `yuv420p`, `+faststart`, 30 fps, and no audio stream.

- [ ] **Step 4: Record and encode the tutorial**

Run the recorder, copy its run-specific `Capture workspace` path, then run: `node scripts/build-loop-bgm-lab-video.mjs --capture-root "<capture workspace>"`. Each recorder invocation receives an isolated temp directory so concurrent runs cannot delete one another's files.
Expected: MP4 and poster are created; recorder reports zero console, page, and failed-request errors.

- [ ] **Step 5: Run media and player tests**

Run: `node --test tests/loop-bgm-lab-publish.test.mjs tests/project-video-coverage.test.mjs && node tests/hub-video-pages-browser-smoke.mjs`
Expected: all codecs, duration, captions, lazy loading, playback, and shared-player assertions pass.

- [ ] **Step 6: Commit the tutorial**

```bash
git add scripts/record-loop-bgm-lab-video.mjs scripts/build-loop-bgm-lab-video.mjs projects/loop-bgm-lab/video tests/loop-bgm-lab-publish.test.mjs
git commit -m "feat: add loop bgm lab tutorial"
```

### Task 7: Verification, review, GitHub release, Pages audit, and durable memory

**Files:**
- Modify only if a failing verification exposes a real defect.
- Update: `E:\CodexData\memory\Codex-Memory\05-项目记忆\AI-Application-Hub.md`
- Create or update: `E:\CodexData\memory\Codex-Memory\05-项目记忆\循环乐工房.md`
- Update: `E:\CodexData\memory\Codex-Memory\00-入口\Memory-Index.md`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: reviewed PR merged without force, successful exact-SHA Pages deployment, verified public pages/media, and a credential-free cross-computer handoff card.

- [ ] **Step 1: Run focused project validation**

Run: `node --test tests/loop-bgm-lab-*.test.mjs`
Run: `node tests/loop-bgm-lab-browser-smoke.mjs`
Expected: zero failures, zero browser errors, and no unexpected network requests.

- [ ] **Step 2: Run the full repository gates**

Run: `node --test`
Run: `npm run audit:hub`
Run: `node tests/hub-entry-pages-browser-smoke.mjs`
Run: `node tests/hub-video-pages-browser-smoke.mjs`
Expected: zero test failures and zero Important audit findings.

- [ ] **Step 3: Inspect the diff and request independent code review**

Run: `git diff --check origin/main...HEAD`, inspect every changed path against the spec, and request review. Resolve all Critical/Important findings; rerun affected focused tests after each correction.

- [ ] **Step 4: Rebase on current remote main and rerun release gates**

Run: `git fetch origin main && git rebase origin/main`
Then rerun focused tests, full `node --test`, `npm run audit:hub`, and both browser-smoke suites.
Expected: clean rebase and all gates green.

- [ ] **Step 5: Push the feature branch and merge normally**

Run: `git push -u origin feat/loop-bgm-lab`. Create a pull request, verify the exact head SHA checks, and merge without force after required checks succeed.

- [ ] **Step 6: Wait for exact-SHA Pages and verification workflows**

Use `gh run list`, `gh run view`, and `gh run watch` for the merged SHA.
Expected: Pages deployment and Hub verification conclude `success`.

- [ ] **Step 7: Verify public pages and media**

Check:

```text
https://wthpein010-dev.github.io/ai-application-hub/index.html#apps
https://wthpein010-dev.github.io/ai-application-hub/projects/loop-bgm-lab/index.html
https://wthpein010-dev.github.io/ai-application-hub/projects/loop-bgm-lab/video/index.html
https://wthpein010-dev.github.io/ai-application-hub/projects/loop-bgm-lab/video/loop-bgm-lab-demo.mp4
```

Verify desktop and 390×844 layout, five prompt variants, privacy copy, JSON/Markdown round-trip, video playback, caption track, and MP4 Range `206`.

- [ ] **Step 8: Write durable project evidence**

Record the merged SHA, workflow IDs, public URLs, test counts, media duration/size/hash, current Suno rule check date, safe manual workflow, prompt baseline, reference feature summary, and next iteration decision. Do not store raw audio, absolute user audio paths, credentials, cookies, tokens, or recovery keys.

- [ ] **Step 9: Re-attempt the official generation path only if its prerequisite changes**

If the visible-browser URL safety helper or an authenticated official Suno API becomes available, generate one baseline batch, download only through the official interface, analyze candidates locally, record problems, and queue the single-axis next variant. Otherwise retain the verified manual adapter and report that no credits were consumed; do not use hidden/unofficial endpoints or session extraction.
