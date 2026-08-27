using Avalonia.Controls;
using Avalonia.Input;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class FloatingLauncherWindowTests
{
    [Fact]
    public void Placement_SnapsToNearestHorizontalEdgeAndClampsVertically()
    {
        var placement = new FloatingLauncherPlacement(edgeMargin: 16);
        var workingArea = new PixelRect(100, 40, 1400, 900);
        var size = new PixelSize(72, 72);

        Assert.Equal(
            new PixelPoint(116, 56),
            placement.ResolveSnapped(
                workingArea,
                new PixelPoint(250, -100),
                size));
        Assert.Equal(
            new PixelPoint(1412, 852),
            placement.ResolveSnapped(
                workingArea,
                new PixelPoint(1320, 1200),
                size));
    }

    [Fact]
    public void Placement_UsesSavedPositionButKeepsItVisible()
    {
        var placement = new FloatingLauncherPlacement(edgeMargin: 16);

        var position = placement.ResolveInitial(
            new PixelRect(0, 0, 1920, 1040),
            new PixelSize(72, 72),
            savedLeft: 5000,
            savedTop: 460);

        Assert.Equal(new PixelPoint(1832, 460), position);
    }

    [Fact]
    public void Placement_RestoresSavedPositionOnItsSecondaryDisplay()
    {
        var placement = new FloatingLauncherPlacement(edgeMargin: 16);
        var primary = new PixelRect(0, 0, 1920, 1040);
        var secondary = new PixelRect(1920, -200, 2560, 1440);

        var position = placement.ResolveInitialAcrossDisplays(
            [primary, secondary],
            primary,
            new PixelSize(72, 72),
            savedLeft: 4350,
            savedTop: 280);

        Assert.Equal(new PixelPoint(4392, 280), position);
    }

    [AvaloniaFact]
    public void Launcher_IsCompactTopmostAndExposesPrimaryActions()
    {
        var window = new FloatingLauncherWindow();

        Assert.True(window.Topmost);
        Assert.False(window.ShowInTaskbar);
        Assert.False(window.ShowActivated);
        Assert.False(window.CanResize);
        Assert.Equal(SystemDecorations.None, window.SystemDecorations);
        Assert.Equal(72, window.Width);
        Assert.Equal(72, window.Height);
        Assert.NotNull(window.FindControl<Border>("LauncherSurface"));
        Assert.NotNull(window.FindControl<Border>("AttentionBadge"));
        Assert.NotNull(window.FindControl<MenuItem>("OpenWorkbenchMenuItem"));
        Assert.NotNull(window.FindControl<MenuItem>("FullScreenMenuItem"));
        Assert.NotNull(window.FindControl<MenuItem>("RefreshMenuItem"));
        Assert.NotNull(window.FindControl<MenuItem>("ExitMenuItem"));
    }

    [AvaloniaFact]
    public void Launcher_PrimaryClickRequestsWorkbenchToggle()
    {
        var window = new FloatingLauncherWindow();
        var requests = 0;
        window.ToggleWorkbenchRequested += () => requests++;
        var surface = window.FindControl<Border>("LauncherSurface");
        Assert.NotNull(surface);
        window.Show();

        window.MouseDown(
            new Point(36, 36),
            MouseButton.Left,
            RawInputModifiers.None);
        window.MouseUp(
            new Point(36, 36),
            MouseButton.Left,
            RawInputModifiers.None);

        Assert.Equal(1, requests);
        window.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task Launcher_CaptureLossEndsDragWithoutOpeningAndStillSnaps()
    {
        var window = new FloatingLauncherWindow();
        var requests = 0;
        var commits = 0;
        window.ToggleWorkbenchRequested += () => requests++;
        window.PositionCommitted += _ => commits++;
        window.Show();
        var surface = window.FindControl<Border>("LauncherSurface")!;
        var workingArea = window.Screens.Primary!.WorkingArea;

        window.MouseDown(
            new Point(36, 36),
            MouseButton.Left,
            RawInputModifiers.None);
        window.Position = new PixelPoint(
            workingArea.X + (workingArea.Width / 2),
            workingArea.Y + 180);
        surface.RaiseEvent(new PointerCaptureLostEventArgs(
            surface,
            new Pointer(7, PointerType.Mouse, isPrimary: true)));
        await Task.Delay(300);
        window.MouseUp(
            new Point(36, 36),
            MouseButton.Left,
            RawInputModifiers.None);

        var expected = new FloatingLauncherPlacement().ResolveSnapped(
            workingArea,
            new PixelPoint(
                workingArea.X + (workingArea.Width / 2),
                workingArea.Y + 180),
            new PixelSize(72, 72));
        Assert.Equal(expected, window.Position);
        Assert.Equal(1, commits);
        Assert.Equal(0, requests);
        window.CloseForShutdown();
    }

    [Fact]
    public async Task StartupSequence_DoesNotExposeLauncherBeforeSettingsLoad()
    {
        var initialization = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = new List<string>();

        var startup = FloatingWorkbenchStartup.StartAsync(
            async () =>
            {
                calls.Add("initialize:start");
                await initialization.Task;
                calls.Add("initialize:end");
            },
            () => calls.Add("monitor"),
            () => calls.Add("position"),
            () => calls.Add("show"));
        await Task.Delay(30);

        Assert.Equal(["monitor", "initialize:start"], calls);

        initialization.SetResult();
        await startup;

        Assert.Equal(
            ["monitor", "initialize:start", "initialize:end", "position", "show"],
            calls);
    }

    [AvaloniaFact]
    public void Controller_PrimaryClickTogglesWorkbenchAndKeepsLauncherVisible()
    {
        var launcher = new FloatingLauncherWindow();
        var workbench = new MainWindow { CollapseToLauncherOnClose = true };
        using var controller = new FloatingWorkbenchController(
            launcher,
            workbench,
            () => { },
            () => { },
            () => { });
        controller.Start();

        ClickLauncher(launcher);
        Assert.True(workbench.IsVisible);
        Assert.True(launcher.IsVisible);
        Assert.Equal("−", launcher.FindControl<TextBlock>("LauncherGlyph")?.Text);
        Assert.Equal(
            "收起工作台",
            launcher.FindControl<MenuItem>("OpenWorkbenchMenuItem")?.Header);

        ClickLauncher(launcher);
        Assert.False(workbench.IsVisible);
        Assert.True(launcher.IsVisible);
        Assert.Equal("C", launcher.FindControl<TextBlock>("LauncherGlyph")?.Text);
        Assert.Equal(
            "打开工作台",
            launcher.FindControl<MenuItem>("OpenWorkbenchMenuItem")?.Header);

        launcher.CloseForShutdown();
        workbench.CloseForShutdown();
    }

    [AvaloniaFact]
    public async Task Controller_InitializesWorkbenchOnlyOnFirstOpen()
    {
        var launcher = new FloatingLauncherWindow();
        var workbench = new MainWindow { CollapseToLauncherOnClose = true };
        var initializationCalls = 0;
        var initializationCompletion = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        using var controller = new FloatingWorkbenchController(
            launcher,
            workbench,
            () => { },
            () => { },
            () => { },
            initializeWorkbenchAsync: async () =>
            {
                initializationCalls++;
                await initializationCompletion.Task;
            });

        controller.Start();
        Assert.Equal(0, initializationCalls);

        ClickLauncher(launcher);
        Assert.True(workbench.IsVisible);
        Assert.Equal(1, initializationCalls);

        ClickLauncher(launcher);
        ClickLauncher(launcher);
        Assert.True(workbench.IsVisible);
        Assert.Equal(1, initializationCalls);

        initializationCompletion.SetResult();
        await Task.Delay(10);
        launcher.CloseForShutdown();
        workbench.CloseForShutdown();
    }

    [AvaloniaFact]
    public void Controller_ContextActionsOpenFullscreenRefreshAndExitOnce()
    {
        var launcher = new FloatingLauncherWindow();
        var workbench = new MainWindow { CollapseToLauncherOnClose = true };
        var fullScreenCalls = 0;
        var refreshCalls = 0;
        var exitCalls = 0;
        using var controller = new FloatingWorkbenchController(
            launcher,
            workbench,
            () => fullScreenCalls++,
            () => refreshCalls++,
            () => exitCalls++);
        controller.Start();

        launcher.FindControl<MenuItem>("FullScreenMenuItem")!
            .RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(MenuItem.ClickEvent));
        launcher.FindControl<MenuItem>("RefreshMenuItem")!
            .RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(MenuItem.ClickEvent));
        launcher.FindControl<MenuItem>("ExitMenuItem")!
            .RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(MenuItem.ClickEvent));
        launcher.FindControl<MenuItem>("ExitMenuItem")!
            .RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(MenuItem.ClickEvent));

        Assert.True(workbench.IsVisible);
        Assert.Equal(1, fullScreenCalls);
        Assert.Equal(1, refreshCalls);
        Assert.Equal(1, exitCalls);

        launcher.CloseForShutdown();
        workbench.CloseForShutdown();
    }

    private static void ClickLauncher(FloatingLauncherWindow window)
    {
        window.MouseDown(
            new Point(36, 36),
            MouseButton.Left,
            RawInputModifiers.None);
        window.MouseUp(
            new Point(36, 36),
            MouseButton.Left,
            RawInputModifiers.None);
    }
}
