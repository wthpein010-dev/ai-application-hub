using Avalonia.Automation;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Primitives.PopupPositioning;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;
using CodexQuotaBar.App.Controls;
using CodexQuotaBar.App.Pets;
using CodexQuotaBar.App.Views;
using CodexQuotaBar.Core.Pets;
using CodexQuotaBar.Core.Platform;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Quota;
using CodexQuotaBar.Core.Settings;
using CodexQuotaBar.Core.Tasks;
using CodexQuotaBar.Core.ViewModels;

namespace CodexQuotaBar.Tests.UI;

public sealed class MainWindowLayoutTests
{
    [Fact]
    public void Placement_uses_physical_window_size_at_scaled_dpi()
    {
        var workingArea = new PixelRect(1920, 0, 1920, 1080);

        var position = WindowPlacementCalculator.TopRight(
            workingArea,
            logicalWidth: 370,
            logicalHeight: 230,
            scaling: 1.5,
            margin: 18);
        var clamped = WindowPlacementCalculator.Clamp(
            new PixelPoint(3800, 1000),
            workingArea,
            logicalWidth: 370,
            logicalHeight: 230,
            scaling: 1.5);

        Assert.Equal(new PixelPoint(3267, 18), position);
        Assert.Equal(new PixelPoint(3285, 735), clamped);
    }

    [AvaloniaFact]
    public void Quota_only_fallback_keeps_existing_dimensions()
    {
        var window = new MainWindow();

        Assert.Equal(370, window.Width);
        Assert.Equal(230, window.Height);
        Assert.Equal(370, window.MinWidth);
        Assert.Equal(370, window.MaxWidth);
        Assert.False(window.CanResize);
        Assert.True(window.Topmost);
        Assert.False(window.ShowInTaskbar);
        Assert.Equal(SystemDecorations.None, window.SystemDecorations);
    }

    [AvaloniaFact]
    public void Integrated_template_contains_exactly_one_pet_renderer()
    {
        var window = new MainWindow();
        window.Show();
        try
        {
            var pets = window.GetVisualDescendants().OfType<PetSpriteControl>().ToArray();

            Assert.Single(pets);
            Assert.Null(window.FindControl<QuotaHaloControl>("QuotaHalo"));
            Assert.NotNull(window.FindControl<Border>("PetQuotaStrip"));
            Assert.NotNull(window.FindControl<Border>("TaskNotification"));
            Assert.NotNull(window.FindControl<Border>("PetQuotaDetails"));
        }
        finally
        {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Integrated_surfaces_have_stable_sizes_and_accessible_close_controls()
    {
        var window = new MainWindow();

        var quotaStrip = window.FindControl<Border>("PetQuotaStrip");
        var quotaPercent = window.FindControl<TextBlock>("PetQuotaPercent");
        var quotaProgress = window.FindControl<ProgressBar>("PetQuotaProgress");
        var petColumn = window.FindControl<Canvas>("PetColumn");
        var petDragSurface = window.FindControl<Border>("PetDragSurface");
        var sideLane = window.FindControl<Canvas>("PetSideLane");
        var notification = window.FindControl<Border>("TaskNotification");
        var details = window.FindControl<Border>("PetQuotaDetails");
        var notificationClose = window.FindControl<Button>("TaskNotificationCloseButton");
        var detailsClose = window.FindControl<Button>("PetQuotaDetailsCloseButton");

        Assert.NotNull(quotaStrip);
        Assert.NotNull(quotaPercent);
        Assert.NotNull(quotaProgress);
        Assert.NotNull(petColumn);
        Assert.NotNull(petDragSurface);
        Assert.NotNull(sideLane);
        Assert.NotNull(notification);
        Assert.NotNull(details);
        Assert.NotNull(notificationClose);
        Assert.NotNull(detailsClose);
        Assert.Equal(168, quotaStrip.Width);
        Assert.Equal(72, quotaStrip.Height);
        Assert.Equal(28, quotaPercent.FontSize);
        Assert.Equal(8, quotaProgress.Height);
        Assert.Equal(168, petColumn.Width);
        Assert.Equal(200, petColumn.Height);
        Assert.Equal(24, Canvas.GetLeft(petDragSurface));
        Assert.Equal(66, Canvas.GetTop(petDragSurface));
        Assert.Equal(120, petDragSurface.Width);
        Assert.Equal(130, petDragSurface.Height);
        Assert.Equal(224, sideLane.Width);
        Assert.Equal(184, sideLane.Height);
        Assert.Equal(224, notification.Width);
        Assert.Equal(82, notification.Height);
        Assert.Equal(0, Canvas.GetTop(notification));
        Assert.Equal(224, details.Width);
        Assert.Equal(84, details.Height);
        Assert.Equal(92, Canvas.GetTop(details));
        Assert.Empty(details.GetVisualDescendants().OfType<ProgressBar>());
        Assert.DoesNotContain(
            details.GetVisualDescendants().OfType<TextBlock>(),
            textBlock => string.Equals(textBlock.Name, "PetQuotaPercent", StringComparison.Ordinal));
        Assert.Equal("额度详情", ToolTip.GetTip(petDragSurface));
        Assert.Equal("显示或隐藏额度详情", AutomationProperties.GetName(petDragSurface));
        Assert.Equal("显示或隐藏额度详情", AutomationProperties.GetName(window.FindControl<Button>("PetQuotaStripButton")!));
        Assert.Equal("关闭任务完成提示", AutomationProperties.GetName(notificationClose));
        Assert.Equal("关闭额度详情", ToolTip.GetTip(detailsClose));
        Assert.Equal("关闭额度详情", AutomationProperties.GetName(detailsClose));
        Assert.Equal("额度详情", window.FindControl<TextBlock>("PetQuotaDetailsTitle")!.Text);
        Assert.Equal("重置额度", window.FindControl<TextBlock>("PetQuotaDetailsCreditsLabel")!.Text);
        Assert.Equal("重置时间", window.FindControl<TextBlock>("PetQuotaDetailsResetLabel")!.Text);
    }

    [AvaloniaFact]
    public async Task Bundled_pet_keeps_one_renderer_and_the_approved_host_geometry()
    {
        var screen = new DashboardScreen(
            "screen",
            new PixelRect(0, 0, 1200, 800),
            new PixelRect(0, 0, 1200, 800),
            1);
        using var runtime = await WindowRuntime.StartAsync(
            screen,
            AppSettings.Default with { PetEnabled = true },
            new StubPetProvider(BundledPet));
        await runtime.InitializationTask;

        var renderers = runtime.Window.GetVisualDescendants()
            .OfType<PetSpriteControl>()
            .Where(renderer => renderer.IsVisible)
            .ToArray();

        Assert.Single(renderers);
        Assert.Equal(168, runtime.Window.Width);
        Assert.Equal(200, runtime.Window.Height);
        Assert.Equal(224, runtime.Window.FindControl<Canvas>("PetSideLane")!.Width);
        Assert.Equal(184, runtime.Window.FindControl<Canvas>("PetSideLane")!.Height);
    }

    [AvaloniaFact]
    public void Named_panels_and_icon_buttons_have_stable_sizes_and_accessible_names()
    {
        var window = new MainWindow();
        window.Show();

        var expanded = window.FindControl<Panel>("ExpandedPanel");
        var collapsed = window.FindControl<Panel>("CollapsedPanel");
        var collapseButton = window.FindControl<Button>("CollapseButton");
        var closeButton = window.FindControl<Button>("CloseButton");
        var collapsedPercent = window.FindControl<TextBlock>("CollapsedPercent");
        var collapsedProgress = window.FindControl<ProgressBar>("CollapsedProgress");

        Assert.NotNull(expanded);
        Assert.NotNull(collapsed);
        Assert.Equal(40, collapsed!.Height);
        Assert.Equal(28, collapseButton!.Width);
        Assert.Equal(28, closeButton!.Width);
        Assert.Equal(46, collapsedPercent!.Width);
        Assert.Equal(90, collapsedProgress!.Width);
        Assert.Equal(0, collapsedProgress.MinWidth);
        Assert.False(collapsedProgress.ShowProgressText);
        Assert.Equal("折叠用量窗口", AutomationProperties.GetName(collapseButton));
        Assert.Equal("隐藏到托盘", AutomationProperties.GetName(closeButton));
        window.Close();
    }

    [AvaloniaFact]
    public void Fallback_header_has_a_stable_neutral_pet_toggle_without_a_thumbnail()
    {
        var window = new MainWindow();

        var button = window.FindControl<Button>("PetToggleButton");
        var expanded = window.FindControl<Panel>("ExpandedPanel");

        Assert.NotNull(button);
        Assert.Equal(28, button!.Width);
        Assert.Equal("开启或关闭桌宠", AutomationProperties.GetName(button));
        Assert.Null(window.FindControl<PetSpriteControl>("HeaderPetPreview"));
        Assert.Empty(expanded!.GetVisualDescendants().OfType<PetSpriteControl>());
    }

    [AvaloniaFact]
    public async Task Corrupt_pet_bitmap_keeps_the_quota_only_fallback_available()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"quota-window-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        var settingsStore = new JsonSettingsStore(directory);
        await settingsStore.SaveAsync(AppSettings.Default with { PetEnabled = true });
        using var viewModel = new MainWindowViewModel(
            new StubQuotaSource(),
            new StubPetProvider(new PetAsset(
                "corrupt",
                "Corrupt",
                [1, 2, 3],
                PetAssetFormat.CodexWebpAtlas,
                PetAssetSource.Codex)),
            settingsStore,
            new StubPlatformServices(directory),
            TimeProvider.System,
            () => { },
            action =>
            {
                if (Dispatcher.UIThread.CheckAccess())
                {
                    action();
                    return;
                }

                Dispatcher.UIThread.InvokeAsync(action).Wait();
            });
        var window = new MainWindow
        {
            DataContext = viewModel,
        };

        try
        {
            window.Show();
            await viewModel.InitializeAsync();

            Assert.True(window.FindControl<Border>("QuotaOnlyPanel")!.IsVisible);
            Assert.False(window.FindControl<Canvas>("PetDashboardPanel")!.IsVisible);
            Assert.Equal(370, window.Width);
            Assert.Equal(230, window.Height);
        }
        finally
        {
            window.CloseForQuit();
            Directory.Delete(directory, recursive: true);
        }
    }

    [AvaloniaFact]
    public async Task Integrated_runtime_allocates_details_and_notifications_without_moving_the_pet()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var initialAnchor = VisiblePetAnchor(runtime.Window, scaling: 1);

        Assert.Equal(168, runtime.Window.Width);
        Assert.Equal(200, runtime.Window.Height);
        Assert.True(runtime.Window.FindControl<Canvas>("PetDashboardPanel")!.IsVisible);
        Assert.False(runtime.Window.FindControl<Border>("QuotaOnlyPanel")!.IsVisible);
        var initialBounds = HostBounds(runtime.Window);
        var petColumn = runtime.Window.FindControl<Canvas>("PetColumn")!;
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        var notification = runtime.Window.FindControl<Border>("TaskNotification")!;
        var details = runtime.Window.FindControl<Border>("PetQuotaDetails")!;
        var notificationClose = runtime.Window.FindControl<Button>("TaskNotificationCloseButton")!;

        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);

        Assert.Equal(initialBounds, HostBounds(runtime.Window));
        Assert.True(details.IsVisible);
        Assert.True(popup.IsOpen);
        Assert.Same(petColumn, popup.PlacementTarget);
        Assert.False(popup.IsLightDismissEnabled);
        Assert.False(popup.WindowManagerAddShadowHint);
        Assert.Equal(PlacementMode.RightEdgeAlignedTop, popup.Placement);
        Assert.Equal(10, popup.HorizontalOffset);
        Assert.Equal(0, popup.VerticalOffset);
        Assert.Equal(PopupPositionerConstraintAdjustment.None, popup.PlacementConstraintAdjustment);
        Assert.Equal(runtime.Window.Topmost, popup.Topmost);
        Assert.DoesNotContain(
            details.GetVisualDescendants().OfType<TextBlock>(),
            textBlock => textBlock.Text?.EndsWith('%') == true);
        Assert.Equal(initialAnchor, VisiblePetAnchor(runtime.Window, scaling: 1));

        runtime.TaskSource.Emit(Completion("one"));

        Assert.Equal(initialBounds, HostBounds(runtime.Window));
        Assert.True(notification.IsVisible);
        Assert.True(details.IsVisible);
        Assert.True(popup.IsOpen);
        Assert.Equal("任务已完成", runtime.Window.FindControl<TextBlock>("TaskNotificationTitle")!.Text);
        Assert.Equal("工作区", runtime.Window.FindControl<TextBlock>("TaskWorkspaceLabel")!.Text);
        Assert.Equal("耗时", runtime.Window.FindControl<TextBlock>("TaskDurationLabel")!.Text);
        Assert.Equal("关闭", ToolTip.GetTip(notificationClose));
        Assert.Contains(
            notification.GetVisualDescendants().OfType<TextBlock>(),
            textBlock => string.Equals(textBlock.Text, "Task completed", StringComparison.Ordinal));
        Assert.Equal(initialAnchor, VisiblePetAnchor(runtime.Window, scaling: 1));

        Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);
        Assert.Equal(initialBounds, HostBounds(runtime.Window));
        Assert.False(details.IsVisible);
        Assert.True(notification.IsVisible);
        Assert.True(popup.IsOpen);
        Assert.NotNull(notificationClose.Command);
        notificationClose.Command.Execute(notificationClose.CommandParameter);

        Assert.Equal(initialBounds, HostBounds(runtime.Window));
        Assert.False(notification.IsVisible);
        Assert.False(details.IsVisible);
        Assert.False(popup.IsOpen);
        Assert.Equal(initialAnchor, VisiblePetAnchor(runtime.Window, scaling: 1));

        for (var toggle = 0; toggle < 20; toggle++)
        {
            Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
            Assert.Equal(initialBounds, HostBounds(runtime.Window));
            Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);
            Assert.Equal(initialBounds, HostBounds(runtime.Window));
        }
    }

    [AvaloniaFact]
    public async Task Shared_popup_stays_open_for_combined_card_visibility_changes()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        var notification = runtime.Window.FindControl<Border>("TaskNotification")!;
        var details = runtime.Window.FindControl<Border>("PetQuotaDetails")!;
        var notificationClose = runtime.Window.FindControl<Button>("TaskNotificationCloseButton")!;
        var openStates = new List<bool>();

        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
        Assert.True(popup.IsOpen);
        popup.PropertyChanged += OnPopupPropertyChanged;
        try
        {
            runtime.TaskSource.Emit(Completion("first"));
            Assert.True(notification.IsVisible);
            Assert.True(details.IsVisible);
            Assert.True(popup.IsOpen);
            Assert.Empty(openStates);

            Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);
            Assert.True(notification.IsVisible);
            Assert.False(details.IsVisible);
            Assert.True(popup.IsOpen);
            Assert.Empty(openStates);

            Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
            Assert.True(notification.IsVisible);
            Assert.True(details.IsVisible);
            Assert.True(popup.IsOpen);
            Assert.Empty(openStates);

            notificationClose.Command!.Execute(notificationClose.CommandParameter);
            Assert.False(notification.IsVisible);
            Assert.True(details.IsVisible);
            Assert.True(popup.IsOpen);
            Assert.Empty(openStates);

            runtime.TaskSource.Emit(Completion("second"));
            Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);
            Assert.True(notification.IsVisible);
            Assert.False(details.IsVisible);
            Assert.True(popup.IsOpen);
            Assert.Empty(openStates);

            notificationClose.Command.Execute(notificationClose.CommandParameter);
            Assert.False(notification.IsVisible);
            Assert.False(details.IsVisible);
            Assert.False(popup.IsOpen);
            Assert.Equal([false], openStates);
        }
        finally
        {
            popup.PropertyChanged -= OnPopupPropertyChanged;
        }

        void OnPopupPropertyChanged(object? sender, AvaloniaPropertyChangedEventArgs args)
        {
            if (args.Property == Popup.IsOpenProperty)
            {
                openStates.Add(popup.IsOpen);
            }
        }
    }

    [AvaloniaFact]
    public async Task Side_popup_tracks_topmost_and_closes_for_app_hide_and_quota_fallback()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);

        await runtime.ViewModel.ToggleAlwaysOnTopAsync();

        Assert.False(runtime.Window.Topmost);
        Assert.False(popup.Topmost);
        Assert.True(popup.IsOpen);

        runtime.ViewModel.Hide();

        Assert.False(runtime.Window.IsVisible);
        Assert.False(popup.IsOpen);

        runtime.ViewModel.Show();

        Assert.True(runtime.Window.IsVisible);
        Assert.True(popup.IsOpen);

        await runtime.ViewModel.TogglePetAsync();

        Assert.True(runtime.Window.FindControl<Border>("QuotaOnlyPanel")!.IsVisible);
        Assert.False(popup.IsOpen);
    }

    [AvaloniaFact]
    public async Task Hidden_window_keeps_side_popup_closed_for_a_later_task_notification()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;

        runtime.ViewModel.Hide();
        Assert.False(runtime.Window.IsVisible);
        Assert.False(popup.IsOpen);

        runtime.TaskSource.Emit(Completion("hidden"));

        Assert.False(runtime.Window.IsVisible);
        Assert.False(popup.IsOpen);
    }

    [AvaloniaFact]
    public async Task Side_popup_closes_when_the_data_context_is_reset()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
        Assert.True(popup.IsOpen);

        runtime.Window.DataContext = null;

        Assert.False(popup.IsOpen);
        Assert.True(runtime.Window.FindControl<Border>("QuotaOnlyPanel")!.IsVisible);
    }

    [AvaloniaFact]
    public async Task Constrained_runtime_request_keeps_compact_bounds_and_anchor()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 500, 400), new PixelRect(0, 0, 500, 400), 1),
            new WindowPlacement("screen", 190, 124, IsPetAnchor: true));
        var initialAnchor = VisiblePetAnchor(runtime.Window, scaling: 1);

        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
        runtime.TaskSource.Emit(Completion("one"));

        Assert.Equal(new PixelPoint(190, 124), initialAnchor);
        Assert.Equal(168, runtime.Window.Width);
        Assert.Equal(200, runtime.Window.Height);
        Assert.False(runtime.Window.FindControl<Border>("TaskNotification")!.IsVisible);
        Assert.False(runtime.Window.FindControl<Border>("PetQuotaDetails")!.IsVisible);
        Assert.Equal(initialAnchor, VisiblePetAnchor(runtime.Window, scaling: 1));
    }

    [AvaloniaFact]
    public async Task Side_popup_opens_only_after_constrained_transition_and_visible_flip_are_fully_prepared()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("constrained", new PixelRect(0, 0, 500, 400), new PixelRect(0, 0, 500, 400), 1),
            new WindowPlacement("constrained", 190, 124, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        var notification = runtime.Window.FindControl<Border>("TaskNotification")!;
        var details = runtime.Window.FindControl<Border>("PetQuotaDetails")!;
        var openStates = new List<bool>();
        var openingSnapshots = new List<(
            PixelPoint OwnerPosition,
            PlacementMode Placement,
            double HorizontalOffset,
            bool NotificationVisible,
            bool DetailsVisible,
            bool Topmost)>();
        var livePlacementMutations = new List<string>();

        popup.PropertyChanged += OnPopupPropertyChanged;
        try
        {
            Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
            Assert.False(popup.IsOpen);

            runtime.ScreenProvider.Current = new DashboardScreen(
                "allocatable",
                new PixelRect(1000, 0, 800, 600),
                new PixelRect(1000, 0, 800, 600),
                1);
            runtime.TaskSource.Emit(Completion("allocatable"));

            var initialOpening = Assert.Single(openingSnapshots);
            Assert.Equal(new PixelPoint(1000, 58), initialOpening.OwnerPosition);
            Assert.Equal(PlacementMode.RightEdgeAlignedTop, initialOpening.Placement);
            Assert.Equal(10, initialOpening.HorizontalOffset);
            Assert.True(initialOpening.NotificationVisible);
            Assert.True(initialOpening.DetailsVisible);
            Assert.Equal(runtime.Window.Topmost, initialOpening.Topmost);
            Assert.Empty(livePlacementMutations);

            openStates.Clear();
            openingSnapshots.Clear();
            livePlacementMutations.Clear();
            runtime.Window.Position = new PixelPoint(1632, 58);

            Assert.Equal([false, true], openStates);
            var flippedOpening = Assert.Single(openingSnapshots);
            Assert.Equal(new PixelPoint(1632, 58), flippedOpening.OwnerPosition);
            Assert.Equal(PlacementMode.LeftEdgeAlignedTop, flippedOpening.Placement);
            Assert.Equal(-10, flippedOpening.HorizontalOffset);
            Assert.True(flippedOpening.NotificationVisible);
            Assert.True(flippedOpening.DetailsVisible);
            Assert.Equal(runtime.Window.Topmost, flippedOpening.Topmost);
            Assert.Empty(livePlacementMutations);
        }
        finally
        {
            popup.PropertyChanged -= OnPopupPropertyChanged;
        }

        void OnPopupPropertyChanged(object? sender, AvaloniaPropertyChangedEventArgs args)
        {
            if (args.Property == Popup.IsOpenProperty)
            {
                openStates.Add(popup.IsOpen);
                if (popup.IsOpen)
                {
                    openingSnapshots.Add((
                        runtime.Window.Position,
                        popup.Placement,
                        popup.HorizontalOffset,
                        notification.IsVisible,
                        details.IsVisible,
                        popup.Topmost));
                }

                return;
            }

            if (popup.IsOpen
                && args.Property.Name is nameof(Popup.Placement)
                    or nameof(Popup.HorizontalOffset)
                    or nameof(Popup.VerticalOffset)
                    or nameof(Popup.Topmost))
            {
                livePlacementMutations.Add(args.Property.Name);
            }
        }
    }

    [AvaloniaFact]
    public async Task Compact_layout_failure_uses_complete_collapsible_quota_fallback()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("tiny", new PixelRect(0, 0, 135, 400), new PixelRect(0, 0, 135, 400), 1),
            new WindowPlacement("tiny", 8, 124, IsPetAnchor: true));

        AssertQuotaFallback(runtime.Window, expectedHeight: 230);

        await runtime.ViewModel.ToggleCollapsedAsync();

        AssertQuotaFallback(runtime.Window, expectedHeight: 48);
    }

    [AvaloniaFact]
    public async Task Compact_layout_failure_clears_a_previously_allocated_lane()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1000, 600), new PixelRect(0, 0, 1000, 600), 1),
            new WindowPlacement("screen", 408, 124, IsPetAnchor: true));
        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
        Assert.Equal(168, runtime.Window.Width);

        runtime.ScreenProvider.Current = new DashboardScreen(
            "tiny",
            new PixelRect(0, 0, 135, 400),
            new PixelRect(0, 0, 135, 400),
            1);
        Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);

        AssertQuotaFallback(runtime.Window, expectedHeight: 230);
        Assert.False(runtime.Window.FindControl<Border>("TaskNotification")!.IsVisible);
        Assert.False(runtime.Window.FindControl<Border>("PetQuotaDetails")!.IsVisible);
    }

    [AvaloniaFact]
    public async Task Placement_restores_and_saves_the_visible_pet_anchor()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));

        Assert.Equal(new PixelPoint(508, 300), VisiblePetAnchor(runtime.Window, scaling: 1));

        runtime.Window.Position = new PixelPoint(
            runtime.Window.Position.X + 20,
            runtime.Window.Position.Y + 10);
        var expected = new PixelPoint(528, 310);
        var saved = await WaitForPlacementAsync(runtime.SettingsStore, expected);

        Assert.Equal(expected, VisiblePetAnchor(runtime.Window, scaling: 1));
        Assert.Equal(expected.X, saved.X);
        Assert.Equal(expected.Y, saved.Y);
        Assert.True(saved.IsPetAnchor);
    }

    [AvaloniaFact]
    public async Task Production_startup_defers_placement_restore_and_save_until_settings_are_ready()
    {
        var screen = new DashboardScreen(
            "screen",
            new PixelRect(0, 0, 1200, 800),
            new PixelRect(0, 0, 1200, 800),
            1);
        var expectedSettings = AppSettings.Default with
        {
            AlwaysOnTop = false,
            PetEnabled = true,
            TaskNotificationsEnabled = false,
            Placement = new WindowPlacement("screen", 508, 300, IsPetAnchor: true),
        };
        var petProvider = new BlockingPetProvider();
        using var runtime = await WindowRuntime.StartAsync(screen, expectedSettings, petProvider);
        await petProvider.WaitUntilRequestedAsync();

        runtime.Window.Position = new PixelPoint(50, 60);
        await Task.Delay(500);
        var beforeInitialization = await runtime.SettingsStore.LoadAsync();

        petProvider.Complete(ValidPet);
        await runtime.InitializationTask;

        Assert.Equal(expectedSettings, beforeInitialization);
        Assert.Equal(new PixelPoint(508, 300), VisiblePetAnchor(runtime.Window, scaling: 1));
    }

    [AvaloniaFact]
    public async Task Quota_only_placement_restores_and_saves_the_raw_window_position()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 250, 160),
            petEnabled: false);

        Assert.Equal(new PixelPoint(250, 160), runtime.Window.Position);

        runtime.Window.Position = new PixelPoint(270, 170);
        var saved = await WaitForPlacementAsync(runtime.SettingsStore, runtime.Window.Position);

        Assert.Equal(270, saved.X);
        Assert.Equal(170, saved.Y);
        Assert.False(saved.IsPetAnchor);
    }

    [AvaloniaFact]
    public async Task Disabling_moving_and_reenabling_pet_uses_the_live_quota_position()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));

        await runtime.ViewModel.TogglePetAsync();
        runtime.Window.Position = new PixelPoint(250, 160);
        var savedQuota = await WaitForPlacementAsync(runtime.SettingsStore, runtime.Window.Position);

        await runtime.ViewModel.TogglePetAsync();

        Assert.False(savedQuota.IsPetAnchor);
        Assert.Equal(new PixelPoint(274, 226), VisiblePetAnchor(runtime.Window, scaling: 1));
        Assert.NotEqual(new PixelPoint(508, 300), VisiblePetAnchor(runtime.Window, scaling: 1));
    }

    [AvaloniaFact]
    public async Task Runtime_screen_transition_keeps_visible_anchor_from_one_to_one_and_a_half_to_two_x()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 4000, 3000), new PixelRect(0, 0, 4000, 3000), 1),
            new WindowPlacement("screen", 1000, 1500, IsPetAnchor: true));
        var anchor = VisiblePetAnchor(runtime.Window, scaling: 1);

        runtime.ScreenProvider.Current = new DashboardScreen(
            "screen",
            new PixelRect(0, 0, 4000, 3000),
            new PixelRect(0, 0, 4000, 3000),
            1.5);
        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);

        Assert.Equal(anchor, VisiblePetAnchor(runtime.Window, scaling: 1.5));

        runtime.ScreenProvider.Current = new DashboardScreen(
            "screen",
            new PixelRect(0, 0, 4000, 3000),
            new PixelRect(0, 0, 4000, 3000),
            2);
        Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);

        Assert.Equal(anchor, VisiblePetAnchor(runtime.Window, scaling: 2));
        Assert.Equal(168, runtime.Window.Width);
    }

    [AvaloniaFact]
    public async Task Runtime_lane_flip_and_close_keep_the_visible_anchor()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 800, 600), new PixelRect(0, 0, 800, 600), 1),
            new WindowPlacement("screen", 8, 124, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
        Assert.Equal(0, Canvas.GetLeft(runtime.Window.FindControl<Canvas>("PetColumn")!));
        Assert.Equal(PlacementMode.RightEdgeAlignedTop, popup.Placement);
        Assert.Equal(10, popup.HorizontalOffset);

        runtime.Window.Position = new PixelPoint(
            runtime.Window.Position.X + 664,
            runtime.Window.Position.Y);

        var flippedAnchor = new PixelPoint(656, 124);
        Assert.Equal(0, Canvas.GetLeft(runtime.Window.FindControl<Canvas>("PetColumn")!));
        Assert.Equal(PlacementMode.LeftEdgeAlignedTop, popup.Placement);
        Assert.Equal(-10, popup.HorizontalOffset);
        Assert.Equal(flippedAnchor, VisiblePetAnchor(runtime.Window, scaling: 1));

        Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);

        Assert.Equal(0, Canvas.GetLeft(runtime.Window.FindControl<Canvas>("PetColumn")!));
        Assert.Equal(flippedAnchor, VisiblePetAnchor(runtime.Window, scaling: 1));
        Assert.Equal(168, runtime.Window.Width);
    }

    [AvaloniaFact]
    public async Task Same_side_pointer_drag_keeps_shared_popup_open_without_lifecycle_churn()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var popup = runtime.Window.FindControl<Popup>("PetSidePopup")!;
        var openStates = new List<bool>();
        var petPoint = new Point(68, 180);

        Click(runtime.Window.FindControl<Button>("PetQuotaStripButton")!);
        Assert.True(popup.IsOpen);
        Assert.Equal(PlacementMode.RightEdgeAlignedTop, popup.Placement);
        var beforeDrag = VisiblePetAnchor(runtime.Window, scaling: 1);
        popup.PropertyChanged += OnPopupPropertyChanged;
        try
        {
            runtime.Window.MouseDown(petPoint, MouseButton.Left, RawInputModifiers.LeftMouseButton);
            runtime.Window.MouseMove(
                new Point(petPoint.X + 10, petPoint.Y + 5),
                RawInputModifiers.LeftMouseButton);
            runtime.Window.MouseMove(
                new Point(petPoint.X + 20, petPoint.Y + 10),
                RawInputModifiers.LeftMouseButton);
            runtime.Window.MouseUp(
                new Point(petPoint.X + 20, petPoint.Y + 10),
                MouseButton.Left,
                RawInputModifiers.None);
        }
        finally
        {
            popup.PropertyChanged -= OnPopupPropertyChanged;
        }

        Assert.Equal(
            new PixelPoint(beforeDrag.X + 20, beforeDrag.Y + 10),
            VisiblePetAnchor(runtime.Window, scaling: 1));
        Assert.True(popup.IsOpen);
        Assert.Equal(PlacementMode.RightEdgeAlignedTop, popup.Placement);
        Assert.Empty(openStates);

        void OnPopupPropertyChanged(object? sender, AvaloniaPropertyChangedEventArgs args)
        {
            if (args.Property == Popup.IsOpenProperty)
            {
                openStates.Add(popup.IsOpen);
            }
        }
    }

    [AvaloniaFact]
    public async Task Pet_drag_surface_routes_click_drag_and_capture_loss_through_real_pointer_events()
    {
        using var runtime = await WindowRuntime.CreateAsync(
            new DashboardScreen("screen", new PixelRect(0, 0, 1200, 800), new PixelRect(0, 0, 1200, 800), 1),
            new WindowPlacement("screen", 508, 300, IsPetAnchor: true));
        var dragSurface = runtime.Window.FindControl<Border>("PetDragSurface")!;
        IPointer? pointer = null;
        dragSurface.AddHandler(
            InputElement.PointerPressedEvent,
            (_, args) => pointer = args.Pointer,
            Avalonia.Interactivity.RoutingStrategies.Bubble,
            handledEventsToo: true);
        var petPoint = new Point(68, 180);

        runtime.Window.MouseDown(petPoint, MouseButton.Left, RawInputModifiers.LeftMouseButton);
        runtime.Window.MouseUp(petPoint, MouseButton.Left, RawInputModifiers.None);

        Assert.Equal(168, runtime.Window.Width);
        Assert.True(runtime.Window.FindControl<Border>("PetQuotaDetails")!.IsVisible);

        Click(runtime.Window.FindControl<Button>("PetQuotaDetailsCloseButton")!);
        var beforeDrag = VisiblePetAnchor(runtime.Window, scaling: 1);
        runtime.Window.MouseDown(petPoint, MouseButton.Left, RawInputModifiers.LeftMouseButton);
        runtime.Window.MouseMove(
            new Point(petPoint.X + 20, petPoint.Y + 10),
            RawInputModifiers.LeftMouseButton);
        runtime.Window.MouseUp(
            new Point(petPoint.X + 20, petPoint.Y + 10),
            MouseButton.Left,
            RawInputModifiers.None);

        Assert.Equal(
            new PixelPoint(beforeDrag.X + 20, beforeDrag.Y + 10),
            VisiblePetAnchor(runtime.Window, scaling: 1));
        Assert.Equal(168, runtime.Window.Width);

        runtime.Window.MouseDown(petPoint, MouseButton.Left, RawInputModifiers.LeftMouseButton);
        Assert.NotNull(pointer);
        Assert.Same(dragSurface, pointer!.Captured);
        pointer.Capture(null);
        runtime.Window.MouseUp(petPoint, MouseButton.Left, RawInputModifiers.None);

        Assert.Equal(168, runtime.Window.Width);
        Assert.False(runtime.Window.FindControl<Border>("PetQuotaDetails")!.IsVisible);
    }

    private static void AssertQuotaFallback(MainWindow window, double expectedHeight)
    {
        Assert.True(window.FindControl<Border>("QuotaOnlyPanel")!.IsVisible);
        Assert.False(window.FindControl<Canvas>("PetDashboardPanel")!.IsVisible);
        Assert.False(window.FindControl<Border>("TaskNotification")!.IsVisible);
        Assert.False(window.FindControl<Border>("PetQuotaDetails")!.IsVisible);
        Assert.Equal(370, window.Width);
        Assert.Equal(expectedHeight, window.Height);
        Assert.Equal(370, window.MinWidth);
        Assert.Equal(370, window.MaxWidth);
        Assert.Equal(48, window.MinHeight);
        Assert.Equal(230, window.MaxHeight);
    }

    private static PixelPoint VisiblePetAnchor(MainWindow window, double scaling)
    {
        var petColumn = window.FindControl<Canvas>("PetColumn")!;
        var columnLeft = Canvas.GetLeft(petColumn);
        var x = window.Position.X + (int)Math.Round(
            (columnLeft + PetDashboardLayoutCalculator.PetRect.X) * scaling,
            MidpointRounding.AwayFromZero);
        var y = window.Position.Y + (int)Math.Round(
            PetDashboardLayoutCalculator.PetRect.Y * scaling,
            MidpointRounding.AwayFromZero);
        return new PixelPoint(x, y);
    }

    private static (PixelPoint Position, double Width, double Height) HostBounds(MainWindow window) =>
        (window.Position, window.Width, window.Height);

    private static void Click(Button? button)
    {
        Assert.NotNull(button);
        button.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
    }

    private static async Task<WindowPlacement> WaitForPlacementAsync(
        JsonSettingsStore settingsStore,
        PixelPoint expected)
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            await Task.Delay(50);
            var placement = (await settingsStore.LoadAsync()).Placement;
            if (placement?.X == expected.X && placement.Y == expected.Y)
            {
                return placement;
            }
        }

        return Assert.IsType<WindowPlacement>((await settingsStore.LoadAsync()).Placement);
    }

    private static CodexTaskCompletion Completion(string turnId) => new(
        turnId,
        "workspace",
        "Task completed",
        TimeSpan.FromSeconds(1),
        DateTimeOffset.UtcNow);

    private sealed class StubQuotaSource : IQuotaSource
    {
        public event EventHandler<QuotaSnapshot>? SnapshotUpdated
        {
            add { }
            remove { }
        }

        public event EventHandler? ConnectionStateChanged
        {
            add { }
            remove { }
        }

        public CodexConnectionState ConnectionState => CodexConnectionState.Stopped;

        public QuotaSnapshot? LastSnapshot => null;

        public Task StartAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RefreshAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class StubPetProvider(PetAsset? pet) : IPetProvider
    {
        public Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<PetAsset?>(pet);
    }

    private sealed class BlockingPetProvider : IPetProvider
    {
        private readonly TaskCompletionSource _requested = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<PetAsset?> _completion =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default)
        {
            _requested.TrySetResult();
            return await _completion.Task.WaitAsync(cancellationToken);
        }

        public Task WaitUntilRequestedAsync() => _requested.Task;

        public void Complete(PetAsset? pet) => _completion.TrySetResult(pet);
    }

    private sealed class StubTaskCompletionSource : ITaskCompletionSource
    {
        public event EventHandler<CodexTaskCompletion>? TaskCompleted;

        public Task StartAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public void Emit(CodexTaskCompletion completion) => TaskCompleted?.Invoke(this, completion);

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class StubPlatformServices(string directory) : IPlatformServices
    {
        public string SettingsDirectory => directory;

        public string LogsDirectory => directory;

        public Task<string?> FindCodexExecutableAsync(
            string? explicitOverride,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(explicitOverride ?? "codex");

        public Task<bool> GetLaunchAtLoginAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(true);

        public Task SetLaunchAtLoginAsync(
            bool enabled,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class StubScreenProvider(DashboardScreen screen) : IDashboardScreenProvider
    {
        public DashboardScreen Current { get; set; } = screen;

        public IReadOnlyList<DashboardScreen> All => [Current];

        public DashboardScreen? Primary => Current;

        public DashboardScreen? ScreenFromWindow() => Current;
    }

    private sealed class WindowRuntime : IDisposable
    {
        private readonly string _directory;

        private WindowRuntime(
            string directory,
            JsonSettingsStore settingsStore,
            MainWindowViewModel viewModel,
            MainWindow window,
            StubTaskCompletionSource taskSource,
            StubScreenProvider screenProvider,
            Task initializationTask)
        {
            _directory = directory;
            SettingsStore = settingsStore;
            ViewModel = viewModel;
            Window = window;
            TaskSource = taskSource;
            ScreenProvider = screenProvider;
            InitializationTask = initializationTask;
        }

        public JsonSettingsStore SettingsStore { get; }

        public MainWindowViewModel ViewModel { get; }

        public MainWindow Window { get; }

        public StubTaskCompletionSource TaskSource { get; }

        public StubScreenProvider ScreenProvider { get; }

        public Task InitializationTask { get; }

        public static async Task<WindowRuntime> CreateAsync(
            DashboardScreen screen,
            WindowPlacement? placement,
            bool petEnabled = true)
        {
            var runtime = await StartAsync(
                screen,
                AppSettings.Default with
                {
                    PetEnabled = petEnabled,
                    Placement = placement,
                });
            await runtime.InitializationTask;
            return runtime;
        }

        public static async Task<WindowRuntime> StartAsync(
            DashboardScreen screen,
            AppSettings settings,
            IPetProvider? petProvider = null)
        {
            var directory = Path.Combine(Path.GetTempPath(), $"quota-window-runtime-{Guid.NewGuid():N}");
            Directory.CreateDirectory(directory);
            var settingsStore = new JsonSettingsStore(directory);
            await settingsStore.SaveAsync(settings);
            var taskSource = new StubTaskCompletionSource();
            var viewModel = new MainWindowViewModel(
                new StubQuotaSource(),
                petProvider ?? new StubPetProvider(ValidPet),
                taskSource,
                settingsStore,
                new StubPlatformServices(directory),
                TimeProvider.System,
                () => { },
                DispatchToUi);
            var screenProvider = new StubScreenProvider(screen);
            var window = new MainWindow(screenProvider)
            {
                DataContext = viewModel,
            };
            window.Show();
            var initializationTask = viewModel.InitializeAsync();
            return new WindowRuntime(
                directory,
                settingsStore,
                viewModel,
                window,
                taskSource,
                screenProvider,
                initializationTask);
        }

        public void Dispose()
        {
            ViewModel.Dispose();
            Window.CloseForQuit();
            Directory.Delete(_directory, recursive: true);
        }
    }

    private static void DispatchToUi(Action action)
    {
        if (Dispatcher.UIThread.CheckAccess())
        {
            action();
            return;
        }

        Dispatcher.UIThread.InvokeAsync(action).Wait();
    }

    private static readonly PetAsset ValidPet = new(
        "valid",
        "Valid",
        Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
        PetAssetFormat.CodexWebpAtlas,
        PetAssetSource.Codex);

    private static readonly PetAsset BundledPet = new(
        "bundled-suit-hamster",
        "西装仓鼠",
        File.ReadAllBytes(Path.Combine(
            AppContext.BaseDirectory,
            "Assets",
            "Pets",
            "suit-hamster.gif")),
        PetAssetFormat.AnimatedGif,
        PetAssetSource.BundledFallback);
}
