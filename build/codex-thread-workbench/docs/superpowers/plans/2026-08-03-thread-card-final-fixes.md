# Thread Card Final Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all five final-review findings for CodexThreadWorkbench v1.3.0, rebuild the Windows and macOS packages, and replace the public AI Application Hub release with verified artifacts.

**Architecture:** Keep `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj` as the single application-version source, reject ambiguous thread IDs before collection mutation, and coordinate native drag visual cleanup through a window-scoped weak registry. Mirror the desktop visual contract in the static Hub demo while making its pointer gesture single-owner and primary-pointer-only.

**Tech Stack:** .NET 8, C# 12, Avalonia 11.3.18, xUnit, Bash/macOS `plutil`, PowerShell, Node.js 22, Playwright/Chromium, GitHub Actions, GitHub Pages.

## Global Constraints

- Version remains exactly `1.3.0`; both macOS plist version keys must be derived from the app `.csproj`.
- Every production change is preceded by a focused regression test that fails for the expected reason.
- Ambiguous source or target IDs are a no-op and do not persist workspace state.
- Drag cancellation, capture loss, source detach, target detach, and native drag completion clear both source and active target state without a cross-window/static strong-reference leak.
- `.dragging` uses the primary green border and stronger shadow; `.drop-target` keeps a two-pixel green outline and gives `DragSurface` a light-green tint.
- Conversation text remains non-clickable/non-selectable with no gray-blue hover or focus container.
- Hub accepts only one primary pointer gesture at a time and never lets a second pointer overwrite the first gesture.
- Do not change the stable Mac parts paths or the existing video content.
- Preserve unrelated work and never force-push.

---

### Task 1: macOS package version single source

**Files:**
- Modify: `tests/CodexThreadWorkbench.Tests/Packaging/PackagingScriptTests.cs`
- Modify: `scripts/test-macos-package.sh`
- Modify: `scripts/publish-macos.sh`

**Interfaces:**
- Consumes: `<Version>1.3.0</Version>` from `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj`.
- Produces: `CFBundleShortVersionString=1.3.0` and `CFBundleVersion=1.3.0` in the packaged `Info.plist`.

- [ ] Add Windows-runnable static contract tests that require project-version extraction/validation and require both plist keys to use the extracted value; require the macOS verifier to assert both keys with `plutil`.
- [ ] Run `dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj --configuration Debug --filter FullyQualifiedName~PackagingScriptTests` and record the expected RED against hard-coded `1.1.0` and absent `plutil` assertions.
- [ ] Parse the single project `<Version>` value, reject empty, duplicate, or non-`major.minor.patch` values, interpolate it into both plist values, and make `test-macos-package.sh` read expected version from the project and compare both plist keys with `plutil`.
- [ ] Re-run the focused test and record GREEN.

### Task 2: duplicate-ID swap rejection

**Files:**
- Modify: `tests/CodexThreadWorkbench.Tests/Presentation/MainViewModelTests.cs`
- Modify: `src/CodexThreadWorkbench.Core/Presentation/MainViewModel.cs`

**Interfaces:**
- Consumes: `OpenThreads` and source/target thread IDs.
- Produces: `false` with no collection mutation and no workspace save unless each ID matches exactly one card.

- [ ] Add a theory that injects a duplicate source or target card, snapshots the collection and saved settings, calls `SwapOpenThreadsAsync`, and asserts `false`, identical object order, and unchanged persisted IDs.
- [ ] Run the duplicate-ID test and record RED because the current loop uses the last matching index and saves.
- [ ] Count matches while resolving indexes and return before mutation unless both counts equal one and indexes differ.
- [ ] Re-run focused `MainViewModelTests` and record GREEN.

### Task 3: native drag visual lifecycle and desktop visual contract

**Files:**
- Modify: `tests/CodexThreadWorkbench.Desktop.Tests/WorkspaceViewTests.cs`
- Modify: `src/CodexThreadWorkbench/Views/ThreadCardView.axaml.cs`
- Modify: `src/CodexThreadWorkbench/Views/ThreadCardView.axaml`

**Interfaces:**
- Consumes: Avalonia pointer, drag/drop, detach, and visual-root lifecycle events.
- Produces: one active target per visual root, held weakly; cleanup removes source `.dragging` plus target `.drop-target`.

- [ ] Add a two-card regression hosted in one `Window`: mark source dragging and target active, invoke source cancel/capture-loss/detach cleanup, and assert both classes are cleared; add an isolation assertion that cleanup in another window does not mutate the first window.
- [ ] Add visual-state assertions for a primary-green dragging border and stronger shadow, a two-pixel green target border, light-green target `DragSurface` tint, and unchanged non-selectable message containers.
- [ ] Run focused `WorkspaceViewTests` and record RED because source cleanup cannot reach target and source/target style tokens are absent.
- [ ] Add the minimal weak, visual-root-scoped active-target registry; route enter/over/leave/drop, source finally, cancellation, capture loss, and detach through unified cleanup.
- [ ] Update XAML selectors so the requested source and target tokens apply, including `Border#CardShell.drop-target Border#DragSurface`.
- [ ] Re-run focused desktop tests and record GREEN.

### Task 4: complete App verification, commit, and Windows replacement

**Files:**
- Generate: `artifacts/release/CodexThreadWorkbench-Windows-x64/**`
- Generate: `artifacts/release/CodexThreadWorkbench-Windows-x64.zip`
- Replace: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs/CodexThreadWorkbench.exe`
- Replace: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs/CodexThreadWorkbench-Windows-x64.zip`
- Replace: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs/README.md`

**Interfaces:**
- Consumes: the verified v1.3.0 App commit and `scripts/Publish-Windows.ps1`.
- Produces: a versioned fixed-path local EXE/ZIP and a running delivery process.

- [ ] Run full Debug and Release solution tests with zero failures.
- [ ] Commit only the planned App source/tests/docs.
- [ ] Run `scripts/Publish-Windows.ps1`, verify file/product version, ZIP entries, non-empty README, bytes, and SHA-256.
- [ ] Stop only processes whose executable path is the fixed output EXE, atomically replace EXE/ZIP/README, verify the existing desktop shortcut target, restart the fixed EXE, and record PID/path/version/hash.

### Task 5: Hub branch, multi-pointer TDD, snapshot, and Windows parts

**Files:**
- Modify: `projects/codex-thread-workbench/app.js`
- Modify: `projects/codex-thread-workbench/styles.css` only if snapshot synchronization changes it.
- Modify: `tests/codex-thread-workbench-page.test.mjs`
- Replace: `build/codex-thread-workbench/**` from the App commit.
- Modify: `scripts/split-codex-thread-workbench.mjs`
- Generate: `projects/codex-thread-workbench/download/manifest.json`
- Replace: `projects/codex-thread-workbench/download/parts/v1.3.0/part-000.bin` through `part-004.bin`.

**Interfaces:**
- Consumes: latest `origin/main`, the App tracked snapshot, and the new verified Windows ZIP.
- Produces: branch `agent/workbench-v1.3.0-final-fixes`, a first-pointer-owned demo gesture, and verified Windows v1.3.0 Pages parts.

- [ ] Fetch and create the exact new branch from `origin/main` in the provided clean sparse worktree.
- [ ] Add a real Chromium regression that dispatches distinct pointer IDs, proving a non-primary/second pointer cannot replace the first gesture or leave `.dragging`/`.drop-target` classes.
- [ ] Run the focused Chromium test and record RED against current `pointerdown` behavior.
- [ ] Reject `pointerdown` when `dragGesture` already exists or `event.isPrimary === false`; keep the first pointer ID as the sole owner through cleanup.
- [ ] Re-run the Chromium regression and normal drag/cancel tests; record GREEN.
- [ ] Sync only tracked App snapshot files, update the Windows splitter constants to new verified bytes/SHA, regenerate manifest and five parts, and verify reassembly.
- [ ] Run the five Workbench tests plus catalog/platform/subpage/video suites and tracked-snapshot diff check.
- [ ] Commit and push the branch without force.

### Task 6: macOS CI package proof and Hub merge

**Files:**
- Bot-generated only: `projects/codex-thread-workbench/download/mac/manifest-arm64.json`
- Bot-generated only: `projects/codex-thread-workbench/download/mac/manifest-x64.json`
- Bot-generated only: stable Mac parts directories.

**Interfaces:**
- Consumes: pushed feature branch and `build-codex-thread-workbench.yml`.
- Produces: verified arm64/x64 packages, plist-version log evidence, bot commit, ready PR, and merged main.

- [ ] Dispatch `build-codex-thread-workbench.yml` on the new branch and wait for arm64, x64, and publish jobs.
- [ ] Verify workflow logs show `plutil` checks for both plist keys at `1.3.0`; download/reassemble final artifacts or published parts and independently inspect `Info.plist` from each package.
- [ ] After the bot commit, fetch without materializing stable Mac parts, fast-forward only the manifests/sparse branch state, and verify all three manifests/part objects/reassembled SHA values.
- [ ] Open a ready PR against current main, wait for checks, merge without force, and record PR/merge/main IDs.

### Task 7: Pages/public acceptance, memory, and final report

**Files:**
- Modify: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/AI-Application-Hub.md`
- Modify: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/CodexThreadWorkbench.md`
- Create: `docs/superpowers/final-fix-report.md`

**Interfaces:**
- Consumes: merged final main, successful Pages workflow, final package manifests, and browser evidence.
- Produces: deduplicated long-term release state and a complete audit report.

- [ ] Wait for Pages and full validation workflows on the exact merged main SHA.
- [ ] Check public `#games`, demo, video, Windows and Mac download pages plus all 16 part URLs for HTTP 200; stream-reassemble all three packages and compare length/SHA.
- [ ] In a real Chromium browser, verify second/non-primary pointer rejection has no residue and ordinary drag still exchanges/persists cards.
- [ ] Replace the two existing v1.3.0 memory entries with final App/Hub/main SHAs, package hashes, workflows, PR/Pages IDs, and public evidence; do not append a duplicate release entry.
- [ ] Write `docs/superpowers/final-fix-report.md` with every RED/GREEN, commits, tests, package evidence, plist evidence, public URLs/status, PID, shortcut, and both worktree states.
- [ ] Re-run final status, tests, package/object/public checks immediately before reporting completion.
