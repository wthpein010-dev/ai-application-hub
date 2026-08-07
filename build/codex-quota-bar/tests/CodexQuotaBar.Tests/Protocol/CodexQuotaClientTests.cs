using System.Collections.Concurrent;
using System.Text.Json;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Quota;

namespace CodexQuotaBar.Tests.Protocol;

public sealed class CodexQuotaClientTests
{
    [Fact]
    public async Task Process_factory_reports_a_missing_executable_clearly()
    {
        var factory = new CodexProcessSessionFactory();

        var error = await Assert.ThrowsAsync<FileNotFoundException>(() =>
            factory.StartAsync(Path.Combine(Path.GetTempPath(), $"missing-codex-{Guid.NewGuid():N}"), CancellationToken.None));

        Assert.Contains("Codex executable", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Start_initializes_session_and_publishes_the_first_snapshot()
    {
        var session = new ScriptedSession();
        var client = CreateClient(new ScriptedFactory(session));
        var received = new TaskCompletionSource<QuotaSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
        client.SnapshotUpdated += (_, snapshot) => received.TrySetResult(snapshot);

        await client.StartAsync();
        var snapshot = await received.Task.WaitAsync(TimeSpan.FromSeconds(2));

        Assert.Equal(67, Assert.Single(snapshot.Buckets).RemainingPercent);
        Assert.Equal(
            ["request:initialize", "notification:initialized", "request:account/rateLimits/read"],
            session.Messages.Take(3));
        Assert.Equal(CodexConnectionState.Live, client.ConnectionState);
        await client.DisposeAsync();
    }

    [Fact]
    public async Task Rate_limit_notification_triggers_a_fresh_read()
    {
        var session = new ScriptedSession();
        var client = CreateClient(new ScriptedFactory(session));
        await client.StartAsync();
        await WaitUntilAsync(() => session.QuotaReadCount == 1);

        session.Publish("account/rateLimits/updated", """{"rateLimits":{"limitId":"codex"}}""");

        await WaitUntilAsync(() => session.QuotaReadCount == 2);
        await client.DisposeAsync();
    }

    [Fact]
    public async Task Concurrent_refreshes_are_serialized()
    {
        var session = new ScriptedSession();
        var client = CreateClient(new ScriptedFactory(session));
        await client.StartAsync();
        await WaitUntilAsync(() => session.QuotaReadCount == 1);
        session.BlockQuotaReads = true;

        var first = client.RefreshAsync();
        await session.QuotaReadStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var second = client.RefreshAsync();
        await Task.Delay(30);
        session.ReleaseQuotaReads.TrySetResult();
        await Task.WhenAll(first, second);

        Assert.Equal(1, session.MaximumConcurrentQuotaReads);
        await client.DisposeAsync();
    }

    [Fact]
    public async Task Connection_failures_retry_with_bounded_backoff()
    {
        var session = new ScriptedSession();
        var factory = new ScriptedFactory(
            new IOException("first"),
            new IOException("second"),
            new IOException("third"),
            session);
        var delays = new ConcurrentQueue<TimeSpan>();
        var client = CreateClient(factory, (delay, token) =>
        {
            if (delay <= TimeSpan.FromSeconds(30))
            {
                delays.Enqueue(delay);
                return Task.CompletedTask;
            }

            return Task.Delay(Timeout.InfiniteTimeSpan, token);
        });

        await client.StartAsync();
        await WaitUntilAsync(() => client.ConnectionState == CodexConnectionState.Live);

        Assert.Equal([TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(4), TimeSpan.FromSeconds(8)], delays);
        await client.DisposeAsync();
    }

    private static CodexQuotaClient CreateClient(
        ICodexSessionFactory factory,
        Func<TimeSpan, CancellationToken, Task>? delay = null) =>
        new(
            factory,
            "codex",
            TimeProvider.System,
            delay ?? ((_, token) => Task.Delay(Timeout.InfiniteTimeSpan, token)),
            TimeSpan.FromHours(1));

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var timeout = DateTime.UtcNow.AddSeconds(2);
        while (!condition() && DateTime.UtcNow < timeout)
        {
            await Task.Delay(10);
        }

        Assert.True(condition(), "Condition was not reached before timeout.");
    }

    private sealed class ScriptedFactory(params object[] outcomes) : ICodexSessionFactory
    {
        private readonly Queue<object> _outcomes = new(outcomes);

        public Task<ICodexSession> StartAsync(string executablePath, CancellationToken cancellationToken)
        {
            var outcome = _outcomes.Dequeue();
            return outcome switch
            {
                Exception exception => Task.FromException<ICodexSession>(exception),
                ICodexSession session => Task.FromResult(session),
                _ => throw new InvalidOperationException("Unsupported scripted outcome."),
            };
        }
    }

    private sealed class ScriptedSession : ICodexSession
    {
        private int _activeQuotaReads;
        private int _maximumConcurrentQuotaReads;
        private int _quotaReadCount;

        public ConcurrentQueue<string> Messages { get; } = new();
        public bool BlockQuotaReads { get; set; }
        public TaskCompletionSource QuotaReadStarted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource ReleaseQuotaReads { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int QuotaReadCount => Volatile.Read(ref _quotaReadCount);
        public int MaximumConcurrentQuotaReads => Volatile.Read(ref _maximumConcurrentQuotaReads);
        public Task Completion => Task.Delay(Timeout.InfiniteTimeSpan);

        public event EventHandler<RpcNotification>? NotificationReceived;

        public async Task<JsonElement> SendRequestAsync(
            string method,
            object? parameters,
            CancellationToken cancellationToken = default)
        {
            Messages.Enqueue($"request:{method}");
            if (method == "initialize")
            {
                return Element("{}");
            }

            if (method != "account/rateLimits/read")
            {
                throw new InvalidOperationException($"Unexpected request {method}.");
            }

            Interlocked.Increment(ref _quotaReadCount);
            var active = Interlocked.Increment(ref _activeQuotaReads);
            UpdateMaximum(active);
            try
            {
                if (BlockQuotaReads)
                {
                    QuotaReadStarted.TrySetResult();
                    await ReleaseQuotaReads.Task.WaitAsync(cancellationToken);
                }

                return Element("""
                    {
                      "rateLimits": {
                        "limitId": "codex",
                        "primary": { "usedPercent": 33, "resetsAt": 1784681394, "windowDurationMins": 10080 }
                      },
                      "rateLimitResetCredits": { "availableCount": 5 }
                    }
                    """);
            }
            finally
            {
                Interlocked.Decrement(ref _activeQuotaReads);
            }
        }

        public Task SendNotificationAsync(
            string method,
            object? parameters,
            CancellationToken cancellationToken = default)
        {
            Messages.Enqueue($"notification:{method}");
            return Task.CompletedTask;
        }

        public void Publish(string method, string parameters) =>
            NotificationReceived?.Invoke(this, new RpcNotification(method, Element(parameters)));

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;

        private void UpdateMaximum(int active)
        {
            int current;
            do
            {
                current = _maximumConcurrentQuotaReads;
                if (active <= current)
                {
                    return;
                }
            }
            while (Interlocked.CompareExchange(ref _maximumConcurrentQuotaReads, active, current) != current);
        }

        private static JsonElement Element(string json) => JsonDocument.Parse(json).RootElement.Clone();
    }
}
