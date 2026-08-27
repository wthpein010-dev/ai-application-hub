using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Persistence;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class WindowLifecycleTests
{
    [AvaloniaFact]
    public void MainWindow_ShowsCollapseControlOnlyInFloatingMode()
    {
        var window = new MainWindow();
        var collapseButton = window.FindControl<Button>("CollapseButton");
        Assert.NotNull(collapseButton);
        Assert.False(collapseButton.IsVisible);

        window.CollapseToLauncherOnClose = true;

        Assert.True(collapseButton.IsVisible);
    }

    [AvaloniaFact]
    public void MainWindow_FollowsViewModelFullScreenState()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");
        var viewModel = new MainViewModel(new NoopClient(), new WorkspaceStore(path));
        var window = new MainWindow { DataContext = viewModel };

        viewModel.IsFullScreen = true;

        Assert.Equal(WindowState.FullScreen, window.WindowState);
    }

    [AvaloniaFact]
    public async Task MainWindow_UsesSharedShutdownDelegateExactlyOnce()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");
        await using var viewModel = new MainViewModel(
            new NoopClient(),
            new WorkspaceStore(path));
        var window = new MainWindow { DataContext = viewModel };
        var shutdownCalls = 0;
        var shutdownCompleted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        window.ShutdownAsync = () =>
        {
            shutdownCalls++;
            shutdownCompleted.TrySetResult();
            return Task.CompletedTask;
        };
        window.Show();

        window.Close();
        await shutdownCompleted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        window.Close();

        Assert.Equal(1, shutdownCalls);
    }

    [AvaloniaFact]
    public async Task MainWindow_InFloatingMode_CloseOnlyCollapsesToLauncher()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");
        await using var viewModel = new MainViewModel(
            new NoopClient(),
            new WorkspaceStore(path));
        var window = new MainWindow
        {
            DataContext = viewModel,
            CollapseToLauncherOnClose = true
        };
        var shutdownCalls = 0;
        var collapsedCalls = 0;
        window.ShutdownAsync = () =>
        {
            shutdownCalls++;
            return Task.CompletedTask;
        };
        window.CollapsedToLauncher += () => collapsedCalls++;
        window.Show();

        window.Close();
        await Task.Delay(50);

        Assert.False(window.IsVisible);
        Assert.Equal(1, collapsedCalls);
        Assert.Equal(0, shutdownCalls);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public void MainWindow_InFloatingMode_AllowsApplicationAndOsShutdown()
    {
        var applicationWindow = new MainWindow { CollapseToLauncherOnClose = true };
        var osWindow = new MainWindow { CollapseToLauncherOnClose = true };

        Assert.False(HandleClosing(
            applicationWindow,
            WindowCloseReason.ApplicationShutdown));
        Assert.False(HandleClosing(osWindow, WindowCloseReason.OSShutdown));

        applicationWindow.CloseForShutdown();
        osWindow.CloseForShutdown();
    }

    private static bool HandleClosing(Window window, WindowCloseReason reason)
    {
        var method = typeof(Window).GetMethod(
            "HandleClosing",
            System.Reflection.BindingFlags.Instance |
            System.Reflection.BindingFlags.NonPublic);
        Assert.NotNull(method);
        return Assert.IsType<bool>(method.Invoke(window, [reason]));
    }

    private sealed class NoopClient : ICodexThreadClient
    {
        public event Action<CodexNotification>? NotificationReceived
        {
            add { }
            remove { }
        }

        public event Action<CodexApprovalRequest>? ApprovalRequested
        {
            add { }
            remove { }
        }

        public bool IsConnected => true;

        public Task InitializeAsync(CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
            int limit = 100,
            string? searchTerm = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ThreadSummary>>([]);

        public Task<ThreadCardState> ReadThreadAsync(string threadId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task ResumeThreadAsync(string threadId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<string> StartTurnAsync(string threadId, string text, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task SteerTurnAsync(string threadId, string expectedTurnId, string text, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task InterruptTurnAsync(string threadId, string turnId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task RespondToApprovalAsync(CodexApprovalRequest request, bool accept, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
