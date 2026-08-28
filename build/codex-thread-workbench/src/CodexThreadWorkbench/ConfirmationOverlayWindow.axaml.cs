using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Avalonia.VisualTree;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench;

public partial class ConfirmationOverlayWindow : Window
{
    public const int IdlePeekHeight = 10;

    private static readonly TimeSpan IdleCollapseDelay =
        TimeSpan.FromMilliseconds(760);
    private static readonly TimeSpan PositionAnimationDuration =
        TimeSpan.FromMilliseconds(170);
    private static readonly TimeSpan InteractionArmDelay =
        TimeSpan.FromMilliseconds(650);
    private ConfirmationOverlayViewModel? _viewModel;
    private readonly ConfirmationOverlayPlacement _placement = new();
    private readonly ConfirmationPointerActionGate _pointerActionGate = new();
    private CancellationTokenSource? _idleCollapseCancellation;
    private CancellationTokenSource? _interactionArmCancellation;
    private CancellationTokenSource? _positionAnimationCancellation;
    private PixelPoint? _expandedPosition;
    private bool _isIdlePreviewExpanded;
    private bool _isPointerOverSurface;
    private bool _isRetracted;
    private bool _isClosingForShutdown;

    public ConfirmationOverlayWindow()
    {
        InitializeComponent();
        AddHandler(
            PointerPressedEvent,
            Window_OnPointerPressed,
            RoutingStrategies.Tunnel,
            handledEventsToo: true);
        Screens.Changed += OnScreensChanged;
    }

    public void Attach(ConfirmationOverlayViewModel viewModel)
    {
        ConfirmationOverlayDiagnostics.Write(
            $"attach:start:ui={Dispatcher.UIThread.CheckAccess()}");
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= ViewModelOnPropertyChanged;
        }

        _viewModel = viewModel;
        DataContext = viewModel;
        _viewModel.PropertyChanged += ViewModelOnPropertyChanged;
        if (_viewModel.HasItems)
        {
            BeginInteractionGuard();
        }

        _ = UpdatePresentationAsync(animate: false);
        ConfirmationOverlayDiagnostics.Write("attach:update-requested");
    }

    public void PositionAtTopCenter(PixelRect workingArea)
    {
        var width = (int)Math.Round(Width);
        Position = new PixelPoint(
            workingArea.X + ((workingArea.Width - width) / 2),
            workingArea.Y + 8);
    }

    public void MarkManuallyPositioned() =>
        _placement.MarkManuallyPositioned();

    public void PositionForShow(PixelRect workingArea, PixelSize windowSize) =>
        SetExpandedPosition(_placement.ResolveForShow(
            workingArea,
            _expandedPosition ?? Position,
            windowSize));

    public void CloseForShutdown()
    {
        if (_isClosingForShutdown)
        {
            return;
        }

        _isClosingForShutdown = true;
        CancelIdleCollapse();
        CancelInteractionArm();
        CancelPositionAnimation();
        _pointerActionGate.Clear();
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= ViewModelOnPropertyChanged;
        }

        Screens.Changed -= OnScreensChanged;
        Close();
    }

    protected override void OnClosing(WindowClosingEventArgs e)
    {
        if (!_isClosingForShutdown &&
            e.CloseReason is not WindowCloseReason.ApplicationShutdown and
            not WindowCloseReason.OSShutdown)
        {
            e.Cancel = true;
            ConfirmationOverlayDiagnostics.Write(
                $"window:close-blocked:reason={e.CloseReason}:programmatic={e.IsProgrammatic}");
        }

        base.OnClosing(e);
    }

    protected override void OnClosed(EventArgs e)
    {
        CancelIdleCollapse();
        CancelInteractionArm();
        CancelPositionAnimation();
        _pointerActionGate.Clear();
        Screens.Changed -= OnScreensChanged;
        base.OnClosed(e);
    }

    private void ViewModelOnPropertyChanged(
        object? sender,
        System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(
                ConfirmationOverlayViewModel.IsAutoConfirmEnabled) &&
            this.FindControl<ToggleSwitch>("AutoConfirmToggle") is { } toggle)
        {
            toggle.IsChecked = _viewModel?.IsAutoConfirmEnabled == true;
        }

        if (e.PropertyName == nameof(ConfirmationOverlayViewModel.RequiresAttention))
        {
            if (_viewModel?.RequiresAttention == true)
            {
                CancelIdleCollapse();
                _isIdlePreviewExpanded = false;
            }

            if (_viewModel?.HasItems == true)
            {
                BeginInteractionGuard();
            }
            else
            {
                CancelInteractionArm();
                _viewModel?.SetInteractionArmed(true);
            }

            _ = UpdatePresentationAsync();
        }
    }

    private async Task UpdatePresentationAsync(bool animate = true)
    {
        if (!Dispatcher.UIThread.CheckAccess())
        {
            ConfirmationOverlayDiagnostics.Write("visibility:dispatch-ui");
            await Dispatcher.UIThread.InvokeAsync(
                () => UpdatePresentationAsync(animate));
            return;
        }

        if (_isClosingForShutdown)
        {
            Hide();
            return;
        }

        if (!IsVisible)
        {
            ConfirmationOverlayDiagnostics.Write("visibility:show-start");
            Opacity = 0;
            Show();
            ConfirmationOverlayDiagnostics.Write(
                $"visibility:show-complete:visible={IsVisible}:handle={TryGetPlatformHandle()?.Handle}");
            animate = false;
        }

        await Dispatcher.UIThread.InvokeAsync(
            static () => { },
            DispatcherPriority.Loaded);

        var area = GetCurrentWorkingArea();
        var windowSize = GetCurrentPixelSize();
        var shouldRetract = _viewModel?.RequiresAttention != true &&
                            !_isIdlePreviewExpanded;
        PixelPoint target;
        if (shouldRetract)
        {
            if (!_isRetracted)
            {
                _expandedPosition = _placement.ResolveForShow(
                    area,
                    _expandedPosition ?? Position,
                    windowSize);
            }

            target = _placement.ResolveRetracted(
                area,
                _expandedPosition ?? Position,
                windowSize,
                IdlePeekHeight);
        }
        else
        {
            target = _placement.ResolveForShow(
                area,
                _expandedPosition ?? Position,
                windowSize);
            _expandedPosition = target;
        }

        _isRetracted = shouldRetract;
        await MoveToAsync(target, animate && Opacity > 0);
        Opacity = 1;
        ConfirmationOverlayDiagnostics.Write(
            $"presentation:{(shouldRetract ? "retracted" : "expanded")}:" +
            $"x={Position.X}:y={Position.Y}:w={windowSize.Width}:h={windowSize.Height}:" +
            $"attention={_viewModel?.RequiresAttention == true}");
    }

    private void OnScreensChanged(object? sender, EventArgs e)
    {
        if (!IsVisible)
        {
            return;
        }

        _ = UpdatePresentationAsync(animate: false);
    }

    private void OverlaySurface_OnPointerEntered(
        object? sender,
        PointerEventArgs e)
    {
        _isPointerOverSurface = true;
        CancelIdleCollapse();
        if (_viewModel?.RequiresAttention == true || _isIdlePreviewExpanded)
        {
            return;
        }

        _isIdlePreviewExpanded = true;
        _ = UpdatePresentationAsync();
    }

    private void OverlaySurface_OnPointerExited(
        object? sender,
        PointerEventArgs e)
    {
        _isPointerOverSurface = false;
        if (_viewModel?.RequiresAttention == true)
        {
            return;
        }

        ScheduleIdleCollapse();
    }

    private void DragHandle_OnPointerPressed(
        object? sender,
        PointerPressedEventArgs e)
    {
        if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            return;
        }

        Opacity = 1;
        MarkManuallyPositioned();
        BeginMoveDrag(e);
        e.Handled = true;
    }

    private void Window_OnPointerPressed(
        object? sender,
        PointerPressedEventArgs e)
    {
        var source = e.Source as Control;
        var button = source as Button ??
                     source?.GetVisualAncestors().OfType<Button>().FirstOrDefault();
        if (button is null ||
            _viewModel?.IsInteractionArmed != true ||
            !button.IsEnabled ||
            !e.GetCurrentPoint(button).Properties.IsLeftButtonPressed)
        {
            return;
        }

        _pointerActionGate.Arm(button);
    }

    private void ActionButton_OnPointerExited(
        object? sender,
        PointerEventArgs e)
    {
        if (sender is Button button)
        {
            _pointerActionGate.Disarm(button);
        }
    }

    private void ConfirmAllButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (sender is not Button button || !TryConsumePointerAction(button))
        {
            return;
        }

        _viewModel?.ConfirmAllCommand.Execute(null);
    }

    private void AutoConfirmToggle_OnClick(object? sender, RoutedEventArgs e)
    {
        if (sender is not Button button || !TryConsumePointerAction(button))
        {
            return;
        }

        _viewModel?.ToggleAutoConfirmCommand.Execute(null);
    }

    private void IgnoreButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (sender is not Button button ||
            button.DataContext is not ConfirmationItemViewModel item ||
            !TryConsumePointerAction(button))
        {
            return;
        }

        item.IgnoreCommand.Execute(null);
    }

    private void ConfirmButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (sender is not Button button ||
            button.DataContext is not ConfirmationItemViewModel item ||
            !TryConsumePointerAction(button))
        {
            return;
        }

        item.ConfirmCommand.Execute(null);
    }

    private bool TryConsumePointerAction(Button button)
    {
        var allowed = _viewModel?.IsInteractionArmed == true &&
                      button.IsEnabled &&
                      _pointerActionGate.TryConsume(button);
        ConfirmationOverlayDiagnostics.Write(
            allowed ? "input:pointer-action" : "input:blocked-non-pointer-action");
        return allowed;
    }

    private void ScheduleIdleCollapse()
    {
        CancelIdleCollapse();
        var cancellation = new CancellationTokenSource();
        _idleCollapseCancellation = cancellation;
        _ = CollapseIdleAfterDelayAsync(cancellation.Token);
    }

    private async Task CollapseIdleAfterDelayAsync(CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(IdleCollapseDelay, cancellationToken);
            if (_isPointerOverSurface || _viewModel?.RequiresAttention == true)
            {
                return;
            }

            _isIdlePreviewExpanded = false;
            await UpdatePresentationAsync();
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task MoveToAsync(PixelPoint target, bool animate)
    {
        CancelPositionAnimation();
        if (!animate || Position == target)
        {
            Position = target;
            return;
        }

        var cancellation = new CancellationTokenSource();
        _positionAnimationCancellation = cancellation;
        var start = Position;
        var startedAt = System.Diagnostics.Stopwatch.GetTimestamp();
        try
        {
            while (true)
            {
                cancellation.Token.ThrowIfCancellationRequested();
                var elapsed = System.Diagnostics.Stopwatch.GetElapsedTime(startedAt);
                var progress = Math.Clamp(
                    elapsed.TotalMilliseconds / PositionAnimationDuration.TotalMilliseconds,
                    0,
                    1);
                var eased = 1 - Math.Pow(1 - progress, 3);
                Position = new PixelPoint(
                    start.X + (int)Math.Round((target.X - start.X) * eased),
                    start.Y + (int)Math.Round((target.Y - start.Y) * eased));
                if (progress >= 1)
                {
                    break;
                }

                await Task.Delay(16, cancellation.Token);
            }

            Position = target;
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void SetExpandedPosition(PixelPoint position)
    {
        _expandedPosition = position;
        Position = position;
        _isRetracted = false;
    }

    private void CancelIdleCollapse()
    {
        _idleCollapseCancellation?.Cancel();
        _idleCollapseCancellation?.Dispose();
        _idleCollapseCancellation = null;
    }

    private void BeginInteractionGuard()
    {
        CancelInteractionArm();
        _pointerActionGate.Clear();
        _viewModel?.SetInteractionArmed(false);
        ConfirmationOverlayDiagnostics.Write("input:guarded");
        var cancellation = new CancellationTokenSource();
        _interactionArmCancellation = cancellation;
        _ = ArmInteractionAfterDelayAsync(cancellation.Token);
    }

    private async Task ArmInteractionAfterDelayAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(InteractionArmDelay, cancellationToken);
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                if (_isClosingForShutdown || _viewModel?.HasItems != true)
                {
                    return;
                }

                _viewModel.SetInteractionArmed(true);
                ConfirmationOverlayDiagnostics.Write("input:armed");
            });
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void CancelInteractionArm()
    {
        _interactionArmCancellation?.Cancel();
        _interactionArmCancellation?.Dispose();
        _interactionArmCancellation = null;
    }

    private void CancelPositionAnimation()
    {
        _positionAnimationCancellation?.Cancel();
        _positionAnimationCancellation?.Dispose();
        _positionAnimationCancellation = null;
    }

    private PixelRect GetCurrentWorkingArea()
    {
        var currentWorkingArea =
            (Screens.ScreenFromWindow(this) ?? Screens.Primary)?.WorkingArea ??
            new PixelRect(0, 0, 1920, 1080);
        return ConfirmationOverlayScreenSelection.ResolveWorkingArea(
            currentWorkingArea,
            Screens.All.Select(screen => screen.WorkingArea));
    }

    private PixelSize GetCurrentPixelSize()
    {
        var width = Bounds.Width > 0 ? Bounds.Width : Width;
        var height = Bounds.Height > 0 ? Bounds.Height : 1;
        return new PixelSize(
            Math.Max(1, (int)Math.Ceiling(width)),
            Math.Max(1, (int)Math.Ceiling(height)));
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);
}
