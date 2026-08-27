using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Tests.Presentation;

namespace CodexThreadWorkbench.Tests.Confirmation;

public sealed class ConfirmationMonitorTests
{
    private static readonly DateTimeOffset Now =
        new(2026, 8, 20, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task FirstScan_ReadsAllPotentialThreadsAndSkipsUnsupportedStatuses()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.AddRange(
        [
            Summary("recent", Now.AddHours(-2), ThreadStatusKind.Idle),
            Summary("old", Now.AddHours(-25), ThreadStatusKind.Idle),
            Summary("running", Now, ThreadStatusKind.Running),
            Summary("approval", Now, ThreadStatusKind.NeedsApproval)
        ]);
        client.ThreadStates["recent"] = WaitingState("recent", Now.AddHours(-2));
        client.ThreadStates["old"] = WaitingState("old", Now.AddHours(-25));
        client.ThreadStates["running"] = RunningState("running", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);

        Assert.Equal(
            ["recent", "old"],
            monitor.Candidates.Select(candidate => candidate.ThreadId));
        Assert.Equal(1, client.ReadCalls["recent"]);
        Assert.Equal(1, client.ReadCalls["old"]);
        Assert.Equal(1, client.ReadCalls["running"]);
        Assert.False(client.ReadCalls.ContainsKey("approval"));
    }

    [Fact]
    public async Task Scan_UsesInjectedSnapshotReaderInsteadOfFullThreadHistory()
    {
        var client = new FakeCodexThreadClient();
        var summary = Summary("snapshot", Now, ThreadStatusKind.NotLoaded);
        client.Threads.Add(summary);
        var reader = new RecordingThreadReader(WaitingState("snapshot", Now));
        var monitor = new ConfirmationMonitor(
            client,
            new ConfirmationDetector(),
            threadReader: reader);

        await monitor.ScanOnceAsync(Now);

        Assert.Equal(["snapshot"], reader.ThreadIds);
        Assert.Empty(client.ReadCalls);
        Assert.Equal("snapshot", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task FirstScan_ReadsRecentNotLoadedThread_AndPublishesCandidate()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(
            Summary("not-loaded", Now.AddHours(-2), ThreadStatusKind.NotLoaded));
        client.ThreadStates["not-loaded"] = WaitingState(
            "not-loaded",
            Now.AddHours(-2));
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);

        var candidate = Assert.Single(monitor.Candidates);
        Assert.Equal("not-loaded", candidate.ThreadId);
        Assert.Equal(1, client.ReadCalls["not-loaded"]);
    }

    [Fact]
    public async Task FirstScan_ReadsRecentInterruptedThread_AndPublishesCandidate()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(
            Summary("interrupted", Now.AddHours(-2), ThreadStatusKind.Interrupted));
        client.ThreadStates["interrupted"] = new ThreadCardState(
            Summary("interrupted", Now.AddHours(-2), ThreadStatusKind.Interrupted),
            [new ChatMessage(
                "message-interrupted",
                ChatRole.Assistant,
                "任务已经停止。")],
            ThreadStatusKind.Interrupted,
            LatestTurnStatus: ThreadStatusKind.Interrupted);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);

        Assert.Equal("interrupted", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task Scan_PublishesFoundCandidateBeforeLaterReadCompletes()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.AddRange(
        [
            Summary("ready", Now, ThreadStatusKind.Idle),
            Summary("slow", Now.AddMinutes(-1), ThreadStatusKind.Idle)
        ]);
        client.ThreadStates["ready"] = WaitingState("ready", Now);
        client.ThreadStates["slow"] = WaitingState("slow", Now.AddMinutes(-1));
        client.DelayedReadThreadIds.Add("slow");
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        var published = new TaskCompletionSource<IReadOnlyList<ConfirmationCandidate>>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        monitor.CandidatesChanged += candidates => published.TrySetResult(candidates);

        var scan = monitor.ScanOnceAsync(Now);
        await client.ReadStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        try
        {
            var candidates = await published.Task.WaitAsync(TimeSpan.FromMilliseconds(200));
            Assert.Equal("ready", Assert.Single(candidates).ThreadId);
        }
        finally
        {
            client.ReadCompletion.TrySetResult();
            await scan;
        }
    }

    [Fact]
    public async Task Scan_PublishesFastLaterCandidateWhileEarlierReadIsBlocked()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.AddRange(
        [
            Summary("slow", Now, ThreadStatusKind.Idle),
            Summary("ready", Now.AddMinutes(-1), ThreadStatusKind.Idle)
        ]);
        client.ThreadStates["slow"] = WaitingState("slow", Now);
        client.ThreadStates["ready"] = WaitingState("ready", Now.AddMinutes(-1));
        client.DelayedReadThreadIds.Add("slow");
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        var published = new TaskCompletionSource<IReadOnlyList<ConfirmationCandidate>>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        monitor.CandidatesChanged += candidates =>
        {
            if (candidates.Any(candidate => candidate.ThreadId == "ready"))
            {
                published.TrySetResult(candidates);
            }
        };

        var scan = monitor.ScanOnceAsync(Now);
        await client.ReadStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        try
        {
            var candidates = await published.Task.WaitAsync(TimeSpan.FromMilliseconds(300));
            Assert.Contains(candidates, candidate => candidate.ThreadId == "ready");
        }
        finally
        {
            client.ReadCompletion.TrySetResult();
            await scan;
        }
    }

    [Fact]
    public async Task Scan_UsesConfiguredMaximumConcurrentReads()
    {
        var client = new FakeCodexThreadClient();
        for (var index = 0; index < 10; index++)
        {
            var id = $"thread-{index}";
            client.Threads.Add(Summary(id, Now.AddSeconds(-index), ThreadStatusKind.Idle));
            client.ThreadStates[id] = WaitingState(id, Now.AddSeconds(-index));
            client.DelayedReadThreadIds.Add(id);
        }

        var monitor = new ConfirmationMonitor(
            client,
            new ConfirmationDetector(),
            TimeSpan.FromSeconds(2),
            maxConcurrentThreadReads: 3);
        var scan = monitor.ScanOnceAsync(Now);
        try
        {
            var deadline = DateTimeOffset.UtcNow.AddSeconds(1);
            while (client.MaxConcurrentReadCount < 3 && DateTimeOffset.UtcNow < deadline)
            {
                await Task.Delay(10);
            }

            Assert.Equal(3, client.MaxConcurrentReadCount);
        }
        finally
        {
            client.ReadCompletion.TrySetResult();
            await scan;
        }

        Assert.InRange(client.MaxConcurrentReadCount, 2, 3);
    }

    [Fact]
    public async Task Scan_DefaultsToTwoConcurrentReadsToBoundMemory()
    {
        var client = new FakeCodexThreadClient();
        for (var index = 0; index < 6; index++)
        {
            var id = $"bounded-{index}";
            client.Threads.Add(Summary(id, Now.AddSeconds(-index), ThreadStatusKind.Idle));
            client.ThreadStates[id] = WaitingState(id, Now.AddSeconds(-index));
            client.DelayedReadThreadIds.Add(id);
        }

        var monitor = new ConfirmationMonitor(
            client,
            new ConfirmationDetector(),
            TimeSpan.FromSeconds(2));
        var scan = monitor.ScanOnceAsync(Now);
        try
        {
            var deadline = DateTimeOffset.UtcNow.AddSeconds(1);
            while (client.MaxConcurrentReadCount < 2 && DateTimeOffset.UtcNow < deadline)
            {
                await Task.Delay(10);
            }

            Assert.Equal(2, client.MaxConcurrentReadCount);
        }
        finally
        {
            client.ReadCompletion.TrySetResult();
            await scan;
        }
    }

    [Fact]
    public async Task Scan_TimesOutSlowRead_AndContinuesToLaterCandidate()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.AddRange(
        [
            Summary("slow", Now, ThreadStatusKind.Idle),
            Summary("ready", Now.AddMinutes(-1), ThreadStatusKind.Idle)
        ]);
        client.ThreadStates["slow"] = WaitingState("slow", Now);
        client.ThreadStates["ready"] = WaitingState(
            "ready",
            Now.AddMinutes(-1));
        client.DelayedReadThreadIds.Add("slow");
        var monitor = new ConfirmationMonitor(
            client,
            new ConfirmationDetector(),
            TimeSpan.FromMilliseconds(50));

        await monitor.ScanOnceAsync(Now).WaitAsync(TimeSpan.FromSeconds(1));

        Assert.Equal("ready", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task Scan_DoesNotRereadUnchangedThread_ButRereadsChangedThread()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Idle));
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);
        await monitor.ScanOnceAsync(Now.AddSeconds(2));
        client.Threads[0] = Summary(
            "thread-1",
            Now.AddSeconds(3),
            ThreadStatusKind.Idle);
        client.ThreadStates["thread-1"] = WaitingState(
            "thread-1",
            Now.AddSeconds(3));
        await monitor.ScanOnceAsync(Now.AddSeconds(4));

        Assert.Equal(2, client.ReadCalls["thread-1"]);
    }

    [Fact]
    public async Task MarkHandled_RemovesCandidateOnce_AndPreventsRediscovery()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Idle));
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        var notifications = 0;
        monitor.CandidatesChanged += _ => notifications++;
        await monitor.ScanOnceAsync(Now);

        monitor.MarkHandled("thread-1", "message-thread-1");
        monitor.MarkHandled("thread-1", "message-thread-1");
        client.Threads[0] = Summary(
            "thread-1",
            Now.AddSeconds(3),
            ThreadStatusKind.Idle);
        client.ThreadStates["thread-1"] = WaitingState(
            "thread-1",
            Now.AddSeconds(3));
        await monitor.ScanOnceAsync(Now.AddSeconds(4));

        Assert.Empty(monitor.Candidates);
        Assert.Equal(2, notifications);
    }

    [Fact]
    public async Task ReadFailure_RetainsCandidate_AndRetriesSameUpdate()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Idle));
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        await monitor.ScanOnceAsync(Now);
        client.Threads[0] = Summary(
            "thread-1",
            Now.AddSeconds(3),
            ThreadStatusKind.Idle);
        client.ReadExceptions["thread-1"] = new IOException("read unavailable");

        await monitor.ScanOnceAsync(Now.AddSeconds(4));
        client.ReadExceptions.Remove("thread-1");
        client.ThreadStates["thread-1"] = WaitingState(
            "thread-1",
            Now.AddSeconds(3),
            "replacement-message");
        await monitor.ScanOnceAsync(Now.AddSeconds(6));

        Assert.Equal(3, client.ReadCalls["thread-1"]);
        Assert.Equal(
            "replacement-message",
            Assert.Single(monitor.Candidates).MessageId);
    }

    [Fact]
    public async Task MissingProductionSnapshot_IsRetriedUntilTheSessionAppears()
    {
        const string threadId = "019f7444-4d4d-7771-9864-0043606d7f99";
        var sessionsRoot = Path.Combine(
            Path.GetTempPath(),
            "CodexThreadWorkbench.Monitor.Tests",
            Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(sessionsRoot);
        try
        {
            var client = new FakeCodexThreadClient();
            client.Threads.Add(
                Summary(threadId, Now.AddDays(-2), ThreadStatusKind.NotLoaded));
            var monitor = new ConfirmationMonitor(
                client,
                new ConfirmationDetector(),
                threadReader: new CodexSessionSnapshotReader(
                    sessionsRoot,
                    throwWhenUnavailable: true));

            await monitor.ScanOnceAsync(Now);

            Assert.Empty(monitor.Candidates);
            var directory = Path.Combine(sessionsRoot, "2026", "08", "20");
            Directory.CreateDirectory(directory);
            await File.WriteAllLinesAsync(
                Path.Combine(
                    directory,
                    $"rollout-2026-08-20T08-00-00-{threadId}.jsonl"),
                [
                    """{"timestamp":"2026-08-20T08:00:00Z","type":"response_item","payload":{"type":"message","id":"message-retried","role":"assistant","content":[{"type":"output_text","text":"请确认这个方案，确认后我会开始实施。"}]}}""",
                    """{"timestamp":"2026-08-20T08:00:01Z","type":"event_msg","payload":{"type":"task_complete"}}"""
                ]);
            await Task.Delay(TimeSpan.FromMilliseconds(2100));

            await monitor.ScanOnceAsync(Now.AddSeconds(3));

            Assert.Equal(
                "message-retried",
                Assert.Single(monitor.Candidates).MessageId);
        }
        finally
        {
            Directory.Delete(sessionsRoot, recursive: true);
        }
    }

    [Fact]
    public async Task ListFailure_RetainsCandidates_AndPublishesThenClearsError()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Idle));
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        await monitor.ScanOnceAsync(Now);
        var errors = new List<string>();
        monitor.ErrorChanged += errors.Add;
        client.ListException = new IOException("list unavailable");

        await monitor.ScanOnceAsync(Now.AddSeconds(2));
        client.ListException = null;
        await monitor.ScanOnceAsync(Now.AddSeconds(4));

        Assert.Single(monitor.Candidates);
        Assert.Equal(string.Empty, monitor.ErrorText);
        Assert.Equal(["list unavailable", string.Empty], errors);
    }

    [Fact]
    public async Task DisposeAsync_CancelsAnInFlightStartedScan()
    {
        var client = new FakeCodexThreadClient { DelayList = true };
        IConfirmationMonitor monitor = new ConfirmationMonitor(
            client,
            new ConfirmationDetector());

        monitor.Start();
        await client.ListStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        await monitor.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(1));

        Assert.Equal(1, client.ListCalls);
    }

    [Fact]
    public async Task InitialScan_ReadsOldThreadOnceThenSkipsUnchangedThread()
    {
        var oldUpdatedAt = Now.AddHours(-25);
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("old", oldUpdatedAt, ThreadStatusKind.Idle));
        client.ThreadStates["old"] = WaitingState("old", oldUpdatedAt);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);
        await monitor.ScanOnceAsync(Now.AddSeconds(2));

        Assert.Equal(1, client.ReadCalls["old"]);
        Assert.Equal("old", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task InitialScan_RequestsThreadsBeyondFirstTwoHundred()
    {
        var client = new FakeCodexThreadClient();
        for (var index = 0; index < 200; index++)
        {
            client.Threads.Add(
                Summary($"approval-{index}", Now, ThreadStatusKind.NeedsApproval));
        }

        client.Threads.Add(Summary("waiting-201", Now, ThreadStatusKind.Idle));
        client.ThreadStates["waiting-201"] = WaitingState("waiting-201", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);

        Assert.Equal("waiting-201", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task SubsequentScan_RequestsOnlyMostRecentThreadPage()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Idle));
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);
        await monitor.ScanOnceAsync(Now.AddSeconds(2));

        Assert.Equal([int.MaxValue, 200], client.RequestedListLimits);
    }

    [Fact]
    public async Task SubsequentScan_RetriesFailedInitialThreadBeyondRecentPage()
    {
        var client = new FakeCodexThreadClient();
        for (var index = 0; index < 200; index++)
        {
            client.Threads.Add(
                Summary($"approval-{index}", Now, ThreadStatusKind.NeedsApproval));
        }

        client.Threads.Add(Summary("waiting-201", Now, ThreadStatusKind.Idle));
        client.ThreadStates["waiting-201"] = WaitingState("waiting-201", Now);
        client.ReadExceptions["waiting-201"] = new IOException("temporarily locked");
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);
        client.ReadExceptions.Remove("waiting-201");
        await monitor.ScanOnceAsync(Now.AddSeconds(2));

        Assert.Equal(2, client.ReadCalls["waiting-201"]);
        Assert.Equal("waiting-201", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task CancelledInitialScan_RetriesFullHistoryOnNextScan()
    {
        var client = new FakeCodexThreadClient();
        for (var index = 0; index < 200; index++)
        {
            client.Threads.Add(
                Summary($"approval-{index}", Now, ThreadStatusKind.NeedsApproval));
        }

        client.Threads.Add(Summary("waiting-201", Now, ThreadStatusKind.Idle));
        client.ThreadStates["waiting-201"] = WaitingState("waiting-201", Now);
        client.DelayedReadThreadIds.Add("waiting-201");
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        using var cancellation = new CancellationTokenSource();

        var cancelledScan = monitor.ScanOnceAsync(Now, cancellation.Token);
        await client.ReadStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cancelledScan);
        client.DelayedReadThreadIds.Remove("waiting-201");
        await monitor.ScanOnceAsync(Now.AddSeconds(2));

        Assert.Equal([int.MaxValue, int.MaxValue], client.RequestedListLimits);
        Assert.Equal("waiting-201", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task Scan_ReevaluatesStatusChangeWhenUpdatedAtIsUnchanged()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Running));
        client.ThreadStates["thread-1"] = RunningState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());

        await monitor.ScanOnceAsync(Now);
        client.Threads[0] = Summary("thread-1", Now, ThreadStatusKind.Idle);
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        await monitor.ScanOnceAsync(Now.AddSeconds(2));

        Assert.Equal(2, client.ReadCalls["thread-1"]);
        Assert.Equal("thread-1", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task Scan_ReadsRunningSummarySoSnapshotCanCorrectStaleStatus()
    {
        var client = new FakeCodexThreadClient();
        var summary = Summary("stale-running", Now, ThreadStatusKind.Running);
        client.Threads.Add(summary);
        var reader = new RecordingThreadReader(WaitingState("stale-running", Now));
        var monitor = new ConfirmationMonitor(
            client,
            new ConfirmationDetector(),
            threadReader: reader);

        await monitor.ScanOnceAsync(Now);

        Assert.Equal(["stale-running"], reader.ThreadIds);
        Assert.Equal("stale-running", Assert.Single(monitor.Candidates).ThreadId);
    }

    [Fact]
    public async Task ChangedThreadThatStartsRunning_RemovesExistingCandidate()
    {
        var client = new FakeCodexThreadClient();
        client.Threads.Add(Summary("thread-1", Now, ThreadStatusKind.Idle));
        client.ThreadStates["thread-1"] = WaitingState("thread-1", Now);
        var monitor = new ConfirmationMonitor(client, new ConfirmationDetector());
        await monitor.ScanOnceAsync(Now);
        client.Threads[0] = Summary(
            "thread-1",
            Now.AddSeconds(3),
            ThreadStatusKind.Running);
        client.ThreadStates["thread-1"] = RunningState(
            "thread-1",
            Now.AddSeconds(3));

        await monitor.ScanOnceAsync(Now.AddSeconds(4));

        Assert.Empty(monitor.Candidates);
    }

    private static ThreadSummary Summary(
        string id,
        DateTimeOffset updatedAt,
        ThreadStatusKind status) =>
        new(id, $"任务 {id}", "预览", @"C:\work", updatedAt, status);

    private static ThreadCardState WaitingState(
        string id,
        DateTimeOffset updatedAt,
        string? messageId = null) =>
        new(
            Summary(id, updatedAt, ThreadStatusKind.Idle),
            [new ChatMessage(
                messageId ?? $"message-{id}",
                ChatRole.Assistant,
                "请确认这个方案，确认后我会开始实施。")],
            ThreadStatusKind.Idle,
            LatestTurnStatus: ThreadStatusKind.Completed);

    private static ThreadCardState RunningState(
        string id,
        DateTimeOffset updatedAt) =>
        new(
            Summary(id, updatedAt, ThreadStatusKind.Running),
            [new ChatMessage(
                $"message-{id}",
                ChatRole.Assistant,
                "仍在处理中。")],
            ThreadStatusKind.Running,
            LatestTurnStatus: ThreadStatusKind.Running);

    private sealed class RecordingThreadReader(
        ThreadCardState state) : IConfirmationThreadReader
    {
        public List<string> ThreadIds { get; } = [];

        public Task<ThreadCardState> ReadThreadAsync(
            ThreadSummary summary,
            CancellationToken cancellationToken = default)
        {
            ThreadIds.Add(summary.Id);
            return Task.FromResult(state);
        }
    }
}
