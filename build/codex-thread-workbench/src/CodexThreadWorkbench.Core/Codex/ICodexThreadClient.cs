using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Codex;

public interface ICodexThreadClient : IAsyncDisposable
{
    event Action<CodexNotification>? NotificationReceived;

    event Action<CodexApprovalRequest>? ApprovalRequested;

    bool IsConnected { get; }

    Task InitializeAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
        int limit = 100,
        string? searchTerm = null,
        CancellationToken cancellationToken = default);

    Task<ThreadCardState> ReadThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default);

    Task ResumeThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default);

    Task<string> StartTurnAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default);

    Task SteerTurnAsync(
        string threadId,
        string expectedTurnId,
        string text,
        CancellationToken cancellationToken = default);

    Task InterruptTurnAsync(
        string threadId,
        string turnId,
        CancellationToken cancellationToken = default);

    Task RespondToApprovalAsync(
        CodexApprovalRequest request,
        bool accept,
        CancellationToken cancellationToken = default);
}
