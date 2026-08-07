using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CodexQuotaBar.Core.Platform;
using CodexQuotaBar.Core.Pets;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Quota;
using CodexQuotaBar.Core.Settings;
using CodexQuotaBar.Core.Tasks;

namespace CodexQuotaBar.Core.ViewModels;

public sealed partial class MainWindowViewModel : ObservableObject, IDisposable
{
    private readonly IQuotaSource _quotaSource;
    private readonly IPetProvider? _petProvider;
    private readonly ITaskCompletionSource? _taskCompletionSource;
    private readonly JsonSettingsStore _settingsStore;
    private readonly IPlatformServices _platformServices;
    private readonly TimeProvider _timeProvider;
    private readonly Action _requestQuit;
    private readonly Action<Action> _dispatch;
    private readonly Action<string>? _diagnostic;
    private AppSettings _settings = AppSettings.Default;
    private readonly Queue<CodexTaskCompletion> _taskCompletionQueue = [];
    private CancellationTokenSource? _taskNotificationDismissal;
    private bool _initialized;
    private int _disposed;

    public MainWindowViewModel(
        IQuotaSource quotaSource,
        IPetProvider? petProvider,
        ITaskCompletionSource? taskCompletionSource,
        JsonSettingsStore settingsStore,
        IPlatformServices platformServices,
        TimeProvider? timeProvider,
        Action requestQuit,
        Action<Action>? dispatch = null,
        Action<string>? diagnostic = null)
    {
        _quotaSource = quotaSource ?? throw new ArgumentNullException(nameof(quotaSource));
        _petProvider = petProvider;
        _taskCompletionSource = taskCompletionSource;
        _settingsStore = settingsStore ?? throw new ArgumentNullException(nameof(settingsStore));
        _platformServices = platformServices ?? throw new ArgumentNullException(nameof(platformServices));
        _timeProvider = timeProvider ?? TimeProvider.System;
        _requestQuit = requestQuit ?? throw new ArgumentNullException(nameof(requestQuit));
        _dispatch = dispatch ?? (action => action());
        _diagnostic = diagnostic;
    }

    public MainWindowViewModel(
        IQuotaSource quotaSource,
        IPetProvider? petProvider,
        JsonSettingsStore settingsStore,
        IPlatformServices platformServices,
        TimeProvider? timeProvider,
        Action requestQuit,
        Action<Action>? dispatch = null,
        Action<string>? diagnostic = null)
        : this(
            quotaSource,
            petProvider,
            null,
            settingsStore,
            platformServices,
            timeProvider,
            requestQuit,
            dispatch,
            diagnostic)
    {
    }

    public ObservableCollection<QuotaBucketViewModel> Buckets { get; } = [];

    public QuotaBucketViewModel? PrimaryBucket => Buckets.FirstOrDefault();

    public IReadOnlyList<QuotaBucketViewModel> AdditionalBuckets => Buckets.Skip(1).ToArray();

    [ObservableProperty]
    private bool _isCollapsed;

    [ObservableProperty]
    private bool _isVisible = true;

    [ObservableProperty]
    private bool _alwaysOnTop = true;

    [ObservableProperty]
    private bool _launchAtLogin = true;

    [ObservableProperty]
    private bool _isOffline = true;

    [ObservableProperty]
    private string _connectionLabel = "正在连接";

    [ObservableProperty]
    private string _resetCreditsText = "";

    [ObservableProperty]
    private string _lastUpdatedText = "等待首次更新";

    [ObservableProperty]
    private bool _petAvailable;

    [ObservableProperty]
    private bool _petEnabled;

    [ObservableProperty]
    private PetAsset? _selectedPet;

    [ObservableProperty]
    private PetAnimationState _petAnimation = PetAnimationState.Waiting;

    [ObservableProperty]
    private CodexTaskCompletion? _currentTaskCompletion;

    [ObservableProperty]
    private bool _taskNotificationsEnabled = true;

    [ObservableProperty]
    private bool _isInitializationReady;

    public bool IsTaskNotificationVisible => CurrentTaskCompletion is not null;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_initialized)
        {
            return;
        }

        _initialized = true;
        var settings = await _settingsStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        await _platformServices.SetLaunchAtLoginAsync(settings.LaunchAtLogin, cancellationToken).ConfigureAwait(false);
        var launchAtLogin = await _platformServices.GetLaunchAtLoginAsync(cancellationToken).ConfigureAwait(false);
        var selectedPet = await FindPetAsync(cancellationToken).ConfigureAwait(false);

        _dispatch(() =>
        {
            _settings = settings;
            IsCollapsed = settings.IsCollapsed;
            AlwaysOnTop = settings.AlwaysOnTop;
            LaunchAtLogin = launchAtLogin;
            SelectedPet = selectedPet;
            PetAvailable = selectedPet is not null;
            PetEnabled = PetAvailable && settings.PetEnabled;
            TaskNotificationsEnabled = settings.TaskNotificationsEnabled;
            _quotaSource.SnapshotUpdated += OnSnapshotUpdated;
            _quotaSource.ConnectionStateChanged += OnConnectionStateChanged;
            if (_taskCompletionSource is not null)
            {
                _taskCompletionSource.TaskCompleted += OnTaskCompleted;
            }
            if (_quotaSource.LastSnapshot is { } snapshot)
            {
                ApplySnapshot(snapshot);
            }

            UpdateConnectionState();
            IsInitializationReady = true;
        });
        await Task.WhenAll(
            _quotaSource.StartAsync(cancellationToken),
            StartTaskCompletionSourceAsync(cancellationToken)).ConfigureAwait(false);
    }

    [RelayCommand]
    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        await _quotaSource.RefreshAsync(cancellationToken).ConfigureAwait(false);
        _dispatch(() => PetAnimation = PetAnimationState.Review);
        _ = RestoreDerivedPetAnimationAsync();
    }

    private async Task RestoreDerivedPetAnimationAsync()
    {
        await Task.Delay(TimeSpan.FromMilliseconds(900), _timeProvider).ConfigureAwait(false);
        _dispatch(UpdatePetAnimation);
    }

    [RelayCommand]
    public async Task TogglePetAsync(CancellationToken cancellationToken = default)
    {
        if (PetEnabled)
        {
            PetEnabled = false;
            _settings = _settings with { PetEnabled = false };
            await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
            return;
        }

        var selectedPet = await FindPetAsync(cancellationToken).ConfigureAwait(false);
        SelectedPet = selectedPet;
        PetAvailable = selectedPet is not null;
        PetEnabled = selectedPet is not null;
        _settings = _settings with { PetEnabled = PetEnabled };
        await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    [RelayCommand]
    public async Task ToggleTaskNotificationsAsync(CancellationToken cancellationToken = default)
    {
        AppSettings settings = AppSettings.Default;
        _dispatch(() =>
        {
            TaskNotificationsEnabled = !TaskNotificationsEnabled;
            _settings = _settings with { TaskNotificationsEnabled = TaskNotificationsEnabled };
            settings = _settings;
            if (!TaskNotificationsEnabled)
            {
                ClearTaskNotifications();
            }
        });
        await _settingsStore.SaveAsync(settings, cancellationToken).ConfigureAwait(false);
    }

    [RelayCommand]
    public Task DismissTaskNotificationAsync()
    {
        _dispatch(DismissTaskNotification);
        return Task.CompletedTask;
    }

    [RelayCommand]
    public async Task ToggleCollapsedAsync(CancellationToken cancellationToken = default)
    {
        IsCollapsed = !IsCollapsed;
        _settings = _settings with { IsCollapsed = IsCollapsed };
        await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    [RelayCommand]
    public async Task ToggleAlwaysOnTopAsync(CancellationToken cancellationToken = default)
    {
        AlwaysOnTop = !AlwaysOnTop;
        _settings = _settings with { AlwaysOnTop = AlwaysOnTop };
        await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    [RelayCommand]
    public async Task ToggleLaunchAtLoginAsync(CancellationToken cancellationToken = default)
    {
        LaunchAtLogin = !LaunchAtLogin;
        await _platformServices.SetLaunchAtLoginAsync(LaunchAtLogin, cancellationToken).ConfigureAwait(false);
        _settings = _settings with { LaunchAtLogin = LaunchAtLogin };
        await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    [RelayCommand]
    public void Hide() => IsVisible = false;

    [RelayCommand]
    public void Show() => IsVisible = true;

    [RelayCommand]
    public void RequestQuit() => _requestQuit();

    public void RefreshCountdowns()
    {
        var now = _timeProvider.GetUtcNow();
        foreach (var bucket in Buckets)
        {
            bucket.RefreshCountdown(now);
        }
    }

    public async Task SavePlacementAsync(
        WindowPlacement placement,
        CancellationToken cancellationToken = default)
    {
        _settings = _settings with { Placement = placement };
        await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    public WindowPlacement? GetSavedPlacement() => _settings.Placement;

    public async Task SetCodexExecutableOverrideAsync(
        string? executablePath,
        CancellationToken cancellationToken = default)
    {
        _settings = _settings with { CodexExecutableOverride = executablePath };
        await _settingsStore.SaveAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
        {
            return;
        }

        _quotaSource.SnapshotUpdated -= OnSnapshotUpdated;
        _quotaSource.ConnectionStateChanged -= OnConnectionStateChanged;
        if (_taskCompletionSource is not null)
        {
            _taskCompletionSource.TaskCompleted -= OnTaskCompleted;
        }

        _dispatch(ClearTaskNotifications);
    }

    private void OnSnapshotUpdated(object? sender, QuotaSnapshot snapshot) =>
        _dispatch(() => ApplySnapshot(snapshot));

    private void OnConnectionStateChanged(object? sender, EventArgs args) =>
        _dispatch(UpdateConnectionState);

    private void OnTaskCompleted(object? sender, CodexTaskCompletion completion)
    {
        _dispatch(() =>
        {
            if (Volatile.Read(ref _disposed) != 0)
            {
                Diagnose($"Task completion ignored: turn={completion.TurnId}, reason=disposed.");
                return;
            }

            if (!PetAvailable)
            {
                Diagnose($"Task completion ignored: turn={completion.TurnId}, reason=pet-unavailable.");
                return;
            }

            if (!PetEnabled)
            {
                Diagnose($"Task completion ignored: turn={completion.TurnId}, reason=pet-disabled.");
                return;
            }

            if (!TaskNotificationsEnabled)
            {
                Diagnose($"Task completion ignored: turn={completion.TurnId}, reason=notifications-disabled.");
                return;
            }

            if (CurrentTaskCompletion is null)
            {
                PresentTaskNotification(completion);
                Diagnose($"Task completion shown: turn={completion.TurnId}.");
                return;
            }

            _taskCompletionQueue.Enqueue(completion);
            Diagnose($"Task completion queued: turn={completion.TurnId}.");
        });
    }

    private async Task StartTaskCompletionSourceAsync(CancellationToken cancellationToken)
    {
        if (_taskCompletionSource is null)
        {
            return;
        }

        try
        {
            await _taskCompletionSource.StartAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            // Task notifications are diagnostic-only and cannot block quota monitoring.
        }
    }

    private async Task<PetAsset?> FindPetAsync(CancellationToken cancellationToken)
    {
        if (_petProvider is null)
        {
            return null;
        }

        try
        {
            return await _petProvider.FindAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            // Pet availability must not block quota monitoring.
            return null;
        }
    }

    private void PresentTaskNotification(CodexTaskCompletion completion)
    {
        CurrentTaskCompletion = completion;
        CancelTaskNotificationDismissal();
        var dismissal = new CancellationTokenSource();
        _taskNotificationDismissal = dismissal;
        _ = DismissTaskNotificationAfterDelayAsync(dismissal);
    }

    private async Task DismissTaskNotificationAfterDelayAsync(CancellationTokenSource dismissal)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(8), _timeProvider, dismissal.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (dismissal.IsCancellationRequested)
        {
            return;
        }

        _dispatch(() =>
        {
            if (ReferenceEquals(_taskNotificationDismissal, dismissal))
            {
                DismissTaskNotification();
            }
        });
    }

    private void DismissTaskNotification()
    {
        CancelTaskNotificationDismissal();
        CurrentTaskCompletion = null;
        if (_taskCompletionQueue.TryDequeue(out var nextCompletion))
        {
            PresentTaskNotification(nextCompletion);
        }
    }

    private void ClearTaskNotifications()
    {
        CancelTaskNotificationDismissal();
        _taskCompletionQueue.Clear();
        CurrentTaskCompletion = null;
    }

    private void CancelTaskNotificationDismissal()
    {
        var dismissal = _taskNotificationDismissal;
        _taskNotificationDismissal = null;
        dismissal?.Cancel();
        dismissal?.Dispose();
    }

    private void Diagnose(string message)
    {
        try
        {
            _diagnostic?.Invoke(message);
        }
        catch
        {
        }
    }

    partial void OnCurrentTaskCompletionChanged(CodexTaskCompletion? value)
    {
        OnPropertyChanged(nameof(IsTaskNotificationVisible));
        UpdatePetAnimation();
    }

    private void ApplySnapshot(QuotaSnapshot snapshot)
    {
        Buckets.Clear();
        var now = _timeProvider.GetUtcNow();
        foreach (var bucket in snapshot.Buckets)
        {
            Buckets.Add(new QuotaBucketViewModel(bucket, now));
        }

        OnPropertyChanged(nameof(PrimaryBucket));
        OnPropertyChanged(nameof(AdditionalBuckets));
        UpdatePetAnimation();
        ResetCreditsText = snapshot.AvailableResetCredits is { } credits
            ? $"重置机会 {credits}"
            : string.Empty;
        LastUpdatedText = "刚刚更新";
    }

    private void UpdateConnectionState()
    {
        var state = _quotaSource.ConnectionState;
        ConnectionLabel = state switch
        {
            CodexConnectionState.Stopped => "已停止",
            CodexConnectionState.Connecting => "正在连接",
            CodexConnectionState.Live => "刚刚更新",
            CodexConnectionState.Reconnecting => "正在重连",
            CodexConnectionState.CodexMissing => "未找到 Codex",
            CodexConnectionState.LoggedOut => "请先登录 Codex",
            _ => "状态未知",
        };
        IsOffline = state != CodexConnectionState.Live;
        UpdatePetAnimation();
    }

    private void UpdatePetAnimation()
    {
        PetAnimation = IsTaskNotificationVisible
            ? PetAnimationState.Review
            : IsOffline
            ? PetAnimationState.Waiting
            : PrimaryBucket?.RemainingPercent < 10
                ? PetAnimationState.Failed
                : PetAnimationState.Idle;
    }
}
