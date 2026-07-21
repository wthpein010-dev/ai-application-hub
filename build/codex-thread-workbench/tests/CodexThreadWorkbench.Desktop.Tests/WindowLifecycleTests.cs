using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Persistence;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class WindowLifecycleTests
{
    [AvaloniaFact]
    public void MainWindow_FollowsViewModelFullScreenState()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");
        var viewModel = new MainViewModel(new NoopClient(), new WorkspaceStore(path));
        var window = new MainWindow { DataContext = viewModel };

        viewModel.IsFullScreen = true;

        Assert.Equal(WindowState.FullScreen, window.WindowState);
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
