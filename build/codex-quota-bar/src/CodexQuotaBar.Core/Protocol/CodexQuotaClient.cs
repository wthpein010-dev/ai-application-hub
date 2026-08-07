using System.Text.Json;
using CodexQuotaBar.Core.Quota;

namespace CodexQuotaBar.Core.Protocol;

public enum CodexConnectionState
{
    Stopped,
    Connecting,
    Live,
    Reconnecting,
    CodexMissing,
    LoggedOut,
}

public sealed class CodexQuotaClient : IQuotaSource
{
    private static readonly TimeSpan[] ReconnectDelays =
    [
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(4),
        TimeSpan.FromSeconds(8),
        TimeSpan.FromSeconds(16),
        TimeSpan.FromSeconds(30),
    ];

    private readonly ICodexSessionFactory _sessionFactory;
    private readonly string _executablePath;
    private readonly TimeProvider _timeProvider;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;
    private readonly TimeSpan _pollInterval;
    private readonly Action<string>? _diagnostic;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private readonly CancellationTokenSource _lifetime = new();
    private readonly object _sessionGate = new();
    private ICodexSession? _activeSession;
    private Task? _runTask;
    private int _disposed;

    public CodexQuotaClient(
        ICodexSessionFactory sessionFactory,
        string executablePath,
        TimeProvider? timeProvider = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null,
        TimeSpan? pollInterval = null,
        Action<string>? diagnostic = null)
    {
        _sessionFactory = sessionFactory ?? throw new ArgumentNullException(nameof(sessionFactory));
        _executablePath = string.IsNullOrWhiteSpace(executablePath)
            ? throw new ArgumentException("Codex executable path is required.", nameof(executablePath))
            : executablePath;
        _timeProvider = timeProvider ?? TimeProvider.System;
        _delay = delay ?? Task.Delay;
        _pollInterval = pollInterval ?? TimeSpan.FromSeconds(30);
        _diagnostic = diagnostic;
    }

    public event EventHandler<QuotaSnapshot>? SnapshotUpdated;
    public event EventHandler? ConnectionStateChanged;

    public CodexConnectionState ConnectionState { get; private set; } = CodexConnectionState.Stopped;
    public QuotaSnapshot? LastSnapshot { get; private set; }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
        cancellationToken.ThrowIfCancellationRequested();
        _runTask ??= RunAsync(_lifetime.Token);
        return Task.CompletedTask;
    }

    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        ICodexSession? session;
        lock (_sessionGate)
        {
            session = _activeSession;
        }

        if (session is not null)
        {
            await RefreshWithSessionAsync(session, cancellationToken).ConfigureAwait(false);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
        {
            return;
        }

        _lifetime.Cancel();
        ICodexSession? session;
        lock (_sessionGate)
        {
            session = _activeSession;
        }

        if (session is not null)
        {
            await session.DisposeAsync().ConfigureAwait(false);
        }

        if (_runTask is not null)
        {
            try
            {
                await _runTask.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
            }
        }

        SetConnectionState(CodexConnectionState.Stopped);
        _refreshLock.Dispose();
        _lifetime.Dispose();
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var reconnectAttempt = 0;
        while (!cancellationToken.IsCancellationRequested)
        {
            SetConnectionState(reconnectAttempt == 0
                ? CodexConnectionState.Connecting
                : CodexConnectionState.Reconnecting);

            ICodexSession? session = null;
            try
            {
                session = await _sessionFactory.StartAsync(_executablePath, cancellationToken).ConfigureAwait(false);
                session.NotificationReceived += OnNotificationReceived;
                lock (_sessionGate)
                {
                    _activeSession = session;
                }

                await InitializeAsync(session, cancellationToken).ConfigureAwait(false);
                await RefreshWithSessionAsync(session, cancellationToken).ConfigureAwait(false);
                reconnectAttempt = 0;
                await PollUntilDisconnectedAsync(session, cancellationToken).ConfigureAwait(false);
                throw new IOException("Codex app server session ended.");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _diagnostic?.Invoke($"Codex connection failed: {exception.Message}");
                SetConnectionState(exception is FileNotFoundException
                    ? CodexConnectionState.CodexMissing
                    : IsAuthenticationFailure(exception)
                        ? CodexConnectionState.LoggedOut
                        : CodexConnectionState.Reconnecting);
                var delay = ReconnectDelays[Math.Min(reconnectAttempt, ReconnectDelays.Length - 1)];
                reconnectAttempt++;
                await _delay(delay, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                if (session is not null)
                {
                    session.NotificationReceived -= OnNotificationReceived;
                    lock (_sessionGate)
                    {
                        if (ReferenceEquals(_activeSession, session))
                        {
                            _activeSession = null;
                        }
                    }

                    await session.DisposeAsync().ConfigureAwait(false);
                }
            }
        }
    }

    private async Task InitializeAsync(ICodexSession session, CancellationToken cancellationToken)
    {
        await session.SendRequestAsync(
            "initialize",
            new
            {
                clientInfo = new
                {
                    name = "codex-quota-bar",
                    title = "Codex Quota Bar",
                    version = "0.1.0",
                },
                capabilities = new { experimentalApi = true },
            },
            cancellationToken).ConfigureAwait(false);
        await session.SendNotificationAsync("initialized", new { }, cancellationToken).ConfigureAwait(false);
    }

    private async Task PollUntilDisconnectedAsync(ICodexSession session, CancellationToken cancellationToken)
    {
        var completion = session.Completion;
        while (!cancellationToken.IsCancellationRequested)
        {
            var pollDelay = _delay(_pollInterval, cancellationToken);
            var completed = await Task.WhenAny(completion, pollDelay).ConfigureAwait(false);
            if (ReferenceEquals(completed, completion))
            {
                await completion.ConfigureAwait(false);
                return;
            }

            await pollDelay.ConfigureAwait(false);
            await RefreshWithSessionAsync(session, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task RefreshWithSessionAsync(ICodexSession session, CancellationToken cancellationToken)
    {
        await _refreshLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var resultElement = await session.SendRequestAsync(
                "account/rateLimits/read",
                null,
                cancellationToken).ConfigureAwait(false);
            var result = resultElement.Deserialize<GetAccountRateLimitsResult>(RateLimitJson.Options)
                ?? throw new InvalidDataException("Codex returned an empty rate-limit result.");
            var snapshot = QuotaProjector.Project(result, _timeProvider.GetUtcNow());
            LastSnapshot = snapshot;
            SetConnectionState(CodexConnectionState.Live);
            SnapshotUpdated?.Invoke(this, snapshot);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private void OnNotificationReceived(object? sender, RpcNotification notification)
    {
        if (notification.Method == "account/rateLimits/updated")
        {
            _ = RefreshAfterNotificationAsync();
        }
    }

    private async Task RefreshAfterNotificationAsync()
    {
        try
        {
            await RefreshAsync(_lifetime.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            _diagnostic?.Invoke($"Quota refresh after notification failed: {exception.Message}");
        }
    }

    private void SetConnectionState(CodexConnectionState state)
    {
        if (ConnectionState == state)
        {
            return;
        }

        ConnectionState = state;
        ConnectionStateChanged?.Invoke(this, EventArgs.Empty);
    }

    private static bool IsAuthenticationFailure(Exception exception) =>
        exception.Message.Contains("login", StringComparison.OrdinalIgnoreCase)
        || exception.Message.Contains("auth", StringComparison.OrdinalIgnoreCase)
        || exception.Message.Contains("account", StringComparison.OrdinalIgnoreCase);
}
