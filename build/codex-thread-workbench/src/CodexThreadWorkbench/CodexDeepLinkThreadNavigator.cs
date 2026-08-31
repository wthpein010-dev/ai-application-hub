namespace CodexThreadWorkbench;

public interface ICodexThreadNavigator
{
    Task OpenAsync(
        string threadId,
        CancellationToken cancellationToken = default);
}

public sealed class CodexDeepLinkThreadNavigator(
    ICodexDeepLinkLauncher launcher) : ICodexThreadNavigator
{
    public Task OpenAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(threadId);
        return launcher.OpenAsync(
            $"codex://threads/{Uri.EscapeDataString(threadId)}",
            cancellationToken);
    }
}

public static class CodexThreadNavigatorFactory
{
    public static ICodexThreadNavigator? CreateCurrent() =>
        Create(OperatingSystem.IsWindows()
            ? CodexDesktopPlatform.Windows
            : OperatingSystem.IsMacOS()
                ? CodexDesktopPlatform.MacOS
                : CodexDesktopPlatform.Unsupported);

    public static ICodexThreadNavigator? Create(
        CodexDesktopPlatform platform,
        IPlatformProcessRunner? processRunner = null)
    {
        if (platform == CodexDesktopPlatform.Windows)
        {
            return new CodexDeepLinkThreadNavigator(
                new ShellCodexDeepLinkLauncher());
        }

        if (platform == CodexDesktopPlatform.MacOS)
        {
            processRunner ??= new PlatformProcessRunner();
            return new CodexDeepLinkThreadNavigator(
                new MacCodexDeepLinkLauncher(processRunner));
        }

        return null;
    }
}
