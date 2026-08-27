using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Confirmation;

public sealed class ConfirmationMonitor : IConfirmationMonitor
{
    private static readonly TimeSpan DefaultThreadReadTimeout =
        TimeSpan.FromSeconds(5);
    private const int DefaultMaximumConcurrentThreadReads = 2;
    private readonly ICodexThreadClient _client;
    private readonly ConfirmationDetector _detector;
    private readonly IConfirmationThreadReader _threadReader;
    private readonly TimeSpan _threadReadTimeout;
    private readonly int _maxConcurrentThreadReads;
    private readonly CancellationTokenSource _cancellation = new();
    private readonly object _lifetimeGate = new();
    private readonly Dictionary<string, ThreadRevision> _lastEvaluated =
        new(StringComparer.Ordinal);
    private readonly Dictionary<string, ConfirmationCandidate> _candidatesByThread =
        new(StringComparer.Ordinal);
    private readonly HashSet<(string ThreadId, string MessageId)> _handled = [];
    private IReadOnlyList<ConfirmationCandidate> _candidates = [];
    private string _errorText = string.Empty;
    private Task? _runTask;
    private Task? _disposeTask;

    public ConfirmationMonitor(
        ICodexThreadClient client,
        ConfirmationDetector detector,
        TimeSpan? threadReadTimeout = null,
        int maxConcurrentThreadReads = DefaultMaximumConcurrentThreadReads,
        IConfirmationThreadReader? threadReader = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxConcurrentThreadReads);
        _client = client;
        _detector = detector;
        _threadReader = threadReader ?? new ClientConfirmationThreadReader(client);
        _threadReadTimeout = threadReadTimeout ?? DefaultThreadReadTimeout;
        _maxConcurrentThreadReads = maxConcurrentThreadReads;
    }

    public event Action<IReadOnlyList<ConfirmationCandidate>>? CandidatesChanged;

    public event Action<string>? ErrorChanged;

    public IReadOnlyList<ConfirmationCandidate> Candidates => _candidates;

    public string ErrorText => _errorText;

    public void Start()
    {
        lock (_lifetimeGate)
        {
            ObjectDisposedException.ThrowIf(_disposeTask is not null, this);
            _runTask ??= RunAsync(_cancellation.Token);
        }
    }

    public async Task ScanOnceAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<ThreadSummary> summaries;
        try
        {
            summaries = await _client.ListThreadsAsync(
                limit: int.MaxValue,
                cancellationToken: cancellationToken);
            SetError(string.Empty);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            SetError(error.Message);
            return;
        }

        var summariesToRead = new List<ThreadSummary>();
        foreach (var summary in summaries)
        {
            var revision = new ThreadRevision(summary.UpdatedAt, summary.Status);
            if (_lastEvaluated.GetValueOrDefault(summary.Id) == revision)
            {
                continue;
            }

            if (summary.Status is (
                    ThreadStatusKind.NeedsApproval or
                    ThreadStatusKind.Error or
                    ThreadStatusKind.Offline))
            {
                _lastEvaluated[summary.Id] = revision;
                _candidatesByThread.Remove(summary.Id);
                continue;
            }

            summariesToRead.Add(summary);
        }

        PublishCandidatesIfChanged();
        using var readLimiter = new SemaphoreSlim(_maxConcurrentThreadReads);
        var pendingReads = summariesToRead
            .Select(summary => ReadThreadForScanAsync(
                summary,
                readLimiter,
                cancellationToken))
            .ToList();

        while (pendingReads.Count > 0)
        {
            var completedRead = await Task.WhenAny(pendingReads);
            pendingReads.Remove(completedRead);
            var result = await completedRead;
            if (result.State is null)
            {
                continue;
            }

            _lastEvaluated[result.Summary.Id] = new ThreadRevision(
                result.Summary.UpdatedAt,
                result.Summary.Status);
            var candidate = _detector.Detect(result.State);
            if (candidate is null ||
                _handled.Contains((candidate.ThreadId, candidate.MessageId)))
            {
                _candidatesByThread.Remove(result.Summary.Id);
            }
            else
            {
                _candidatesByThread[result.Summary.Id] = candidate;
            }

            PublishCandidatesIfChanged();
        }

        PublishCandidatesIfChanged();
    }

    private async Task<ThreadReadResult> ReadThreadForScanAsync(
        ThreadSummary summary,
        SemaphoreSlim readLimiter,
        CancellationToken cancellationToken)
    {
        await readLimiter.WaitAsync(cancellationToken);
        try
        {
            using var readCancellation =
                CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            readCancellation.CancelAfter(_threadReadTimeout);
            var state = await _threadReader.ReadThreadAsync(
                summary,
                readCancellation.Token);
            return new ThreadReadResult(summary, state);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            return new ThreadReadResult(summary, null);
        }
        finally
        {
            readLimiter.Release();
        }
    }

    public void MarkHandled(string threadId, string messageId)
    {
        _handled.Add((threadId, messageId));
        if (_candidatesByThread.TryGetValue(threadId, out var candidate) &&
            candidate.MessageId == messageId)
        {
            _candidatesByThread.Remove(threadId);
            PublishCandidatesIfChanged();
        }
    }

    public ValueTask DisposeAsync()
    {
        lock (_lifetimeGate)
        {
            _disposeTask ??= DisposeCoreAsync();
            return new ValueTask(_disposeTask);
        }
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            await ScanOnceAsync(DateTimeOffset.UtcNow, cancellationToken);
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                await ScanOnceAsync(DateTimeOffset.UtcNow, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private async Task DisposeCoreAsync()
    {
        _cancellation.Cancel();
        try
        {
            if (_runTask is not null)
            {
                await _runTask;
            }
        }
        finally
        {
            _cancellation.Dispose();
        }
    }

    private void PublishCandidatesIfChanged()
    {
        var next = _candidatesByThread.Values
            .OrderByDescending(candidate => candidate.UpdatedAt)
            .ToArray();
        if (_candidates.SequenceEqual(next))
        {
            return;
        }

        _candidates = next;
        CandidatesChanged?.Invoke(_candidates);
    }

    private void SetError(string value)
    {
        if (string.Equals(_errorText, value, StringComparison.Ordinal))
        {
            return;
        }

        _errorText = value;
        ErrorChanged?.Invoke(_errorText);
    }

    private sealed record ThreadReadResult(
        ThreadSummary Summary,
        ThreadCardState? State);

    private readonly record struct ThreadRevision(
        DateTimeOffset UpdatedAt,
        ThreadStatusKind Status);
}
