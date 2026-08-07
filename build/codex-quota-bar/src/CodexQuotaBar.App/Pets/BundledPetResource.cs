namespace CodexQuotaBar.App.Pets;

public static class BundledPetResource
{
    private const string ResourceName =
        "CodexQuotaBar.Assets.Pets.suit-hamster.gif";

    public static Stream Open() =>
        typeof(BundledPetResource).Assembly.GetManifestResourceStream(ResourceName)
        ?? throw new FileNotFoundException(
            "The bundled pet resource is missing.",
            ResourceName);
}
