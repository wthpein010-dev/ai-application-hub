using System.ComponentModel;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using CodexThreadWorkbench.Presentation;
using CodexThreadWorkbench.Views;

namespace CodexThreadWorkbench;

public partial class MainWindow : Window
{
    private readonly DispatcherTimer _boundsTimer;
    private MainViewModel? _viewModel;
    private Task? _shutdownTask;
    private bool _isClosingAfterShutdown;
    private bool _isApplyingFullScreen;
    private bool _collapseToLauncherOnClose;

    public MainWindow()
    {
        InitializeComponent();
        _boundsTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(350)
        };
        _boundsTimer.Tick += BoundsTimerOnTick;
        DataContextChanged += OnDataContextChanged;
        PositionChanged += OnPositionChanged;
    }

    public Func<Task>? ShutdownAsync { get; set; }

    public bool CollapseToLauncherOnClose
    {
        get => _collapseToLauncherOnClose;
        set
        {
            _collapseToLauncherOnClose = value;
            var button = this.FindControl<Button>("CollapseButton");
            if (button is not null)
            {
                button.IsVisible = value;
            }
        }
    }

    public event Action? CollapsedToLauncher;

    public void ApplySavedBounds(MainViewModel viewModel)
    {
        if (!viewModel.IsFullScreen)
        {
            var screen = Screens.ScreenFromWindow(this) ?? Screens.Primary;
            var area = screen?.WorkingArea ?? new PixelRect(0, 0, 1920, 1080);
            Width = Math.Clamp(viewModel.WindowWidth, MinWidth, area.Width);
            Height = Math.Clamp(viewModel.WindowHeight, MinHeight, area.Height);
            Position = new PixelPoint(
                ClampCoordinate(viewModel.WindowLeft, area.X, area.Right - Width),
                ClampCoordinate(viewModel.WindowTop, area.Y, area.Bottom - Height));
        }

        ApplyWindowMode(viewModel.IsFullScreen);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == ClientSizeProperty)
        {
            ScheduleBoundsSave();
        }
    }

    protected override void OnClosing(WindowClosingEventArgs e)
    {
        var isLifetimeShutdown = e.CloseReason is
            WindowCloseReason.ApplicationShutdown or
            WindowCloseReason.OSShutdown;
        if (!_isClosingAfterShutdown &&
            !isLifetimeShutdown &&
            CollapseToLauncherOnClose)
        {
            e.Cancel = true;
            CollapseToLauncher();
            base.OnClosing(e);
            return;
        }

        if (_isClosingAfterShutdown || isLifetimeShutdown || _viewModel is null)
        {
            base.OnClosing(e);
            return;
        }

        e.Cancel = true;
        IsEnabled = false;
        _boundsTimer.Stop();
        _shutdownTask ??= ShutdownAndCloseAsync();
        base.OnClosing(e);
    }

    public void CloseForShutdown()
    {
        _isClosingAfterShutdown = true;
        _boundsTimer.Stop();
        Close();
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private static int ClampCoordinate(double value, double minimum, double maximum)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return (int)Math.Round(minimum);
        }

        return (int)Math.Round(Math.Clamp(value, minimum, Math.Max(minimum, maximum)));
    }

    private void OnDataContextChanged(object? sender, EventArgs e)
    {
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= ViewModelOnPropertyChanged;
        }

        _viewModel = DataContext as MainViewModel;
        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged += ViewModelOnPropertyChanged;
            ApplyWindowMode(_viewModel.IsFullScreen);
        }
    }

    private void ViewModelOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(MainViewModel.IsFullScreen) &&
            _viewModel is not null)
        {
            ApplyWindowMode(_viewModel.IsFullScreen);
        }
    }

    private void ApplyWindowMode(bool fullScreen)
    {
        if (_isApplyingFullScreen)
        {
            return;
        }

        _isApplyingFullScreen = true;
        try
        {
            WindowState = fullScreen
                ? WindowState.FullScreen
                : WindowState.Normal;
        }
        finally
        {
            _isApplyingFullScreen = false;
        }
    }

    private void OnPositionChanged(object? sender, PixelPointEventArgs e) =>
        ScheduleBoundsSave();

    private void ScheduleBoundsSave()
    {
        if (_isApplyingFullScreen ||
            _viewModel?.IsFullScreen != false ||
            WindowState != WindowState.Normal)
        {
            return;
        }

        _boundsTimer.Stop();
        _boundsTimer.Start();
    }

    private void BoundsTimerOnTick(object? sender, EventArgs e)
    {
        _boundsTimer.Stop();
        if (_viewModel is null ||
            _viewModel.IsFullScreen ||
            ClientSize.Width < MinWidth ||
            ClientSize.Height < MinHeight)
        {
            return;
        }

        _viewModel.UpdateWindowBounds(
            Position.X,
            Position.Y,
            ClientSize.Width,
            ClientSize.Height);
    }

    private async void ThreadCard_OnReorderRequested(
        object? sender,
        ThreadReorderRequestedEventArgs e)
    {
        if (_viewModel is not null)
        {
            await _viewModel.SwapOpenThreadsAsync(e.SourceThreadId, e.TargetThreadId);
        }
    }

    private void CollapseButton_OnClick(
        object? sender,
        Avalonia.Interactivity.RoutedEventArgs e) =>
        CollapseToLauncher();

    private void CollapseToLauncher()
    {
        if (!IsVisible)
        {
            return;
        }

        Hide();
        CollapsedToLauncher?.Invoke();
    }

    private async Task ShutdownAndCloseAsync()
    {
        try
        {
            if (ShutdownAsync is not null)
            {
                await ShutdownAsync();
            }
            else
            {
                await _viewModel!.DisposeAsync();
            }
        }
        finally
        {
            _isClosingAfterShutdown = true;
            Close();
        }
    }
}
