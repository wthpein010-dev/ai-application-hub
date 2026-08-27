namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class DesktopLaunchOptionsTests
{
    [Fact]
    public void FromArgs_ConfirmationOverlaySwitch_UsesLegacyConfirmationOverlay()
    {
        var options = DesktopLaunchOptions.FromArgs(["--confirmation-overlay"]);

        Assert.Equal(DesktopLaunchMode.ConfirmationOverlay, options.Mode);
        Assert.False(options.ShowWorkbenchWindow);
    }

    [Fact]
    public void FromArgs_DefaultLaunch_UsesConfirmationOverlay()
    {
        var options = DesktopLaunchOptions.FromArgs([]);

        Assert.Equal(DesktopLaunchMode.ConfirmationOverlay, options.Mode);
        Assert.False(options.ShowWorkbenchWindow);
    }

    [Fact]
    public void FromArgs_FloatingLauncherSwitch_UsesFloatingLauncher()
    {
        var options = DesktopLaunchOptions.FromArgs(["--floating-launcher"]);

        Assert.Equal(DesktopLaunchMode.FloatingLauncher, options.Mode);
        Assert.False(options.ShowWorkbenchWindow);
    }

    [Fact]
    public void FromArgs_WorkbenchSwitch_RequestsWorkbenchWindow()
    {
        var options = DesktopLaunchOptions.FromArgs(["--workbench"]);

        Assert.Equal(DesktopLaunchMode.Workbench, options.Mode);
        Assert.True(options.ShowWorkbenchWindow);
    }
}
