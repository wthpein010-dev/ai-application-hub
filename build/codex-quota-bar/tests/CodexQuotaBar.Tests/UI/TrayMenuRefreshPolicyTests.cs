using CodexQuotaBar.App.Tray;
using CodexQuotaBar.Core.ViewModels;

namespace CodexQuotaBar.Tests.UI;

public sealed class TrayMenuRefreshPolicyTests
{
    [Fact]
    public void Policy_refreshes_every_checked_or_conditional_tray_state()
    {
        var propertyNames = new[]
        {
            nameof(MainWindowViewModel.AlwaysOnTop),
            nameof(MainWindowViewModel.LaunchAtLogin),
            nameof(MainWindowViewModel.PetAvailable),
            nameof(MainWindowViewModel.PetEnabled),
            nameof(MainWindowViewModel.TaskNotificationsEnabled),
        };

        Assert.All(propertyNames, propertyName =>
            Assert.True(TrayMenuRefreshPolicy.RequiresRefresh(propertyName)));
        Assert.False(TrayMenuRefreshPolicy.RequiresRefresh(nameof(MainWindowViewModel.SelectedPet)));
        Assert.False(TrayMenuRefreshPolicy.RequiresRefresh(nameof(MainWindowViewModel.ConnectionLabel)));
    }

    [Fact]
    public void Policy_preserves_pet_then_notification_refresh_order()
    {
        var initializationChanges = new[]
        {
            nameof(MainWindowViewModel.SelectedPet),
            nameof(MainWindowViewModel.PetAvailable),
            nameof(MainWindowViewModel.PetEnabled),
            nameof(MainWindowViewModel.TaskNotificationsEnabled),
        };

        var refreshes = initializationChanges
            .Where(TrayMenuRefreshPolicy.RequiresRefresh)
            .ToArray();

        Assert.Equal(
            [
                nameof(MainWindowViewModel.PetAvailable),
                nameof(MainWindowViewModel.PetEnabled),
                nameof(MainWindowViewModel.TaskNotificationsEnabled),
            ],
            refreshes);
    }
}
