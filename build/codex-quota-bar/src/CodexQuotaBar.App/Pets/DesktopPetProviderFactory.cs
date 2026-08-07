using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.App.Pets;

public static class DesktopPetProviderFactory
{
    public static IPetProvider Create(
        string codexHome,
        Func<string?> locateAsar,
        Func<Stream> openBundledResource,
        Action<string>? diagnostic = null)
    {
        var providers = new IPetProvider[]
        {
            new CodexPetProvider(codexHome, locateAsar, diagnostic),
            new BundledPetProvider(openBundledResource, diagnostic),
        };
        return new PreferredPetProvider(providers, diagnostic);
    }
}
