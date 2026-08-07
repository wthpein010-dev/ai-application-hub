using System.Collections.Concurrent;
using System.Text.Json;

namespace CodexQuotaBar.Core.Protocol;

public sealed record RpcNotification(string Method, JsonElement Params);

public sealed class JsonLineRpcClient : IAsyncDisposable
{
    private readonly TextReader _input;
    private readonly TextWriter _output;
    private readonly Action<string>? _diagnostic;
    private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly CancellationTokenSource _lifetime = new();
    private Task? _readLoop;
    private long _nextId;

    public JsonLineRpcClient(TextReader input, TextWriter output, Action<string>? diagnostic = null)
    {
        _input = input ?? throw new ArgumentNullException(nameof(input));
        _output = output ?? throw new ArgumentNullException(nameof(output));
        _diagnostic = diagnostic;
    }

    public event EventHandler<RpcNotification>? NotificationReceived;

    public void Start()
    {
        ObjectDisposedException.ThrowIf(_lifetime.IsCancellationRequested, this);
        _readLoop ??= ReadLoopAsync(_lifetime.Token);
    }

    public async Task<JsonElement> SendRequestAsync(
        string method,
        object? parameters,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(method);
        Start();

        var id = Interlocked.Increment(ref _nextId);
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_pending.TryAdd(id, completion))
        {
            throw new InvalidOperationException($"Duplicate JSON-RPC request id {id}.");
        }

        try
        {
            await WriteAsync(new { id, method, @params = parameters }, cancellationToken).ConfigureAwait(false);
            return await completion.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _pending.TryRemove(id, out _);
        }
    }

    public Task SendNotificationAsync(
        string method,
        object? parameters,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(method);
        Start();
        return WriteAsync(new { method, @params = parameters }, cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (!_lifetime.IsCancellationRequested)
        {
            _lifetime.Cancel();
        }

        if (_readLoop is not null)
        {
            try
            {
                await _readLoop.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
            }
        }

        FailPending(new ObjectDisposedException(nameof(JsonLineRpcClient)));
        _writeLock.Dispose();
        _lifetime.Dispose();
    }

    private async Task WriteAsync(object message, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(message, RateLimitJson.Options);
        await _writeLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await _output.WriteLineAsync(json.AsMemory(), cancellationToken).ConfigureAwait(false);
            await _output.FlushAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    private async Task ReadLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var line = await _input.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                if (line is null)
                {
                    throw new EndOfStreamException("Codex app server closed the JSONL stream.");
                }

                ProcessLine(line);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            _diagnostic?.Invoke($"JSONL read loop stopped: {exception.Message}");
            FailPending(exception);
        }
    }

    private void ProcessLine(string line)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(line);
        }
        catch (JsonException exception)
        {
            _diagnostic?.Invoke($"Invalid JSON from Codex app server: {exception.Message}");
            return;
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.TryGetProperty("id", out var idElement) && idElement.TryGetInt64(out var id))
            {
                CompleteRequest(id, root);
                return;
            }

            if (root.TryGetProperty("method", out var methodElement))
            {
                var method = methodElement.GetString();
                if (!string.IsNullOrWhiteSpace(method))
                {
                    var parameters = root.TryGetProperty("params", out var paramsElement)
                        ? paramsElement.Clone()
                        : EmptyObject();
                    NotificationReceived?.Invoke(this, new RpcNotification(method, parameters));
                }
            }
        }
    }

    private void CompleteRequest(long id, JsonElement root)
    {
        if (!_pending.TryGetValue(id, out var completion))
        {
            _diagnostic?.Invoke($"Response received for unknown request id {id}.");
            return;
        }

        if (root.TryGetProperty("result", out var result))
        {
            completion.TrySetResult(result.Clone());
            return;
        }

        var message = root.TryGetProperty("error", out var error)
            ? error.ToString()
            : "JSON-RPC response did not contain result or error.";
        completion.TrySetException(new InvalidOperationException(message));
    }

    private void FailPending(Exception exception)
    {
        foreach (var completion in _pending.Values)
        {
            completion.TrySetException(exception);
        }
    }

    private static JsonElement EmptyObject()
    {
        using var document = JsonDocument.Parse("{}");
        return document.RootElement.Clone();
    }
}
