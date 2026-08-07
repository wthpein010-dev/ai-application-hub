# macOS Download Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every Mac download exposed by AI Application Hub on native Apple Silicon and Intel runners, repair any unusable package, and publish evidence-backed downloads.

**Architecture:** Treat the Hub runtime catalog as the source of visible Mac actions and add a machine-readable audit manifest that must cover it exactly. A reusable GitHub Actions workflow downloads the same public URLs users receive, validates bytes and archive layout, then performs architecture, signature, launch, and product-specific smoke checks on native macOS runners. The known Codex Quota Bar execute-bit defect is repaired by a dedicated native repack workflow that signs, launches, and republishes both architectures before the full audit runs.

**Tech Stack:** Node.js 24 test runner, PowerShell, Bash, GitHub Actions macOS 14 arm64 and macOS 15 Intel runners, `ditto`, `codesign`, `plutil`, `file`, `shasum`, GitHub Releases, GitHub Pages.

## Global Constraints

- The public catalog must expose exactly the five current Mac downloads: Codex Quota Bar, Codex Thread Workbench, Feishu batch downloader extension, ClickFlow, and PureShrink.
- A native app is accepted only after its exact public download is checked for size and SHA-256, extracted, architecture-checked, signature-checked, and launched on the matching native macOS runner.
- The Feishu browser extension is one cross-platform ZIP; validate its manifest and JavaScript on macOS rather than pretending it is a native `.app`.
- Public URLs and button labels remain stable unless evidence proves the target itself must change.
- Never replace a release asset until the repaired archive has passed native launch verification.
- Preserve unrelated worktree changes and publish only from the isolated `audit/mac-downloads-20260807` branch.

---

### Task 1: Lock the Mac download catalog

**Files:**
- Create: `scripts/macos-download-manifest.mjs`
- Create: `tests/macos-download-manifest.test.mjs`
- Create: `docs/audits/evidence/2026-08-07-macos-download-manifest.json`

**Interfaces:**
- Consumes: `loadDefaultAppsFromRuntime(runtime)` from `tests/helpers/default-apps.mjs` and the public catalog in `app-20260706-restore-games.js`.
- Produces: `validateMacDownloadManifest({ apps, manifest }) -> { native, extension }`, plus a CLI that exits nonzero on missing, duplicate, stale, or mismatched entries.

- [ ] **Step 1: Write the failing catalog coverage test**

```js
test("the Mac audit manifest covers every public Mac action exactly once", () => {
  const result = validateMacDownloadManifest({ apps, manifest });
  assert.deepEqual(result.native.map((item) => item.id), [
    "codex-quota-bar",
    "codex-thread-workbench",
    "clickflow",
    "pureshrink",
  ]);
  assert.deepEqual(result.extension.map((item) => item.id), ["feishu-downloader"]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/macos-download-manifest.test.mjs`

Expected: FAIL because `scripts/macos-download-manifest.mjs` and the audit manifest do not exist.

- [ ] **Step 3: Implement strict validation and the five literal records**

Each record contains `id`, `name`, `kind`, the exact public `url`, expected `bytes`, expected `sha256`, and native architecture metadata or extension metadata. Reject unknown keys, duplicate IDs, missing catalog entries, URL drift, non-HTTPS public URLs, and invalid digest/size fields.

- [ ] **Step 4: Run the focused test and CLI**

Run:

```powershell
node --test tests/macos-download-manifest.test.mjs
node scripts/macos-download-manifest.mjs --check
```

Expected: PASS and print `5 Mac downloads: 4 native, 1 extension`.

- [ ] **Step 5: Commit the catalog gate**

```powershell
git add scripts/macos-download-manifest.mjs tests/macos-download-manifest.test.mjs docs/audits/evidence/2026-08-07-macos-download-manifest.json
git commit -m "test: lock public macOS download catalog"
```

### Task 2: Repair Codex Quota Bar executable permissions

**Files:**
- Modify: `tests/codex-quota-bar-download.test.mjs`
- Create: `projects/codex-quota-bar/release/README-zh-CN.md`
- Create: `.github/workflows/repair-codex-quota-bar-macos.yml`
- Replace after native CI: `downloads/CodexQuotaBar-macOS.zip`
- Update after native CI: `docs/audits/evidence/2026-08-07-macos-download-manifest.json`

**Interfaces:**
- Consumes: the existing release ZIP and its two app bundles.
- Produces: a combined `CodexQuotaBar-macOS.zip` whose two `Contents/MacOS/CodexQuotaBar` entries retain executable bits, contain arm64/x86_64 Mach-O binaries, pass ad-hoc signature validation, and stay alive during a five-second native launch check.

- [ ] **Step 1: Add the failing executable-mode regression**

Parse ZIP central-directory external attributes and assert both executable entries satisfy `(mode & 0o111) !== 0`.

- [ ] **Step 2: Run the regression and verify RED**

Run: `node --test tests/codex-quota-bar-download.test.mjs`

Expected: FAIL because the current public/local archive stores both executables as mode `0664`.

- [ ] **Step 3: Add the native repair workflow**

The arm64 and Intel jobs extract the matching app, apply `chmod 755`, validate `Info.plist`, verify Mach-O architecture, ad-hoc sign the complete app, run `codesign --verify --deep --strict`, launch for five seconds, and package with `ditto --keepParent`. The publish job combines both verified artifacts, preserves executable modes, updates the branch copy and release asset, and writes size/SHA evidence.

- [ ] **Step 4: Dispatch the workflow and ingest the bot commit**

Run:

```powershell
gh workflow run repair-codex-quota-bar-macos.yml --repo wthpein010-dev/ai-application-hub --ref audit/mac-downloads-20260807
$repairRun = gh run list --repo wthpein010-dev/ai-application-hub --workflow repair-codex-quota-bar-macos.yml --branch audit/mac-downloads-20260807 --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $repairRun --repo wthpein010-dev/ai-application-hub --exit-status
git fetch origin audit/mac-downloads-20260807
git merge --ff-only origin/audit/mac-downloads-20260807
```

Expected: both native jobs and the publish job succeed; the new archive test passes and the release digest equals the committed archive digest.

- [ ] **Step 5: Commit any evidence-only follow-up**

```powershell
git add tests/codex-quota-bar-download.test.mjs projects/codex-quota-bar/release/README-zh-CN.md docs/audits/evidence/2026-08-07-macos-download-manifest.json
git commit -m "fix: make Codex Quota Bar launchable on macOS"
```

### Task 3: Audit every public Mac download on native runners

**Files:**
- Create: `.github/workflows/audit-macos-downloads.yml`
- Create: `scripts/audit-public-macos-downloads.sh`
- Modify: `tests/macos-download-manifest.test.mjs`

**Interfaces:**
- Consumes: the manifest from Task 1 and the exact public Release/Pages URLs.
- Produces: one arm64 and one Intel audit job, each with a Markdown summary and uploaded evidence JSON. Native app checks cover Codex Quota Bar, Workbench, ClickFlow, and PureShrink; extension checks cover Feishu.

- [ ] **Step 1: Add failing script contract tests**

Use temporary fixture ZIPs to verify the script rejects a wrong digest, missing app executable, wrong architecture declaration, and a browser extension without `manifest.json`; verify a valid extension fixture passes without any native-app shortcut.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/macos-download-manifest.test.mjs`

Expected: FAIL because the audit script and workflow do not exist.

- [ ] **Step 3: Implement the audit script and workflow**

The script downloads with `curl --fail --location --retry 3`, checks literal bytes and SHA-256, extracts with `ditto`, validates `plutil`, `file`, and `codesign`, and executes per-product smoke behavior. Workbench is rebuilt from its public manifests and parts before calling `build/codex-thread-workbench/scripts/test-macos-package.sh`; PureShrink additionally checks bundled FFmpeg and `--smoke-test`; ClickFlow and Quota Bar must stay alive for five seconds; Feishu runs `plutil -lint` or JSON parsing plus `node --check` for all published scripts.

- [ ] **Step 4: Run local tests and dispatch native audit**

Run:

```powershell
node --test tests/macos-download-manifest.test.mjs tests/codex-quota-bar-download.test.mjs tests/hub-platform-artifacts.test.mjs
gh workflow run audit-macos-downloads.yml --repo wthpein010-dev/ai-application-hub --ref audit/mac-downloads-20260807
$auditRun = gh run list --repo wthpein010-dev/ai-application-hub --workflow audit-macos-downloads.yml --branch audit/mac-downloads-20260807 --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $auditRun --repo wthpein010-dev/ai-application-hub --exit-status
```

Expected: arm64 and Intel jobs both verify all five public Mac actions and finish with zero failures.

- [ ] **Step 5: Commit the reusable native gate**

```powershell
git add .github/workflows/audit-macos-downloads.yml scripts/audit-public-macos-downloads.sh tests/macos-download-manifest.test.mjs
git commit -m "ci: audit every public macOS download"
```

### Task 4: Record results and run the full local release gate

**Files:**
- Create: `docs/audits/2026-08-07-macos-download-acceptance.md`
- Modify if evidence changed: `docs/audits/2026-08-03-platform-compatibility.md`

**Interfaces:**
- Consumes: GitHub Actions run IDs, final release asset metadata, Pages manifests, and local test results.
- Produces: a concise application-by-application result table with URL, architecture, bytes, SHA-256, signing, launch evidence, limitations, and final status.

- [ ] **Step 1: Write the acceptance record from observed evidence**

Include exact run IDs and explicitly distinguish native app launch from browser-extension validation.

- [ ] **Step 2: Run the full local suite**

Run:

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
node --test
npm run audit:hub -- --check-external --format markdown
git diff --check
```

Expected: zero failures and zero publication findings; only documented environment-conditional skips remain.

- [ ] **Step 3: Commit the acceptance record**

```powershell
git add docs/audits/2026-08-07-macos-download-acceptance.md docs/audits/2026-08-03-platform-compatibility.md
git commit -m "docs: record native macOS download acceptance"
```

### Task 5: Publish and verify the final public site

**Files:**
- No new implementation files unless final online verification exposes a regression.

**Interfaces:**
- Consumes: the verified branch and release assets.
- Produces: updated `main`, successful Pages/CI runs, and a fresh public macOS audit against the exact final SHA.

- [ ] **Step 1: Fetch and confirm a fast-forward publication**

Run: `git fetch origin main` and verify `origin/main` is the branch base; resolve any concurrent update without force-pushing.

- [ ] **Step 2: Push the reviewed branch to `main`**

Run: `git push origin HEAD:main` only after the full gate is green.

- [ ] **Step 3: Wait for Pages and full Hub CI**

Both workflows must report success for the exact final `main` SHA.

- [ ] **Step 4: Re-run the native public Mac audit from final `main`**

Dispatch `audit-macos-downloads.yml` against `main`, require both native runners to pass, and confirm all five homepage Mac buttons still resolve to the audited URLs.

- [ ] **Step 5: Update long-term project memory**

Record the final SHA, workflow IDs, five-item result matrix, repaired Quota Bar digest, and any honest platform limitations. Do not store credentials.
