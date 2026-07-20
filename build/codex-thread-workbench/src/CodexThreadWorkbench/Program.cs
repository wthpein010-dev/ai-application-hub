using Avalonia;

namespace CodexThreadWorkbench;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Contains("--smoke-test", StringComparer.Ordinal))
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                return SmokeTestRunner.RunAsync(timeout.Token)
                    .GetAwaiter()
                    .GetResult();
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"CodexThreadWorkbench smoke test failed: {error.Message}");
                return 1;
            }
        }

        return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
