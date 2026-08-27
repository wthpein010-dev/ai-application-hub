using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class CodexDesktopMessageFallbackTests
{
    [Fact]
    public async Task SendAsync_OpensExactThreadPromptBeforeSubmitting()
    {
        var order = new List<string>();
        var launcher = new RecordingLauncher(order);
        var submitter = new RecordingSubmitter(order);
        var fallback = new CodexDesktopMessageFallback(launcher, submitter);

        await fallback.SendAsync(
            "019f7444-4d4d-7771-9864-0043606d7f78",
            ConfirmationOverlayViewModel.ConfirmationMessage);

        Assert.Equal(
            [
                "open:codex://threads/019f7444-4d4d-7771-9864-0043606d7f78?prompt=%E7%A1%AE%E8%AE%A4%EF%BC%8C%E7%BB%A7%E7%BB%AD%E5%BC%80%E5%A7%8B%E5%81%9A%EF%BC%8C%E5%AE%8C%E6%88%90%E5%89%8D%E4%B8%8D%E8%A6%81%E5%81%9C%E3%80%82",
                "submit"
            ],
            order);
    }

    [Fact]
    public async Task WindowsSubmitter_WaitsThroughColdStartBeforeSubmitting()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var timeProvider = new ManualTimeProvider();
        var automation = new RecordingWindowsCodexAutomation(
            readyAfterDiscoveries: 80);
        var submitter = new WindowsCodexForegroundSubmitter(
            automation,
            timeProvider,
            timeProvider.DelayAsync);

        await submitter.SubmitAsync();

        Assert.Equal(80, automation.DiscoveryCount);
        Assert.Equal([42], automation.ForegroundRequests);
        Assert.Equal(1, automation.SubmitCount);
    }

    [Fact]
    public async Task WindowsSubmitter_KeepsWarmSubmissionFast()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var timeProvider = new ManualTimeProvider();
        var automation = new RecordingWindowsCodexAutomation(
            readyAfterDiscoveries: int.MaxValue,
            initialForegroundWindow: 42);
        var submitter = new WindowsCodexForegroundSubmitter(
            automation,
            timeProvider,
            timeProvider.DelayAsync);

        await submitter.SubmitAsync();

        Assert.Equal(TimeSpan.FromMilliseconds(350), timeProvider.Elapsed);
        Assert.Equal(0, automation.DiscoveryCount);
        Assert.Equal(1, automation.SubmitCount);
    }

    [Fact]
    public async Task WindowsSubmitter_RevalidatesAfterFocusSettlesBeforeEnter()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var isCurrent = true;
        var timeProvider = new ManualTimeProvider(_ => isCurrent = false);
        var automation = new RecordingWindowsCodexAutomation(
            readyAfterDiscoveries: int.MaxValue,
            initialForegroundWindow: 42);
        ICodexForegroundSubmitter submitter = new WindowsCodexForegroundSubmitter(
            automation,
            timeProvider,
            timeProvider.DelayAsync);

        var submitted = await submitter.SubmitIfCurrentAsync(
            _ => Task.FromResult(isCurrent));

        Assert.False(submitted);
        Assert.Equal(0, automation.SubmitCount);
    }

    private sealed class RecordingLauncher(List<string> order) : ICodexDeepLinkLauncher
    {
        public Task OpenAsync(
            string deepLink,
            CancellationToken cancellationToken = default)
        {
            order.Add($"open:{deepLink}");
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingSubmitter(List<string> order) : ICodexForegroundSubmitter
    {
        public Task SubmitAsync(CancellationToken cancellationToken = default)
        {
            order.Add("submit");
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingWindowsCodexAutomation(
        int readyAfterDiscoveries,
        nint initialForegroundWindow = 0) :
        IWindowsCodexDesktopAutomation
    {
        private nint _foregroundWindow = initialForegroundWindow;

        public int DiscoveryCount { get; private set; }

        public List<nint> ForegroundRequests { get; } = [];

        public int SubmitCount { get; private set; }

        public nint GetForegroundWindow() => _foregroundWindow;

        public nint FindCodexDesktopWindow()
        {
            DiscoveryCount++;
            return DiscoveryCount >= readyAfterDiscoveries ? 42 : 0;
        }

        public bool IsCodexDesktopWindow(nint window) => window == 42;

        public bool SetForegroundWindow(nint window)
        {
            ForegroundRequests.Add(window);
            _foregroundWindow = window;
            return true;
        }

        public void SendEnter()
        {
            SubmitCount++;
        }
    }

    private sealed class ManualTimeProvider(
        Action<TimeSpan>? onDelay = null) : TimeProvider
    {
        private long _timestamp;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp() => _timestamp;

        public TimeSpan Elapsed => TimeSpan.FromTicks(_timestamp);

        public void Advance(TimeSpan duration)
        {
            _timestamp += duration.Ticks;
        }

        public Task DelayAsync(
            TimeSpan duration,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Advance(duration);
            onDelay?.Invoke(duration);
            return Task.CompletedTask;
        }
    }
}
