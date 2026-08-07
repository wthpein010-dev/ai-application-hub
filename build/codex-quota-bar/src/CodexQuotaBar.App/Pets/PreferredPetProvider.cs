using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.App.Pets;

public sealed class PreferredPetProvider : IPetProvider
{
    private readonly IReadOnlyList<IPetProvider> _providers;
    private readonly Action<string>? _diagnostic;

    public PreferredPetProvider(params IPetProvider[] providers)
        : this(providers, null)
    {
    }

    public PreferredPetProvider(
        IReadOnlyList<IPetProvider> providers,
        Action<string>? diagnostic)
    {
        ArgumentNullException.ThrowIfNull(providers);
        if (providers.Any(provider => provider is null))
        {
            throw new ArgumentException("Pet providers cannot contain null.", nameof(providers));
        }

        _providers = providers;
        _diagnostic = diagnostic;
    }

    public async Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default)
    {
        foreach (var provider in _providers)
        {
            try
            {
                if (await provider.FindAsync(cancellationToken).ConfigureAwait(false) is { } pet)
                {
                    return pet;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception)
            {
                _diagnostic?.Invoke(
                    $"Pet provider {provider.GetType().Name} was unavailable.");
            }
        }

        return null;
    }
}
