using Avalonia;
using Avalonia.Headless;

[assembly: AvaloniaTestApplication(typeof(CodexQuotaBar.Tests.UI.TestAppBuilder))]

namespace CodexQuotaBar.Tests.UI;

public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<Application>()
            .UseSkia()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions
            {
                UseHeadlessDrawing = false,
            });
}
