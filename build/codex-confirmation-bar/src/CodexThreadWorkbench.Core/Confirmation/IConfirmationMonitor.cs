namespace CodexThreadWorkbench.Confirmation;

public interface IConfirmationMonitor : IAsyncDisposable
{
    event Action<IReadOnlyList<ConfirmationCandidate>>? CandidatesChanged;

    event Action<string>? ErrorChanged;

    IReadOnlyList<ConfirmationCandidate> Candidates { get; }

    string ErrorText { get; }

    void Start();

    Task ScanOnceAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken = default);

    void MarkHandled(string threadId, string messageId);
}
