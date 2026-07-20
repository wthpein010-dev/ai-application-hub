using CodexThreadWorkbench.Infrastructure;

namespace CodexThreadWorkbench.Tests.Infrastructure;

public sealed class CodexProcessLocatorTests
{
    [Theory]
    [InlineData(true, "codex.exe")]
    [InlineData(false, "codex")]
    public void Find_UsesPlatformExecutableName(bool isWindows, string executable)
    {
        var expected = Path.Combine("tools", executable);
        var locator = new CodexProcessLocator(
            isWindows,
            "tools",
            "/Users/test",
            path => path == expected);

        Assert.Equal(expected, locator.Find());
    }

    [Fact]
    public void Find_OnMac_DoesNotOfferWindowsSandboxPath()
    {
        var locator = new CodexProcessLocator(
            isWindows: false,
            pathValue: string.Empty,
            userProfile: "/Users/test",
            exists: _ => false);

        var error = Assert.Throws<FileNotFoundException>(() => locator.Find());

        Assert.DoesNotContain("codex.exe", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(".sandbox-bin", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Find_UsesSandboxBinFallback()
    {
        var expected = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codex",
            ".sandbox-bin",
            "codex.exe");

        var actual = CodexProcessLocator.CreateDefault(
            path => Path.GetFullPath(path) == Path.GetFullPath(expected)).Find();

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Find_PrefersSandboxBinOverPackagedWindowsAppsPath()
    {
        var expected = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codex",
            ".sandbox-bin",
            "codex.exe");

        var actual = CodexProcessLocator.CreateDefault(
            path => Path.GetFullPath(path) == Path.GetFullPath(expected) ||
                    path.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase)).Find();

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Find_WhenNoCandidateExists_ThrowsActionableError()
    {
        var error = Assert.Throws<FileNotFoundException>(
            () => CodexProcessLocator.CreateDefault(_ => false).Find());

        Assert.Contains("Codex CLI", error.Message);
        Assert.Contains(".sandbox-bin", error.Message);
    }
}
