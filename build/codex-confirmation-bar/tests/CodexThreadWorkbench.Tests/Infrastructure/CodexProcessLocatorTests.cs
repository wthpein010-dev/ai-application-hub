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
        var userProfile = Path.Combine("Users", "test");
        var expected = Path.Combine(
            userProfile,
            ".codex",
            ".sandbox-bin",
            "codex.exe");

        var locator = new CodexProcessLocator(
            isWindows: true,
            pathValue: string.Empty,
            userProfile,
            path => path == expected);

        Assert.Equal(expected, locator.Find());
    }

    [Fact]
    public void Find_OnWindows_UsesTheNativeBinaryFromAGlobalNpmInstall()
    {
        var npmPrefix = Path.Combine("Users", "runner", "npm");
        var expected = Path.Combine(
            npmPrefix,
            "node_modules",
            "@openai",
            "codex-win32-x64",
            "vendor",
            "x86_64-pc-windows-msvc",
            "bin",
            "codex.exe");
        var locator = new CodexProcessLocator(
            isWindows: true,
            pathValue: npmPrefix,
            userProfile: Path.Combine("Users", "runner"),
            path => path == expected);

        Assert.Equal(expected, locator.Find());
    }

    [Fact]
    public void Find_PrefersSandboxBinOverPackagedWindowsAppsPath()
    {
        var userProfile = Path.Combine("Users", "test");
        var expected = Path.Combine(
            userProfile,
            ".codex",
            ".sandbox-bin",
            "codex.exe");
        var packagedPath = Path.Combine(userProfile, "WindowsApps");

        var locator = new CodexProcessLocator(
            isWindows: true,
            pathValue: packagedPath,
            userProfile,
            path => path == expected ||
                    path.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(expected, locator.Find());
    }

    [Fact]
    public void Find_WhenNoCandidateExists_ThrowsActionableError()
    {
        var locator = new CodexProcessLocator(
            isWindows: true,
            pathValue: string.Empty,
            userProfile: Path.Combine("Users", "test"),
            exists: _ => false);

        var error = Assert.Throws<FileNotFoundException>(
            () => locator.Find());

        Assert.Contains("Codex CLI", error.Message);
        Assert.Contains(".sandbox-bin", error.Message);
    }
}
