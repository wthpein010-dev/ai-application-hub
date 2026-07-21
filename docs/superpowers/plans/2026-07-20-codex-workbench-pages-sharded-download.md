# Codex Workbench Pages Sharded Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the 65,596,799-byte Codex Thread Workbench ZIP through GitHub Pages as eight verified chunks that the browser reassembles and downloads safely.

**Architecture:** A static manifest describes the archive and ordered chunks. A dependency-injected ES module validates the manifest, downloads and retries chunks sequentially, verifies each part and the combined SHA-256, and returns the final bytes. A thin browser controller renders progress and only triggers the ZIP download after all validation passes.

**Tech Stack:** Static HTML/CSS, browser ES modules, Fetch API, Web Crypto, Node.js built-in test runner, Node `crypto` and `fs`.

## Global Constraints

- Final file name: `CodexThreadWorkbench-Windows-x64.zip`.
- Final size: `65,596,799` bytes.
- Final SHA-256: `1D78557926FB97F46CF7FAA068BA65BEE12C3C7EA9DC3F9235450A9AB17CF454`.
- Chunk size: `8,388,608` bytes; eight chunks total.
- Each chunk is committed and pushed independently with non-forced fast-forward ancestry and an exact remote-main lease.
- Existing GamePulse, QuotaBar, Paws, and all other current-main commits must be preserved.
- The four existing Windows package links must point to the Pages download page; no known-404 Release URL remains.

---

### Task 1: Contract and behavior tests

**Files:**
- Create: `tests/codex-thread-workbench-download.test.mjs`
- Modify: `tests/codex-thread-workbench-page.test.mjs`

**Interfaces:**
- Consumes: future exports `validateManifest(manifest)` and `assembleDownload(manifest, options)` from `projects/codex-thread-workbench/download/download-core.js`
- Produces: executable contracts for manifest shape, ordered fetch, retry, length checks, SHA checks, UI copy, and Hub link routing

- [ ] **Step 1: Write the failing tests**

Add tests that:

```js
assert.equal(manifest.totalSize, 65_596_799);
assert.equal(manifest.chunkSize, 8_388_608);
assert.equal(manifest.parts.length, 8);
assert.deepEqual(manifest.parts.map(part => part.index), [0, 1, 2, 3, 4, 5, 6, 7]);
assert.equal(manifest.parts.reduce((sum, part) => sum + part.size, 0), manifest.totalSize);
assert.equal(manifest.sha256, "1D78557926FB97F46CF7FAA068BA65BEE12C3C7EA9DC3F9235450A9AB17CF454");
```

Use synthetic parts and injected `fetchImpl`/`digestHex` functions to assert ordered fetch, retry after a failed response, rejection after three failures, part-length rejection, and final-hash rejection.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test tests/codex-thread-workbench-download.test.mjs tests/codex-thread-workbench-page.test.mjs
```

Expected: failure because `download-core.js`, `manifest.json`, the download page, and new Hub routes do not exist.

### Task 2: Downloader core and static page

**Files:**
- Create: `projects/codex-thread-workbench/download/download-core.js`
- Create: `projects/codex-thread-workbench/download/download.js`
- Create: `projects/codex-thread-workbench/download/index.html`
- Create: `projects/codex-thread-workbench/download/styles.css`

**Interfaces:**
- `validateManifest(manifest: object): object` returns the validated manifest or throws a descriptive error.
- `assembleDownload(manifest, { fetchImpl, digestHex, onProgress, maxAttempts }): Promise<Uint8Array>` returns verified archive bytes.
- `sha256Hex(bytes: Uint8Array): Promise<string>` uses Web Crypto and returns uppercase hexadecimal.
- Browser controller loads `manifest.json`, updates progress/status elements, retries from the start after failure, and downloads only verified bytes.

- [ ] **Step 1: Implement manifest validation**

Validate version, file name, sizes, uppercase 64-character hashes, contiguous indexes, unique paths, and exact size sum.

- [ ] **Step 2: Implement sequential retrying assembly**

For each part, fetch in order, require `response.ok`, convert to bytes, require exact size, verify per-part SHA, report progress, and retry up to `maxAttempts`. Concatenate in order and verify final length and SHA.

- [ ] **Step 3: Implement the page controller**

Load `manifest.json` on page start. On click, disable the primary button, render part and byte progress, call `assembleDownload`, create an `application/zip` Blob, trigger the manifest file name, revoke the object URL, and render success. On error, show the message and a retry button.

- [ ] **Step 4: Run focused tests**

Run the Task 1 command. Expected: behavior tests pass except manifest-file and Hub-route assertions that remain red until Tasks 3 and 5.

### Task 3: Reproducible chunk generation

**Files:**
- Create: `scripts/split-codex-thread-workbench.mjs`
- Generate locally: `projects/codex-thread-workbench/download/manifest.json`
- Generate locally: `projects/codex-thread-workbench/download/parts/part-000.bin` through `part-007.bin`

**Interfaces:**
- Command: `node scripts/split-codex-thread-workbench.mjs <source-zip> <download-directory>`
- Produces exactly eight chunk files and a deterministic manifest with per-part SHA-256 values.

- [ ] **Step 1: Implement the splitter**

Read the source ZIP, reject an unexpected final size or SHA, slice by 8 MiB, write `part-NNN.bin`, compute each SHA-256, and write formatted JSON.

- [ ] **Step 2: Run the splitter**

Use the verified source:

```powershell
node scripts/split-codex-thread-workbench.mjs ..\CodexThreadWorkbench\artifacts\release\CodexThreadWorkbench-Windows-x64.zip projects\codex-thread-workbench\download
```

- [ ] **Step 3: Verify generated data**

Require 8 chunks, seven 8,388,608-byte files, one 6,876,543-byte file, exact total length, exact final SHA, unique part hashes, and byte-for-byte reassembly equal to the source ZIP.

### Task 4: Local GREEN and infrastructure commit

**Files:**
- Commit the four download-page files and splitter script.
- Keep `manifest.json`, parts, tests, and link changes local until their later activation commits.

- [ ] **Step 1: Run focused and full Hub tests**

Run:

```powershell
node --test tests\codex-thread-workbench-download.test.mjs tests\codex-thread-workbench-page.test.mjs
node --test tests\*.test.mjs
```

Expected: all tests pass locally with generated manifest and parts present.

- [ ] **Step 2: Commit infrastructure**

Commit the spec, plan, downloader page/core/controller/styles, and splitter without chunk binaries or activation links.

- [ ] **Step 3: Fetch and integrate current main**

Fetch `origin/main`. Before any production push, rebase only unpublished commits onto current main. Verify current remote main is an ancestor of the new head.

- [ ] **Step 4: Push infrastructure as a fast-forward**

Push to `main` with an exact expected remote SHA lease. Re-read `refs/heads/main` and require it equals the pushed commit.

### Task 5: Eight independent chunk commits and pushes

**Files:**
- Add one file per commit: `projects/codex-thread-workbench/download/parts/part-NNN.bin`

**Interfaces:**
- Each pushed commit adds exactly one chunk and no other file.

- [ ] **Step 1: For each index 000 through 007, stage one chunk**

Use:

```powershell
git add --sparse -- projects/codex-thread-workbench/download/parts/part-NNN.bin
git diff --cached --stat
git commit -m "release: add workbench download part NNN"
```

- [ ] **Step 2: Before each push, enforce remote safety**

Fetch `origin/main`, read the remote SHA, require it is the direct ancestor of the local commit, and require the local commit is exactly one commit ahead.

- [ ] **Step 3: Push one fast-forward commit**

Push the single commit to `main` with the exact expected remote SHA lease. Do not start another push until `ls-remote` confirms the new SHA.

### Task 6: Activate manifest and all four download routes

**Files:**
- Add: `projects/codex-thread-workbench/download/manifest.json`
- Modify: `app-20260706-restore-games.js`
- Modify: `projects/codex-thread-workbench/index.html`
- Add/modify: `tests/codex-thread-workbench-download.test.mjs`
- Modify: `tests/codex-thread-workbench-page.test.mjs`

**Interfaces:**
- Canonical download-page URL: `https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/`

- [ ] **Step 1: Replace all four Release URLs**

Update Hub `package`, Hub `platforms.windows`, the header download button, and the bottom download link. Assert no `releases/download/codex-thread-workbench-v1.0.0` string remains.

- [ ] **Step 2: Run focused and complete Hub tests**

Run both Task 4 commands and require zero failures.

- [ ] **Step 3: Commit activation**

Commit only manifest, link changes, and tests.

- [ ] **Step 4: Safely fast-forward main**

Fetch, integrate current main without dropping any remote commits, verify ancestry, push with an exact lease, and confirm the remote SHA.

### Task 7: Application and online verification

**Files:**
- No production edits expected.

**Interfaces:**
- Live Pages URL, download page, eight part URLs, and rebuilt ZIP bytes.

- [ ] **Step 1: Re-run application suites**

Run:

```powershell
dotnet test CodexThreadWorkbench.sln --configuration Debug --no-restore --nologo
dotnet test CodexThreadWorkbench.sln --configuration Release --no-restore --nologo
```

Expected: Debug 35/35 and Release 35/35.

- [ ] **Step 2: Wait for Pages and verify HTTP**

Require the download page and each of the eight chunk URLs to return HTTP 200. Require each `Content-Length` or downloaded byte length to match the manifest.

- [ ] **Step 3: Browser reconstruction acceptance**

Open the live download page, invoke the real downloader, wait for successful checksum status, inspect console errors, and verify the resulting download is 65,596,799 bytes with the required SHA-256.

- [ ] **Step 4: Hub acceptance**

Verify `projects/codex-thread-workbench/`, `index.html#games`, and all four rendered Windows download routes target the Pages download page.

- [ ] **Step 5: Preserve deliverables and memory**

Copy ZIP, EXE, and README into `outputs`. Record the completed project, final main commit, URLs, test counts, size, SHA, and maintenance notes in the Codex Obsidian project memory and its indexes.
