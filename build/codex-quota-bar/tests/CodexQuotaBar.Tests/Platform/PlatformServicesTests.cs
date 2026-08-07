using CodexQuotaBar.App.Platform;
using System.Reflection;

namespace CodexQuotaBar.Tests.Platform;

public sealed class PlatformServicesTests
{
    [Fact]
    public async Task Windows_discovery_accepts_an_explicit_existing_executable()
    {
        using var directory = new TemporaryDirectory();
        var executable = directory.CreateFile("codex.exe");
        var services = new WindowsPlatformServices(appExecutablePath: executable, localAppData: directory.Path);

        var result = await services.FindCodexExecutableAsync(executable);

        Assert.Equal(executable, result);
        Assert.Equal(Path.Combine(directory.Path, "CodexQuotaBar"), services.SettingsDirectory);
    }

    [Fact]
    public void Windows_startup_command_quotes_paths_with_spaces()
    {
        Assert.Equal(
            "\"C:\\Program Files\\CodexQuotaBar\\CodexQuotaBar.exe\"",
            WindowsPlatformServices.BuildStartupCommand("C:\\Program Files\\CodexQuotaBar\\CodexQuotaBar.exe"));
    }

    [Theory]
    [InlineData(2, true)]
    [InlineData(3, false)]
    public void Windows_startup_approval_state_is_honored(int stateByte, bool expected)
    {
        var method = typeof(WindowsPlatformServices).GetMethod(
            "IsStartupApproved",
            BindingFlags.Public | BindingFlags.Static);

        Assert.NotNull(method);
        var actual = (bool)method!.Invoke(null, [new byte[] { checked((byte)stateByte) }])!;
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Mac_launch_agent_xml_escapes_the_executable_path()
    {
        var xml = MacPlatformServices.BuildLaunchAgent("/Applications/Quota & Tools/CodexQuotaBar");

        Assert.Contains("/Applications/Quota &amp; Tools/CodexQuotaBar", xml, StringComparison.Ordinal);
        Assert.Contains("<key>RunAtLoad</key>", xml, StringComparison.Ordinal);
        Assert.Contains("<key>ProgramArguments</key>", xml, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Mac_launch_at_login_writes_and_removes_a_user_launch_agent()
    {
        using var directory = new TemporaryDirectory();
        var executable = directory.CreateFile("CodexQuotaBar");
        var launchAgent = Path.Combine(directory.Path, "LaunchAgents", "com.codexquotabar.app.plist");
        var services = new MacPlatformServices(executable, directory.Path, launchAgent);

        await services.SetLaunchAtLoginAsync(true);
        Assert.True(await services.GetLaunchAtLoginAsync());
        Assert.True(File.Exists(launchAgent));

        await services.SetLaunchAtLoginAsync(false);
        Assert.False(await services.GetLaunchAtLoginAsync());
        Assert.False(File.Exists(launchAgent));
    }

    [Fact]
    public async Task Mac_launch_at_login_rejects_an_agent_that_targets_an_old_executable()
    {
        using var directory = new TemporaryDirectory();
        var currentExecutable = directory.CreateFile("current/CodexQuotaBar");
        var oldExecutable = directory.CreateFile("old/CodexQuotaBar");
        var launchAgent = Path.Combine(directory.Path, "LaunchAgents", "com.codexquotabar.app.plist");
        Directory.CreateDirectory(Path.GetDirectoryName(launchAgent)!);
        await File.WriteAllTextAsync(launchAgent, MacPlatformServices.BuildLaunchAgent(oldExecutable));
        var services = new MacPlatformServices(currentExecutable, directory.Path, launchAgent);

        Assert.False(await services.GetLaunchAtLoginAsync());
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"quota-platform-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public string CreateFile(string relativePath)
        {
            var path = System.IO.Path.Combine(Path, relativePath);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
            File.WriteAllText(path, string.Empty);
            return path;
        }

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
