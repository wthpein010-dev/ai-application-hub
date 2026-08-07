namespace CodexQuotaBar.Core.Pets;

public enum PetAssetFormat
{
    CodexWebpAtlas,
    AnimatedGif,
}

public enum PetAssetSource
{
    Codex,
    BundledFallback,
}

public sealed record PetAsset(
    string Id,
    string DisplayName,
    byte[] Payload,
    PetAssetFormat Format,
    PetAssetSource Source);
