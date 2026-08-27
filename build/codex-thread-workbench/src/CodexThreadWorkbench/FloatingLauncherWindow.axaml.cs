using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench;

public partial class FloatingLauncherWindow : Window
{
    private static readonly TimeSpan SnapDelay = TimeSpan.FromMilliseconds(180);
    private readonly FloatingLauncherPlacement _placement = new();
    private readonly DispatcherTimer _snapTimer;
    private PixelPoint _positionAtPress;
    private bool _leftPointerPressed;
    private bool _isApplyingPosition;
    private bool _isClosingForShutdown;

    public FloatingLauncherWindow()
    {
        InitializeComponent();
        _snapTimer = new DispatcherTimer { Interval = SnapDelay };
        _snapTimer.Tick += SnapTimer_OnTick;
        PositionChanged += OnPositionChanged;
    }

    public event Action? ToggleWorkbenchRequested;

    public event Action? FullScreenRequested;

    public event Action? RefreshRequested;

    public event Action? ExitRequested;

    public event Action<PixelPoint>? PositionCommitted;

    public void Attach(ConfirmationOverlayViewModel viewModel) =>
        DataContext = viewModel;

    public void PositionForShow(double? savedLeft, double? savedTop)
    {
        var primaryWorkingArea = Screens.Primary?.WorkingArea ??
                                 new PixelRect(0, 0, 1920, 1080);
        ApplyPosition(_placement.ResolveInitialAcrossDisplays(
            Screens.All.Select(screen => screen.WorkingArea).ToArray(),
            primaryWorkingArea,
            new PixelSize((int)Width, (int)Height),
            savedLeft,
            savedTop));
    }

    public void SetWorkbenchVisible(bool isVisible)
    {
        var glyph = this.FindControl<TextBlock>("LauncherGlyph");
        if (glyph is not null)
        {
            glyph.Text = isVisible ? "−" : "C";
        }

        var surface = this.FindControl<Border>("LauncherSurface");
        if (surface is not null)
        {
            ToolTip.SetTip(
                surface,
                isVisible ? "收起 Codex 多线程工作台" : "打开 Codex 多线程工作台");
        }

        var menuItem = this.FindControl<MenuItem>("OpenWorkbenchMenuItem");
        if (menuItem is not null)
        {
            menuItem.Header = isVisible ? "收起工作台" : "打开工作台";
        }
    }

    public void CloseForShutdown()
    {
        _isClosingForShutdown = true;
        _snapTimer.Stop();
        Close();
    }

    protected override void OnClosing(WindowClosingEventArgs e)
    {
        if (!_isClosingForShutdown &&
            e.CloseReason is not WindowCloseReason.ApplicationShutdown and
            not WindowCloseReason.OSShutdown)
        {
            e.Cancel = true;
        }

        base.OnClosing(e);
    }

    private void LauncherSurface_OnPointerPressed(
        object? sender,
        PointerPressedEventArgs e)
    {
        if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            return;
        }

        _leftPointerPressed = true;
        _positionAtPress = Position;
        BeginMoveDrag(e);
        e.Handled = true;
    }

    private void LauncherSurface_OnPointerReleased(
        object? sender,
        PointerReleasedEventArgs e)
    {
        if (!_leftPointerPressed || e.InitialPressMouseButton != MouseButton.Left)
        {
            return;
        }

        _leftPointerPressed = false;
        var moved = Math.Abs(Position.X - _positionAtPress.X) > 3 ||
                    Math.Abs(Position.Y - _positionAtPress.Y) > 3;
        if (moved)
        {
            SnapToEdge();
        }
        else
        {
            ToggleWorkbenchRequested?.Invoke();
        }

        e.Handled = true;
    }

    private void LauncherSurface_OnPointerCaptureLost(
        object? sender,
        PointerCaptureLostEventArgs e)
    {
        if (!_leftPointerPressed)
        {
            return;
        }

        _leftPointerPressed = false;
        _snapTimer.Stop();
        _snapTimer.Start();
    }

    private void OpenWorkbenchMenuItem_OnClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        ToggleWorkbenchRequested?.Invoke();

    private void FullScreenMenuItem_OnClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        FullScreenRequested?.Invoke();

    private void RefreshMenuItem_OnClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        RefreshRequested?.Invoke();

    private void ExitMenuItem_OnClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        ExitRequested?.Invoke();

    private void OnPositionChanged(object? sender, PixelPointEventArgs e)
    {
        if (_isApplyingPosition || _isClosingForShutdown)
        {
            return;
        }

        _snapTimer.Stop();
        _snapTimer.Start();
    }

    private void SnapTimer_OnTick(object? sender, EventArgs e)
    {
        _snapTimer.Stop();
        if (!_leftPointerPressed)
        {
            SnapToEdge();
        }
    }

    private void SnapToEdge()
    {
        var snapped = _placement.ResolveSnapped(
            GetCurrentWorkingArea(),
            Position,
            new PixelSize((int)Width, (int)Height));
        ApplyPosition(snapped);
        PositionCommitted?.Invoke(snapped);
    }

    private void ApplyPosition(PixelPoint position)
    {
        _isApplyingPosition = true;
        try
        {
            Position = position;
        }
        finally
        {
            _isApplyingPosition = false;
        }
    }

    private PixelRect GetCurrentWorkingArea() =>
        (Screens.ScreenFromWindow(this) ?? Screens.Primary)?.WorkingArea ??
        new PixelRect(0, 0, 1920, 1080);

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);
}
