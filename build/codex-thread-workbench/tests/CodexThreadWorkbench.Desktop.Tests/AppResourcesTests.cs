using System.Reflection;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class AppResourcesTests
{
    [Fact]
    public void DesktopAssembly_UsesPublicProductIdentity()
    {
        var assembly = typeof(App).Assembly;

        Assert.Equal("CodexConfirmationBar", assembly.GetName().Name);
        Assert.Equal(
            "Codex 待确认悬浮助手",
            assembly.GetCustomAttribute<AssemblyTitleAttribute>()?.Title);
        Assert.Equal(
            "Codex Confirmation Bar",
            assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product);
        Assert.Equal("2.0.0.0", assembly.GetName().Version?.ToString());
    }

    [AvaloniaFact]
    public void App_LoadsSharedResources()
    {
        var app = Assert.IsType<App>(Application.Current);

        Assert.True(app.Resources.ContainsKey("PrimaryBrush"));
        Assert.True(app.Resources.ContainsKey("CardBackgroundBrush"));
    }
}
