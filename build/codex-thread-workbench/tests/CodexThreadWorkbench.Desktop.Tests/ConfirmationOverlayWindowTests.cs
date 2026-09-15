using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Persistence;
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
        Assert.InRange(window.Width, 320, 380);
    }

    [AvaloniaFact]
    public async Task PortraitLayout_KeepsFooterVisibleAndLongCardsInsidePanel()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(), monitor, new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        try
        {
            window.Attach(viewModel);
            monitor.Push(Enumerable.Range(1, 8).Select(index => new ConfirmationCandidate(
                $"preview-{index}", "很长的任务名称：整理设计方案并补充多个页面的详细交互说明",
                $"message-{index}", "请选择需要继续处理的方案，确认后开始实现页面布局和交互细节。",
                DateTimeOffset.UtcNow.AddSeconds(index))).ToArray());
            await WaitForAsync(() => window.IsVisible && viewModel.IsInteractionArmed);
            window.UpdateLayout();

            Assert.True(window.Bounds.Height > window.Bounds.Width);
            Assert.InRange(window.Bounds.Width, 320, 380);
            var scroller = window.GetVisualDescendants().OfType<ScrollViewer>()
                .Single(scroll => scroll.Content is ItemsControl);
            var footer = window.FindControl<Button>("ConfirmAllButton")!;
            var footerTop = footer.TranslatePoint(default, window)!.Value.Y;
            var listBottom = scroller.TranslatePoint(default, window)!.Value.Y + scroller.Bounds.Height;
            Assert.True(footerTop >= listBottom);
            Assert.True(footerTop + footer.Bounds.Height <= window.Bounds.Height);
            Assert.True(scroller.Extent.Height > scroller.Viewport.Height);
            Assert.All(window.GetVisualDescendants().OfType<Button>()
                .Where(button => Equals(button.Content, "确认继续")),
                button => Assert.True(button.Bounds.Width >= 90));
            foreach (var title in window.GetVisualDescendants().OfType<TextBlock>()
                         .Where(text => text.Text?.StartsWith("很长的任务名称") == true))
            {
                Assert.True(title.TranslatePoint(default, window)!.Value.X + title.Bounds.Width < window.Bounds.Width);
            }

            var initialSize = window.Bounds.Size;
            scroller.Offset = new Vector(0, 2000);
            window.UpdateLayout();
            Assert.Equal(footerTop, footer.TranslatePoint(default, window)!.Value.Y);
            monitor.Push(new ConfirmationCandidate("preview-1", "设计方案", "next", "是否开始？", DateTimeOffset.UtcNow));
            await Task.Delay(250);
            Assert.Equal(initialSize, window.Bounds.Size);
        }
        finally
        {
            window.CloseForShutdown();
        }
    }

    [AvaloniaFact]
    public async Task PortraitLayout_LongErrorsDoNotDisplaceTaskListOrFooter()
    {
        var monitor = new PushMonitor();
        var error = string.Concat(Enumerable.Repeat("连接不可用，请检查本机服务状态。", 200));
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(), monitor, new ConfirmationDetector(),
            automationSettingsStore: new LongErrorSettingsStore(error));
        await viewModel.SetAutoConfirmEnabledAsync(true);
        monitor.PushError(error);
        monitor.Push(new ConfirmationCandidate("preview", "设计方案", "message", "是否开始？", DateTimeOffset.UtcNow));
        var window = new ConfirmationOverlayWindow();
        try
        {
            window.Attach(viewModel);
            await WaitForAsync(() => window.IsVisible && viewModel.IsInteractionArmed);
            window.UpdateLayout();
            Assert.True(viewModel.HasMonitorError && viewModel.HasAutoConfirmError);
            var scroller = window.GetVisualDescendants().OfType<ScrollViewer>()
                .Single(scroll => scroll.Content is ItemsControl);
            var footer = window.FindControl<Button>("ConfirmAllButton")!;
            Assert.True(scroller.Bounds.Height >= 80);
            Assert.True(footer.TranslatePoint(default, window)!.Value.Y + footer.Bounds.Height <= window.Bounds.Height);
        }
        finally { window.CloseForShutdown(); }
    }

    [AvaloniaFact]
    public async Task PortraitLayout_ConstrainedDisplayKeepsPanelInsideWorkingArea()
    {
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(), new PushMonitor(), new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        var screen = window.Screens.Primary!;
        var areaProperty = typeof(Avalonia.Platform.Screen).GetProperty("WorkingArea")!;
        var scalingProperty = typeof(Avalonia.Platform.Screen).GetProperty("Scaling")!;
        var oldArea = screen.WorkingArea;
        var oldScaling = screen.Scaling;
        try
        {
            areaProperty.SetValue(screen, new PixelRect(0, 0, 1280, 720));
            scalingProperty.SetValue(screen, 1.5);
            window.Attach(viewModel);
            await WaitForAsync(() => window.FindControl<Border>("IdleSideTab")!.IsVisible);
            Assert.InRange(window.Bounds.Height, 400, 456);
            Assert.True(window.Position.Y + Math.Ceiling(window.Bounds.Height * 1.5) <= 720);
        }
        finally
        {
            window.CloseForShutdown();
            areaProperty.SetValue(screen, oldArea);
            scalingProperty.SetValue(screen, oldScaling);
        }
    }

    [AvaloniaFact]
    public void Overlay_UsesExternalGraphicCueWithoutInternalInstructionCopy()
    {
        var window = new ConfirmationOverlayWindow();

        var surface = window.FindControl<Border>("OverlaySurface");
        var badge = window.FindControl<Border>("AttentionBadge");
        Assert.NotNull(surface);
        Assert.NotNull(badge);
        Assert.DoesNotContain(badge, surface.GetVisualDescendants());
        Assert.NotNull(window.FindControl<Control>("TaskSprite"));
        Assert.NotNull(window.FindControl<Control>("TaskSpriteAura"));
        Assert.NotNull(window.FindControl<Control>("TaskSparkLeft"));
        Assert.NotNull(window.FindControl<Control>("TaskSparkRight"));
        Assert.Null(window.FindControl<Control>("NewTaskBanner"));

        var visibleCopy = window.GetVisualDescendants()
            .OfType<TextBlock>()
            .Select(textBlock => textBlock.Text ?? string.Empty)
            .ToArray();
        Assert.DoesNotContain(
            visibleCopy,
            text => text.Contains("有新任务等你决定", StringComparison.Ordinal));
        Assert.DoesNotContain(
            visibleCopy,
            text => text.Contains("有任务等你决定时", StringComparison.Ordinal));
        Assert.DoesNotContain("待你决定", visibleCopy);

        var toggle = window.FindControl<ToggleSwitch>("AutoConfirmToggle");
        Assert.NotNull(toggle);
        Assert.Equal("自动", toggle.OffContent);
        Assert.Equal("自动", toggle.OnContent);
    }

    [AvaloniaFact]
    public void PositionAtTopCenter_UsesWorkingArea()
    {
        var window = new ConfirmationOverlayWindow { Width = 560 };

        window.PositionAtTopCenter(new PixelRect(100, 50, 1500, 900));

        Assert.Equal(new PixelPoint(570, 50), window.Position);
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
    public void Placement_WhenIdle_RetractsAtLeftEdgeAndKeepsAnchorY()
    {
        var placement = new ConfirmationOverlayPlacement();

        var position = placement.ResolveRetracted(
            new PixelRect(100, 50, 1200, 800),
            new PixelPoint(280, 340),
            new PixelSize(560, 64),
            16);

        Assert.Equal(new PixelPoint(-444, 340), position);
    }

    [Theory]
    [InlineData(100, 50, 1500, 900, 560, 400, 100, 300)]
    [InlineData(-1920, 0, 1920, 1040, 840, 600, -1920, 220)]
    public void Placement_DefaultsToLeftMiddleAwayFromBrowserTop(
        int x, int y, int width, int height, int windowWidth, int windowHeight,
        int expectedX, int expectedY)
    {
        var placement = new ConfirmationOverlayPlacement();
        Assert.Equal(new PixelPoint(expectedX, expectedY), placement.ResolveForShow(
            new PixelRect(x, y, width, height), new PixelPoint(5000, 0),
            new PixelSize(windowWidth, windowHeight)));
    }

    [AvaloniaFact]
    public async Task IdleHover_QuickPassDoesNotOpenPanel()
    {
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(), new PushMonitor(), new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        try
        {
            window.Attach(viewModel);
            await WaitForAsync(() => window.IsVisible && window.Bounds.Height > 1);
            await Task.Delay(250);
            var retracted = window.Position;
            window.MouseMove(new Point(window.Bounds.Width - 5, window.Bounds.Height / 2));
            await Task.Delay(100);
            Assert.Equal(retracted, window.Position);
            window.MouseMove(new Point(window.Bounds.Width + 50, window.Bounds.Height / 2));
            await Task.Delay(500);
            Assert.Equal(retracted, window.Position);
        }
        finally
        {
            window.CloseForShutdown();
        }
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
    public void Overlay_AfterMovingAnAlreadyPositionedWindow_UsesNewAnchor()
    {
        var window = new ConfirmationOverlayWindow();
        var area = new PixelRect(100, 50, 1500, 900);
        var size = new PixelSize(560, 400);
        window.PositionForShow(area, size);
        window.MarkManuallyPositioned();
        window.Position = new PixelPoint(280, 340);

        window.PositionForShow(area, size);

        Assert.Equal(new PixelPoint(280, 340), window.Position);
    }

    [AvaloniaFact]
    public async Task ManualMove_AfterHoverExpansion_PreservesAnchorThroughRetraction()
    {
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(), new PushMonitor(), new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        try
        {
            window.Attach(viewModel);
            await WaitForAsync(() => window.FindControl<Border>("IdleSideTab")!.IsVisible);
            window.MouseMove(new Point(window.Bounds.Width - 5, window.Bounds.Height / 2));
            await WaitForAsync(() => window.Position.X == window.Screens.Primary!.WorkingArea.X);
            window.MarkManuallyPositioned();
            window.Position = new PixelPoint(80, 200);
            window.MouseMove(new Point(window.Bounds.Width + 50, window.Bounds.Height / 2));
            await WaitForAsync(() => window.FindControl<Border>("IdleSideTab")!.IsVisible);
            Assert.Equal(200, window.Position.Y);

            window.MouseMove(new Point(window.Bounds.Width - 5, window.Bounds.Height / 2));
            await WaitForAsync(() => window.Position.X == 80);
            Assert.Equal(200, window.Position.Y);
        }
        finally
        {
            window.CloseForShutdown();
        }
    }

    [AvaloniaFact]
    public async Task Attach_UsesTargetDisplayScaleBeforeWindowMoves()
    {
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(), new PushMonitor(), new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        var screen = window.Screens.Primary!;
        var scalingProperty = typeof(Avalonia.Platform.Screen).GetProperty("Scaling")!;
        var originalScaling = screen.Scaling;
        try
        {
            // Simulate a 150% target display while the newly created window is still at 100%.
            scalingProperty.SetValue(screen, 1.5);
            Assert.Equal(1, window.RenderScaling);
            window.Attach(viewModel);
            await WaitForAsync(() => window.IsVisible && window.Bounds.Height > 1);
            await Task.Delay(250);

            // 360 DIP panel = 540 px, and 16 DIP tab = 24 px on the target display.
            Assert.Equal(screen.WorkingArea.X - 516, window.Position.X);
        }
        finally
        {
            window.CloseForShutdown();
            scalingProperty.SetValue(screen, originalScaling);
        }
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
            window.Position.X + (int)Math.Ceiling(window.Bounds.Width) ==
            workingArea.X + ConfirmationOverlayWindow.IdlePeekWidth);
        Assert.Equal(
            workingArea.Y +
            ((workingArea.Height - (int)Math.Ceiling(window.Bounds.Height)) / 2),
            window.Position.Y);
        Assert.True(window.FindControl<Border>("IdleSideTab")?.IsVisible);
        Assert.Equal(0, window.FindControl<Border>("OverlaySurface")!.Opacity);
        var root = window.FindControl<Grid>("OverlayRoot")!;
        await WaitForAsync(() =>
        {
            AvaloniaHeadlessPlatform.ForceRenderTimerTick();
            return root.InputHitTest(new Point(root.Bounds.Width - 5, 3)) is null &&
                   root.InputHitTest(new Point(root.Bounds.Width - 5, root.Bounds.Height / 2)) is not null;
        });
        Assert.NotNull(root.InputHitTest(new Point(root.Bounds.Width - 5, root.Bounds.Height / 2)));

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
        await WaitForAsync(() => window.Position.X == workingArea.X);
        await WaitForAsync(() => viewModel.IsInteractionArmed);
        Assert.True(window.Position.Y > workingArea.Y);
        Assert.False(window.FindControl<Border>("IdleSideTab")?.IsVisible);
        Assert.Equal(1, window.FindControl<Border>("OverlaySurface")!.Opacity);

        var confirmAllButton = window.FindControl<Button>("ConfirmAllButton");
        Assert.NotNull(confirmAllButton);
        Assert.Null(confirmAllButton.Command);
        Assert.NotNull(window.FindControl<ItemsControl>("ConfirmationList"));
        Assert.True(window.IsVisible);

        monitor.Push();
        await WaitForAsync(() =>
            window.Position.X + (int)Math.Ceiling(window.Bounds.Width) ==
            workingArea.X + ConfirmationOverlayWindow.IdlePeekWidth);

        Assert.True(window.IsVisible);
        Assert.Equal("暂无待确认 · 常驻扫描", viewModel.CountText);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task IdleHover_WhenPointerRemainsAtLeftEdge_StaysExpanded()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(),
            monitor,
            new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible && window.Bounds.Height > 1);
        var primaryScreen = window.Screens.Primary;
        Assert.NotNull(primaryScreen);
        var workingArea = primaryScreen.WorkingArea;
        await WaitForAsync(() =>
            window.Position.X + (int)Math.Ceiling(window.Bounds.Width) ==
            workingArea.X + ConfirmationOverlayWindow.IdlePeekWidth);

        window.MouseMove(new Point(window.Bounds.Width - 5, window.Bounds.Height / 2));
        await WaitForAsync(() => window.Position.X == workingArea.X);

        window.MouseMove(new Point(5, window.Bounds.Height / 2));
        await Task.Delay(900);

        Assert.Equal(workingArea.X, window.Position.X);
        window.MouseMove(new Point(window.Bounds.Width + 50, window.Bounds.Height / 2));
        await Task.Delay(150);
        Assert.Equal(workingArea.X, window.Position.X);
        await WaitForAsync(() => window.Position.X + 360 == workingArea.X + 16);
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
        await WaitForAsync(() => window.Position.X < workingArea.X);

        monitor.PushError("扫描连接暂时不可用");

        await WaitForAsync(() => window.Position.X == workingArea.X);
        Assert.True(viewModel.RequiresAttention);
        Assert.Equal("扫描异常 · 请检查", viewModel.CountText);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task ViewButton_OpensExactTaskWithoutSendingOrRemovingCandidate()
    {
        var monitor = new PushMonitor();
        var client = new ClickRecordingClient();
        var navigator = new RecordingThreadNavigator();
        var window = new ConfirmationOverlayWindow(navigator);
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
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
            .Single(candidate => Equals(candidate.Content, "查看"));

        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await Task.Delay(20);
        Assert.Empty(navigator.ThreadIds);

        var point = button.TranslatePoint(
            new Point(button.Bounds.Width / 2, button.Bounds.Height / 2),
            window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);

        await WaitForAsync(() => navigator.ThreadIds.Count == 1);
        Assert.Equal(["thread-1"], navigator.ThreadIds);
        Assert.Equal(0, client.StartCalls);
        Assert.Single(viewModel.Items);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task ViewButton_NavigationFailureKeepsCandidateAndOffersRetry()
    {
        var monitor = new PushMonitor();
        var client = new ClickRecordingClient();
        var navigator = new FailingThreadNavigator();
        var window = new ConfirmationOverlayWindow(navigator);
        await using var viewModel = new ConfirmationOverlayViewModel(
            client,
            monitor,
            new ConfirmationDetector());
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
            .Single(candidate => Equals(candidate.Content, "查看"));
        var point = button.TranslatePoint(
            new Point(button.Bounds.Width / 2, button.Bounds.Height / 2),
            window)!.Value;

        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);

        await WaitForAsync(() => Equals(button.Content, "重试查看"));
        Assert.Equal(1, navigator.Calls);
        Assert.Equal(0, client.StartCalls);
        Assert.Single(viewModel.Items);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task NewCandidate_PlaysTaskSpriteCueAgainWhileAlreadyExpanded()
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

        var sprite = window.FindControl<Border>("TaskSprite");
        var aura = window.FindControl<Border>("TaskSpriteAura");
        var sparkLeft = window.FindControl<Control>("TaskSparkLeft");
        var sparkRight = window.FindControl<Control>("TaskSparkRight");
        var badge = window.FindControl<Border>("AttentionBadge");
        var list = window.FindControl<ItemsControl>("ConfirmationList");
        Assert.NotNull(sprite);
        Assert.NotNull(aura);
        Assert.NotNull(sparkLeft);
        Assert.NotNull(sparkRight);
        Assert.NotNull(badge);
        Assert.NotNull(list);
        Assert.False(badge.IsVisible);
        Assert.Equal(0, aura.Opacity);
        var actionAttempts = 0;
        viewModel.ActionAttempted += _ => actionAttempts++;

        var first = new ConfirmationCandidate(
            "thread-1",
            "待确认任务一",
            "message-1",
            "请确认方案，确认后开始实施。",
            DateTimeOffset.UtcNow);
        monitor.Push(first);

        await WaitForAsync(() => badge.IsVisible && aura.Opacity > 0.2);
        Assert.NotNull(sprite.RenderTransform);
        Assert.NotNull(badge.RenderTransform);
        await WaitForAsync(() => aura.Opacity == 0);

        monitor.Push(first);
        await Task.Delay(120);
        Assert.Equal(1, viewModel.AttentionPulseRevision);
        Assert.Equal(0, aura.Opacity);

        monitor.Push(
            first,
            new ConfirmationCandidate(
                "thread-2",
                "待确认任务二",
                "message-2",
                "要现在打开吗？",
                DateTimeOffset.UtcNow.AddSeconds(1)));

        await WaitForAsync(() => aura.Opacity > 0.2);
        monitor.Push(
            first,
            new ConfirmationCandidate(
                "thread-2",
                "待确认任务二",
                "message-2",
                "要现在打开吗？",
                DateTimeOffset.UtcNow.AddSeconds(1)),
            new ConfirmationCandidate(
                "thread-3",
                "待确认任务三",
                "message-3",
                "是否要立即开始生成？",
                DateTimeOffset.UtcNow.AddSeconds(2)));
        await WaitForAsync(() => viewModel.AttentionPulseRevision == 3);
        await Task.Delay(80);
        Assert.True(aura.Opacity > 0.2);
        Assert.Equal(0, actionAttempts);
        Assert.Equal(0, client.StartCalls);
        window.CloseForShutdown();

        Assert.Equal(0, aura.Opacity);
        Assert.Equal(0, sparkLeft.Opacity);
        Assert.Equal(0, sparkRight.Opacity);
        Assert.Equal(1, badge.Opacity);
        Assert.Equal(1, list.Opacity);
        Assert.Equal(0, actionAttempts);
        Assert.Equal(0, client.StartCalls);
    }

    [AvaloniaFact]
    public async Task AutoConfirmToggle_RejectsProgrammaticClick_ButAcceptsOnePointerClick()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(),
            monitor,
            new ConfirmationDetector());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible);
        var toggle = window.FindControl<ToggleSwitch>("AutoConfirmToggle");
        Assert.NotNull(toggle);

        toggle.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await Task.Delay(20);
        Assert.False(viewModel.IsAutoConfirmEnabled);
        Assert.False(toggle.IsChecked);

        await WaitForAsync(() => window.FindControl<Border>("IdleSideTab")!.IsVisible);
        window.MouseMove(new Point(window.Bounds.Width - 5, window.Bounds.Height / 2));
        await WaitForAsync(() => window.Position.X == window.Screens.Primary!.WorkingArea.X);
        var point = toggle.TranslatePoint(
            new Point(toggle.Bounds.Width / 2, toggle.Bounds.Height / 2),
            window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);

        await WaitForAsync(() => viewModel.IsAutoConfirmEnabled);
        Assert.True(toggle.IsChecked);
        Assert.Equal("自动确认已开启", viewModel.AutoConfirmText);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task AutoConfirmToggle_SaveFailureRestoresTheOffState()
    {
        var monitor = new PushMonitor();
        await using var viewModel = new ConfirmationOverlayViewModel(
            new NoopClient(),
            monitor,
            new ConfirmationDetector(),
            automationSettingsStore: new FailingAutomationSettingsStore());
        var window = new ConfirmationOverlayWindow();
        window.Attach(viewModel);
        await WaitForAsync(() => window.IsVisible);
        var toggle = window.FindControl<ToggleSwitch>("AutoConfirmToggle");
        Assert.NotNull(toggle);
        await WaitForAsync(() => window.FindControl<Border>("IdleSideTab")!.IsVisible);
        window.MouseMove(new Point(window.Bounds.Width - 5, window.Bounds.Height / 2));
        await WaitForAsync(() => window.Position.X == window.Screens.Primary!.WorkingArea.X);
        var point = toggle.TranslatePoint(
            new Point(toggle.Bounds.Width / 2, toggle.Bounds.Height / 2),
            window)!.Value;

        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);

        await WaitForAsync(() => viewModel.HasAutoConfirmError);
        await WaitForAsync(() => toggle.IsChecked == false);
        Assert.False(viewModel.IsAutoConfirmEnabled);
        Assert.False(toggle.IsChecked);
        Assert.True(viewModel.RequiresAttention);
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

    private sealed class LongErrorSettingsStore(string error) : IConfirmationAutomationSettingsStore
    {
        public Task<bool> LoadEnabledAsync(CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task SaveEnabledAsync(bool enabled, CancellationToken cancellationToken = default) =>
            Task.FromException(new IOException(error));
    }

    private sealed class FailingAutomationSettingsStore :
        IConfirmationAutomationSettingsStore
    {
        public Task<bool> LoadEnabledAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult(false);

        public Task SaveEnabledAsync(
            bool value,
            CancellationToken cancellationToken = default) =>
            throw new IOException("settings locked");
    }

    private sealed class RecordingThreadNavigator : ICodexThreadNavigator
    {
        public List<string> ThreadIds { get; } = [];

        public Task OpenAsync(
            string threadId,
            CancellationToken cancellationToken = default)
        {
            ThreadIds.Add(threadId);
            return Task.CompletedTask;
        }
    }

    private sealed class FailingThreadNavigator : ICodexThreadNavigator
    {
        public int Calls { get; private set; }

        public Task OpenAsync(
            string threadId,
            CancellationToken cancellationToken = default)
        {
            Calls++;
            throw new InvalidOperationException("navigation failed");
        }
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
