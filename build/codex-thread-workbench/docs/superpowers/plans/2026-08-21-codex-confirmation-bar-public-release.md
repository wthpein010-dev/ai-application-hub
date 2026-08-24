# Codex Confirmation Bar v2.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the v1.6 confirmation overlay as Codex 待确认悬浮助手 v2.0.0, add guarded macOS confirmation delivery, and publish verified Windows/macOS packages, an interactive demo, and a tutorial video through AI Application Hub.

**Architecture:** Keep the existing bounded local-session scanner and verified app-server delivery path. Make overlay-only startup the default, isolate OS-specific deep-link submission behind platform adapters, then synchronize the verified source into a clean Hub release worktree whose static demo, media, package manifests, CI, and redirects form the public surface.

**Tech Stack:** .NET 8, C# 12, Avalonia 11.3.18, xUnit, PowerShell, Bash, Node.js 22, native `node:test`, Playwright, FFmpeg/FFprobe, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-21-codex-confirmation-bar-public-release-design.md`

## Global Constraints

- Public Chinese name is exactly `Codex 待确认悬浮助手`; English package name is exactly `Codex Confirmation Bar`.
- Release version is exactly `2.0.0`.
- Default startup is overlay-only; `--workbench` opens the legacy main window; `--confirmation-overlay` remains accepted.
- Confirmation text remains exactly `确认，继续开始做，完成前不要停。`.
- A candidate is removed only after that exact message is observed after the candidate message id.
- Windows target is Windows 10/11 x64; macOS targets are macOS 13+ arm64 and x64.
- macOS is ad-hoc signed and must never be described as notarized.
- Local Hub tests must be explicitly named; never run unfiltered `node --test` and never run, build, display, download, or regenerate ClickFlow on Windows.
- Git staging uses exact paths only; never use `git add .`, `git add -A`, or force-push.

---

### Task 1: Make the confirmation overlay the branded default

**Files:**
- Modify: `src/CodexThreadWorkbench/DesktopLaunchOptions.cs`
- Modify: `src/CodexThreadWorkbench/App.axaml.cs`
- Modify: `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj`
- Modify: `tests/CodexThreadWorkbench.Desktop.Tests/DesktopLaunchOptionsTests.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/AppResourcesTests.cs`

**Interfaces:**
- Consumes: process arguments from Avalonia desktop lifetime.
- Produces: `DesktopLaunchOptions.ShowWorkbenchWindow`, `DesktopLaunchOptions.WorkbenchSwitch`, branded assembly metadata, and default overlay-only startup.

- [ ] **Step 1: Write failing launch and branding tests**

```csharp
[Fact]
public void FromArgs_DefaultLaunch_DoesNotRequestWorkbenchWindow()
{
    Assert.False(DesktopLaunchOptions.FromArgs([]).ShowWorkbenchWindow);
}

[Fact]
public void FromArgs_WorkbenchSwitch_RequestsWorkbenchWindow()
{
    Assert.True(DesktopLaunchOptions.FromArgs(["--workbench"]).ShowWorkbenchWindow);
}

[Fact]
public void FromArgs_LegacyOverlaySwitch_RemainsOverlayOnly()
{
    Assert.False(DesktopLaunchOptions.FromArgs(["--confirmation-overlay"]).ShowWorkbenchWindow);
}
```

Add resource assertions for `Codex 待确认悬浮助手` and the absence of the old startup-error product name.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj --configuration Debug --filter "FullyQualifiedName~DesktopLaunchOptionsTests|FullyQualifiedName~AppResourcesTests"
```

Expected: the default-launch assertion fails because the current default requests the workbench; branding assertion fails because the old title remains.

- [ ] **Step 3: Implement the minimal launch and product identity change**

```csharp
public sealed record DesktopLaunchOptions(bool ShowWorkbenchWindow)
{
    public const string ConfirmationOverlaySwitch = "--confirmation-overlay";
    public const string WorkbenchSwitch = "--workbench";

    public static DesktopLaunchOptions FromArgs(IEnumerable<string>? args) =>
        new(args?.Contains(WorkbenchSwitch, StringComparer.Ordinal) == true);
}
```

Set `<Version>2.0.0</Version>`, `<AssemblyName>CodexConfirmationBar</AssemblyName>`, and branded title/product properties in the desktop project. Update startup-error copy without changing connection semantics.

- [ ] **Step 4: Run focused and full Debug tests**

Run the focused command again, then:

```powershell
dotnet test CodexThreadWorkbench.sln --configuration Debug
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/CodexThreadWorkbench/DesktopLaunchOptions.cs src/CodexThreadWorkbench/App.axaml.cs src/CodexThreadWorkbench/CodexThreadWorkbench.csproj tests/CodexThreadWorkbench.Desktop.Tests/DesktopLaunchOptionsTests.cs tests/CodexThreadWorkbench.Desktop.Tests/AppResourcesTests.cs
git commit -m "feat: make confirmation bar the default"
```

### Task 2: Add a guarded macOS active-writer fallback

**Files:**
- Modify: `src/CodexThreadWorkbench/CodexDesktopMessageFallback.cs`
- Create: `src/CodexThreadWorkbench/PlatformProcessRunner.cs`
- Create: `src/CodexThreadWorkbench/MacCodexForegroundSubmitter.cs`
- Modify: `src/CodexThreadWorkbench/App.axaml.cs`
- Modify: `tests/CodexThreadWorkbench.Desktop.Tests/CodexDesktopMessageFallbackTests.cs`
- Create: `tests/CodexThreadWorkbench.Desktop.Tests/MacCodexForegroundSubmitterTests.cs`

**Interfaces:**
- Consumes: `ICodexDeepLinkLauncher`, `ICodexForegroundSubmitter`, platform command paths, cancellation token.
- Produces: `CodexDesktopMessageFallbackFactory.CreateCurrent()`, `IPlatformProcessRunner.RunAsync(PlatformProcessRequest, CancellationToken)`, and macOS fail-closed submission.

- [ ] **Step 1: Read the good-test rules before editing tests**

Read `superpowers/test-driven-development/writing-good-tests.md`. Name the production behavior that makes each new test fail: default factory has no macOS path, macOS command failures are not translated, and no OpenAI foreground check exists.

- [ ] **Step 2: Write failing platform tests**

```csharp
[Fact]
public async Task SubmitAsync_InvokesOnlyTheGuardedOpenAiAppleScript()
{
    var runner = new RecordingProcessRunner(exitCode: 0, standardOutput: "com.openai.chat");
    var submitter = new MacCodexForegroundSubmitter(runner);

    await submitter.SubmitAsync();

    var request = Assert.Single(runner.Requests);
    Assert.Equal("/usr/bin/osascript", request.FileName);
    Assert.Contains("com.openai", request.Arguments);
    Assert.Contains("key code 36", request.Arguments);
}

[Theory]
[InlineData(1, "请在系统设置中允许辅助功能")]
[InlineData(124, "等待 Codex 桌面窗口超时")]
public async Task SubmitAsync_FailsClosedWithActionableChineseError(int exitCode, string message)
{
    var submitter = new MacCodexForegroundSubmitter(
        new RecordingProcessRunner(exitCode, standardError: "denied"));
    var error = await Assert.ThrowsAsync<InvalidOperationException>(() => submitter.SubmitAsync());
    Assert.Contains(message, error.Message);
}
```

Add tests that the macOS launcher uses `/usr/bin/open`, the Windows adapter remains selected on Windows, and cancellation is forwarded.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj --configuration Debug --filter "FullyQualifiedName~CodexDesktopMessageFallbackTests|FullyQualifiedName~MacCodexForegroundSubmitterTests"
```

Expected: compilation fails because the process runner and macOS submitter do not exist.

- [ ] **Step 4: Implement the process runner and platform adapters**

```csharp
public sealed record PlatformProcessRequest(
    string FileName,
    IReadOnlyList<string> Arguments,
    TimeSpan Timeout);

public sealed record PlatformProcessResult(
    int ExitCode,
    string StandardOutput,
    string StandardError);

public interface IPlatformProcessRunner
{
    Task<PlatformProcessResult> RunAsync(
        PlatformProcessRequest request,
        CancellationToken cancellationToken = default);
}
```

Use `ProcessStartInfo.ArgumentList`, redirected output/error, a linked timeout token, deterministic process-tree termination, and no shell string interpolation. The AppleScript must wait for a frontmost app named ChatGPT or Codex, require an OpenAI bundle id, and only then send Return. Map timeout and Accessibility denial to concise Chinese errors.

Update `App.axaml.cs` to pass `CodexDesktopMessageFallbackFactory.CreateCurrent()` on Windows and macOS, and `null` on unsupported systems.

- [ ] **Step 5: Verify GREEN and full regression**

Run the focused command, then both desktop and core Debug projects. Expected: zero failures and no real deep link or keyboard input because tests inject fakes.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/CodexThreadWorkbench/CodexDesktopMessageFallback.cs src/CodexThreadWorkbench/PlatformProcessRunner.cs src/CodexThreadWorkbench/MacCodexForegroundSubmitter.cs src/CodexThreadWorkbench/App.axaml.cs tests/CodexThreadWorkbench.Desktop.Tests/CodexDesktopMessageFallbackTests.cs tests/CodexThreadWorkbench.Desktop.Tests/MacCodexForegroundSubmitterTests.cs
git commit -m "feat: support guarded macOS confirmation delivery"
```

### Task 3: Rebrand and harden Windows/macOS packaging

**Files:**
- Modify: `scripts/Publish-Windows.ps1`
- Create: `scripts/publish-macos.sh`
- Create: `scripts/test-macos-package.sh`
- Modify: `tests/CodexThreadWorkbench.Tests/Packaging/PackagingScriptTests.cs`
- Modify: `.github/workflows/build-cross-platform.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `CodexConfirmationBar` build output for `win-x64`, `osx-arm64`, and `osx-x64`.
- Produces: exact v2 archive names, `CodexConfirmationBar.app`, bundle id, package verification, and accurate startup/permission documentation.

- [ ] **Step 1: Write failing packaging contract tests**

Assert the scripts contain:

```csharp
Assert.Contains("CodexConfirmationBar-Windows-x64.zip", windowsScript);
Assert.Contains("CodexConfirmationBar-macOS-arm64.app.zip", macScript);
Assert.Contains("CodexConfirmationBar-macOS-x64.app.zip", macScript);
Assert.Contains("dev.wthpein010.codex-confirmation-bar", macScript);
Assert.Contains("<string>13.0</string>", macScript);
Assert.Contains("codesign --verify --deep --strict", macTest);
Assert.Contains("--smoke-test", macTest);
```

Also assert README states Codex CLI, Windows Startup, macOS Login Items, Accessibility only for fallback, and ad-hoc signing without claiming notarization.

- [ ] **Step 2: Run packaging tests and verify RED**

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj --configuration Debug --filter FullyQualifiedName~PackagingScriptTests
```

Expected: archive-name and bundle-id assertions fail against legacy names.

- [ ] **Step 3: Implement exact packaging names and verification**

Update Windows publish paths and entry checks to `CodexConfirmationBar.exe`. Update macOS scripts to build `CodexConfirmationBar.app`, derive both plist versions from the single csproj version, set the new display name and bundle id, ad-hoc sign, verify architecture/signature/plist/executable/smoke-test/liveness, and emit the exact archives.

- [ ] **Step 4: Verify packaging contracts and build Windows archive**

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj --configuration Debug --filter FullyQualifiedName~PackagingScriptTests
powershell -ExecutionPolicy Bypass -File scripts/Publish-Windows.ps1 -Configuration Release -Runtime win-x64
```

Expected: tests pass; `artifacts/release/CodexConfirmationBar-Windows-x64.zip` contains the executable and README.

- [ ] **Step 5: Commit Task 3**

Stage only the seven listed paths and commit `build: package Codex Confirmation Bar v2`.

### Task 4: Complete fresh desktop verification

**Files:**
- Verify only; modify failing behavior through a new failing test before any fix.

**Interfaces:**
- Consumes: Tasks 1–3 source tree.
- Produces: a clean v2 source commit and immutable Windows package evidence.

- [ ] **Step 1: Run format and both full suites**

```powershell
dotnet format CodexThreadWorkbench.sln --verify-no-changes
dotnet test CodexThreadWorkbench.sln --configuration Debug
dotnet test CodexThreadWorkbench.sln --configuration Release
git diff --check
```

- [ ] **Step 2: Run packaged smoke test and collect metadata**

```powershell
artifacts/release/CodexConfirmationBar-Windows-x64/CodexConfirmationBar.exe --smoke-test
Get-FileHash artifacts/release/CodexConfirmationBar-Windows-x64.zip -Algorithm SHA256
```

Record archive bytes, archive SHA-256, executable bytes, executable SHA-256, file version, and product version.

- [ ] **Step 3: Perform safe Windows UI inspection**

Start the packaged executable without arguments and verify one overlay-only process, no legacy workbench window, draggable header, idle state, and normal responsiveness. Do not click any real confirmation button.

- [ ] **Step 4: Commit any verification-only metadata changes**

If no files changed, do not create an empty commit. Confirm `git status --short` is empty.

### Task 5: Create a clean Hub release worktree and sync source

**Files:**
- Create worktree: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/work/ai-application-hub/.worktrees/codex-confirmation-bar-v200`
- Create: `build/codex-confirmation-bar/**`
- Create: `.github/workflows/build-codex-confirmation-bar.yml`

**Interfaces:**
- Consumes: latest `origin/main`, verified app source commit, and exact v2 source files.
- Produces: feature branch `agent/codex-confirmation-bar-v200` with a buildable Hub source snapshot.

- [ ] **Step 1: Verify worktree isolation rules and create from latest remote main**

Fetch `origin/main`, verify `.worktrees` is ignored, then create the named branch/worktree from the exact remote SHA. Confirm Git dir differs from common dir and the worktree is clean.

- [ ] **Step 2: Confirm the ClickFlow Windows no-run gate before Node tests**

Read `tests/clickflow-packaging.test.mjs` in the new worktree and confirm its real Python/Tk suite is unconditionally skipped on Windows. Do not execute ClickFlow.

- [ ] **Step 3: Sync the exact verified app source snapshot**

Copy the source tree mechanically into `build/codex-confirmation-bar/`, excluding `.git`, `.worktrees`, `bin`, `obj`, and release artifacts. Rename workflow paths and artifact names to the new build directory and v2 archives.

- [ ] **Step 4: Verify snapshot identity**

Compare SHA-256 values of all synced source, test, script, solution, README, and project files between the app repo and Hub snapshot. Expected: no missing, extra, or mismatched tracked source files.

- [ ] **Step 5: Run snapshot Release tests**

```powershell
dotnet test build/codex-confirmation-bar/CodexThreadWorkbench.sln --configuration Release
```

Expected: the same test count and zero failures as the app source.

- [ ] **Step 6: Commit Task 5**

Stage exactly `build/codex-confirmation-bar` and `.github/workflows/build-codex-confirmation-bar.yml`; commit `build: add Codex Confirmation Bar v2 source`.

### Task 6: Migrate the Hub catalog and legacy URL

**Files:**
- Modify: `app-20260706-restore-games.js`
- Create: `tests/codex-confirmation-bar-catalog.test.mjs`
- Modify: `tests/codex-thread-workbench-local-storage-migration.test.mjs`
- Create: `projects/codex-thread-workbench/index.html`
- Create: `projects/codex-thread-workbench/video/index.html`
- Create: `projects/codex-thread-workbench/download/index.html`
- Create: `projects/codex-thread-workbench/download/mac/index.html`

**Interfaces:**
- Consumes: old catalog id `codex-thread-workbench` and stored customizations.
- Produces: canonical id `codex-confirmation-bar`, four exact action labels, preserved catalog position, customization migration, and legacy redirects.

- [ ] **Step 1: Write failing catalog and migration tests**

```javascript
test("catalog exposes the rebranded confirmation bar with four actions", () => {
  const app = loadDefaultApps().find(item => item.id === "codex-confirmation-bar");
  assert.equal(app.name, "Codex 待确认悬浮助手");
  assert.equal(app.platforms.web.label, "演示");
  assert.equal(app.platforms.windows.label, "Wins下载");
  assert.equal(app.platforms.mac.label, "Mac下载");
});

test("legacy workbench customization migrates to the new id", () => {
  const migrated = loadAppsWithStoredValue([{ id: "codex-thread-workbench", name: "我的悬浮栏" }])
    .find(item => item.id === "codex-confirmation-bar");
  assert.equal(migrated.name, "我的悬浮栏");
});
```

Add redirect assertions for canonical project, video, Windows download, and Mac download destinations.

- [ ] **Step 2: Run the named tests and verify RED**

```powershell
node --test tests/codex-confirmation-bar-catalog.test.mjs tests/codex-thread-workbench-local-storage-migration.test.mjs
```

Expected: the new catalog id is missing and redirect pages are not canonical.

- [ ] **Step 3: Implement catalog replacement, migration, and redirects**

Replace the old default card in place with the new id/name/copy/URLs/tags. In `loadApps`, map the old stored id to the new default only when the new id is absent, then normalize structural fields to the new defaults while preserving genuine user text and ordering. Redirect legacy pages with canonical links and a visible fallback link.

- [ ] **Step 4: Verify GREEN and catalog contracts**

Run the two named tests plus `tests/hub-catalog-copy-and-migration.test.mjs`, `tests/hub-platform-artifacts.test.mjs`, and `tests/hub-subpage-contract.test.mjs` explicitly.

- [ ] **Step 5: Commit Task 6**

Stage only the catalog, migration test, new test, and four redirect HTML files; commit `feat: rebrand workbench as confirmation bar`.

### Task 7: Build the interactive public demo

**Files:**
- Create: `projects/codex-confirmation-bar/index.html`
- Create: `projects/codex-confirmation-bar/styles.css`
- Create: `projects/codex-confirmation-bar/app.js`
- Create: `tests/codex-confirmation-bar-page.test.mjs`

**Interfaces:**
- Consumes: deterministic sample tasks and pointer/click input.
- Produces: safe interactive simulation with idle, scan, drag, single confirm, confirm-all, failure, and retry states.

- [ ] **Step 1: Write failing static and browser tests**

Assert the page declares itself a simulation, has shared background and return-home control, renders the exact confirmation message, and provides deterministic `data-action` controls. Browser tests must drag the bar, add candidates, confirm one, simulate a failure, retry, confirm all, and verify zero horizontal overflow at 1440×900 and 390×844.

- [ ] **Step 2: Run the named page test and verify RED**

```powershell
node --test tests/codex-confirmation-bar-page.test.mjs
```

Expected: canonical demo files and controls are missing.

- [ ] **Step 3: Implement the minimal accessible demo**

Use semantic buttons, focus-visible states, `aria-live` status, pointer capture for dragging, work-area clamping, and a deterministic state reducer. Do not access browser storage, local files, Codex APIs, or network services.

- [ ] **Step 4: Verify GREEN and responsive browser behavior**

Run the named test. Capture desktop and mobile screenshots as test artifacts and verify no console/page/request errors.

- [ ] **Step 5: Commit Task 7**

Stage the four listed files and commit `feat: add confirmation bar interactive demo`.

### Task 8: Publish the verified Windows download surface

**Files:**
- Create: `scripts/split-codex-confirmation-bar.mjs`
- Create: `projects/codex-confirmation-bar/download/index.html`
- Create: `projects/codex-confirmation-bar/download/styles.css`
- Create: `projects/codex-confirmation-bar/download/download-core.js`
- Create: `projects/codex-confirmation-bar/download/download.js`
- Generate: `projects/codex-confirmation-bar/download/manifest.json`
- Generate: `projects/codex-confirmation-bar/download/parts/v2.0.0/part-*.bin`
- Create: `tests/codex-confirmation-bar-download.test.mjs`

**Interfaces:**
- Consumes: verified `CodexConfirmationBar-Windows-x64.zip`.
- Produces: ordered 8 MiB parts, exact manifest, browser reconstruction, progress, retry, and final SHA validation.

- [ ] **Step 1: Write failing splitter and page tests**

Test deterministic ordering, per-part hashes, total bytes, final hash, exact filename/version, progress states, retry states, and ZIP MIME type. Include a corrupt-part fixture that must fail before save.

- [ ] **Step 2: Run the named test and verify RED**

```powershell
node --test tests/codex-confirmation-bar-download.test.mjs
```

- [ ] **Step 3: Implement splitter and download page**

Reuse the proven bounded-part algorithm, but make product name, version, archive path, and output root explicit arguments. The browser must verify each fetched part and the complete Blob before triggering save.

- [ ] **Step 4: Generate and verify the real Windows manifest**

Run the splitter against the Task 4 archive, rerun the named test, reconstruct the archive locally in manifest order, and compare bytes/SHA to the source archive.

- [ ] **Step 5: Commit infrastructure, then parts in bounded commits**

Commit scripts/page/test/manifest first. Commit each part or bounded small group in manifest order, then commit the manifest activation only after every part is present and verified.

### Task 9: Create and verify the tutorial video

**Files:**
- Create: `projects/codex-confirmation-bar/video/tutorial-script.md`
- Create: `projects/codex-confirmation-bar/video/codex-confirmation-bar-demo.vtt`
- Generate: `projects/codex-confirmation-bar/video/codex-confirmation-bar-demo.mp4`
- Generate: `projects/codex-confirmation-bar/video/poster.jpg`
- Create: `projects/codex-confirmation-bar/video/index.html`
- Create: `scripts/build-codex-confirmation-bar-video.mjs`
- Create: `tests/codex-confirmation-bar-video.test.mjs`

**Interfaces:**
- Consumes: deterministic demo states and six chapter timestamps.
- Produces: 60–90 second silent 16:9 H.264 MP4, poster, single-line non-overlapping Chinese captions, and shared video page.

- [ ] **Step 1: Write failing script/media contract tests**

Assert six chapter markers, six non-overlapping single-line VTT cues, shared player shell, lazy MP4 loading, default Chinese captions, H.264, 16:9, no audio, duration 60–90 seconds, and full FFmpeg decode without warnings.

- [ ] **Step 2: Run the named video test and verify RED**

Expected: assets do not exist.

- [ ] **Step 3: Implement deterministic capture and encode**

Drive the public demo through Playwright at 1280×720, capture chapter frames/transitions, assemble with the discovered FFmpeg/FFprobe tooling, encode H.264/yuv420p/faststart, extract a representative poster, and write six concise captions.

- [ ] **Step 4: Verify media and real browser playback**

Run the named test, then open the local video page in a real browser, click load/play, verify `readyState=4`, `paused=false`, no media error, captions showing, HTTP Range behavior, and no console/network errors.

- [ ] **Step 5: Commit Task 9**

Stage the seven exact paths and commit `feat: add confirmation bar tutorial video`.

### Task 10: Build and publish both macOS architectures

**Files:**
- Create: `scripts/split-codex-confirmation-bar-mac.mjs`
- Create: `projects/codex-confirmation-bar/download/mac/index.html`
- Create: `projects/codex-confirmation-bar/download/mac/styles.css`
- Create: `projects/codex-confirmation-bar/download/mac/download.js`
- Generate: `projects/codex-confirmation-bar/download/mac/manifest-arm64.json`
- Generate: `projects/codex-confirmation-bar/download/mac/manifest-x64.json`
- Generate: `projects/codex-confirmation-bar/download/mac/parts/arm64/part-*.bin`
- Generate: `projects/codex-confirmation-bar/download/mac/parts/x64/part-*.bin`
- Create: `tests/codex-confirmation-bar-mac-download.test.mjs`
- Modify: `.github/workflows/build-codex-confirmation-bar.yml`

**Interfaces:**
- Consumes: macOS CI arm64/x64 archives.
- Produces: verified matrix artifacts and architecture-specific GitHub Pages manifests/parts.

- [ ] **Step 1: Write failing Mac page, manifest, and workflow tests**

Assert exact runners (`macos-14` arm64 and `macos-15-intel` x64), runtime mappings, archive names, v2 bundle metadata, manifest architecture, page selection, ad-hoc signing disclosure, Accessibility explanation, and final hash verification.

- [ ] **Step 2: Run the named tests and verify RED**

```powershell
node --test tests/codex-confirmation-bar-mac-download.test.mjs
```

- [ ] **Step 3: Implement workflow and Mac download surface**

The workflow runs Release tests, publishes/signs/verifies each app, uploads matrix artifacts, downloads both on Ubuntu, splits them, runs the three focused release tests, and commits only verified manifests/parts to the feature branch with a normal pull-rebase/push.

- [ ] **Step 4: Push feature branch and dispatch the Mac workflow**

Push without force, dispatch the workflow on `agent/codex-confirmation-bar-v200`, wait for both build jobs and publisher, then fetch the bot commit. Do not claim success from the initial dispatch response.

- [ ] **Step 5: Verify downloaded CI artifacts and generated parts**

Download both artifacts, independently inspect archive contents, plist values, architecture, signature verification log, bytes, and SHA. Reconstruct both Pages archives from the feature branch and compare with CI artifact hashes.

- [ ] **Step 6: Commit any text-only corrections through tests first**

If a defect appears, reproduce it in a failing focused test before changing production or workflow files, then push a normal follow-up commit.

### Task 11: Review, merge, deploy, and perform public acceptance

**Files:**
- Verify the complete Hub branch and remote deployment; modify only through focused failing tests.

**Interfaces:**
- Consumes: complete feature branch and all local/CI evidence.
- Produces: merged `main`, successful Pages/full CI, and public verified URLs/downloads.

- [ ] **Step 1: Run the full focused local gate**

Explicitly run the confirmation-bar tests, catalog migration, platform artifacts, subpage contract, video content, publication audit, desktop/mobile browser smoke, and app snapshot Release suite. Never run unfiltered Node tests locally.

- [ ] **Step 2: Run static and repository checks**

Run `git diff --check`, inspect staged/unstaged status, verify no unrelated paths, scan public text for old product claims, scan manifests for missing parts, and confirm ClickFlow was never executed.

- [ ] **Step 3: Request code review against the exact base/head SHAs**

Provide the reviewer the spec, plan, `origin/main` base SHA, feature head SHA, changed-path list, test commands, and known ad-hoc-signing boundary. Fix every Critical and Important finding through red-green tests.

- [ ] **Step 4: Create a draft PR and wait for required checks**

Create one PR from `agent/codex-confirmation-bar-v200` to `main`, initially draft. Wait for all checks, inspect logs and external URLs, then mark ready only when the branch is fully green.

- [ ] **Step 5: Merge and wait for deployment workflows**

Merge through the repository's normal PR path without force. Record the merge SHA. Wait for GitHub Pages and the complete remote Hub/browser workflow on that exact SHA.

- [ ] **Step 6: Verify all public pages and media**

Verify homepage card position/name/four actions, canonical demo, legacy redirects, video page, MP4 Range response, desktop/mobile layout, return-home control, console/page/request errors, and the exact remote commit.

- [ ] **Step 7: Reconstruct every public download**

Fetch each manifest and every part in order for Windows, macOS arm64, and macOS x64. Verify per-part status/bytes/SHA, full bytes/SHA, ZIP integrity, entry executable/app, README, and platform metadata.

- [ ] **Step 8: Update long-term project memory**

Update `CodexThreadWorkbench.md` and `AI-Application-Hub.md` with confirmed v2 release name, merge SHA, workflow ids, public URLs, package bytes/hashes, test counts, macOS signing boundary, and next steps. Do not store credentials or raw conversations.

- [ ] **Step 9: Report completion with evidence**

Report the GitHub repository/PR/merge, four public entrances, three package filenames and SHA-256 values, Windows/macOS compatibility boundary, exact test/workflow results, and any honest residual limitation.
