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

    public bool Resumed { get; private set; }

    public (string ThreadId, string Text)? LastStart { get; private set; }

    public (string ThreadId, string TurnId, string Text)? LastSteer { get; private set; }

    public (string ThreadId, string TurnId)? LastInterrupt { get; private set; }

    public (CodexApprovalRequest Request, bool Accept)? LastApproval { get; private set; }

    public Exception? SendException { get; set; }

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

    public Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
        int limit = 100,
        string? searchTerm = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<ThreadSummary>>(
            Threads
                .Where(thread =>
                    string.IsNullOrWhiteSpace(searchTerm) ||
                    thread.Title.Contains(searchTerm, StringComparison.OrdinalIgnoreCase))
                .Take(limit)
                .ToArray());

    public Task<ThreadCardState> ReadThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(ThreadStates[threadId]);

    public Task ResumeThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        Resumed = true;
        return Task.CompletedTask;
    }

    public Task<string> StartTurnAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default)
    {
        if (SendException is not null)
        {
            throw SendException;
        }

        LastStart = (threadId, text);
        return Task.FromResult("new-turn");
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

    public Task InterruptTurnAsync(
        string threadId,
        string turnId,
        CancellationToken cancellationToken = default)
    {
        LastInterrupt = (threadId, turnId);
        return Task.CompletedTask;
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
