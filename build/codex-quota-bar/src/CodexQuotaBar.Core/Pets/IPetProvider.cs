namespace CodexQuotaBar.Core.Pets;

public interface IPetProvider
{
    Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default);
}
