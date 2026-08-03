# Thread Card Drag Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag a thread card title bar onto another card to exchange their grid positions, persist that order, and publish the behavior as CodexThreadWorkbench v1.3.0 for Windows, macOS, and GitHub Pages.

**Architecture:** `ThreadCardView` owns Avalonia pointer/drag feedback and emits source/target thread IDs; `MainWindow` delegates that request to `MainViewModel`, which exchanges the two existing card instances and persists the ordered IDs. The public Hub demo mirrors the interaction while the existing split-download pipeline publishes versioned Windows and macOS artifacts.

**Tech Stack:** .NET 8, C# 12, Avalonia 11.3.18, xUnit, PowerShell packaging, Node.js 22 static tests, GitHub Actions, GitHub Pages.

## Global Constraints

- Dragging starts only from the non-button title-bar surface after at least 6 logical pixels of movement.
- Dropping card A on card B exchanges only A and B; it does not insert or shift intermediate cards.
- Reordering preserves card view-model identity, unsent drafts, messages, status, approvals, and existing message interaction styling.
- The order persists through the existing `WorkspaceSettings.OpenThreadIds` contract without a schema migration.
- Invalid, same-card, outside-workspace, and cancelled drops are no-ops.
- The release version is v1.3.0; Windows and macOS filenames remain unchanged.
- Existing unrelated work in every checkout and worktree must remain untouched.

---

### Task 1: Presentation-layer swap and persistence

**Files:**
- Modify: `tests/CodexThreadWorkbench.Tests/Presentation/MainViewModelTests.cs`
- Modify: `src/CodexThreadWorkbench.Core/Presentation/MainViewModel.cs`

**Interfaces:**
- Consumes: `ObservableCollection<ThreadCardViewModel> OpenThreads`, `WorkspaceStore.SaveAsync`.
- Produces: `Task<bool> SwapOpenThreadsAsync(string sourceThreadId, string targetThreadId)`.

- [ ] **Step 1: Write failing tests for exact exchange, identity, no-op, and persistence**

Add tests with literal orders and existing fake clients:

```csharp
[Fact]
public async Task SwapOpenThreadsAsync_ValidIds_ExchangesOnlyThoseCardsAndPreservesIdentity()
{
    var client = CreateClient(threadCount: 4);
    var path = Path.Combine(_directory, "workspace.json");
    await using var viewModel = new MainViewModel(client, new WorkspaceStore(path));
    await viewModel.InitializeAsync();
    var first = viewModel.OpenThreads[0];
    var fourth = viewModel.OpenThreads[3];
    first.Draft = "保留输入";

    var changed = await viewModel.SwapOpenThreadsAsync(first.ThreadId, fourth.ThreadId);

    Assert.True(changed);
    Assert.Same(fourth, viewModel.OpenThreads[0]);
    Assert.Same(first, viewModel.OpenThreads[3]);
    Assert.Equal("保留输入", viewModel.OpenThreads[3].Draft);
    Assert.Equal(["thread-4", "thread-2", "thread-3", "thread-1"],
        viewModel.OpenThreads.Select(card => card.ThreadId));
}
```

Add a same-ID/missing-ID theory that asserts `false` and unchanged order, plus a fresh-view-model restore test that loads the saved order from disk.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj --configuration Debug --filter "FullyQualifiedName~MainViewModelTests"
```

Expected: compilation fails because `SwapOpenThreadsAsync` does not exist.

- [ ] **Step 3: Implement the minimal exchange method**

Add a public method that resolves both indexes, returns `false` for invalid/same indexes, assigns the two existing instances into the opposite indexes, calls `SaveWorkspaceAsync`, and returns `true`. Catch save failures inside the method, set `GlobalError`, and keep the in-memory exchange usable.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all `MainViewModelTests` pass with 0 failures.

- [ ] **Step 5: Commit the presentation behavior**

```powershell
git add src/CodexThreadWorkbench.Core/Presentation/MainViewModel.cs tests/CodexThreadWorkbench.Tests/Presentation/MainViewModelTests.cs
git commit -m "feat: persist swapped thread card order"
```

### Task 2: Native Avalonia drag surface and visual feedback

**Files:**
- Create: `src/CodexThreadWorkbench/Views/ThreadReorderRequestedEventArgs.cs`
- Modify: `src/CodexThreadWorkbench/Views/ThreadCardView.axaml`
- Modify: `src/CodexThreadWorkbench/Views/ThreadCardView.axaml.cs`
- Modify: `src/CodexThreadWorkbench/MainWindow.axaml`
- Modify: `src/CodexThreadWorkbench/MainWindow.axaml.cs`
- Modify: `tests/CodexThreadWorkbench.Desktop.Tests/WorkspaceViewTests.cs`

**Interfaces:**
- Consumes: thread IDs from `ThreadCardViewModel.ThreadId` and `MainViewModel.SwapOpenThreadsAsync`.
- Produces: `ThreadCardView.ReorderRequested` with `ThreadReorderRequestedEventArgs(SourceThreadId, TargetThreadId)`.

- [ ] **Step 1: Write failing desktop structure tests**

Extend `WorkspaceViewTests`:

```csharp
[AvaloniaFact]
public void ThreadCard_ExposesTitleBarDragSurfaceWithoutRemovingConversationControls()
{
    var card = new ThreadCardView();

    Assert.True(card.AllowDrop);
    Assert.NotNull(card.FindControl<Border>("CardShell"));
    Assert.NotNull(card.FindControl<Border>("DragSurface"));
    Assert.NotNull(card.FindControl<TextBlock>("DragGrip"));
    Assert.NotNull(card.FindControl<TextBox>("MessageInput"));
    Assert.NotNull(card.FindControl<Button>("SendButton"));
}
```

Add a test that creates `ThreadReorderRequestedEventArgs("thread-1", "thread-4")` and asserts both literal properties.

- [ ] **Step 2: Run the desktop tests and verify RED**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj --configuration Debug --filter "FullyQualifiedName~WorkspaceViewTests"
```

Expected: named drag controls and event args type are missing.

- [ ] **Step 3: Add named drag visuals and event contract**

Name the root card border `CardShell`, name the header `DragSurface`, and add a compact `DragGrip` before the title. Set `AllowDrop="True"`, move cursor, tooltip, and pointer/drag handlers. Add selector styles for `.dragging` and `.drop-target` using the existing primary green and neutral palette.

Create immutable event args:

```csharp
public sealed class ThreadReorderRequestedEventArgs(
    string sourceThreadId,
    string targetThreadId) : EventArgs
{
    public string SourceThreadId { get; } = sourceThreadId;
    public string TargetThreadId { get; } = targetThreadId;
}
```

- [ ] **Step 4: Implement thresholded native drag/drop**

In `ThreadCardView.axaml.cs`, arm only primary-button presses from the title surface, ignore button descendants, require a 6-pixel Euclidean threshold, then call Avalonia native drag/drop with a private thread-ID format and `DragDropEffects.Move`. On drag enter/over, validate the data and set the target class; on leave/drop, clear it. Raise `ReorderRequested` only for a distinct valid target and clear every class in `finally`.

- [ ] **Step 5: Wire the window to the view model**

Set `ReorderRequested="ThreadCard_OnReorderRequested"` in the card data template. The async handler calls `SwapOpenThreadsAsync(e.SourceThreadId, e.TargetThreadId)` and does not recreate the card views or alter the grid calculation.

- [ ] **Step 6: Run desktop and presentation tests and verify GREEN**

Run:

```powershell
dotnet test CodexThreadWorkbench.sln --configuration Debug
```

Expected: all tests pass, including message-style and drag-surface regressions.

- [ ] **Step 7: Commit the desktop interaction**

```powershell
git add src/CodexThreadWorkbench tests/CodexThreadWorkbench.Desktop.Tests
git commit -m "feat: drag thread cards to swap layout"
```

### Task 3: v1.3.0 app build, package, and Windows acceptance

**Files:**
- Modify: `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj`
- Modify: `README.md`
- Modify: `tests/CodexThreadWorkbench.Tests/Packaging/PackagingScriptTests.cs` only if the package contract needs an observable regression.
- Generate: `artifacts/release/CodexThreadWorkbench-Windows-x64/**`
- Generate: `artifacts/release/CodexThreadWorkbench-Windows-x64.zip`
- Replace: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs/CodexThreadWorkbench.exe`
- Replace: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs/CodexThreadWorkbench-Windows-x64.zip`
- Replace: `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs/README.md`

**Interfaces:**
- Consumes: verified source tree and `scripts/Publish-Windows.ps1`.
- Produces: signed-by-build-metadata self-contained Windows v1.3.0 EXE/ZIP and fixed desktop delivery paths.

- [ ] **Step 1: Bump the app version and user documentation**

Change `<Version>1.2.0</Version>` to `<Version>1.3.0</Version>` and document “拖动任务卡标题栏可交换位置，顺序会自动保存”.

- [ ] **Step 2: Run complete Debug and Release tests**

```powershell
dotnet test CodexThreadWorkbench.sln --configuration Debug --no-restore --verbosity minimal
dotnet test CodexThreadWorkbench.sln --configuration Release --no-restore --verbosity minimal
```

Expected: both configurations finish with 0 failures.

- [ ] **Step 3: Build and inspect the Windows package**

```powershell
& ./scripts/Publish-Windows.ps1 -Configuration Release
```

Verify the EXE version is `1.3.0.0`, ZIP contains the non-empty EXE and README, and record byte lengths and SHA-256 hashes.

- [ ] **Step 4: Replace fixed local delivery files and shortcut target**

Stop only the existing `CodexThreadWorkbench` process, copy the three verified delivery files, confirm `C:/Users/ASUS/Desktop/Codex 多会话工作台.lnk` still targets the fixed EXE, and launch that pre-existing EXE.

- [ ] **Step 5: Perform real Windows drag acceptance**

Use the running application with four real tasks. Type an unsent draft, drag card 1 onto card 4, verify exact exchange and visual cleanup, refresh/restart, and verify persistence plus unaffected send/stop/minimize/status/full-screen behavior.

- [ ] **Step 6: Open the fixed output folder in File Explorer**

Open `C:/Users/ASUS/Documents/Codex/2026-07-20/new-chat-3/outputs` after the restarted v1.3.0 app is verified.

- [ ] **Step 7: Commit version and documentation**

```powershell
git add src/CodexThreadWorkbench/CodexThreadWorkbench.csproj README.md
git commit -m "release: bump workbench to 1.3.0"
```

### Task 4: Hub demo, snapshot, tests, and versioned Windows parts

**Files:**
- Create isolated Hub worktree from latest `origin/main` on `agent/workbench-drag-reorder-v1.3.0`.
- Replace: `build/codex-thread-workbench/**` with the verified app source snapshot, excluding build artifacts and local settings.
- Modify: `projects/codex-thread-workbench/index.html`
- Modify: `projects/codex-thread-workbench/styles.css`
- Modify: `projects/codex-thread-workbench/app.js`
- Modify: `projects/codex-thread-workbench/download/index.html`
- Modify: `scripts/split-codex-thread-workbench.mjs`
- Modify: `tests/codex-thread-workbench-page.test.mjs`
- Modify: `tests/codex-thread-workbench-download.test.mjs`
- Generate: `projects/codex-thread-workbench/download/manifest.json`
- Generate: `projects/codex-thread-workbench/download/parts/v1.3.0/*.bin`

**Interfaces:**
- Consumes: verified Windows ZIP and app source commit.
- Produces: v1.3.0 public demo behavior, build snapshot, manifest, and versioned Pages parts.

- [ ] **Step 1: Write failing Hub tests**

Add behavioral assertions that the demo exposes draggable title bars, exchanges only source/target card DOM positions after a synthetic drag/drop flow, retains task content with each card, and displays Windows/Mac v1.3.0. Update the manifest contract to require ordered `parts/v1.3.0/` paths and a complete hash matching the newly built ZIP.

- [ ] **Step 2: Run focused Hub tests and verify RED**

```powershell
node --test tests/codex-thread-workbench-page.test.mjs tests/codex-thread-workbench-download.test.mjs
```

Expected: v1.3.0 and drag behavior assertions fail against the current v1.2.0 page.

- [ ] **Step 3: Implement public demo drag feedback and exchange**

Add the same title-bar grip, 6-pixel threshold, source lift, target green outline, exact swap, cancellation cleanup, and local order persistence to the static demo without making conversation text interactive.

- [ ] **Step 4: Sync the app snapshot and create Windows v1.3.0 parts**

Copy only tracked source, tests, scripts, README, solution, and project files into `build/codex-thread-workbench`. Change `RELEASE_DIRECTORY` to `v1.3.0`, run the splitter against the verified Windows ZIP, and keep old v1.2.0 parts until the new manifest is ready.

- [ ] **Step 5: Run Workbench-focused Hub tests and verify GREEN**

```powershell
node --test tests/codex-thread-workbench-download.test.mjs tests/codex-thread-workbench-local-storage-migration.test.mjs tests/codex-thread-workbench-mac-download.test.mjs tests/codex-thread-workbench-page.test.mjs tests/codex-thread-workbench-video.test.mjs
```

Expected: all focused tests pass with 0 failures.

- [ ] **Step 6: Commit Hub source, demo, and Windows parts**

Stage only Workbench workflow/snapshot/demo/tests/manifest/v1.3.0 parts and commit `release: publish workbench 1.3.0 drag reorder`.

### Task 5: macOS artifacts, GitHub merge, Pages, and public verification

**Files:**
- Updated by workflow: `projects/codex-thread-workbench/download/mac/manifest-arm64.json`
- Updated by workflow: `projects/codex-thread-workbench/download/mac/manifest-x64.json`
- Updated by workflow: `projects/codex-thread-workbench/download/mac/parts/**`
- Update after verification: Obsidian `05-项目记忆/CodexThreadWorkbench.md` and `05-项目记忆/AI-Application-Hub.md`.

**Interfaces:**
- Consumes: pushed Hub branch and `build-codex-thread-workbench` v1.3.0 snapshot.
- Produces: merged `main`, successful macOS and Pages workflows, verified public downloads, and durable project memory.

- [ ] **Step 1: Verify GitHub identity, latest main, and branch safety**

Run `gh --version`, `gh auth status`, `gh repo view ... --json viewerPermission`, fetch `origin/main`, and rebase the feature branch if remote main advanced. Never force-push or include the active full-audit worktree changes.

- [ ] **Step 2: Push the branch and run the macOS workflow on that ref**

Push with tracking, invoke `.github/workflows/build-codex-thread-workbench.yml` using the feature ref, wait for arm64, x64, and publish jobs, then fetch the workflow bot's manifest/part commit.

- [ ] **Step 3: Re-run focused and full available publication gates**

Run the app Debug/Release suites, Workbench-focused Hub tests, relevant Hub catalog/platform tests, `git diff --check`, and verify Windows plus both Mac manifests/part lengths and hashes.

- [ ] **Step 4: Open a ready PR and merge without overwriting concurrent work**

Create a PR describing drag behavior, identity/persistence guarantees, v1.3.0 packages, and test evidence. Merge only when the branch is based on current `main` and required checks pass.

- [ ] **Step 5: Wait for Pages and verify the public release**

Verify Hub four-entry card, demo drag interaction, video playback, Windows download, both Mac architecture downloads, every part HTTP 200, full reconstructed lengths/SHA-256, desktop/mobile overflow, and browser logs.

- [ ] **Step 6: Update long-term memory and final read-only state**

Record source/merge/main SHAs, workflow IDs, test counts, package bytes/hashes, public URLs, local delivery paths, running version, and remaining thread-folder limitation. Confirm both implementation and publication worktrees are clean before reporting completion.
