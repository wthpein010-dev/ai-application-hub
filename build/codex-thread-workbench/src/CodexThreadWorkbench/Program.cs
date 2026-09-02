using Avalonia;

namespace CodexThreadWorkbench;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        var launchArgs = AddPackagedLaunchProfile(args);
        var mode = DesktopLaunchOptions.FromArgs(launchArgs).Mode;
        ConfirmationOverlayDiagnostics.Write(
            $"process:start:pid={Environment.ProcessId}:mode={mode}");
        AppDomain.CurrentDomain.ProcessExit += (_, _) =>
            ConfirmationOverlayDiagnostics.Write(
                $"process:exit:pid={Environment.ProcessId}");
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
            ConfirmationOverlayDiagnostics.Write(
                $"process:unhandled:{FormatException(eventArgs.ExceptionObject)}");
        TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
            ConfirmationOverlayDiagnostics.Write(
                $"process:unobserved-task:{FormatException(eventArgs.Exception)}");

        if (launchArgs.Contains("--smoke-test", StringComparer.Ordinal))
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
                Console.Error.WriteLine(FormatSmokeTestFailure(error));
                return 1;
            }
        }

        IDisposable? instanceLock = null;
        if (OperatingSystem.IsWindows())
        {
            instanceLock = DesktopInstanceLock.TryAcquire(
                $@"Local\CodexConfirmationBar.{mode}");
            if (instanceLock is null)
            {
                ConfirmationOverlayDiagnostics.Write(
                    $"process:duplicate-exit:mode={mode}");
                return 0;
            }
        }

        using (instanceLock)
        {
            var exitCode = BuildAvaloniaApp().StartWithClassicDesktopLifetime(launchArgs);
            ConfirmationOverlayDiagnostics.Write(
                $"process:lifetime-returned:code={exitCode}");
            return exitCode;
        }
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();

    public static string FormatSmokeTestFailure(Exception error) =>
        $"Codex Confirmation Bar smoke test failed: {error.Message}";

    private static string[] AddPackagedLaunchProfile(string[] args)
    {
        if (args.Any(value => value.StartsWith(
            DesktopLaunchOptions.LaunchProfileSwitchPrefix,
            StringComparison.OrdinalIgnoreCase)))
        {
            return args;
        }

        var profilePath = Path.Combine(AppContext.BaseDirectory, "codex-launch-profile.json");
        return File.Exists(profilePath)
            ? [.. args, $"{DesktopLaunchOptions.LaunchProfileSwitchPrefix}{profilePath}"]
            : args;
    }

    private static string FormatException(object? value) => value switch
    {
        Exception error => $"{error.GetType().Name}:{error.Message}",
        null => "unknown",
        _ => value.GetType().Name
    };
}
