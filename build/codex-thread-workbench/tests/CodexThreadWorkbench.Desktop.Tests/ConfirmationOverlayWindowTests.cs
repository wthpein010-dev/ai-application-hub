using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Presentation;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class ConfirmationOverlayWindowTests
{
    [Fact]
    public void PointerActionGate_RequiresOnePointerPressPerAction()
    {
        var gate = new ConfirmationPointerActionGate();
        var action = new object();

        Assert.False(gate.TryConsume(action));
        gate.Arm(action);
        Assert.True(gate.TryConsume(action));
        Assert.False(gate.TryConsume(action));
        gate.Arm(action);
        gate.Disarm(action);
        Assert.False(gate.TryConsume(action));
        gate.Arm(action);
        gate.Clear();
        Assert.False(gate.TryConsume(action));
    }

    [AvaloniaFact]
    public void Overlay_HasRequiredWindowChromeAndTopmostSettings()
    {
        var window = new ConfirmationOverlayWindow();

        Assert.True(window.Topmost);
        Assert.False(window.ShowInTaskbar);
        Assert.False(window.ShowActivated);
        Assert.False(window.CanResize);
        Assert.Equal(SystemDecorations.None, window.SystemDecorations);
        Assert.Equal(560, window.Width);
    }

    [AvaloniaFact]
    public void PositionAtTopCenter_UsesWorkingArea()
    {
        var window = new ConfirmationOverlayWindow { Width = 560 };

        window.PositionAtTopCenter(new PixelRect(100, 50, 1500, 900));

        Assert.Equal(new PixelPoint(570, 58), window.Position);
    }

    [Fact]
    public void Placement_AfterManualMove_KeepsCurrentPositionOnNextShow()
    {
        var placement = new ConfirmationOverlayPlacement();
        placement.MarkManuallyPositioned();

        var position = placement.ResolveForShow(
            new PixelRect(100, 50, 1500, 900),
            new PixelPoint(280, 340),
            new PixelSize(560, 400));

        Assert.Equal(new PixelPoint(280, 340), position);
    }

    [Fact]
    public void Placement_WhenDisplayChanges_ClampsManualPositionIntoWorkingArea()
    {
        var placement = new ConfirmationOverlayPlacement();
        placement.MarkManuallyPositioned();

        var position = placement.ResolveForShow(
            new PixelRect(100, 50, 1200, 800),
            new PixelPoint(1600, 900),
            new PixelSize(560, 400));

        Assert.Equal(new PixelPoint(740, 450), position);
    }

    [Fact]
    public void Placement_WhenIdle_RetractsAboveTopEdgeAndKeepsAnchorX()
    {
        var placement = new ConfirmationOverlayPlacement();

        var position = placement.ResolveRetracted(
            new PixelRect(100, 50, 1200, 800),
            new PixelPoint(280, 340),
            new PixelSize(560, 64),
            ConfirmationOverlayWindow.IdlePeekHeight);

        Assert.Equal(new PixelPoint(280, -4), position);
    }

    [Fact]
    public void ScreenSelection_WhenAttentionRequired_DefaultsToLeftmostDisplay()
    {
        var primary = new PixelRect(0, 0, 3840, 2088);
        var secondary = new PixelRect(3840, 0, 3840, 2088);

        var selected = ConfirmationOverlayScreenSelection.ResolveWorkingArea(
            secondary,
            [secondary, primary]);

        Assert.Equal(primary, selected);
    }

    [Fact]
    public void ScreenSelection_WhenIdle_DefaultsToLeftmostDisplay()
    {
        var primary = new PixelRect(0, 0, 3840, 2088);
        var secondary = new PixelRect(3840, 0, 3840, 2088);

        var selected = ConfirmationOverlayScreenSelection.ResolveWorkingArea(
            secondary,
            [secondary, primary]);

        Assert.Equal(primary, selected);
    }

    [AvaloniaFact]
    public void Overlay_AfterManualMove_PreservesPositionWhenShownAgain()
    {
        var window = new ConfirmationOverlayWindow
        {
            Position = new PixelPoint(280, 340)
        };
        window.MarkManuallyPositioned();

        window.PositionForShow(
            new PixelRect(100, 50, 1500, 900),
            new PixelSize(560, 400));

        Assert.Equal(new PixelPoint(280, 340), window.Position);
    }

    [AvaloniaFact]
    public async Task Attach_RetractsWhenIdle_ExpandsForCandidate_ThenRetractsAgain()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(),
            monitor,
            new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible);
        var primaryScreen = window.Screens.Primary;
        Assert.NotNull(primaryScreen);
        var workingArea = primaryScreen.WorkingArea;
        await WaitForAsync(() => window.Bounds.Height > 1);
        await WaitForAsync(() =>
            window.Position.Y + (int)Math.Ceiling(window.Bounds.Height) ==
            workingArea.Y + ConfirmationOverlayWindow.IdlePeekHeight);
        Assert.Equal(
            workingArea.X +
            ((workingArea.Width - (int)Math.Ceiling(window.Bounds.Width)) / 2),
            window.Position.X);

        Assert.Equal("暂无待确认 · 常驻扫描", viewModel.CountText);
        Assert.False(viewModel.ConfirmAllCommand.CanExecute(null));
        Assert.Equal(1, window.Opacity);

        monitor.Push(new ConfirmationCandidate(
            "thread-1",
            "待确认任务",
            "message-1",
            "请确认方案，确认后开始实施。",
            DateTimeOffset.UtcNow));
        await WaitForAsync(() => !viewModel.IsInteractionArmed);
        await WaitForAsync(() => window.Position.Y == workingArea.Y + 8);
        await WaitForAsync(() => viewModel.IsInteractionArmed);

        var confirmAllButton = window.FindControl<Button>("ConfirmAllButton");
        Assert.NotNull(confirmAllButton);
        Assert.Null(confirmAllButton.Command);
        Assert.NotNull(window.FindControl<ItemsControl>("ConfirmationList"));
        Assert.True(window.IsVisible);

        monitor.Push();
        await WaitForAsync(() =>
            window.Position.Y + (int)Math.Ceiling(window.Bounds.Height) ==
            workingArea.Y + ConfirmationOverlayWindow.IdlePeekHeight);

        Assert.True(window.IsVisible);
        Assert.Equal("暂无待确认 · 常驻扫描", viewModel.CountText);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task ConfirmButton_RejectsProgrammaticClick_ButAcceptsOnePointerClick()
    {
        var monitor = new PushMonitor();
        var client = new ClickRecordingClient();
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible);
        monitor.Push(new ConfirmationCandidate(
            "thread-1",
            "待确认任务",
            "message-1",
            "确认执行吗？",
            DateTimeOffset.UtcNow));
        await WaitForAsync(() => viewModel.IsInteractionArmed);
        var button = window.GetVisualDescendants()
            .OfType<Button>()
            .Single(candidate => Equals(candidate.Content, "确认继续"));

        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await Task.Delay(20);
        Assert.Equal(0, client.StartCalls);

        var point = button.TranslatePoint(
            new Point(button.Bounds.Width / 2, button.Bounds.Height / 2),
            window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);

        await WaitForAsync(() => client.StartCalls == 1);
        Assert.Equal(ConfirmationOverlayViewModel.ConfirmationMessage, client.LastText);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task Attach_ExpandsForMonitorErrorEvenWithoutCandidates()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(),
            monitor,
            new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible);
        var primaryScreen = window.Screens.Primary;
        Assert.NotNull(primaryScreen);
        var workingArea = primaryScreen.WorkingArea;
        await WaitForAsync(() => window.Bounds.Height > 1);
        await WaitForAsync(() => window.Position.Y < workingArea.Y);

        monitor.PushError("扫描连接暂时不可用");

        await WaitForAsync(() => window.Position.Y == workingArea.Y + 8);
        Assert.True(viewModel.RequiresAttention);
        Assert.Equal("扫描异常 · 请检查", viewModel.CountText);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task Close_WithoutExplicitShutdown_KeepsOverlayVisible()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(),
            monitor,
            new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible);

        window.Close();
        await Task.Delay(20);

        Assert.True(window.IsVisible);
        window.CloseForShutdown();
    }

    private static async Task WaitForAsync(Func<bool> condition)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(2);
        while (!condition() && DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(20);
        }

        Assert.True(condition());
    }

    private sealed class PushMonitor : IConfirmationMonitor
    {
        private IReadOnlyList<ConfirmationCandidate> _candidates = [];

        private string _errorText = string.Empty;

        public event Action<IReadOnlyList<ConfirmationCandidate>>? CandidatesChanged;

        public event Action<string>? ErrorChanged;

        public IReadOnlyList<ConfirmationCandidate> Candidates => _candidates;

        public string ErrorText => _errorText;

        public void Push(params ConfirmationCandidate[] candidates)
        {
            _candidates = candidates;
            CandidatesChanged?.Invoke(_candidates);
        }

        public void PushError(string error)
        {
            _errorText = error;
            ErrorChanged?.Invoke(error);
        }

        public void Start()
        {
        }

        public Task ScanOnceAsync(
            DateTimeOffset now,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public void MarkHandled(string threadId, string messageId)
        {
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class NoopClient : ICodexThreadClient
    {
        public event Action<CodexNotification>? NotificationReceived
        {
            add { }
            remove { }
        }

        public event Action<CodexApprovalRequest>? ApprovalRequested
        {
            add { }
            remove { }
        }

        public bool IsConnected => true;

        public Task InitializeAsync(CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
            int limit = 100,
            string? searchTerm = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ThreadSummary>>([]);

        public Task<ThreadCardState> ReadThreadAsync(
            string threadId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task ResumeThreadAsync(
            string threadId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<string> StartTurnAsync(
            string threadId,
            string text,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task SteerTurnAsync(
            string threadId,
            string expectedTurnId,
            string text,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task InterruptTurnAsync(
            string threadId,
            string turnId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task RespondToApprovalAsync(
            CodexApprovalRequest request,
            bool accept,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class ClickRecordingClient : ICodexThreadClient
    {
        private ThreadCardState _state = new(
            new ThreadSummary(
                "thread-1",
                "待确认任务",
                "预览",
                @"C:\work",
                DateTimeOffset.UtcNow,
                ThreadStatusKind.Idle),
            [new ChatMessage("message-1", ChatRole.Assistant, "确认执行吗？")],
            ThreadStatusKind.Idle,
            LatestTurnStatus: ThreadStatusKind.Completed);

        public event Action<CodexNotification>? NotificationReceived
        {
            add { }
            remove { }
        }

        public event Action<CodexApprovalRequest>? ApprovalRequested
        {
            add { }
            remove { }
        }

        public bool IsConnected => true;

        public int StartCalls { get; private set; }

        public string LastText { get; private set; } = string.Empty;

        public Task InitializeAsync(CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
            int limit = 100,
            string? searchTerm = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ThreadSummary>>([]);

        public Task<ThreadCardState> ReadThreadAsync(
            string threadId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(_state);

        public Task ResumeThreadAsync(
            string threadId,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<string> StartTurnAsync(
            string threadId,
            string text,
            CancellationToken cancellationToken = default)
        {
            StartCalls++;
            LastText = text;
            _state = _state with
            {
                Messages = _state.Messages
                    .Append(new ChatMessage("user-confirmation", ChatRole.User, text))
                    .ToArray()
            };
            return Task.FromResult("turn-1");
        }

        public Task SteerTurnAsync(
            string threadId,
            string expectedTurnId,
            string text,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task InterruptTurnAsync(
            string threadId,
            string turnId,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task RespondToApprovalAsync(
            CodexApprovalRequest request,
            bool accept,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
