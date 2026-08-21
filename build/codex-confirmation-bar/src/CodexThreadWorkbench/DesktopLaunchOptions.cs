namespace CodexThreadWorkbench;

public sealed record DesktopLaunchOptions(bool ShowWorkbenchWindow)
{
    public const string ConfirmationOverlaySwitch = "--confirmation-overlay";
    public const string WorkbenchSwitch = "--workbench";

    public static DesktopLaunchOptions FromArgs(IEnumerable<string>? args)
    {
        var showWorkbench = args?.Contains(
            WorkbenchSwitch,
            StringComparer.Ordinal) == true;
        return new DesktopLaunchOptions(ShowWorkbenchWindow: showWorkbench);
    }
}
