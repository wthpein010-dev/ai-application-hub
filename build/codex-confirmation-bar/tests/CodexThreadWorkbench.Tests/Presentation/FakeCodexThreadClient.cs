using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Tests.Presentation;

internal sealed class FakeCodexThreadClient : ICodexThreadClient
{
    public event Action<CodexNotification>? NotificationReceived;

    public event Action<CodexApprovalRequest>? ApprovalRequested;

    public bool IsConnected { get; set; } = true;

    public List<ThreadSummary> Threads { get; } = [];

    public Dictionary<string, ThreadCardState> ThreadStates { get; } = [];

    public int ListCalls { get; private set; }

    public Dictionary<string, int> ReadCalls { get; } = [];

    public Exception? ListException { get; set; }

    public Dictionary<string, Exception> ReadExceptions { get; } = [];

    public HashSet<string> DelayedReadThreadIds { get; } =
        new(StringComparer.Ordinal);

    public TaskCompletionSource<string> ReadStarted { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public TaskCompletionSource ReadCompletion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public int ActiveReadCount;

    public int MaxConcurrentReadCount;

    public Dictionary<string, Exception> ResumeExceptions { get; } = [];

    public Dictionary<string, Exception> StartExceptions { get; } = [];

    public List<string> OperationLog { get; } = [];

    public HashSet<string> DelayedStartThreadIds { get; } =
        new(StringComparer.Ordinal);

    public TaskCompletionSource<(string ThreadId, string Text)> StartStarted { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public TaskCompletionSource StartCompletion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public bool DelayList { get; set; }

    public TaskCompletionSource ListStarted { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public TaskCompletionSource ListCompletion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public bool Resumed { get; private set; }

    public (string ThreadId, string Text)? LastStart { get; private set; }

    public bool AppendUserMessageOnStart { get; set; }

    public (string ThreadId, string TurnId, string Text)? LastSteer { get; private set; }

    public (string ThreadId, string TurnId)? LastInterrupt { get; private set; }

    public (CodexApprovalRequest Request, bool Accept)? LastApproval { get; private set; }

    public Exception? SendException { get; set; }

    public Exception? InterruptException { get; set; }

    public bool DelayInterrupt { get; set; }

    public TaskCompletionSource InterruptStarted { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public TaskCompletionSource InterruptCompletion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public int DisposeCalls { get; private set; }

    public bool DelayDispose { get; set; }

    public TaskCompletionSource DisposeStarted { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public TaskCompletionSource DisposeCompletion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        IsConnected = true;
        return Task.CompletedTask;
    }

    public async Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
        int limit = 100,
        string? searchTerm = null,
        CancellationToken cancellationToken = default)
    {
        ListCalls++;
        ListStarted.TrySetResult();
        if (DelayList)
        {
            await ListCompletion.Task.WaitAsync(cancellationToken);
        }

        if (ListException is not null)
        {
            throw ListException;
        }

        return Threads
            .Where(thread =>
                string.IsNullOrWhiteSpace(searchTerm) ||
                thread.Title.Contains(searchTerm, StringComparison.OrdinalIgnoreCase))
            .Take(limit)
            .ToArray();
    }

    public async Task<ThreadCardState> ReadThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        ReadCalls[threadId] = ReadCalls.GetValueOrDefault(threadId) + 1;
        var activeReads = Interlocked.Increment(ref ActiveReadCount);
        UpdateMaximum(ref MaxConcurrentReadCount, activeReads);
        try
        {
            if (DelayedReadThreadIds.Contains(threadId))
            {
                ReadStarted.TrySetResult(threadId);
                await ReadCompletion.Task.WaitAsync(cancellationToken);
            }

            if (ReadExceptions.TryGetValue(threadId, out var error))
            {
                throw error;
            }

            return ThreadStates[threadId];
        }
        finally
        {
            Interlocked.Decrement(ref ActiveReadCount);
        }
    }

    private static void UpdateMaximum(ref int target, int value)
    {
        var current = Volatile.Read(ref target);
        while (value > current)
        {
            var observed = Interlocked.CompareExchange(ref target, value, current);
            if (observed == current)
            {
                return;
            }

            current = observed;
        }
    }

    public Task ResumeThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        OperationLog.Add($"resume:{threadId}");
        if (ResumeExceptions.TryGetValue(threadId, out var error))
        {
            throw error;
        }

        Resumed = true;
        return Task.CompletedTask;
    }

    public async Task<string> StartTurnAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default)
    {
        OperationLog.Add($"start:{threadId}");
        StartStarted.TrySetResult((threadId, text));
        if (DelayedStartThreadIds.Contains(threadId))
        {
            await StartCompletion.Task.WaitAsync(cancellationToken);
        }

        if (StartExceptions.TryGetValue(threadId, out var startError))
        {
            throw startError;
        }

        if (SendException is not null)
        {
            throw SendException;
        }

        LastStart = (threadId, text);
        if (AppendUserMessageOnStart &&
            ThreadStates.TryGetValue(threadId, out var state))
        {
            ThreadStates[threadId] = state with
            {
                Messages = state.Messages
                    .Append(new ChatMessage(
                        $"confirmed-user-{state.Messages.Count}",
                        ChatRole.User,
                        text))
                    .ToArray(),
                Status = ThreadStatusKind.Running,
                ActiveTurnId = "new-turn"
            };
        }

        return "new-turn";
    }

    public Task SteerTurnAsync(
        string threadId,
        string expectedTurnId,
        string text,
        CancellationToken cancellationToken = default)
    {
        if (SendException is not null)
        {
            throw SendException;
        }

        LastSteer = (threadId, expectedTurnId, text);
        return Task.CompletedTask;
    }

    public async Task InterruptTurnAsync(
        string threadId,
        string turnId,
        CancellationToken cancellationToken = default)
    {
        LastInterrupt = (threadId, turnId);
        InterruptStarted.TrySetResult();
        if (DelayInterrupt)
        {
            await InterruptCompletion.Task.WaitAsync(cancellationToken);
        }

        if (InterruptException is not null)
        {
            throw InterruptException;
        }
    }

    public Task RespondToApprovalAsync(
        CodexApprovalRequest request,
        bool accept,
        CancellationToken cancellationToken = default)
    {
        LastApproval = (request, accept);
        return Task.CompletedTask;
    }

    public void Raise(CodexNotification notification) =>
        NotificationReceived?.Invoke(notification);

    public void Raise(CodexApprovalRequest request) =>
        ApprovalRequested?.Invoke(request);

    public ValueTask DisposeAsync()
    {
        DisposeCalls++;
        DisposeStarted.TrySetResult();
        return DelayDispose
            ? new ValueTask(DisposeCompletion.Task)
            : ValueTask.CompletedTask;
    }
}
