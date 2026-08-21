using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench;

public partial class ConfirmationOverlayWindow : Window
{
    private ConfirmationOverlayViewModel? _viewModel;
    private readonly ConfirmationOverlayPlacement _placement = new();
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
        _ = UpdateVisibilityAsync();
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
        Position = _placement.ResolveForShow(
            workingArea,
            Position,
            windowSize);

    public void CloseForShutdown()
    {
        if (_isClosingForShutdown)
        {
            return;
        }

        _isClosingForShutdown = true;
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= ViewModelOnPropertyChanged;
        }

        Screens.Changed -= OnScreensChanged;
        Close();
    }

    protected override void OnClosed(EventArgs e)
    {
        Screens.Changed -= OnScreensChanged;
        base.OnClosed(e);
    }

    private void ViewModelOnPropertyChanged(
        object? sender,
        System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(ConfirmationOverlayViewModel.HasItems))
        {
            _ = UpdateVisibilityAsync();
        }
    }

    private async Task UpdateVisibilityAsync()
    {
        if (!Dispatcher.UIThread.CheckAccess())
        {
            ConfirmationOverlayDiagnostics.Write("visibility:dispatch-ui");
            await Dispatcher.UIThread.InvokeAsync(UpdateVisibilityAsync);
            return;
        }

        if (_isClosingForShutdown)
        {
            Hide();
            return;
        }

        var area = GetCurrentWorkingArea();
        PositionForShow(area, GetCurrentPixelSize());
        Opacity = 1;
        if (!IsVisible)
        {
            ConfirmationOverlayDiagnostics.Write("visibility:show-start");
            Show();
            ConfirmationOverlayDiagnostics.Write(
                $"visibility:show-complete:visible={IsVisible}:handle={TryGetPlatformHandle()?.Handle}");
        }
    }

    private void OnScreensChanged(object? sender, EventArgs e)
    {
        if (!IsVisible)
        {
            return;
        }

        PositionForShow(GetCurrentWorkingArea(), GetCurrentPixelSize());
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
