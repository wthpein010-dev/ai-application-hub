using System.Collections.ObjectModel;
using System.Diagnostics;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Persistence;

namespace CodexThreadWorkbench.Presentation;

public sealed class ConfirmationOverlayViewModel : ObservableObject, IAsyncDisposable
{
    public const string ConfirmationMessage = "确认，继续开始做，完成前不要停。";

    private readonly ICodexThreadClient _client;
    private readonly IConfirmationMonitor _monitor;
    private readonly ConfirmationDetector _detector;
    private readonly IConfirmationMessageFallback? _messageFallback;
    private readonly IConfirmationAutomationSettingsStore? _automationSettingsStore;
    private readonly CancellationTokenSource _autoConfirmLifetime = new();
    private readonly object _autoConfirmTaskGate = new();
    private readonly object _disposeGate = new();
    private readonly SemaphoreSlim _desktopDeliveryGate = new(1, 1);
    private readonly IConfirmationThreadReader _threadReader;
    private readonly TimeSpan _verificationTimeout;
    private readonly TimeSpan _verificationPollInterval;
    private readonly Dictionary<string, Task<bool>> _preloadTasks =
        new(StringComparer.Ordinal);
    private readonly HashSet<(string ThreadId, string MessageId)> _autoAttempts = [];
    private readonly SynchronizationContext? _synchronizationContext;
    private bool _isInteractionArmed = true;
    private bool _isAutoConfirmEnabled;
    private bool _isAutoConfirmSaving;
    private bool _isConfirmingAll;
    private string _confirmAllText = "一键全部确认";
    private string _autoConfirmErrorText = string.Empty;
    private string _monitorErrorText;
    private Task _autoConfirmTask = Task.CompletedTask;
    private Task? _disposeTask;
    private bool _disposed;

    public ConfirmationOverlayViewModel(
        ICodexThreadClient client,
        IConfirmationMonitor monitor,
        ConfirmationDetector detector,
        IConfirmationMessageFallback? messageFallback = null,
        TimeSpan? verificationTimeout = null,
        TimeSpan? verificationPollInterval = null,
        IConfirmationThreadReader? threadReader = null,
        IConfirmationAutomationSettingsStore? automationSettingsStore = null)
    {
        ArgumentNullException.ThrowIfNull(detector);
        _client = client;
        _monitor = monitor;
        _detector = detector;
        _messageFallback = messageFallback;
        _automationSettingsStore = automationSettingsStore;
        _threadReader = threadReader ?? new ClientConfirmationThreadReader(client);
        _verificationTimeout = verificationTimeout ?? TimeSpan.FromSeconds(12);
        _verificationPollInterval = verificationPollInterval ??
                                    TimeSpan.FromMilliseconds(200);
        _synchronizationContext = SynchronizationContext.Current;
        _monitorErrorText = monitor.ErrorText;
        ConfirmAllCommand = new AsyncRelayCommand(
            ConfirmAllAsync,
            () => IsInteractionArmed && HasItems && !IsConfirmingAll);
        ToggleAutoConfirmCommand = new AsyncRelayCommand(
            () => SetAutoConfirmEnabledAsync(!IsAutoConfirmEnabled),
            () => CanToggleAutoConfirm);
        _monitor.CandidatesChanged += OnCandidatesChanged;
        _monitor.ErrorChanged += OnErrorChanged;
        ApplyCandidates(_monitor.Candidates);
    }

    public ObservableCollection<ConfirmationItemViewModel> Items { get; } = [];

    public event Action<string>? ActionAttempted;

    public bool HasItems => Items.Count > 0;

    public bool RequiresAttention =>
        HasItems || HasMonitorError || HasAutoConfirmError;

    public string BadgeText => Items.Count switch
    {
        0 => string.Empty,
        > 99 => "99+",
        _ => Items.Count.ToString(System.Globalization.CultureInfo.InvariantCulture)
    };

    public bool IsInteractionArmed => _isInteractionArmed;

    public bool IsAutoConfirmEnabled => _isAutoConfirmEnabled;

    public bool CanToggleAutoConfirm => IsInteractionArmed && !IsAutoConfirmSaving;

    public string AutoConfirmText => IsAutoConfirmEnabled
        ? "自动确认已开启"
        : "自动确认已关闭";

    public string AutoConfirmErrorText
    {
        get => _autoConfirmErrorText;
        private set
        {
            if (SetProperty(ref _autoConfirmErrorText, value))
            {
                OnPropertyChanged(nameof(HasAutoConfirmError));
                OnPropertyChanged(nameof(RequiresAttention));
                OnPropertyChanged(nameof(CountText));
            }
        }
    }

    public bool HasAutoConfirmError =>
        !string.IsNullOrWhiteSpace(AutoConfirmErrorText);

    public bool IsAutoConfirmSaving
    {
        get => _isAutoConfirmSaving;
        private set
        {
            if (SetProperty(ref _isAutoConfirmSaving, value))
            {
                OnPropertyChanged(nameof(CanToggleAutoConfirm));
                ToggleAutoConfirmCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public bool CanConfirmAll => IsInteractionArmed && HasItems && !IsConfirmingAll;

    public string CountText => HasItems
        ? $"待确认 · {Items.Count}"
        : HasMonitorError
            ? "扫描异常 · 请检查"
            : HasAutoConfirmError
                ? "自动确认设置异常 · 请检查"
                : "暂无待确认 · 常驻扫描";

    public bool IsConfirmingAll
    {
        get => _isConfirmingAll;
        private set
        {
            if (SetProperty(ref _isConfirmingAll, value))
            {
                ConfirmAllCommand.RaiseCanExecuteChanged();
                OnPropertyChanged(nameof(CanConfirmAll));
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

    public AsyncRelayCommand ToggleAutoConfirmCommand { get; }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_automationSettingsStore is null)
        {
            return;
        }

        try
        {
            ApplyAutoConfirmEnabled(
                await _automationSettingsStore.LoadEnabledAsync(cancellationToken));
        }
        catch (Exception error)
        {
            AutoConfirmErrorText = $"自动确认设置读取失败：{error.Message}";
            ApplyAutoConfirmEnabled(false);
        }
    }

    public async Task SetAutoConfirmEnabledAsync(
        bool value,
        CancellationToken cancellationToken = default)
    {
        if (IsAutoConfirmEnabled == value || IsAutoConfirmSaving)
        {
            return;
        }

        IsAutoConfirmSaving = true;
        AutoConfirmErrorText = string.Empty;
        if (!value)
        {
            ApplyAutoConfirmEnabled(false);
        }

        try
        {
            if (_automationSettingsStore is not null)
            {
                await _automationSettingsStore.SaveEnabledAsync(
                    value,
                    cancellationToken);
            }

            if (value)
            {
                ApplyAutoConfirmEnabled(true);
            }
        }
        catch (Exception error)
        {
            AutoConfirmErrorText = $"自动确认设置保存失败：{error.Message}";
            if (value)
            {
                ApplyAutoConfirmEnabled(false);
            }

            OnPropertyChanged(nameof(IsAutoConfirmEnabled));
            OnPropertyChanged(nameof(AutoConfirmText));
        }
        finally
        {
            IsAutoConfirmSaving = false;
        }
    }

    public void SetInteractionArmed(bool value)
    {
        if (!SetProperty(ref _isInteractionArmed, value))
        {
            return;
        }

        foreach (var item in Items)
        {
            item.SetInteractionArmed(value);
        }

        ConfirmAllCommand.RaiseCanExecuteChanged();
        OnPropertyChanged(nameof(CanConfirmAll));
        OnPropertyChanged(nameof(CanToggleAutoConfirm));
        ToggleAutoConfirmCommand.RaiseCanExecuteChanged();
    }

    public Task ConfirmAsync(ConfirmationItemViewModel item)
    {
        if (!IsInteractionArmed)
        {
            ActionAttempted?.Invoke($"confirm-blocked:{item.Candidate.ThreadId}");
            return Task.CompletedTask;
        }

        return ConfirmCoreAsync(item, "confirm-start", CancellationToken.None);
    }

    private async Task ConfirmCoreAsync(
        ConfirmationItemViewModel item,
        string actionName,
        CancellationToken cancellationToken)
    {
        ActionAttempted?.Invoke($"{actionName}:{item.Candidate.ThreadId}");

        item.IsSending = true;
        item.ErrorText = string.Empty;
        try
        {
            if (!await IsCurrentCandidateAsync(item.Candidate, cancellationToken)
                    .ConfigureAwait(false))
            {
                _monitor.MarkHandled(
                    item.Candidate.ThreadId,
                    item.Candidate.MessageId);
                return;
            }

            var threadId = item.Candidate.ThreadId;
            if (_messageFallback is not null)
            {
                if (!await SendThroughDesktopAsync(
                        item.Candidate,
                        cancellationToken).ConfigureAwait(false))
                {
                    _monitor.MarkHandled(
                        item.Candidate.ThreadId,
                        item.Candidate.MessageId);
                    return;
                }
            }
            else
            {
                if (!await EnsureThreadPreloadedAsync(threadId)
                        .WaitAsync(cancellationToken).ConfigureAwait(false))
                {
                    await _client.ResumeThreadAsync(threadId, cancellationToken)
                        .ConfigureAwait(false);
                    _preloadTasks[threadId] = Task.FromResult(true);
                }

                if (!await IsCurrentCandidateAsync(
                        item.Candidate,
                        cancellationToken).ConfigureAwait(false))
                {
                    _monitor.MarkHandled(
                        item.Candidate.ThreadId,
                        item.Candidate.MessageId);
                    return;
                }

                await _client.StartTurnAsync(
                    threadId,
                    ConfirmationMessage,
                    cancellationToken).ConfigureAwait(false);
            }

            await VerifyDeliveryAsync(item.Candidate, cancellationToken)
                .ConfigureAwait(false);
            _monitor.MarkHandled(
                item.Candidate.ThreadId,
                item.Candidate.MessageId);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            Dispatch(() => item.ErrorText = error.Message);
        }
        finally
        {
            Dispatch(() => item.IsSending = false);
        }
    }

    public void Ignore(ConfirmationItemViewModel item)
    {
        if (!IsInteractionArmed)
        {
            ActionAttempted?.Invoke($"ignore-blocked:{item.Candidate.ThreadId}");
            return;
        }

        ActionAttempted?.Invoke($"ignore-start:{item.Candidate.ThreadId}");
        _monitor.MarkHandled(
            item.Candidate.ThreadId,
            item.Candidate.MessageId);
    }

    public async Task ConfirmAllAsync()
    {
        if (!IsInteractionArmed || IsConfirmingAll)
        {
            ActionAttempted?.Invoke("confirm-all-blocked");
            return;
        }

        var pending = Items.Where(item => !item.IsSending).ToArray();
        if (pending.Length == 0)
        {
            return;
        }

        ActionAttempted?.Invoke($"confirm-all-start:{pending.Length}");
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
        lock (_disposeGate)
        {
            _disposeTask ??= DisposeCoreAsync();
            return new ValueTask(_disposeTask);
        }
    }

    private async Task DisposeCoreAsync()
    {
        Task autoConfirmTask;
        lock (_autoConfirmTaskGate)
        {
            _disposed = true;
            _autoConfirmLifetime.Cancel();
            autoConfirmTask = _autoConfirmTask;
        }

        _monitor.CandidatesChanged -= OnCandidatesChanged;
        _monitor.ErrorChanged -= OnErrorChanged;
        try
        {
            await autoConfirmTask.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }

        _autoConfirmLifetime.Dispose();
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
            if (_messageFallback is null)
            {
                _ = EnsureThreadPreloadedAsync(candidate.ThreadId);
            }

            var existing = Items.FirstOrDefault(item =>
                item.Candidate.ThreadId == candidate.ThreadId &&
                item.Candidate.MessageId == candidate.MessageId);
            if (existing is null)
            {
                existing = new ConfirmationItemViewModel(
                    candidate,
                    ConfirmAsync,
                    Ignore);
                existing.SetInteractionArmed(IsInteractionArmed);
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
        OnPropertyChanged(nameof(BadgeText));
        OnPropertyChanged(nameof(CanConfirmAll));
        ConfirmAllCommand.RaiseCanExecuteChanged();
        QueueAutoConfirm();
    }

    private void ApplyAutoConfirmEnabled(bool value)
    {
        if (!SetProperty(ref _isAutoConfirmEnabled, value,
                nameof(IsAutoConfirmEnabled)))
        {
            return;
        }

        OnPropertyChanged(nameof(AutoConfirmText));
        QueueAutoConfirm();
    }

    private void QueueAutoConfirm()
    {
        lock (_autoConfirmTaskGate)
        {
            if (!IsAutoConfirmEnabled ||
                _disposed ||
                !_autoConfirmTask.IsCompleted)
            {
                return;
            }

            _autoConfirmTask = ProcessAutoConfirmQueueAsync(
                _autoConfirmLifetime.Token);
            _ = ObserveAutoConfirmTaskAsync(_autoConfirmTask);
        }
    }

    private async Task ObserveAutoConfirmTaskAsync(Task task)
    {
        try
        {
            await task.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            lock (_autoConfirmTaskGate)
            {
                if (ReferenceEquals(_autoConfirmTask, task))
                {
                    _autoConfirmTask = Task.CompletedTask;
                }
            }

            if (!_disposed)
            {
                Dispatch(() =>
                {
                    if (HasPendingAutoConfirmCandidate())
                    {
                        QueueAutoConfirm();
                    }
                });
            }
        }
    }

    private bool HasPendingAutoConfirmCandidate() =>
        Items.Any(candidate =>
            !candidate.IsSending &&
            !_autoAttempts.Contains((
                candidate.Candidate.ThreadId,
                candidate.Candidate.MessageId)));

    private async Task ProcessAutoConfirmQueueAsync(
        CancellationToken cancellationToken)
    {
        var pending = Items
            .Where(candidate =>
                !candidate.IsSending &&
                !_autoAttempts.Contains((
                    candidate.Candidate.ThreadId,
                    candidate.Candidate.MessageId)))
            .ToArray();
        foreach (var item in pending)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!IsAutoConfirmEnabled || _disposed)
            {
                return;
            }

            _autoAttempts.Add((
                item.Candidate.ThreadId,
                item.Candidate.MessageId));
            await ConfirmCoreAsync(
                    item,
                    "auto-confirm-start",
                    cancellationToken)
                .ConfigureAwait(false);
        }
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

    private async Task VerifyDeliveryAsync(
        ConfirmationCandidate candidate,
        CancellationToken cancellationToken)
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
                        Models.ThreadStatusKind.NotLoaded),
                    cancellationToken).ConfigureAwait(false);
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
                    : _verificationPollInterval,
                cancellationToken).ConfigureAwait(false);
        }

        var detail = lastReadError is null
            ? string.Empty
            : $"：{lastReadError.Message}";
        throw new InvalidOperationException(
            $"未确认消息已发送到对应任务{detail}，请重试。");
    }

    private async Task<bool> IsCurrentCandidateAsync(
        ConfirmationCandidate candidate,
        CancellationToken cancellationToken = default)
    {
        var state = await _threadReader.ReadThreadAsync(
            new Models.ThreadSummary(
                candidate.ThreadId,
                candidate.Title,
                candidate.RequestPreview,
                string.Empty,
                candidate.UpdatedAt,
                Models.ThreadStatusKind.NotLoaded),
            cancellationToken).ConfigureAwait(false);
        var current = _detector.Detect(state);
        return current is not null &&
               string.Equals(
                   current.ThreadId,
                   candidate.ThreadId,
                   StringComparison.Ordinal) &&
               string.Equals(
                   current.MessageId,
                   candidate.MessageId,
                   StringComparison.Ordinal);
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

    private async Task<bool> SendThroughDesktopAsync(
        ConfirmationCandidate candidate,
        CancellationToken cancellationToken)
    {
        await _desktopDeliveryGate.WaitAsync(cancellationToken)
            .ConfigureAwait(false);
        try
        {
            if (!await IsCurrentCandidateAsync(candidate, cancellationToken)
                    .ConfigureAwait(false))
            {
                return false;
            }

            return await _messageFallback!.SendIfCurrentAsync(
                candidate.ThreadId,
                ConfirmationMessage,
                token => IsCurrentCandidateAsync(candidate, token),
                cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _desktopDeliveryGate.Release();
        }
    }

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
