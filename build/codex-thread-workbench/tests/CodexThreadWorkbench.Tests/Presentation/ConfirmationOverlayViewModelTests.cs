using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Infrastructure;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Tests.Presentation;

public sealed class ConfirmationOverlayViewModelTests
{
    [Fact]
    public async Task BadgeText_TracksCandidateCountAndCapsLargeCounts()
    {
        var monitor = new FakeConfirmationMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            ClientWith(),
            monitor,
            new ConfirmationDetector(),
            new RecordingFallback());

        Assert.Equal(string.Empty, viewModel.BadgeText);

        monitor.Push(Enumerable.Range(1, 7)
            .Select(index => Candidate($"thread-{index}", $"message-{index}"))
            .ToArray());
        Assert.Equal("7", viewModel.BadgeText);

        monitor.Push(Enumerable.Range(1, 120)
            .Select(index => Candidate($"thread-{index}", $"message-{index}"))
            .ToArray());
        Assert.Equal("99+", viewModel.BadgeText);
    }

    private static readonly DateTimeOffset UpdatedAt =
        new(2026, 8, 20, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task CandidateAppearance_PreloadsThreadBeforeClick()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());

        Assert.Equal(["resume:thread-1"], client.OperationLog);
        Assert.False(client.ReadCalls.ContainsKey("thread-1"));
    }

    [Fact]
    public async Task CandidateAppearance_WithDesktopDelivery_DoesNotPreloadThread()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            new RecordingFallback());

        Assert.Empty(client.OperationLog);
    }

    [Fact]
    public async Task ConfirmAsync_ChecksFreshnessAndVerifiesPreloadedThread()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        client.OperationLog.Clear();

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Equal(["start:thread-1"], client.OperationLog);
        Assert.Equal(2, client.ReadCalls["thread-1"]);
        Assert.Equal(
            "确认，继续开始做，完成前不要停。",
            client.LastStart?.Text);
        Assert.Empty(viewModel.Items);
        Assert.Equal([("thread-1", "message-1")], monitor.Handled);
    }

    [Fact]
    public async Task ConfirmAsync_UsesDesktopFallbackForActiveWriter_ThenVerifiesMessage()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        client.ResumeExceptions["thread-1"] = new JsonRpcException(
            -32600,
            "thread thread-1 already has an active writer");
        var fallback = new RecordingFallback((threadId, text) =>
        {
            var state = client.ThreadStates[threadId];
            client.ThreadStates[threadId] = state with
            {
                Messages = state.Messages
                    .Append(new ChatMessage("fallback-user", ChatRole.User, text))
                    .ToArray(),
                Status = ThreadStatusKind.Running,
                ActiveTurnId = "fallback-turn"
            };
        });
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            fallback,
            TimeSpan.FromMilliseconds(50),
            TimeSpan.FromMilliseconds(5));

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Equal(
            [("thread-1", ConfirmationOverlayViewModel.ConfirmationMessage)],
            fallback.Calls);
        Assert.Empty(viewModel.Items);
        Assert.Equal([("thread-1", "message-1")], monitor.Handled);
        Assert.DoesNotContain("start:thread-1", client.OperationLog);
    }

    [Fact]
    public async Task ConfirmAsync_UsesDesktopDeliveryWithoutWaitingForUnavailableResume()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        client.ResumeExceptions["thread-1"] = new IOException("resume unavailable");
        var fallback = new RecordingFallback((threadId, text) =>
        {
            var state = client.ThreadStates[threadId];
            client.ThreadStates[threadId] = state with
            {
                Messages = state.Messages
                    .Append(new ChatMessage("desktop-user", ChatRole.User, text))
                    .ToArray()
            };
        });
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            fallback,
            TimeSpan.FromMilliseconds(50),
            TimeSpan.FromMilliseconds(5));
        client.OperationLog.Clear();

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Equal(
            [("thread-1", ConfirmationOverlayViewModel.ConfirmationMessage)],
            fallback.Calls);
        Assert.DoesNotContain(client.OperationLog, entry => entry.StartsWith("resume:"));
        Assert.DoesNotContain(client.OperationLog, entry => entry.StartsWith("start:"));
        Assert.Empty(viewModel.Items);
    }

    [Fact]
    public async Task ConfirmAsync_DoesNotSendWhenUserAlreadyRepliedAfterCandidate()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        var fallback = new RecordingFallback();
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            fallback);
        var waitingState = client.ThreadStates["thread-1"];
        client.ThreadStates["thread-1"] = waitingState with
        {
            Messages = waitingState.Messages
                .Append(new ChatMessage(
                    "manual-user",
                    ChatRole.User,
                    "我已经在原任务里回复了。"))
                .ToArray()
        };

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Empty(fallback.Calls);
        Assert.Empty(client.OperationLog);
        Assert.Empty(viewModel.Items);
        Assert.Equal([("thread-1", "message-1")], monitor.Handled);
    }

    [Fact]
    public async Task ConfirmAsync_DoesNotSendWhenNewAssistantMessageReplacesCandidate()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        var fallback = new RecordingFallback();
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            fallback);
        var waitingState = client.ThreadStates["thread-1"];
        client.ThreadStates["thread-1"] = waitingState with
        {
            Messages = waitingState.Messages
                .Append(new ChatMessage(
                    "message-2",
                    ChatRole.Assistant,
                    "请确认新的方案，确认后我会开始实施。"))
                .ToArray()
        };

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Empty(fallback.Calls);
        Assert.Empty(client.OperationLog);
        Assert.Empty(viewModel.Items);
        Assert.Equal([("thread-1", "message-1")], monitor.Handled);
    }

    [Fact]
    public async Task ConfirmAsync_KeepsCandidateWhenMessageCannotBeVerified()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        client.AppendUserMessageOnStart = false;
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            verificationTimeout: TimeSpan.FromMilliseconds(30),
            verificationPollInterval: TimeSpan.FromMilliseconds(5));

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        var retained = Assert.Single(viewModel.Items);
        Assert.True(retained.HasError);
        Assert.Contains("未确认", retained.ErrorText);
        Assert.Empty(monitor.Handled);
    }

    [Fact]
    public async Task ConfirmAsync_VerifiesThroughInjectedSnapshotReader()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        var reader = new RecordingThreadReader(
            () => client.ThreadStates["thread-1"]);
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector(),
            threadReader: reader);

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Equal(["thread-1", "thread-1"], reader.ThreadIds);
        Assert.Empty(client.ReadCalls);
        Assert.Empty(viewModel.Items);
    }

    [Fact]
    public async Task ConfirmAsync_RetriesResume_WhenBackgroundPreloadFailed()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        client.ResumeExceptions["thread-1"] = new IOException("preload failed");
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        client.ResumeExceptions.Remove("thread-1");

        await viewModel.ConfirmAsync(Assert.Single(viewModel.Items));

        Assert.Equal(
            ["resume:thread-1", "resume:thread-1", "start:thread-1"],
            client.OperationLog);
        Assert.Empty(viewModel.Items);
        Assert.Equal([("thread-1", "message-1")], monitor.Handled);
    }

    [Fact]
    public void Ignore_RemovesCandidateWithoutStartingTurn()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        client.OperationLog.Clear();

        viewModel.Ignore(Assert.Single(viewModel.Items));

        Assert.Empty(client.OperationLog);
        Assert.Empty(viewModel.Items);
        Assert.Equal([("thread-1", "message-1")], monitor.Handled);
    }

    [Fact]
    public async Task ConfirmAllAsync_ContinuesAfterFailure_AndKeepsRetryableItem()
    {
        var candidates = new[]
        {
            Candidate("thread-1", "message-1"),
            Candidate("thread-2", "message-2"),
            Candidate("thread-3", "message-3")
        };
        var monitor = new FakeConfirmationMonitor(candidates);
        var client = ClientWith(
            WaitingState("thread-1", "message-1"),
            WaitingState("thread-2", "message-2"),
            WaitingState("thread-3", "message-3"));
        client.StartExceptions["thread-2"] = new IOException("start failed");
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        client.OperationLog.Clear();

        await viewModel.ConfirmAllAsync();

        Assert.Equal(
            [
                "start:thread-1",
                "start:thread-2",
                "start:thread-3"
            ],
            client.OperationLog);
        var failed = Assert.Single(viewModel.Items);
        Assert.Equal("thread-2", failed.Candidate.ThreadId);
        Assert.True(failed.HasError);
        Assert.Equal("start failed", failed.ErrorText);
        Assert.Equal("重试", failed.ActionText);
        Assert.False(viewModel.IsConfirmingAll);
        Assert.Equal("一键全部确认", viewModel.ConfirmAllText);

        client.StartExceptions.Remove("thread-2");
        await viewModel.ConfirmAsync(failed);

        Assert.Empty(viewModel.Items);
    }

    [Fact]
    public async Task ConfirmAllAsync_DoesNotOverlapAnActiveBatch()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        client.DelayedStartThreadIds.Add("thread-1");
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());

        var firstBatch = viewModel.ConfirmAllAsync();
        await client.StartStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        var secondBatch = viewModel.ConfirmAllAsync();

        Assert.True(viewModel.IsConfirmingAll);
        Assert.Equal("正在确认 1/1", viewModel.ConfirmAllText);
        Assert.False(viewModel.ConfirmAllCommand.CanExecute(null));
        client.StartCompletion.TrySetResult();
        await Task.WhenAll(firstBatch, secondBatch);
        Assert.Equal(1, client.OperationLog.Count(entry => entry == "start:thread-1"));
    }

    [Fact]
    public async Task InteractionGuard_BlocksConfirmIgnoreAndConfirmAllUntilRearmed()
    {
        var candidate = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(candidate);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        client.OperationLog.Clear();
        var item = Assert.Single(viewModel.Items);

        viewModel.SetInteractionArmed(false);

        Assert.False(viewModel.IsInteractionArmed);
        Assert.False(item.ConfirmCommand.CanExecute(null));
        Assert.False(item.IgnoreCommand.CanExecute(null));
        Assert.False(viewModel.ConfirmAllCommand.CanExecute(null));
        item.ConfirmCommand.Execute(null);
        item.IgnoreCommand.Execute(null);
        viewModel.ConfirmAllCommand.Execute(null);
        await Task.Delay(20);
        Assert.Empty(client.OperationLog);
        Assert.Empty(monitor.Handled);

        viewModel.SetInteractionArmed(true);

        Assert.True(item.ConfirmCommand.CanExecute(null));
        Assert.True(item.IgnoreCommand.CanExecute(null));
        Assert.True(viewModel.ConfirmAllCommand.CanExecute(null));
    }

    [Fact]
    public async Task CandidateRefresh_PreservesFailedItemInstance()
    {
        var first = Candidate("thread-1", "message-1");
        var monitor = new FakeConfirmationMonitor(first);
        var client = ClientWith(WaitingState("thread-1", "message-1"));
        client.ResumeExceptions["thread-1"] = new IOException("resume failed");
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        var failed = Assert.Single(viewModel.Items);
        await viewModel.ConfirmAsync(failed);

        monitor.Push(first, Candidate("thread-2", "message-2"));

        Assert.Same(
            failed,
            viewModel.Items.Single(item => item.Candidate.ThreadId == "thread-1"));
        Assert.Equal("resume failed", failed.ErrorText);
    }

    [Fact]
    public async Task MonitorError_IsMirroredUntilItClears_AndUnsubscribedOnDispose()
    {
        var monitor = new FakeConfirmationMonitor();
        var viewModel = new ConfirmationOverlayViewModel(
            new FakeCodexThreadClient(),
            monitor,
            new ConfirmationDetector());

        monitor.PushError("connection unavailable");

        Assert.True(viewModel.HasMonitorError);
        Assert.True(viewModel.RequiresAttention);
        Assert.Equal("扫描异常 · 请检查", viewModel.CountText);
        Assert.Equal("connection unavailable", viewModel.MonitorErrorText);
        monitor.PushError(string.Empty);
        Assert.False(viewModel.HasMonitorError);
        Assert.False(viewModel.RequiresAttention);
        Assert.Equal("暂无待确认 · 常驻扫描", viewModel.CountText);
        await viewModel.DisposeAsync();
        monitor.PushError("late error");
        Assert.Equal(string.Empty, viewModel.MonitorErrorText);
    }

    private static FakeCodexThreadClient ClientWith(params ThreadCardState[] states)
    {
        var client = new FakeCodexThreadClient
        {
            AppendUserMessageOnStart = true
        };
        foreach (var state in states)
        {
            client.ThreadStates[state.Summary.Id] = state;
        }

        return client;
    }

    private sealed class RecordingFallback(
        Action<string, string>? onSend = null) : IConfirmationMessageFallback
    {
        public List<(string ThreadId, string Text)> Calls { get; } = [];

        public Task SendAsync(
            string threadId,
            string text,
            CancellationToken cancellationToken = default)
        {
            Calls.Add((threadId, text));
            onSend?.Invoke(threadId, text);
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingThreadReader(
        Func<ThreadCardState> state) : IConfirmationThreadReader
    {
        public List<string> ThreadIds { get; } = [];

        public Task<ThreadCardState> ReadThreadAsync(
            ThreadSummary summary,
            CancellationToken cancellationToken = default)
        {
            ThreadIds.Add(summary.Id);
            return Task.FromResult(state());
        }
    }

    private static ConfirmationCandidate Candidate(
        string threadId,
        string messageId) =>
        new(threadId, $"任务 {threadId}", messageId, "等待确认", UpdatedAt);

    private static ThreadCardState WaitingState(
        string threadId,
        string messageId) =>
        new(
            new ThreadSummary(
                threadId,
                $"任务 {threadId}",
                "预览",
                @"C:\work",
                UpdatedAt,
                ThreadStatusKind.Idle),
            [new ChatMessage(
                messageId,
                ChatRole.Assistant,
                "请确认这个方案，确认后我会开始实施。")],
            ThreadStatusKind.Idle,
            LatestTurnStatus: ThreadStatusKind.Completed);

    private sealed class FakeConfirmationMonitor : IConfirmationMonitor
    {
        private IReadOnlyList<ConfirmationCandidate> _candidates;

        public FakeConfirmationMonitor(params ConfirmationCandidate[] candidates)
        {
            _candidates = candidates;
        }

        public event Action<IReadOnlyList<ConfirmationCandidate>>? CandidatesChanged;

        public event Action<string>? ErrorChanged;

        public IReadOnlyList<ConfirmationCandidate> Candidates => _candidates;

        public string ErrorText { get; private set; } = string.Empty;

        public List<(string ThreadId, string MessageId)> Handled { get; } = [];

        public void Start()
        {
        }

        public Task ScanOnceAsync(
            DateTimeOffset now,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public void MarkHandled(string threadId, string messageId)
        {
            Handled.Add((threadId, messageId));
            _candidates = _candidates
                .Where(candidate =>
                    candidate.ThreadId != threadId || candidate.MessageId != messageId)
                .ToArray();
            CandidatesChanged?.Invoke(_candidates);
        }

        public void Push(params ConfirmationCandidate[] candidates)
        {
            _candidates = candidates;
            CandidatesChanged?.Invoke(_candidates);
        }

        public void PushError(string error)
        {
            ErrorText = error;
            ErrorChanged?.Invoke(error);
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
