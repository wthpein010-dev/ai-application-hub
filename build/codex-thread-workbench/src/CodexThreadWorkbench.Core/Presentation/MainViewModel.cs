using System.Collections.ObjectModel;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Persistence;

namespace CodexThreadWorkbench.Presentation;

public sealed class MainViewModel : ObservableObject, IAsyncDisposable
{
    private const int MaximumOpenThreads = 6;
    private readonly ICodexThreadClient _client;
    private readonly WorkspaceStore _workspaceStore;
    private readonly SynchronizationContext? _synchronizationContext;
    private readonly object _disposeGate = new();
    private Task? _disposeTask;
    private WorkspaceSettings _settings = new();
    private bool _isPickerOpen;
    private bool _isConnecting;
    private bool _isFullScreen;
    private string _globalError = string.Empty;
    private int _gridRows = 1;
    private int _gridColumns = 1;

    public MainViewModel(
        ICodexThreadClient client,
        WorkspaceStore workspaceStore)
    {
        _client = client;
        _workspaceStore = workspaceStore;
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
                _ = SaveWorkspaceAsync();
            }
        }
    }

    public string WindowModeText => IsFullScreen ? "退出全屏" : "全屏";

    public double WindowLeft => _settings.WindowLeft;

    public double WindowTop => _settings.WindowTop;

    public double WindowWidth => _settings.WindowWidth;

    public double WindowHeight => _settings.WindowHeight;

    public AsyncRelayCommand OpenPickerCommand { get; }

    public RelayCommand ClosePickerCommand { get; }

    public RelayCommand<ThreadPickerItemViewModel> OpenThreadCommand { get; }

    public AsyncRelayCommand RefreshCommand { get; }

    public RelayCommand ToggleFullScreenCommand { get; }

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

            _settings = await _workspaceStore.LoadAsync(cancellationToken);
            _isFullScreen = _settings.IsFullScreen;
            OnPropertyChanged(nameof(IsFullScreen));
            OnPropertyChanged(nameof(WindowModeText));
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
        _ = SaveWorkspaceAsync();
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
        await SaveWorkspaceAsync();
        await _client.DisposeAsync();
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
            var states = await Task.WhenAll(
                ids.Select(id => _client.ReadThreadAsync(id)));
            for (var index = 0; index < states.Length; index++)
            {
                var current = OpenThreads.First(thread => thread.ThreadId == states[index].Summary.Id);
                var replacement = CreateCard(states[index]);
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
        var state = await _client.ReadThreadAsync(summary.Id, cancellationToken);
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
            stateChanged: _ => SaveWorkspaceAsync());

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

    private Task SaveWorkspaceAsync(CancellationToken cancellationToken = default)
    {
        _settings.OpenThreadIds =
            OpenThreads.Select(thread => thread.ThreadId).ToList();
        _settings.MinimizedThreadIds =
            OpenThreads.Where(thread => thread.IsMinimized)
                .Select(thread => thread.ThreadId)
                .ToList();
        return _workspaceStore.SaveAsync(_settings, cancellationToken);
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
