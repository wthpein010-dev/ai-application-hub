using System.ComponentModel;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Primitives.PopupPositioning;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using CodexQuotaBar.Core.Settings;
using CodexQuotaBar.Core.ViewModels;

namespace CodexQuotaBar.App.Views;

public partial class MainWindow : Window
{
    private readonly DispatcherTimer _countdownTimer;
    private readonly DispatcherTimer _placementTimer;
    private readonly IDashboardScreenProvider _screenProvider;
    private readonly PetPointerDragTracker _petDragTracker = new();
    private MainWindowViewModel? _viewModel;
    private PetDashboardLayout? _dashboardLayout;
    private PetDashboardPlacementState? _placementState;
    private bool _allowClose;
    private bool _applyingDashboardLayout;
    private bool _isOpened;
    private bool _isIntegratedMode;
    private bool _isPetDetailsVisible;
    private bool _placementRestored;

    public MainWindow()
        : this(null, useDefaultScreenProvider: true)
    {
    }

    public MainWindow(IDashboardScreenProvider screenProvider)
        : this(screenProvider, useDefaultScreenProvider: false)
    {
    }

    private MainWindow(IDashboardScreenProvider? screenProvider, bool useDefaultScreenProvider)
    {
        if (!useDefaultScreenProvider)
        {
            ArgumentNullException.ThrowIfNull(screenProvider);
        }

        InitializeComponent();
        _screenProvider = screenProvider ?? new AvaloniaDashboardScreenProvider(this);
        Closing += OnClosing;
        DataContextChanged += OnDataContextChanged;
        Opened += OnOpened;
        PositionChanged += OnPositionChanged;

        _countdownTimer = new DispatcherTimer(TimeSpan.FromMinutes(1), DispatcherPriority.Background, (_, _) =>
            _viewModel?.RefreshCountdowns());
        _placementTimer = new DispatcherTimer(TimeSpan.FromMilliseconds(350), DispatcherPriority.Background, OnPlacementTimer)
        {
            IsEnabled = false,
        };
    }

    public void CloseForQuit()
    {
        _allowClose = true;
        _countdownTimer.Stop();
        _placementTimer.Stop();
        CloseSidePopup();
        PetSprite.Dispose();
        Close();
    }

    private void OnDataContextChanged(object? sender, EventArgs args)
    {
        CloseSidePopup();
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= OnViewModelPropertyChanged;
        }

        _placementTimer.Stop();
        _placementRestored = false;
        _placementState = null;
        _dashboardLayout = null;
        _viewModel = DataContext as MainWindowViewModel;
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged += OnViewModelPropertyChanged;
            ApplyViewModelState();
            RestorePlacementIfReady();
        }
        else
        {
            PetSprite.SetPet(null);
            ShowQuotaOnlyMode();
        }
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs args)
    {
        if (args.PropertyName is nameof(MainWindowViewModel.IsCollapsed)
            or nameof(MainWindowViewModel.IsVisible)
            or nameof(MainWindowViewModel.AlwaysOnTop)
            or nameof(MainWindowViewModel.PetAvailable)
            or nameof(MainWindowViewModel.PetEnabled)
            or nameof(MainWindowViewModel.SelectedPet)
            or nameof(MainWindowViewModel.PetAnimation)
            or nameof(MainWindowViewModel.IsTaskNotificationVisible)
            or nameof(MainWindowViewModel.IsInitializationReady))
        {
            ApplyViewModelState();
        }

        if (args.PropertyName == nameof(MainWindowViewModel.IsInitializationReady))
        {
            RestorePlacementIfReady();
        }
    }

    private void ApplyViewModelState()
    {
        if (_viewModel is null)
        {
            return;
        }

        Topmost = _viewModel.AlwaysOnTop;
        if (CanShowIntegratedPet())
        {
            ShowIntegratedPetMode();
        }
        else
        {
            ShowQuotaOnlyMode();
        }

        if (_viewModel.IsVisible && !IsVisible)
        {
            Show();
            Activate();
            ApplyDashboardLayout();
        }
        else if (!_viewModel.IsVisible && IsVisible)
        {
            CloseSidePopup();
            Hide();
        }
    }

    private bool CanShowIntegratedPet() =>
        _viewModel is
        {
            IsInitializationReady: true,
            PetAvailable: true,
            PetEnabled: true,
            SelectedPet: not null,
        };

    private void ShowIntegratedPetMode()
    {
        if (_viewModel?.SelectedPet is null)
        {
            return;
        }

        if (_placementState is null)
        {
            var screen = _screenProvider.ScreenFromWindow() ?? _screenProvider.Primary;
            var scaling = screen?.Scaling ?? 1;
            _placementState = new PetDashboardPlacementState(
                GetPetScreenPosition(Position, scaling));
        }

        _isIntegratedMode = true;
        QuotaOnlyPanel.IsVisible = false;
        PetDashboardPanel.IsVisible = true;
        try
        {
            PetSprite.SetPet(_viewModel.SelectedPet);
            PetSprite.SetAnimation(_viewModel.PetAnimation);
        }
        catch (Exception)
        {
            PetSprite.SetPet(null);
            ShowQuotaOnlyMode();
            return;
        }

        ApplyDashboardLayout();
    }

    private void ShowQuotaOnlyMode()
    {
        var wasIntegrated = _isIntegratedMode;
        var integratedAnchor = _placementState?.PetScreenPosition;
        _isIntegratedMode = false;
        _isPetDetailsVisible = false;
        _dashboardLayout = null;
        PetDashboardPanel.IsVisible = false;
        TaskNotification.IsVisible = false;
        PetQuotaDetails.IsVisible = false;
        CloseSidePopup();
        QuotaOnlyPanel.IsVisible = true;
        ConfigureWindowSize(370, _viewModel?.IsCollapsed == true ? 48 : 230, 48, 230);

        if (wasIntegrated && integratedAnchor is { } anchor)
        {
            var screen = ScreenForPoint(anchor) ?? _screenProvider.ScreenFromWindow() ?? _screenProvider.Primary;
            if (screen is not null)
            {
                Position = WindowPlacementCalculator.Clamp(
                    GetPetColumnPosition(anchor, screen.Scaling),
                    screen.WorkingArea,
                    Width,
                    Height,
                    screen.Scaling);
            }
        }

        _placementState = null;
    }

    private void ApplyDashboardLayout()
    {
        if (!_isIntegratedMode || _viewModel is null)
        {
            return;
        }

        if (_placementState is null)
        {
            return;
        }

        var requestedAnchor = _placementState.PetScreenPosition;
        var screen = ScreenForPoint(requestedAnchor) ?? _screenProvider.ScreenFromWindow() ?? _screenProvider.Primary;
        if (screen is null)
        {
            return;
        }

        var sideContentRequested = _viewModel.IsTaskNotificationVisible || _isPetDetailsVisible;
        PetDashboardLayout layout;
        try
        {
            layout = _placementState.Calculate(
                screen.WorkingArea,
                sideContentRequested,
                screen.Scaling);
        }
        catch (ArgumentException)
        {
            ShowQuotaOnlyMode();
            return;
        }

        var taskNotificationVisible =
            layout.SideContentAllocated && _viewModel.IsTaskNotificationVisible;
        var petDetailsVisible =
            layout.SideContentAllocated && _isPetDetailsVisible;
        var popupPlacement = layout.Side == PetDashboardSide.Left
            ? PlacementMode.LeftEdgeAlignedTop
            : PlacementMode.RightEdgeAlignedTop;
        var popupHorizontalOffset = layout.Side == PetDashboardSide.Left
            ? -PetDashboardLayoutCalculator.SideGap
            : PetDashboardLayoutCalculator.SideGap;
        var shouldUseOverlayLayer =
            string.Equals(PlatformImpl?.GetType().FullName, "Avalonia.Headless.HeadlessWindowImpl", StringComparison.Ordinal);
        var shouldOpenSidePopup =
            _viewModel.IsVisible
            && IsVisible
            && layout.SideContentAllocated
            && (taskNotificationVisible || petDetailsVisible);
        var popupRequiresPreparation =
            PetSidePopup.PlacementTarget != PetColumn
            || PetSidePopup.Placement != popupPlacement
            || PetSidePopup.HorizontalOffset != popupHorizontalOffset
            || PetSidePopup.VerticalOffset != 0
            || PetSidePopup.Topmost != Topmost
            || PetSidePopup.PlacementConstraintAdjustment != PopupPositionerConstraintAdjustment.None
            || PetSidePopup.ShouldUseOverlayLayer != shouldUseOverlayLayer;

        _dashboardLayout = layout;
        _applyingDashboardLayout = true;
        try
        {
            if (PetSidePopup.IsOpen && (!shouldOpenSidePopup || popupRequiresPreparation))
            {
                CloseSidePopup();
            }

            ConfigureWindowSize(
                layout.WindowSize.Width,
                layout.WindowSize.Height,
                layout.WindowSize.Height,
                layout.WindowSize.Height);
            PetDashboardPanel.Width = layout.WindowSize.Width;
            PetDashboardPanel.Height = layout.WindowSize.Height;

            Canvas.SetLeft(PetColumn, 0);

            if (Position != layout.WindowPosition)
            {
                Position = layout.WindowPosition;
            }

            PrepareSidePopup(
                taskNotificationVisible,
                petDetailsVisible,
                popupPlacement,
                popupHorizontalOffset,
                shouldUseOverlayLayer,
                shouldOpenSidePopup);
        }
        finally
        {
            _applyingDashboardLayout = false;
        }
    }

    private void PrepareSidePopup(
        bool taskNotificationVisible,
        bool petDetailsVisible,
        PlacementMode placement,
        double horizontalOffset,
        bool shouldUseOverlayLayer,
        bool shouldOpen)
    {
        TaskNotification.IsVisible = taskNotificationVisible;
        PetQuotaDetails.IsVisible = petDetailsVisible;
        PetSidePopup.PlacementTarget = PetColumn;
        PetSidePopup.Placement = placement;
        PetSidePopup.HorizontalOffset = horizontalOffset;
        PetSidePopup.VerticalOffset = 0;
        PetSidePopup.Topmost = Topmost;
        PetSidePopup.PlacementConstraintAdjustment = PopupPositionerConstraintAdjustment.None;
        PetSidePopup.ShouldUseOverlayLayer = shouldUseOverlayLayer;
        PetSidePopup.IsOpen = shouldOpen;
    }

    private void CloseSidePopup() => PetSidePopup.IsOpen = false;

    private void ConfigureWindowSize(double width, double height, double minHeight, double maxHeight)
    {
        MinWidth = 0;
        MaxWidth = double.PositiveInfinity;
        MinHeight = 0;
        MaxHeight = double.PositiveInfinity;
        Width = width;
        Height = height;
        MinWidth = width;
        MaxWidth = width;
        MinHeight = minHeight;
        MaxHeight = maxHeight;
    }

    private void OnTitleBarPointerPressed(object? sender, PointerPressedEventArgs args)
    {
        if (!_isIntegratedMode && args.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            BeginMoveDrag(args);
        }
    }

    private void OnPetDetailsToggleClick(object? sender, RoutedEventArgs args)
    {
        if (!_isIntegratedMode)
        {
            return;
        }

        _isPetDetailsVisible = !_isPetDetailsVisible;
        ApplyDashboardLayout();
        args.Handled = true;
    }

    private void OnPetPointerPressed(object? sender, PointerPressedEventArgs args)
    {
        if (!_isIntegratedMode || !args.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            return;
        }

        _petDragTracker.Press(
            VisualExtensions.PointToScreen(this, args.GetPosition(this)),
            _placementState?.PetScreenPosition ?? Position);
        args.Pointer.Capture(PetDragSurface);
        args.Handled = true;
    }

    private void OnPetPointerMoved(object? sender, PointerEventArgs args)
    {
        if (!_petDragTracker.IsPressed)
        {
            return;
        }

        var currentPoint = args.GetCurrentPoint(this);
        var current = VisualExtensions.PointToScreen(this, args.GetPosition(this));
        var petScreenPosition = _petDragTracker.Move(
            current,
            currentPoint.Properties.IsLeftButtonPressed);
        if (!currentPoint.Properties.IsLeftButtonPressed)
        {
            args.Pointer.Capture(null);
        }

        if (petScreenPosition is { } position)
        {
            _placementState?.SetPetScreenPosition(position);
            ApplyDashboardLayout();
        }

        args.Handled = true;
    }

    private void OnPetPointerReleased(object? sender, PointerReleasedEventArgs args)
    {
        if (!_petDragTracker.IsPressed)
        {
            return;
        }

        var wasClick = _petDragTracker.Release();
        args.Pointer.Capture(null);
        if (wasClick)
        {
            _isPetDetailsVisible = !_isPetDetailsVisible;
            ApplyDashboardLayout();
        }

        args.Handled = true;
    }

    private void OnPetPointerCaptureLost(object? sender, PointerCaptureLostEventArgs args) =>
        _petDragTracker.Cancel();

    private void OnClosing(object? sender, WindowClosingEventArgs args)
    {
        if (!_allowClose && _viewModel is not null)
        {
            args.Cancel = true;
            _viewModel.Hide();
        }
    }

    private void OnOpened(object? sender, EventArgs args)
    {
        _isOpened = true;
        _countdownTimer.Start();
        RestorePlacementIfReady();
    }

    private void OnPositionChanged(object? sender, PixelPointEventArgs args)
    {
        if (_isIntegratedMode && !_applyingDashboardLayout && _dashboardLayout is { } layout)
        {
            var deltaX = Position.X - layout.WindowPosition.X;
            var deltaY = Position.Y - layout.WindowPosition.Y;
            if (deltaX != 0 || deltaY != 0)
            {
                _placementState?.MoveBy(deltaX, deltaY);
                ApplyDashboardLayout();
            }
        }

        if (CanPersistPlacement())
        {
            _placementTimer.Stop();
            _placementTimer.Start();
        }
    }

    private async void OnPlacementTimer(object? sender, EventArgs args)
    {
        _placementTimer.Stop();
        if (!CanPersistPlacement() || _viewModel is null)
        {
            return;
        }

        var placementPosition = _isIntegratedMode && _placementState is { } state
            ? state.PetScreenPosition
            : Position;
        var screen = ScreenForPoint(placementPosition) ?? _screenProvider.ScreenFromWindow();
        if (screen is null)
        {
            return;
        }

        await _viewModel.SavePlacementAsync(new WindowPlacement(
            screen.Id,
            placementPosition.X,
            placementPosition.Y,
            IsPetAnchor: _isIntegratedMode));
    }

    private bool CanPersistPlacement() =>
        _isOpened
        && _placementRestored
        && _viewModel?.IsInitializationReady == true;

    private void RestorePlacementIfReady()
    {
        if (_placementRestored
            || !_isOpened
            || _viewModel?.IsInitializationReady != true)
        {
            return;
        }

        RestorePlacement();
        _placementRestored = true;
    }

    private void RestorePlacement()
    {
        if (_viewModel?.GetSavedPlacement() is { } saved)
        {
            var target = _screenProvider.All.FirstOrDefault(screen =>
                string.Equals(screen.Id, saved.ScreenId, StringComparison.Ordinal));
            if (target is not null)
            {
                var savedPosition = new PixelPoint((int)saved.X, (int)saved.Y);
                if (_isIntegratedMode)
                {
                    var petScreenPosition = saved.IsPetAnchor
                        ? savedPosition
                        : GetPetScreenPosition(savedPosition, target.Scaling);
                    if (_placementState is null)
                    {
                        _placementState = new PetDashboardPlacementState(petScreenPosition);
                    }
                    else
                    {
                        _placementState.SetPetScreenPosition(petScreenPosition);
                    }

                    ApplyDashboardLayout();
                }
                else
                {
                    var windowPosition = saved.IsPetAnchor
                        ? GetPetColumnPosition(savedPosition, target.Scaling)
                        : savedPosition;
                    Position = WindowPlacementCalculator.Clamp(
                        windowPosition,
                        target.WorkingArea,
                        Width,
                        Height,
                        target.Scaling);
                }

                return;
            }
        }

        var screen = _screenProvider.ScreenFromWindow() ?? _screenProvider.Primary;
        if (screen is null)
        {
            return;
        }

        if (_isIntegratedMode)
        {
            var columnPosition = WindowPlacementCalculator.TopRight(
                screen.WorkingArea,
                PetDashboardLayoutCalculator.PetColumnWidth,
                PetDashboardLayoutCalculator.DashboardHeight,
                screen.Scaling,
                margin: 18);
            _placementState = new PetDashboardPlacementState(
                GetPetScreenPosition(columnPosition, screen.Scaling),
                _placementState?.PreferredSide);
            ApplyDashboardLayout();
        }
        else
        {
            Position = WindowPlacementCalculator.TopRight(
                screen.WorkingArea,
                Width,
                Height,
                screen.Scaling,
                margin: 18);
        }
    }

    private DashboardScreen? ScreenForPoint(PixelPoint point) =>
        _screenProvider.All.FirstOrDefault(screen =>
            point.X >= screen.Bounds.X
            && point.X < screen.Bounds.Right
            && point.Y >= screen.Bounds.Y
            && point.Y < screen.Bounds.Bottom);

    private static PixelPoint GetPetColumnPosition(PixelPoint petScreenPosition, double scaling)
    {
        var petOffsetX = (int)Math.Round(
            PetDashboardLayoutCalculator.PetRect.X * scaling,
            MidpointRounding.AwayFromZero);
        var petOffsetY = (int)Math.Round(
            PetDashboardLayoutCalculator.PetRect.Y * scaling,
            MidpointRounding.AwayFromZero);
        return new PixelPoint(
            petScreenPosition.X - petOffsetX,
            petScreenPosition.Y - petOffsetY);
    }

    private static PixelPoint GetPetScreenPosition(PixelPoint petColumnPosition, double scaling)
    {
        var petOffsetX = (int)Math.Round(
            PetDashboardLayoutCalculator.PetRect.X * scaling,
            MidpointRounding.AwayFromZero);
        var petOffsetY = (int)Math.Round(
            PetDashboardLayoutCalculator.PetRect.Y * scaling,
            MidpointRounding.AwayFromZero);
        return new PixelPoint(
            petColumnPosition.X + petOffsetX,
            petColumnPosition.Y + petOffsetY);
    }
}
