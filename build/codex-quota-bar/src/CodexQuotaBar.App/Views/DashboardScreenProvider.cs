using Avalonia;
using Avalonia.Controls;
using Avalonia.Platform;

namespace CodexQuotaBar.App.Views;

public sealed record DashboardScreen(
    string Id,
    PixelRect Bounds,
    PixelRect WorkingArea,
    double Scaling);

public interface IDashboardScreenProvider
{
    IReadOnlyList<DashboardScreen> All { get; }

    DashboardScreen? Primary { get; }

    DashboardScreen? ScreenFromWindow();
}

internal sealed class AvaloniaDashboardScreenProvider(Window window) : IDashboardScreenProvider
{
    public IReadOnlyList<DashboardScreen> All =>
        window.Screens.All.Select(screen => ToDashboardScreen(screen)!).ToArray();

    public DashboardScreen? Primary => ToDashboardScreen(window.Screens.Primary);

    public DashboardScreen? ScreenFromWindow() => ToDashboardScreen(window.Screens.ScreenFromWindow(window));

    private static DashboardScreen? ToDashboardScreen(Screen? screen) => screen is null
        ? null
        : new DashboardScreen(
            screen.DisplayName ?? screen.Bounds.ToString(),
            screen.Bounds,
            screen.WorkingArea,
            screen.Scaling);
}
