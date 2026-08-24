using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Tests.Presentation;

public sealed class WorkbenchSessionTests
{
    [Fact]
    public async Task DisposeAsync_OverlayOnlySessionDisposesResourcesWithoutMainViewModel()
    {
        var order = new List<string>();
        var session = new WorkbenchSession(
            new TrackedDisposable("overlay", order),
            new TrackedDisposable("monitor", order),
            new TrackedDisposable("client", order));

        await session.DisposeAsync();

        Assert.Equal(["overlay", "monitor", "client"], order);
    }

    [Fact]
    public async Task DisposeAsync_DisposesSharedResourcesInOrderExactlyOnce()
    {
        var order = new List<string>();
        var session = new WorkbenchSession(
            new TrackedDisposable("overlay", order),
            new TrackedDisposable("monitor", order),
            new TrackedDisposable("main", order),
            new TrackedDisposable("client", order));

        await session.DisposeAsync();
        await session.DisposeAsync();

        Assert.Equal(["overlay", "monitor", "main", "client"], order);
    }

    [Fact]
    public async Task DisposeAsync_AttemptsEveryResource_WhenEarlierCleanupFails()
    {
        var order = new List<string>();
        var session = new WorkbenchSession(
            new TrackedDisposable("overlay", order, new IOException("overlay failed")),
            new TrackedDisposable("monitor", order),
            new TrackedDisposable("main", order),
            new TrackedDisposable("client", order));

        var error = await Assert.ThrowsAsync<IOException>(
            () => session.DisposeAsync().AsTask());

        Assert.Equal("overlay failed", error.Message);
        Assert.Equal(["overlay", "monitor", "main", "client"], order);
    }

    private sealed class TrackedDisposable : IAsyncDisposable
    {
        private readonly string _name;
        private readonly List<string> _order;
        private readonly Exception? _error;

        public TrackedDisposable(
            string name,
            List<string> order,
            Exception? error = null)
        {
            _name = name;
            _order = order;
            _error = error;
        }

        public ValueTask DisposeAsync()
        {
            _order.Add(_name);
            return _error is null
                ? ValueTask.CompletedTask
                : ValueTask.FromException(_error);
        }
    }
}
