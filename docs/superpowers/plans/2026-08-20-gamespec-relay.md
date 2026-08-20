# GameSpec Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publicly release GameSpec Relay as an offline-capable game-development requirement-to-delivery Agent with a web demo, Windows/macOS desktop packages, and an approximately three-minute tutorial video.

**Architecture:** A dependency-light ES Module core produces and validates one canonical `DeliveryPack` from text sources. The browser app, Electron desktop shell, version diff, exporters, optional OpenAI-compatible adapter, tests, and recording automation all consume the same core so the demo and downloads behave identically.

**Tech Stack:** HTML/CSS/ES Modules, Node.js 24, Node test runner, Playwright 1.61.1, Electron/electron-builder, GitHub Actions, FFmpeg H.264.

**Spec:** `docs/superpowers/specs/2026-08-13-gamespec-relay-design.md`

## Global Constraints

- The complete built-in sample must run without network access, an account, or an API key.
- Optional model output must normalize to the same `DeliveryPack` schema and pass local validation before display.
- The MVP previews or exports Markdown, JSON, CSV, and a Codex context pack; it does not submit Feishu tasks or GitHub issues.
- Every decision, question, and task must retain at least one source evidence reference.
- Desktop security must keep `contextIsolation: true` and `nodeIntegration: false`.
- The Hub card must be appended to the application collection and expose exactly “演示 / 视频 / Wins下载 / Mac下载” in that order.
- Tutorial media must be H.264 at 1280×720, no longer than four minutes, with one-line-at-a-time Simplified Chinese captions.
- Windows and macOS artifacts must be real runnable packages with CI or local launch evidence, checksums, archive verification, and minimal workflow smoke tests.
- Existing unrelated changes in the old local clone must never be staged, reset, deleted, or overwritten.

---

## File Map

- `projects/gamespec-relay/app/core/schema.js`: canonical constructors and schema normalization.
- `projects/gamespec-relay/app/core/analyzer.js`: deterministic local game-domain analysis pipeline.
- `projects/gamespec-relay/app/core/quality.js`: delivery health, dependency, duplicate, and acceptance gates.
- `projects/gamespec-relay/app/core/diff.js`: V1/V2 semantic comparison and affected-test calculation.
- `projects/gamespec-relay/app/core/exporters.js`: Markdown, JSON, CSV, and Codex context-pack serializers.
- `projects/gamespec-relay/app/core/model-adapter.js`: optional OpenAI-compatible request/response normalization.
- `projects/gamespec-relay/app/data/boss-phase-sample.js`: reproducible competition demo input and glossary.
- `projects/gamespec-relay/app/store.js`: browser persistence and immutable state updates.
- `projects/gamespec-relay/app/main.js`: UI orchestration only.
- `projects/gamespec-relay/app/index.html`, `app.css`: responsive three-column workbench / mobile stepper.
- `projects/gamespec-relay/index.html`, `shell.css`: Hub subpage shell and loading experience.
- `build/gamespec-relay-desktop/`: Electron main/preload, locked dependencies, package verification, and smoke runner.
- `tests/gamespec-relay-*.test.mjs`: core, state, publication, media, and DOM contracts.
- `tests/gamespec-relay-browser-smoke.mjs`: desktop/mobile and end-to-end browser behavior.
- `scripts/record-gamespec-relay-demo.mjs`: deterministic UI recording.
- `scripts/build-gamespec-relay-video.mjs`: captions, poster, and H.264 assembly.
- `projects/gamespec-relay/video/`: standardized video page and final media.
- `.github/workflows/build-gamespec-relay-release.yml`: Windows x64 and macOS x64/arm64 build, smoke, package, release.
- `app-20260706-restore-games.js`: catalog entry and exact localStorage migration.

---

### Task 1: Canonical DeliveryPack and deterministic fixture

**Files:**
- Create: `projects/gamespec-relay/app/core/schema.js`
- Create: `projects/gamespec-relay/app/data/boss-phase-sample.js`
- Create: `tests/gamespec-relay-schema.test.mjs`

**Interfaces:**
- Produces: `createEmptyDeliveryPack(meta)`, `normalizeDeliveryPack(value)`, `assertDeliveryPack(value)`, `BOSS_PHASE_SAMPLE`, `BOSS_PHASE_CHANGE_SAMPLE`, `GAME_GLOSSARY`.

- [ ] **Step 1: Write the failing schema test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { BOSS_PHASE_SAMPLE } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";
import { createEmptyDeliveryPack, assertDeliveryPack } from "../projects/gamespec-relay/app/core/schema.js";

test("DeliveryPack starts with every required collection", () => {
  const pack = createEmptyDeliveryPack({ projectName: "Boss 二阶段", sources: BOSS_PHASE_SAMPLE.sources });
  assert.deepEqual(Object.keys(pack), ["project", "sources", "decisions", "questions", "scope", "tasks", "tests", "risks", "health"]);
  assert.doesNotThrow(() => assertDeliveryPack(pack));
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node --test tests/gamespec-relay-schema.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `core/schema.js`.

- [ ] **Step 3: Implement canonical constructors and sample fixtures**

```js
export function createEmptyDeliveryPack({ projectName, sources = [], version = "V1" }) {
  return {
    project: { name: projectName, version, generatedAt: new Date(0).toISOString(), summary: "" },
    sources: sources.map((source, index) => ({ id: source.id || `SRC-${index + 1}`, kind: source.kind || "text", title: source.title || `来源 ${index + 1}`, content: source.content || "" })),
    decisions: [], questions: [], scope: { inScope: [], outOfScope: [] },
    tasks: [], tests: [], risks: [],
    health: { completeness: 0, testability: 0, blockerCount: 0, dependencyRisk: 0, ready: false },
  };
}
```

The sample must contain conflicting chat statements, numeric timing requirements, client/VFX/audio/QA concerns, two unresolved decisions, and a V2 change message.

- [ ] **Step 4: Run the schema test**

Run: `node --test tests/gamespec-relay-schema.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/gamespec-relay/app/core/schema.js projects/gamespec-relay/app/data/boss-phase-sample.js tests/gamespec-relay-schema.test.mjs
git commit -m "feat: define GameSpec Relay delivery schema"
```

### Task 2: Offline game-domain analysis pipeline

**Files:**
- Create: `projects/gamespec-relay/app/core/analyzer.js`
- Create: `projects/gamespec-relay/app/core/vocabulary.js`
- Create: `tests/gamespec-relay-analyzer.test.mjs`

**Interfaces:**
- Consumes: `createEmptyDeliveryPack`, sample sources and glossary.
- Produces: `analyzeSources({ projectName, sources, glossary, version }) -> DeliveryPack` and `extractEvidence(sentence, source) -> Evidence`.

- [ ] **Step 1: Write analyzer acceptance tests**

```js
test("Boss sample becomes a cross-discipline delivery pack", () => {
  const pack = analyzeSources({ projectName: "Boss 二阶段", sources: BOSS_PHASE_SAMPLE.sources, glossary: GAME_GLOSSARY, version: "V1" });
  assert.ok(new Set(pack.tasks.map((task) => task.role)).size >= 5);
  assert.ok(pack.tasks.flatMap((task) => task.acceptanceCriteria).length >= 8);
  assert.ok(pack.tests.length >= 5);
  assert.ok(pack.questions.filter((item) => item.status === "open").length >= 2);
  for (const item of [...pack.decisions, ...pack.questions, ...pack.tasks]) assert.ok(item.evidence.length >= 1);
});
```

- [ ] **Step 2: Run analyzer tests to observe missing analyzer**

Run: `node --test tests/gamespec-relay-analyzer.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the staged analyzer**

```js
export function analyzeSources({ projectName, sources, glossary = [], version = "V1" }) {
  const pack = createEmptyDeliveryPack({ projectName, sources, version });
  const statements = segmentSources(pack.sources);
  pack.decisions = deriveDecisions(statements);
  pack.questions = deriveQuestions(statements);
  pack.scope = deriveScope(statements);
  pack.tasks = deriveRoleTasks(statements, glossary);
  pack.tests = deriveTests(pack.tasks, statements);
  pack.risks = deriveRisks(pack.tasks, pack.questions);
  return normalizeDeliveryPack(pack);
}
```

Use stable IDs based on role plus normalized title, not array position, so version comparison is deterministic.

- [ ] **Step 4: Run schema and analyzer tests**

Run: `node --test tests/gamespec-relay-schema.test.mjs tests/gamespec-relay-analyzer.test.mjs`
Expected: PASS with the fixture thresholds above.

- [ ] **Step 5: Commit**

```bash
git add projects/gamespec-relay/app/core/analyzer.js projects/gamespec-relay/app/core/vocabulary.js tests/gamespec-relay-analyzer.test.mjs
git commit -m "feat: analyze game discussions offline"
```

### Task 3: Quality gates, version impact, and exports

**Files:**
- Create: `projects/gamespec-relay/app/core/quality.js`
- Create: `projects/gamespec-relay/app/core/diff.js`
- Create: `projects/gamespec-relay/app/core/exporters.js`
- Create: `tests/gamespec-relay-quality.test.mjs`
- Create: `tests/gamespec-relay-diff-export.test.mjs`

**Interfaces:**
- Produces: `evaluateDeliveryPack(pack)`, `diffDeliveryPacks(before, after)`, `toMarkdown(pack)`, `toJson(pack)`, `toTaskCsv(pack)`, `toCodexContext(pack)`.

- [ ] **Step 1: Write quality, diff, and export tests**

```js
test("quality gate blocks circular dependencies and open hard blockers", () => {
  const result = evaluateDeliveryPack(packWithCycleAndBlocker());
  assert.equal(result.ready, false);
  assert.ok(result.findings.some((item) => item.code === "dependency-cycle"));
  assert.ok(result.findings.some((item) => item.code === "open-hard-blocker"));
});

test("V2 diff returns task and regression-test impact", () => {
  const impact = diffDeliveryPacks(v1, v2);
  assert.ok(impact.tasks.modified.length >= 1);
  assert.ok(impact.affectedTests.length >= 1);
  assert.match(toCodexContext(v2), /验收标准/);
  assert.match(toTaskCsv(v2), /^id,role,title,priority/m);
});
```

- [ ] **Step 2: Verify the tests fail for missing modules**

Run: `node --test tests/gamespec-relay-quality.test.mjs tests/gamespec-relay-diff-export.test.mjs`
Expected: FAIL with missing `quality.js`, `diff.js`, and `exporters.js`.

- [ ] **Step 3: Implement deterministic validators, semantic diff, and escaped serializers**

```js
export function diffDeliveryPacks(before, after) {
  return {
    decisions: diffById(before.decisions, after.decisions),
    questions: diffById(before.questions, after.questions),
    tasks: diffById(before.tasks, after.tasks),
    tests: diffById(before.tests, after.tests),
    affectedTests: after.tests.filter((testCase) => testCase.taskIds.some((id) => changedTaskIds.has(id))),
  };
}
```

CSV serialization must escape quotes, commas, and newlines; JSON must include the edited current pack; Markdown and Codex formats must include unresolved blockers and evidence references.

- [ ] **Step 4: Run all core tests**

Run: `node --test tests/gamespec-relay-*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/gamespec-relay/app/core tests/gamespec-relay-quality.test.mjs tests/gamespec-relay-diff-export.test.mjs
git commit -m "feat: validate compare and export delivery packs"
```

### Task 4: Persistence and optional model adapter

**Files:**
- Create: `projects/gamespec-relay/app/store.js`
- Create: `projects/gamespec-relay/app/core/model-adapter.js`
- Create: `tests/gamespec-relay-store.test.mjs`
- Create: `tests/gamespec-relay-model-adapter.test.mjs`

**Interfaces:**
- Produces: `createRelayStore(storage)`, `runCompatibleModel({ endpoint, model, apiKey, sources, fetchImpl })`.

- [ ] **Step 1: Write persistence and adapter tests**

```js
test("edited task and confirmed question survive store reload", () => {
  const storage = memoryStorage();
  const first = createRelayStore(storage);
  first.saveProject(editedProject);
  assert.deepEqual(createRelayStore(storage).loadProject(editedProject.id), editedProject);
});

test("model adapter rejects invalid pack and never returns the key", async () => {
  await assert.rejects(() => runCompatibleModel({ endpoint: "https://example.test/v1", model: "demo", apiKey: "secret", sources: [], fetchImpl: invalidPackFetch }), /DeliveryPack/);
  assert.doesNotMatch(JSON.stringify(capturedRequestWithoutHeaders), /secret/);
});
```

- [ ] **Step 2: Run and verify failures**

Run: `node --test tests/gamespec-relay-store.test.mjs tests/gamespec-relay-model-adapter.test.mjs`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement immutable persistence and validated adapter fallback contract**

```js
export async function runCompatibleModel({ endpoint, model, apiKey, sources, fetchImpl = fetch }) {
  const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: buildMessages(sources) }),
  });
  if (!response.ok) throw new Error(`模型请求失败（HTTP ${response.status}）`);
  return assertDeliveryPack(JSON.parse(extractContent(await response.json())));
}
```

Browser storage must never persist the API key. The desktop bridge may use the OS user-data settings file, but the renderer receives only `configured: true/false`.

- [ ] **Step 4: Run persistence and adapter tests**

Run: `node --test tests/gamespec-relay-store.test.mjs tests/gamespec-relay-model-adapter.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/gamespec-relay/app/store.js projects/gamespec-relay/app/core/model-adapter.js tests/gamespec-relay-store.test.mjs tests/gamespec-relay-model-adapter.test.mjs
git commit -m "feat: persist projects and support optional models"
```

### Task 5: Responsive web workbench and complete demo flow

**Files:**
- Create: `projects/gamespec-relay/index.html`
- Create: `projects/gamespec-relay/shell.css`
- Create: `projects/gamespec-relay/app/index.html`
- Create: `projects/gamespec-relay/app/app.css`
- Create: `projects/gamespec-relay/app/main.js`
- Create: `tests/gamespec-relay-page.test.mjs`
- Create: `tests/gamespec-relay-browser-smoke.mjs`

**Interfaces:**
- Consumes every core interface and `createRelayStore`.
- Produces stable DOM contracts: `#loadSample`, `#sourceInput`, `#analyzeButton`, `#decisionList`, `#questionList`, `#taskLanes`, `#healthPanel`, `#saveVersion`, `#loadChangeSample`, `#diffPanel`, and export buttons.

- [ ] **Step 1: Write static page contracts and Playwright scenario**

```js
test("web page exposes the full requirement-to-delivery workflow", async () => {
  const html = await readFile(pagePath, "utf8");
  for (const id of ["loadSample", "analyzeButton", "taskLanes", "healthPanel", "saveVersion", "diffPanel"]) assert.match(html, new RegExp(`id=["']${id}["']`));
});
```

The browser smoke must load the sample, analyze, assert 5+ role lanes and 8+ criteria, edit a task, confirm one question, reload and verify persistence, create V2, inspect affected tests, and exercise four exports at `1440×900` and `390×844` with zero horizontal overflow and browser errors.

- [ ] **Step 2: Run tests and verify missing page failure**

Run: `node --test tests/gamespec-relay-page.test.mjs`
Expected: FAIL because `projects/gamespec-relay/app/index.html` does not exist.

- [ ] **Step 3: Implement the accessible three-column workbench and mobile stepper**

```html
<main class="relay-workbench">
  <section class="source-pane" aria-labelledby="sourceTitle"></section>
  <section class="decision-pane" aria-labelledby="decisionTitle"></section>
  <section class="delivery-pane" aria-labelledby="deliveryTitle"></section>
</main>
```

All controls must have real behavior. Blocking questions use icon plus text, not color alone. The outer page must use `assets/subpage-shell.css`, a fixed `返回主页` link to `../../index.html#apps`, and an iframe loading state matching current Hub subpage conventions.

- [ ] **Step 4: Run static, core, and browser tests**

Run: `node --test tests/gamespec-relay-*.test.mjs && node tests/gamespec-relay-browser-smoke.mjs`
Expected: PASS on both viewports with no console, page, request, or overflow failures.

- [ ] **Step 5: Commit**

```bash
git add projects/gamespec-relay tests/gamespec-relay-page.test.mjs tests/gamespec-relay-browser-smoke.mjs
git commit -m "feat: build GameSpec Relay web workbench"
```

### Task 6: Secure Electron desktop application

**Files:**
- Create: `build/gamespec-relay-desktop/package.json`
- Create: `build/gamespec-relay-desktop/package-lock.json`
- Create: `build/gamespec-relay-desktop/main.cjs`
- Create: `build/gamespec-relay-desktop/preload.cjs`
- Create: `build/gamespec-relay-desktop/scripts/verify-package.mjs`
- Create: `build/gamespec-relay-desktop/scripts/smoke-project.mjs`
- Create: `build/gamespec-relay-desktop/README.md`
- Create: `tests/gamespec-relay-desktop.test.mjs`

**Interfaces:**
- Renderer bridge: `window.gameSpecDesktop.openSources()`, `saveProject(project)`, `loadProject()`, `exportFile({ name, mime, content })`, `getModelStatus()`, and `configureModel(settings)`.

- [ ] **Step 1: Write desktop security and package-contract tests**

```js
test("desktop BrowserWindow isolates the renderer", async () => {
  const main = await readFile(mainPath, "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.doesNotMatch(main, /enableRemoteModule:\s*true/);
});
```

- [ ] **Step 2: Run the contract test**

Run: `node --test tests/gamespec-relay-desktop.test.mjs`
Expected: FAIL because the desktop build directory does not exist.

- [ ] **Step 3: Implement the minimal IPC bridge, smoke mode, and locked build scripts**

```js
const window = new BrowserWindow({
  width: 1440, height: 920, minWidth: 1024, minHeight: 700,
  webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
});
```

`--smoke-test` must open the packaged app, invoke the built-in sample through the renderer, assert an export payload is generated, and exit with code 0. The Windows target is portable x64; macOS targets are x64 and arm64 directories zipped without losing executable bits.

- [ ] **Step 4: Install, test, and build the local Windows package**

Run: `npm ci && npm test && npm run dist:win && node scripts/verify-package.mjs dist windows`
Working directory: `build/gamespec-relay-desktop`
Expected: all tests pass, a non-empty Windows executable exists, and package verification reports `windows-native`.

- [ ] **Step 5: Launch packaged smoke mode and commit**

Run: `Start-Process -FilePath '.\dist\GameSpec-Relay-Windows-x64.exe' -ArgumentList '--smoke-test' -Wait -PassThru`
Expected: exit code 0.

```bash
git add build/gamespec-relay-desktop tests/gamespec-relay-desktop.test.mjs
git commit -m "feat: package GameSpec Relay desktop app"
```

### Task 7: Cross-platform release workflow and immutable assets

**Files:**
- Create: `.github/workflows/build-gamespec-relay-release.yml`
- Create: `projects/gamespec-relay/release-notes.md`
- Create: `tests/gamespec-relay-release-workflow.test.mjs`

**Interfaces:**
- Tag: `gamespec-relay-v1.0.0`.
- Assets: `GameSpec-Relay-Windows-x64.zip`, `GameSpec-Relay-macOS.zip`, `SHA256SUMS.txt`.

- [ ] **Step 1: Write workflow contract tests**

```js
test("release workflow builds and launches every target", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  for (const runner of ["windows-latest", "macos-15-intel", "macos-14"]) assert.match(workflow, new RegExp(runner));
  assert.match(workflow, /--smoke-test/g);
  assert.match(workflow, /gh release create/);
});
```

- [ ] **Step 2: Run and verify missing workflow failure**

Run: `node --test tests/gamespec-relay-release-workflow.test.mjs`
Expected: FAIL because the workflow is absent.

- [ ] **Step 3: Implement three build jobs plus immutable release assembly**

Use Windows x64, Intel macOS, and Apple Silicon macOS runners. Each job runs locked install, core tests, packaged build, architecture verification, ad-hoc signing on macOS, and packaged smoke mode. The release job combines both `.app` variants under `x64/` and `arm64/`, emits SHA-256, and refuses to replace an existing release.

- [ ] **Step 4: Run workflow and desktop contract tests**

Run: `node --test tests/gamespec-relay-desktop.test.mjs tests/gamespec-relay-release-workflow.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build-gamespec-relay-release.yml projects/gamespec-relay/release-notes.md tests/gamespec-relay-release-workflow.test.mjs
git commit -m "ci: build GameSpec Relay desktop releases"
```

### Task 8: Hub catalog and publication contracts

**Files:**
- Modify: `app-20260706-restore-games.js`
- Modify: `scripts/hub-publication-audit.mjs`
- Create: `tests/gamespec-relay-publish.test.mjs`

**Interfaces:**
- Catalog ID: `gamespec-relay`, status `assistant`, application-grid last item.
- URLs: `./projects/gamespec-relay/index.html`, `./projects/gamespec-relay/video/index.html`, immutable v1.0.0 release asset URLs.

- [ ] **Step 1: Write publication tests**

```js
test("GameSpec Relay is the final application with four real actions", async () => {
  const apps = await loadDefaultAppsFromRuntime(root);
  const relay = apps.find((app) => app.id === "gamespec-relay");
  assert.equal(relay.status, "assistant");
  assert.deepEqual([relay.platforms.web.label, "视频", relay.platforms.windows.label, relay.platforms.mac.label], ["演示", "视频", "Wins下载", "Mac下载"]);
  assert.equal(apps.filter((app) => app.status === "assistant").at(-1).id, "gamespec-relay");
});
```

- [ ] **Step 2: Run and verify missing catalog entry failure**

Run: `node --test tests/gamespec-relay-publish.test.mjs`
Expected: FAIL because the catalog ID is missing.

- [ ] **Step 3: Append the catalog entry and exact migration rule**

```js
{
  id: "gamespec-relay", name: "GameSpec Relay", badge: "游戏研发 Agent", status: "assistant",
  folder: "./projects/gamespec-relay/", entry: "./projects/gamespec-relay/index.html",
  video: "./projects/gamespec-relay/video/index.html",
  platforms: {
    web: { href: "./projects/gamespec-relay/index.html", label: "演示" },
    windows: { href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/gamespec-relay-v1.0.0/GameSpec-Relay-Windows-x64.zip", label: "Wins下载" },
    mac: { href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/gamespec-relay-v1.0.0/GameSpec-Relay-macOS.zip", label: "Mac下载" },
  },
}
```

Add `gamespec-relay` to the audit's native project set so the audit rejects source or generic archives masquerading as platform builds.

- [ ] **Step 4: Run publication tests and audit**

Run: `node --test tests/gamespec-relay-publish.test.mjs && npm run audit:hub`
Expected: tests pass and the audit reports zero findings once release URLs are available; before tagging, online checks are omitted.

- [ ] **Step 5: Commit**

```bash
git add app-20260706-restore-games.js scripts/hub-publication-audit.mjs tests/gamespec-relay-publish.test.mjs
git commit -m "feat: add GameSpec Relay to the Hub"
```

### Task 9: Tutorial recording, captions, poster, and standardized video page

**Files:**
- Create: `scripts/record-gamespec-relay-demo.mjs`
- Create: `scripts/build-gamespec-relay-video.mjs`
- Create: `projects/gamespec-relay/video/index.html`
- Create: `projects/gamespec-relay/video/gamespec-relay-demo.vtt`
- Generate: `projects/gamespec-relay/video/gamespec-relay-demo.mp4`
- Generate: `projects/gamespec-relay/video/poster.jpg`
- Create: `tests/gamespec-relay-video.test.mjs`

**Interfaces:**
- Recording manifest chapters at 0, 15, 40, 75, 120, 150, and final duration.

- [ ] **Step 1: Write video-page and media tests**

```js
test("tutorial page uses the shared player and one-line caption track", async () => {
  const html = await readFile(videoPage, "utf8");
  assert.match(html, /assets\/hub-video-player\.css/);
  assert.match(html, /kind="captions"/);
  const cues = parseVtt(await readFile(vttPath, "utf8"));
  assert.ok(cues.every((cue) => !cue.text.includes("\n")));
});
```

- [ ] **Step 2: Run test and verify missing media/page failure**

Run: `node --test tests/gamespec-relay-video.test.mjs`
Expected: FAIL because the video page and media are missing.

- [ ] **Step 3: Implement deterministic recording and H.264 assembly**

The recording script must drive the real app through sample load, analysis, decision review, task lanes, health gate, V2 diff, and export. The build script must combine captured frames and narrated timing, then use the repository's locked `ffmpeg-static` path to emit 1280×720 H.264/yuv420p with a duration between 150 and 210 seconds.

- [ ] **Step 4: Generate and inspect media**

Run: `node scripts/record-gamespec-relay-demo.mjs && node scripts/build-gamespec-relay-video.mjs && node tests/media-inspect.mjs projects/gamespec-relay/video/gamespec-relay-demo.mp4`
Expected: H.264, 1280×720, 150-210 seconds, browser-compatible audio/video streams, poster and VTT present.

- [ ] **Step 5: Run video and browser playback tests, then commit**

Run: `node --test tests/gamespec-relay-video.test.mjs && node tests/gamespec-relay-browser-smoke.mjs --video`
Expected: click-to-load playback advances, captions are `showing`, and no media or browser errors occur.

```bash
git add scripts/record-gamespec-relay-demo.mjs scripts/build-gamespec-relay-video.mjs projects/gamespec-relay/video tests/gamespec-relay-video.test.mjs
git commit -m "feat: add GameSpec Relay tutorial video"
```

### Task 10: Full verification, release, Pages publication, and public audit

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-gamespec-relay.md` only to check completed boxes.
- Modify after proof: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/Vibe-Coding-AI-Competition.md` and `AI-Application-Hub.md`.

**Interfaces:**
- Proof bundle: exact Git commit SHA, release tag/assets/digests, workflow run IDs, Pages run ID, public URLs, video metadata, desktop launch evidence.

- [ ] **Step 1: Run fresh local verification**

Run: `node --test tests/gamespec-relay-*.test.mjs && node tests/gamespec-relay-browser-smoke.mjs && npm run audit:hub && git diff --check`
Expected: zero failures, zero publication findings, zero browser errors/overflow, and clean whitespace check.

- [ ] **Step 2: Push the feature branch and verify current GitHub write identity**

Run: `ssh -T git@github.com` followed by a non-force `git push -u origin <feature-branch>`.
Expected: authentication identifies `wthpein010-dev`; push is a fast-forward creation/update without exposing credentials.

- [ ] **Step 3: Merge through the repository's current protected-main workflow**

Create a PR, require the full verification and macOS audit checks, merge only after the exact head SHA is green, and verify `origin/main` contains the feature commit. Do not force-push or overwrite concurrent changes.

- [ ] **Step 4: Tag and verify desktop release**

Push `gamespec-relay-v1.0.0` at the verified merged commit. Wait for all three build jobs and release assembly. Download every asset, verify byte size, SHA-256, archive contents, Windows executable, both `.app` architectures, and the workflow smoke evidence.

- [ ] **Step 5: Wait for Pages and perform public browser/media/download acceptance**

Verify Hub card uniqueness and ordering, all four actions, desktop and 390×844 layouts, complete sample workflow, V2 diff, exports, zero console/request/page errors, video click-to-play and captions, MP4 Range `206`, and all download URLs. Confirm every public text/media file matches the merged commit or release digest.

- [ ] **Step 6: Record confirmed long-term state and close the goal**

Update both project memories with date, source, status, scope, public URLs, exact SHA, workflow IDs, media duration/hash, package sizes/hashes, platform evidence, test counts, blockers, and next step. Only after the requirement-by-requirement audit proves every item should `update_goal({ status: "complete" })` be called.

---

## Plan Self-Review

- Spec coverage: Tasks 1-5 cover the offline DeliveryPack workflow, evidence, editing, persistence, V1/V2 impact, four exports, mobile layout, and optional models. Tasks 6-8 cover secure desktop packages, three-platform CI evidence, and the Hub four-action contract. Tasks 9-10 cover the real tutorial video, media constraints, protected publication, public acceptance, and memory maintenance.
- Placeholder scan: the plan contains no unfinished marker, deferred implementation instruction, or undefined cross-task shorthand.
- Type consistency: every downstream consumer uses `DeliveryPack`; analyzer, model adapter, store, diff, quality, exporters, renderer, desktop, and tests use the function names defined in Tasks 1-4.
- Scope control: Feishu/GitHub external writes, audio/video transcription, repository-wide code impact analysis, accounts, and cloud collaboration remain explicitly outside MVP.
