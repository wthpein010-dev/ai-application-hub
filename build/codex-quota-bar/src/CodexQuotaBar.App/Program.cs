using Avalonia;
using CodexQuotaBar.App.Pets;

namespace CodexQuotaBar.App;

internal static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Contains("--verify-bundled-pet", StringComparer.Ordinal))
        {
            return BundledPetSelfCheck.VerifyAsync().GetAwaiter().GetResult() ? 0 : 2;
        }

        return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .LogToTrace();
}
