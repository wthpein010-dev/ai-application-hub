namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class AppResourcesTests
{
    [AvaloniaFact]
    public void App_LoadsSharedResources()
    {
        var app = Assert.IsType<App>(Application.Current);

        Assert.True(app.Resources.ContainsKey("PrimaryBrush"));
        Assert.True(app.Resources.ContainsKey("CardBackgroundBrush"));
    }
}
