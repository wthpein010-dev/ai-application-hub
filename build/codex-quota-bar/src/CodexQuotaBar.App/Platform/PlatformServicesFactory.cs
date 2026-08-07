using CodexQuotaBar.Core.Platform;

namespace CodexQuotaBar.App.Platform;

public static class PlatformServicesFactory
{
    public static IPlatformServices Create() => OperatingSystem.IsMacOS()
        ? new MacPlatformServices()
        : new WindowsPlatformServices();
}
