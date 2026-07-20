using System.Runtime.CompilerServices;
using System.Text.Json;
using CodexThreadWorkbench.Infrastructure;

namespace CodexThreadWorkbench.Tests.Infrastructure;

public sealed class JsonRpcConnectionTests
{
    [Fact]
    public async Task RequestAsync_MatchesResponseById()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);

        var pending = connection.RequestAsync("thread/list", new { limit = 10 });
        using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
        var id = request.RootElement.GetProperty("id").GetInt64();

        transport.EnqueueIncoming($"{{\"id\":{id},\"result\":{{\"data\":[]}}}}");

        var result = await pending;
        Assert.Empty(result.GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task ReadLoop_RaisesNotification()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        var received = new TaskCompletionSource<JsonRpcNotification>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        connection.NotificationReceived += notification => received.TrySetResult(notification);

        transport.EnqueueIncoming(
            """{"method":"thread/status/changed","params":{"threadId":"thread-1","status":{"type":"active","activeFlags":[]}}}""");

        var notification = await received.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("thread/status/changed", notification.Method);
        Assert.Equal("thread-1", notification.Params.GetProperty("threadId").GetString());
    }

    [Fact]
    public async Task ReadLoop_RaisesServerRequestAndCanRespond()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        var received = new TaskCompletionSource<JsonRpcServerRequest>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        connection.ServerRequestReceived += request => received.TrySetResult(request);

        transport.EnqueueIncoming(
            """{"id":77,"method":"item/fileChange/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"item-1","startedAtMs":1}}""");

        var request = await received.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await connection.RespondAsync(request.Id, new { decision = "decline" });

        using var response = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal(77, response.RootElement.GetProperty("id").GetInt64());
        Assert.Equal("decline", response.RootElement.GetProperty("result").GetProperty("decision").GetString());
    }

    [Fact]
    public async Task RequestAsync_ServerError_ThrowsJsonRpcException()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);

        var pending = connection.RequestAsync("thread/read", new { threadId = "missing" });
        using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
        var id = request.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming(
            $"{{\"id\":{id},\"error\":{{\"code\":404,\"message\":\"Thread not found\"}}}}");

        var error = await Assert.ThrowsAsync<JsonRpcException>(() => pending);
        Assert.Equal(404, error.Code);
        Assert.Contains("Thread not found", error.Message);
    }

    [Fact]
    public async Task DisposeAsync_DisposesTransportBeforeWaitingForReadLoop()
    {
        var transport = new BlockingReadTransport();
        var connection = new JsonRpcConnection(transport);
        var disposal = connection.DisposeAsync().AsTask();

        try
        {
            await disposal.WaitAsync(TimeSpan.FromMilliseconds(500));
        }
        finally
        {
            transport.ReleaseRead();
            await disposal.WaitAsync(TimeSpan.FromSeconds(2));
        }

        Assert.True(transport.IsDisposed);
    }

    [Fact]
    public async Task DisposeAsync_ConcurrentCallsWaitForSameTransportDisposal()
    {
        var transport = new BlockingDisposeTransport();
        var connection = new JsonRpcConnection(transport);

        var firstDisposal = connection.DisposeAsync().AsTask();
        await transport.DisposalStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var secondDisposal = connection.DisposeAsync().AsTask();

        Assert.False(secondDisposal.IsCompleted);

        transport.AllowDisposal();
        await Task.WhenAll(firstDisposal, secondDisposal)
            .WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(transport.IsDisposed);
    }

    private sealed class BlockingReadTransport : IJsonLineTransport
    {
        private readonly TaskCompletionSource _readReleased =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public bool IsDisposed { get; private set; }

        public ValueTask WriteLineAsync(
            string line,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public async IAsyncEnumerable<string> ReadLinesAsync(
            [EnumeratorCancellation]
            CancellationToken cancellationToken = default)
        {
            await _readReleased.Task;
            yield break;
        }

        public ValueTask DisposeAsync()
        {
            IsDisposed = true;
            _readReleased.TrySetResult();
            return ValueTask.CompletedTask;
        }

        public void ReleaseRead() => _readReleased.TrySetResult();
    }

    private sealed class BlockingDisposeTransport : IJsonLineTransport
    {
        private readonly TaskCompletionSource _allowDisposal =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _readReleased =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource DisposalStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public bool IsDisposed { get; private set; }

        public ValueTask WriteLineAsync(
            string line,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public async IAsyncEnumerable<string> ReadLinesAsync(
            [EnumeratorCancellation]
            CancellationToken cancellationToken = default)
        {
            await _readReleased.Task;
            yield break;
        }

        public async ValueTask DisposeAsync()
        {
            DisposalStarted.TrySetResult();
            await _allowDisposal.Task;
            IsDisposed = true;
            _readReleased.TrySetResult();
        }

        public void AllowDisposal() => _allowDisposal.TrySetResult();
    }
}
