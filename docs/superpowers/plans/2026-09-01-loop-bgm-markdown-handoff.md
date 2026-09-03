# Loop BGM Lab Lossless Markdown Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the UI-generated Markdown handoff restore the exact validated project while detecting corruption and protecting invalid existing local state from silent overwrite.

**Architecture:** A new DOM-free portable-handoff module appends a versioned base64url envelope containing canonical project JSON and verifies its byte length and SHA-256 before delegating to the existing JSON importer. The browser coordinator uses that module for Markdown download and shared JSON/Markdown import, while a small persistence guard quarantines invalid stored state until a successful explicit import.

**Tech Stack:** Browser ES modules, Web Crypto, `TextEncoder`/fatal `TextDecoder`, Node test runner, Playwright, static HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-loop-bgm-markdown-handoff-design.md`

## Global Constraints

- Project schema remains version 2; StyleSpec remains version 1.
- The envelope digest provides corruption detection, not author authentication.
- Human Markdown is never parsed into project fields; only the unique trailing envelope is authoritative.
- Decoded state always passes through `importProjectJson`; do not duplicate or weaken portable safety or migrations.
- The importer performs no network request and embeds no audio bytes, paths, file names, credentials, cookies, tokens, API keys, recovery keys, or sessions.
- A failed import or invalid stored project must not replace application state, release audio, or overwrite local storage.
- Whole documents are capped at 48 MiB and embedded canonical JSON at 16 MiB.

---

### Task 1: Versioned Markdown envelope core

**Files:**
- Create: `projects/loop-bgm-lab/core/portable-handoff.mjs`
- Create: `tests/loop-bgm-lab-portable-handoff.test.mjs`

**Interfaces:**
- Consumes: `exportProjectJson(project)`, `exportProjectMarkdown(project)`, and `importProjectJson(text)` from `core/project-state.mjs`; browser/Node `globalThis.crypto.subtle`.
- Produces: `MAX_PROJECT_DOCUMENT_BYTES`, `MAX_EMBEDDED_PROJECT_BYTES`, `exportProjectHandoffMarkdown(project)`, and `importProjectDocument(text)`.

- [ ] **Step 1: Write failing round-trip and compatibility tests**

Add tests that construct a validated schema-v2 project with Unicode labels, `extensions`, two run outputs, an `outputIndex`, a license, a current best candidate, and a review note containing the reserved marker text. Assert:

```js
const markdown = await exportProjectHandoffMarkdown(project);
const restored = await importProjectDocument(markdown);
assert.equal(restored.format, "markdown");
assert.deepEqual(restored.project, validateProject(project));
assert.equal((markdown.match(/LOOP-BGM-LAB-PORTABLE-STATE-BEGIN/g) || []).length, 1);
assert.doesNotMatch(markdown.slice(0, markdown.indexOf("<!-- LOOP-BGM-LAB-PORTABLE-STATE-BEGIN")), /LOOP-BGM-LAB-PORTABLE-STATE-BEGIN/);

const jsonRestored = await importProjectDocument(`\uFEFF${exportProjectJson(project)}`);
assert.equal(jsonRestored.format, "json");
assert.deepEqual(jsonRestored.project, validateProject(project));
```

Name the break caught: Markdown omits a persisted field or the document importer stops delegating to canonical JSON validation.

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
node --test tests/loop-bgm-lab-portable-handoff.test.mjs
```

Expected: FAIL because `core/portable-handoff.mjs` does not exist.

- [ ] **Step 3: Write failing corruption and boundary tests**

Use literal marker fixtures and an independent test-only Web Crypto helper to assert rejection of missing/duplicate/reordered markers, unknown version/encoding/key, malformed base64url, non-canonical padding, invalid UTF-8, byte-length mismatch, SHA mismatch, trailing non-whitespace content, a document over 48 MiB, and a decoded payload over 16 MiB. Convert a valid export to CRLF and assert it still restores. Change readable prose before the envelope and assert the restored project remains identical.

Build a valid-digest envelope around a project containing `extensions: { token: "secret" }` and assert `importProjectDocument` rejects it with the existing forbidden-key error. Name the break caught: envelope integrity is incorrectly treated as authorization or bypasses portable validation.

- [ ] **Step 4: Implement the minimal envelope module**

Implement fixed markers and metadata keys, byte limits, base64url helpers, and SHA-256 helpers. The public flow must retain this shape:

```js
export async function exportProjectHandoffMarkdown(project) {
  const canonicalJson = exportProjectJson(project);
  const bytes = new TextEncoder().encode(canonicalJson);
  if (bytes.byteLength > MAX_EMBEDDED_PROJECT_BYTES) fail("embedded project exceeds 16 MiB");
  const sha256 = await sha256Hex(bytes);
  const readable = redactReservedMarkers(exportProjectMarkdown(project)).trimEnd();
  const payload = wrapBase64Url(encodeBase64Url(bytes), 96);
  const markdown = `${readable}\n\n${beginMetadata(bytes.byteLength, sha256)}\n\`\`\`loop-bgm-lab-state\n${payload}\n\`\`\`\n${END_MARKER}\n`;
  assertDocumentByteLimit(markdown);
  return markdown;
}

export async function importProjectDocument(text) {
  const normalized = assertDocumentTextAndLimit(text).replace(/^\uFEFF/, "");
  if (normalized.trimStart().startsWith("{")) {
    return { project: importProjectJson(normalized.trimStart()), format: "json" };
  }
  const envelope = extractUniqueTrailingEnvelope(normalized);
  const bytes = decodeCanonicalBase64Url(envelope.payload);
  assertEmbeddedLength(bytes, envelope.byteLength);
  if (await sha256Hex(bytes) !== envelope.sha256) fail("Markdown handoff SHA-256 mismatch");
  const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { project: importProjectJson(json), format: "markdown" };
}
```

Use exact metadata-key validation and explicit error messages. Do not parse generic JSON fences or readable headings.

- [ ] **Step 5: Run focused core tests and confirm GREEN**

Run:

```powershell
node --test tests/loop-bgm-lab-portable-handoff.test.mjs tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-project-state-hardening.test.mjs
```

Expected: all tests pass with no warnings or unhandled rejections.

- [ ] **Step 6: Commit the core slice**

```powershell
git add projects/loop-bgm-lab/core/portable-handoff.mjs tests/loop-bgm-lab-portable-handoff.test.mjs
git commit -m "feat: add verified Markdown project envelope"
```

### Task 2: Unified JSON and Markdown browser handoff

**Files:**
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `projects/loop-bgm-lab/index.html`
- Modify: `projects/loop-bgm-lab/core/prompt-engine.mjs`
- Modify: `tests/loop-bgm-lab-page.test.mjs`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 1 exports and the existing staged-render/import commit sequence.
- Produces: an asynchronous Markdown download, a shared `.json`/`.md` picker, format-specific success text, and default `toolVersion: "loop-bgm-lab/1.2.0"`.

- [ ] **Step 1: Write failing page-contract tests**

Assert the picker advertises both formats and the coordinator imports Task 1 APIs:

```js
assert.match(html, /accept="[^"]*\.json[^"]*\.md[^"]*application\/json[^"]*text\/markdown[^"]*"/);
assert.match(source, /exportProjectHandoffMarkdown/);
assert.match(source, /importProjectDocument/);
assert.match(html, /JSON[^<]*Markdown[^<]*完整恢复/);
```

Name the break caught: the UI claims restorable Markdown but still only accepts JSON or downloads the human-only summary.

- [ ] **Step 2: Write a failing real-browser Markdown round-trip**

In the existing smoke test, set a portable display label, download `#export-markdown`, read its bytes, open a fresh browser context at the same app URL, and import those bytes as `loop-bgm-lab-handoff.md` with MIME `text/markdown`. Assert the restored label is visible, `#import-status` names Markdown, local storage contains schema version 2, and there are no console/page/request errors.

Name the break caught: the core format works in Node but the actual file picker or asynchronous click path fails in Chromium.

- [ ] **Step 3: Run tests and confirm RED**

Run:

```powershell
node --test tests/loop-bgm-lab-page.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

Expected: the page contract and/or browser Markdown import assertion fails because the UI still uses the human-only exporter and JSON-only importer.

- [ ] **Step 4: Implement the browser flow**

Import the Task 1 API and replace the handlers with this ordering:

```js
markdownExportButton.addEventListener("click", async () => {
  markdownExportButton.disabled = true;
  try {
    downloadText(await exportProjectHandoffMarkdown(project), "loop-bgm-lab-handoff.md", "text/markdown;charset=utf-8");
    showLive("已导出可完整恢复且不含音频、路径、个人文件名或秘密的 Markdown。");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Markdown 导出失败。");
  } finally {
    markdownExportButton.disabled = false;
  }
});
```

Before `file.text()`, reject `file.size > MAX_PROJECT_DOCUMENT_BYTES`. Then call `await importProjectDocument(text)`, stage the imported project, and only afterward commit project/selection, release audio, persist, and render. Keep JSON behavior intact and use `result.format` in the success message.

Update the picker accept list and visible copy. Bump only newly created projects to tool version 1.2.0; imported older values remain unchanged.

- [ ] **Step 5: Run page and browser tests and confirm GREEN**

Run:

```powershell
node --test tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-portable-handoff.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

Expected: all checks pass across four viewports with zero browser errors.

- [ ] **Step 6: Commit the browser slice**

```powershell
git add projects/loop-bgm-lab/app.js projects/loop-bgm-lab/index.html projects/loop-bgm-lab/core/prompt-engine.mjs tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "feat: restore projects from Markdown handoffs"
```

### Task 3: Quarantine invalid local state

**Files:**
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

**Interfaces:**
- Consumes: `loadProject`, `persistProject`, `showStorageFailure`, and the successful explicit-import commit path.
- Produces: a `storageWriteBlocked` guard that preserves readable-but-invalid local storage until a valid explicit import succeeds.

- [ ] **Step 1: Write a failing protected-mode browser test**

Create a fresh context with an init script that writes this exact value under `loop-bgm-lab-v1` before application load:

```js
JSON.stringify({ version: 99, preserved: "future-state" })
```

Assert the page opens, the warning distinguishes invalid stored state from unavailable storage, and the raw local-storage value remains byte-for-byte identical after an ordinary style-field change that normally calls `persistProject`. Attempt a corrupted Markdown import and assert the bytes remain identical. Import a valid Task 1 Markdown export and assert storage becomes valid schema-v2 JSON and the warning clears.

Name the break caught: startup falls back to a default project and a later normal edit silently destroys the only future/invalid payload.

- [ ] **Step 2: Run the browser test and confirm RED**

Run:

```powershell
node tests/loop-bgm-lab-browser-smoke.mjs
```

Expected: the invalid payload is overwritten after the ordinary edit.

- [ ] **Step 3: Implement separate access-failure and validation-failure paths**

Keep storage access and project parsing in separate `try` blocks:

```js
let storageWriteBlocked = false;

function loadProject() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    showStorageFailure();
    return defaultProject();
  }
  if (!stored) return defaultProject();
  try {
    return importProjectJson(stored);
  } catch (error) {
    storageWriteBlocked = true;
    showStorageQuarantine(error);
    return defaultProject();
  }
}

function persistProject() {
  if (storageWriteBlocked) {
    showStorageQuarantine();
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, exportProjectJson(project));
    return true;
  } catch {
    showStorageFailure();
    return false;
  }
}
```

After a document validates and staged rendering succeeds, set `storageWriteBlocked = false` immediately before the explicit import commit calls `persistProject`. Do not clear it on failed import or ordinary edits.

- [ ] **Step 4: Run the browser test and focused suite and confirm GREEN**

Run:

```powershell
node tests/loop-bgm-lab-browser-smoke.mjs
$tests = rg --files tests | Where-Object { $_ -match '^tests[/\\]loop-bgm-lab.*\.test\.mjs$' }
node --test $tests
```

Expected: all Loop BGM tests pass; the invalid stored bytes survive until explicit valid import.

- [ ] **Step 5: Commit the persistence slice**

```powershell
git add projects/loop-bgm-lab/app.js tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "fix: quarantine invalid portable project state"
```

### Task 4: Full verification and release evidence

**Files:**
- Modify only if a failing verification exposes a scoped defect in Tasks 1–3; add the reproducing test before any fix.

**Interfaces:**
- Consumes: the completed feature branch.
- Produces: clean focused/full test evidence, publication audit evidence, a reviewed branch, and a merge-ready pull request.

- [ ] **Step 1: Run formatting and privacy scans**

```powershell
git diff --check origin/main...HEAD
rg -n -i "C:\\Users\\|Downloads\\|cookie[=:]|token[=:]|api[_-]?key[=:]|recovery[_-]?key[=:]" projects/loop-bgm-lab docs/superpowers/specs/2026-09-01-loop-bgm-markdown-handoff-design.md docs/superpowers/plans/2026-09-01-loop-bgm-markdown-handoff.md
```

Expected: no local user path, credential value, raw audio payload, or whitespace error.

- [ ] **Step 2: Run the complete local workflow**

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
node --test
node scripts/hub-publication-audit.mjs
node tests/hub-video-pages-browser-smoke.mjs
node tests/hub-entry-pages-browser-smoke.mjs
node tests/x-ai-codex-radar-browser-smoke.mjs
node tests/clickflow-browser-smoke.mjs
```

Expected: zero failures and zero Hub audit findings.

- [ ] **Step 3: Request independent specification and code-quality review**

Give reviewers the spec, plan, `origin/main...HEAD` diff, focused test commands, and security invariants. Resolve every P0/P1 with a failing regression test before changing production code, then rerun Step 2.

- [ ] **Step 4: Push and open the pull request**

```powershell
git push -u origin feat/loop-bgm-lab-markdown-handoff
gh pr create --base main --head feat/loop-bgm-lab-markdown-handoff --title "feat: restore Loop BGM projects from Markdown" --body "Adds a versioned SHA-256 checked Markdown envelope, reuses canonical JSON validation for restore, quarantines invalid local state, and keeps audio, paths, file names, and secrets out of portable exports. SHA-256 detects corruption and is not an authenticity signature."
```

The prepared body must summarize the envelope, JSON-validator reuse, invalid-state quarantine, tests, privacy boundary, and the fact that SHA-256 is not authentication.

- [ ] **Step 5: Verify exact remote workflows and publication after merge**

Wait for the exact-head full verification and Pages runs. After merge, compare the five changed public assets against the merge commit bytes and run a fresh online browser context that exports/imports Markdown with zero console, page, or request errors.

- [ ] **Step 6: Update long-term project memory**

Record the merged PR/commit, schema/envelope versions, verified behavior, test/workflow evidence, and remaining authorization-bundle and Suno-browser blockers in `E:\CodexData\memory\Codex-Memory\05-项目记忆\循环乐工房.md`. Do not record local reference paths, raw audio, credentials, cookies, tokens, API keys, recovery keys, or browser sessions.
