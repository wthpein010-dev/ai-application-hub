using System.Collections.ObjectModel;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Persistence;

namespace CodexThreadWorkbench.Presentation;

public sealed class MainViewModel : ObservableObject, IAsyncDisposable
{
    private const int MaximumOpenThreads = 6;
    private static readonly TimeSpan StatusRefreshInterval = TimeSpan.FromSeconds(2);
    private readonly ICodexThreadClient _client;
    private readonly WorkspaceStore _workspaceStore;
    private readonly IConfirmationThreadReader _statusReader;
    private readonly bool _ownsClient;
    private readonly SynchronizationContext? _synchronizationContext;
    private readonly object _disposeGate = new();
    private readonly SemaphoreSlim _settingsLoadGate = new(1, 1);
    private readonly SemaphoreSlim _workspaceSaveGate = new(1, 1);
    private readonly CancellationTokenSource _statusRefreshCancellation = new();
    private Task? _disposeTask;
    private Task? _statusRefreshTask;
    private WorkspaceSettings _settings = new();
    private bool _isPickerOpen;
    private bool _isConnecting;
    private bool _isFullScreen;
    private bool _settingsLoaded;
    private string _globalError = string.Empty;
    private int _gridRows = 1;
    private int _gridColumns = 1;

    public MainViewModel(
        ICodexThreadClient client,
        WorkspaceStore workspaceStore,
        bool ownsClient = true,
        IConfirmationThreadReader? statusReader = null)
    {
        _client = client;
        _workspaceStore = workspaceStore;
        _statusReader = statusReader ?? new ClientConfirmationThreadReader(client);
        _ownsClient = ownsClient;
        _synchronizationContext = SynchronizationContext.Current;
        Picker = new ThreadPickerViewModel(client);
        OpenPickerCommand = new AsyncRelayCommand(OpenPickerAsync, () => !IsConnecting);
        ClosePickerCommand = new RelayCommand(() => IsPickerOpen = false);
        OpenThreadCommand = new RelayCommand<ThreadPickerItemViewModel>(
            item => _ = OpenThreadFromPickerAsync(item),
            item => !item.IsOpen && OpenThreads.Count < MaximumOpenThreads);
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsConnecting);
        ToggleFullScreenCommand = new RelayCommand(
            () => IsFullScreen = !IsFullScreen);

        _client.NotificationReceived += OnNotificationReceived;
        _client.ApprovalRequested += OnApprovalRequested;
    }

    public ObservableCollection<ThreadCardViewModel> OpenThreads { get; } = [];

    public ThreadPickerViewModel Picker { get; }

    public bool IsPickerOpen
    {
        get => _isPickerOpen;
        set => SetProperty(ref _isPickerOpen, value);
    }

    public bool IsConnecting
    {
        get => _isConnecting;
        private set
        {
            if (SetProperty(ref _isConnecting, value))
            {
                OpenPickerCommand.RaiseCanExecuteChanged();
                RefreshCommand.RaiseCanExecuteChanged();
                OnPropertyChanged(nameof(ConnectionText));
            }
        }
    }

    public string ConnectionText => IsConnecting
        ? "正在连接 Codex…"
        : _client.IsConnected
            ? "已连接"
            : "离线";

    public string GlobalError
    {
        get => _globalError;
        private set
        {
            if (SetProperty(ref _globalError, value))
            {
                OnPropertyChanged(nameof(HasGlobalError));
            }
        }
    }

    public bool HasGlobalError => !string.IsNullOrWhiteSpace(GlobalError);

    public int GridRows
    {
        get => _gridRows;
        private set => SetProperty(ref _gridRows, value);
    }

    public int GridColumns
    {
        get => _gridColumns;
        private set => SetProperty(ref _gridColumns, value);
    }

    public bool IsFullScreen
    {
        get => _isFullScreen;
        set
        {
            if (SetProperty(ref _isFullScreen, value))
            {
                OnPropertyChanged(nameof(WindowModeText));
                _settings.IsFullScreen = value;
                _ = SaveWorkspaceInBackgroundAsync();
            }
        }
    }

    public string WindowModeText => IsFullScreen ? "退出全屏" : "全屏";

    public double WindowLeft => _settings.WindowLeft;

    public double WindowTop => _settings.WindowTop;

    public double WindowWidth => _settings.WindowWidth;

    public double WindowHeight => _settings.WindowHeight;

    public double? LauncherLeft => _settings.LauncherLeft;

    public double? LauncherTop => _settings.LauncherTop;

    public AsyncRelayCommand OpenPickerCommand { get; }

    public RelayCommand ClosePickerCommand { get; }

    public RelayCommand<ThreadPickerItemViewModel> OpenThreadCommand { get; }

    public AsyncRelayCommand RefreshCommand { get; }

    public RelayCommand ToggleFullScreenCommand { get; }

    public async Task LoadSettingsAsync(
        CancellationToken cancellationToken = default)
    {
        if (_settingsLoaded)
        {
            return;
        }

        await _settingsLoadGate.WaitAsync(cancellationToken);
        try
        {
            if (_settingsLoaded)
            {
                return;
            }

            _settings = await _workspaceStore.LoadAsync(cancellationToken);
            _isFullScreen = _settings.IsFullScreen;
            _settingsLoaded = true;
            OnPropertyChanged(nameof(IsFullScreen));
            OnPropertyChanged(nameof(WindowModeText));
        }
        finally
        {
            _settingsLoadGate.Release();
        }
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        IsConnecting = true;
        GlobalError = string.Empty;
        try
        {
            if (!_client.IsConnected)
            {
                await _client.InitializeAsync(cancellationToken);
            }

            await LoadSettingsAsync(cancellationToken);
            var threads = await _client.ListThreadsAsync(
                limit: 200,
                cancellationToken: cancellationToken);
            var byId = threads.ToDictionary(thread => thread.Id, StringComparer.Ordinal);
            var selected = _settings.OpenThreadIds
                .Where(byId.ContainsKey)
                .Select(id => byId[id])
                .Take(MaximumOpenThreads)
                .ToArray();
            if (selected.Length == 0)
            {
                selected = threads.Take(4).ToArray();
            }

            OpenThreads.Clear();
            foreach (var summary in selected)
            {
                await AddThreadAsync(summary, cancellationToken);
            }

            await Picker.RefreshAsync(
                OpenThreads.Select(thread => thread.ThreadId).ToArray(),
                cancellationToken);
            await SaveWorkspaceAsync(cancellationToken);
            _statusRefreshTask ??= PollOpenThreadStatusesAsync(
                _statusRefreshCancellation.Token);
        }
        catch (Exception error)
        {
            GlobalError = error.Message;
        }
        finally
        {
            IsConnecting = false;
            OnPropertyChanged(nameof(ConnectionText));
        }
    }

    public void UpdateWindowBounds(
        double left,
        double top,
        double width,
        double height)
    {
        if (IsFullScreen || width < 320 || height < 240)
        {
            return;
        }

        _settings.WindowLeft = left;
        _settings.WindowTop = top;
        _settings.WindowWidth = width;
        _settings.WindowHeight = height;
        _ = SaveWorkspaceInBackgroundAsync();
    }

    public void UpdateLauncherPosition(double left, double top)
    {
        if (!double.IsFinite(left) || !double.IsFinite(top))
        {
            return;
        }

        _settings.LauncherLeft = left;
        _settings.LauncherTop = top;
        _ = SaveWorkspaceInBackgroundAsync();
    }

    public async Task<bool> SwapOpenThreadsAsync(
        string sourceThreadId,
        string targetThreadId)
    {
        var sourceIndex = -1;
        var targetIndex = -1;
        var sourceMatchCount = 0;
        var targetMatchCount = 0;
        for (var index = 0; index < OpenThreads.Count; index++)
        {
            if (string.Equals(
                    OpenThreads[index].ThreadId,
                    sourceThreadId,
                    StringComparison.Ordinal))
            {
                sourceIndex = index;
                sourceMatchCount++;
            }

            if (string.Equals(
                    OpenThreads[index].ThreadId,
                    targetThreadId,
                    StringComparison.Ordinal))
            {
                targetIndex = index;
                targetMatchCount++;
            }
        }

        if (sourceMatchCount != 1 ||
            targetMatchCount != 1 ||
            sourceIndex == targetIndex)
        {
            return false;
        }

        (OpenThreads[sourceIndex], OpenThreads[targetIndex]) =
            (OpenThreads[targetIndex], OpenThreads[sourceIndex]);
        try
        {
            await SaveWorkspaceAsync();
        }
        catch (Exception error)
        {
            GlobalError = error.Message;
        }

        return true;
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
        _client.NotificationReceived -= OnNotificationReceived;
        _client.ApprovalRequested -= OnApprovalRequested;
        _statusRefreshCancellation.Cancel();
        try
        {
            if (_statusRefreshTask is not null)
            {
                await _statusRefreshTask;
            }

            await SaveWorkspaceAsync();
        }
        finally
        {
            _statusRefreshCancellation.Dispose();
            if (_ownsClient)
            {
                await _client.DisposeAsync();
            }
        }
    }

    private async Task PollOpenThreadStatusesAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(StatusRefreshInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                await RefreshOpenThreadStatusesAsync(cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private async Task RefreshOpenThreadStatusesAsync(CancellationToken cancellationToken)
    {
        var threadIds = OpenThreads
            .Select(thread => thread.ThreadId)
            .ToArray();
        if (threadIds.Length == 0)
        {
            return;
        }

        try
        {
            var summaries = await _client.ListThreadsAsync(
                limit: 200,
                cancellationToken: cancellationToken);
            var openThreadIds = threadIds.ToHashSet(StringComparer.Ordinal);
            var states = await Task.WhenAll(
                summaries
                    .Where(summary => openThreadIds.Contains(summary.Id))
                    .Select(summary =>
                        _statusReader.ReadThreadAsync(summary, cancellationToken)));
            Dispatch(() =>
            {
                foreach (var state in states)
                {
                    var card = OpenThreads.FirstOrDefault(
                        thread => thread.ThreadId == state.Summary.Id);
                    card?.ApplyStatusSnapshot(state);
                }
            });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            // A later tick retries transient app-server read failures.
        }
    }

    private async Task OpenPickerAsync()
    {
        IsPickerOpen = true;
        await Picker.RefreshAsync(OpenThreads.Select(thread => thread.ThreadId).ToArray());
    }

    private async Task RefreshAsync()
    {
        GlobalError = string.Empty;
        var ids = OpenThreads.Select(thread => thread.ThreadId).ToArray();
        try
        {
            var summaries = await _client.ListThreadsAsync(limit: 200);
            var byId = summaries.ToDictionary(
                summary => summary.Id,
                StringComparer.Ordinal);
            var states = await Task.WhenAll(
                ids
                    .Where(byId.ContainsKey)
                    .Select(id => _statusReader.ReadThreadAsync(byId[id])));
            foreach (var state in states)
            {
                var current = OpenThreads.First(
                    thread => thread.ThreadId == state.Summary.Id);
                var replacement = CreateCard(state);
                var targetIndex = OpenThreads.IndexOf(current);
                OpenThreads[targetIndex] = replacement;
            }

            await Picker.RefreshAsync(ids);
        }
        catch (Exception error)
        {
            GlobalError = error.Message;
        }
    }

    private async Task OpenThreadFromPickerAsync(ThreadPickerItemViewModel item)
    {
        if (item.IsOpen || OpenThreads.Count >= MaximumOpenThreads)
        {
            return;
        }

        await AddThreadAsync(item.Summary);
        Picker.MarkOpen(item.Id, true);
        IsPickerOpen = false;
        OpenThreadCommand.RaiseCanExecuteChanged();
        await SaveWorkspaceAsync();
    }

    private async Task AddThreadAsync(
        ThreadSummary summary,
        CancellationToken cancellationToken = default)
    {
        var state = await _statusReader.ReadThreadAsync(summary, cancellationToken);
        var card = CreateCard(state);
        card.IsMinimized = _settings.MinimizedThreadIds.Contains(
            summary.Id,
            StringComparer.Ordinal);
        OpenThreads.Add(card);
        UpdateGrid();
    }

    private ThreadCardViewModel CreateCard(ThreadCardState state) =>
        new(
            _client,
            state,
            closeRequested: CloseThreadAsync,
            stateChanged: _ => SaveWorkspaceInBackgroundAsync());

    private async Task CloseThreadAsync(ThreadCardViewModel card)
    {
        OpenThreads.Remove(card);
        Picker.MarkOpen(card.ThreadId, false);
        UpdateGrid();
        OpenThreadCommand.RaiseCanExecuteChanged();
        await SaveWorkspaceAsync();
    }

    private void UpdateGrid()
    {
        var shape = GridLayoutCalculator.Calculate(OpenThreads.Count);
        GridRows = shape.Rows;
        GridColumns = shape.Columns;
        OnPropertyChanged(nameof(OpenThreads));
    }

    private async Task SaveWorkspaceAsync(CancellationToken cancellationToken = default)
    {
        var snapshot = new WorkspaceSettings
        {
            OpenThreadIds = OpenThreads.Select(thread => thread.ThreadId).ToList(),
            MinimizedThreadIds = OpenThreads.Where(thread => thread.IsMinimized)
                .Select(thread => thread.ThreadId)
                .ToList(),
            WindowLeft = _settings.WindowLeft,
            WindowTop = _settings.WindowTop,
            WindowWidth = _settings.WindowWidth,
            WindowHeight = _settings.WindowHeight,
            LauncherLeft = _settings.LauncherLeft,
            LauncherTop = _settings.LauncherTop,
            IsFullScreen = _settings.IsFullScreen
        };
        await _workspaceSaveGate.WaitAsync(cancellationToken);
        try
        {
            await _workspaceStore.SaveAsync(snapshot, cancellationToken);
        }
        finally
        {
            _workspaceSaveGate.Release();
        }
    }

    private async Task SaveWorkspaceInBackgroundAsync()
    {
        try
        {
            await SaveWorkspaceAsync();
        }
        catch
        {
        }
    }

    private void OnNotificationReceived(CodexNotification notification) =>
        Dispatch(() =>
        {
            var card = OpenThreads.FirstOrDefault(
                thread => thread.ThreadId == notification.ThreadId);
            card?.ApplyNotification(notification);
        });

    private void OnApprovalRequested(CodexApprovalRequest request) =>
        Dispatch(() =>
        {
            var card = OpenThreads.FirstOrDefault(
                thread => thread.ThreadId == request.ThreadId);
            card?.SetApproval(request);
        });

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
