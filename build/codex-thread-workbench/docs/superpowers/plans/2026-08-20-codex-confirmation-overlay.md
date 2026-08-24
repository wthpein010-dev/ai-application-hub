# Codex Confirmation Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a topmost auto-hiding overlay to CodexThreadWorkbench that detects recently completed Codex tasks waiting for implementation approval and sends a fixed confirmation to one or all matching tasks.

**Architecture:** Extend the existing Avalonia application with a pure confirmation detector, a cached `app-server` monitor, a presentation view model, and a second topmost window that shares the existing `ICodexThreadClient`. Keep native command/file approval requests on the existing path, revalidate each conversation immediately before sending, and dispose the monitor before the shared client.

**Tech Stack:** .NET 8, C# 12, Avalonia 11.3.18, xUnit 2.5.3, `codex app-server` JSON-RPC

**Spec:** `docs/superpowers/specs/2026-08-20-codex-confirmation-overlay-design.md`

## Global Constraints

- Start implementation from the latest validated v1.3.0 source commit `9cd99d6750c70f631fe07ac4f7472cbdbc559c92`, then include the design and plan commits from `main`.
- Send the exact text `确认，继续开始做，完成前不要停。`; do not make it configurable in this version.
- Only conversational implementation confirmations enter the overlay; `ApprovalRequested` command/file security requests remain unchanged.
- Initial discovery is limited to threads updated in the preceding 24 hours; later polling evaluates newly changed idle threads.
- The overlay is top-center, borderless, topmost, hidden from the taskbar, non-activating, and completely hidden when empty.
- Keep all chat-derived confirmation candidates in memory; do not persist message text or Codex credentials.
- Add no new NuGet dependencies.
- Preserve Windows and macOS builds even though the requested live acceptance target is Windows.

## File Structure

### New core files

- `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationCandidate.cs` — immutable candidate identity and display data.
- `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationDetector.cs` — deterministic, side-effect-free detection rules.
- `src/CodexThreadWorkbench.Core/Confirmation/IConfirmationMonitor.cs` — monitor contract consumed by presentation code.
- `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationMonitor.cs` — 24-hour initial scan, changed-thread cache, candidate set, and polling lifetime.
- `src/CodexThreadWorkbench.Core/Presentation/ConfirmationItemViewModel.cs` — per-row send, ignore, error, and retry state.
- `src/CodexThreadWorkbench.Core/Presentation/ConfirmationOverlayViewModel.cs` — collection synchronization, single confirmation, and sequential confirm-all behavior.
- `src/CodexThreadWorkbench.Core/Presentation/WorkbenchSession.cs` — deterministic shared-resource disposal ordering.

### New desktop files

- `src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml` — compact overlay layout.
- `src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml.cs` — visibility, top-center positioning, non-activating show, and slide-in behavior.

### New tests

- `tests/CodexThreadWorkbench.Tests/Confirmation/ConfirmationDetectorTests.cs`
- `tests/CodexThreadWorkbench.Tests/Confirmation/ConfirmationMonitorTests.cs`
- `tests/CodexThreadWorkbench.Tests/Presentation/ConfirmationOverlayViewModelTests.cs`
- `tests/CodexThreadWorkbench.Tests/Presentation/WorkbenchSessionTests.cs`
- `tests/CodexThreadWorkbench.Desktop.Tests/ConfirmationOverlayWindowTests.cs`

### Existing files to modify

- `src/CodexThreadWorkbench.Core/Models/ThreadCardState.cs` — expose latest turn status separately from the display status.
- `src/CodexThreadWorkbench.Core/Codex/CodexAppServerClient.cs` — populate latest turn status from `thread/read`.
- `src/CodexThreadWorkbench.Core/Presentation/MainViewModel.cs` — optionally defer shared-client ownership to `WorkbenchSession`.
- `src/CodexThreadWorkbench/App.axaml.cs` — construct and start the overlay feature with the existing client.
- `src/CodexThreadWorkbench/MainWindow.axaml.cs` — delegate shutdown to the shared session and close the overlay.
- `tests/CodexThreadWorkbench.Tests/Codex/CodexAppServerClientTests.cs` — assert latest completed turn projection.
- `tests/CodexThreadWorkbench.Tests/Presentation/FakeCodexThreadClient.cs` — call tracking, per-operation failures, and read-count support.
- `tests/CodexThreadWorkbench.Tests/Presentation/MainViewModelTests.cs` — cover owned versus shared client disposal.
- `tests/CodexThreadWorkbench.Desktop.Tests/WindowLifecycleTests.cs` — update the local fake only if the shared lifetime interface requires it.
- `README.md` — document the overlay, 24-hour scan, fixed confirmation, ignore action, and security-approval exclusion.

---

### Task 1: Conversation Snapshot and Conservative Detector

**Files:**
- Create: `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationCandidate.cs`
- Create: `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationDetector.cs`
- Modify: `src/CodexThreadWorkbench.Core/Models/ThreadCardState.cs`
- Modify: `src/CodexThreadWorkbench.Core/Codex/CodexAppServerClient.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Confirmation/ConfirmationDetectorTests.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Codex/CodexAppServerClientTests.cs`

**Interfaces:**
- Consumes: existing `ThreadCardState`, `ThreadSummary`, `ChatMessage`, `ChatRole`, and `ThreadStatusKind`.
- Produces: `ConfirmationCandidate(string ThreadId, string Title, string MessageId, string RequestPreview, DateTimeOffset UpdatedAt)`.
- Produces: `ConfirmationDetector.Detect(ThreadCardState state) -> ConfirmationCandidate?`.
- Produces: optional record parameter `ThreadCardState.LatestTurnStatus` defaulting to `ThreadStatusKind.NotLoaded` for source compatibility.

- [ ] **Step 1: Add failing detector tests**

```csharp
[Theory]
[InlineData("方案已经整理完毕，请确认；确认后我就开始开发。")]
[InlineData("如果认可这个方案，请回复确认，我会进入实现。")]
[InlineData("如果你确认这个方向，我就开始实现。")]
[InlineData("请审阅方案；确认后我会开始编写实施计划。")]
[InlineData("Please confirm this design and I will start implementation.")]
public void Detect_ReturnsCandidate_ForExplicitImplementationConfirmation(string text)
{
    var state = State(text, ChatRole.Assistant, ThreadStatusKind.Completed);

    var candidate = new ConfirmationDetector().Detect(state);

    Assert.NotNull(candidate);
    Assert.Equal("thread-1", candidate.ThreadId);
    Assert.Equal("message-1", candidate.MessageId);
}

[Theory]
[InlineData("任务已经完成。")]
[InlineData("请确认这段文字是否准确。")]
[InlineData("我现在开始开发。")]
[InlineData("需要我继续吗？")]
public void Detect_RejectsMessages_WithoutBothStrongSignals(string text)
{
    Assert.Null(new ConfirmationDetector().Detect(
        State(text, ChatRole.Assistant, ThreadStatusKind.Completed)));
}

[Fact]
public void Detect_RejectsUserLastMessage_AndRunningTurn()
{
    Assert.Null(new ConfirmationDetector().Detect(
        State("确认后开始实施", ChatRole.User, ThreadStatusKind.Completed)));
    Assert.Null(new ConfirmationDetector().Detect(
        State("请确认，确认后开始实施", ChatRole.Assistant, ThreadStatusKind.Running)));
}
```

The `State` helper must construct one `ThreadSummary` updated at `2026-08-20T08:00:00Z`, one message with ID `message-1`, and a `ThreadCardState` whose `LatestTurnStatus` is the supplied status.

- [ ] **Step 2: Run the detector tests and confirm failure**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~ConfirmationDetectorTests"
```

Expected: FAIL because `ConfirmationCandidate` and `ConfirmationDetector` do not exist.

- [ ] **Step 3: Add the immutable candidate and minimal detector**

```csharp
public sealed record ConfirmationCandidate(
    string ThreadId,
    string Title,
    string MessageId,
    string RequestPreview,
    DateTimeOffset UpdatedAt);
```

Implement `ConfirmationDetector` with ordinal-ignore-case phrase groups. The confirmation group must include `请确认`, `确认后`, `回复确认`, `是否按`, `如果认可`, `如果你确认`, `请审阅`, `please confirm`, `reply confirm`, `please review`, and `approve`. The implementation group must include `开始开发`, `开始实施`, `进入实现`, `开始实现`, `开始制作`, `开始做`, `继续执行`, `按方案落地`, `实施计划`, `start implementation`, `begin implementation`, `implementation plan`, `start building`, and `proceed with development`. Require `state.Status` to be `Idle` or `Completed`, `state.LatestTurnStatus` to be `Completed`, and the last message to have `ChatRole.Assistant`. Build a whitespace-normalized preview capped at 140 characters.

```csharp
public ConfirmationCandidate? Detect(ThreadCardState state)
{
    if (state.Status is not (ThreadStatusKind.Idle or ThreadStatusKind.Completed) ||
        state.LatestTurnStatus != ThreadStatusKind.Completed)
    {
        return null;
    }

    var last = state.Messages.LastOrDefault();
    if (last is null || last.Role != ChatRole.Assistant ||
        !ContainsAny(last.Text, ConfirmationSignals) ||
        !ContainsAny(last.Text, ImplementationSignals))
    {
        return null;
    }

    return new ConfirmationCandidate(
        state.Summary.Id,
        state.Summary.Title,
        last.Id,
        CreatePreview(last.Text),
        state.Summary.UpdatedAt);
}
```

- [ ] **Step 4: Expose and populate latest turn status**

Append `ThreadStatusKind LatestTurnStatus = ThreadStatusKind.NotLoaded` to `ThreadCardState`. In `CodexAppServerClient.ReadThreadAsync`, call `FindLatestTurnStatus(thread)` once, preserve the existing visible-state logic, and pass the result into the record. Add a protocol test with an idle thread and a final turn whose JSON status is `completed`; assert `state.LatestTurnStatus == ThreadStatusKind.Completed` without changing the existing `state.Status` expectation.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~ConfirmationDetectorTests|FullyQualifiedName~CodexAppServerClientTests"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/CodexThreadWorkbench.Core/Confirmation src/CodexThreadWorkbench.Core/Models/ThreadCardState.cs src/CodexThreadWorkbench.Core/Codex/CodexAppServerClient.cs tests/CodexThreadWorkbench.Tests/Confirmation tests/CodexThreadWorkbench.Tests/Codex/CodexAppServerClientTests.cs
git commit -m "feat: detect implementation confirmations"
```

---

### Task 2: Cached 24-Hour Confirmation Monitor

**Files:**
- Create: `src/CodexThreadWorkbench.Core/Confirmation/IConfirmationMonitor.cs`
- Create: `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationMonitor.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Confirmation/ConfirmationMonitorTests.cs`
- Modify: `tests/CodexThreadWorkbench.Tests/Presentation/FakeCodexThreadClient.cs`

**Interfaces:**
- Consumes: `ICodexThreadClient.ListThreadsAsync`, `ICodexThreadClient.ReadThreadAsync`, and `ConfirmationDetector.Detect`.
- Produces: `IConfirmationMonitor.CandidatesChanged`, `ErrorChanged`, `Candidates`, `ErrorText`, `Start()`, `ScanOnceAsync(DateTimeOffset, CancellationToken)`, `MarkHandled(string, string)`, and `DisposeAsync()`.
- Guarantees: only the first scan applies the 24-hour cutoff; unchanged summaries are not re-read; read failures retain existing candidates.

- [ ] **Step 1: Add fake-client counters and failing monitor tests**

Add `ListCalls`, `Dictionary<string,int> ReadCalls`, `ResumeCalls`, and `StartCalls` to `FakeCodexThreadClient`. Increment them in the corresponding methods without removing existing `LastStart`, `Resumed`, or failure behavior.

```csharp
[Fact]
public async Task FirstScan_ReadsOnlyRecentIdleThreads()
{
    var now = new DateTimeOffset(2026, 8, 20, 8, 0, 0, TimeSpan.Zero);
    var client = ClientWith(
        Summary("recent", now.AddHours(-2), ThreadStatusKind.Idle),
        Summary("old", now.AddHours(-25), ThreadStatusKind.Idle),
        Summary("running", now, ThreadStatusKind.Running));
    client.ThreadStates["recent"] = WaitingState("recent", now.AddHours(-2));
    var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

    await monitor.ScanOnceAsync(now);

    Assert.Single(monitor.Candidates);
    Assert.Equal(1, client.ReadCalls["recent"]);
    Assert.False(client.ReadCalls.ContainsKey("old"));
    Assert.False(client.ReadCalls.ContainsKey("running"));
}

[Fact]
public async Task UnchangedThread_IsNotReadAgain_ButChangedThreadIs()
{
    var now = DateTimeOffset.Parse("2026-08-20T08:00:00Z");
    var client = ClientWith(Summary("thread-1", now, ThreadStatusKind.Idle));
    client.ThreadStates["thread-1"] = WaitingState("thread-1", now);
    var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

    await monitor.ScanOnceAsync(now);
    await monitor.ScanOnceAsync(now.AddSeconds(2));
    client.Threads[0] = Summary("thread-1", now.AddSeconds(3), ThreadStatusKind.Idle);
    client.ThreadStates["thread-1"] = WaitingState("thread-1", now.AddSeconds(3));
    await monitor.ScanOnceAsync(now.AddSeconds(4));

    Assert.Equal(2, client.ReadCalls["thread-1"]);
}
```

Add explicit tests for `MarkHandled`, changed last-message replacement, a transient `ReadThreadAsync` exception retaining the current candidate, a transient `ListThreadsAsync` exception retaining candidates while publishing a non-empty `ErrorText`, a later successful scan clearing that error, and `DisposeAsync` ending a started polling loop.

- [ ] **Step 2: Run monitor tests and confirm failure**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~ConfirmationMonitorTests"
```

Expected: FAIL because the monitor contract and implementation do not exist.

- [ ] **Step 3: Implement the monitor contract**

```csharp
public interface IConfirmationMonitor : IAsyncDisposable
{
    event Action<IReadOnlyList<ConfirmationCandidate>>? CandidatesChanged;
    event Action<string>? ErrorChanged;
    IReadOnlyList<ConfirmationCandidate> Candidates { get; }
    string ErrorText { get; }
    void Start();
    Task ScanOnceAsync(DateTimeOffset now, CancellationToken cancellationToken = default);
    void MarkHandled(string threadId, string messageId);
}
```

- [ ] **Step 4: Implement cached scanning and polling**

Use dictionaries keyed by thread ID for current candidates and last evaluated `UpdatedAt`, plus a `HashSet<(string ThreadId, string MessageId)>` for handled messages. `ScanOnceAsync` must request at most 200 threads, accept summary status `Idle` or `Completed`, and on the first scan skip summaries older than `now - TimeSpan.FromHours(24)`.

```csharp
public void Start()
{
    if (_runTask is not null) return;
    _runTask = RunAsync(_cancellation.Token);
}

private async Task RunAsync(CancellationToken cancellationToken)
{
    await ScanOnceAsync(DateTimeOffset.UtcNow, cancellationToken);
    using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
    while (await timer.WaitForNextTickAsync(cancellationToken))
    {
        await ScanOnceAsync(DateTimeOffset.UtcNow, cancellationToken);
    }
}
```

Catch cancellation only when the monitor token is cancelled. Catch a list failure, keep existing candidates, and publish its concise message through `ErrorChanged`; clear the message after the next successful list. Catch per-thread read failures and continue without deleting that thread's existing candidate. Publish a new sorted snapshot only when candidate keys or values actually change. `MarkHandled` removes the matching candidate and publishes once.

- [ ] **Step 5: Run detector and monitor tests**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~Confirmation"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/CodexThreadWorkbench.Core/Confirmation tests/CodexThreadWorkbench.Tests/Confirmation tests/CodexThreadWorkbench.Tests/Presentation/FakeCodexThreadClient.cs
git commit -m "feat: monitor recent confirmation requests"
```

---

### Task 3: Single and Confirm-All Presentation Logic

**Files:**
- Create: `src/CodexThreadWorkbench.Core/Presentation/ConfirmationItemViewModel.cs`
- Create: `src/CodexThreadWorkbench.Core/Presentation/ConfirmationOverlayViewModel.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Presentation/ConfirmationOverlayViewModelTests.cs`

**Interfaces:**
- Consumes: `IConfirmationMonitor`, `ICodexThreadClient`, and `ConfirmationDetector`.
- Produces: `ConfirmationOverlayViewModel.Items`, `HasItems`, `CountText`, `ConfirmAllText`, `MonitorErrorText`, `HasMonitorError`, `ConfirmAllCommand`, `ConfirmAsync`, `ConfirmAllAsync`, `Ignore`, and `DisposeAsync`.
- Produces: `ConfirmationItemViewModel.Candidate`, `Title`, `RequestPreview`, `IsSending`, `ErrorText`, `HasError`, `ConfirmCommand`, `IgnoreCommand`.
- Fixed message constant: `ConfirmationOverlayViewModel.ConfirmationMessage`.

- [ ] **Step 1: Add a pushable fake monitor and failing view-model tests**

```csharp
[Fact]
public async Task ConfirmAsync_RevalidatesThenResumesAndStartsExactMessage()
{
    var candidate = Candidate("thread-1", "message-1");
    var monitor = new FakeMonitor(candidate);
    var client = ClientWith(WaitingState("thread-1", candidate.UpdatedAt));
    var viewModel = new ConfirmationOverlayViewModel(
        client, monitor, new ConfirmationDetector());
    var item = Assert.Single(viewModel.Items);

    await viewModel.ConfirmAsync(item);

    Assert.Equal(["resume:thread-1", "start:thread-1"], client.OperationLog);
    Assert.Equal("确认，继续开始做，完成前不要停。", client.LastStart?.Text);
    Assert.Empty(viewModel.Items);
}

[Fact]
public async Task ConfirmAsync_DoesNotSend_WhenMessageChanged()
{
    var monitor = new FakeMonitor(Candidate("thread-1", "old-message"));
    var client = ClientWith(WaitingState("thread-1", DateTimeOffset.UtcNow, "new-message"));
    var viewModel = new ConfirmationOverlayViewModel(
        client, monitor, new ConfirmationDetector());

    await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

    Assert.Empty(client.OperationLog);
    Assert.Empty(viewModel.Items);
}
```

Add tests proving `Ignore` sends nothing and suppresses the current key, confirm-all executes in visible order, partial failure keeps only the failed row with `HasError == true`, retry clears the error on success, and a second confirm-all cannot overlap the first.

- [ ] **Step 2: Run view-model tests and confirm failure**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~ConfirmationOverlayViewModelTests"
```

Expected: FAIL because both view-model types do not exist.

- [ ] **Step 3: Implement per-item state**

`ConfirmationItemViewModel` must store its immutable candidate and accept `Func<ConfirmationItemViewModel,Task>` and `Action<ConfirmationItemViewModel>` delegates. It exposes an `AsyncRelayCommand` for confirm and a `RelayCommand` for ignore, both disabled while `IsSending` is true. Setting `ErrorText` must raise `HasError`.

- [ ] **Step 4: Implement overlay synchronization and revalidated send**

Capture `SynchronizationContext.Current` in the constructor. Subscribe to `CandidatesChanged` and `ErrorChanged`, preserve an existing item instance when its `(ThreadId, MessageId)` key is unchanged, remove absent items, and reorder by descending `UpdatedAt`. Mirror monitor errors into `MonitorErrorText` and raise `HasMonitorError`; unsubscribe from both events during disposal.

```csharp
public async Task ConfirmAsync(ConfirmationItemViewModel item)
{
    item.IsSending = true;
    item.ErrorText = string.Empty;
    try
    {
        var current = _detector.Detect(await _client.ReadThreadAsync(item.Candidate.ThreadId));
        if (current?.MessageId != item.Candidate.MessageId)
        {
            _monitor.MarkHandled(item.Candidate.ThreadId, item.Candidate.MessageId);
            return;
        }

        await _client.ResumeThreadAsync(item.Candidate.ThreadId);
        await _client.StartTurnAsync(item.Candidate.ThreadId, ConfirmationMessage);
        _monitor.MarkHandled(item.Candidate.ThreadId, item.Candidate.MessageId);
    }
    catch (Exception error)
    {
        item.ErrorText = error.Message;
    }
    finally
    {
        item.IsSending = false;
    }
}
```

`ConfirmAllAsync` must snapshot items that are not sending, set `IsConfirmingAll`, update `ConfirmAllText` to `正在确认 i/n`, await `ConfirmAsync` sequentially, then restore `一键全部确认`. `Ignore` calls `MarkHandled` and does not touch the client. `DisposeAsync` only unsubscribes from monitor events; it does not dispose the shared monitor or client.

- [ ] **Step 5: Run all core confirmation tests**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~Confirmation"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/CodexThreadWorkbench.Core/Presentation/Confirmation* tests/CodexThreadWorkbench.Tests/Presentation/ConfirmationOverlayViewModelTests.cs tests/CodexThreadWorkbench.Tests/Presentation/FakeCodexThreadClient.cs
git commit -m "feat: confirm one or all waiting tasks"
```

---

### Task 4: Topmost Auto-Hiding Avalonia Window

**Files:**
- Create: `src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml`
- Create: `src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/ConfirmationOverlayWindowTests.cs`

**Interfaces:**
- Consumes: `ConfirmationOverlayViewModel` and `ConfirmationItemViewModel`.
- Produces: `ConfirmationOverlayWindow.Attach(ConfirmationOverlayViewModel)`, `PositionAtTopCenter(PixelRect)`, and `CloseForShutdown()`.
- Window constants: width `560`, top margin `8`, slide distance `12`, animation duration `150 ms`.

- [ ] **Step 1: Add failing headless window tests**

```csharp
[AvaloniaFact]
public void Overlay_HasRequiredWindowChromeAndTopmostSettings()
{
    var window = new ConfirmationOverlayWindow();

    Assert.True(window.Topmost);
    Assert.False(window.ShowInTaskbar);
    Assert.False(window.ShowActivated);
    Assert.False(window.CanResize);
    Assert.Equal(SystemDecorations.None, window.SystemDecorations);
}

[AvaloniaFact]
public void PositionAtTopCenter_UsesWorkingArea()
{
    var window = new ConfirmationOverlayWindow { Width = 560 };

    window.PositionAtTopCenter(new PixelRect(100, 50, 1500, 900));

    Assert.Equal(new PixelPoint(570, 58), window.Position);
}
```

Add a test that attaches a view model backed by a pushable fake monitor, pushes one candidate, drains the UI dispatcher, and verifies `IsVisible`; pushing an empty set must make `IsVisible` false.

- [ ] **Step 2: Run desktop overlay tests and confirm failure**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj -c Debug --filter "FullyQualifiedName~ConfirmationOverlayWindowTests"
```

Expected: FAIL because `ConfirmationOverlayWindow` does not exist.

- [ ] **Step 3: Build the compact overlay XAML**

Use a transparent window background and a rounded white outer border with the existing `PrimaryBrush`, `BorderBrush`, and text brushes. The header contains `待确认 · {Items.Count}` and the green `一键全部确认` button. Show a compact amber connection message when `HasMonitorError` is true. Bind an `ItemsControl` to `Items`; each row contains the title, a two-line trimmed request preview, a green confirm button, a neutral ignore button, and an orange error/retry area shown only for `HasError`. Render the title as plain display text because the current standalone workbench has no supported Codex desktop task-navigation API.

Set the following window properties in XAML:

```xml
Width="560"
MinHeight="0"
MaxHeight="720"
SizeToContent="Height"
CanResize="False"
ShowInTaskbar="False"
ShowActivated="False"
Topmost="True"
SystemDecorations="None"
TransparencyLevelHint="Transparent"
Background="Transparent"
```

- [ ] **Step 4: Implement visibility, positioning, and slide-in**

`Attach` subscribes to `PropertyChanged` and calls `UpdateVisibilityAsync` when `HasItems` changes. When showing, compute the primary screen working area, position the hidden window at `top + 8 - 12`, set opacity to zero, call `Show()`, and over six 25-ms UI-thread steps move to `top + 8` while fading to opacity one. Cancel any previous animation before starting another. When empty, cancel animation and call `Hide()` immediately so no transparent hit target remains. Subscribe to `Screens.Changed` while open and recalculate position; unsubscribe during shutdown.

- [ ] **Step 5: Run desktop overlay and resource tests**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj -c Debug --filter "FullyQualifiedName~ConfirmationOverlayWindowTests|FullyQualifiedName~AppResourcesTests"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml.cs tests/CodexThreadWorkbench.Desktop.Tests/ConfirmationOverlayWindowTests.cs
git commit -m "feat: show topmost confirmation overlay"
```

---

### Task 5: Shared Client Lifetime and Application Wiring

**Files:**
- Create: `src/CodexThreadWorkbench.Core/Presentation/WorkbenchSession.cs`
- Modify: `src/CodexThreadWorkbench.Core/Presentation/MainViewModel.cs`
- Modify: `src/CodexThreadWorkbench/App.axaml.cs`
- Modify: `src/CodexThreadWorkbench/MainWindow.axaml.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Presentation/WorkbenchSessionTests.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Presentation/MainViewModelTests.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/WindowLifecycleTests.cs`

**Interfaces:**
- Consumes: one shared `ICodexThreadClient`, `MainViewModel`, `IConfirmationMonitor`, and `ConfirmationOverlayViewModel`.
- Produces: `WorkbenchSession.DisposeAsync()` with ordering overlay VM → monitor → main VM → client.
- Produces: optional `MainViewModel(..., bool ownsClient = true)` constructor parameter.
- Produces: `MainWindow.ShutdownAsync` delegate used instead of directly disposing only its data context.

- [ ] **Step 1: Add failing ownership and disposal-order tests**

```csharp
[Fact]
public async Task MainViewModel_DoesNotDisposeSharedClient_WhenOwnershipIsFalse()
{
    var client = new FakeCodexThreadClient();
    var viewModel = new MainViewModel(client, Store(), ownsClient: false);

    await viewModel.DisposeAsync();

    Assert.Equal(0, client.DisposeCalls);
}

[Fact]
public async Task WorkbenchSession_DisposesMonitorBeforeClientExactlyOnce()
{
    var order = new List<string>();
    var session = SessionWithTrackedDisposables(order);

    await session.DisposeAsync();
    await session.DisposeAsync();

    Assert.Equal(["overlay", "monitor", "main", "client"], order);
}
```

Keep the existing test that a default `MainViewModel` owns and disposes its client. Add a desktop test assigning `MainWindow.ShutdownAsync` to a tracked delegate and verify closing uses it once.

- [ ] **Step 2: Run lifetime tests and confirm failure**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj -c Debug --filter "FullyQualifiedName~WorkbenchSessionTests|FullyQualifiedName~MainViewModelTests"
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj -c Debug --filter "FullyQualifiedName~WindowLifecycleTests"
```

Expected: FAIL because shared ownership and `WorkbenchSession` do not exist.

- [ ] **Step 3: Implement idempotent shared lifetime**

Add `_ownsClient` to `MainViewModel`, default it to true, and conditionally call `_client.DisposeAsync()` in its existing `finally` block. `WorkbenchSession` must guard a single `_disposeTask` with a lock and await each resource in the required order even if an earlier resource throws; collect the first exception and rethrow it only after attempting every cleanup.

- [ ] **Step 4: Delegate main-window shutdown**

Add `public Func<Task>? ShutdownAsync { get; set; }` to `MainWindow`. In `ShutdownAndCloseAsync`, await `ShutdownAsync()` when present; otherwise preserve the existing `_viewModel.DisposeAsync()` behavior for compatibility. Add `Action? ClosingCompanionWindows` if required so the overlay is closed on the UI thread before the main window finishes closing.

- [ ] **Step 5: Wire application startup**

In `App.StartDesktopAsync`:

```csharp
var client = await CodexAppServerClient.ConnectAsync();
var mainViewModel = new MainViewModel(client, new WorkspaceStore(), ownsClient: false);
var detector = new ConfirmationDetector();
var monitor = new ConfirmationMonitor(client, detector);
var overlayViewModel = new ConfirmationOverlayViewModel(client, monitor, detector);
var session = new WorkbenchSession(client, mainViewModel, monitor, overlayViewModel);
var overlayWindow = new ConfirmationOverlayWindow();
overlayWindow.Attach(overlayViewModel);
var mainWindow = new MainWindow { DataContext = mainViewModel };
mainWindow.ShutdownAsync = async () =>
{
    overlayWindow.CloseForShutdown();
    await session.DisposeAsync();
};
```

Show the main window, await `mainViewModel.InitializeAsync`, apply saved bounds, then call `monitor.Start()`. Do not show the overlay directly; its `HasItems` transition controls visibility. A startup failure before session construction must still dispose the client.

- [ ] **Step 6: Run lifetime and full Debug tests**

Run:

```powershell
dotnet test CodexThreadWorkbench.sln -c Debug
```

Expected: all tests PASS, including all existing drag, messaging, approval, persistence, packaging, and lifecycle tests.

- [ ] **Step 7: Commit Task 5**

```powershell
git add src/CodexThreadWorkbench.Core/Presentation/MainViewModel.cs src/CodexThreadWorkbench.Core/Presentation/WorkbenchSession.cs src/CodexThreadWorkbench/App.axaml.cs src/CodexThreadWorkbench/MainWindow.axaml.cs tests/CodexThreadWorkbench.Tests/Presentation tests/CodexThreadWorkbench.Desktop.Tests/WindowLifecycleTests.cs
git commit -m "feat: wire confirmation overlay lifecycle"
```

---

### Task 6: Documentation, Release Verification, and Windows Acceptance

**Files:**
- Modify: `README.md`
- Modify: `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj`
- Test: all existing test projects and published executable smoke test.

**Interfaces:**
- Consumes: completed overlay feature and existing Windows publish scripts.
- Produces: a locally validated Windows x64 package and evidence that the overlay works against real Codex threads.

- [ ] **Step 1: Document user behavior and safety boundary**

Add README bullets covering:

- automatic top-center display for recent tasks waiting to start implementation;
- per-task `确认继续`, `忽略`, and `一键全部确认`;
- exact fixed confirmation message;
- initial 24-hour scan and in-process-only handled cache;
- explicit statement that command/file security approvals are not auto-approved.

Set `<Version>1.4.0</Version>` in `CodexThreadWorkbench.csproj`; this feature build must not identify itself as the already released v1.3.0.

- [ ] **Step 2: Run formatting and static checks**

Run:

```powershell
dotnet format CodexThreadWorkbench.sln --verify-no-changes
git diff --check
rg -n "TB[D]|TO[D]O|FIXM[E]" src tests README.md
```

Expected: format and diff checks exit 0; the placeholder scan has no newly introduced hits.

- [ ] **Step 3: Run fresh Debug and Release suites**

Run:

```powershell
dotnet test CodexThreadWorkbench.sln -c Debug --no-restore
dotnet test CodexThreadWorkbench.sln -c Release --no-restore
```

Expected: both configurations PASS with zero failures.

- [ ] **Step 4: Publish Windows x64 and run smoke test**

Run:

```powershell
.\scripts\Publish-Windows.ps1
$exe = Resolve-Path '.\artifacts\release\windows-x64\CodexThreadWorkbench.exe'
& $exe --smoke-test
if ($LASTEXITCODE -ne 0) { throw "Published smoke test failed: $LASTEXITCODE" }
```

Expected: the packaging script succeeds and the published executable exits 0 after `initialize` and `thread/list`.

- [ ] **Step 5: Perform live Windows overlay acceptance**

Launch the published executable normally for this explicit visual acceptance. Do not create new Codex tasks only for testing and do not send messages to unrelated user tasks. If user-authorized waiting tasks already exist, use them; otherwise exercise the same window and send path through the headless desktop integration test with a fake client and limit the live run to read-only discovery plus window behavior. Verify:

1. the overlay appears top-center without activating itself;
2. a normal application can retain keyboard focus while the overlay stays above it;
3. the integration test proves `确认继续` sends the exact fixed message to only the selected thread;
4. the integration test proves `一键全部确认` sends once to every remaining visible candidate;
5. successful rows disappear, an injected or simulated failure remains retryable, and `忽略` sends nothing;
6. when the list becomes empty, the window is truly hidden and does not intercept clicks;
7. an existing command/file security approval still appears only in its original workbench card.

Record the tested executable path, file version, size, SHA-256, Debug/Release counts, and smoke-test exit code in the completion report.

- [ ] **Step 6: Commit Task 6**

```powershell
git add README.md src/CodexThreadWorkbench/CodexThreadWorkbench.csproj
git commit -m "docs: explain confirmation overlay"
```

- [ ] **Step 7: Final verification before completion**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -8
git diff HEAD~1 --check
```

Expected: clean feature worktree, all feature commits present, and no whitespace errors. Do not push or publish to GitHub unless the user separately requests it.
