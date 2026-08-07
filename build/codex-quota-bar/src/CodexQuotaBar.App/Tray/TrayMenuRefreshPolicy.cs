using CodexQuotaBar.Core.ViewModels;

namespace CodexQuotaBar.App.Tray;

public static class TrayMenuRefreshPolicy
{
    public static bool RequiresRefresh(string? propertyName) =>
        propertyName is nameof(MainWindowViewModel.AlwaysOnTop)
            or nameof(MainWindowViewModel.LaunchAtLogin)
            or nameof(MainWindowViewModel.PetAvailable)
            or nameof(MainWindowViewModel.PetEnabled)
            or nameof(MainWindowViewModel.TaskNotificationsEnabled);
}
