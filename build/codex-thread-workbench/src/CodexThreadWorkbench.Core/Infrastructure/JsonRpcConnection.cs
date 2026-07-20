using System.Collections.Concurrent;
using System.Text.Json;

namespace CodexThreadWorkbench.Infrastructure;

public sealed class JsonRpcConnection : IAsyncDisposable
{
    private readonly IJsonLineTransport _transport;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly object _lifecycleGate = new();
    private readonly Task _readLoop;
    private long _nextId;
    private bool _disposed;
    private Task? _disposeTask;

    public JsonRpcConnection(IJsonLineTransport transport)
    {
        _transport = transport;
        _readLoop = ReadLoopAsync(_shutdown.Token);
    }

    public event Action<JsonRpcNotification>? NotificationReceived;

    public event Action<JsonRpcServerRequest>? ServerRequestReceived;

    public async Task<JsonElement> RequestAsync(
        string method,
        object? parameters = null,
        CancellationToken cancellationToken = default)
    {
        long id;
        TaskCompletionSource<JsonElement> completion;
        lock (_lifecycleGate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            id = Interlocked.Increment(ref _nextId);
            completion = new TaskCompletionSource<JsonElement>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            if (!_pending.TryAdd(id, completion))
            {
                throw new InvalidOperationException("无法登记 JSON-RPC 请求。");
            }
        }

        using var registration = cancellationToken.Register(
            () =>
            {
                if (_pending.TryRemove(id, out var pending))
                {
                    pending.TrySetCanceled(cancellationToken);
                }
            });

        try
        {
            await WriteAsync(new { id, method, @params = parameters }, cancellationToken);
            return await completion.Task.ConfigureAwait(false);
        }
        catch
        {
            _pending.TryRemove(id, out _);
            throw;
        }
    }

    public Task NotifyAsync(
        string method,
        object? parameters = null,
        CancellationToken cancellationToken = default) =>
        WriteAsync(new { method, @params = parameters }, cancellationToken);

    public Task RespondAsync(
        JsonElement id,
        object result,
        CancellationToken cancellationToken = default) =>
        WriteAsync(new { id, result }, cancellationToken);

    public ValueTask DisposeAsync()
    {
        TaskCompletionSource? disposalCompletion = null;
        Task disposeTask;
        lock (_lifecycleGate)
        {
            if (_disposeTask is null)
            {
                _disposed = true;
                disposalCompletion = new TaskCompletionSource(
                    TaskCreationOptions.RunContinuationsAsynchronously);
                _disposeTask = disposalCompletion.Task;
            }

            disposeTask = _disposeTask;
        }

        if (disposalCompletion is not null)
        {
            _ = CompleteDisposalAsync(disposalCompletion);
        }

        return new ValueTask(disposeTask);
    }

    private async Task CompleteDisposalAsync(TaskCompletionSource completion)
    {
        try
        {
            await DisposeCoreAsync().ConfigureAwait(false);
            completion.TrySetResult();
        }
        catch (Exception error)
        {
            completion.TrySetException(error);
        }
    }

    private async Task DisposeCoreAsync()
    {
        _shutdown.Cancel();
        foreach (var pending in _pending.Values)
        {
            pending.TrySetException(new ObjectDisposedException(nameof(JsonRpcConnection)));
        }

        _pending.Clear();
        try
        {
            await _transport.DisposeAsync().ConfigureAwait(false);
            await _readLoop.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            _shutdown.Dispose();
        }
    }

    private async Task WriteAsync(
        object message,
        CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(message);
        await _transport.WriteLineAsync(json, cancellationToken);
    }

    private async Task ReadLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var line in _transport.ReadLinesAsync(cancellationToken))
            {
                ProcessLine(line);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            foreach (var pending in _pending.Values)
            {
                pending.TrySetException(error);
            }
        }
    }

    private void ProcessLine(string line)
    {
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        var hasId = root.TryGetProperty("id", out var idElement);
        var hasMethod = root.TryGetProperty("method", out var methodElement);

        if (hasId && hasMethod)
        {
            var parameters = root.TryGetProperty("params", out var requestParams)
                ? requestParams.Clone()
                : JsonSerializer.SerializeToElement(new { });
            ServerRequestReceived?.Invoke(
                new JsonRpcServerRequest(
                    idElement.Clone(),
                    methodElement.GetString() ?? string.Empty,
                    parameters));
            return;
        }

        if (hasId && idElement.ValueKind == JsonValueKind.Number &&
            idElement.TryGetInt64(out var id) &&
            _pending.TryRemove(id, out var completion))
        {
            if (root.TryGetProperty("error", out var error))
            {
                var code = error.TryGetProperty("code", out var codeElement)
                    ? codeElement.GetInt32()
                    : -1;
                var message = error.TryGetProperty("message", out var messageElement)
                    ? messageElement.GetString() ?? "Codex 请求失败。"
                    : "Codex 请求失败。";
                var data = error.TryGetProperty("data", out var dataElement)
                    ? dataElement.Clone()
                    : (JsonElement?)null;
                completion.TrySetException(new JsonRpcException(code, message, data));
            }
            else
            {
                var result = root.TryGetProperty("result", out var resultElement)
                    ? resultElement.Clone()
                    : JsonSerializer.SerializeToElement(new { });
                completion.TrySetResult(result);
            }

            return;
        }

        if (hasMethod)
        {
            var parameters = root.TryGetProperty("params", out var notificationParams)
                ? notificationParams.Clone()
                : JsonSerializer.SerializeToElement(new { });
            NotificationReceived?.Invoke(
                new JsonRpcNotification(
                    methodElement.GetString() ?? string.Empty,
                    parameters));
        }
    }
}
