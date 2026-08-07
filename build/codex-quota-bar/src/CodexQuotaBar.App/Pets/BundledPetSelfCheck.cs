using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.App.Pets;

public static class BundledPetSelfCheck
{
    public static async Task<bool> VerifyAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var provider = new BundledPetProvider(BundledPetResource.Open);
            var pet = await provider.FindAsync(cancellationToken).ConfigureAwait(false);
            return pet is
            {
                Id: "bundled-suit-hamster",
                Format: PetAssetFormat.AnimatedGif,
                Source: PetAssetSource.BundledFallback,
            };
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
