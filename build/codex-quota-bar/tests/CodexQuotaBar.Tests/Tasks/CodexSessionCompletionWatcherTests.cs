using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using CodexQuotaBar.App.Tasks;
using CodexQuotaBar.Core.Tasks;

namespace CodexQuotaBar.Tests.Tasks;

public sealed class CodexSessionCompletionWatcherTests
{
    [Fact]
    public async Task Watcher_starts_at_existing_file_end_and_only_emits_new_completions()
    {
        using var fixture = SessionFixture.WithExistingCompletion("old-turn");
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        await fixture.AppendCompletionAsync("new-turn");
        await fixture.WaitForAsync(() => received.Count == 1);

        Assert.Equal("new-turn", Assert.Single(received).TurnId);
    }

    [Fact]
    public async Task Watcher_deduplicates_turn_ids_across_reconciliation_reads()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        await fixture.AppendCompletionAsync("same-turn");
        await fixture.AppendCompletionAsync("same-turn");
        await fixture.WaitForAsync(() => received.Count == 1);

        Assert.Single(received);
    }

    [Fact]
    public async Task Watcher_reads_completions_from_a_newly_created_session_file()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        await fixture.CreateSessionAsync("nested/new-session.jsonl", "new-workspace", "new-turn");
        await fixture.WaitForAsync(() => received.Count == 1);

        var completion = Assert.Single(received);
        Assert.Equal("new-turn", completion.TurnId);
        Assert.Equal("new-workspace", completion.WorkspaceName);
    }

    [Fact]
    public async Task Watcher_skips_malformed_lines_and_emits_later_valid_completions()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        await fixture.AppendRawAsync("{not-json}\n");
        await fixture.AppendCompletionAsync("valid-turn");
        await fixture.WaitForAsync(() => received.Count == 1);

        Assert.Equal("valid-turn", Assert.Single(received).TurnId);
    }

    [Fact]
    public async Task Watcher_recovers_a_completion_when_reconciliation_observes_a_changed_file()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        var fileSystemWatcher = Assert.IsType<FileSystemWatcher>(typeof(CodexSessionCompletionWatcher)
            .GetField("_fileSystemWatcher", BindingFlags.Instance | BindingFlags.NonPublic)
            ?.GetValue(watcher));
        fileSystemWatcher.EnableRaisingEvents = false;
        await fixture.AppendCompletionAsync("reconciled-turn");
        await fixture.WaitForAsync(() => received.Count == 1, TimeSpan.FromSeconds(5));

        Assert.Equal("reconciled-turn", Assert.Single(received).TurnId);
    }

    [Fact]
    public async Task Watcher_allows_a_turn_id_to_be_emitted_after_the_bounded_deduplication_window()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        for (var index = 0; index <= 256; index++)
        {
            await fixture.AppendCompletionAsync($"turn-{index}");
        }

        await fixture.WaitForAsync(() => received.Count == 257);
        await fixture.AppendCompletionAsync("turn-0");
        await fixture.WaitForAsync(() => received.Count == 258);

        Assert.Equal("turn-0", received.Last().TurnId);
    }

    [Fact]
    public async Task Watcher_completes_disposal_started_by_a_task_completed_subscriber()
    {
        using var fixture = SessionFixture.Empty();
        var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var handlerExited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.TaskCompleted += (_, _) =>
        {
#pragma warning disable xUnit1031
            watcher.DisposeAsync().AsTask().GetAwaiter().GetResult();
#pragma warning restore xUnit1031
            handlerExited.TrySetResult();
        };

        await watcher.StartAsync();
        await fixture.AppendCompletionAsync("dispose-turn");

        await handlerExited.Task.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Watcher_recovers_a_completion_appended_during_startup_before_watcher_enable()
    {
        using var fixture = SessionFixture.Empty();
        using var startup = new StartupGate();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot, log: startup.Observe);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        var startTask = Task.Run(async () => await watcher.StartAsync());
        await startup.WaitForBaselineAsync();
        await fixture.AppendCompletionAsync("startup-turn");
        startup.Release();
        await startTask;
        await fixture.WaitForAsync(() => received.Count == 1);

        Assert.Equal("startup-turn", Assert.Single(received).TurnId);
    }

    [Fact]
    public async Task Watcher_retains_a_partial_session_metadata_line_until_completion_arrives()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        var metadata = SessionFixture.SessionMetadataLine("partial-workspace");
        var path = await fixture.CreateRawSessionAsync("partial.jsonl", metadata[..20]);
        await RunReconciliationAsync(watcher);
        Assert.Empty(received);

        await fixture.AppendRawAsync(path, metadata[20..] + Environment.NewLine + SessionFixture.CompletionLine("partial-turn"));
        await RunReconciliationAsync(watcher);
        await fixture.WaitForAsync(() => received.Count == 1);

        var completion = Assert.Single(received);
        Assert.Equal("partial-turn", completion.TurnId);
        Assert.Equal("partial-workspace", completion.WorkspaceName);
    }

    [Fact]
    public async Task Watcher_continues_startup_when_a_file_disappears_after_baseline_capture()
    {
        using var fixture = SessionFixture.Empty();
        using var startup = new StartupGate();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot, log: startup.Observe);

        var startTask = Task.Run(async () => await watcher.StartAsync());
        await startup.WaitForBaselineAsync();
        File.Delete(fixture.SessionPath);
        startup.Release();

        await startTask.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Watcher_serializes_an_event_scan_with_an_overlapping_reconciliation_scan()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);

        await watcher.StartAsync();
        await fixture.AppendCompletionAsync("overlap-first");
        await fixture.AppendCompletionAsync("overlap-second");

        QueuePath(watcher, fixture.SessionPath);
        await Task.WhenAll(RunReconciliationAsync(watcher), RunReconciliationAsync(watcher));
        await fixture.WaitForAsync(() => received.Count == 2);

        Assert.Equal(["overlap-first", "overlap-second"], received.Select(completion => completion.TurnId).Order());
    }

    [Fact]
    public async Task Watcher_cleans_up_an_enabled_watcher_after_start_cancellation_and_can_retry()
    {
        using var fixture = SessionFixture.Empty();
        using var enabled = new WatcherEnabledGate();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot, log: enabled.Observe);
        using var cancellation = new CancellationTokenSource();

        var startTask = Task.Run(async () => await watcher.StartAsync(cancellation.Token));
        await enabled.WaitForEnableAsync();
        var failedWatcher = GetFileSystemWatcher(watcher);
        cancellation.Cancel();
        enabled.Release();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => startTask);
        Assert.Null(GetFileSystemWatcherOrNull(watcher));
        Assert.Throws<ObjectDisposedException>(() => failedWatcher.EnableRaisingEvents = true);

        await watcher.StartAsync();
        var received = new ConcurrentQueue<CodexTaskCompletion>();
        watcher.TaskCompleted += (_, completion) => received.Enqueue(completion);
        await fixture.AppendCompletionAsync("retry-turn");
        await fixture.WaitForAsync(() => received.Count == 1);

        Assert.Equal("retry-turn", Assert.Single(received).TurnId);
    }

    [Fact]
    public async Task Watcher_normal_disposal_waits_for_an_active_subscriber()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        using var callbackRelease = new ManualResetEventSlim(false);
        var callbackEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.TaskCompleted += (_, _) =>
        {
            callbackEntered.TrySetResult();
#pragma warning disable xUnit1031
            callbackRelease.Wait();
#pragma warning restore xUnit1031
        };

        await watcher.StartAsync();
        await fixture.AppendCompletionAsync("blocking-turn");
        await callbackEntered.Task.WaitAsync(TimeSpan.FromSeconds(1));

        var disposeTask = watcher.DisposeAsync().AsTask();
        await Task.Delay(100);
        Assert.False(disposeTask.IsCompleted);

        callbackRelease.Set();
        await disposeTask.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Watcher_stops_later_notifications_when_a_callback_disposes_it()
    {
        using var fixture = SessionFixture.Empty();
        var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        var received = new ConcurrentQueue<string>();
        watcher.TaskCompleted += (_, completion) =>
        {
            received.Enqueue(completion.TurnId);
            if (completion.TurnId == "first-turn")
            {
#pragma warning disable xUnit1031
                watcher.DisposeAsync().AsTask().GetAwaiter().GetResult();
#pragma warning restore xUnit1031
            }
        };

        await watcher.StartAsync();
        await fixture.AppendRawAsync(SessionFixture.CompletionLine("first-turn") + SessionFixture.CompletionLine("second-turn"));
        await fixture.WaitForAsync(() => received.Count >= 1);
        await Task.Delay(100);

        Assert.Equal(["first-turn"], received);
    }

    [Fact]
    public async Task Watcher_waits_for_active_work_when_a_callback_launches_disposal_asynchronously()
    {
        using var fixture = SessionFixture.Empty();
        await using var watcher = new CodexSessionCompletionWatcher(fixture.SessionsRoot);
        using var callbackRelease = new ManualResetEventSlim(false);
        var launchDisposal = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var subscriberEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var disposalStarted = new TaskCompletionSource<Task>(TaskCreationOptions.RunContinuationsAsynchronously);

        watcher.TaskCompleted += (_, _) =>
        {
            _ = Task.Run(async () =>
            {
                await launchDisposal.Task;
                var disposeTask = watcher.DisposeAsync().AsTask();
                disposalStarted.TrySetResult(disposeTask);
                await disposeTask;
            });
        };
        watcher.TaskCompleted += (_, _) =>
        {
            subscriberEntered.TrySetResult();
#pragma warning disable xUnit1031
            callbackRelease.Wait();
#pragma warning restore xUnit1031
        };

        await watcher.StartAsync();
        await fixture.AppendCompletionAsync("async-dispose-turn");
        await subscriberEntered.Task.WaitAsync(TimeSpan.FromSeconds(1));
        launchDisposal.TrySetResult();
        var disposeTask = await disposalStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));

        try
        {
            await Task.Delay(100);
            Assert.False(disposeTask.IsCompleted);
        }
        finally
        {
            callbackRelease.Set();
        }

        await disposeTask.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Watcher_waits_for_active_work_when_another_watchers_callback_disposes_it()
    {
        using var firstFixture = SessionFixture.Empty();
        using var secondFixture = SessionFixture.Empty();
        await using var firstWatcher = new CodexSessionCompletionWatcher(firstFixture.SessionsRoot);
        await using var secondWatcher = new CodexSessionCompletionWatcher(secondFixture.SessionsRoot);
        using var secondCallbackRelease = new ManualResetEventSlim(false);
        var secondCallbackEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var disposalStarted = new TaskCompletionSource<Task>(TaskCreationOptions.RunContinuationsAsynchronously);

        secondWatcher.TaskCompleted += (_, _) =>
        {
            secondCallbackEntered.TrySetResult();
#pragma warning disable xUnit1031
            secondCallbackRelease.Wait();
#pragma warning restore xUnit1031
        };
        firstWatcher.TaskCompleted += (_, _) =>
        {
            var disposeTask = secondWatcher.DisposeAsync().AsTask();
            disposalStarted.TrySetResult(disposeTask);
#pragma warning disable xUnit1031
            disposeTask.GetAwaiter().GetResult();
#pragma warning restore xUnit1031
        };

        await secondWatcher.StartAsync();
        await secondFixture.AppendCompletionAsync("second-active-turn");
        await secondCallbackEntered.Task.WaitAsync(TimeSpan.FromSeconds(1));
        await firstWatcher.StartAsync();
        await firstFixture.AppendCompletionAsync("first-dispose-turn");
        var disposeTask = await disposalStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));

        try
        {
            await Task.Delay(100);
            Assert.False(disposeTask.IsCompleted);
        }
        finally
        {
            secondCallbackRelease.Set();
        }

        await disposeTask.WaitAsync(TimeSpan.FromSeconds(1));
    }

    private static Task RunReconciliationAsync(CodexSessionCompletionWatcher watcher)
    {
        var method = Assert.IsAssignableFrom<MethodInfo>(typeof(CodexSessionCompletionWatcher).GetMethod(
            "ReconcileOnceAsync",
            BindingFlags.Instance | BindingFlags.NonPublic));
        return Assert.IsAssignableFrom<Task>(method.Invoke(watcher, [CancellationToken.None]));
    }

    private static void QueuePath(CodexSessionCompletionWatcher watcher, string path)
    {
        var method = Assert.IsAssignableFrom<MethodInfo>(typeof(CodexSessionCompletionWatcher).GetMethod(
            "QueuePath",
            BindingFlags.Instance | BindingFlags.NonPublic));
        method.Invoke(watcher, [path]);
    }

    private static FileSystemWatcher GetFileSystemWatcher(CodexSessionCompletionWatcher watcher) =>
        Assert.IsType<FileSystemWatcher>(GetFileSystemWatcherOrNull(watcher));

    private static FileSystemWatcher? GetFileSystemWatcherOrNull(CodexSessionCompletionWatcher watcher) =>
        typeof(CodexSessionCompletionWatcher)
            .GetField("_fileSystemWatcher", BindingFlags.Instance | BindingFlags.NonPublic)
            ?.GetValue(watcher) as FileSystemWatcher;

    private sealed class SessionFixture : IDisposable
    {
        private const string SessionFileName = "session.jsonl";

        private SessionFixture()
        {
            SessionsRoot = Path.Combine(Path.GetTempPath(), $"quota-sessions-{Guid.NewGuid():N}");
            Directory.CreateDirectory(SessionsRoot);
            SessionPath = Path.Combine(SessionsRoot, SessionFileName);
        }

        public string SessionsRoot { get; }

        public string SessionPath { get; }

        public static SessionFixture Empty()
        {
            var fixture = new SessionFixture();
            File.WriteAllText(fixture.SessionPath, SessionMetadataLine("existing-workspace") + Environment.NewLine);
            return fixture;
        }

        public static SessionFixture WithExistingCompletion(string turnId)
        {
            var fixture = Empty();
            File.AppendAllText(fixture.SessionPath, Completion(turnId) + Environment.NewLine);
            return fixture;
        }

        public Task AppendCompletionAsync(string turnId) => AppendRawAsync(Completion(turnId) + Environment.NewLine);

        public Task AppendCompletionAsync(string path, string turnId) => AppendRawAsync(path, CompletionLine(turnId));

        public Task AppendRawAsync(string contents) => File.AppendAllTextAsync(SessionPath, contents);

        public Task AppendRawAsync(string path, string contents) => File.AppendAllTextAsync(path, contents);

        public async Task<string> CreateRawSessionAsync(string relativePath, string contents)
        {
            var path = Path.Combine(SessionsRoot, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, contents);
            return path;
        }

        public async Task CreateSessionAsync(string relativePath, string workspaceName, string turnId)
        {
            var path = Path.Combine(SessionsRoot, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, SessionMetadataLine(workspaceName) + Environment.NewLine + Completion(turnId) + Environment.NewLine);
        }

        public async Task WaitForAsync(Func<bool> condition, TimeSpan? timeout = null)
        {
            var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(3));
            while (!condition())
            {
                if (DateTime.UtcNow >= deadline)
                {
                    throw new TimeoutException("The watcher did not emit the expected completion.");
                }

                await Task.Delay(25);
            }
        }

        public void Dispose()
        {
            if (Directory.Exists(SessionsRoot))
            {
                Directory.Delete(SessionsRoot, recursive: true);
            }
        }

        public static string SessionMetadataLine(string workspaceName) => JsonSerializer.Serialize(new
        {
            type = "session_meta",
            payload = new { cwd = Path.Combine(Path.GetTempPath(), workspaceName) },
        });

        public static string CompletionLine(string turnId) => Completion(turnId) + Environment.NewLine;

        private static string Completion(string turnId) => JsonSerializer.Serialize(new
        {
            timestamp = "2026-07-18T07:05:12.102Z",
            type = "event_msg",
            payload = new
            {
                type = "task_complete",
                turn_id = turnId,
                last_agent_message = "Completed task",
                duration_ms = 100,
            },
        });
    }

    private sealed class StartupGate : IDisposable
    {
        private const string BaselineCapturedMessage = "Codex session watcher baseline captured.";
        private readonly TaskCompletionSource _baselineCaptured = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly ManualResetEventSlim _release = new(false);

        public void Observe(string message)
        {
            if (message != BaselineCapturedMessage)
            {
                return;
            }

            _baselineCaptured.TrySetResult();
            _release.Wait();
        }

        public Task WaitForBaselineAsync() => _baselineCaptured.Task.WaitAsync(TimeSpan.FromSeconds(1));

        public void Release() => _release.Set();

        public void Dispose()
        {
            _release.Set();
            _release.Dispose();
        }
    }

    private sealed class WatcherEnabledGate : IDisposable
    {
        private const string WatcherEnabledMessage = "Codex session watcher enabled.";
        private readonly TaskCompletionSource _enabled = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly ManualResetEventSlim _release = new(false);

        public void Observe(string message)
        {
            if (message != WatcherEnabledMessage)
            {
                return;
            }

            _enabled.TrySetResult();
            _release.Wait();
        }

        public Task WaitForEnableAsync() => _enabled.Task.WaitAsync(TimeSpan.FromSeconds(1));

        public void Release() => _release.Set();

        public void Dispose()
        {
            _release.Set();
            _release.Dispose();
        }
    }
}
