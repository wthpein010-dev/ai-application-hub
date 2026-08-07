using CodexQuotaBar.Core.Platform;
using CodexQuotaBar.Core.Pets;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Quota;
using CodexQuotaBar.Core.Settings;
using CodexQuotaBar.Core.Tasks;
using CodexQuotaBar.Core.ViewModels;
using System.ComponentModel;

namespace CodexQuotaBar.Tests.ViewModels;

public sealed class MainWindowViewModelTests
{
    [Fact]
    public async Task Initialization_applies_observable_state_through_the_dispatcher()
    {
        var dispatchCount = 0;
        using var context = new TestContext(action =>
        {
            dispatchCount++;
            action();
        });

        await context.ViewModel.InitializeAsync();

        Assert.Equal(1, dispatchCount);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Initialization_reapplies_the_saved_launch_at_login_preference(
        bool savedPreference,
        bool platformState)
    {
        using var context = new TestContext(platformLaunchAtLogin: platformState);
        await context.Store.SaveAsync(AppSettings.Default with { LaunchAtLogin = savedPreference });

        await context.ViewModel.InitializeAsync();

        Assert.Equal(1, context.Platform.SetLaunchAtLoginCount);
        Assert.Equal(savedPreference, context.Platform.LaunchAtLogin);
        Assert.Equal(savedPreference, context.ViewModel.LaunchAtLogin);
    }

    [Fact]
    public async Task Snapshot_populates_stable_bucket_rows_and_reset_credits()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();

        context.Source.Emit(Snapshot(context.Clock.GetUtcNow().AddHours(5)));

        var primary = Assert.Single(context.ViewModel.Buckets);
        Assert.Equal("Codex", primary.DisplayName);
        Assert.Equal(67, primary.RemainingPercent);
        Assert.Equal(QuotaTone.Healthy, primary.Tone);
        Assert.Equal("5小时后重置", primary.ResetText);
        Assert.Equal("重置机会 5", context.ViewModel.ResetCreditsText);
    }

    [Fact]
    public async Task Additional_buckets_exclude_the_primary_hero_bucket()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();
        var now = context.Clock.GetUtcNow();
        context.Source.Emit(new QuotaSnapshot(
            [
                new QuotaBucket("codex", "Codex", 67, QuotaTone.Healthy, QuotaWindowKind.Primary, now.AddDays(5), null),
                new QuotaBucket("spark", "Spark", 100, QuotaTone.Healthy, QuotaWindowKind.Primary, now.AddDays(6), null),
            ],
            5,
            now));

        var additional = Assert.Single(context.ViewModel.AdditionalBuckets);
        Assert.Equal("Spark", additional.DisplayName);
    }

    [Theory]
    [InlineData(CodexConnectionState.Connecting, "正在连接")]
    [InlineData(CodexConnectionState.Live, "刚刚更新")]
    [InlineData(CodexConnectionState.Reconnecting, "正在重连")]
    [InlineData(CodexConnectionState.CodexMissing, "未找到 Codex")]
    [InlineData(CodexConnectionState.LoggedOut, "请先登录 Codex")]
    public async Task Connection_state_has_a_clear_visible_label(CodexConnectionState state, string expected)
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();

        context.Source.SetState(state);

        Assert.Equal(expected, context.ViewModel.ConnectionLabel);
        Assert.Equal(state != CodexConnectionState.Live, context.ViewModel.IsOffline);
    }

    [Fact]
    public async Task Collapse_is_manual_and_is_persisted()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();

        await context.ViewModel.ToggleCollapsedAsync();

        Assert.True(context.ViewModel.IsCollapsed);
        Assert.True((await context.Store.LoadAsync()).IsCollapsed);
    }

    [Fact]
    public async Task Close_hides_show_restores_and_quit_requests_shutdown()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();

        context.ViewModel.Hide();
        Assert.False(context.ViewModel.IsVisible);
        context.ViewModel.Show();
        Assert.True(context.ViewModel.IsVisible);
        context.ViewModel.RequestQuit();

        Assert.True(context.QuitRequested);
    }

    [Fact]
    public async Task Countdown_updates_from_the_clock_without_a_quota_read()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();
        context.Source.Emit(Snapshot(context.Clock.GetUtcNow().AddHours(2)));
        Assert.Equal("2小时后重置", context.ViewModel.Buckets[0].ResetText);

        context.Clock.UtcNow = context.Clock.UtcNow.AddHours(1);
        context.ViewModel.RefreshCountdowns();

        Assert.Equal("1小时后重置", context.ViewModel.Buckets[0].ResetText);
        Assert.Equal(0, context.Source.RefreshCount);
    }

    [Fact]
    public async Task Pet_toggle_is_available_only_after_provider_resolves_an_asset()
    {
        using var context = new TestContext(
            pet: new PetAsset(
                "fireball",
                "Fireball",
                [1, 2, 3],
                PetAssetFormat.CodexWebpAtlas,
                PetAssetSource.Codex));

        await context.ViewModel.InitializeAsync();
        await context.ViewModel.TogglePetAsync();

        Assert.True(context.ViewModel.PetAvailable);
        Assert.True(context.ViewModel.PetEnabled);
        Assert.Equal("fireball", context.ViewModel.SelectedPet?.Id);
        Assert.True((await context.Store.LoadAsync()).PetEnabled);
    }

    [Fact]
    public async Task Disabled_setting_keeps_the_bundled_pet_available_but_hidden()
    {
        using var context = new TestContext(pet: BundledPet);

        await context.ViewModel.InitializeAsync();

        Assert.True(context.ViewModel.PetAvailable);
        Assert.False(context.ViewModel.PetEnabled);
        Assert.Same(BundledPet, context.ViewModel.SelectedPet);
    }

    [Fact]
    public async Task Reenabling_the_pet_recalculates_codex_first_preference()
    {
        using var context = new TestContext(pet: BundledPet);
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        Assert.Equal(1, context.PetProvider.FindCount);

        await context.ViewModel.TogglePetAsync();

        Assert.False(context.ViewModel.PetEnabled);
        Assert.Equal(1, context.PetProvider.FindCount);
        context.PetProvider.Next = Pet;

        await context.ViewModel.TogglePetAsync();

        Assert.True(context.ViewModel.PetEnabled);
        Assert.Same(Pet, context.ViewModel.SelectedPet);
        Assert.Equal(2, context.PetProvider.FindCount);
        Assert.True((await context.Store.LoadAsync()).PetEnabled);
    }

    [Fact]
    public async Task Reenable_failure_uses_quota_only_mode_and_persists_disabled_setting()
    {
        using var context = new TestContext(pet: BundledPet);
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        await context.ViewModel.TogglePetAsync();
        context.PetProvider.Next = null;

        await context.ViewModel.TogglePetAsync();

        Assert.False(context.ViewModel.PetAvailable);
        Assert.False(context.ViewModel.PetEnabled);
        Assert.Null(context.ViewModel.SelectedPet);
        Assert.False((await context.Store.LoadAsync()).PetEnabled);
    }

    [Fact]
    public async Task Pet_provider_rethrows_requested_cancellation_during_startup()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        using var context = new TestContext(
            petException: new OperationCanceledException(cancellation.Token));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => context.ViewModel.InitializeAsync(cancellation.Token));
    }

    [Fact]
    public async Task Pet_provider_failure_does_not_prevent_quota_source_start()
    {
        using var context = new TestContext(petException: new InvalidOperationException("pet lookup failed"));

        await context.ViewModel.InitializeAsync();

        Assert.False(context.ViewModel.PetAvailable);
        Assert.Equal(1, context.Source.StartCount);
    }

    [Fact]
    public async Task Quota_and_connection_state_map_to_pet_animation()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();

        Assert.Equal(PetAnimationState.Waiting, context.ViewModel.PetAnimation);

        context.Source.SetState(CodexConnectionState.Live);
        Assert.Equal(PetAnimationState.Idle, context.ViewModel.PetAnimation);

        context.Source.Emit(Snapshot(context.Clock.GetUtcNow().AddHours(5), remainingPercent: 9));
        Assert.Equal(PetAnimationState.Failed, context.ViewModel.PetAnimation);
    }

    [Fact]
    public async Task Successful_manual_refresh_temporarily_sets_pet_review_animation()
    {
        using var context = new TestContext();
        await context.ViewModel.InitializeAsync();
        context.Source.SetState(CodexConnectionState.Live);
        context.Source.Emit(Snapshot(context.Clock.GetUtcNow().AddHours(5), remainingPercent: 9));

        await context.ViewModel.RefreshAsync();

        Assert.Equal(PetAnimationState.Review, context.ViewModel.PetAnimation);
        await context.Clock.AdvanceAsync(TimeSpan.FromMilliseconds(900));
        await WaitForPetAnimationAsync(context.ViewModel, PetAnimationState.Failed);
        Assert.Equal(PetAnimationState.Failed, context.ViewModel.PetAnimation);
    }

    [Fact]
    public async Task Legacy_pet_settings_show_a_task_completion_notification()
    {
        using var context = new TestContext(pet: Pet, taskSource: new FakeTaskCompletionSource());
        await File.WriteAllTextAsync(context.Store.SettingsPath, """
            { "petEnabled": true }
            """);

        await context.ViewModel.InitializeAsync();
        context.TaskSource.Emit(Completion("legacy"));

        Assert.True(context.ViewModel.TaskNotificationsEnabled);
        Assert.True(context.ViewModel.IsTaskNotificationVisible);
        Assert.Equal("legacy", context.ViewModel.CurrentTaskCompletion?.TurnId);
    }

    [Fact]
    public async Task Task_completion_diagnostic_records_that_the_notification_was_shown()
    {
        var diagnostics = new List<string>();
        using var context = new TestContext(
            pet: Pet,
            taskSource: new FakeTaskCompletionSource(),
            diagnostic: diagnostics.Add);
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();

        context.TaskSource.Emit(Completion("observed-turn"));

        Assert.Contains(
            "Task completion shown: turn=observed-turn.",
            diagnostics);
    }

    [Fact]
    public async Task Task_completions_are_shown_in_fifo_order_without_stacking()
    {
        using var context = new TestContext(pet: Pet, taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();

        context.TaskSource.Emit(Completion("one"));
        context.TaskSource.Emit(Completion("two"));

        Assert.True(context.ViewModel.IsTaskNotificationVisible);
        Assert.Equal("one", context.ViewModel.CurrentTaskCompletion?.TurnId);
        await context.ViewModel.DismissTaskNotificationAsync();
        Assert.Equal("two", context.ViewModel.CurrentTaskCompletion?.TurnId);
    }

    [Fact]
    public async Task Task_notification_auto_dismisses_after_eight_seconds()
    {
        using var context = new TestContext(pet: Pet, taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();

        context.TaskSource.Emit(Completion("one"));
        var dismissed = WaitForTaskNotificationVisibilityAsync(context.ViewModel, visible: false);
        await context.Clock.AdvanceAsync(TimeSpan.FromSeconds(8));
        await dismissed;

        Assert.False(context.ViewModel.IsTaskNotificationVisible);
        Assert.Null(context.ViewModel.CurrentTaskCompletion);
    }

    [Fact]
    public async Task Disabling_task_notifications_clears_the_visible_item_and_queue()
    {
        using var context = new TestContext(pet: Pet, taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        context.TaskSource.Emit(Completion("one"));
        context.TaskSource.Emit(Completion("two"));

        await context.ViewModel.ToggleTaskNotificationsAsync();
        await context.ViewModel.ToggleTaskNotificationsAsync();
        await context.ViewModel.DismissTaskNotificationAsync();

        Assert.True(context.ViewModel.TaskNotificationsEnabled);
        Assert.False(context.ViewModel.IsTaskNotificationVisible);
        Assert.Null(context.ViewModel.CurrentTaskCompletion);
    }

    [Fact]
    public async Task Disabling_task_notifications_cancels_the_old_timer_before_a_new_card_is_shown()
    {
        using var context = new TestContext(pet: Pet, taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        context.TaskSource.Emit(Completion("old"));
        await context.Clock.AdvanceAsync(TimeSpan.FromSeconds(1));

        await context.ViewModel.ToggleTaskNotificationsAsync();
        Assert.Equal(0, context.Clock.ActiveTimerCount);
        await context.ViewModel.ToggleTaskNotificationsAsync();
        context.TaskSource.Emit(Completion("new"));
        await context.Clock.AdvanceAsync(TimeSpan.FromSeconds(7));

        Assert.Equal("new", context.ViewModel.CurrentTaskCompletion?.TurnId);
        var dismissed = WaitForTaskNotificationVisibilityAsync(context.ViewModel, visible: false);
        await context.Clock.AdvanceAsync(TimeSpan.FromSeconds(1));
        await dismissed;
        Assert.Null(context.ViewModel.CurrentTaskCompletion);
    }

    [Fact]
    public async Task Task_completion_source_failure_does_not_prevent_quota_source_start()
    {
        using var context = new TestContext(
            pet: Pet,
            taskSource: new FakeTaskCompletionSource(startException: new InvalidOperationException("watcher failed")));
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });

        await context.ViewModel.InitializeAsync();

        Assert.Equal(1, context.Source.StartCount);
        Assert.Equal(1, context.TaskSource.StartCount);
    }

    [Fact]
    public async Task Initialization_readiness_is_published_before_source_startup_completes()
    {
        var startup = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var context = new TestContext(
            pet: Pet,
            taskSource: new FakeTaskCompletionSource(start: _ => startup.Task));
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });

        var initialization = context.ViewModel.InitializeAsync();
        for (var attempt = 0; attempt < 20 && context.TaskSource.StartCount == 0; attempt++)
        {
            await Task.Delay(10);
        }

        Assert.True(context.ViewModel.IsInitializationReady);
        Assert.False(initialization.IsCompleted);

        startup.SetResult();
        await initialization;
    }

    [Fact]
    public async Task Task_completion_source_rethrows_caller_cancellation_during_startup()
    {
        using var callerCancellation = new CancellationTokenSource();
        using var context = new TestContext(
            pet: Pet,
            taskSource: new FakeTaskCompletionSource(start: cancellationToken =>
            {
                callerCancellation.Cancel();
                return Task.FromCanceled(cancellationToken);
            }));
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => context.ViewModel.InitializeAsync(callerCancellation.Token));
    }

    [Fact]
    public async Task Task_completion_state_is_applied_through_the_provided_dispatcher()
    {
        var dispatcher = new QueuedDispatcher();
        using var context = new TestContext(
            dispatch: dispatcher.Dispatch,
            pet: Pet,
            taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        dispatcher.RunAll();

        context.TaskSource.Emit(Completion("one"));

        Assert.Null(context.ViewModel.CurrentTaskCompletion);
        Assert.Equal(1, dispatcher.PendingCount);
        dispatcher.RunAll();
        Assert.Equal("one", context.ViewModel.CurrentTaskCompletion?.TurnId);
    }

    [Fact]
    public async Task Task_completion_dispose_unsubscribes_and_rejects_an_already_captured_callback()
    {
        using var context = new TestContext(pet: Pet, taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        var capturedCallback = context.TaskSource.CaptureCompletion(Completion("one"));

        context.ViewModel.Dispose();
        capturedCallback();

        Assert.False(context.TaskSource.HasTaskCompletionSubscribers);
        Assert.False(context.ViewModel.IsTaskNotificationVisible);
        Assert.Null(context.ViewModel.CurrentTaskCompletion);
    }

    [Fact]
    public async Task Task_notification_keeps_review_animation_priority_after_manual_refresh_delay()
    {
        var dispatcher = new QueuedDispatcher();
        using var context = new TestContext(
            dispatch: dispatcher.Dispatch,
            pet: Pet,
            taskSource: new FakeTaskCompletionSource());
        await context.Store.SaveAsync(AppSettings.Default with { PetEnabled = true });
        await context.ViewModel.InitializeAsync();
        dispatcher.RunAll();
        context.Source.SetState(CodexConnectionState.Live);
        context.Source.Emit(Snapshot(context.Clock.GetUtcNow().AddHours(5), remainingPercent: 9));
        context.TaskSource.Emit(Completion("one"));
        dispatcher.RunAll();

        await context.ViewModel.RefreshAsync();
        dispatcher.RunAll();
        var restorationScheduled = dispatcher.WaitForPendingAsync();
        await context.Clock.AdvanceAsync(TimeSpan.FromMilliseconds(900));
        await restorationScheduled;
        dispatcher.RunAll();

        Assert.Equal(PetAnimationState.Review, context.ViewModel.PetAnimation);
    }

    private static QuotaSnapshot Snapshot(DateTimeOffset resetsAt, int remainingPercent = 67) => new(
        [new QuotaBucket("codex", "Codex", remainingPercent, QuotaTone.Healthy, QuotaWindowKind.Primary, resetsAt, TimeSpan.FromDays(7))],
        5,
        resetsAt.AddHours(-5));

    private static CodexTaskCompletion Completion(string turnId) => new(
        turnId,
        "workspace",
        "Task completed",
        TimeSpan.FromSeconds(1),
        DateTimeOffset.UtcNow);

    private static readonly PetAsset Pet = new(
        "fireball",
        "Fireball",
        [1, 2, 3],
        PetAssetFormat.CodexWebpAtlas,
        PetAssetSource.Codex);

    private static readonly PetAsset BundledPet = new(
        "bundled-suit-hamster",
        "西装仓鼠",
        [4, 5, 6],
        PetAssetFormat.AnimatedGif,
        PetAssetSource.BundledFallback);

    private static async Task WaitForTaskNotificationVisibilityAsync(
        MainWindowViewModel viewModel,
        bool visible)
    {
        if (viewModel.IsTaskNotificationVisible == visible)
        {
            return;
        }

        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        PropertyChangedEventHandler? handler = null;
        handler = (_, args) =>
        {
            if (args.PropertyName == nameof(MainWindowViewModel.IsTaskNotificationVisible) &&
                viewModel.IsTaskNotificationVisible == visible)
            {
                completion.TrySetResult();
            }
        };
        viewModel.PropertyChanged += handler;
        try
        {
            if (viewModel.IsTaskNotificationVisible == visible)
            {
                return;
            }

            await completion.Task.WaitAsync(TimeSpan.FromSeconds(1));
        }
        finally
        {
            viewModel.PropertyChanged -= handler;
        }
    }

    private static async Task WaitForPetAnimationAsync(
        MainWindowViewModel viewModel,
        PetAnimationState expected)
    {
        if (viewModel.PetAnimation == expected)
        {
            return;
        }

        var completion = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        PropertyChangedEventHandler? handler = null;
        handler = (_, args) =>
        {
            if (args.PropertyName == nameof(MainWindowViewModel.PetAnimation)
                && viewModel.PetAnimation == expected)
            {
                completion.TrySetResult();
            }
        };
        viewModel.PropertyChanged += handler;
        try
        {
            if (viewModel.PetAnimation != expected)
            {
                await completion.Task.WaitAsync(TimeSpan.FromSeconds(1));
            }
        }
        finally
        {
            viewModel.PropertyChanged -= handler;
        }
    }

    private sealed class TestContext : IDisposable
    {
        private readonly string _directory = Path.Combine(Path.GetTempPath(), $"quota-vm-{Guid.NewGuid():N}");

        public TestContext(
            Action<Action>? dispatch = null,
            bool platformLaunchAtLogin = true,
            PetAsset? pet = null,
            Exception? petException = null,
            FakeTaskCompletionSource? taskSource = null,
            Action<string>? diagnostic = null)
        {
            Directory.CreateDirectory(_directory);
            Source = new FakeQuotaSource();
            Store = new JsonSettingsStore(_directory);
            Clock = new ControllableTimeProvider(new DateTimeOffset(2026, 7, 16, 10, 0, 0, TimeSpan.Zero));
            Platform = new FakePlatformServices(_directory, platformLaunchAtLogin);
            PetProvider = new FakeCodexPetProvider(pet, petException);
            TaskSource = taskSource ?? new FakeTaskCompletionSource();
            ViewModel = new MainWindowViewModel(
                Source,
                PetProvider,
                TaskSource,
                Store,
                Platform,
                Clock,
                () => QuitRequested = true,
                dispatch,
                diagnostic);
        }

        public FakeQuotaSource Source { get; }
        public JsonSettingsStore Store { get; }
        public ControllableTimeProvider Clock { get; }
        public FakePlatformServices Platform { get; }
        public FakeCodexPetProvider PetProvider { get; }
        public FakeTaskCompletionSource TaskSource { get; }
        public MainWindowViewModel ViewModel { get; }
        public bool QuitRequested { get; private set; }

        public void Dispose()
        {
            ViewModel.Dispose();
            Directory.Delete(_directory, recursive: true);
        }
    }

    private sealed class ControllableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        private readonly List<ControllableTimer> _timers = [];

        public DateTimeOffset UtcNow { get; set; } = utcNow;

        public int ActiveTimerCount => _timers.Count;

        public override DateTimeOffset GetUtcNow() => UtcNow;

        public override ITimer CreateTimer(
            TimerCallback callback,
            object? state,
            TimeSpan dueTime,
            TimeSpan period)
        {
            var timer = new ControllableTimer(this, callback, state, dueTime, period);
            _timers.Add(timer);
            return timer;
        }

        public async Task AdvanceAsync(TimeSpan elapsed)
        {
            UtcNow += elapsed;
            while (true)
            {
                var dueTimers = _timers.Where(timer => timer.IsDue(UtcNow)).ToArray();
                if (dueTimers.Length == 0)
                {
                    await Task.Yield();
                    return;
                }

                foreach (var timer in dueTimers)
                {
                    timer.Fire(UtcNow);
                }

                await Task.Yield();
            }
        }

        private sealed class ControllableTimer : ITimer
        {
            private readonly ControllableTimeProvider _provider;
            private readonly TimerCallback _callback;
            private readonly object? _state;
            private TimeSpan _period;
            private DateTimeOffset? _dueAt;
            private bool _disposed;

            public ControllableTimer(
                ControllableTimeProvider provider,
                TimerCallback callback,
                object? state,
                TimeSpan dueTime,
                TimeSpan period)
            {
                _provider = provider;
                _callback = callback;
                _state = state;
                Change(dueTime, period);
            }

            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                if (_disposed)
                {
                    return false;
                }

                _period = period;
                _dueAt = dueTime == Timeout.InfiniteTimeSpan ? null : _provider.UtcNow + dueTime;
                return true;
            }

            public bool IsDue(DateTimeOffset now) => !_disposed && _dueAt is { } dueAt && dueAt <= now;

            public void Fire(DateTimeOffset now)
            {
                if (!IsDue(now))
                {
                    return;
                }

                _dueAt = _period == Timeout.InfiniteTimeSpan ? null : now + _period;
                _callback(_state);
            }

            public void Dispose()
            {
                if (_disposed)
                {
                    return;
                }

                _disposed = true;
                _provider._timers.Remove(this);
            }

            public ValueTask DisposeAsync()
            {
                Dispose();
                return ValueTask.CompletedTask;
            }
        }
    }

    private sealed class FakeQuotaSource : IQuotaSource
    {
        public event EventHandler<QuotaSnapshot>? SnapshotUpdated;
        public event EventHandler? ConnectionStateChanged;

        public CodexConnectionState ConnectionState { get; private set; } = CodexConnectionState.Stopped;
        public QuotaSnapshot? LastSnapshot { get; private set; }
        public int RefreshCount { get; private set; }
        public int StartCount { get; private set; }

        public Task StartAsync(CancellationToken cancellationToken = default)
        {
            StartCount++;
            return Task.CompletedTask;
        }

        public Task RefreshAsync(CancellationToken cancellationToken = default)
        {
            RefreshCount++;
            return Task.CompletedTask;
        }

        public void Emit(QuotaSnapshot snapshot)
        {
            LastSnapshot = snapshot;
            SnapshotUpdated?.Invoke(this, snapshot);
        }

        public void SetState(CodexConnectionState state)
        {
            ConnectionState = state;
            ConnectionStateChanged?.Invoke(this, EventArgs.Empty);
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class FakeCodexPetProvider(PetAsset? pet, Exception? exception) : IPetProvider
    {
        public PetAsset? Next { get; set; } = pet;

        public int FindCount { get; private set; }

        public Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default)
        {
            FindCount++;
            if (exception is not null)
            {
                return Task.FromException<PetAsset?>(exception);
            }

            return Task.FromResult(Next);
        }
    }

    private sealed class FakeTaskCompletionSource(
        Exception? startException = null,
        Func<CancellationToken, Task>? start = null) : ITaskCompletionSource
    {
        public event EventHandler<CodexTaskCompletion>? TaskCompleted;

        public int StartCount { get; private set; }

        public bool HasTaskCompletionSubscribers => TaskCompleted is not null;

        public Task StartAsync(CancellationToken cancellationToken = default)
        {
            StartCount++;
            return start?.Invoke(cancellationToken)
                ?? (startException is null ? Task.CompletedTask : Task.FromException(startException));
        }

        public void Emit(CodexTaskCompletion completion) => TaskCompleted?.Invoke(this, completion);

        public Action CaptureCompletion(CodexTaskCompletion completion)
        {
            var handler = TaskCompleted;
            return () => handler?.Invoke(this, completion);
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class QueuedDispatcher
    {
        private readonly Queue<Action> _actions = [];
        private TaskCompletionSource? _pendingAction;

        public int PendingCount => _actions.Count;

        public void Dispatch(Action action)
        {
            _actions.Enqueue(action);
            _pendingAction?.TrySetResult();
            _pendingAction = null;
        }

        public Task WaitForPendingAsync() => _actions.Count > 0
            ? Task.CompletedTask
            : (_pendingAction ??= new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).Task;

        public void RunAll()
        {
            while (_actions.TryDequeue(out var action))
            {
                action();
            }
        }
    }

    private sealed class FakePlatformServices(string directory, bool launchAtLogin) : IPlatformServices
    {
        private bool _launchAtLogin = launchAtLogin;

        public string SettingsDirectory { get; } = directory;
        public string LogsDirectory { get; } = directory;
        public bool LaunchAtLogin => _launchAtLogin;
        public int SetLaunchAtLoginCount { get; private set; }

        public Task<string?> FindCodexExecutableAsync(string? explicitOverride, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(explicitOverride ?? "codex");

        public Task<bool> GetLaunchAtLoginAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(_launchAtLogin);

        public Task SetLaunchAtLoginAsync(bool enabled, CancellationToken cancellationToken = default)
        {
            SetLaunchAtLoginCount++;
            _launchAtLogin = enabled;
            return Task.CompletedTask;
        }
    }
}
