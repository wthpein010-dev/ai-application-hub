namespace CodexQuotaBar.Core.Settings;

public sealed record WindowPlacement(
    string ScreenId,
    double X,
    double Y,
    bool IsPetAnchor = false);

public sealed record AppSettings(
    bool IsCollapsed = false,
    bool AlwaysOnTop = true,
    bool LaunchAtLogin = true,
    int RefreshSeconds = 30,
    WindowPlacement? Placement = null,
    string? CodexExecutableOverride = null,
    bool PetEnabled = false,
    bool TaskNotificationsEnabled = true)
{
    public static AppSettings Default { get; } = new();
}
