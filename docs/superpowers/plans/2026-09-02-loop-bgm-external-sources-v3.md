# Loop BGM Lab External Candidate Provenance and License Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Loop BGM Lab analyze Suno, external, and locally created candidates without false provenance, while enforcing exact file-license identity, preview/ShareAlike/NC/ND release gates, and atomic portable license-package workflows.

**Architecture:** Project schema v3 adds a strict candidate-source union and richer normalized license evidence. A DOM-free publication module derives research/release state, while a separate DOM-free license-package module parses, adapts, plans, and exports bounded JSON evidence. The browser coordinator freezes source/run/output context before asynchronous analysis and uses source-specific commit paths so external files never mutate Suno batch state.

**Tech Stack:** Browser ES modules, Web Audio, Web Crypto SHA-256, Node test runner, Playwright, static HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-loop-bgm-external-sources-v3-design.md`

## Global constraints

- Project schema becomes 3; StyleSpec remains 1; Markdown envelope remains 1; license package starts at 1.
- v1/v2 migration must never infer Suno provenance. Old candidates become `legacy-unknown`.
- An external/local candidate requires exactly one existing license whose hash equals the candidate and source assertion hashes.
- External/local experiments contain no Suno run, output, URL, or generation conditions and never update a Suno batch.
- Preview-only, NC, SA, ND, unknown, missing evidence, and incomplete rights-chain facts block release; research favorite remains independent.
- License-package and project imports are fully validated before mutation. Failures preserve project, storage, object URLs, playback, and quarantine state.
- No audio bytes, waveforms, local paths, personal file names, direct/signed download URLs, credentials, cookies, tokens, API keys, recovery keys, or sessions enter JSON, Markdown, license packages, Git, tests, logs, or memory.
- Do not add network transport, hidden Suno endpoints, browser-login automation, payment, or automatic source-page dereferencing.

---

### Task 1: Project schema v3 and publication invariants

**Files:**
- Modify: `projects/loop-bgm-lab/core/project-state.mjs`
- Modify: `projects/loop-bgm-lab/core/candidate-score.mjs`
- Modify: `projects/loop-bgm-lab/core/prompt-engine.mjs`
- Create: `projects/loop-bgm-lab/core/candidate-publication.mjs`
- Create: `tests/loop-bgm-lab-schema-v3-core.test.mjs`
- Create: `tests/loop-bgm-lab-candidate-publication.test.mjs`
- Modify focused existing Loop BGM fixture tests as required

**Interfaces:**
- Consumes existing batches, runs, outputs, candidates, experiments, licenses, JSON importer, and Markdown envelope.
- Produces schema-v3 validation/migration, source-specific experiment invariants, normalized license evidence, and `deriveCandidatePublicationState(project, candidateId)`.

- [ ] **Step 1: Add failing source and migration tests**

Cover all candidate-source variants, external/local exact license/hash foreign keys, Suno run/output/experiment binding, external null Suno evidence, external batch isolation, v2-to-v3 conservative migration, v1-to-v2-to-v3 migration, JSON/Markdown round trips, and future-version rejection.

Use this exact external assertion shape:

```js
candidateSource: {
  kind: "external",
  licenseId: "license-1",
  fileSha256: candidate.hash,
}
```

Name the break caught: external material is persisted as a Suno result or an old URL/run is treated as proof of origin.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
node --test tests/loop-bgm-lab-schema-v3-core.test.mjs tests/loop-bgm-lab-project-state-hardening.test.mjs tests/loop-bgm-lab-portable-handoff.test.mjs
```

Expected: failures for schema version, missing `candidateSource`, external null evidence, and unsupported license facts.

- [ ] **Step 3: Implement the v3 source union and migration**

Set new plans to schema 3. Validate exact keys per source kind. For `suno`, require the same run/output in candidate and experiment. For `external`/`local-original`, require candidate/source/license hash equality and four null Suno evidence fields. Reject an external/local candidate as a batch's current Suno candidate. Migrate every v2 candidate to `legacy-unknown`, retaining only a unique optional `legacyRunId`.

- [ ] **Step 4: Add failing license-evidence and publication tests**

Cover CC0, CC BY, CC BY-SA, CC BY-NC-SA, CC BY-ND, preview-only, unknown, missing attribution, missing evidence, rights-chain review, accepted/unaccepted review, and a blocked candidate that is still the research favorite. Reject stale supplied derived flags/blockers.

- [ ] **Step 5: Implement rich normalized license evidence and publication derivation**

Add the spec fields, HTTPS/date/hash validation, canonical classifications, and blocker labels. Keep normalization in core and presentation labels in `candidate-publication.mjs`. `deriveCandidatePublicationState` returns at least:

```js
{
  status: "blocked" | "review" | "ready",
  candidateId,
  sourceKind,
  licenseId,
  blockers,
  isResearchFavorite,
}
```

`ready` requires confirmed source, exact evidence with no blockers, and an accepted experiment; the returned text and docs still state that this is not legal clearance.

- [ ] **Step 6: Run all Loop BGM unit tests and confirm GREEN**

```powershell
$tests = rg --files tests | Where-Object { $_ -match '^tests[/\\]loop-bgm-lab.*\.test\.mjs$' }
node --test $tests
git diff --check
```

Expected: zero failures and no whitespace errors.

- [ ] **Step 7: Commit the core slice**

```powershell
git add projects/loop-bgm-lab/core tests/loop-bgm-lab-*.test.mjs
git commit -m "feat: model external candidate provenance"
```

### Task 2: Strict license package and external-manifest adapter

**Files:**
- Create: `projects/loop-bgm-lab/core/license-package.mjs`
- Create: `tests/loop-bgm-lab-license-package.test.mjs`

**Interfaces:**
- Produces: `normalizeLicensePackage`, `parseLicensePackageJson`, `exportLicensePackageJson`, `planLicensePackageImport`, `applyLicensePackageImport`, and `adaptExternalManifestV3`.
- Consumes normalized license-entry validation and portable-safety helpers from Task 1.

- [ ] **Step 1: Write failing format, adapter, and atomicity tests**

Test valid parse/export, format/version/size/count/key/date/hash bounds, dangerous keys, local paths, credential URLs, secret-like query keys, direct-download fields, duplicate IDs/hashes, idempotent same-fact rows, and conflicting same-hash facts. Assert a conflict returns no additions and leaves an input project deep-equal.

Use a minimal synthetic manifest-v3 fixture containing one original CC0 attachment, one CC BY-SA attachment, and one Freesound audition preview. Assert that public source/evidence facts survive while `path`, `downloadUrl`, `finalUrl`, `originalFile`, ETag, Last-Modified, and HTTP metadata do not appear anywhere in the exported package.

- [ ] **Step 2: Run and confirm RED**

```powershell
node --test tests/loop-bgm-lab-license-package.test.mjs
```

Expected: module-not-found or missing-interface failures.

- [ ] **Step 3: Implement minimal normalization and import planning**

Parse JSON under the independent package limits. Normalize every row through the Task 1 license validator. Compare canonical facts, not input formatting. Same facts skip; any conflict blocks all additions. The apply function accepts only a successful plan and returns a newly validated project without mutating its input.

- [ ] **Step 4: Implement the manifest-v3 adapter**

Require exact external schema 3 and map each work/file license fact. Convert known audition/preview delivery values to `preview-only`, known source attachments to `original`, and unknown values to `unknown`. Never copy transport or file-identity-path fields.

- [ ] **Step 5: Run package, schema, privacy, and round-trip tests**

```powershell
node --test tests/loop-bgm-lab-license-package.test.mjs tests/loop-bgm-lab-schema-v3-core.test.mjs tests/loop-bgm-lab-portable-handoff.test.mjs
```

- [ ] **Step 6: Commit the package core**

```powershell
git add projects/loop-bgm-lab/core/license-package.mjs tests/loop-bgm-lab-license-package.test.mjs
git commit -m "feat: add portable license evidence packages"
```

### Task 3: Source-aware candidate import and release badges

**Files:**
- Modify: `projects/loop-bgm-lab/index.html`
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `projects/loop-bgm-lab/styles.css`
- Modify: `tests/loop-bgm-lab-page.test.mjs`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

**Interfaces:**
- Consumes Task 1 source/publication APIs and the existing audio analyzer/session lifecycle.
- Produces source/run/output controls, source-specific analysis commits, source/license/release badges, and research-favorite wording.

- [ ] **Step 1: Write failing page-contract tests**

Require accessible `#candidate-source-kind` and `#candidate-output`, no selectable `legacy-unknown` import option, “研究最佳不代表可发布” copy, source/license/publication badge styles, responsive toolbar rules, and no new fetch/XHR/WebSocket usage.

- [ ] **Step 2: Write failing browser source-state tests**

Cover: Suno file input disabled until batch+run+output are selected; exact Suno source/experiment binding; external/local import with no run; zero/multiple license matches fail that file; one exact SHA match succeeds; external review leaves every batch/run byte-for-byte unchanged; mixed-file partial analysis preserves successful files; source switching during delayed decoding cancels stale work.

Name the break caught: asynchronous analysis commits under a newer source selection or external material changes Suno status to downloaded.

- [ ] **Step 3: Run and confirm RED**

```powershell
node --test tests/loop-bgm-lab-page.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

- [ ] **Step 4: Implement source-aware controls**

Replace `renderCandidateRunOptions()` with a source-aware refresh. At the start of `processCandidateFiles()`, freeze `sourceKind`, `batchId`, `runId`, `outputIndex`, project identity, and generation token. Suno creates a candidate/experiment bound to that output. External/local resolve exactly one license by case-insensitive SHA and create an experiment whose four Suno fields are null. Only the Suno branch updates its batch/run state.

- [ ] **Step 5: Render source and publication state**

Show source, license category, delivery status, evidence date, and blocker badges. Relabel the checkbox “研究最佳（不代表可发布）”. A blocked research favorite remains visibly blocked. Catch license-removal validation failures and preserve the project without a page error.

- [ ] **Step 6: Confirm browser and unit GREEN**

```powershell
node --test tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-schema-v3-core.test.mjs tests/loop-bgm-lab-candidate-publication.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

- [ ] **Step 7: Commit the source-aware UI**

```powershell
git add projects/loop-bgm-lab/index.html projects/loop-bgm-lab/app.js projects/loop-bgm-lab/styles.css tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "feat: import licensed external music candidates"
```

### Task 4: License-package browser preflight and atomic apply

**Files:**
- Modify: `projects/loop-bgm-lab/index.html`
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `projects/loop-bgm-lab/styles.css`
- Modify: `tests/loop-bgm-lab-page.test.mjs`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

- [ ] **Step 1: Add failing UI and atomicity tests**

Require a JSON-only license-package picker separate from project import, preview/apply/export controls, a visible additions/skips/conflicts/blocker summary, disabled apply on conflict, no mutation on preview/failure, complete atomic mutation on apply, and rejection of ZIP input. Applying a valid package cancels in-flight candidate analysis by generation token but preserves existing playback URLs.

- [ ] **Step 2: Run and confirm RED**

```powershell
node --test tests/loop-bgm-lab-page.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

- [ ] **Step 3: Implement preflight, apply, and export**

Keep a transient import plan outside the persisted project. Reading/preflight never mutates. Apply only a `canCommit` plan, then validate, persist, and render as one operation. Export the normalized package as JSON. Project JSON/Markdown import remains a separate control and retains staged-render-before-commit ordering.

- [ ] **Step 4: Run browser regression and commit**

```powershell
node --test tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-license-package.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
git add projects/loop-bgm-lab tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "feat: preflight external license packages"
```

### Task 5: Explicit legacy-source confirmation

**Files:**
- Modify: `projects/loop-bgm-lab/core/project-state.mjs`
- Modify: `projects/loop-bgm-lab/core/candidate-publication.mjs`
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `projects/loop-bgm-lab/index.html`
- Modify: `tests/loop-bgm-lab-schema-v3-core.test.mjs`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

- [ ] **Step 1: Write failing atomic reclassification tests**

Add `confirmLegacyCandidateSource(project, candidateId, confirmation)`. Test explicit Suno run/output confirmation, exact-hash external/local confirmation, invalid evidence with no mutation, and conversion of a batch-current legacy candidate to external/local. That conversion atomically clears the batch's candidate review mirror and the experiment's Suno evidence while preserving historical runs.

- [ ] **Step 2: Implement the core API and candidate-card controls**

Do not infer from URL or history. Only `legacy-unknown` may use this API. The UI requires deliberate source selection and evidence choice, shows “旧记录·待确认” until success, and keeps it release-blocked.

- [ ] **Step 3: Run focused and browser tests, then commit**

```powershell
node --test tests/loop-bgm-lab-schema-v3-core.test.mjs tests/loop-bgm-lab-candidate-publication.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
git add projects/loop-bgm-lab tests/loop-bgm-lab-schema-v3-core.test.mjs tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "feat: confirm migrated candidate provenance"
```

### Task 6: Documentation, full verification, review, and release

**Files:**
- Modify: `projects/loop-bgm-lab/README.md` or existing on-page tutorial copy as applicable
- Modify: `projects/loop-bgm-lab/core/prompt-engine.mjs` for new-project tool version `loop-bgm-lab/1.3.0`
- Modify only failing scoped files after adding a reproducing test

- [ ] **Step 1: Update user guidance and version**

Document the four source meanings, evidence-before-external-import flow, preview/original replacement rule, research favorite versus release readiness, license-package JSON versus project JSON/Markdown, and the fact that SHA-256 is identity/integrity evidence rather than legal clearance.

- [ ] **Step 2: Run privacy, diff, and focused checks**

```powershell
git diff --check origin/main...HEAD
rg -n -i "C:\\Users\\|Downloads\\|cookie[=:]|token[=:]|api[_-]?key[=:]|recovery[_-]?key[=:]" projects/loop-bgm-lab docs/superpowers/specs/2026-09-02-loop-bgm-external-sources-v3-design.md docs/superpowers/plans/2026-09-02-loop-bgm-external-sources-v3.md
$tests = rg --files tests | Where-Object { $_ -match '^tests[/\\]loop-bgm-lab.*\.test\.mjs$' }
node --test $tests
node tests/loop-bgm-lab-browser-smoke.mjs
```

Expected: zero failures, zero unexpected network requests, four viewport passes, and no secret/local-path values.

- [ ] **Step 3: Run the complete local repository workflow**

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
node --test
node scripts/hub-publication-audit.mjs
node tests/hub-video-pages-browser-smoke.mjs
node tests/hub-entry-pages-browser-smoke.mjs
node tests/x-ai-codex-radar-browser-smoke.mjs
node tests/clickflow-browser-smoke.mjs
```

- [ ] **Step 4: Request independent specification and code-quality review**

Give reviewers the spec, plan, `origin/main...HEAD` diff, RED/GREEN evidence, package threat model, migration rules, and async browser invariants. Resolve every Critical/Important item with a failing regression test first, then repeat Steps 2–3.

- [ ] **Step 5: Push and open a pull request**

```powershell
git push -u origin feat/loop-bgm-external-sources-v3
gh pr create --base main --head feat/loop-bgm-external-sources-v3 --title "feat: track licensed external Loop BGM candidates" --body-file .github/PR_BODY.md
```

The body must state schema/version changes, conservative migration, exact-hash evidence, preview/SA/NC/ND gates, atomic package import, zero audio/path/secret portability, test evidence, and the remaining Suno browser-control blocker.

- [ ] **Step 6: Verify exact remote workflows and publication**

Wait for the exact-head workflow, merge only after every required check succeeds, then wait for the exact merge/main and Pages runs. Compare every changed public file with the merge commit byte-for-byte and run a fresh online Chromium context through external import, package preflight, JSON/Markdown restore, responsive layouts, and zero console/page/request errors.

- [ ] **Step 7: Update long-term memory**

Record the PR/merge commit, project/package/envelope/tool versions, exact test and workflow evidence, published behavior, curated non-production pack hash, final Feishu target, and remaining Suno browser/download blocker. Do not record user reference paths, raw audio, credentials, cookies, tokens, API keys, recovery keys, or browser sessions.
