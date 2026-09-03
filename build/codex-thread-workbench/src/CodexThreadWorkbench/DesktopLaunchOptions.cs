using System.Text.Json;

namespace CodexThreadWorkbench;

public enum DesktopLaunchMode
{
    FloatingLauncher,
    ConfirmationOverlay,
    Workbench
}

public sealed record DesktopLaunchOptions(DesktopLaunchMode Mode)
{
    public const string ConfirmationOverlaySwitch = "--confirmation-overlay";
    public const string FloatingLauncherSwitch = "--floating-launcher";
    public const string WorkbenchSwitch = "--workbench";
    public const string ConfirmationBarDistributionSwitch = "--distribution=confirmation-bar";
    public const string LaunchProfileSwitchPrefix = "--launch-profile=";

    public bool ShowWorkbenchWindow => Mode == DesktopLaunchMode.Workbench;

    public bool SupportsConfirmationAutomation =>
        Mode == DesktopLaunchMode.ConfirmationOverlay;

    public static DesktopLaunchOptions FromArgs(IEnumerable<string>? args)
    {
        var values = args?.ToArray() ?? [];
        if (values.Contains(WorkbenchSwitch, StringComparer.Ordinal))
        {
            return new DesktopLaunchOptions(DesktopLaunchMode.Workbench);
        }

        if (values.Contains(ConfirmationOverlaySwitch, StringComparer.Ordinal))
        {
            return new DesktopLaunchOptions(DesktopLaunchMode.ConfirmationOverlay);
        }

        if (values.Contains(FloatingLauncherSwitch, StringComparer.Ordinal))
        {
            return new DesktopLaunchOptions(DesktopLaunchMode.FloatingLauncher);
        }

        var profilePath = values
            .FirstOrDefault(value => value.StartsWith(
                LaunchProfileSwitchPrefix,
                StringComparison.OrdinalIgnoreCase))?
            [LaunchProfileSwitchPrefix.Length..];
        if (TryReadProfileMode(profilePath, out var profileMode))
        {
            return new DesktopLaunchOptions(profileMode);
        }

        if (values.Contains(ConfirmationBarDistributionSwitch, StringComparer.Ordinal))
        {
            return new DesktopLaunchOptions(DesktopLaunchMode.ConfirmationOverlay);
        }

        return new DesktopLaunchOptions(DesktopLaunchMode.Workbench);
    }

    private static bool TryReadProfileMode(
        string? profilePath,
        out DesktopLaunchMode mode)
    {
        mode = DesktopLaunchMode.Workbench;
        if (string.IsNullOrWhiteSpace(profilePath) || !File.Exists(profilePath))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(profilePath));
            if (!document.RootElement.TryGetProperty("defaultMode", out var defaultMode))
            {
                return false;
            }

            mode = defaultMode.GetString() switch
            {
                "confirmation-overlay" => DesktopLaunchMode.ConfirmationOverlay,
                "floating-launcher" => DesktopLaunchMode.FloatingLauncher,
                "workbench" => DesktopLaunchMode.Workbench,
                _ => DesktopLaunchMode.Workbench
            };
            return true;
        }
        catch (IOException)
        {
            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
