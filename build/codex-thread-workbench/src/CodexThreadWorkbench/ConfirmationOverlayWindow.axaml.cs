using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench;

public partial class ConfirmationOverlayWindow : Window
{
    public const int IdlePeekHeight = 10;

    private static readonly TimeSpan IdleCollapseDelay =
        TimeSpan.FromMilliseconds(760);
    private static readonly TimeSpan PositionAnimationDuration =
        TimeSpan.FromMilliseconds(170);
    private ConfirmationOverlayViewModel? _viewModel;
    private readonly ConfirmationOverlayPlacement _placement = new();
    private CancellationTokenSource? _idleCollapseCancellation;
    private CancellationTokenSource? _positionAnimationCancellation;
    private PixelPoint? _expandedPosition;
    private bool _isIdlePreviewExpanded;
    private bool _isPointerOverSurface;
    private bool _isRetracted;
    private bool _isClosingForShutdown;

    public ConfirmationOverlayWindow()
    {
        InitializeComponent();
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
        CancelPositionAnimation();
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= ViewModelOnPropertyChanged;
        }

        Screens.Changed -= OnScreensChanged;
        Close();
    }

    protected override void OnClosed(EventArgs e)
    {
        CancelIdleCollapse();
        CancelPositionAnimation();
        Screens.Changed -= OnScreensChanged;
        base.OnClosed(e);
    }

    private void ViewModelOnPropertyChanged(
        object? sender,
        System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(ConfirmationOverlayViewModel.RequiresAttention))
        {
            if (_viewModel?.RequiresAttention == true)
            {
                CancelIdleCollapse();
                _isIdlePreviewExpanded = false;
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

    private void CancelPositionAnimation()
    {
        _positionAnimationCancellation?.Cancel();
        _positionAnimationCancellation?.Dispose();
        _positionAnimationCancellation = null;
    }

    private PixelRect GetCurrentWorkingArea() =>
        (Screens.ScreenFromWindow(this) ?? Screens.Primary)?.WorkingArea ??
        new PixelRect(0, 0, 1920, 1080);

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
