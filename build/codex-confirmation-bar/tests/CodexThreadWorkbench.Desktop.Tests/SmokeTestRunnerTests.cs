using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class SmokeTestRunnerTests
{
    [Fact]
    public async Task RunAsync_InitializesListsAndDisposesClient()
    {
        var client = new SmokeClient();

        var exitCode = await SmokeTestRunner.RunAsync(client, CancellationToken.None);

        Assert.Equal(0, exitCode);
        Assert.Equal(1, client.InitializeCalls);
        Assert.Equal(1, client.ListCalls);
        Assert.Equal(1, client.DisposeCalls);
    }

    private sealed class SmokeClient : ICodexThreadClient
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

        public bool IsConnected => false;

        public int InitializeCalls { get; private set; }

        public int ListCalls { get; private set; }

        public int DisposeCalls { get; private set; }

        public Task InitializeAsync(CancellationToken cancellationToken = default)
        {
            InitializeCalls++;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
            int limit = 100,
            string? searchTerm = null,
            CancellationToken cancellationToken = default)
        {
            ListCalls++;
            return Task.FromResult<IReadOnlyList<ThreadSummary>>([]);
        }

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

        public ValueTask DisposeAsync()
        {
            DisposeCalls++;
            return ValueTask.CompletedTask;
        }
    }
}
