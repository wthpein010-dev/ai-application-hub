using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Persistence;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Tests.Presentation;

public sealed class MainViewModelTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "CodexThreadWorkbench.MainViewModel.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task InitializeAsync_NoSavedThreads_OpensFourMostRecent()
    {
        var client = CreateClient(threadCount: 6);
        var store = new WorkspaceStore(Path.Combine(_directory, "workspace.json"));
        await using var viewModel = new MainViewModel(client, store);

        await viewModel.InitializeAsync();

        Assert.Equal(4, viewModel.OpenThreads.Count);
        Assert.Equal(2, viewModel.GridRows);
        Assert.Equal(2, viewModel.GridColumns);
    }

    [Fact]
    public async Task InitializeAsync_RestoresSavedThreadIdsInSavedOrder()
    {
        var client = CreateClient(threadCount: 5);
        var store = new WorkspaceStore(Path.Combine(_directory, "workspace.json"));
        await store.SaveAsync(new WorkspaceSettings
        {
            OpenThreadIds = ["thread-3", "thread-1"]
        });
        await using var viewModel = new MainViewModel(client, store);

        await viewModel.InitializeAsync();

        Assert.Equal(["thread-3", "thread-1"], viewModel.OpenThreads.Select(thread => thread.ThreadId));
    }

    [Fact]
    public async Task InitializeAsync_AutoRefreshesOpenThreadStatusWithoutReplacingCard()
    {
        var client = CreateClient(threadCount: 1);
        var store = new WorkspaceStore(Path.Combine(_directory, "workspace.json"));
        await using var viewModel = new MainViewModel(client, store);
        await viewModel.InitializeAsync();
        var card = Assert.Single(viewModel.OpenThreads);
        card.Draft = "不要丢失输入";

        var runningSummary = client.Threads[0] with
        {
            Status = ThreadStatusKind.Running
        };
        client.ThreadStates[card.ThreadId] = new ThreadCardState(
            runningSummary,
            [],
            ThreadStatusKind.Running,
            ActiveTurnId: "external-turn");

        var deadline = DateTimeOffset.UtcNow.AddSeconds(4);
        while (card.Status != ThreadStatusKind.Running &&
               DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(50);
        }

        Assert.Equal(ThreadStatusKind.Running, card.Status);
        Assert.Equal("external-turn", card.ActiveTurnId);
        Assert.Same(card, Assert.Single(viewModel.OpenThreads));
        Assert.Equal("不要丢失输入", card.Draft);
    }

    [Fact]
    public async Task DisposeAsync_WhenCalledConcurrently_WaitsForOneSharedShutdown()
    {
        var client = CreateClient(threadCount: 0);
        client.DelayDispose = true;
        var store = new WorkspaceStore(Path.Combine(_directory, "workspace.json"));
        var viewModel = new MainViewModel(client, store);

        var first = viewModel.DisposeAsync().AsTask();
        await client.DisposeStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var second = viewModel.DisposeAsync().AsTask();

        Assert.False(second.IsCompleted);
        client.DisposeCompletion.TrySetResult();
        await Task.WhenAll(first, second);
        Assert.Equal(1, client.DisposeCalls);
    }

    [Fact]
    public async Task DisposeAsync_WhenWorkspaceSaveFails_StillDisposesClient()
    {
        Directory.CreateDirectory(_directory);
        var workspacePath = Path.Combine(_directory, "workspace.json");
        await using var temporaryFileLock = new FileStream(
            workspacePath + ".tmp",
            FileMode.Create,
            FileAccess.ReadWrite,
            FileShare.None);
        var client = CreateClient(threadCount: 0);
        var viewModel = new MainViewModel(client, new WorkspaceStore(workspacePath));

        await Assert.ThrowsAsync<IOException>(() => viewModel.DisposeAsync().AsTask());

        Assert.Equal(1, client.DisposeCalls);
    }

    private static FakeCodexThreadClient CreateClient(int threadCount)
    {
        var client = new FakeCodexThreadClient();
        for (var index = 1; index <= threadCount; index++)
        {
            var summary = new ThreadSummary(
                $"thread-{index}",
                $"线程 {index}",
                $"预览 {index}",
                "C:\\work",
                DateTimeOffset.UtcNow.AddMinutes(-index),
                ThreadStatusKind.Idle);
            client.Threads.Add(summary);
            client.ThreadStates[summary.Id] = new ThreadCardState(
                summary,
                [],
                ThreadStatusKind.Idle);
        }

        return client;
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
