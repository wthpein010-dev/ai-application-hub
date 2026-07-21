using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using Avalonia.Markup.Xaml;
using CodexThreadWorkbench.Codex;
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
            _ = StartDesktopAsync(desktop);
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static async Task StartDesktopAsync(
        IClassicDesktopStyleApplicationLifetime desktop)
    {
        try
        {
            var client = await CodexAppServerClient.ConnectAsync();
            var viewModel = new MainViewModel(client, new WorkspaceStore());
            var window = new MainWindow
            {
                DataContext = viewModel
            };
            desktop.MainWindow = window;
            window.Show();
            await viewModel.InitializeAsync();
            window.ApplySavedBounds(viewModel);
            desktop.ShutdownMode = ShutdownMode.OnLastWindowClose;
        }
        catch (Exception error)
        {
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
                        Text = "Codex 多会话工作台无法启动",
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
