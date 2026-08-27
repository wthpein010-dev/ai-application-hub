namespace CodexThreadWorkbench;

public sealed class FloatingWorkbenchController : IDisposable
{
    private readonly FloatingLauncherWindow _launcher;
    private readonly MainWindow _workbench;
    private readonly Action _fullScreenRequested;
    private readonly Action _refreshRequested;
    private readonly Action _exitRequested;
    private readonly Func<Task> _initializeWorkbenchAsync;
    private Task? _initializationTask;
    private bool _hasRequestedExit;
    private bool _disposed;

    public FloatingWorkbenchController(
        FloatingLauncherWindow launcher,
        MainWindow workbench,
        Action fullScreenRequested,
        Action refreshRequested,
        Action exitRequested,
        Func<Task>? initializeWorkbenchAsync = null)
    {
        _launcher = launcher;
        _workbench = workbench;
        _fullScreenRequested = fullScreenRequested;
        _refreshRequested = refreshRequested;
        _exitRequested = exitRequested;
        _initializeWorkbenchAsync = initializeWorkbenchAsync ??
                                    (() => Task.CompletedTask);
        _launcher.ToggleWorkbenchRequested += ToggleWorkbench;
        _launcher.FullScreenRequested += OpenFullScreen;
        _launcher.RefreshRequested += Refresh;
        _launcher.ExitRequested += Exit;
        _workbench.CollapsedToLauncher += OnWorkbenchCollapsed;
    }

    public void Start()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _launcher.SetWorkbenchVisible(false);
        if (!_launcher.IsVisible)
        {
            _launcher.Show();
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _launcher.ToggleWorkbenchRequested -= ToggleWorkbench;
        _launcher.FullScreenRequested -= OpenFullScreen;
        _launcher.RefreshRequested -= Refresh;
        _launcher.ExitRequested -= Exit;
        _workbench.CollapsedToLauncher -= OnWorkbenchCollapsed;
    }

    private void ToggleWorkbench()
    {
        if (_workbench.IsVisible)
        {
            _workbench.Hide();
            _launcher.SetWorkbenchVisible(false);
            return;
        }

        ShowWorkbench();
    }

    private void OpenFullScreen()
    {
        _fullScreenRequested();
        ShowWorkbench();
    }

    private void Refresh() => _refreshRequested();

    private void Exit()
    {
        if (_hasRequestedExit)
        {
            return;
        }

        _hasRequestedExit = true;
        _exitRequested();
    }

    private void OnWorkbenchCollapsed() =>
        _launcher.SetWorkbenchVisible(false);

    private void ShowWorkbench()
    {
        if (!_workbench.IsVisible)
        {
            _workbench.Show();
        }

        _workbench.Activate();
        _launcher.SetWorkbenchVisible(true);
        _initializationTask ??= _initializeWorkbenchAsync();
    }
}
