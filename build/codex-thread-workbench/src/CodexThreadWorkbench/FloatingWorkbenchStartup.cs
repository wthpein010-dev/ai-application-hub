namespace CodexThreadWorkbench;

public static class FloatingWorkbenchStartup
{
    public static async Task StartAsync(
        Func<Task> initializeAsync,
        Action startMonitor,
        Action positionWindows,
        Action showLauncher)
    {
        ArgumentNullException.ThrowIfNull(initializeAsync);
        ArgumentNullException.ThrowIfNull(startMonitor);
        ArgumentNullException.ThrowIfNull(positionWindows);
        ArgumentNullException.ThrowIfNull(showLauncher);

        startMonitor();
        await initializeAsync();
        positionWindows();
        showLauncher();
    }
}
