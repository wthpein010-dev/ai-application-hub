namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class DesktopLaunchOptionsTests
{
    [Fact]
    public void FromArgs_ConfirmationOverlaySwitch_DoesNotRequestWorkbenchWindow()
    {
        var options = DesktopLaunchOptions.FromArgs(["--confirmation-overlay"]);

        Assert.False(options.ShowWorkbenchWindow);
    }

    [Fact]
    public void FromArgs_DefaultLaunch_DoesNotRequestWorkbenchWindow()
    {
        var options = DesktopLaunchOptions.FromArgs([]);

        Assert.False(options.ShowWorkbenchWindow);
    }

    [Fact]
    public void FromArgs_WorkbenchSwitch_RequestsWorkbenchWindow()
    {
        var options = DesktopLaunchOptions.FromArgs(["--workbench"]);

        Assert.True(options.ShowWorkbenchWindow);
    }
}
