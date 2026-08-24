using System.Collections.ObjectModel;
using System.Diagnostics;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Infrastructure;

namespace CodexThreadWorkbench.Presentation;

public sealed class ConfirmationOverlayViewModel : ObservableObject, IAsyncDisposable
{
    public const string ConfirmationMessage = "确认，继续开始做，完成前不要停。";

    private readonly ICodexThreadClient _client;
    private readonly IConfirmationMonitor _monitor;
    private readonly IConfirmationMessageFallback? _messageFallback;
    private readonly IConfirmationThreadReader _threadReader;
    private readonly TimeSpan _verificationTimeout;
    private readonly TimeSpan _verificationPollInterval;
    private readonly Dictionary<string, Task<bool>> _preloadTasks =
        new(StringComparer.Ordinal);
    private readonly SynchronizationContext? _synchronizationContext;
    private bool _isConfirmingAll;
    private string _confirmAllText = "一键全部确认";
    private string _monitorErrorText;
    private bool _disposed;

    public ConfirmationOverlayViewModel(
        ICodexThreadClient client,
        IConfirmationMonitor monitor,
        ConfirmationDetector detector,
        IConfirmationMessageFallback? messageFallback = null,
        TimeSpan? verificationTimeout = null,
        TimeSpan? verificationPollInterval = null,
        IConfirmationThreadReader? threadReader = null)
    {
        _client = client;
        _monitor = monitor;
        _messageFallback = messageFallback;
        _threadReader = threadReader ?? new ClientConfirmationThreadReader(client);
        _verificationTimeout = verificationTimeout ?? TimeSpan.FromSeconds(12);
        _verificationPollInterval = verificationPollInterval ??
                                    TimeSpan.FromMilliseconds(200);
        ArgumentNullException.ThrowIfNull(detector);
        _synchronizationContext = SynchronizationContext.Current;
        _monitorErrorText = monitor.ErrorText;
        ConfirmAllCommand = new AsyncRelayCommand(
            ConfirmAllAsync,
            () => HasItems && !IsConfirmingAll);
        _monitor.CandidatesChanged += OnCandidatesChanged;
        _monitor.ErrorChanged += OnErrorChanged;
        ApplyCandidates(_monitor.Candidates);
    }

    public ObservableCollection<ConfirmationItemViewModel> Items { get; } = [];

    public bool HasItems => Items.Count > 0;

    public bool RequiresAttention => HasItems || HasMonitorError;

    public string CountText => HasItems
        ? $"待确认 · {Items.Count}"
        : HasMonitorError
            ? "扫描异常 · 请检查"
            : "暂无待确认 · 常驻扫描";

    public bool IsConfirmingAll
    {
        get => _isConfirmingAll;
        private set
        {
            if (SetProperty(ref _isConfirmingAll, value))
            {
                ConfirmAllCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public string ConfirmAllText
    {
        get => _confirmAllText;
        private set => SetProperty(ref _confirmAllText, value);
    }

    public string MonitorErrorText
    {
        get => _monitorErrorText;
        private set
        {
            if (SetProperty(ref _monitorErrorText, value))
            {
                OnPropertyChanged(nameof(HasMonitorError));
                OnPropertyChanged(nameof(RequiresAttention));
                OnPropertyChanged(nameof(CountText));
            }
        }
    }

    public bool HasMonitorError => !string.IsNullOrWhiteSpace(MonitorErrorText);

    public AsyncRelayCommand ConfirmAllCommand { get; }

    public async Task ConfirmAsync(ConfirmationItemViewModel item)
    {
        item.IsSending = true;
        item.ErrorText = string.Empty;
        try
        {
            var threadId = item.Candidate.ThreadId;
            try
            {
                if (!await EnsureThreadPreloadedAsync(threadId))
                {
                    await _client.ResumeThreadAsync(threadId);
                    _preloadTasks[threadId] = Task.FromResult(true);
                }

                await _client.StartTurnAsync(
                    threadId,
                    ConfirmationMessage);
            }
            catch (JsonRpcException error) when (
                _messageFallback is not null && IsActiveWriterConflict(error))
            {
                await _messageFallback.SendAsync(threadId, ConfirmationMessage);
            }

            await VerifyDeliveryAsync(item.Candidate);
            _monitor.MarkHandled(
                item.Candidate.ThreadId,
                item.Candidate.MessageId);
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

    public void Ignore(ConfirmationItemViewModel item) =>
        _monitor.MarkHandled(
            item.Candidate.ThreadId,
            item.Candidate.MessageId);

    public async Task ConfirmAllAsync()
    {
        if (IsConfirmingAll)
        {
            return;
        }

        var pending = Items.Where(item => !item.IsSending).ToArray();
        if (pending.Length == 0)
        {
            return;
        }

        IsConfirmingAll = true;
        try
        {
            for (var index = 0; index < pending.Length; index++)
            {
                ConfirmAllText = $"正在确认 {index + 1}/{pending.Length}";
                await ConfirmAsync(pending[index]);
            }
        }
        finally
        {
            ConfirmAllText = "一键全部确认";
            IsConfirmingAll = false;
        }
    }

    public ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _disposed = true;
            _monitor.CandidatesChanged -= OnCandidatesChanged;
            _monitor.ErrorChanged -= OnErrorChanged;
        }

        return ValueTask.CompletedTask;
    }

    private void OnCandidatesChanged(
        IReadOnlyList<ConfirmationCandidate> candidates) =>
        Dispatch(() => ApplyCandidates(candidates));

    private void OnErrorChanged(string error) =>
        Dispatch(() => MonitorErrorText = error);

    private void ApplyCandidates(IReadOnlyList<ConfirmationCandidate> candidates)
    {
        var ordered = candidates
            .OrderByDescending(candidate => candidate.UpdatedAt)
            .ToArray();
        var keys = ordered
            .Select(candidate => (candidate.ThreadId, candidate.MessageId))
            .ToHashSet();
        for (var index = Items.Count - 1; index >= 0; index--)
        {
            var candidate = Items[index].Candidate;
            if (!keys.Contains((candidate.ThreadId, candidate.MessageId)))
            {
                Items.RemoveAt(index);
            }
        }

        for (var targetIndex = 0; targetIndex < ordered.Length; targetIndex++)
        {
            var candidate = ordered[targetIndex];
            _ = EnsureThreadPreloadedAsync(candidate.ThreadId);
            var existing = Items.FirstOrDefault(item =>
                item.Candidate.ThreadId == candidate.ThreadId &&
                item.Candidate.MessageId == candidate.MessageId);
            if (existing is null)
            {
                existing = new ConfirmationItemViewModel(
                    candidate,
                    ConfirmAsync,
                    Ignore);
                Items.Insert(targetIndex, existing);
            }
            else
            {
                existing.UpdateCandidate(candidate);
                var currentIndex = Items.IndexOf(existing);
                if (currentIndex != targetIndex)
                {
                    Items.Move(currentIndex, targetIndex);
                }
            }
        }

        OnPropertyChanged(nameof(HasItems));
        OnPropertyChanged(nameof(RequiresAttention));
        OnPropertyChanged(nameof(CountText));
        ConfirmAllCommand.RaiseCanExecuteChanged();
    }

    private Task<bool> EnsureThreadPreloadedAsync(string threadId)
    {
        if (_preloadTasks.TryGetValue(threadId, out var existing))
        {
            return existing;
        }

        var preload = PreloadThreadAsync(threadId);
        _preloadTasks[threadId] = preload;
        return preload;
    }

    private async Task<bool> PreloadThreadAsync(string threadId)
    {
        try
        {
            await _client.ResumeThreadAsync(threadId);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task VerifyDeliveryAsync(ConfirmationCandidate candidate)
    {
        var startedAt = Stopwatch.GetTimestamp();
        Exception? lastReadError = null;
        while (Stopwatch.GetElapsedTime(startedAt) <= _verificationTimeout)
        {
            try
            {
                var state = await _threadReader.ReadThreadAsync(
                    new Models.ThreadSummary(
                        candidate.ThreadId,
                        candidate.Title,
                        candidate.RequestPreview,
                        string.Empty,
                        candidate.UpdatedAt,
                        Models.ThreadStatusKind.NotLoaded));
                lastReadError = null;
                if (HasConfirmationAfterCandidate(state, candidate.MessageId))
                {
                    return;
                }
            }
            catch (Exception error)
            {
                lastReadError = error;
            }

            var elapsed = Stopwatch.GetElapsedTime(startedAt);
            var remaining = _verificationTimeout - elapsed;
            if (remaining <= TimeSpan.Zero)
            {
                break;
            }

            await Task.Delay(
                remaining < _verificationPollInterval
                    ? remaining
                    : _verificationPollInterval);
        }

        var detail = lastReadError is null
            ? string.Empty
            : $"：{lastReadError.Message}";
        throw new InvalidOperationException(
            $"未确认消息已发送到对应任务{detail}，请重试。");
    }

    private static bool HasConfirmationAfterCandidate(
        Models.ThreadCardState state,
        string candidateMessageId)
    {
        var candidateIndex = -1;
        for (var index = 0; index < state.Messages.Count; index++)
        {
            if (state.Messages[index].Id == candidateMessageId)
            {
                candidateIndex = index;
                break;
            }
        }

        if (candidateIndex < 0)
        {
            return false;
        }

        return state.Messages
            .Skip(candidateIndex + 1)
            .Any(message =>
                message.Role == Models.ChatRole.User &&
                string.Equals(
                    message.Text,
                    ConfirmationMessage,
                    StringComparison.Ordinal));
    }

    private static bool IsActiveWriterConflict(JsonRpcException error) =>
        error.Code == -32600 &&
        error.Message.Contains(
            "active writer",
            StringComparison.OrdinalIgnoreCase);

    private void Dispatch(Action action)
    {
        if (_synchronizationContext is null ||
            SynchronizationContext.Current == _synchronizationContext)
        {
            action();
            return;
        }

        _synchronizationContext.Post(_ => action(), null);
    }
}
