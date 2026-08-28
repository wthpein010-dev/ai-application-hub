using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using Avalonia.Markup.Xaml;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Persistence;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench;

public partial class App : Application
{
    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            desktop.ShutdownRequested += (_, _) =>
                ConfirmationOverlayDiagnostics.Write(
                    "lifetime:shutdown-requested");
            desktop.Exit += (_, eventArgs) =>
                ConfirmationOverlayDiagnostics.Write(
                    $"lifetime:exit:code={eventArgs.ApplicationExitCode}");
            _ = StartDesktopAsync(desktop);
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static async Task StartDesktopAsync(
        IClassicDesktopStyleApplicationLifetime desktop)
    {
        var launchOptions = DesktopLaunchOptions.FromArgs(desktop.Args);
        ICodexThreadClient? client = null;
        WorkbenchSession? session = null;
        ConfirmationOverlayWindow? overlayWindow = null;
        FloatingLauncherWindow? launcherWindow = null;
        MainWindow? workbenchWindow = null;
        FloatingWorkbenchController? floatingController = null;
        MainViewModel? standaloneWorkbenchViewModel = null;
        try
        {
            ConfirmationOverlayDiagnostics.Write("connect:start");
            client = await CodexAppServerClient.ConnectAsync();
            ConfirmationOverlayDiagnostics.Write("connect:complete");
            var statusReader = new CodexSessionSnapshotReader();
            if (launchOptions.ShowWorkbenchWindow)
            {
                standaloneWorkbenchViewModel = new MainViewModel(
                    client,
                    new WorkspaceStore(),
                    statusReader: statusReader);
                client = null;
                workbenchWindow = new MainWindow
                {
                    DataContext = standaloneWorkbenchViewModel
                };
                desktop.MainWindow = workbenchWindow;
                workbenchWindow.Show();
                await standaloneWorkbenchViewModel.InitializeAsync();
                workbenchWindow.ApplySavedBounds(standaloneWorkbenchViewModel);
                desktop.ShutdownMode = ShutdownMode.OnLastWindowClose;
                return;
            }

            var detector = new ConfirmationDetector();
            var threadReader = new CodexSessionSnapshotReader(
                throwWhenUnavailable: true);
            var monitor = new ConfirmationMonitor(
                client,
                detector,
                threadReader: threadReader);
            IConfirmationAutomationSettingsStore? automationSettingsStore =
                launchOptions.SupportsConfirmationAutomation
                    ? new ConfirmationAutomationSettingsStore()
                    : null;
            var overlayViewModel = new ConfirmationOverlayViewModel(
                client,
                monitor,
                detector,
                CodexDesktopMessageFallbackFactory.CreateCurrent(),
                threadReader: threadReader,
                automationSettingsStore: automationSettingsStore);
            await overlayViewModel.InitializeAsync();
            overlayViewModel.ActionAttempted += message =>
                ConfirmationOverlayDiagnostics.Write($"action:{message}");
            if (launchOptions.Mode == DesktopLaunchMode.ConfirmationOverlay)
            {
                overlayWindow = new ConfirmationOverlayWindow();
                ConfirmationOverlayDiagnostics.Write("overlay:created");
                session = new WorkbenchSession(
                    overlayViewModel,
                    monitor,
                    client);
                desktop.MainWindow = overlayWindow;
                ConfirmationOverlayDiagnostics.Write("overlay:registered-main-window");
                overlayWindow.Attach(overlayViewModel);
                ConfirmationOverlayDiagnostics.Write("overlay:attached");
                desktop.Exit += (_, _) =>
                {
                    overlayWindow.CloseForShutdown();
                    session.DisposeAsync().AsTask().GetAwaiter().GetResult();
                };
                monitor.Start();
                ConfirmationOverlayDiagnostics.Write("monitor:started");
                return;
            }

            var viewModel = new MainViewModel(
                client,
                new WorkspaceStore(),
                ownsClient: false,
                statusReader: statusReader);
            session = new WorkbenchSession(
                overlayViewModel,
                monitor,
                viewModel,
                client);
            workbenchWindow = new MainWindow
            {
                DataContext = viewModel
            };

            workbenchWindow.CollapseToLauncherOnClose = true;
            launcherWindow = new FloatingLauncherWindow();
            launcherWindow.Attach(overlayViewModel);
            launcherWindow.PositionCommitted += position =>
                viewModel.UpdateLauncherPosition(position.X, position.Y);
            floatingController = new FloatingWorkbenchController(
                launcherWindow,
                workbenchWindow,
                fullScreenRequested: () => viewModel.IsFullScreen = true,
                refreshRequested: () => viewModel.RefreshCommand.Execute(null),
                exitRequested: () => desktop.Shutdown(),
                initializeWorkbenchAsync: () => viewModel.InitializeAsync());
            desktop.MainWindow = launcherWindow;
            desktop.Exit += (_, _) =>
            {
                floatingController.Dispose();
                launcherWindow.CloseForShutdown();
                workbenchWindow.CloseForShutdown();
                session.DisposeAsync().AsTask().GetAwaiter().GetResult();
            };
            await FloatingWorkbenchStartup.StartAsync(
                () => viewModel.LoadSettingsAsync(),
                monitor.Start,
                () =>
                {
                    workbenchWindow.ApplySavedBounds(viewModel);
                    launcherWindow.PositionForShow(
                        viewModel.LauncherLeft,
                        viewModel.LauncherTop);
                },
                floatingController.Start);
        }
        catch (Exception error)
        {
            ConfirmationOverlayDiagnostics.Write(
                $"startup:error:{error.GetType().Name}:{error.Message}");
            overlayWindow?.CloseForShutdown();
            launcherWindow?.CloseForShutdown();
            workbenchWindow?.CloseForShutdown();
            floatingController?.Dispose();
            if (session is not null)
            {
                await session.DisposeAsync();
            }
            else if (standaloneWorkbenchViewModel is not null)
            {
                await standaloneWorkbenchViewModel.DisposeAsync();
            }
            else if (client is not null)
            {
                await client.DisposeAsync();
            }

            ShowStartupError(desktop, error.Message);
        }
    }

    private static void ShowStartupError(
        IClassicDesktopStyleApplicationLifetime desktop,
        string message)
    {
        var closeButton = new Button
        {
            Content = "关闭",
            HorizontalAlignment = HorizontalAlignment.Right,
            MinWidth = 88
        };
        var window = new Window
        {
            Title = "无法连接 Codex",
            Width = 520,
            Height = 260,
            CanResize = false,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            Content = new StackPanel
            {
                Margin = new Thickness(28),
                Spacing = 16,
                Children =
                {
                    new TextBlock
                    {
                        Text = "Codex 多线程工作台无法启动",
                        FontSize = 20,
                        FontWeight = Avalonia.Media.FontWeight.SemiBold
                    },
                    new TextBlock
                    {
                        Text = $"{message}\n\n请确认 Codex CLI 已安装并可从 PATH 启动。",
                        TextWrapping = Avalonia.Media.TextWrapping.Wrap
                    },
                    closeButton
                }
            }
        };
        closeButton.Click += (_, _) => window.Close();
        desktop.MainWindow = window;
        desktop.ShutdownMode = ShutdownMode.OnLastWindowClose;
        window.Show();
    }
}
