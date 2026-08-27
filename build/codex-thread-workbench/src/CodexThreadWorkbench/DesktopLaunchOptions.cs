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

    public bool ShowWorkbenchWindow => Mode == DesktopLaunchMode.Workbench;

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

        return new DesktopLaunchOptions(DesktopLaunchMode.ConfirmationOverlay);
    }
}
