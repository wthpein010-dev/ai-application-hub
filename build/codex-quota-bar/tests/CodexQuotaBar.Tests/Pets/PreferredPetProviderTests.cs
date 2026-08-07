using CodexQuotaBar.App.Pets;
using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.Tests.Pets;

public sealed class PreferredPetProviderTests
{
    [Fact]
    public async Task FindAsync_prefers_the_first_available_pet()
    {
        var codex = Pet("fireball", PetAssetSource.Codex);
        var bundled = Pet("bundled-suit-hamster", PetAssetSource.BundledFallback);
        var codexProvider = new StubPetProvider(codex);
        var bundledProvider = new StubPetProvider(bundled);
        var provider = new PreferredPetProvider(codexProvider, bundledProvider);

        var selected = await provider.FindAsync();

        Assert.Same(codex, selected);
        Assert.Equal(1, codexProvider.FindCount);
        Assert.Equal(0, bundledProvider.FindCount);
    }

    [Fact]
    public async Task FindAsync_uses_the_bundled_pet_when_codex_pet_is_missing()
    {
        var bundled = Pet("bundled-suit-hamster", PetAssetSource.BundledFallback);
        var provider = new PreferredPetProvider(
            new StubPetProvider(null),
            new StubPetProvider(bundled));

        var selected = await provider.FindAsync();

        Assert.Same(bundled, selected);
    }

    [Fact]
    public async Task FindAsync_continues_after_a_provider_failure()
    {
        var diagnostics = new List<string>();
        var bundled = Pet("bundled-suit-hamster", PetAssetSource.BundledFallback);
        var provider = new PreferredPetProvider(
            [new StubPetProvider(exception: new InvalidDataException("private path")),
             new StubPetProvider(bundled)],
            diagnostics.Add);

        var selected = await provider.FindAsync();

        Assert.Same(bundled, selected);
        var diagnostic = Assert.Single(diagnostics);
        Assert.DoesNotContain("private path", diagnostic, StringComparison.Ordinal);
    }

    [Fact]
    public async Task FindAsync_returns_null_when_all_providers_are_unavailable()
    {
        var provider = new PreferredPetProvider(
            new StubPetProvider(null),
            new StubPetProvider(null));

        Assert.Null(await provider.FindAsync());
    }

    [Fact]
    public async Task FindAsync_propagates_requested_cancellation()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var provider = new PreferredPetProvider(
            new StubPetProvider(exception: new OperationCanceledException(cancellation.Token)),
            new StubPetProvider(Pet("bundled-suit-hamster", PetAssetSource.BundledFallback)));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => provider.FindAsync(cancellation.Token));
    }

    private static PetAsset Pet(string id, PetAssetSource source) => new(
        id,
        id,
        [1, 2, 3],
        source == PetAssetSource.Codex
            ? PetAssetFormat.CodexWebpAtlas
            : PetAssetFormat.AnimatedGif,
        source);

    private sealed class StubPetProvider(
        PetAsset? pet = null,
        Exception? exception = null) : IPetProvider
    {
        public int FindCount { get; private set; }

        public Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default)
        {
            FindCount++;
            return exception is null
                ? Task.FromResult(pet)
                : Task.FromException<PetAsset?>(exception);
        }
    }
}
