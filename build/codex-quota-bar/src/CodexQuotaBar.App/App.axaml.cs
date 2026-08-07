using System.ComponentModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.Input;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform.Storage;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using CodexQuotaBar.App.Pets;
using CodexQuotaBar.App.Platform;
using CodexQuotaBar.App.Tasks;
using CodexQuotaBar.App.Tray;
using CodexQuotaBar.App.Views;
using CodexQuotaBar.Core.Logging;
using CodexQuotaBar.Core.Platform;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Settings;
using CodexQuotaBar.Core.ViewModels;

namespace CodexQuotaBar.App;

public partial class App : Application
{
    private IClassicDesktopStyleApplicationLifetime? _desktop;
    private IPlatformServices? _platformServices;
    private RollingFileLogger? _logger;
    private CodexQuotaClient? _quotaClient;
    private DesktopTaskCompletionSourceRegistration? _taskCompletionRegistration;
    private MainWindowViewModel? _viewModel;
    private MainWindow? _window;
    private TrayIcon? _trayIcon;
    private int _shutdownStarted;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            _desktop = desktop;
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            _window = new MainWindow();
            desktop.MainWindow = _window;
        }

        base.OnFrameworkInitializationCompleted();

        if (_desktop is not null)
        {
            Dispatcher.UIThread.Post(() => _ = StartDesktopAsync());
        }
    }

    private async Task StartDesktopAsync()
    {
        try
        {
            _platformServices = PlatformServicesFactory.Create();
            _logger = new RollingFileLogger(_platformServices.LogsDirectory);
            var settingsStore = new JsonSettingsStore(_platformServices.SettingsDirectory);
            var settings = await settingsStore.LoadAsync();

            var codexExecutable = await _platformServices.FindCodexExecutableAsync(settings.CodexExecutableOverride)
                ?? (OperatingSystem.IsWindows() ? "codex.exe" : "codex");
            var processFactory = new CodexProcessSessionFactory(message => LogSafely("codex", message));
            _quotaClient = new CodexQuotaClient(
                processFactory,
                codexExecutable,
                pollInterval: TimeSpan.FromSeconds(settings.RefreshSeconds),
                diagnostic: message => LogSafely("quota", message));
            var petProvider = DesktopPetProviderFactory.Create(
                CodexDesktopLocator.CodexHome,
                CodexDesktopLocator.FindAppAsar,
                BundledPetResource.Open,
                message => LogSafely("pet", message));
            try
            {
                _taskCompletionRegistration = DesktopTaskCompletionSourceRegistration.Create(
                    CodexDesktopLocator.CodexHome,
                    TimeProvider.System,
                    message => LogSafely("tasks", message));
            }
            catch (Exception exception)
            {
                LogSafely("tasks", $"Could not create Codex session watcher: {exception.Message}");
            }

            _viewModel = new MainWindowViewModel(
                _quotaClient,
                petProvider,
                _taskCompletionRegistration?.Source,
                settingsStore,
                _platformServices,
                TimeProvider.System,
                () => _ = ShutdownAsync(),
                DispatchToUi,
                message => LogSafely("tasks", message));
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                _viewModel.PropertyChanged += OnViewModelPropertyChanged;
                _window ??= new MainWindow();
                _window.DataContext = _viewModel;
                SetupTray();
                _window.Show();
            });
            await _viewModel.InitializeAsync();
            Dispatcher.UIThread.Post(UpdateTrayMenu);
        }
        catch (Exception exception)
        {
            await Dispatcher.UIThread.InvokeAsync(() => ShowStartupError(exception.Message));
            LogSafely("startup", exception.Message);
        }
    }

    private void SetupTray()
    {
        _trayIcon = new TrayIcon
        {
            Icon = IconFactory.Create(),
            ToolTipText = "Codex 用量",
            IsVisible = true,
        };
        _trayIcon.Clicked += (_, _) => ToggleWindowVisibility();
        UpdateTrayMenu();
    }

    private void UpdateTrayMenu()
    {
        if (_trayIcon is null || _viewModel is null)
        {
            return;
        }

        _trayIcon.Menu = TrayMenuFactory.Create(
            new RelayCommand(ToggleWindowVisibility),
            _viewModel.RefreshCommand,
            _viewModel.ToggleAlwaysOnTopCommand,
            _viewModel.ToggleLaunchAtLoginCommand,
            _viewModel.TogglePetCommand,
            _viewModel.ToggleTaskNotificationsCommand,
            new AsyncRelayCommand(ChooseCodexExecutableAsync),
            _viewModel.RequestQuitCommand,
            _viewModel.AlwaysOnTop,
            _viewModel.LaunchAtLogin,
            _viewModel.PetAvailable,
            _viewModel.PetEnabled,
            _viewModel.TaskNotificationsEnabled);
    }

    private void ToggleWindowVisibility()
    {
        if (_viewModel is null)
        {
            return;
        }

        if (_viewModel.IsVisible)
        {
            _viewModel.Hide();
        }
        else
        {
            _viewModel.Show();
        }
    }

    private async Task ChooseCodexExecutableAsync()
    {
        if (_window is null || _viewModel is null)
        {
            return;
        }

        var files = await _window.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "选择 Codex 程序",
            AllowMultiple = false,
            FileTypeFilter = OperatingSystem.IsWindows()
                ? [new FilePickerFileType("Codex 程序") { Patterns = ["*.exe"] }]
                : null,
        });
        var selected = files.FirstOrDefault()?.TryGetLocalPath();
        if (string.IsNullOrWhiteSpace(selected))
        {
            return;
        }

        await _viewModel.SetCodexExecutableOverrideAsync(selected);
        RestartApplication();
    }

    private void RestartApplication()
    {
        if (Environment.ProcessPath is { } processPath)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = processPath,
                UseShellExecute = true,
            });
        }

        _ = ShutdownAsync();
    }

    private async Task ShutdownAsync()
    {
        if (Interlocked.Exchange(ref _shutdownStarted, 1) != 0)
        {
            return;
        }

        if (_viewModel is not null)
        {
            _viewModel.PropertyChanged -= OnViewModelPropertyChanged;
            _viewModel.Dispose();
        }

        if (_trayIcon is not null)
        {
            _trayIcon.IsVisible = false;
            _trayIcon.Dispose();
        }

        _window?.CloseForQuit();
        if (_taskCompletionRegistration is not null)
        {
            try
            {
                await _taskCompletionRegistration.DisposeAsync();
            }
            catch (Exception exception)
            {
                LogSafely("tasks", $"Could not stop Codex session watcher: {exception.Message}");
            }
        }

        if (_quotaClient is not null)
        {
            await _quotaClient.DisposeAsync();
        }

        _logger?.Dispose();
        _desktop?.Shutdown();
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs args)
    {
        if (TrayMenuRefreshPolicy.RequiresRefresh(args.PropertyName))
        {
            UpdateTrayMenu();
        }
    }

    private void ShowStartupError(string message)
    {
        _window?.CloseForQuit();
        var errorWindow = new Window
        {
            Title = "Codex Quota Bar",
            Width = 420,
            Height = 160,
            CanResize = false,
            Content = new TextBlock
            {
                Margin = new Thickness(20),
                TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                Text = $"启动失败\n{message}",
            },
        };
        if (_desktop is not null)
        {
            _desktop.MainWindow = errorWindow;
        }

        errorWindow.Show();
    }

    private void LogSafely(string eventName, string summary)
    {
        if (_logger is not { } logger)
        {
            return;
        }

        _ = Task.Run(() =>
        {
            try
            {
                logger.Write(eventName, summary);
            }
            catch (Exception)
            {
                // Diagnostics must never block or terminate the desktop utility.
            }
        });
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
}
